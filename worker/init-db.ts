import { execSync } from 'child_process';

const DB_NAME = 'legado-subscription';
const SCHEMA_FILE = 'worker/schema.sql';

function main() {
  const isLocal = process.argv.includes('--local');
  const target = isLocal ? '--local' : '--remote';
  
  console.log(`--- 检查数据库状态 (${isLocal ? '本地' : '远程'}) ---`);
  
  try {
    // 检查 subscriptions 表是否存在
    const checkResult = execSync(`npx wrangler d1 execute ${DB_NAME} ${target} --command "SELECT name FROM sqlite_master WHERE type='table' AND name='subscriptions';" --json`, { encoding: 'utf8' });
    
    // Wrangler 的输出可能包含多段 JSON 或其他信息，尝试解析最后一段有效的 JSON
    let data;
    try {
      data = JSON.parse(checkResult);
    } catch {
      // 如果解析失败，尝试按行查找 JSON 数组
      const lines = checkResult.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          data = JSON.parse(lines[i]);
          if (Array.isArray(data)) break;
        } catch {}
      }
    }
    
    const results = Array.isArray(data) ? data[0]?.results : data?.results;
    
    if (!results || results.length === 0) {
      console.log('未检测到表结构，正在执行初始化...');
      execSync(`npx wrangler d1 execute ${DB_NAME} ${target} --file=${SCHEMA_FILE} --yes`, { stdio: 'inherit' });
      console.log('数据库初始化完成。');
    } else {
      console.log('表结构已存在，跳过初始化。');
    }
  } catch (e) {
    console.error('检查或初始化数据库时出错:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

main();
