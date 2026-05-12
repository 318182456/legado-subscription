import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// 配置：请根据实际路径调整
const SRC_ROOT = 'c:\\Users\\admin\\Downloads\\开源阅读（含墨辰整理书源大全6.5版）';
const BUCKET_NAME = 'legado-assets';

const CONFIG = [
  { dir: '阅读字体合集', r2Prefix: 'fonts', extensions: ['.ttf', '.otf'] },
  { dir: '阅读主题套装', r2Prefix: 'themes', extensions: ['.json', '.txt', '.zip', '.png', '.jpg', '.jpeg'] }, 
  { dir: '阅读排版合集', r2Prefix: 'layouts', extensions: ['.json', '.txt', '.zip', '.png', '.jpg', '.jpeg'] },
  { dir: '净化规则合集', r2Prefix: 'rules', extensions: ['.json', '.txt'] },
];

async function sync() {
  console.log('🚀 开始同步资源到 R2...');
  
  // 加载现有索引以实现跳过逻辑
  const indexPath = path.join(process.cwd(), 'worker', 'resources-index.json');
  let existingItems = new Map();
  if (fs.existsSync(indexPath)) {
    try {
      const oldIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      [...oldIndex.fonts, ...oldIndex.themes, ...oldIndex.layouts, ...(oldIndex.rules || [])].forEach(item => {
        existingItems.set(item.path, item);
      });
    } catch (e) { console.warn('⚠️ 现有索引解析失败，将重新全量同步'); }
  }

  const index = { fonts: [], themes: [], layouts: [], rules: [] };

  for (const item of CONFIG) {
    const fullPath = path.join(SRC_ROOT, item.dir);
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️ 目录不存在: ${fullPath}`);
      continue;
    }

    console.log(`\n📂 正在扫描: ${item.dir}`);
    const files = getAllFiles(fullPath);

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!item.extensions.includes(ext)) continue;

      const relativePath = path.relative(fullPath, file);
      const fileName = path.basename(file);
      const r2Key = `${item.r2Prefix}/${relativePath.replace(/\\/g, '/')}`;
      
      // 跳过逻辑
      if (existingItems.has(r2Key)) {
        console.log(`⏭️ 跳过 [${item.r2Prefix}]: ${fileName} (已存在)`);
        index[item.r2Prefix].push(existingItems.get(r2Key));
        continue;
      }

      console.log(`⬆️ 上传 [${item.r2Prefix}]: ${fileName}`);
      
      try {
        // 使用字符串命令形式，确保 Windows 参数解析正确
        const cmd = `npx wrangler r2 object put "${BUCKET_NAME}/${r2Key}" --file "${file}" --remote`;
        execSync(cmd, { stdio: 'inherit' });

        index[item.r2Prefix].push({
          name: fileName.replace(ext, ''),
          path: r2Key,
          size: fs.statSync(file).size
        });
      } catch (e) {
        console.error(`❌ 上传失败: ${fileName}`);
      }
    }
  }

  // 生成并上传索引
  const indexStr = JSON.stringify(index);
  fs.writeFileSync(indexPath, indexStr);
  
  console.log(`\n📤 正在推送索引到 KV...`);
  try {
    // 使用空格替代冒号，并确保路径使用正斜杠，避开 Windows 解析问题
    const safePath = indexPath.replace(/\\/g, '/');
    const kvCmd = `npx wrangler kv key put resources-index --path "${safePath}" --binding KV --remote`;
    console.log(`执行命令: ${kvCmd}`);
    execSync(kvCmd, { stdio: 'inherit' });
    console.log('✅ KV 索引更新成功');
  } catch (e) {
    console.error('❌ KV 索引更新失败，请手动检查绑定');
  }

  console.log(`\n✅ 全部同步完成！`);
}

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, "/", file));
    }
  });

  return arrayOfFiles;
}

sync();
