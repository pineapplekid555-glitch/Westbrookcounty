// /api/staff/admin/members  - admin only: manage who can use the portal.
//   GET   everyone who has logged in, with level, status, active sessions and strikes.
//   POST  {action:"suspend", discordId, reason}   blocks login and ends their sessions (Discord roles are untouched)
//         {action:"unsuspend", discordId}
//         {action:"logout", discordId}            ends their sessions (they can log in again)
// You cannot suspend yourself or anyone listed in STAFF_ADMIN_USER_IDS, so you can never lock yourself out.
import { requireStaff, audit, nowSec, ID_RE, LEVEL, LEVEL_NAME, listFrom, readBody } from "../../../_lib/staffAuth.js";
import { json, clean } from "../../../_lib/common.js";

export async function onRequestGet(context) {
  const auth = await requireStaff(context, LEVEL.admin);
  if (auth.response) return auth.response;
  const now = nowSec();
  const rows = (await auth.DB.prepare(
    `SELECT r.discord_id, r.name, r.avatar, r.rank, r.last_login,
            COALESCE(a.level, 1) AS level, COALESCE(a.suspended, 0) AS suspended, COALESCE(a.suspended_reason, '') AS reason,
            (SELECT COUNT(*) FROM staff_sessions s WHERE s.discord_id = r.discord_id AND s.expires_at > ?1) AS sessions,
            (SELECT COUNT(*) FROM staff_strikes k WHERE k.discord_id = r.discord_id AND k.revoked = 0 AND (k.expires_at IS NULL OR k.expires_at > ?1)) AS strikes
       FROM staff_roster r LEFT JOIN staff_access a ON a.discord_id = r.discord_id
      ORDER BY r.name COLLATE NOCASE LIMIT 500`
  ).bind(now).all()).results || [];
  const protectedIds = listFrom(context.env.STAFF_ADMIN_USER_IDS);
  return json({
    success: true,
    members: rows.map((r) => ({
      discordId: r.discord_id, name: r.name, avatar: r.avatar, rank: r.rank, lastLogin: r.last_login,
      level: LEVEL_NAME[Number(r.level)] || "staff", suspended: Number(r.suspended) === 1, reason: r.reason,
      sessions: Number(r.sessions), strikes: Number(r.strikes), protected: protectedIds.includes(r.discord_id)
    }))
  });
}

export async function onRequestPost(context) {
  const auth = await requireStaff(context, LEVEL.admin);
  if (auth.response) return auth.response;
  const { DB, user } = auth;
  const parsed = await readBody(context, 2048);
  if (parsed.response) return parsed.response;
  const action = String(parsed.body.action || "");
  const id = String(parsed.body.discordId ?? "");
  if (!ID_RE.test(id)) return json({ success: false, error: "Bad member id." }, 400);
  const member = await DB.prepare("SELECT name FROM staff_roster WHERE discord_id = ?1").bind(id).first();
  if (!member) return json({ success: false, error: "Unknown member." }, 404);

  if (action === "suspend") {
    if (id === user.id || listFrom(context.env.STAFF_ADMIN_USER_IDS).includes(id)) {
      return json({ success: false, error: "You cannot suspend yourself or a protected admin." }, 403);
    }
    await DB.prepare(
      `INSERT INTO staff_access (discord_id, level, suspended, suspended_reason, suspended_by, suspended_at) VALUES (?1, 1, 1, ?2, ?3, ?4)
       ON CONFLICT(discord_id) DO UPDATE SET suspended = 1, suspended_reason = excluded.suspended_reason, suspended_by = excluded.suspended_by, suspended_at = excluded.suspended_at`
    ).bind(id, clean(parsed.body.reason, 200), user.name, nowSec()).run();
    await DB.prepare("DELETE FROM staff_sessions WHERE discord_id = ?1").bind(id).run();
    await DB.prepare("UPDATE staff_duty SET end_at = start_at WHERE discord_id = ?1 AND end_at IS NULL").bind(id).run();
    await audit(context.env, user, "admin.suspend", member.name);
    return json({ success: true });
  }
  if (action === "unsuspend") {
    await DB.prepare("UPDATE staff_access SET suspended = 0, suspended_reason = '', suspended_by = '', suspended_at = NULL WHERE discord_id = ?1").bind(id).run();
    await audit(context.env, user, "admin.unsuspend", member.name);
    return json({ success: true });
  }
  if (action === "logout") {
    await DB.prepare("DELETE FROM staff_sessions WHERE discord_id = ?1").bind(id).run();
    await audit(context.env, user, "admin.logout", member.name);
    return json({ success: true });
  }
  return json({ success: false, error: "Unknown action." }, 400);
}
