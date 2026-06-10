ALTER TABLE uploads ADD COLUMN folder_type TEXT NOT NULL DEFAULT 'permanent';

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'permanent',
  display_name TEXT,
  claimed_from_temp_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_uploads_folder ON uploads(user_id, folder_type);
