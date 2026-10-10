// /api/staff/strikes  - warnings given to staff.
//   GET   staff: your own strikes. manager+: everyone's (add ?member=<discord id> for one person).
//   POST  manager+: {action:"issue", discordId, reason, days}   days = 0 means it never expires (max 365 otherwise)
//         manager+: {action:"revoke", id, note}
// You can only strike someone of a lower level than you (admins can strike anyone but themselves).
import { requireStaff, audit, nowSec, ID_RE, LEVEL, levelOf, readBody } from "../../_lib/staffAuth.js";
import { json, clean } from "../../_lib/common.js";

const shape = (r, now) => ({
  id: r.id, discordId: r.discord_id, name: r.name, reason: r.reason, issuedBy: r.issued_by_name, issuedAt: r.issued_at,
  expiresAt: r.expires_at, revoked: Boolean(r.revoked), revokedBy: r.revoked_by_name, revokedNote: r.revoked_note,
  active: !r.revoked && (r.expires_at === null || r.expires_at > now)
});

export async function onRequestGet(context) {
  const auth = await requireStaff(context);
  if (auth.response) return auth.response;
  const { DB, user } = auth;
  const now = nowSec();
  let sql = "SELECT * FROM staff_strikes";
  const binds = [];
  if (user.level < LEVEL.manager) { binds.push(user.id); sql += " WHERE discord_id = ?1"; }
  else {
    const m = new URL(context.request.url).searchParams.get("member");
    if (m && ID_RE.test(m)) { binds.push(m); sql += " WHERE discord_id = ?1"; }
  }
  sql += " ORDER BY id DESC LIMIT 200";
  const rows = (await DB.prepare(sql).bind(...binds).all()).results || [];
  return json({ success: true, strikes: rows.map((r) => shape(r, now)) });
}

export async function onRequestPost(context) {
  const auth = await requireStaff(context, LEVEL.manager);
  if (auth.response) return auth.response;
  const { DB, user } = auth;
  const parsed = await readBody(context, 2048);
  if (parsed.response) return parsed.response;
  const b = parsed.body;
  const action = String(b.action || "");
  const now = nowSec();

  if (action === "issue") {
    const target = String(b.discordId ?? "");
    if (!ID_RE.test(target)) return json({ success: false, error: "Pick a member." }, 400);
    if (target === user.id) return json({ success: false, error: "You cannot strike yourself." }, 403);
    const member = await DB.prepare("SELECT name FROM staff_roster WHERE discord_id = ?1").bind(target).first();
    if (!member) return json({ success: false, error: "That person has not logged in yet." }, 404);
    if (user.level < LEVEL.admin && (await levelOf(DB, target)) >= user.level) {
      return json({ success: false, error: "You can only strike people below your level." }, 403);
    }
    const reason = clean(b.reason, 400);
    if (reason.length < 3) return json({ success: false, error: "Give a reason." }, 400);
    const days = Number.parseInt(b.days ?? 90, 10);
    if (!Number.isInteger(days) || days < 0 || days > 365) return json({ success: false, error: "Days must be 0 to 365." }, 400);
    const row = await DB.prepare(
      `INSERT INTO staff_strikes (discord_id, name, reason, issued_by, issued_by_name, issued_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id`
    ).bind(target, member.name, reason, user.id, user.name, now, days === 0 ? null : now + days * 86400).first();
    await audit(context.env, user, "strike.issue", `#${row?.id} ${member.name}: ${reason}`);
    return json({ success: true, id: row?.id });
  }

  if (action === "revoke") {
    const id = Number.parseInt(b.id, 10);
    if (!Number.isInteger(id) || id < 1) return json({ success: false, error: "Bad id." }, 400);
    const s = await DB.prepare("SELECT * FROM staff_strikes WHERE id = ?1").bind(id).first();
    if (!s) return json({ success: false, error: "Not found." }, 404);
    if (s.revoked) return json({ success: false, error: "Already revoked." }, 409);
    if (s.discord_id === user.id && user.level < LEVEL.admin) return json({ success: false, error: "You cannot revoke your own strike." }, 403);
    await DB.prepare("UPDATE staff_strikes SET revoked = 1, revoked_by_name = ?1, revoked_note = ?2 WHERE id = ?3").bind(user.name, clean(b.note, 200), id).run();
    await audit(context.env, user, "strike.revoke", `#${id} ${s.name}`);
    return json({ success: true });
  }
  return json({ success: false, error: "Unknown action." }, 400);
}
