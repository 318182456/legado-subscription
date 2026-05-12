import type {
  KVNamespace,
  D1Database,
  ExecutionContext,
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

// ─── 数据类型 ────────────────────────────────────────────────────
export interface StoredPasskey {
  id: string;
  public_key: string;
  counter: number;
  transports?: string[];
  name: string;
  created_at: string;
}
export interface Subscription {
  id: number;
  name: string;
  url: string;
  type: "source" | "rule";
  enabled: number;
  last_synced: string | null;
  item_count: number;
  created_at: string;
}

export interface SourceRow {
  id: number;
  subscription_id: number;
  book_source_url: string;
  name: string;
  group_name: string;
  enabled: number;
  raw_json: string;
  updated_at: string;
}

export interface RuleRow {
  id: number;
  subscription_id: number;
  name: string;
  pattern: string;
  replacement: string;
  enabled: number;
  raw_json: string;
  updated_at: string;
}

// KV 缓存 TTL（秒）
export const CACHE_TTL = 3600; // 1 小时
