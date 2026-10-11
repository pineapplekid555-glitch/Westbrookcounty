// Public Roblox facts about an account (age, friends, followers...), cached for an hour in mod_state.
// Used by the Moderation page to help staff judge whether an account is a bot or an alt.
import { clean } from "./common.js";
import { nowSec } from "./staffAuth.js";
import { ensureStateTable } from "./moderation.js";

const TTL = 3600;
const get = async (url) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
};

export async function fetchRobloxInfo(userId) {
  const id = Number(userId);
  const [u, friends, followers, following, groups] = await Promise.all([
    get(`https://users.roblox.com/v1/users/${id}`),
    get(`https://friends.roblox.com/v1/users/${id}/friends/count`),
    get(`https://friends.roblox.com/v1/users/${id}/followers/count`),
    get(`https://friends.roblox.com/v1/users/${id}/followings/count`),
    get(`https://groups.roblox.com/v2/users/${id}/groups/roles`)
  ]);
  if (!u?.id && friends?.count === undefined && followers?.count === undefined) return null; // Roblox unreachable
  const created = u?.created ? Math.floor(Date.parse(u.created) / 1000) : null;
  const num = (x) => (Number.isFinite(Number(x?.count)) ? Number(x.count) : null);
  return {
    userId: id,
    username: clean(u?.name, 40),
    displayName: clean(u?.displayName, 60),
    created: Number.isFinite(created) ? created : null,
    ageDays: Number.isFinite(created) ? Math.max(0, Math.floor((nowSec() - created) / 86400)) : null,
    friends: num(friends),
    followers: num(followers),
    following: num(following),
    groups: Array.isArray(groups?.data) ? groups.data.length : null,
    hasDescription: typeof u?.description === "string" ? u.description.trim().length > 0 : null,
    robloxBanned: typeof u?.isBanned === "boolean" ? u.isBanned : null,
    verified: typeof u?.hasVerifiedBadge === "boolean" ? u.hasVerifiedBadge : null,
    fetchedAt: nowSec()
  };
}

// Cached read. force = true skips the cache. Returns null when Roblox cannot be reached and nothing is cached.
export async function getRobloxInfo(DB, userId, force = false) {
  const key = "rbx:" + Number(userId);
  let cached = null;
  try {
    await ensureStateTable(DB);
    const r = await DB.prepare("SELECT v, at FROM mod_state WHERE k = ?1").bind(key).first();
    if (r?.v) cached = JSON.parse(r.v);
    if (cached && !force && nowSec() - Number(r.at) < TTL) return cached;
  } catch { /* fall through to a live fetch */ }
  const fresh = await fetchRobloxInfo(userId);
  if (!fresh) return cached;
  try {
    await DB.prepare("INSERT INTO mod_state (k, v, at) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at").bind(key, JSON.stringify(fresh), nowSec()).run();
  } catch { /* cache only */ }
  // account age keeps growing; recompute it from the creation date when serving a cached copy
  return fresh;
}
