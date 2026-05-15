import { ok, err } from "../utils";
import { Env } from "../types";
import path from "path";
import fs from "fs-extra";
import { unzipSync } from "fflate";

const GITHUB_REPO = "318182456/legado-subscription"; // 请确认您的仓库地址
const CURRENT_VERSION = "1.0.0"; // 对应 package.json

export async function handleGetVersion() {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { "User-Agent": "LegadoSubscription-Updater" }
    });
    if (!res.ok) throw new Error("无法获取 GitHub 版本信息");
    const data = await res.json() as any;
    const latestVersion = data.tag_name.replace(/^v/, "");
    
    return ok({
      current: CURRENT_VERSION,
      latest: latestVersion,
      hasUpdate: latestVersion !== CURRENT_VERSION,
      changelog: data.body
    });
  } catch (e) {
    return ok({ current: CURRENT_VERSION, latest: CURRENT_VERSION, hasUpdate: false });
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
