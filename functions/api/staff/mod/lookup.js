// GET /api/staff/mod/lookup?q=<name or id>   -> a short list of matching players
// GET /api/staff/mod/lookup?id=<user id>     -> one full profile: stats, punishments, notes, current ban
// Any staff member can look people up.
import { requireStaff, nowSec, LEVEL } from "../../../_lib/staffAuth.js";
import { json } from "../../../_lib/common.js";
import { shapePlayer, shapeAction, isActiveBan, resolveRoblox, actLevel, touchStaff, getCatalog } from "../../../_lib/moderation.js";

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
    return json({
      success: true,
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
