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

    // 合并所有 chunks
    const totalSize = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalSize);
    let pos = 0;
    for (const c of chunks) {
      result.set(c, pos);
      pos += c.length;
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
  
  // 处理资源文件
  if (config.textFont && (config.textFont.startsWith('fonts/') || config.textFont.startsWith('http'))) {
    const fontKey = config.textFont.startsWith('http') ? config.textFont.split('/repo/').pop() : config.textFont;
    if (fontKey) {
      const obj = await env.ASSETS_R2.get(decodeURIComponent(fontKey));
      if (obj) {
        const data = await obj.arrayBuffer();
        const fileName = fontKey.split('/').pop()!;
        zip.addFile(`fonts/${fileName}`, new Uint8Array(data));
        config.textFont = fileName; // 阅读 App 导入 ZIP 后会自动寻找 fonts/ 目录，JSON 留文件名即可
      }
    }
  }

  // 处理背景图片
  if (config.bgType === 2 && config.bgStr && (config.bgStr.startsWith('backgrounds/') || config.bgStr.startsWith('http'))) {
    const bgKey = config.bgStr.startsWith('http') ? config.bgStr.split('/repo/').pop() : config.bgStr;
    if (bgKey) {
      const obj = await env.ASSETS_R2.get(decodeURIComponent(bgKey));
      if (obj) {
        const data = await obj.arrayBuffer();
        const fileName = bgKey.split('/').pop()!;
        zip.addFile(`bg/${fileName}`, new Uint8Array(data));
        config.bgStr = fileName; // 同理，背景图放在 bg/ 目录下
      }
    }
  }

  // 添加 JSON 配置
  zip.addFile('readConfig.json', JSON.stringify(config, null, 2));

  return new Response(zip.generate(), {
    headers: { 
      "Content-Type": "application/zip", 
      "Access-Control-Allow-Origin": "*",
      "Content-Disposition": `attachment; filename="theme_${id}.zip"`
    }
  });
}
