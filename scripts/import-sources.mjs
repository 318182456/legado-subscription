import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const JSON_PATH = 'c:\\Users\\admin\\Downloads\\开源阅读（含墨辰整理书源大全6.5版）\\阅读书源合集【已更新6.5版！】\\本地导入书源【更新6.5版】\\墨辰整理书源大全6.5（禁止倒卖）.json';
const DB_NAME = 'legado-subscription';

async function main() {
  console.log('📖 正在解析本地书源 JSON...');
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
  
  // 1. 创建或获取一个特殊的本地订阅 ID
  console.log('创建本地归属订阅...');
  const initSql = `INSERT OR IGNORE INTO subscriptions (id, name, url, type, enabled) VALUES (999, '墨辰 6.5 本地合集', 'local://mochen65', 'source', 1);`;
  fs.writeFileSync('temp_init.sql', initSql);
  execSync(`npx wrangler d1 execute ${DB_NAME} --file=temp_init.sql --remote`, { stdio: 'inherit' });

  // 2. 分批生成 SQL
  console.log(`开始处理 ${data.length} 个书源...`);
  const batchSize = 40;
  for (let i = 0; i < data.length; i += batchSize) {
    const chunk = data.slice(i, i + batchSize);
    let sql = "INSERT INTO sources (subscription_id, book_source_url, name, group_name, raw_json, updated_at) VALUES \n";
    
    const valueRows = chunk.map(item => {
      const url = (item.bookSourceUrl || item.sourceUrl || "").replace(/'/g, "''");
      const name = (item.bookSourceName || item.name || "未知").replace(/'/g, "''");
      const group = (item.bookSourceGroup || item.group || "").replace(/'/g, "''");
      const rawJson = JSON.stringify(item).replace(/'/g, "''");
      return `(999, '${url}', '${name}', '${group}', '${rawJson}', datetime('now'))`;
    });

    sql += valueRows.join(",\n");
    sql += ` ON CONFLICT(subscription_id, book_source_url) DO UPDATE SET name=excluded.name, group_name=excluded.group_name, raw_json=excluded.raw_json, updated_at=excluded.updated_at;`;

    fs.writeFileSync('temp_batch.sql', sql);
    console.log(`正在导入批次 ${Math.floor(i/batchSize) + 1}...`);
    execSync(`npx wrangler d1 execute ${DB_NAME} --file=temp_batch.sql --remote`, { stdio: 'inherit' });
  }

  // 3. 清理并重建缓存
  console.log('🧹 清理临时文件并通知 Worker 重建缓存...');
  fs.unlinkSync('temp_init.sql');
  fs.unlinkSync('temp_batch.sql');
  
  console.log('\n✨ 书源导入完成！请在 Worker 页面点击“同步”或等待缓存自动刷新。');
}

main().catch(console.error);
