import { Env } from "../types";
// @ts-ignore - 这种导入方式需要 Wrangler 规则支持，已在 wrangler.toml 中配置
import TEMPLATE_STR from "./subscribe.html";

export async function handleSubscribeOutput(env: Env, type: "sources" | "rules"): Promise<Response> {
  try {
    const cacheKey = type === "sources" ? "sources" : "rules";
    const cached = await env.KV.get(cacheKey);
    if (cached) {
      return new Response(cached, {
        headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "X-Cache": "HIT" },
      });
    }

    const table = type === "sources" ? "sources" : "rules";
    const groupBy = type === "sources" ? "book_source_url" : "name, pattern";
    const { results } = await env.DB.prepare(`SELECT raw_json FROM ${table} WHERE enabled=1 GROUP BY ${groupBy} ORDER BY id`).all();
    const jsonArray = "[" + results.map(r => r.raw_json).join(",") + "]";
    
    return new Response(jsonArray, {
      headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "X-Cache": "MISS" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function handleSubscribeIndex(request: Request, env: Env): Promise<Response> {
  const origin = new URL(request.url).origin;
  
  let html = TEMPLATE_STR;

  // 动态注入变量 (仅保留基础 URL)
  html = html
    .replace(/{{ORIGIN}}/g, origin)
    .replace(/{{SOURCES_URL}}/g, encodeURIComponent(origin + '/subscribe/sources'))
    .replace(/{{RULES_URL}}/g, encodeURIComponent(origin + '/subscribe/rules'))
    .replace(/{{INFO_URL}}/g, encodeURIComponent(origin + '/subscribe/info.json'));

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
}

export function handleSubscribeInfo(request: Request): Response {
  const origin = new URL(request.url).origin;
  const icon = "https://files.catbox.moe/p9p3f2.png";
  const source = [{
    "sourceName": "✨ Legado 订阅中心",
    "sourceUrl": `${origin}/subscribe/index`,
    "sourceIcon": icon,
    "sourceGroup": "整合",
    "articleStyle": 0,
    "enableJs": true,
    "enabled": true,
    "enabledCookieJar": false,
    "loadWithBaseUrl": true,
    "singleUrl": true,
    "header": JSON.stringify({ "User-Agent": "Mozilla/5.0 (Linux; U; Android 8.1.0; zh-CN; MI 8 Lite Build/OPM1.171019.019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.108 UCBrowser/13.2.0.1100 Mobile Safari/537.36" }),
    "sortUrl": `首页::${origin}/subscribe/index`,
    "ruleArticles": ".container@h3",
    "ruleTitle": "a@textNodes",
    "ruleLink": "a@href",
    "type": 0
  }];
  return new Response(JSON.stringify(source), { headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" } });
}
