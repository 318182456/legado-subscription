import { Env, CACHE_TTL } from "./types";
import { SCHEMA_STATEMENTS } from "./schema-statements";

// ─── 工具函数 ─────────────────────────────────────────────────────

/** 标准 JSON 响应 */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/** 错误响应 */
export function err(message: string, status = 400): Response {
  return json({ ok: false, error: message }, status);
}

/** 成功响应 */
export function ok(data?: unknown): Response {
  return json({ ok: true, ...(data !== undefined ? { data } : {}) });
}

/** 鉴权检查（写操作用） */
export function checkAuth(request: Request, env: Env): boolean {
  if (!env.API_SECRET) return true; // 未配置则跳过鉴权（开发模式）
  const auth = request.headers.get("Authorization") ?? "";
  return auth === `Bearer ${env.API_SECRET}`;
}

/** 解析请求体 JSON */
export async function parseBody<T = Record<string, unknown>>(
  request: Request
): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/**
 * 从上游 URL 抓取书源 JSON 数组
 * 兼容 Legado 常见书源格式：JSON 数组 或 单个对象
 */
export async function fetchSources(url: string): Promise<unknown[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "LegadoSubscription/1.0" },
    cf: { cacheTtl: 300 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const text = await res.text();
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "object" && parsed !== null) return [parsed];
  throw new Error("不支持的书源格式");
}

/**
 * 从上游 URL 抓取净化规则 JSON 数组
 * 兼容 Legado 净化规则格式：JSON 数组
 */
export async function fetchRules(url: string): Promise<unknown[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "LegadoSubscription/1.0" },
    cf: { cacheTtl: 300 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const text = await res.text();
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  throw new Error("净化规则须为 JSON 数组");
}

/**
 * 使书源订阅与 D1 同步，返回入库数量
 */
export async function syncSourceSubscription(
  env: Env,
  subId: number,
  url: string
): Promise<number> {
  const rawItems = await fetchSources(url);
  
  // 1. 过滤无效书源并按 URL 去重 (模拟阅读 App 底层机制)
  const itemsMap = new Map<string, Record<string, unknown>>();
  for (const s of rawItems) {
    if (typeof s !== "object" || s === null) continue;
    const src = s as Record<string, unknown>;
    const bsUrl = String(src["bookSourceUrl"] ?? src["sourceUrl"] ?? "").trim();
    const name = String(src["bookSourceName"] ?? src["name"] ?? "").trim();
    
    // 剔除空壳书源
    if (!bsUrl || !name) continue;
    
    // Map 自动以后来者覆盖同 URL 的旧书源
    itemsMap.set(bsUrl, src);
  }
  
  const items = Array.from(itemsMap.values());
  let count = 0;

  // 批量 upsert（D1 每批最多 ~100 条以避免超时）
  const BATCH = 50;
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    const stmts = chunk
      .map((src) => {
        const bsUrl = String(src["bookSourceUrl"] ?? src["sourceUrl"] ?? "").trim();
        const name = String(src["bookSourceName"] ?? src["name"] ?? "未知书源").trim();
        const group = String(src["bookSourceGroup"] ?? src["group"] ?? "");
        const rawJson = JSON.stringify(src);
        
        // 预解析测试链接：在同步阶段完成正则扫描，避免测试阶段 CPU 超时
        let testUrl = bsUrl;
        try {
          const searchUrl = src["searchUrl"];
          if (typeof searchUrl === 'string' && searchUrl) {
            let urlPart = searchUrl.split(',{')[0];
            urlPart = urlPart.replace(/\{\{key\}\}/g, encodeURIComponent('我的'));
            if (urlPart.startsWith('http')) {
              testUrl = urlPart;
            } else {
              try {
                testUrl = new URL(urlPart, bsUrl).toString();
              } catch (_) {
                testUrl = bsUrl.replace(/\/$/, '') + '/' + urlPart.replace(/^\//, '');
              }
            }
          }
        } catch (_) {}
        return env.DB.prepare(
          `INSERT INTO sources (subscription_id, book_source_url, name, group_name, raw_json, test_url, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(subscription_id, book_source_url)
           DO UPDATE SET name=excluded.name, group_name=excluded.group_name,
                         raw_json=excluded.raw_json, test_url=excluded.test_url, updated_at=excluded.updated_at
           WHERE sources.raw_json != excluded.raw_json`
        ).bind(subId, bsUrl, name, group, rawJson, testUrl);
      });
    if (stmts.length > 0) {
      await env.DB.batch(stmts);
      count += stmts.length;
    }
  }

  // 更新订阅状态
  await env.DB.prepare(
    `UPDATE subscriptions SET last_synced=datetime('now'), item_count=? WHERE id=?`
  )
    .bind(count, subId)
    .run();

  return count;
}

/**
 * 使净化规则订阅与 D1 同步，返回入库数量
 */
export async function syncRuleSubscription(
  env: Env,
  subId: number,
  url: string
): Promise<number> {
  const rawItems = await fetchRules(url);
  
  const itemsMap = new Map<string, Record<string, unknown>>();
  for (const r of rawItems) {
    if (typeof r !== "object" || r === null) continue;
    const rule = r as Record<string, unknown>;
    const name = String(rule["name"] ?? rule["ruleName"] ?? "").trim();
    const pattern = String(rule["regex"] ?? rule["pattern"] ?? "").trim();
    
    if (!name || !pattern) continue;
    itemsMap.set(name + "::" + pattern, rule);
  }
  
  const items = Array.from(itemsMap.values());
  let count = 0;

  const BATCH = 50;
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    const stmts = chunk
      .map((rule) => {
        const name = String(rule["name"] ?? rule["ruleName"] ?? "").trim();
        const pattern = String(rule["regex"] ?? rule["pattern"] ?? "").trim();
        const replacement = String(rule["replacement"] ?? rule["replace"] ?? "");
        const rawJson = JSON.stringify(rule);
        return env.DB.prepare(
          `INSERT INTO rules (subscription_id, name, pattern, replacement, raw_json, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(subscription_id, name, pattern)
           DO UPDATE SET replacement=excluded.replacement,
                         raw_json=excluded.raw_json, updated_at=excluded.updated_at
           WHERE rules.raw_json != excluded.raw_json`
        ).bind(subId, name, pattern, replacement, rawJson);
      });
    if (stmts.length > 0) {
      await env.DB.batch(stmts);
      count += stmts.length;
    }
  }

  await env.DB.prepare(
    `UPDATE subscriptions SET last_synced=datetime('now'), item_count=? WHERE id=?`
  )
    .bind(count, subId)
    .run();

  return count;
}

/**
 * 重建 KV 缓存（sources / rules）
 */
export async function rebuildCache(env: Env, type: "source" | "rule") {
  if (type === "source") {
    // 跨订阅全局去重：直接使用 SQL GROUP BY book_source_url 避免在 JS 层消耗 CPU 解析庞大的 JSON
    const rows = await env.DB.prepare(
      `SELECT raw_json FROM sources WHERE enabled=1 GROUP BY book_source_url ORDER BY id`
    ).all();
    
    // 直接拼接 raw_json 字符串，完全省去 JSON.parse 和 JSON.stringify 的 CPU 开销（约省下 8-10ms CPU 时间）
    const mergedStr = "[" + rows.results.map((r) => r.raw_json as string).join(",") + "]";
    
    await env.KV.put("sources", mergedStr, {
      expirationTtl: CACHE_TTL,
    });
  } else {
    // 净化规则去重：按 name 和 pattern 去重
    const rows = await env.DB.prepare(
      `SELECT raw_json FROM rules WHERE enabled=1 GROUP BY name, pattern ORDER BY id`
    ).all();
    
    const mergedStr = "[" + rows.results.map((r) => r.raw_json as string).join(",") + "]";

    await env.KV.put("rules", mergedStr, {
      expirationTtl: CACHE_TTL,
    });
  }
}

// ─── Passkey 工具 ────────────────────────────────────────────────

/** Uint8Array -> base64url */
export function u8ToB64url(u: Uint8Array): string {
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** base64url -> Uint8Array */
export function b64urlToU8(s: string): Uint8Array {
  const b = s
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  return new Uint8Array(
    atob(b)
      .split("")
      .map((c) => c.charCodeAt(0))
  );
}

// ─── 数据库初始化 (参照 NodeWarden) ───────────────────────────────

let schemaVerified = false;

/**
 * 确保数据库表结构已初始化
 * 采用 NodeWarden 的运行时校验模式，每个 Isolate 仅运行一次
 */
export async function ensureDatabase(env: Env): Promise<void> {
  if (schemaVerified) return;

  try {
    // 开启外键支持
    await env.DB.prepare("PRAGMA foreign_keys = ON").run();

    // 批量执行初始化语句 (IF NOT EXISTS)
    // 分离建表和改表语句，改表语句单独执行并容错
    for (const sql of SCHEMA_STATEMENTS) {
      try {
        await env.DB.prepare(sql).run();
      } catch (e: any) {
        // 忽略 "duplicate column" 错误
        if (e.message?.includes("duplicate column") || e.message?.includes("already exists")) {
          continue;
        }
        console.error(`SQL Execution Error: ${sql}`, e);
      }
    }

    schemaVerified = true;
  } catch (e) {
    console.error("数据库初始化失败:", e);
    throw e;
  }
}
