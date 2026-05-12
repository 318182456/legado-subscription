import type {
  KVNamespace,
  D1Database,
  R2Bucket,
} from "@cloudflare/workers-types";

// ─── 环境绑定 ────────────────────────────────────────────────────
export interface Env {
  /** KV: 订阅输出缓存 */
  KV: KVNamespace;
  /** D1: 持久化存储 */
  DB: D1Database;
  /** 管理 API 鉴权密钥（备用） */
  API_SECRET: string;
  /** 管理员密码（首次登录用） */
  ADMIN_PASSWORD?: string;
  /** R2: 静态资源存储 */
  ASSETS_R2: R2Bucket;
}

// KV 缓存 TTL（秒）
export const CACHE_TTL = 3600; // 1 小时
