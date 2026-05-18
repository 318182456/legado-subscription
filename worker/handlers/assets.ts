import { Env } from "../types";
import {
  err,
  checkAuth,
} from "../utils";
import { unzipSync } from "fflate";


export async function handleRepoProxy(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const rawKey = path.replace("/repo/", "");
  
  // 1. 获取客户端请求的 Range
  const range = request.headers.get('Range');
  
  // 2. 尝试从 R2 获取对象
  let object = await env.ASSETS_R2.get(rawKey, {
    range: range || undefined,
  });
  
  if (!object) {
    try {
      const decodedKey = decodeURIComponent(rawKey);
      if (decodedKey !== rawKey) {
        object = await env.ASSETS_R2.get(decodedKey, { range: range || undefined });
      }
    } catch (e) {}
  }

  if (!object && rawKey.includes("+")) {
    try {
      const spaceKey = decodeURIComponent(rawKey.replace(/\+/g, " "));
      object = await env.ASSETS_R2.get(spaceKey, { range: range || undefined });
    } catch (e) {}
  }

  if (!object) return err(`Resource Not Found: ${rawKey}`, 404);
  
  const headers = new Headers();
  object.writeHttpMetadata(headers as any);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Accept-Ranges", "bytes");
  
  // 强缓存策略
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);
  
  // 处理分片下载的状态码
  const status = range ? 206 : 200;

  const ext = rawKey.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "webp": "image/webp", "gif": "image/gif", "ttf": "font/ttf",
    "otf": "font/otf", "woff": "font/woff", "woff2": "font/woff2"
  };
  if (ext && mimeTypes[ext]) {
    headers.set("Content-Type", mimeTypes[ext]);
  }
  
  return new Response(object.body as any, { status, headers });
}

export async function handleResourcesList(env: Env): Promise<Response> {
  const data = await env.KV.get("resources-index");
  const json = data ? JSON.parse(data) : {};
  return new Response(JSON.stringify({ ok: true, data: json }), { 
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
  });
}

/**
 * 重新扫描 R2 并重建资源索引
 */
export async function handleResourcesRefresh(env: Env): Promise<Response> {
  const listed = await env.ASSETS_R2.list();
  const index: Record<string, any[]> = {};

  for (const obj of listed.objects) {
    const key = obj.key;
    const parts = key.split('/');
    if (parts.length < 2) continue;
    
    let category, name;
    if (parts[0] === 'uploads' && parts.length >= 3) {
      category = parts[1];
      name = parts.slice(2).join('/');
    } else {
      category = parts[0];
      name = parts.slice(1).join('/');
    }
    
    if (!index[category]) index[category] = [];
    
    index[category].push({
      name,
      path: key,
      size: obj.size,
      mtime: obj.uploaded ? new Date(obj.uploaded).toISOString() : new Date().toISOString()
    });
  }

  await env.KV.put("resources-index", JSON.stringify(index));
  return new Response(JSON.stringify({ ok: true, data: index }), {
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

  if (body.id) {
    await env.DB.prepare(
      "UPDATE custom_themes SET name = ?, config = ?, preview_url = ? WHERE id = ?"
    ).bind(body.name, body.config, body.preview_url || null, body.id).run();
  } else {
    await env.DB.prepare(
      "INSERT INTO custom_themes (name, config, preview_url) VALUES (?, ?, ?)"
    ).bind(body.name, body.config, body.preview_url || null).run();
  }

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

// ---------- ZIP 导出逻辑 (极简 Store 模式) ----------

class ZipWriter {
  private entries: { name: string; data: Uint8Array; crc: number; offset: number }[] = [];
  private offset = 0;

  private crc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    const table = this.getCrcTable();
    for (let i = 0; i < data.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  private _crcTable: Int32Array | null = null;
  private getCrcTable() {
    if (this._crcTable) return this._crcTable;
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    this._crcTable = table;
    return table;
  }

  private writeU16(val: number) {
    return new Uint8Array([val & 0xFF, (val >> 8) & 0xFF]);
  }

  private writeU32(val: number) {
    return new Uint8Array([val & 0xFF, (val >> 8) & 0xFF, (val >> 16) & 0xFF, (val >> 24) & 0xFF]);
  }

  addFile(name: string, data: Uint8Array | string) {
    const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    this.entries.push({
      name,
      data: buf,
      crc: this.crc32(buf),
      offset: this.offset
    });
    this.offset += 30 + name.length + buf.length;
  }

  generate(): Uint8Array {
    const chunks: Uint8Array[] = [];
    
    // 1. Local File Headers + Data
    for (const e of this.entries) {
      const nameBuf = new TextEncoder().encode(e.name);
      chunks.push(new Uint8Array([0x50, 0x4b, 0x03, 0x04])); // Signature
      chunks.push(this.writeU16(10)); // Version
      chunks.push(this.writeU16(0));  // Flags
      chunks.push(this.writeU16(0));  // Compression (Store)
      chunks.push(this.writeU32(0));  // Time/Date
      chunks.push(this.writeU32(e.crc)); // CRC
      chunks.push(this.writeU32(e.data.length)); // Compressed Size
      chunks.push(this.writeU32(e.data.length)); // Uncompressed Size
      chunks.push(this.writeU16(nameBuf.length)); // Name Length
      chunks.push(this.writeU16(0));  // Extra Length
      chunks.push(nameBuf);
      chunks.push(e.data);
    }

    const centralDirOffset = this.offset;
    let centralDirSize = 0;

    // 2. Central Directory
    for (const e of this.entries) {
      const nameBuf = new TextEncoder().encode(e.name);
      chunks.push(new Uint8Array([0x50, 0x4b, 0x01, 0x02])); // Signature
      chunks.push(this.writeU16(20)); // Version made by
      chunks.push(this.writeU16(10)); // Version needed
      chunks.push(this.writeU16(0));  // Flags
      chunks.push(this.writeU16(0));  // Compression
      chunks.push(this.writeU32(0));  // Time/Date
      chunks.push(this.writeU32(e.crc)); // CRC
      chunks.push(this.writeU32(e.data.length));
      chunks.push(this.writeU32(e.data.length));
      chunks.push(this.writeU16(nameBuf.length));
      chunks.push(this.writeU16(0)); // Extra
      chunks.push(this.writeU16(0)); // Comment
      chunks.push(this.writeU16(0)); // Disk start
      chunks.push(this.writeU16(0)); // Internal attr
      chunks.push(this.writeU32(0)); // External attr
      chunks.push(this.writeU32(e.offset)); // Offset
      chunks.push(nameBuf);
      centralDirSize += 46 + nameBuf.length;
    }

    // 3. End of Central Directory
    chunks.push(new Uint8Array([0x50, 0x4b, 0x05, 0x06])); // Signature
    chunks.push(this.writeU16(0)); // Disk number
    chunks.push(this.writeU16(0)); // Start disk
    chunks.push(this.writeU16(this.entries.length)); // Entries on disk
    chunks.push(this.writeU16(this.entries.length)); // Total entries
    chunks.push(this.writeU32(centralDirSize));
    chunks.push(this.writeU32(centralDirOffset));
    chunks.push(this.writeU16(0)); // Comment length

    // 合并所有 chunks：一次性申请内存，避免多次拷贝
    const totalSize = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}

export async function handleExportCustomTheme(request: Request, env: Env, idStr: string): Promise<Response> {
  const id = parseInt(idStr);
  const result = await env.DB.prepare(
    "SELECT config FROM custom_themes WHERE id = ?"
  ).bind(id).first() as any;
  
  if (!result) return err("Theme Not Found", 404);
  
  const config = JSON.parse(result.config);
  const zip = new ZipWriter();

  // 辅助函数：从 R2 抓取资源并添加到 ZIP
  const processResource = async (path: string, type: 'fonts' | 'bg') => {
    if (!path || path.startsWith('#')) return path;
    
    // 提取 key (去除 http 前缀)
    let key = path.startsWith('http') ? path.split('/repo/').pop() : path;
    if (!key) return path;

    key = decodeURIComponent(key);
    
    // 尝试多种路径匹配 (逻辑同步自 handleRepoProxy)
    let obj = await env.ASSETS_R2.get(key);
    if (!obj && key.includes(' ')) {
      obj = await env.ASSETS_R2.get(key.replace(/ /g, '+'));
    }
    if (!obj && key.includes('+')) {
      obj = await env.ASSETS_R2.get(key.replace(/\+/g, ' '));
    }

    if (obj) {
      const data = await obj.arrayBuffer();
      const fileName = key.split('/').pop()!;
      // Legado 源码显示它会从解压后的根目录找文件，所以不要带 fonts/ 或 bg/ 前缀
      zip.addFile(fileName, new Uint8Array(data));
      return fileName;
    }
    
    // 如果没找到，至少返回文件名，防止带路径导致 App 查找彻底失败
    return key.split('/').pop()!;
  };

  const tasks: Promise<any>[] = [];

  // 1. 处理字体 (并行)
  if (config.textFont) {
    tasks.push(processResource(config.textFont, 'fonts').then(v => config.textFont = v));
  }

  // 2. 处理三个背景字段 (并行)
  if (config.bgType === 2 && config.bgStr) {
    tasks.push(processResource(config.bgStr, 'bg').then(v => config.bgStr = v));
  }
  if (config.bgTypeNight === 2 && config.bgStrNight) {
    tasks.push(processResource(config.bgStrNight, 'bg').then(v => config.bgStrNight = v));
  }
  if (config.bgTypeEInk === 2 && config.bgStrEInk) {
    tasks.push(processResource(config.bgStrEInk, 'bg').then(v => config.bgStrEInk = v));
  }

  // 并行等待所有资源处理完成
  await Promise.all(tasks);

  // 3. 清理非标准字段
  delete config.preview_url;

  // 4. 添加 JSON 配置
  zip.addFile('readConfig.json', JSON.stringify(config, null, 2));

  return new Response(zip.generate() as any, {
    headers: { 
      "Content-Type": "application/zip", 
      "Access-Control-Allow-Origin": "*",
      "Content-Disposition": `attachment; filename="theme_${id}.zip"`,
      "Cache-Control": "public, max-age=3600"
    }
  });
}

// ---------- 资源确保存储逻辑 (查重 -> 上传 -> 更新索引) ----------

/** 
 * 核心存储逻辑：计算哈希 -> 存入 R2 -> 更新 KV 索引
 * 支持去重复，如果内容一致则跳过上传
 */
async function saveAsset(
  env: Env, 
  data: Uint8Array, 
  category: string, 
  name: string, 
  contentType?: string
): Promise<string> {
  // 1. 计算 SHA-256 哈希
  const hashBuffer = await crypto.subtle.digest('SHA-256', data as any);
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const decodedName = decodeURIComponent(name).split('/').pop() || name;
  const r2Key = `uploads/${category}/${decodedName}`;

  // 2. 检查 R2 去重
  const existing = await env.ASSETS_R2.get(r2Key);
  if (existing) {
    const existingBuffer = await existing.arrayBuffer();
    const existingHashBuffer = await crypto.subtle.digest('SHA-256', existingBuffer);
    const existingHashHex = Array.from(new Uint8Array(existingHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    if (existingHashHex === hashHex) return r2Key;
  }

  // 3. 上传 R2
  await env.ASSETS_R2.put(r2Key, data, {
    httpMetadata: contentType ? { contentType } : undefined
  });

  // 4. 更新 KV 索引
  const indexData = await env.KV.get("resources-index");
  const index = indexData ? JSON.parse(indexData) : {};
  if (!index[category]) index[category] = [];
  
  const existsInIndex = index[category].some((item: any) => item.path === r2Key);
  if (!existsInIndex) {
    index[category].push({
      name: decodedName,
      path: r2Key,
      size: data.length,
      mtime: new Date().toISOString()
    });
    await env.KV.put("resources-index", JSON.stringify(index));
  }

  return r2Key;
}

export async function handleEnsureAsset(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const category = formData.get('category') as string;
  const originalName = formData.get('name') as string;

  if (!file || !category) return err("File and category are required");

  const buffer = await file.arrayBuffer();
  const path = await saveAsset(env, new Uint8Array(buffer), category, originalName, file.type);

  return new Response(JSON.stringify({ ok: true, path }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

// ---------- ZIP 资产记录与提取 ----------

export async function handleListZipAssets(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const zipPath = url.searchParams.get("path");
  if (!zipPath) return err("path is required");

  const object = await env.ASSETS_R2.get(zipPath);
  if (!object) return err("ZIP not found", 404);

  const buffer = await object.arrayBuffer();
  const unzipped = unzipSync(new Uint8Array(buffer));
  
  const assets = Object.keys(unzipped)
    .filter(name => {
      const ext = name.split('.').pop()?.toLowerCase() || '';
      return ['ttf', 'otf', 'woff', 'woff2', 'jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
    })
    .map(name => ({
      name: name.split('/').pop() || name,
      path: name,
      size: unzipped[name].length
    }));

  return new Response(JSON.stringify({ ok: true, data: assets }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

export async function handleExtractAssetFromZip(request: Request, env: Env): Promise<Response> {
  const { zipPath, internalPath, category } = await request.json() as any;
  if (!zipPath || !internalPath || !category) return err("zipPath, internalPath and category are required");

  const object = await env.ASSETS_R2.get(zipPath);
  if (!object) return err("ZIP not found", 404);

  const buffer = await object.arrayBuffer();
  const unzipped = unzipSync(new Uint8Array(buffer));
  const fileData = unzipped[internalPath];

  if (!fileData) return err("File not found in ZIP", 404);

  const ext = internalPath.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp",
    "ttf": "font/ttf", "otf": "font/otf", "woff": "font/woff", "woff2": "font/woff2"
  };

  const path = await saveAsset(env, fileData, category, internalPath, mimeTypes[ext]);

  return new Response(JSON.stringify({ ok: true, data: { path } }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

/**
 * 👑 后台高精度离线 OCR 识别与排版参数自动提取
 */
export async function handleOcr(request: Request, env: Env): Promise<Response> {
  try {
    const { path: imagePath } = await request.json() as any;
    if (!imagePath) return err("path is required");

    // 1. 从 R2 存储（本地磁盘）读取图片
    const obj = await env.ASSETS_R2.get(imagePath);
    if (!obj) return err(`Image not found: ${imagePath}`, 404);
    
    // Tesseract.js 识别需要 Buffer 或者 Uint8Array
    const imgBuffer = Buffer.from(obj.body);

    // 2. 动态导入 Node 原生模块与 tesseract.js，防止 Cloudflare Worker 构建打包期出错
    const path = await import("path");
    const fs = await import("fs-extra");
    const { createWorker } = await import("tesseract.js");

    const assetsPath = process.env.ASSETS_PATH || "./assets";
    const tessdataPath = path.resolve(assetsPath, "tessdata").replace(/\\/g, "/");
    await fs.ensureDir(tessdataPath);

    const chiSimPath = path.join(tessdataPath, "chi_sim.traineddata").replace(/\\/g, "/");
    const engPath = path.join(tessdataPath, "eng.traineddata").replace(/\\/g, "/");

    // 3. 静默安全地自动从国内极速 JSDelivr 镜像下载并永久缓存 tessdata_fast 高效率模型
    if (!(await fs.pathExists(chiSimPath)) || (await fs.stat(chiSimPath)).size < 1000000) {
      console.log("[OCR] 正在从高速镜像下载 chi_sim.traineddata (高效率 fast 版本)...");
      const res = await fetch("https://ghproxy.net/https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/chi_sim.traineddata", {
        signal: AbortSignal.timeout(60000)
      });
      if (!res.ok) throw new Error(`下载 chi_sim 训练包失败: ${res.statusText}`);
      const buf = await res.arrayBuffer();
      await fs.writeFile(chiSimPath, Buffer.from(buf));
      console.log("[OCR] chi_sim.traineddata 下载并缓存成功！");
    }

    if (!(await fs.pathExists(engPath)) || (await fs.stat(engPath)).size < 1000000) {
      console.log("[OCR] 正在从高速镜像下载 eng.traineddata (高效率 fast 版本)...");
      const res = await fetch("https://ghproxy.net/https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata", {
        signal: AbortSignal.timeout(60000)
      });
      if (!res.ok) throw new Error(`下载 eng 训练包失败: ${res.statusText}`);
      const buf = await res.arrayBuffer();
      await fs.writeFile(engPath, Buffer.from(buf));
      console.log("[OCR] eng.traineddata 下载并缓存成功！");
    }

    // 4. 创建本地 OCR Worker，实现 100% 离线识别
    console.log("[OCR] 正在创建本地高精度 OCR Worker...");
    const corePath = path.resolve(assetsPath, "ocr_core").replace(/\\/g, "/");
    await fs.ensureDir(corePath);
    
    const localCoreJs = path.join(corePath, "tesseract-core.wasm.js").replace(/\\/g, "/");
    const localCoreWasm = path.join(corePath, "tesseract-core.wasm").replace(/\\/g, "/");

    if (!(await fs.pathExists(localCoreJs)) || !(await fs.pathExists(localCoreWasm))) {
      console.log("[OCR] 正在自动配置离线 OCR 核心文件...");
      const srcJs = path.resolve("./node_modules/tesseract.js-core/tesseract-core.wasm.js").replace(/\\/g, "/");
      const srcWasm = path.resolve("./node_modules/tesseract.js-core/tesseract-core.wasm").replace(/\\/g, "/");
      if (await fs.pathExists(srcJs) && await fs.pathExists(srcWasm)) {
        await fs.copy(srcJs, localCoreJs);
        await fs.copy(srcWasm, localCoreWasm);
        console.log("[OCR] 离线 OCR 核心文件配置成功！");
      }
    }

    const worker = await (createWorker as any)("chi_sim+eng", 1, {
      langPath: tessdataPath,
      cachePath: tessdataPath,
      corePath: corePath,
      gzip: false,
    }) as any;

    console.log("[OCR] 正在识别本地图片...", imagePath);
    const { data } = (await worker.recognize(imgBuffer)) as any;
    await worker.terminate();
    console.log("[OCR] 识别完成，正在解析排版参数...");

    const lines = data.text.split("\n").map((t: string) => ({ text: t }));
    const newConfig: any = {};
    let currentSection: "main" | "title" | "header" | "footer" = "main";

    lines.forEach((line: any) => {
      const text = line.text.replace(/\s+/g, "");
      if (text.includes("正文标题")) currentSection = "title";
      else if (text.includes("页眉")) currentSection = "header";
      else if (text.includes("页脚")) currentSection = "footer";
      else if (text.includes("正文") && !text.includes("标题")) currentSection = "main";

      const findValue = () => {
        const cleanText = text.replace(/[-+]/g, "");
        const matches = cleanText.match(/\d+(\.\d+)?/);
        return (matches && matches.length > 0) ? parseFloat(matches[0]) : null;
      };

      const val = findValue();
      if (val === null || isNaN(val)) return;

      const is = (key: string) => text.includes(key);

      if (currentSection === "main") {
        if (is("字号")) newConfig.textSize = val;
        else if (is("字距")) newConfig.letterSpacing = val;
        else if (is("行距") || is("行间")) newConfig.lineSpacingExtra = val;
        else if (is("段距") || is("段间") || is("段落")) newConfig.paragraphSpacing = val;
        else if (is("上边距")) newConfig.paddingTop = val;
        else if (is("下边距")) newConfig.paddingBottom = val;
        else if (is("左边距")) newConfig.paddingLeft = val;
        else if (is("右边距")) newConfig.paddingRight = val;
      } else if (currentSection === "title") {
        if (is("字号")) newConfig.titleSize = val;
        else if (is("上边距")) newConfig.titleTopSpacing = val;
        else if (is("下边距")) newConfig.titleBottomSpacing = val;
      } else if (currentSection === "header") {
        if (is("上边距")) newConfig.headerPaddingTop = val;
        else if (is("下边距")) newConfig.headerPaddingBottom = val;
        else if (is("左边距")) newConfig.headerPaddingLeft = val;
        else if (is("右边距")) newConfig.headerPaddingRight = val;
      } else if (currentSection === "footer") {
        if (is("上边距")) newConfig.footerPaddingTop = val;
        else if (is("下边距")) newConfig.footerPaddingBottom = val;
        else if (is("左边距")) newConfig.footerPaddingLeft = val;
        else if (is("右边距")) newConfig.footerPaddingRight = val;
      }
    });

    console.log(`[OCR] 排版参数解析完成！成功提取了 ${Object.keys(newConfig).length} 项配置。`);
    return new Response(JSON.stringify({ ok: true, data: newConfig }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (e) {
    console.error("[OCR 异常]", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}


