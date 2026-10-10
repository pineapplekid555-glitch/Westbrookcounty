// /api/staff/roster  - everyone who has logged in, with their rank.
//   GET   staff+: name, rank, last login (manager+ also see notes and the rank history).
//   POST  admin: {discordId, rank, notes}  sets a member's rank/notes. Rank changes are logged.
import { requireStaff, audit, nowSec, ID_RE, LEVEL } from "../../_lib/staffAuth.js";
import { json, readJson, clean, HttpError } from "../../_lib/common.js";

export async function onRequestGet(context) {
  const auth = await requireStaff(context);
  if (auth.response) return auth.response;
  const { DB, user } = auth;
  const manager = user.level >= LEVEL.manager;
  const rows = (await DB.prepare("SELECT * FROM staff_roster ORDER BY name COLLATE NOCASE LIMIT 500").all()).results || [];
  const out = { success: true, members: rows.map((r) => ({
    discordId: r.discord_id, name: r.name, avatar: r.avatar, rank: r.rank, lastLogin: r.last_login,
    ...(manager ? { notes: r.notes } : {})
  })) };
  if (manager) {
    const log = (await DB.prepare("SELECT * FROM staff_rank_log ORDER BY id DESC LIMIT 50").all()).results || [];
    out.history = log.map((l) => ({ name: l.name, from: l.old_rank, to: l.new_rank, by: l.by_name, at: l.at }));
  }
  return json(out);
}

export async function onRequestPost(context) {
  const auth = await requireStaff(context, LEVEL.admin);
  if (auth.response) return auth.response;
  const { DB, user } = auth;
  let body;
  try { body = await readJson(context.request, 2048); }
  catch (e) { return json({ success: false, error: e instanceof HttpError ? e.message : "Bad request." }, e.status || 400); }

  const id = String(body.discordId ?? "");
  if (!ID_RE.test(id)) return json({ success: false, error: "Bad member id." }, 400);
  const member = await DB.prepare("SELECT * FROM staff_roster WHERE discord_id = ?1").bind(id).first();
  if (!member) return json({ success: false, error: "That person has not logged in yet." }, 404);

  const rank = clean(body.rank, 40);
  const notes = clean(body.notes, 300);
  await DB.prepare("UPDATE staff_roster SET rank = ?1, notes = ?2 WHERE discord_id = ?3").bind(rank, notes, id).run();
  if (rank !== member.rank) {
    await DB.prepare(
      "INSERT INTO staff_rank_log (discord_id, name, old_rank, new_rank, by_id, by_name, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
    ).bind(id, member.name, member.rank, rank, user.id, user.name, nowSec()).run();
  }
  await audit(context.env, user, "roster.set", `${member.name}: ${member.rank || "-"} -> ${rank || "-"}`);
  return json({ success: true });
}
