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
  { dir: '阅读发现合集', r2Prefix: 'rss', extensions: ['.json', '.txt'] },
];

async function sync() {
  console.log('🚀 [START] 开始同步资源并重建索引...');
  
  if (!fs.existsSync(SRC_ROOT)) {
    console.error(`❌ [ERROR] 源根目录不存在: ${SRC_ROOT}`);
    process.exit(1);
  }

  const indexPath = path.join(process.cwd(), 'worker', 'resources-index.json');
  let existingR2Keys = new Set(); // R2 里已有的文件 key

  // 通过 Worker API 一次性获取 R2 完整文件清单
  console.log('☁️ 正在通过 Worker API 获取 R2 文件清单...');
  try {
    // 需要管理员 token，从环境变量或命令行参数读取
    const token = process.env.ADMIN_TOKEN || process.argv[2];
    if (!token) {
      console.warn('⚠️ 未提供 ADMIN_TOKEN，跳过 R2 清单获取');
      console.warn('   提示: node scripts/sync-assets.mjs <your-admin-token>');
    } else {
      const WORKER_URL = process.env.WORKER_URL || 'https://legado-subscription.318182456.workers.dev';
      const resp = await fetch(`${WORKER_URL}/api/r2-list`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const result = await resp.json();
        result.data.forEach(key => existingR2Keys.add(key));
        console.log(`✅ R2 已有 ${existingR2Keys.size} 个文件，将自动跳过`);
      } else {
        console.warn(`⚠️ Worker API 返回错误: ${resp.status}`);
      }
    }
  } catch (e) {
    console.warn(`⚠️ Worker API 请求失败: ${e.message}`);
  }

  const index = { fonts: [], themes: [], layouts: [], rules: [], rss: [] };
  let uploadCount = 0;
  let skipCount = 0;
  let failCount = 0;

  // 1. 预扫描所有待处理任务，计算总数
  console.log('🔍 正在预扫描目录结构...');
  const allTasks = [];
  for (const item of CONFIG) {
    const fullPath = path.join(SRC_ROOT, item.dir);
    if (fs.existsSync(fullPath)) {
      const files = getAllFiles(fullPath);
      files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (item.extensions.includes(ext)) {
          allTasks.push({ file, config: item });
        }
      });
    }
  }

  const total = allTasks.length;
  console.log(`✅ 扫描完成，共计 ${total} 个待处理资源`);

  // 2. 开始按进度执行
  for (let i = 0; i < total; i++) {
    const { file, config: item } = allTasks[i];
    const progress = `[${i + 1}/${total}]`;
    
    const ext = path.extname(file).toLowerCase();
    const relativePath = path.relative(path.join(SRC_ROOT, item.dir), file);
    const fileName = path.basename(file);
    const r2Key = `${item.r2Prefix}/${relativePath.replace(/\\/g, '/')}`;
    
    // 跳过逻辑：R2 里已有该文件则跳过，直接计入索引
    if (existingR2Keys.has(r2Key)) {
      skipCount++;
      index[item.r2Prefix].push({
        name: fileName.replace(ext, ''),
        path: r2Key,
        size: fs.statSync(file).size,
      });
      continue;
    }

    console.log(`${progress} ⬆️ 正在上传: ${item.dir} -> ${fileName}`);
    try {
      const cmd = `npx wrangler r2 object put "${BUCKET_NAME}/${r2Key}" --file "${file}" --remote`;
      execSync(cmd, { stdio: 'pipe' });

      index[item.r2Prefix].push({
        name: fileName.replace(ext, ''),
        path: r2Key,
        size: fs.statSync(file).size
      });
      uploadCount++;
    } catch (e) {
      console.error(`${progress} ❌ 上传失败: ${fileName}`);
      failCount++;
    }
  }

  // 保存本地索引文件
  const indexStr = JSON.stringify(index, null, 2);
  fs.writeFileSync(indexPath, indexStr);
  console.log(`\n💾 本地索引已更新: ${indexPath}`);
  
  // 推送索引到 KV
  console.log(`📤 正在推送索引到云端 KV...`);
  try {
    const safeIndexPath = indexPath.replace(/\\/g, '/');
    // 注意：这里的 --binding 必须匹配 wrangler.toml 中的名称 (KV)
    const kvCmd = `npx wrangler kv key put "resources-index" --path "${safeIndexPath}" --binding KV --remote`;
    execSync(kvCmd, { stdio: 'inherit' });
    console.log('✅ [SUCCESS] KV 索引同步完成');
  } catch (e) {
    console.error('❌ [ERROR] KV 索引更新失败，请手动执行命令:');
    console.error(`npx wrangler kv key put "resources-index" --path "worker/resources-index.json" --binding KV --remote`);
  }

  console.log(`\n✨ 同步任务完成！`);
  console.log(`   - 成功上传: ${uploadCount}`);
  console.log(`   - 自动跳过: ${skipCount}`);
  console.log(`   - 失败任务: ${failCount}`);
  console.log(`\n🔗 请运行 npx wrangler deploy 部署 Worker 后访问订阅中心。`);
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

sync();
