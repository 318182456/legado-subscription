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

export async function handleExportCustomTheme(id: number, env: Env): Promise<Response> {
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

  // 1. 处理字体
  if (config.textFont) {
    config.textFont = await processResource(config.textFont, 'fonts');
  }

  // 2. 处理三个背景字段 (只有在 bgType 为 2 时处理图片)
  const bgFields = ['bgStr', 'bgStrNight', 'bgStrEInk'];
  for (const field of bgFields) {
    if (config.bgType === 2 && config[field]) {
      config[field] = await processResource(config[field], 'bg');
    }
  }

  // 3. 添加 JSON 配置 (确保在文件最后添加，以便拿到更新后的 config)
  zip.addFile('readConfig.json', JSON.stringify(config, null, 2));

  return new Response(zip.generate(), {
    headers: { 
      "Content-Type": "application/zip", 
      "Access-Control-Allow-Origin": "*",
      "Content-Disposition": `attachment; filename="theme_${id}.zip"`
    }
  });
}
