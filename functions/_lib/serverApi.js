// Shared helpers for the per-server API ("Server API" Server Pack).
//
//   game server  --(hidden URL, Bearer ROBLOX_API_KEY)-->  /api/p/server-api/<PRIVATE_API_PATH>
//        register a key hash / revoke it / report a snapshot + logs   (functions/_lib/handlers/serverApiGame.js)
//
//   owner's bot  --(server-key header)-->  /api/v1/server, /players, /logs, /command
//        reads the last snapshot from D1; commands are published to the reserved server through the
//        Roblox Open Cloud MessagingService (only that one server listens to its own topic)
//
// Only the SHA-256 hash of a key is ever stored. D1 binding name: SERVER_API_DB (see SERVER_API_SETUP.md).

import { json } from "./common.js";

export const KEY_RE = /^wbk_[0-9a-f]{64}$/;
export const HASH_RE = /^[0-9a-f]{64}$/;
export const SERVER_ID_RE = /^[A-Za-z0-9_-]{3,64}$/;
export const TOPIC_RE = /^sapi_[A-Za-z0-9]{1,70}$/;

// A server that hasn't reported for this long is treated as offline (it posts at least every ~4 minutes).
export const OFFLINE_AFTER = 15 * 60;
// While somebody is actively using the API, game servers are asked to report this often (seconds).
export const FAST_POLL = 15;
export const IDLE_POLL = 60;
export const ACTIVE_WINDOW = 5 * 60;
export const MAX_LOGS_PER_SERVER = 400;

export const nowSec = () => Math.floor(Date.now() / 1000);

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ER:LC-style error body: { code, message }
export function apiError(status, code, message, headers = {}) {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers }
  });
}

export function rateLimited(retryAfter) {
  return apiError(429, 4001, "You are being rate limited.", { "retry-after": String(retryAfter) });
}

// Best-effort limiter that lives in one Cloudflare isolate (not global). It stops accidental loops
// and casual abuse; the hard limits are Cloudflare's and Roblox's own.
const buckets = new Map();
export function rateLimit(id, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(id);
  if (!b || now - b.start >= windowMs) {
    b = { start: now, count: 0 };
    buckets.set(id, b);
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        if (now - v.start >= windowMs) buckets.delete(k);
        if (buckets.size <= 4000) break;
      }
    }
  }
  b.count += 1;
  return b.count <= limit ? 0 : Math.max(1, Math.ceil((b.start + windowMs - now) / 1000));
}

// Resolves the `server-key` header to a registered server.
// Returns { keyHash, row } or { response } (an error response to return as-is).
export async function authenticate(context) {
  const { request, env } = context;
  const DB = env.SERVER_API_DB;
  if (!DB) return { response: apiError(503, 5000, "The Server API is not set up on this website yet.") };

  const key = (request.headers.get("server-key") || "").trim();
  if (!key) return { response: apiError(401, 2000, "You did not provide a server-key header.") };
  if (!KEY_RE.test(key)) return { response: apiError(403, 2002, "Invalid server-key.") };

  const keyHash = await sha256Hex(key);
  const wait = rateLimit("k:" + keyHash, 20, 10_000);
  if (wait) return { response: rateLimited(wait) };

  const row = await DB.prepare(
    `SELECT k.private_server_id AS id, k.topic AS topic, s.snapshot AS snapshot,
            s.updated_at AS updated_at, s.last_read_at AS last_read_at
       FROM server_api_keys k
       LEFT JOIN server_api_state s ON s.private_server_id = k.private_server_id
      WHERE k.key_hash = ?1`
  ).bind(keyHash).first();

  if (!row) return { response: apiError(403, 2002, "Invalid server-key.") };
  return { keyHash, row, DB };
}

// Tells the game server to report faster for a while (it learns this from the reply to its next report).
export function touchRead(context, auth) {
  const last = Number(auth.row.last_read_at || 0);
  const now = nowSec();
  if (now - last <= 60) return;
  context.waitUntil(
    auth.DB.prepare("UPDATE server_api_state SET last_read_at = ?1 WHERE private_server_id = ?2")
      .bind(now, auth.row.id).run().catch(() => {})
  );
}

export function parseSnapshot(row) {
  if (!row.snapshot || !row.updated_at) return null;
  if (nowSec() - Number(row.updated_at) > OFFLINE_AFTER) return null;
  try {
    return JSON.parse(row.snapshot);
  } catch {
    return null;
  }
}

export const offline = () =>
  apiError(422, 3002, "The server is offline (it has not reported recently). Start the server and try again.");

// Publishes one message to the reserved server's own MessagingService topic.
export async function publishToServer(env, topic, payload) {
  const key = env.ROBLOX_OPEN_CLOUD_KEY;
  if (!key) return { ok: false, status: 503, reason: "not_configured" };
  const universe = String(env.ROBLOX_UNIVERSE_ID || "10650541219");
  const message = JSON.stringify(payload);
  if (message.length > 1000) return { ok: false, status: 400, reason: "too_long" };

  let res;
  try {
    res = await fetch(`https://apis.roblox.com/cloud/v2/universes/${encodeURIComponent(universe)}:publishMessage`, {
      method: "POST",
      headers: { "x-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ topic, message })
    });
  } catch {
    return { ok: false, status: 502, reason: "unreachable" };
  }
  if (res.ok) return { ok: true };
  return { ok: false, status: res.status === 429 ? 429 : 502, reason: "roblox_" + res.status };
}

export { json };
