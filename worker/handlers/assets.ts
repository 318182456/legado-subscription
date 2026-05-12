import { Env } from "../types";
import {
  err,
  checkAuth,
} from "../utils";

export async function handleRepoProxy(path: string, env: Env): Promise<Response> {
  const rawKey = path.replace("/repo/", "");
  
  let object = await env.ASSETS_R2.get(rawKey);
  
  if (!object) {
    try {
      const decodedKey = decodeURIComponent(rawKey);
      if (decodedKey !== rawKey) {
        object = await env.ASSETS_R2.get(decodedKey);
      }
    } catch (e) {}
  }

  if (!object && rawKey.includes('+')) {
    try {
      const spaceKey = decodeURIComponent(rawKey.replace(/\+/g, ' '));
      object = await env.ASSETS_R2.get(spaceKey);
    } catch (e) {}
  }

  if (!object) return err(`Resource Not Found: ${rawKey}`, 404);
  
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("etag", object.httpEtag);
  
  const ext = rawKey.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp',
    'gif': 'image/gif',
    'ttf': 'font/ttf',
    'otf': 'font/otf',
    'woff': 'font/woff',
    'woff2': 'font/woff2'
  };
  if (ext && mimeTypes[ext]) {
    headers.set("Content-Type", mimeTypes[ext]);
  }
  
  return new Response(object.body, { headers });
}

export async function handleResourcesList(env: Env): Promise<Response> {
  const data = await env.KV.get("resources-index");
  const json = data ? JSON.parse(data) : {};
  return new Response(JSON.stringify({ ok: true, data: json }), { 
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
  });
}

export async function handleR2List(request: Request, env: Env): Promise<Response> {
  await checkAuth(request, env);
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const listed = await env.ASSETS_R2.list({ limit: 1000, cursor });
    listed.objects.forEach(obj => keys.push(obj.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return new Response(JSON.stringify({ ok: true, data: keys, total: keys.length }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

// ---------- 精选主题管理 ----------

export async function handleListCustomThemes(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM custom_themes ORDER BY created_at DESC"
  ).all();
  return new Response(JSON.stringify({ ok: true, data: results }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

export async function handleSaveCustomTheme(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as any;
  if (!body.name || !body.config) return err("Name and Config are required");

  await env.DB.prepare(
    "INSERT INTO custom_themes (name, config, preview_url) VALUES (?, ?, ?)"
  ).bind(body.name, body.config, body.preview_url || null).run();

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

export async function handleDeleteCustomTheme(id: number, env: Env): Promise<Response> {
  await env.DB.prepare("DELETE FROM custom_themes WHERE id = ?").bind(id).run();
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

export async function handleExportCustomTheme(id: number, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT config FROM custom_themes WHERE id = ?"
  ).bind(id).first() as any;
  
  if (!result) return err("Theme Not Found", 404);
  
  // 这里的 result.config 已经是 JSON 字符串
  return new Response(result.config, {
    headers: { 
      "Content-Type": "application/json; charset=utf-8", 
      "Access-Control-Allow-Origin": "*",
      "Content-Disposition": `attachment; filename="readConfig.json"`
    }
  });
}
