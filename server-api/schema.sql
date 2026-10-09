-- D1 schema for the per-server API ("Server API" Server Pack).
-- Run once in the Cloudflare dashboard: Storage & Databases > D1 > your database > Console,
-- or with:  npx wrangler d1 execute westbrook-server-api --remote --file=server-api/schema.sql
-- Safe to run again (everything is IF NOT EXISTS).

-- One row per private server that generated an API key. Only the SHA-256 hash of the key is stored.
CREATE TABLE IF NOT EXISTS server_api_keys (
  private_server_id TEXT PRIMARY KEY,
  key_hash          TEXT NOT NULL UNIQUE,
  topic             TEXT NOT NULL,
  owner_id          INTEGER,
  owner_name        TEXT,
  server_name       TEXT,
  created_at        INTEGER NOT NULL
);

-- Latest snapshot the game server reported (server info + player list).
CREATE TABLE IF NOT EXISTS server_api_state (
  private_server_id TEXT PRIMARY KEY,
  snapshot          TEXT NOT NULL,
  updated_at        INTEGER NOT NULL,
  last_read_at      INTEGER NOT NULL DEFAULT 0
);

-- Recent join / leave / team / command events (newest 400 kept per server).
CREATE TABLE IF NOT EXISTS server_api_logs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  private_server_id TEXT NOT NULL,
  ts                INTEGER NOT NULL,
  type              TEXT NOT NULL,
  data              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_server_api_logs_server ON server_api_logs (private_server_id, id);
