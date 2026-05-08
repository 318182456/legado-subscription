-- Legado Subscription D1 Schema
-- 书源订阅 & 净化规则订阅管理

-- 订阅源表（记录用户添加的上游 URL）
CREATE TABLE IF NOT EXISTS subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL DEFAULT '',
  url         TEXT    NOT NULL,
  type        TEXT    NOT NULL CHECK(type IN ('source', 'rule')),
  enabled     INTEGER NOT NULL DEFAULT 1,
  last_synced TEXT    DEFAULT NULL,  -- ISO8601
  item_count  INTEGER DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 书源内容表（从上游 URL 抓取后拆分存储）
CREATE TABLE IF NOT EXISTS sources (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  book_source_url TEXT    NOT NULL,  -- bookSourceUrl 字段，作为唯一标识
  name            TEXT    NOT NULL DEFAULT '',
  group_name      TEXT    DEFAULT '',
  enabled         INTEGER NOT NULL DEFAULT 1,
  raw_json        TEXT    NOT NULL,  -- 单条书源的原始 JSON
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(subscription_id, book_source_url)
);

-- 净化规则内容表（从上游 URL 抓取后存储）
CREATE TABLE IF NOT EXISTS rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  name            TEXT    NOT NULL DEFAULT '',
  pattern         TEXT    NOT NULL DEFAULT '',
  replacement     TEXT    NOT NULL DEFAULT '',
  enabled         INTEGER NOT NULL DEFAULT 1,
  raw_json        TEXT    NOT NULL,  -- 单条规则原始 JSON
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(subscription_id, name, pattern)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_subscriptions_type    ON subscriptions(type);
CREATE INDEX IF NOT EXISTS idx_sources_subscription  ON sources(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sources_enabled       ON sources(enabled);
CREATE INDEX IF NOT EXISTS idx_rules_subscription    ON rules(subscription_id);
CREATE INDEX IF NOT EXISTS idx_rules_enabled         ON rules(enabled);

-- Passkey 凭证表
CREATE TABLE IF NOT EXISTS passkeys (
  id          TEXT PRIMARY KEY,  -- Credential ID (base64url)
  public_key  TEXT NOT NULL,      -- Public Key (base64url)
  counter     INTEGER NOT NULL DEFAULT 0,
  transports  TEXT,               -- JSON array
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
