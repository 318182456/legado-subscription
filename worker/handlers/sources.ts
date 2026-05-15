import { Env } from "../types";
import {
  ok,
  err,
  parseBody,
  rebuildCache,
} from "../utils";

export async function handleListSources(env: Env, url: URL): Promise<Response> {
  const q = url.searchParams.get("q") || "";
  const filter = url.searchParams.get("filter") || "all";
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const limit = Math.max(5, Number(url.searchParams.get("limit") || "10"));
  const offset = (page - 1) * limit;

  let where = "name LIKE ?";
  const params: any[] = [`%${q}%`];

  if (filter === "available") {
    where += " AND is_available = 1";
  } else if (filter === "unavailable") {
    where += " AND is_available = 0";
  }

  const { results: sources } = await env.DB.prepare(
    `SELECT * FROM sources WHERE ${where} LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all();

  const totalRow = (await env.DB.prepare(`SELECT COUNT(*) as count FROM sources WHERE ${where}`).bind(...params).first()) as any;
  const statsRow = (await env.DB.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN is_available=1 THEN 1 ELSE 0 END) as available FROM sources").first()) as any;

  return ok({
    sources,
    total: totalRow.count,
    totalPages: Math.ceil(totalRow.count / limit),
    stats: {
      total: statsRow.total || 0,
      available: statsRow.available || 0,
      unavailable: (statsRow.total || 0) - (statsRow.available || 0)
    },
    page,
    limit,
    hasMore: offset + sources.length < totalRow.count
  });
}

export async function handleAllSourceIds(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare("SELECT id FROM sources").all();
  return ok(results.map((r: any) => r.id));
}

export async function handleTestSources(env: Env, request: Request, ctx: any): Promise<Response> {
  const body = await parseBody<{ ids: number[] }>(request);
  const ids = body?.ids || [];
  if (!ids.length) return ok({});

  const { results: rawSources } = await env.DB.prepare(
    `SELECT id, COALESCE(test_url, book_source_url) as test_url FROM sources WHERE id IN (${ids.map(() => '?').join(',')})`
  ).bind(...ids).all();

  const sourcesMap = new Map(rawSources.map((s: any) => [s.id, s]));
  const testResults: Record<number, boolean> = {};

  // 极限并发：推至 Cloudflare 子请求上限 50，因为我们现在逻辑极轻（无正则、无重构）
  const CONCURRENCY = 50;
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    chunks.push(ids.slice(i, i + CONCURRENCY));
  }

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (id) => {
      const sourceData = sourcesMap.get(id);
      if (!sourceData || !sourceData.test_url) { testResults[id] = false; return; }

      const urlToTest = sourceData.test_url;
      const fetchOptions: RequestInit = {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(5000) 
      };

      try {
        const res = await fetch(urlToTest, fetchOptions);
        // 关键：必须显式取消/关闭响应流，否则会占据连接池导致死锁或 503
        await res.body?.cancel();
        
        if (res.status >= 200 && res.status < 400) {
          testResults[id] = true;
        } else {
          testResults[id] = false;
        }
      } catch (_) {
        testResults[id] = false;
      }
    }));
  }

  // 批量更新数据库：将 50 个更新简化为 2 个 SQL 语句，大幅节省 CPU
  const availIds = ids.filter(id => testResults[id]);
  const unavailIds = ids.filter(id => !testResults[id]);

  const updateBatch = [];
  if (availIds.length > 0) {
    updateBatch.push(
      env.DB.prepare(
        `UPDATE sources SET is_available = 1, enabled = 1, last_checked = datetime('now') WHERE id IN (${availIds.map(() => "?").join(",")})`
      ).bind(...availIds)
    );
  }
  if (unavailIds.length > 0) {
    updateBatch.push(
      env.DB.prepare(
        `UPDATE sources SET is_available = 0, enabled = 0, last_checked = datetime('now') WHERE id IN (${unavailIds.map(() => "?").join(",")})`
      ).bind(...unavailIds)
    );
  }

  if (updateBatch.length > 0) {
    await env.DB.batch(updateBatch);
  }

  // 测试不修改书源定义 (raw_json)，因此不需要重建 KV 缓存，大幅节省内存和 CPU
  return ok(testResults);
}

export async function handleSourceAction(env: Env, id: number, action: string, request?: Request): Promise<Response> {
  if (action === "delete") {
    await env.DB.prepare("DELETE FROM sources WHERE id = ?").bind(id).run();
  } else if (action === "delete-all") {
    await env.DB.prepare("DELETE FROM sources").run();
  } else if (action === "toggle" && request) {
    const { enabled } = await request.json() as { enabled: number };
    await env.DB.prepare("UPDATE sources SET enabled = ? WHERE id = ?").bind(enabled, id).run();
  }
  return ok();
}

export async function handleParseLinks(url: URL): Promise<Response> {
  const targetUrl = url.searchParams.get("url");
  if (!targetUrl) return err("url 不能为空");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(targetUrl, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!res.ok) return err(`目标网页返回错误: ${res.status}`);
    const html = await res.text();
    
    const results: { name: string; url: string }[] = [];
    const linkRegex = /src=([^"& ]+)/g;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const subUrl = decodeURIComponent(match[1]).replace(/['"]$/, '');
      if (!subUrl.startsWith('http')) continue;

      const matchIndex = match.index;
      const searchRange = html.substring(Math.max(0, matchIndex - 1000), matchIndex);
      
      const titlePatterns = [
        /<(h[1-6]|div)[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi,
        /<(h[1-6])>([\s\S]*?)<\/\1>/gi,
        /<div[^>]*class="aui-flex-box"[^>]*>([\s\S]*?)<\/div>/gi
      ];

      let bestName = "";
      for (const pattern of titlePatterns) {
        let tMatch;
        let lastMatchText = "";
        while ((tMatch = pattern.exec(searchRange)) !== null) {
          lastMatchText = tMatch[tMatch.length - 1].replace(/<[^>]+>/g, '').trim();
        }
        if (lastMatchText) {
          bestName = lastMatchText;
        }
      }

      if (!bestName) {
        const linkTag = html.substring(matchIndex - 50, matchIndex + 200);
        const titleAttr = /title="([^"]+)"/.exec(linkTag);
        if (titleAttr) bestName = titleAttr[1];
      }

      let name = (bestName && bestName !== "一键导入") ? bestName : "未知来源";
      
      name = name
        .replace(/\d{4}年\d{1,2}月\d{1,2}日更新/g, '')
        .replace(/\d{4}年\d{1,2}月\d{1,2}日/g, '')
        .replace(/\d+个/g, '')
        .replace(/更新/g, '')
        .replace(/合集/g, '')
        .replace(/【[^\]]+】/g, '')
        .replace(/\[[^\]]+\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!name) name = "未知来源";
      
      if (!results.find(r => r.url === subUrl)) {
        results.push({ name, url: subUrl });
      }
    }

    return ok(results);
  } catch (e) {
    const isTimeout = (e as Error).name === 'AbortError';
    return err(isTimeout ? "请求超时，目标网站响应过慢" : `解析失败: ${(e as Error).message}`, 500);
  }
}

export async function handleStats(env: Env): Promise<Response> {
  const subRow = (await env.DB.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN type='source' THEN 1 ELSE 0 END) as sources, SUM(CASE WHEN type='rule' THEN 1 ELSE 0 END) as rules FROM subscriptions WHERE enabled=1").first()) as any;
  const srcRow = (await env.DB.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN is_available=1 THEN 1 ELSE 0 END) as available FROM sources WHERE enabled=1").first()) as any;
  const ruleRow = (await env.DB.prepare("SELECT COUNT(*) as total FROM rules WHERE enabled=1").first()) as any;
  return ok({ subscriptions: subRow, sources: srcRow, rules: ruleRow });
}

