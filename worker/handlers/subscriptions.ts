import { Env } from "../types";
import {
  ok,
  err,
  parseBody,
  syncSourceSubscription,
  syncRuleSubscription,
  rebuildCache,
} from "../utils";

export async function handleListSubscriptions(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare("SELECT * FROM subscriptions ORDER BY created_at DESC").all();
  return ok(results);
}

export async function handleAddSubscription(request: Request, env: Env): Promise<Response> {
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

export async function handleDeleteSubscription(env: Env, id: number): Promise<Response> {
  const sub = (await env.DB.prepare("SELECT type FROM subscriptions WHERE id=?").bind(id).first()) as any;
  if (!sub) return err("不存在", 404);
  await env.DB.prepare("DELETE FROM subscriptions WHERE id=?").bind(id).run();
  await rebuildCache(env, sub.type);
  return ok();
}

export async function handleToggleSubscription(request: Request, env: Env, id: number): Promise<Response> {
  const body = await parseBody<{ enabled: boolean }>(request);
  const enabled = body?.enabled ? 1 : 0;
  await env.DB.prepare("UPDATE subscriptions SET enabled=? WHERE id=? AND enabled != ?").bind(enabled, id, enabled).run();
  const sub = (await env.DB.prepare("SELECT type FROM subscriptions WHERE id=?").bind(id).first()) as any;
  if (sub) {
    const table = sub.type === "source" ? "sources" : "rules";
    await env.DB.prepare(`UPDATE ${table} SET enabled=? WHERE subscription_id=? AND enabled != ?`).bind(enabled, id, enabled).run();
    await rebuildCache(env, sub.type);
  }
  return ok();
}

export async function handleSync(env: Env, id: number | null, ctx?: any): Promise<Response> {
  const runSync = async () => {
    try {
      const subs = id 
        ? [await env.DB.prepare("SELECT * FROM subscriptions WHERE id=?").bind(id).first()] 
        : (await env.DB.prepare("SELECT * FROM subscriptions WHERE enabled=1").all()).results;
      
      // 并行同步所有启用的订阅
      await Promise.all((subs as any[]).map(async (sub) => {
        try {
          if (sub.type === "source") await syncSourceSubscription(env, sub.id, sub.url);
          else await syncRuleSubscription(env, sub.id, sub.url);
        } catch (e) { 
          console.error(`Sync failed for [${sub.name}]:`, e); 
        }
      }));

      await Promise.all([rebuildCache(env, "source"), rebuildCache(env, "rule")]);
      console.log("后台同步任务与缓存重建已圆满完成。");
    } catch (err) {
      console.error("后台异步同步发生致命错误:", err);
    }
  };

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(runSync());
    return ok({ message: "Sync started in background" });
  } else {
    // 降级为同步执行（如定时任务或特殊环境）
    await runSync();
    return ok();
  }
}
