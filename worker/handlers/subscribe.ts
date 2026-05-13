import { Env } from "../types";
import { PREVIEW_TITLE, PREVIEW_PARAS } from "../../src/utils/constants";
import { generatePreviewHTML, getTipText } from "../../src/utils/preview";
import { argbToCss } from "../../src/utils/color";

export async function handleSubscribeOutput(env: Env, type: "sources" | "rules"): Promise<Response> {
  try {
    const cacheKey = type === "sources" ? "sources" : "rules";
    
    // 1. 优先尝试从 KV 读取缓存（这是 rebuildCache 预生成的，已去重）
    const cached = await env.KV.get(cacheKey);
    if (cached) {
      return new Response(cached, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "X-Cache": "HIT"
        },
      });
    }

    // 2. 缓存失效时降级到 DB，但必须包含 GROUP BY 逻辑 (回答用户：是的，现在是 SQL 过滤)
    const table = type === "sources" ? "sources" : "rules";
    const groupBy = type === "sources" ? "book_source_url" : "name, pattern";
    
    const { results } = await env.DB.prepare(
      `SELECT raw_json FROM ${table} WHERE enabled=1 GROUP BY ${groupBy} ORDER BY id`
    ).all();
    
    const jsonArray = "[" + results.map(r => r.raw_json).join(",") + "]";
    
    return new Response(jsonArray, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "X-Cache": "MISS"
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

export async function handleSubscribeIndex(request: Request, env: Env): Promise<Response> {
  const origin = new URL(request.url).origin;
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Legado 资源中心</title>
    <style>
        :root {
            --primary: #6750A4;
            --on-primary: #ffffff;
            --surface: #fef7ff;
            --surface-container: #f3edf7;
            --outline: #79747e;
            --secondary: #625b71;
            --shadow: rgba(0, 0, 0, 0.08);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body {
            font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, -apple-system, sans-serif;
            background: var(--surface);
            color: #1c1b1f;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .app-bar {
            width: 100%;
            padding: 20px;
            background: white;
            box-shadow: 0 2px 4px var(--shadow);
            position: sticky;
            top: 0;
            z-index: 10;
            text-align: center;
        }
        h1 { font-size: 1.4rem; color: var(--primary); font-weight: 800; }
        
        .tabs {
            display: flex;
            background: #eee;
            padding: 4px;
            border-radius: 12px;
            margin: 20px 0;
            width: 90%;
            max-width: 400px;
        }
        .tab {
            flex: 1;
            padding: 8px;
            border-radius: 10px;
            text-align: center;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .tab.active { background: white; color: var(--primary); box-shadow: 0 2px 6px var(--shadow); }

        .container {
            width: 100%;
            max-width: 500px;
            padding: 0 20px 40px;
            display: none;
        }
        .container.active { display: block; }

        .card {
            background: white;
            border-radius: 24px;
            padding: 20px;
            margin-bottom: 16px;
            box-shadow: 0 4px 12px var(--shadow);
            border: 1px solid rgba(0,0,0,0.05);
        }
        .card h3 { font-size: 1rem; margin-bottom: 15px; color: #555; border-left: 4px solid var(--primary); padding-left: 10px; }
        
        .btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            width: 100%;
            padding: 14px;
            border-radius: 16px;
            text-decoration: none;
            font-weight: 600;
            margin-bottom: 12px;
            transition: transform 0.2s;
        }
        .btn:active { transform: scale(0.97); }
        .btn-p { background: var(--primary); color: white; }
        .btn-s { background: #EADDFF; color: #21005D; }
        .btn-o { background: #FFD8E4; color: #31111D; }
        .btn-d { background: #FFDAD6; color: #410002; }

        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }
        .res-item {
            background: var(--surface-container);
            padding: 12px;
            border-radius: 18px;
            text-align: center;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }
        .res-preview {
            width: 100%;
            height: 80px;
            object-fit: cover;
            border-radius: 10px;
            margin-bottom: 8px;
            background: #eee;
        }
        .res-name { font-size: 0.8rem; font-weight: 700; margin-bottom: 8px; color: #444; word-break: break-all; }
        .res-btn {
            font-size: 0.75rem;
            padding: 6px;
            background: white;
            border-radius: 8px;
            color: var(--primary);
            text-decoration: none;
            border: 1px solid var(--primary);
        }

        /* 预览相关样式 */
        .preview-container {
            width: 100%;
            aspect-ratio: 9/16;
            background: #eee;
            border-radius: 12px;
            margin-bottom: 10px;
            overflow: hidden;
            position: relative;
            box-shadow: inset 0 0 0 1px rgba(0,0,0,0.05);
        }
        .preview-body {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            font-size: 6px;
        }
        .preview-header, .preview-footer {
            display: flex;
            justify-content: space-between;
            padding: 4px 8px;
            font-size: 4px;
            opacity: 0.8;
        }
        .preview-content {
            flex: 1;
            padding: 8px;
            line-height: 1.4;
        }
        .preview-title {
            font-weight: bold;
            margin-bottom: 4px;
        }
        .preview-para {
            margin-bottom: 4px;
        }

        #status-bar {
            position: fixed;
            bottom: 20px;
            left: 20px;
            right: 20px;
            padding: 12px;
            border-radius: 12px;
            background: #333;
            color: white;
            font-size: 0.85rem;
            display: none;
            z-index: 100;
        }
    </style>
</head>
<body>
    <div class="app-bar">
        <h1>📚 Legado 资源中心</h1>
    </div>

    <div class="tabs">
        <div class="tab active" onclick="switchTab(0)">订阅整合</div>
        <div class="tab" onclick="switchTab(1)">精选主题</div>
    </div>

    <!-- Tab 0: 订阅整合 -->
    <div id="tab-0" class="container active">
        <div class="card">
            <a href="legado://import/bookSource?src=${encodeURIComponent(origin + '/subscribe/sources')}" class="btn btn-p">📦 导入全量整合书源</a>
            <a href="legado://import/replaceRule?src=${encodeURIComponent(origin + '/subscribe/rules')}" class="btn btn-s">✨ 导入全量净化规则</a>
            <a href="legado://import/rssSource?src=${encodeURIComponent(origin + '/subscribe/info.json')}" class="btn btn-o">📌 添加到阅读发现</a>
        </div>
        <div class="card">
            <p style="font-size:0.8rem; color:var(--outline); margin-bottom:12px;">高级操作</p>
            <a href="#" onclick="clearAndImport(); return false;" class="btn btn-d">🗑️ 清空并重新订阅</a>
        </div>
    </div>

    <!-- Tab 1: 精选主题 -->
    <div id="tab-1" class="container">
        <div id="res-loading" style="text-align:center; padding:40px; color:var(--outline);">正在从云端获取精选主题...</div>
        <div id="res-content"></div>
    </div>

    <div id="status-bar"></div>

    <script>
        function switchTab(idx) {
            document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === idx));
            document.querySelectorAll('.container').forEach((c, i) => c.classList.toggle('active', i === idx));
            if (idx === 1) loadResources();
        }

        async function loadResources() {
            const container = document.getElementById('res-content');
            if (container.innerHTML !== '') return;

            try {
                const res = await fetch('/api/custom-themes');
                const json = await res.json();
                const items = json.data || [];
                
                if (items.length === 0) {
                    container.innerHTML = '<div style="text-align:center;color:#999;padding:40px;">暂无精选主题，请先在后台编辑并保存</div>';
                    document.getElementById('res-loading').style.display = 'none';
                    return;
                }

                let html = '<div class="card"><h3>🎨 精选推荐</h3><div class="grid">';
                items.forEach(item => {
                    const config = JSON.parse(item.config);
                    const exportUrl = origin + '/api/custom-themes/' + item.id + '/export';
                    const importUrl = 'legado://import/readConfig?src=' + encodeURIComponent(exportUrl);
                    
                    html += '<div class="res-item">' +
                            '<div class="preview-container" id="preview-' + item.id + '"></div>' +
                            '<div class="res-name">' + item.name + '</div>' +
                            '<a href="' + importUrl + '" class="res-btn">一键导入</a>' +
                            '</div>';
                });
                html += '</div></div>';

                container.innerHTML = html;
                
                // 渲染预览
                items.forEach(item => {
                    renderThemePreview(item.id, JSON.parse(item.config));
                });
                document.getElementById('res-loading').style.display = 'none';
            } catch (e) {
                container.innerHTML = '<div style="color:red;padding:20px;">加载失败: ' + e.message + '</div>';
            }
        }

        ${argbToCss.toString()}
        ${getTipText.toString()}
        ${generatePreviewHTML.toString()}

        function renderThemePreview(id, config) {
            const container = document.getElementById('preview-' + id);
            if (!container) return;

            const bgColor = config.bgType === 0 ? argbToCss(config.bgStr || '#EEEEEE') : 'white';
            const bgImg = (config.bgType === 2 && config.bgStr) ? 'url(/repo/' + config.bgStr + ')' : 'none';

            let html = '<div id="inner-preview-' + id + '" style="width:320px; height:675.5px; transform-origin: top left; background-color:' + bgColor + '; background-image:' + bgImg + '; background-size:cover; background-position:center; display:flex; flex-direction:column; overflow:hidden;">' +
                       '<div style="height:14px; width:100%; display:flex; align-items:center; justify-content:center; opacity:0.2; flex-shrink:0;">' +
                       '<div style="width:24px; height:4px; background:currentColor; border-radius:4px;"></div>' +
                       '</div>';

            html += generatePreviewHTML(config, 0.82, getTipText, argbToCss, ${JSON.stringify(PREVIEW_TITLE)}, ${JSON.stringify(PREVIEW_PARAS)});
            html += '</div>';

            container.innerHTML = html;

            const inner = document.getElementById('inner-preview-' + id);
            const resize = () => {
                const w = container.clientWidth;
                inner.style.transform = 'scale(' + (w / 320) + ')';
            };
            new ResizeObserver(resize).observe(container);
            resize();
        }


        function showStatus(msg) {
            const bar = document.getElementById('status-bar');
            bar.textContent = msg;
            bar.style.display = 'block';
            setTimeout(() => bar.style.display = 'none', 3000);
        }

        async function clearAndImport() {
            if (!confirm('将清空本地所有书源并同步云端，确定吗？')) return;
            const port = 1122;
            const base = 'http://127.0.0.1:' + port;
            showStatus('正在尝试连接本地服务...');
            try {
                const res = await fetch(base + '/getBookSources');
                const sources = await res.json();
                const list = Array.isArray(sources) ? sources : (sources.data || []);
                if (list.length > 0) {
                    showStatus('正在删除 ' + list.length + ' 个书源...');
                    await fetch(base + '/deleteBookSources', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(list)
                    });
                }
                showStatus('✅ 已清空，正在拉起导入...');
                setTimeout(() => {
                    location.href = 'legado://import/bookSource?src=${encodeURIComponent(origin + '/subscribe/sources')}';
                }, 1000);
            } catch (e) {
                showStatus('❌ 失败: 请确保阅读 Web 服务已开启 (端口 ' + port + ')');
            }
        }
    </script>
</body>
</html>
  `;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
}

export function handleSubscribeInfo(request: Request): Response {
  const origin = new URL(request.url).origin;
  const icon = "https://files.catbox.moe/p9p3f2.png";
  
  const source = [
    {
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
      "header": JSON.stringify({
        "User-Agent": "Mozilla/5.0 (Linux; U; Android 8.1.0; zh-CN; MI 8 Lite Build/OPM1.171019.019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.108 UCBrowser/13.2.0.1100 Mobile Safari/537.36"
      }),
      "sortUrl": `首页::${origin}/subscribe/index`,
      "ruleArticles": ".container@h3",
      "ruleTitle": "a@textNodes",
      "ruleLink": "a@href",
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
