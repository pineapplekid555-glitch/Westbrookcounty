// Helpers for the moderation tools (player lookup, bans, kicks, warnings).
//
//   Roblox game --(profile / events / poll / ack, hidden private URL)--> website database
//   staff        --(Moderation page, Discord login)--> website database --(queue)--> game picks it up and does it
//
// A Roblox server can't receive web requests, so staff actions wait in a queue (mod_queue)
// and the game asks for them every few seconds.
import { clean } from "./common.js";
import { LEVEL, nowSec } from "./staffAuth.js";

export const ACTION_TYPES = ["ban", "unban", "kick", "warn", "announce"];
export const MAX_BAN_SECONDS = 365 * 86400;
export const CLAIM_TIMEOUT = 60; // a command a game server took but never confirmed is offered again after this
export const SHORT_LIVED = 10 * 60; // kicks, warnings and announcements are dropped if nobody picked them up in time
export const POLL_SECONDS = 10;

// Who may ban / unban / kick / warn. Everyone on staff can look people up.
export function actLevel(env) {
  const n = Number.parseInt(env.MOD_ACTION_LEVEL, 10);
  return n >= 1 && n <= 3 ? n : LEVEL.manager;
}

export const protectedIds = (env) =>
  String(env.MOD_PROTECTED_USER_IDS || "").split(/[\s,;]+/).filter((s) => /^\d+$/.test(s));

const int = (v, fallback = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
const seconds = (v) => {
  let n = int(v);
  if (n === null || n <= 0) return null;
  if (n > 1e12) n = Math.floor(n / 1000); // milliseconds
  return n;
};
const list = (v, max, len) => (Array.isArray(v) ? v : []).slice(0, max).map((x) => clean(typeof x === "object" && x ? x.name ?? x.Name : x, len)).filter(Boolean);

// "Anything else" the game wants to show: label -> text | number | list | small group of labels.
export function cleanExtra(value, depth = 0) {
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return clean(value, 200);
  if (depth >= 2) return "";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => cleanExtra(v, depth + 1)).filter((v) => v !== "");
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 40)) {
      const key = clean(k, 40);
      const val = cleanExtra(v, depth + 1);
      if (key && val !== "") out[key] = val;
    }
    return out;
  }
  return "";
}

export function cleanProfile(p) {
  const x = p && typeof p === "object" ? p : {};
  const xp = x.xp && typeof x.xp === "object" ? x.xp : {};
  const xpNum = (v) => { const n = int(v); return n === null ? null : Math.max(0, n); };
  return {
    userId: int(x.userId, 0),
    username: clean(x.username, 40),
    displayName: clean(x.displayName, 60),
    money: int(x.money),
    xpPolice: xpNum(xp.police ?? xp.leo ?? x.xpPolice),
    xpFire: xpNum(xp.fire ?? x.xpFire),
    xpDot: xpNum(xp.dot ?? x.xpDot),
    vehicles: Array.isArray(x.vehicles) ? list(x.vehicles, 400, 60) : null, // null = not sent, keep what we have
    gamepasses: Array.isArray(x.gamepasses) ? list(x.gamepasses, 100, 80) : null,
    firstJoined: seconds(x.firstJoined),
    lastJoined: seconds(x.lastJoined),
    accountCreated: seconds(x.accountCreated),
    playtimeSecs: int(x.playtimeSeconds) === null ? null : Math.max(0, int(x.playtimeSeconds)),
    extra: x.extra && typeof x.extra === "object" ? cleanExtra(x.extra) || {} : null
  };
}

export async function savePlayer(DB, p, now = nowSec()) {
  await DB.prepare(
    `INSERT INTO mod_players (user_id, username, display_name, money, xp_police, xp_fire, xp_dot, vehicles, gamepasses, first_joined, last_joined, account_created, playtime_secs, extra, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, COALESCE(?8, '[]'), COALESCE(?9, '[]'), ?10, ?11, ?12, ?13, COALESCE(?14, '{}'), ?15)
     ON CONFLICT(user_id) DO UPDATE SET
       username = CASE WHEN excluded.username != '' THEN excluded.username ELSE mod_players.username END,
       display_name = CASE WHEN excluded.display_name != '' THEN excluded.display_name ELSE mod_players.display_name END,
       money = COALESCE(excluded.money, mod_players.money),
       xp_police = COALESCE(excluded.xp_police, mod_players.xp_police),
       xp_fire = COALESCE(excluded.xp_fire, mod_players.xp_fire),
       xp_dot = COALESCE(excluded.xp_dot, mod_players.xp_dot),
       vehicles = COALESCE(?8, mod_players.vehicles), gamepasses = COALESCE(?9, mod_players.gamepasses),
       first_joined = CASE WHEN mod_players.first_joined IS NULL OR (excluded.first_joined IS NOT NULL AND excluded.first_joined < mod_players.first_joined) THEN excluded.first_joined ELSE mod_players.first_joined END,
       last_joined = COALESCE(excluded.last_joined, mod_players.last_joined),
       account_created = COALESCE(excluded.account_created, mod_players.account_created),
       playtime_secs = COALESCE(excluded.playtime_secs, mod_players.playtime_secs),
       extra = COALESCE(?14, mod_players.extra), updated_at = excluded.updated_at`
  ).bind(
    p.userId, p.username, p.displayName, p.money, p.xpPolice, p.xpFire, p.xpDot,
    p.vehicles === null ? null : JSON.stringify(p.vehicles), p.gamepasses === null ? null : JSON.stringify(p.gamepasses),
    p.firstJoined ?? now, p.lastJoined ?? now, p.accountCreated, p.playtimeSecs, p.extra === null ? null : JSON.stringify(p.extra), now
  ).run();
}

// Just remember a name for an id (used by bans of people we have never profiled).
export async function rememberName(DB, userId, username, now = nowSec()) {
  if (!userId) return;
  await DB.prepare(
    `INSERT INTO mod_players (user_id, username, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(user_id) DO UPDATE SET username = CASE WHEN excluded.username != '' THEN excluded.username ELSE mod_players.username END`
  ).bind(userId, username || "", now).run();
}

export async function recordAction(DB, a, now = nowSec()) {
  const duration = a.durationSecs && a.durationSecs > 0 ? a.durationSecs : null;
  const active = a.type === "ban" ? 1 : 0;
  const row = await DB.prepare(
    `INSERT INTO mod_actions (user_id, username, type, reason, notes, source, by_id, by_name, duration_secs, expires_at, active, ai_verdict, ai_reason, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14) RETURNING id`
  ).bind(
    a.userId, a.username || "", a.type, a.reason || "", a.notes || "", a.source || "staff", a.byId || "", a.byName || "",
    duration, a.type === "ban" && duration ? now + duration : null, active, a.aiVerdict || "", a.aiReason || "", now
  ).first();
  if (a.type === "unban") await DB.prepare("UPDATE mod_actions SET active = 0 WHERE user_id = ?1 AND type = 'ban' AND active = 1").bind(a.userId).run();
  return row?.id;
}

export const isActiveBan = (r, now = nowSec()) =>
  r.type === "ban" && Number(r.active) === 1 && (r.expires_at === null || r.expires_at === undefined || Number(r.expires_at) > now);

export const shapeAction = (r, now = nowSec()) => ({
  id: r.id, userId: r.user_id, username: r.username, type: r.type, reason: r.reason, notes: r.notes, source: r.source,
  by: r.by_name, durationSecs: r.duration_secs, expiresAt: r.expires_at, active: isActiveBan(r, now),
  reviewed: Number(r.reviewed) === 1, reviewedBy: r.reviewed_by, aiVerdict: r.ai_verdict, aiReason: r.ai_reason, at: r.created_at
});

const parse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
export const shapePlayer = (r) => ({
  userId: r.user_id, username: r.username, displayName: r.display_name, money: r.money,
  xp: { police: r.xp_police, fire: r.xp_fire, dot: r.xp_dot },
  vehicles: parse(r.vehicles, []), gamepasses: parse(r.gamepasses, []),
  firstJoined: r.first_joined, lastJoined: r.last_joined, accountCreated: r.account_created,
  playtimeSecs: r.playtime_secs, extra: parse(r.extra, {}), updatedAt: r.updated_at
});

// Roblox's public lookup (works from Cloudflare). Returns null if Roblox can't be reached.
export async function resolveRoblox(q) {
  const s = String(q ?? "").trim();
  try {
    if (/^\d{1,15}$/.test(s)) {
      const r = await fetch(`https://users.roblox.com/v1/users/${s}`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) return null;
      const d = await r.json();
      return d?.id ? { userId: Number(d.id), username: clean(d.name, 40), displayName: clean(d.displayName, 60) } : null;
    }
    if (/^[A-Za-z0-9_]{3,20}$/.test(s)) {
      const r = await fetch("https://users.roblox.com/v1/usernames/users", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ usernames: [s], excludeBannedUsers: false }), signal: AbortSignal.timeout(4000)
      });
      if (!r.ok) return null;
      const d = (await r.json())?.data?.[0];
      return d?.id ? { userId: Number(d.id), username: clean(d.name, 40), displayName: clean(d.displayName, 60) } : null;
    }
  } catch { /* fall through */ }
  return null;
}

// Turns what a moderator typed (a user id or a username) into { userId, username }.
export async function findTarget(DB, input) {
  const s = String(input ?? "").trim();
  if (!s) return null;
  if (/^\d{1,15}$/.test(s)) {
    const id = Number(s);
    const row = await DB.prepare("SELECT username FROM mod_players WHERE user_id = ?1").bind(id).first();
    if (row?.username) return { userId: id, username: row.username };
    const r = await resolveRoblox(s);
    return { userId: id, username: r?.username || "" };
  }
  const row = await DB.prepare("SELECT user_id, username FROM mod_players WHERE username = ?1 COLLATE NOCASE").bind(s).first();
  if (row) return { userId: Number(row.user_id), username: row.username };
  const r = await resolveRoblox(s);
  return r ? { userId: r.userId, username: r.username } : null;
}
