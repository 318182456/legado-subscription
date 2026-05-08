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
  const items = await fetchSources(url);
  let count = 0;

  // 批量 upsert（D1 每批最多 ~100 条以避免超时）
  const BATCH = 50;
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    const stmts = chunk
      .filter((s) => typeof s === "object" && s !== null)
      .map((s) => {
        const src = s as Record<string, unknown>;
        const bsUrl = String(src["bookSourceUrl"] ?? src["sourceUrl"] ?? "");
        const name = String(src["bookSourceName"] ?? src["name"] ?? "未知书源");
        const group = String(src["bookSourceGroup"] ?? src["group"] ?? "");
        const rawJson = JSON.stringify(src);
        return env.DB.prepare(
          `INSERT INTO sources (subscription_id, book_source_url, name, group_name, raw_json, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(subscription_id, book_source_url)
           DO UPDATE SET name=excluded.name, group_name=excluded.group_name,
                         raw_json=excluded.raw_json, updated_at=excluded.updated_at`
        ).bind(subId, bsUrl, name, group, rawJson);
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
  const items = await fetchRules(url);
  let count = 0;

  const BATCH = 50;
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    const stmts = chunk
      .filter((r) => typeof r === "object" && r !== null)
      .map((r) => {
        const rule = r as Record<string, unknown>;
        const name = String(rule["name"] ?? rule["ruleName"] ?? "");
        const pattern = String(rule["regex"] ?? rule["pattern"] ?? "");
        const replacement = String(rule["replacement"] ?? rule["replace"] ?? "");
        const rawJson = JSON.stringify(rule);
        return env.DB.prepare(
          `INSERT INTO rules (subscription_id, name, pattern, replacement, raw_json, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(subscription_id, name, pattern)
           DO UPDATE SET replacement=excluded.replacement,
                         raw_json=excluded.raw_json, updated_at=excluded.updated_at`
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
    const rows = await env.DB.prepare(
      `SELECT raw_json FROM sources WHERE enabled=1 ORDER BY id`
    ).all();
    const merged = rows.results.map((r) => JSON.parse(r.raw_json as string));
    await env.KV.put("sources", JSON.stringify(merged), {
      expirationTtl: CACHE_TTL,
    });
  } else {
    const rows = await env.DB.prepare(
      `SELECT raw_json FROM rules WHERE enabled=1 ORDER BY id`
    ).all();
    const merged = rows.results.map((r) => JSON.parse(r.raw_json as string));
    await env.KV.put("rules", JSON.stringify(merged), {
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
    // 注意：D1 的 batch 限制 100 条，这里一共不到 10 条，安全
    const stmts = SCHEMA_STATEMENTS.map((sql) => env.DB.prepare(sql));
    await env.DB.batch(stmts);

    schemaVerified = true;
  } catch (e) {
    console.error("数据库初始化失败:", e);
    throw e;
  }
}
