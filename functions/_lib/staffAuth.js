// Shared helpers for the staff portal (Discord login, sessions, permission levels).
//
//   staff member --"Log in with Discord"--> /api/staff/login --> Discord --> /api/staff/callback
//   callback checks the member's roles in YOUR Discord server and starts a session.
//   Every other /api/staff/* endpoint checks that session on the server before it returns anything.
//
// Nothing secret is stored in this public repo. Settings come from Cloudflare (see staff-portal/STAFF_SETUP.md).

import { safeEqual, json } from "./common.js";

export const LEVEL = { none: 0, staff: 1, manager: 2, admin: 3 };
export const LEVEL_NAME = ["none", "staff", "manager", "admin"];

export const SESSION_COOKIE = "__Host-wb_staff";
export const STATE_COOKIE = "__Host-wb_state";
export const SESSION_SECONDS = 8 * 60 * 60;

export const nowSec = () => Math.floor(Date.now() / 1000);
export const ID_RE = /^\d{15,25}$/;

export function getDB(env) {
  return env.STAFF_DB || env.SERVER_API_DB || null;
}

export function apiError(status, message) {
  return json({ success: false, error: message }, status);
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomHex(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseCookies(request) {
  const out = {};
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export const listFrom = (text) =>
  String(text || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

// Works out a member's level from their Discord role ids (and an optional list of always-admin user ids).
export function levelFor(env, userId, roleIds) {
  const roles = new Set((roleIds || []).map(String));
  const has = (list) => listFrom(list).some((id) => roles.has(id));
  if (listFrom(env.STAFF_ADMIN_USER_IDS).includes(String(userId)) || has(env.ADMIN_ROLE_IDS)) return LEVEL.admin;
  if (has(env.MANAGER_ROLE_IDS)) return LEVEL.manager;
  if (has(env.STAFF_ROLE_IDS)) return LEVEL.staff;
  return LEVEL.none;
}

export function isConfigured(env) {
  return Boolean(
    getDB(env) && env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_GUILD_ID &&
      (env.STAFF_ROLE_IDS || env.MANAGER_ROLE_IDS || env.ADMIN_ROLE_IDS || env.STAFF_ADMIN_USER_IDS)
  );
}

export async function createSession(env, user) {
  const DB = getDB(env);
  const token = randomHex(32);
  const hash = await sha256Hex(token);
  const now = nowSec();
  await DB.prepare(
    `INSERT INTO staff_sessions (token_hash, discord_id, name, avatar, level, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  ).bind(hash, user.id, user.name, user.avatar || "", user.level, now, now + SESSION_SECONDS).run();
  // housekeeping: forget sessions that ended
  await DB.prepare("DELETE FROM staff_sessions WHERE expires_at < ?1").bind(now).run();
  return token;
}

export async function audit(env, actor, action, detail = "") {
  const DB = getDB(env);
  if (!DB) return;
  try {
    await DB.prepare(
      "INSERT INTO staff_audit (at, actor_id, actor_name, action, detail) VALUES (?1, ?2, ?3, ?4, ?5)"
    ).bind(nowSec(), actor?.id || "", actor?.name || "", String(action).slice(0, 40), String(detail).slice(0, 300)).run();
  } catch {
    /* never block an action because the log failed */
  }
}

// Returns { user } for a valid session of at least `min` level, otherwise { response } to return as-is.
// A visitor without a session gets 401 and a member with too little access gets 403; neither learns anything else.
export async function requireStaff(context, min = LEVEL.staff) {
  const { request, env } = context;
  const DB = getDB(env);
  if (!DB) return { response: apiError(503, "The staff portal is not set up yet.") };

  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return { response: apiError(401, "Please log in.") };

  const row = await DB.prepare(
    "SELECT discord_id, name, avatar, level, expires_at FROM staff_sessions WHERE token_hash = ?1"
  ).bind(await sha256Hex(token)).first();
  if (!row || Number(row.expires_at) < nowSec()) return { response: apiError(401, "Please log in.") };

  const level = Number(row.level);
  if (level < min) return { response: apiError(403, "You do not have access to this.") };

  if (request.method !== "GET" && request.method !== "HEAD") {
    // Block cross-site requests: the browser sends Origin on every fetch POST, and it must be this site.
    const origin = request.headers.get("origin") || "";
    if (!safeEqual(origin, new URL(request.url).origin)) return { response: apiError(403, "Blocked: bad origin.") };
    if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
      return { response: apiError(415, "Send JSON.") };
    }
  }

  return { DB, user: { id: row.discord_id, name: row.name, avatar: row.avatar, level } };
}

export const validDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(s + "T00:00:00Z");
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? t : null;
};
