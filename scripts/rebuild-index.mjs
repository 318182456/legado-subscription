/**
 * rebuild-index.mjs
 * 仅重建 KV 索引，不上传任何文件。
 * 用于：R2 已有文件但 KV 索引丢失的情况。
 * 运行: node scripts/rebuild-index.mjs
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const SRC_ROOT = 'c:\\Users\\admin\\Downloads\\开源阅读（含墨辰整理书源大全6.5版）';

const CONFIG = [
  { dir: '阅读字体合集',   r2Prefix: 'fonts',   extensions: ['.ttf', '.otf'] },
  { dir: '阅读主题套装',   r2Prefix: 'themes',  extensions: ['.json', '.txt', '.zip', '.png', '.jpg', '.jpeg'] },
  { dir: '阅读排版合集',   r2Prefix: 'layouts', extensions: ['.json', '.txt', '.zip', '.png', '.jpg', '.jpeg'] },
  { dir: '净化规则合集',   r2Prefix: 'rules',   extensions: ['.json', '.txt'] },
  { dir: '阅读发现合集',   r2Prefix: 'rss',     extensions: ['.json', '.txt'] },
];

function getAllFiles(dirPath, arr = []) {
  fs.readdirSync(dirPath).forEach(file => {
    const full = path.join(dirPath, file);
    fs.statSync(full).isDirectory() ? getAllFiles(full, arr) : arr.push(full);
  });
  return arr;
}

async function rebuildIndex() {
  console.log('🔧 开始重建 KV 索引（不上传文件）...\n');

  if (!fs.existsSync(SRC_ROOT)) {
    console.error(`❌ 源根目录不存在: ${SRC_ROOT}`);
    process.exit(1);
  }

  const index = { fonts: [], themes: [], layouts: [], rules: [], rss: [] };
  let total = 0;

  for (const item of CONFIG) {
    const fullPath = path.join(SRC_ROOT, item.dir);
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️  目录不存在，跳过: ${item.dir}`);
      continue;
    }

    const files = getAllFiles(fullPath);
    let count = 0;

    files.forEach(file => {
      const ext = path.extname(file).toLowerCase();
      if (!item.extensions.includes(ext)) return;

      const relativePath = path.relative(fullPath, file);
      const fileName = path.basename(file);
      const r2Key = `${item.r2Prefix}/${relativePath.replace(/\\/g, '/')}`;

      index[item.r2Prefix].push({
        name: fileName.replace(ext, ''),
        path: r2Key,
        size: fs.statSync(file).size,
      });
      count++;
      total++;
    });

    console.log(`📂 ${item.dir}: ${count} 个文件`);
  }

  console.log(`\n📊 索引汇总: 共 ${total} 个资源`);
  Object.entries(index).forEach(([cat, items]) => {
    if (items.length) console.log(`   ${cat}: ${items.length} 个`);
  });

  // 保存本地索引
  const indexPath = path.join(process.cwd(), 'worker', 'resources-index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`\n💾 已写入本地: ${indexPath}`);

  // 推送到 KV
  console.log('📤 正在推送索引到 Cloudflare KV...');
  try {
    const safeIndexPath = indexPath.replace(/\\/g, '/');
    execSync(
      `npx wrangler kv key put "resources-index" --path "${safeIndexPath}" --binding KV --remote`,
      { stdio: 'inherit' }
    );
    console.log('\n✅ KV 索引重建完成！订阅中心现在应该可以看到所有资源了。');
  } catch (e) {
    console.error('\n❌ KV 推送失败，请手动执行:');
    console.error(`npx wrangler kv key put "resources-index" --path "worker/resources-index.json" --binding KV --remote`);
  }
}

rebuildIndex();
