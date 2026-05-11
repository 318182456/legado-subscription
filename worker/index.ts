/**
 * Legado Subscription — Cloudflare Worker 入口
 *
 * API 路由：
 *   POST   /api/auth/login             密码登录
 *   GET    /api/auth/passkey/status    Passkey 注册状态
 *   POST   /api/auth/passkey/login/begin
 *   POST   /api/auth/passkey/login/finish
 *   ... 鉴权路由 ...
 *   GET    /api/subscriptions          列出所有订阅
 *   POST   /api/subscriptions          添加订阅
 *   ...
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/types";

import { Env, StoredPasskey } from "./types";
import {
  json,
  ok,
  err,
  checkAuth,
  parseBody,
  syncSourceSubscription,
  syncRuleSubscription,
  rebuildCache,
  u8ToB64url,
  b64urlToU8,
  ensureDatabase,
} from "./utils";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // ─── 数据库运行时初始化 (参照 NodeWarden 模式) ───────────────
    // 只有非静态资源/订阅输出请求才需要检查 DB（优化性能）
    if (path.startsWith("/api/")) {
      try {
        await ensureDatabase(env);
      } catch (e) {
        return err(`Database Init Failed: ${(e as Error).message}`, 500);
      }
    }

    // OPTIONS 预检
    if (method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    try {
      // ── /subscribe/* (公开) ───────────────────────────────────────
      if (path === "/subscribe/sources" && method === "GET") return handleSubscribeOutput(env, "sources");
      if (path === "/subscribe/rules" && method === "GET") return handleSubscribeOutput(env, "rules");
      if (path === "/subscribe/index" && method === "GET") return handleSubscribeIndex(request, env);

      // ── /api/auth (公开) ──────────────────────────────────────────
      if (path === "/api/auth/login" && method === "POST") return handleLogin(request, env);
      if (path === "/api/auth/passkey/status" && method === "GET") return handlePasskeyStatus(env);
      if (path === "/api/auth/passkey/login/begin" && method === "POST") return handlePasskeyLoginBegin(request, env);
      if (path === "/api/auth/passkey/login/finish" && method === "POST") return handlePasskeyLoginFinish(request, env);

      // ── 鉴权检查 ──────────────────────────────────────────────────
      if (path.startsWith("/api/")) {
        if (!isAuthed(request, env)) return err("Unauthorized", 401);
      }

      // ── /api/auth (鉴权) ──────────────────────────────────────────
      if (path === "/api/auth/passkey/register/begin" && method === "POST") return handlePasskeyRegisterBegin(request, env);
      if (path === "/api/auth/passkey/register/finish" && method === "POST") return handlePasskeyRegisterFinish(request, env);
      if (path === "/api/auth/passkey/list" && method === "GET") return handlePasskeyList(env);
      if (path.startsWith("/api/auth/passkey/delete/") && method === "DELETE") {
        return handlePasskeyDelete(path.split("/").pop()!, env);
      }

      // ── /api/stats ────────────────────────────────────────────────
      if (path === "/api/stats" && method === "GET") return handleStats(env);

      // ── /api/sync ─────────────────────────────────────────────────
      if (path.startsWith("/api/sync") && method === "POST") {
        const idStr = path.replace("/api/sync", "").replace("/", "");
        return handleSync(env, idStr ? Number(idStr) : null);
      }

      // ── /api/subscriptions ────────────────────────────────────────
      if (path === "/api/subscriptions") {
        if (method === "GET") return handleListSubscriptions(env);
        if (method === "POST") return handleAddSubscription(request, env);
      }

      const subMatch = path.match(/^\/api\/subscriptions\/(\d+)$/);
      if (subMatch) {
        const id = Number(subMatch[1]);
        if (method === "DELETE") return handleDeleteSubscription(env, id);
        if (method === "PATCH") return handleToggleSubscription(request, env, id);
      }

      // ── /api/sources / rules ──────────────────────────────────────
      if (path === "/api/sources" && method === "GET") return handleListSources(env, url);
      if (path === "/api/rules" && method === "GET") return handleListRules(env, url);

      // ── /api/parse-links ──────────────────────────────────────────
      if (path === "/api/parse-links" && method === "GET") return handleParseLinks(url);

      return err("Not Found", 404);
    } catch (e) {
      console.error(e);
      return err(`Internal Error: ${(e as Error).message}`, 500);
    }
  },
};

// ─── 鉴权逻辑 ────────────────────────────────────────────────────

function isAuthed(request: Request, env: Env): boolean {
  const pwd = env.ADMIN_PASSWORD || env.API_SECRET || "admin888";
  const auth = request.headers.get("Authorization") || "";
  return auth === `Bearer ${pwd}`;
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await parseBody<{ password?: string }>(request);
  const pwd = env.ADMIN_PASSWORD || env.API_SECRET || "admin888";
  if (body?.password === pwd) return ok({ token: pwd });
  return err("密码错误", 401);
}

// ─── Passkey 处理器 ────────────────────────────────────────────────

async function handlePasskeyStatus(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare("SELECT COUNT(*) as count FROM passkeys").all();
  return ok({ count: results[0]?.count ?? 0 });
}

async function handlePasskeyList(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare("SELECT id, name, created_at FROM passkeys").all();
  return ok(results);
}

async function handlePasskeyDelete(id: string, env: Env): Promise<Response> {
  await env.DB.prepare("DELETE FROM passkeys WHERE id = ?").bind(id).run();
  return ok();
}

async function handlePasskeyRegisterBegin(request: Request, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare("SELECT id, transports FROM passkeys").all();
  const rpID = new URL(request.url).hostname;

  const options = await generateRegistrationOptions({
    rpName: "Legado Subscription",
    rpID,
    userID: new TextEncoder().encode("admin"),
    userName: "admin",
    userDisplayName: "Administrator",
    excludeCredentials: results.map((p) => ({
      id: p.id as string,
      transports: JSON.parse((p.transports as string) || "[]") as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });

  await env.KV.put("passkey:reg_challenge", options.challenge, { expirationTtl: 300 });
  return ok(options);
}

async function handlePasskeyRegisterFinish(request: Request, env: Env): Promise<Response> {
  const expectedChallenge = await env.KV.get("passkey:reg_challenge");
  if (!expectedChallenge) return err("Challenge 已过期", 400);

  const body = await request.json<RegistrationResponseJSON>();
  const rpID = new URL(request.url).hostname;
  const origin = new URL(request.url).origin;

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });

  if (verification.verified && verification.registrationInfo) {
    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
    const stored: StoredPasskey = {
      id: u8ToB64url(credentialID),
      public_key: u8ToB64url(credentialPublicKey),
      counter,
      transports: body.response.transports || [],
      name: `Passkey ${new Date().toLocaleDateString()}`,
      created_at: new Date().toISOString(),
    };

    await env.DB.prepare(
      "INSERT INTO passkeys (id, public_key, counter, transports, name, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(stored.id, stored.public_key, stored.counter, JSON.stringify(stored.transports), stored.name, stored.created_at)
      .run();

    await env.KV.delete("passkey:reg_challenge");
    return ok({ name: stored.name });
  }

  return err("验证失败", 400);
}

async function handlePasskeyLoginBegin(request: Request, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare("SELECT id, transports FROM passkeys").all();
  const rpID = new URL(request.url).hostname;

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: results.map((p) => ({
      id: p.id as string,
      transports: JSON.parse((p.transports as string) || "[]") as AuthenticatorTransportFuture[],
    })),
    userVerification: "required",
  });

  await env.KV.put("passkey:auth_challenge", options.challenge, { expirationTtl: 300 });
  return ok(options);
}

async function handlePasskeyLoginFinish(request: Request, env: Env): Promise<Response> {
  const expectedChallenge = await env.KV.get("passkey:auth_challenge");
  if (!expectedChallenge) return err("Challenge 已过期", 400);

  const body = await request.json<AuthenticationResponseJSON>();
  const passkey = (await env.DB.prepare("SELECT * FROM passkeys WHERE id = ?").bind(body.id).first()) as any;

  if (!passkey) return err("找不到凭证", 404);

  const rpID = new URL(request.url).hostname;
  const origin = new URL(request.url).origin;

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    authenticator: {
      credentialID: b64urlToU8(passkey.id),
      credentialPublicKey: b64urlToU8(passkey.public_key),
      counter: passkey.counter,
      transports: JSON.parse(passkey.transports || "[]"),
    },
  });

  if (verification.verified) {
    await env.DB.prepare("UPDATE passkeys SET counter = ? WHERE id = ?")
      .bind(verification.authenticationInfo.newCounter, passkey.id)
      .run();

    await env.KV.delete("passkey:auth_challenge");
    const pwd = env.ADMIN_PASSWORD || env.API_SECRET || "admin888";
    return ok({ token: pwd });
  }

  return err("验证失败", 401);
}

// ─── 其他处理器 (与之前相同) ────────────────────────────────────────

/** 输出订阅内容 (直接从 D1 读取，不使用 KV 缓存) */
async function handleSubscribeOutput(env: Env, type: "sources" | "rules"): Promise<Response> {
  const dbType = type === "sources" ? "source" : "rule";
  const table = type === "sources" ? "sources" : "rules";
  const rows = await env.DB.prepare(
    `SELECT raw_json FROM ${table} WHERE enabled=1 ORDER BY id`
  ).all();
  const merged = rows.results.map((r) => JSON.parse(r.raw_json as string));
  return new Response(JSON.stringify(merged), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/** 输出整合订阅索引 JSON */
async function handleSubscribeIndex(request: Request, env: Env): Promise<Response> {
  const origin = new URL(request.url).origin;
  const index = [
    { name: "📚 整合书源订阅", url: `${origin}/subscribe/sources` },
    { name: "✨ 整合净化规则订阅", url: `${origin}/subscribe/rules` },
  ];
  return new Response(JSON.stringify(index), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function handleListSubscriptions(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare("SELECT * FROM subscriptions ORDER BY created_at DESC").all();
  return ok(results);
}

async function handleAddSubscription(request: Request, env: Env): Promise<Response> {
  const body = await parseBody<{ name?: string; url: string; type: "source" | "rule" }>(request);
  if (!body?.url) return err("url 不能为空");
  const { meta } = await env.DB.prepare("INSERT INTO subscriptions (name, url, type) VALUES (?, ?, ?)").bind(body.name ?? "", body.url, body.type).run();
  const newId = Number(meta.last_row_id);
  try {
    if (body.type === "source") await syncSourceSubscription(env, newId, body.url);
    else await syncRuleSubscription(env, newId, body.url);
    await rebuildCache(env, body.type);
  } catch (e) { console.warn("首次同步失败:", e); }
  const sub = await env.DB.prepare("SELECT * FROM subscriptions WHERE id=?").bind(newId).first();
  return ok(sub);
}

async function handleDeleteSubscription(env: Env, id: number): Promise<Response> {
  const sub = (await env.DB.prepare("SELECT type FROM subscriptions WHERE id=?").bind(id).first()) as any;
  if (!sub) return err("不存在", 404);
  await env.DB.prepare("DELETE FROM subscriptions WHERE id=?").bind(id).run();
  await rebuildCache(env, sub.type);
  return ok();
}

async function handleToggleSubscription(request: Request, env: Env, id: number): Promise<Response> {
  const body = await parseBody<{ enabled: boolean }>(request);
  const enabled = body?.enabled ? 1 : 0;
  await env.DB.prepare("UPDATE subscriptions SET enabled=? WHERE id=?").bind(enabled, id).run();
  const sub = (await env.DB.prepare("SELECT type FROM subscriptions WHERE id=?").bind(id).first()) as any;
  if (sub) {
    const table = sub.type === "source" ? "sources" : "rules";
    await env.DB.prepare(`UPDATE ${table} SET enabled=? WHERE subscription_id=?`).bind(enabled, id).run();
    await rebuildCache(env, sub.type);
  }
  return ok();
}

async function handleSync(env: Env, id: number | null): Promise<Response> {
  const subs = id ? [await env.DB.prepare("SELECT * FROM subscriptions WHERE id=?").bind(id).first()] : (await env.DB.prepare("SELECT * FROM subscriptions WHERE enabled=1").all()).results;
  for (const sub of subs as any[]) {
    try {
      if (sub.type === "source") await syncSourceSubscription(env, sub.id, sub.url);
      else await syncRuleSubscription(env, sub.id, sub.url);
    } catch (e) { console.error(e); }
  }
  await Promise.all([rebuildCache(env, "source"), rebuildCache(env, "rule")]);
  return ok();
}

async function handleStats(env: Env): Promise<Response> {
  const subRow = (await env.DB.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN type='source' THEN 1 ELSE 0 END) as sources, SUM(CASE WHEN type='rule' THEN 1 ELSE 0 END) as rules FROM subscriptions WHERE enabled=1").first()) as any;
  const srcRow = (await env.DB.prepare("SELECT COUNT(*) as total FROM sources WHERE enabled=1").first()) as any;
  const ruleRow = (await env.DB.prepare("SELECT COUNT(*) as total FROM rules WHERE enabled=1").first()) as any;
  return ok({ subscriptions: subRow, sources: srcRow, rules: ruleRow });
}

async function handleListSources(env: Env, url: URL): Promise<Response> {
  const q = url.searchParams.get("q") || "";
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const limit = 50;
  const offset = (page - 1) * limit;
  const { results } = await env.DB.prepare(
    `SELECT * FROM sources WHERE name LIKE ? AND enabled=1 LIMIT ? OFFSET ?`
  ).bind(`%${q}%`, limit, offset).all();
  return ok(results);
}

async function handleListRules(env: Env, url: URL): Promise<Response> {
  const q = url.searchParams.get("q") || "";
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const limit = 50;
  const offset = (page - 1) * limit;
  const { results } = await env.DB.prepare(
    `SELECT * FROM rules WHERE name LIKE ? AND enabled=1 LIMIT ? OFFSET ?`
  ).bind(`%${q}%`, limit, offset).all();
  return ok(results);
}

async function handleParseLinks(url: URL): Promise<Response> {
  const targetUrl = url.searchParams.get("url");
  if (!targetUrl) return err("url 不能为空");

  try {
    // 设置 15 秒超时，避免 Worker 挂起
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
    
    // 增强的正则：兼容多种 HTML 属性顺序，提取 src= 后面的内容
    // 匹配 yuedu:// 或 legado:// 链接中的 src 参数
    const regex = /<a[^>]+href="[^"]*src=([^"& ]+)[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      let url = decodeURIComponent(match[1]);
      let name = match[2].replace(/<[^>]+>/g, '').trim(); // 移除内部 HTML 标签
      if (url && name) {
        results.push({ name, url });
      }
    }

    return ok(results);
  } catch (e) {
    const isTimeout = (e as Error).name === 'AbortError';
    return err(isTimeout ? "请求超时，目标网站响应过慢" : `解析失败: ${(e as Error).message}`, 500);
  }
}
