export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL DEFAULT '',
    url         TEXT    NOT NULL,
    type        TEXT    NOT NULL CHECK(type IN ('source', 'rule')),
    enabled     INTEGER NOT NULL DEFAULT 1,
    last_synced TEXT    DEFAULT NULL,
    item_count  INTEGER DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS sources (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    book_source_url TEXT    NOT NULL,
    name            TEXT    NOT NULL DEFAULT '',
    group_name      TEXT    DEFAULT '',
    enabled         INTEGER NOT NULL DEFAULT 1,
    raw_json        TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    is_available    INTEGER NOT NULL DEFAULT 1,
    last_checked    TEXT    DEFAULT NULL,
    UNIQUE(subscription_id, book_source_url)
  )`,
  `CREATE TABLE IF NOT EXISTS rules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    name            TEXT    NOT NULL DEFAULT '',
    pattern         TEXT    NOT NULL DEFAULT '',
    replacement     TEXT    NOT NULL DEFAULT '',
    enabled         INTEGER NOT NULL DEFAULT 1,
    raw_json        TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(subscription_id, name, pattern)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_subscriptions_type    ON subscriptions(type)`,
  `CREATE INDEX IF NOT EXISTS idx_sources_subscription  ON sources(subscription_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sources_enabled       ON sources(enabled)`,
  `CREATE INDEX IF NOT EXISTS idx_rules_subscription    ON rules(subscription_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rules_enabled         ON rules(enabled)`,
  `CREATE TABLE IF NOT EXISTS passkeys (
    id          TEXT PRIMARY KEY,
    public_key  TEXT NOT NULL,
    counter     INTEGER NOT NULL DEFAULT 0,
    transports  TEXT,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `ALTER TABLE sources ADD COLUMN is_available INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE sources ADD COLUMN last_checked TEXT DEFAULT NULL`,
  `CREATE TABLE IF NOT EXISTS custom_themes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    config      TEXT    NOT NULL,
    preview_url TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  )`
];
