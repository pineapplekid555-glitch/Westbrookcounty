// GET /api/staff/mod/feed?view=auto|bans|actions|queue   (any staff member can read)
//   auto     anti-cheat bans, newest first, with the AI's second opinion and whether staff have reviewed them
//   bans     everyone who is banned right now
//   actions  every moderation action (bans, unbans, kicks, warnings, notes)
//   queue    commands sent from the website to the game and whether the game carried them out
import { requireStaff, nowSec, LEVEL } from "../../../_lib/staffAuth.js";
import { json } from "../../../_lib/common.js";
import { shapeAction, actLevel } from "../../../_lib/moderation.js";

export async function onRequestGet(context) {
  const auth = await requireStaff(context, LEVEL.staff);
  if (auth.response) return auth.response;
  const { DB, user } = auth;
  const view = new URL(context.request.url).searchParams.get("view") || "auto";
  const now = nowSec();
  const canAct = user.level >= actLevel(context.env);
  const q = async (sql, ...b) => (await DB.prepare(sql).bind(...b).all()).results || [];

  if (view === "queue") {
    const rows = await q("SELECT * FROM mod_queue ORDER BY id DESC LIMIT 60");
    return json({ success: true, canAct, queue: rows.map((r) => ({
      id: r.id, type: r.type, userId: r.user_id, username: r.username, reason: r.reason, by: r.created_by_name,
      at: r.created_at, status: r.status, result: r.result
    })) });
  }
  let rows;
  if (view === "bans") rows = await q("SELECT * FROM mod_actions WHERE type = 'ban' AND active = 1 AND (expires_at IS NULL OR expires_at > ?1) ORDER BY id DESC LIMIT 300", now);
  else if (view === "actions") rows = await q("SELECT * FROM mod_actions ORDER BY id DESC LIMIT 150");
  else rows = await q("SELECT * FROM mod_actions WHERE type = 'ban' AND source = 'auto' ORDER BY id DESC LIMIT 100");
  return json({ success: true, canAct, actions: rows.map((r) => shapeAction(r, now)) });
}
