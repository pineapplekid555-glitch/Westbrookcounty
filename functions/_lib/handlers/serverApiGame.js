import { json, checkAuth, readJson, clean, HttpError } from "../common.js";
import {
  HASH_RE, SERVER_ID_RE, TOPIC_RE, MAX_LOGS_PER_SERVER, ACTIVE_WINDOW, FAST_POLL, IDLE_POLL, nowSec
} from "../serverApi.js";

// POST /api/p/server-api/<PRIVATE_API_PATH>   (also /api/server-api while PRIVATE_API_PATH is unset)
// Called ONLY by the Roblox game servers (Authorization: Bearer ROBLOX_API_KEY).
//   { action: "register", privateServerId, keyHash, topic, ownerId?, ownerName?, serverName? }
//   { action: "revoke",   privateServerId, keyHash }
//   { action: "report",   privateServerId, keyHash, snapshot: { ts, server, players }, logs: [...] }

const LOG_TYPES = new Set(["join", "leave", "team", "command"]);

function int(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function cleanSnapshot(snapshot) {
  const s = snapshot && typeof snapshot === "object" ? snapshot : {};
  const server = s.server && typeof s.server === "object" ? s.server : {};
  const balance = {};
  if (server.teamBalance && typeof server.teamBalance === "object" && !Array.isArray(server.teamBalance)) {
    for (const [team, count] of Object.entries(server.teamBalance).slice(0, 20)) {
      balance[clean(team, 40)] = Math.max(0, int(count));
    }
  }
  const players = (Array.isArray(s.players) ? s.players : []).slice(0, 100).map((p) => ({
    name: clean(p?.name, 40),
    displayName: clean(p?.displayName, 60),
    userId: int(p?.userId),
    team: clean(p?.team, 40) || "None",
    permission: clean(p?.permission, 24) || "Normal"
  }));
  return {
    server: {
      name: clean(server.name, 60),
      ownerId: int(server.ownerId),
      ownerName: clean(server.ownerName, 40),
      coOwnerIds: (Array.isArray(server.coOwnerIds) ? server.coOwnerIds : []).slice(0, 20).map((n) => int(n)),
      currentPlayers: Math.max(0, int(server.currentPlayers)),
      maxPlayers: Math.max(0, int(server.maxPlayers)),
      joinKey: clean(server.joinKey, 24),
      teamBalance: balance
    },
    players
  };
}

function cleanLog(entry, now) {
  const type = clean(entry?.type, 12);
  if (!LOG_TYPES.has(type)) return null;
  let ts = int(entry?.ts, now);
  if (ts < now - 86400 || ts > now + 600) ts = now;
  const data = {
    name: clean(entry?.name, 40),
    userId: int(entry?.userId)
  };
  if (type === "team") data.team = clean(entry?.team, 40);
  if (type === "command") {
    data.by = clean(entry?.by, 12) || "api";
    data.cmd = clean(entry?.cmd, 30);
    data.args = clean(entry?.args, 120);
    data.ok = entry?.ok === true;
    data.result = clean(entry?.result, 160);
    delete data.name;
    delete data.userId;
  }
  return { ts, type, data: JSON.stringify(data) };
}

export async function handle(context) {
  const denied = checkAuth(context.request, context.env);
  if (denied) return denied;

  const DB = context.env.SERVER_API_DB;
  if (!DB) return json({ success: false, error: "not_configured" }, 503);

  let body;
  try {
    body = await readJson(context.request, 65536);
  } catch (e) {
    if (e instanceof HttpError) return json({ success: false, error: e.message }, e.status);
    return json({ success: false, error: "Bad request." }, 400);
  }

  const action = clean(body.action, 12);
  const psid = clean(body.privateServerId, 64);
  const keyHash = clean(body.keyHash, 64).toLowerCase();
  if (!SERVER_ID_RE.test(psid)) return json({ success: false, error: "bad_server_id" }, 400);
  if (!HASH_RE.test(keyHash)) return json({ success: false, error: "bad_key_hash" }, 400);
  const now = nowSec();

  if (action === "register") {
    const topic = clean(body.topic, 80);
    if (!TOPIC_RE.test(topic)) return json({ success: false, error: "bad_topic" }, 400);
    try {
      await DB.batch([
        DB.prepare(
          `INSERT INTO server_api_keys (private_server_id, key_hash, topic, owner_id, owner_name, server_name, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(private_server_id) DO UPDATE SET
             key_hash = excluded.key_hash, topic = excluded.topic, owner_id = excluded.owner_id,
             owner_name = excluded.owner_name, server_name = excluded.server_name, created_at = excluded.created_at`
        ).bind(psid, keyHash, topic, int(body.ownerId), clean(body.ownerName, 40), clean(body.serverName, 60), now),
        // a new key starts with a clean slate: no stale snapshot that the old key's owner could have read
        DB.prepare("DELETE FROM server_api_state WHERE private_server_id = ?1").bind(psid)
      ]);
    } catch {
      return json({ success: false, error: "db_error" }, 500);
    }
    return json({ success: true });
  }

  if (action === "revoke") {
    try {
      const res = await DB.prepare("DELETE FROM server_api_keys WHERE private_server_id = ?1 AND key_hash = ?2")
        .bind(psid, keyHash).run();
      if ((res.meta?.changes ?? 0) > 0) {
        await DB.batch([
          DB.prepare("DELETE FROM server_api_state WHERE private_server_id = ?1").bind(psid),
          DB.prepare("DELETE FROM server_api_logs WHERE private_server_id = ?1").bind(psid)
        ]);
      }
    } catch {
      return json({ success: false, error: "db_error" }, 500);
    }
    return json({ success: true });
  }

  if (action === "report") {
    let keyRow;
    try {
      keyRow = await DB.prepare("SELECT key_hash FROM server_api_keys WHERE private_server_id = ?1").bind(psid).first();
    } catch {
      return json({ success: false, error: "db_error" }, 500);
    }
    if (!keyRow || keyRow.key_hash !== keyHash) {
      // unknown to the website (or an older key): the game answers by registering its stored hash again
      return json({ success: false, error: "unregistered" }, 409);
    }

    const snapshot = cleanSnapshot(body.snapshot);
    snapshot.ts = now;
    const logs = (Array.isArray(body.logs) ? body.logs : []).slice(0, 60).map((l) => cleanLog(l, now)).filter(Boolean);

    const statements = [
      DB.prepare(
        `INSERT INTO server_api_state (private_server_id, snapshot, updated_at, last_read_at)
         VALUES (?1, ?2, ?3, 0)
         ON CONFLICT(private_server_id) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at
         RETURNING last_read_at`
      ).bind(psid, JSON.stringify(snapshot), now)
    ];
    for (const l of logs) {
      statements.push(
        DB.prepare("INSERT INTO server_api_logs (private_server_id, ts, type, data) VALUES (?1, ?2, ?3, ?4)")
          .bind(psid, l.ts, l.type, l.data)
      );
    }
    if (logs.length) {
      statements.push(
        DB.prepare(
          `DELETE FROM server_api_logs WHERE private_server_id = ?1 AND id <= (
             SELECT id FROM server_api_logs WHERE private_server_id = ?1 ORDER BY id DESC LIMIT 1 OFFSET ?2)`
        ).bind(psid, MAX_LOGS_PER_SERVER)
      );
    }

    let results;
    try {
      results = await DB.batch(statements);
    } catch {
      return json({ success: false, error: "db_error" }, 500);
    }
    const lastRead = Number(results?.[0]?.results?.[0]?.last_read_at || 0);
    const pollSeconds = now - lastRead < ACTIVE_WINDOW ? FAST_POLL : IDLE_POLL;
    return json({ success: true, pollSeconds });
  }

  return json({ success: false, error: "unknown_action" }, 400);
}
