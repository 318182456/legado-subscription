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
      if (path === "/subscribe/info.json" && method === "GET") return handleSubscribeInfo(request);

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
      if (path === "/api/sources/ids" && method === "GET") return handleAllSourceIds(env);
      if (path === "/api/rules") {
        if (method === "GET") return handleListRules(env, url);
        if (method === "POST") return handleAddRule(request, env);
      }
      if (path === "/api/sources/test" && method === "POST") return handleTestSources(env, request);

      const srcMatch = path.match(/^\/api\/sources\/(\d+)$/);
      if (srcMatch) {
        const id = Number(srcMatch[1]);
        if (method === "DELETE") return handleSourceAction(env, id, "delete");
        if (method === "PATCH") return handleSourceAction(env, id, "toggle", request);
      }

      const ruleMatch = path.match(/^\/api\/rules\/(\d+)$/);
      if (ruleMatch) {
        const id = Number(ruleMatch[1]);
        if (method === "DELETE") return handleRuleAction(env, id, "delete");
        if (method === "PATCH") return handleRuleAction(env, id, "toggle", request);
      }

      // ── /api/parse-links ──────────────────────────────────────────
      if (path === "/api/parse-links" && method === "GET") return handleParseLinks(url);

      return err("Not Found", 404);
    } catch (e) {
      console.error(e);
      return err(`Internal Error: ${(e as Error).message}`, 500);
    }
  },

  /** 定时任务：同步订阅 & 书源可用性检查 */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduled(env));
  },
};

// ─── 鉴权逻辑 ────────────────────────────────────────────────────

function isAuthed(request: Request, env: Env): boolean {
  const pwd = env.ADMIN_PASSWORD || env.API_SECRET || "admin888";
  const auth = request.headers.get("Authorization") || "";
  return auth === `Bearer ${pwd}`;
}

function getOrigins(request: Request): string | string[] {
  const origin = new URL(request.url).origin;
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
    return [origin, "http://localhost:5173", "http://localhost:3000", "http://localhost:8787"];
  }
  return origin;
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
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
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

  const expectedOrigin = getOrigins(request);
  const expectedRPID = rpID;

  try {
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin,
      expectedRPID,
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
  } catch (e) {
    console.error("Passkey 注册验证异常:", e);
    return err("注册验证过程中发生错误", 500);
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
    userVerification: "preferred",
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

  const expectedOrigin = getOrigins(request);
  const expectedRPID = rpID;

  try {
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin,
      expectedRPID,
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
  } catch (e) {
    console.error("Passkey 登录验证异常:", e);
    return err("登录验证过程中发生错误", 500);
  }

  return err("验证失败", 401);
}

// ─── 其他处理器 (与之前相同) ────────────────────────────────────────

/** 输出订阅内容 (直接从 D1 读取，不使用 KV 缓存) */
async function handleSubscribeOutput(env: Env, type: "sources" | "rules"): Promise<Response> {
  try {
    const table = type === "sources" ? "sources" : "rules";
    const { results } = await env.DB.prepare(
      `SELECT raw_json FROM ${table} WHERE enabled=1 ORDER BY id`
    ).all();
    
    // 优化：直接拼接 JSON 字符串，避免大规模 JSON.parse / JSON.stringify 导致的内存和性能问题
    const jsonArray = "[" + results.map(r => r.raw_json).join(",") + "]";
    
    return new Response(jsonArray, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error(`输出订阅失败 (${type}):`, e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

/** 输出整合订阅索引 HTML (仿苗公子页面) */
async function handleSubscribeIndex(request: Request, env: Env): Promise<Response> {
  const origin = new URL(request.url).origin;
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>书源整合订阅 - Legado</title>
    <style>
        :root {
            --primary: #6750A4;
            --on-primary: #FFFFFF;
            --surface: #FEF7FF;
            --outline: #79747E;
            --surface-variant: #E7E0EC;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: var(--surface);
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            color: #1C1B1F;
        }
    <style>
        :root {
            --primary: #6750A4;
            --on-primary: #ffffff;
            --surface: #fef7ff;
            --surface-container: #f3edf7;
            --outline: #79747e;
            --shadow: rgba(0, 0, 0, 0.08);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, -apple-system, sans-serif;
            background: linear-gradient(135deg, #fef7ff 0%, #f3edf7 100%);
            color: #1c1b1f;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            width: 100%;
            max-width: 440px;
            background: rgba(255, 255, 255, 0.7);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.5);
            border-radius: 32px;
            padding: 40px 24px;
            box-shadow: 0 12px 40px var(--shadow);
            text-align: center;
        }
        .header { margin-bottom: 28px; }
        h1 {
            font-size: 1.6rem;
            color: var(--primary);
            margin-bottom: 8px;
            letter-spacing: -0.5px;
            font-weight: 800;
        }
        .subtitle {
            font-size: 0.95rem;
            color: var(--outline);
            margin-bottom: 28px;
        }
        h3 { margin-bottom: 12px; }
        .btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            width: 100%;
            padding: 16px;
            border-radius: 18px;
            text-decoration: none;
            font-weight: 600;
            font-size: 1rem;
            transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
            border: none;
            cursor: pointer;
            box-shadow: 0 2px 8px var(--shadow);
        }
        .btn:active { transform: scale(0.96); box-shadow: 0 1px 2px var(--shadow); }
        
        .btn-info {
            background: linear-gradient(135deg, #6750A4 0%, #9580FF 100%);
            color: var(--on-primary);
        }
        .btn-sources {
            background-color: #EADDFF;
            color: #21005D;
        }
        .btn-rules {
            background-color: #FFD8E4;
            color: #31111D;
        }
        
        .icon { font-size: 1.3rem; }
        .footer {
            margin-top: 24px;
            font-size: 0.8rem;
            color: var(--outline);
            opacity: 0.7;
            border-top: 1px solid rgba(0,0,0,0.05);
            padding-top: 20px;
        }
        .tip {
            margin-top: 20px;
            padding: 12px 16px;
            background: rgba(103, 80, 164, 0.08);
            border-radius: 12px;
            font-size: 0.82rem;
            color: var(--outline);
            line-height: 1.6;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📚 订阅中心</h1>
            <p class="subtitle">Legado 资源一键整合导入</p>
        </div>
        
        <h3><a href="${origin}/subscribe/info.json" class="btn btn-info">
            ✨ 添加到阅读发现
        </a></h3>

        <h3><a href="${origin}/subscribe/sources" class="btn btn-sources">
            📚 整合书源订阅
        </a></h3>
        
        <h3><a href="${origin}/subscribe/rules" class="btn btn-rules">
            ✨ 整合净化规则
        </a></h3>

        <div class="tip">
            💡 <strong>使用说明</strong>：请直接点击上方按钮。如果在阅读内部无法呼出，请确保已将此页添加为“发现源”并从发现列表中点击。
        </div>

        <div class="footer">
            由 Legado Subscription 系统自动生成
        </div>
    </div>
</body>
</html>
  `;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/** 输出发现源定义 JSON (供一键导入) */
function handleSubscribeInfo(request: Request): Response {
  const origin = new URL(request.url).origin;
  const icon = "https://files.catbox.moe/p9p3f2.png"; // 使用一个美化的预设图标，或者您之后可以替换
  
  const source = [
    {
      "sourceName": "✨ Legado 订阅中心",
      "sourceUrl": `${origin}/subscribe/index`,
      "sourceIcon": icon,
      "sourceGroup": "整合",
      "header": JSON.stringify({
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; Mobile Safari/537.36) Legado/3.0"
      }),
      "ruleExplore": [
        {
          "title": "一键导入",
          "url": `${origin}/subscribe/index`,
          "style": "layout_t_p_b64"
        }
      ],
      "ruleArticles": "h3",
      "ruleTitle": "a@text",
      "ruleLink": "a@href@js:if(result.includes('info.json')) return 'yuedu://rsssource/importonline?src=' + encodeURIComponent(result); if(result.includes('sources')) return 'yuedu://booksource/importonline?src=' + encodeURIComponent(result); if(result.includes('rules')) return 'yuedu://purificationsource/importonline?src=' + encodeURIComponent(result); return result;",
      "enabled": true,
      "type": 0
    }
  ];

  return new Response(JSON.stringify(source), {
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
  const srcRow = (await env.DB.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN is_available=1 THEN 1 ELSE 0 END) as available FROM sources WHERE enabled=1").first()) as any;
  const ruleRow = (await env.DB.prepare("SELECT COUNT(*) as total FROM rules WHERE enabled=1").first()) as any;
  return ok({ subscriptions: subRow, sources: srcRow, rules: ruleRow });
}

async function handleListSources(env: Env, url: URL): Promise<Response> {
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

async function handleAllSourceIds(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare("SELECT id FROM sources").all();
  return ok(results.map((r: any) => r.id));
}

async function handleListRules(env: Env, url: URL): Promise<Response> {
  const q = url.searchParams.get("q") || "";
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const limit = 50;
  const offset = (page - 1) * limit;
  const { results } = await env.DB.prepare(
    `SELECT * FROM rules WHERE name LIKE ? LIMIT ? OFFSET ?`
  ).bind(`%${q}%`, limit, offset).all();
  return ok(results);
}

async function handleAddRule(request: Request, env: Env): Promise<Response> {
  const body = await parseBody<{ name: string; pattern: string; replacement: string }>(request);
  if (!body?.name || !body?.pattern) return err("名称和模式不能为空");

  // 获取或创建手动添加订阅
  let manualSub = (await env.DB.prepare("SELECT id FROM subscriptions WHERE url = 'manual_rules'").first()) as any;
  if (!manualSub) {
    const { meta } = await env.DB.prepare("INSERT INTO subscriptions (name, url, type) VALUES ('手动添加规则', 'manual_rules', 'rule')").run();
    manualSub = { id: meta.last_row_id };
  }

  const rawJson = JSON.stringify({
    name: body.name,
    ruleName: body.name,
    regex: body.pattern,
    replacement: body.replacement || "",
    enabled: true
  });

  await env.DB.prepare(
    "INSERT INTO rules (subscription_id, name, pattern, replacement, raw_json) VALUES (?, ?, ?, ?, ?)"
  ).bind(manualSub.id, body.name, body.pattern, body.replacement || "", rawJson).run();

  await rebuildCache(env, "rule");
  return ok();
}

async function handleParseLinks(url: URL): Promise<Response> {
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
    
    // 匹配 yuedu:// 或 legado:// 链接中的 src 参数
    // 同时也适配 onclick 等属性中的链接
    const linkRegex = /src=([^"& ]+)/g;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const subUrl = decodeURIComponent(match[1]).replace(/['"]$/, ''); // 清理末尾引号
      if (!subUrl.startsWith('http')) continue;

      const matchIndex = match.index;
      // 往前查找附近的标题信息
      const searchRange = html.substring(Math.max(0, matchIndex - 1000), matchIndex);
      
      // 优先级 1: 寻找最近的标题标签 (h1-h6) 或带有 title 类的 div
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
          // 不再 break，因为要找最后一个（离链接最近的）
        }
      }

      // 如果还是没找到，尝试找包含链接的 a 标签本身的 title 属性
      if (!bestName) {
        const linkTag = html.substring(matchIndex - 50, matchIndex + 200);
        const titleAttr = /title="([^"]+)"/.exec(linkTag);
        if (titleAttr) bestName = titleAttr[1];
      }

      // 过滤掉无意义的名称并进行精简
      let name = (bestName && bestName !== "一键导入") ? bestName : "未知来源";
      
      // 精简逻辑：去除日期、数量等干扰信息
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
      
      // 避免重复（同一个页面可能有多个按钮指向同一个源）
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
async function handleTestSources(env: Env, request: Request): Promise<Response> {
  const body = await parseBody<{ ids: number[] }>(request);
  const ids = body?.ids || [];
  if (!ids.length) return ok({});

  // 1. 一次性查出所有数据 (包含 raw_json 以便分析 searchUrl)
  const { results: rawSources } = await env.DB.prepare(
    `SELECT id, book_source_url, raw_json FROM sources WHERE id IN (${ids.map(() => '?').join(',')})`
  ).bind(...ids).all();
  
  const sourcesMap = new Map(rawSources.map((s: any) => [s.id, s]));
  const testResults: Record<number, boolean> = {};

  // 2. 并发测试
  const chunkSize = 15; 
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (id) => {
      const sourceData = sourcesMap.get(id);
      if (!sourceData) {
        testResults[id] = false;
        return;
      }

      let urlToTest = sourceData.book_source_url;
      let fetchOptions: RequestInit = {
        method: 'GET',
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
        },
        signal: AbortSignal.timeout(8000) // 搜索通常比主页慢，增加到 8秒
      };

      try {
        const json = JSON.parse(sourceData.raw_json);
        let searchUrl = json.searchUrl;

        if (searchUrl) {
          // 处理 Legado 复杂的 searchUrl 格式：url[,options]
          let urlPart = searchUrl;
          if (searchUrl.includes(',{')) {
            const parts = searchUrl.split(',{');
            urlPart = parts[0];
            try {
              const extraOptions = JSON.parse('{' + parts[1]);
              if (extraOptions.method) fetchOptions.method = extraOptions.method.toUpperCase();
              if (extraOptions.body) {
                fetchOptions.body = extraOptions.body.replace(/\{\{key\}\}/g, encodeURIComponent('我的'));
              }
              if (extraOptions.headers) {
                fetchOptions.headers = { ...fetchOptions.headers, ...extraOptions.headers };
              }
            } catch (e) { /* 忽略解析错误 */ }
          }

          // 替换 URL 中的关键词
          urlPart = urlPart.replace(/\{\{key\}\}/g, encodeURIComponent('我的'));

          // 构建完整 URL
          if (urlPart.startsWith('http')) {
            urlToTest = urlPart;
          } else {
            const baseUrl = json.bookSourceUrl || sourceData.book_source_url;
            try {
              urlToTest = new URL(urlPart, baseUrl).toString();
            } catch (e) {
              urlToTest = baseUrl.replace(/\/$/, '') + '/' + urlPart.replace(/^\//, '');
            }
          }
        }
      } catch (e) { /* 解析 JSON 失败则回退到基础测试 */ }

      try {
        const res = await fetch(urlToTest, fetchOptions);
        // 只要能通且有内容返回就算可用
        if (res.status >= 200 && res.status < 400) {
          const text = await res.text();
          testResults[id] = text.length > 100; // 搜索结果通常应该有一定的长度
        } else {
          testResults[id] = false;
        }
      } catch (e) {
        testResults[id] = false;
      }
    }));
  }

  // 3. 批量更新数据库 (Cloudflare D1 batch)
  const statements = ids.map(id => {
    const isAvail = testResults[id] ? 1 : 0;
    return env.DB.prepare(
      "UPDATE sources SET is_available = ?, last_checked = datetime('now'), enabled = ? WHERE id = ?"
    ).bind(isAvail, isAvail, id);
  });
  
  await env.DB.batch(statements);

  return ok(testResults);
}

async function handleSourceAction(env: Env, id: number, action: string, request?: Request): Promise<Response> {
  if (action === "delete") {
    await env.DB.prepare("DELETE FROM sources WHERE id = ?").bind(id).run();
  } else if (action === "toggle" && request) {
    const { enabled } = await request.json() as { enabled: number };
    await env.DB.prepare("UPDATE sources SET enabled = ? WHERE id = ?").bind(enabled, id).run();
  }
  return ok();
}

async function handleRuleAction(env: Env, id: number, action: string, request?: Request): Promise<Response> {
  if (action === "delete") {
    await env.DB.prepare("DELETE FROM rules WHERE id = ?").bind(id).run();
  } else if (action === "toggle" && request) {
    const { enabled } = await request.json() as { enabled: number };
    await env.DB.prepare("UPDATE rules SET enabled = ? WHERE id = ?").bind(enabled, id).run();
  }
  return ok();
}

async function handleScheduled(env: Env) {
  try {
    await ensureDatabase(env);
    console.log("Starting scheduled tasks...");

    // 1. 同步所有启用订阅
    const { results: subs } = await env.DB.prepare("SELECT * FROM subscriptions WHERE enabled = 1").all();
    for (const sub of subs as any[]) {
      try {
        console.log(`Syncing sub: ${sub.name} (${sub.url})`);
        if (sub.type === 'source') await syncSourceSubscription(env, sub.id, sub.url);
        else await syncRuleSubscription(env, sub.id, sub.url);
      } catch (e) {
        console.error(`Sync failed for sub ${sub.id}:`, e);
      }
    }

    // 2. 检查书源可用性
    // 每次检查最近未检查的 100 个，避免单次执行过久
    const { results: sources } = await env.DB.prepare(
      "SELECT id, book_source_url FROM sources WHERE enabled = 1 ORDER BY last_checked ASC LIMIT 100"
    ).all();
    
    console.log(`Checking availability for ${sources.length} sources...`);
    for (const src of sources as any[]) {
      try {
        // 使用 HEAD 请求快速检查，超时 5 秒
        const res = await fetch(src.book_source_url, { 
          method: 'HEAD', 
          headers: { 'User-Agent': 'Mozilla/5.0 Legado-Check/1.0' }
        });
        const available = res.ok ? 1 : 0;
        await env.DB.prepare("UPDATE sources SET is_available = ?, last_checked = datetime('now') WHERE id = ?")
          .bind(available, src.id).run();
      } catch (e) {
        // 抓取失败视为不可用
        await env.DB.prepare("UPDATE sources SET is_available = 0, last_checked = datetime('now') WHERE id = ?")
          .bind(src.id).run();
      }
    }
    
    console.log("Scheduled tasks completed.");
  } catch (e) {
    console.error("Scheduled handler error:", e);
  }
}
