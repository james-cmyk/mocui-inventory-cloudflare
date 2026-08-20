-- 漠翠进销存 v2.1 增量同步表
CREATE TABLE IF NOT EXISTS sync_v2_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_v2_operations (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  mutation TEXT NOT NULL CHECK (mutation IN ('put','delete')),
  payload_json TEXT,
  base_seq INTEGER NOT NULL DEFAULT 0,
  client_time INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_v2_ops_seq ON sync_v2_operations(seq);
CREATE INDEX IF NOT EXISTS idx_sync_v2_ops_entity ON sync_v2_operations(store_name, record_id, seq);

CREATE TABLE IF NOT EXISTS sync_v2_entities (
  store_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  payload_json TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  last_seq INTEGER NOT NULL DEFAULT 0,
  device_id TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (store_name, record_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_v2_entities_seq ON sync_v2_entities(last_seq);

CREATE TABLE IF NOT EXISTS sync_v2_checkpoints (
  seq INTEGER PRIMARY KEY,
  object_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0
);
