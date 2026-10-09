CREATE TABLE IF NOT EXISTS server_api_keys (private_server_id TEXT PRIMARY KEY, key_hash TEXT NOT NULL UNIQUE, topic TEXT NOT NULL, owner_id INTEGER, owner_name TEXT, server_name TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS server_api_state (private_server_id TEXT PRIMARY KEY, snapshot TEXT NOT NULL, updated_at INTEGER NOT NULL, last_read_at INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS server_api_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, private_server_id TEXT NOT NULL, ts INTEGER NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_server_api_logs_server ON server_api_logs (private_server_id, id);
