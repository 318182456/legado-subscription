import { ok, err } from "../utils";
import { Env } from "../types";
import path from "path";
import fs from "fs-extra";
import { unzipSync } from "fflate";

const GITHUB_REPO = "318182456/legado-subscription"; // 请确认您的仓库地址
export async function handleGetVersion() {
  let currentVersion = "1.0.0";
  try {
    const versionPath = path.join(process.cwd(), "VERSION");
    if (await fs.pathExists(versionPath)) {
      currentVersion = (await fs.readFile(versionPath, "utf-8")).trim();
    }
  } catch (_) {}

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/VERSION?ref=main`, {
      headers: { "User-Agent": "LegadoSubscription-Updater" }
    });
    if (!res.ok) throw new Error("无法获取 GitHub 版本信息");
    const data = await res.json() as any;
    const decoded = atob(data.content.replace(/\s/g, ''));
    const latestVersion = decoded.trim();
    
    return ok({
      current: currentVersion,
      latest: latestVersion,
      hasUpdate: latestVersion !== currentVersion,
      changelog: "最新开发分支版本，包含全新的分类网页导入、后台异步测速与极速新增订阅等升级。"
    });
  } catch (e) {
    return ok({ current: currentVersion, latest: currentVersion, hasUpdate: false });
  }
}

export async function handlePerformUpdate() {
  try {
    console.log("Starting self-update...");
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/zipball/main`, {
      headers: { "User-Agent": "LegadoSubscription-Updater" }
    });
    if (!res.ok) throw new Error("下载更新包失败");
    
    const buffer = await res.arrayBuffer();
    const unzipped = unzipSync(new Uint8Array(buffer));
    
    // GitHub ZIP 的第一层通常是 "user-repo-hash/"
    const entries = Object.keys(unzipped);
    const rootDir = entries[0].split('/')[0] + '/';
    
    const projectRoot = process.cwd();
    
    for (const [name, data] of Object.entries(unzipped)) {
      if (name.endsWith('/') || !name.startsWith(rootDir)) continue;
      
      const relativePath = name.replace(rootDir, "");
      if (!relativePath) continue;
      
      const destPath = path.join(projectRoot, relativePath);
      await fs.ensureDir(path.dirname(destPath));
      await fs.writeFile(destPath, data);
    }
    
    try {
      console.log("Compiling frontend assets...");
      const { execSync } = await import("child_process");
      execSync("npm run build", { cwd: projectRoot });
      console.log("Frontend assets compiled successfully!");
    } catch (buildErr) {
      console.error("Frontend build failed:", buildErr);
    }
    
    console.log("Update applied successfully. Restarting...");
    
    // 延迟退出，确保响应能发出
    setTimeout(() => {
      process.exit(0); 
    }, 1000);
    
    return ok({ message: "更新已应用，系统正在重启..." });
  } catch (e) {
    console.error("Update failed:", e);
    return err(`更新失败: ${(e as Error).message}`);
  }
}
