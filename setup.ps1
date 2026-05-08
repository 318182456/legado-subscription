# Legado Subscription 自动化部署脚本 (PowerShell)
# 1. 检查/创建 D1 数据库
# 2. 检查/创建 KV 命名空间
# 3. 自动更新 wrangler.toml 中的 ID
# 4. 执行 D1 数据库初始化
# 5. 执行部署

$ErrorActionPreference = "Stop"

Write-Host "--- 正在检查 Cloudflare 环境 ---" -ForegroundColor Cyan

# 1. 创建 D1 数据库
Write-Host "正在获取/创建 D1 数据库..." -ForegroundColor Gray
$d1Name = "legado-subscription"
$d1Info = npx wrangler d1 list --json | ConvertFrom-Json | Where-Object { $_.name -eq $d1Name }

if ($null -eq $d1Info) {
    Write-Host "未找到数据库，正在创建..." -ForegroundColor Yellow
    $d1Info = npx wrangler d1 create $d1Name --json | ConvertFrom-Json
}

$d1Id = $d1Info.uuid
Write-Host "D1 ID: $d1Id" -ForegroundColor Green

# 2. 创建 KV 命名空间
Write-Host "正在获取/创建 KV 命名空间..." -ForegroundColor Gray
$kvName = "LEGADO_CACHE"
$kvList = npx wrangler kv namespace list --json | ConvertFrom-Json
$kvInfo = $kvList | Where-Object { $_.title -match $kvName }

if ($null -eq $kvInfo) {
    Write-Host "未找到 KV 空间，正在创建..." -ForegroundColor Yellow
    $kvInfo = npx wrangler kv namespace create $kvName --json | ConvertFrom-Json
}

$kvId = $kvInfo.id
Write-Host "KV ID: $kvId" -ForegroundColor Green

# 3. 更新 wrangler.toml
Write-Host "正在更新 wrangler.toml..." -ForegroundColor Gray
$tomlPath = "wrangler.toml"
$tomlContent = Get-Content $tomlPath -Raw

# 替换 D1 ID
$tomlContent = $tomlContent -replace 'database_id = ".*"', "database_id = `"$d1Id`""
# 替换 KV ID (处理 binding = "LEGADO_CACHE" 下方的 id)
$tomlContent = $tomlContent -replace '(?s)(binding = "LEGADO_CACHE".*?id = ").*?"', "`${1}$kvId`""

Set-Content $tomlPath $tomlContent
Write-Host "wrangler.toml 更新完成。" -ForegroundColor Green

# 4. 初始化数据库
Write-Host "正在初始化 D1 数据库结构..." -ForegroundColor Gray
npx wrangler d1 execute $d1Name --file=worker/schema.sql --remote --yes

# 5. 编译前端并部署
Write-Host "正在编译前端并部署到 Cloudflare..." -ForegroundColor Cyan
npm run build
npx wrangler deploy

Write-Host "`n--- 部署完成！ ---" -ForegroundColor Green
Write-Host "访问您的 Worker 域名即可进入后台。"
Write-Host "首次登录默认密码为: admin888 (请在 .dev.vars 或 Cloudflare Secret 中设置 ADMIN_PASSWORD 修改)"
