// GET /api/staff/mod/lookup?q=<name or id>   -> a short list of matching players
// GET /api/staff/mod/lookup?id=<user id>     -> one full profile: stats, punishments, notes, current ban
// Any staff member can look people up.
import { requireStaff, nowSec, LEVEL } from "../../../_lib/staffAuth.js";
import { json } from "../../../_lib/common.js";
import { shapePlayer, shapeAction, isActiveBan, resolveRoblox, actLevel, touchStaff, getCatalog, getGroup, nameOf, hasActiveBan } from "../../../_lib/moderation.js";
import { getRobloxInfo } from "../../../_lib/robloxInfo.js";
import { readCached } from "../../../_lib/botcheck.js";
import { similarAccounts } from "./assess.js";

export async function onRequestGet(context) {
  const auth = await requireStaff(context, LEVEL.staff);
  if (auth.response) return auth.response;
  const { DB, user } = auth;
  const url = new URL(context.request.url);
  const now = nowSec();

  const id = url.searchParams.get("id");
  if (id !== null) {
    if (!/^\d{1,15}$/.test(id)) return json({ success: false, error: "Bad user id." }, 400);
    const uid = Number(id);
    await touchStaff(DB, uid, now);
    const row = await DB.prepare("SELECT * FROM mod_players WHERE user_id = ?1").bind(uid).first();
    const actions = (await DB.prepare("SELECT * FROM mod_actions WHERE user_id = ?1 ORDER BY id DESC LIMIT 200").bind(uid).all()).results || [];
    let player = row ? shapePlayer(row) : null;
    if (!player) {
      const r = actions.length ? null : await resolveRoblox(id);
      player = { userId: uid, username: actions[0]?.username || r?.username || "", displayName: r?.displayName || "", seen: false, xp: {}, vehicles: [], gamepasses: [], extra: {} };
      if (!actions.length && !r) return json({ success: false, error: "Nobody found with that id." }, 404);
    } else player.seen = true;
    const pending = (await DB.prepare("SELECT id, type, reason, created_by_name, created_at, status FROM mod_queue WHERE user_id = ?1 AND status IN ('pending','claimed') ORDER BY id DESC LIMIT 10").bind(uid).all()).results || [];
    // public Roblox facts (cached for an hour), linked accounts, similar usernames, and the last bot/alt estimate
    const roblox = await getRobloxInfo(DB, uid).catch(() => null);
    if (roblox?.created) roblox.ageDays = Math.max(0, Math.floor((now - roblox.created) / 86400));
    if (player && !player.username && roblox?.username) player.username = roblox.username;
    if (player && !player.displayName && roblox?.displayName) player.displayName = roblox.displayName;
    const group = await getGroup(DB, uid);
    const linkedIds = group.ids.filter((x) => x !== uid);
    const links = { isAlt: group.isAlt, main: null, alts: [] };
    for (const lid of linkedIds) {
      const entry = { userId: lid, username: await nameOf(DB, lid), banned: !!(await hasActiveBan(DB, lid, now)) };
      if (lid === group.main) links.main = entry; else links.alts.push(entry);
    }
    const related = (await similarAccounts(DB, uid, player?.username || roblox?.username)).filter((x) => !group.ids.includes(x.userId));
    // private servers this player owns (registered when the owner makes a Server API key) with the join code from the last report
    let servers = [];
    try {
      const SDB = context.env.SERVER_API_DB || DB;
      const rows = (await SDB.prepare(
        "SELECT k.private_server_id, k.server_name, k.created_at, s.snapshot, s.updated_at FROM server_api_keys k LEFT JOIN server_api_state s ON s.private_server_id = k.private_server_id WHERE k.owner_id = ?1 ORDER BY k.created_at DESC LIMIT 10"
      ).bind(uid).all()).results || [];
      servers = rows.map((r) => {
        let snap = null;
        try { snap = r.snapshot ? JSON.parse(r.snapshot) : null; } catch { snap = null; }
        const sv = (snap && snap.server) || {};
        return {
          id: r.private_server_id,
          name: sv.name || r.server_name || "",
          joinKey: sv.joinKey || "",
          players: sv.currentPlayers ?? null,
          maxPlayers: sv.maxPlayers ?? null,
          online: !!r.updated_at && now - r.updated_at < 300,
          updatedAt: r.updated_at || null,
          registeredAt: r.created_at
        };
      });
    } catch { servers = []; }
    return json({
      success: true,
      roblox, links, related, servers,
      assessment: await readCached(DB, uid),
      player,
      activeBan: actions.find((a) => isActiveBan(a, now)) ? shapeAction(actions.find((a) => isActiveBan(a, now)), now) : null,
      actions: actions.map((a) => shapeAction(a, now)),
      pending: pending.map((p) => ({ id: p.id, type: p.type, reason: p.reason, by: p.created_by_name, at: p.created_at, status: p.status })),
      canAct: user.level >= actLevel(context.env),
      ...(user.level >= LEVEL.admin ? { vehicleCatalog: await getCatalog(DB) } : {})
    });
  }

  await touchStaff(DB, null, now);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 40);
  if (!q) return json({ success: true, results: [] });
  let rows;
  if (/^\d{1,15}$/.test(q)) {
    rows = (await DB.prepare("SELECT user_id, username, display_name, last_joined FROM mod_players WHERE user_id = ?1").bind(Number(q)).all()).results || [];
  } else {
    const like = q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
    rows = (await DB.prepare(
      "SELECT user_id, username, display_name, last_joined FROM mod_players WHERE username LIKE ?1 ESCAPE '\\' OR display_name LIKE ?1 ESCAPE '\\' ORDER BY last_joined DESC LIMIT 15"
    ).bind(like).all()).results || [];
  }
  return json({
    success: true,
    results: rows.map((r) => ({ userId: r.user_id, username: r.username, displayName: r.display_name, lastJoined: r.last_joined })),
    canAct: user.level >= actLevel(context.env)
  });
}
