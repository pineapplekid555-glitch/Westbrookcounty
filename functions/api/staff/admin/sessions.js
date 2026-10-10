// /api/staff/admin/sessions  - admin only: who is logged in right now.
//   GET   active sessions
//   POST  {action:"revoke", id}   ends one session (id = the short code shown in the list)
//         {action:"revokeAll"}    ends everyone else's sessions (yours stays)
import { requireStaff, audit, nowSec, LEVEL, LEVEL_NAME, readBody } from "../../../_lib/staffAuth.js";
import { json } from "../../../_lib/common.js";

export async function onRequestGet(context) {
  const auth = await requireStaff(context, LEVEL.admin);
  if (auth.response) return auth.response;
  const rows = (await auth.DB.prepare("SELECT token_hash, discord_id, name, level, created_at, expires_at FROM staff_sessions WHERE expires_at > ?1 ORDER BY created_at DESC LIMIT 200").bind(nowSec()).all()).results || [];
  return json({
    success: true,
    sessions: rows.map((r) => ({
      id: r.token_hash.slice(0, 12), discordId: r.discord_id, name: r.name, level: LEVEL_NAME[Number(r.level)] || "staff",
      createdAt: r.created_at, expiresAt: r.expires_at, current: r.token_hash === auth.tokenHash
    }))
  });
}

export async function onRequestPost(context) {
  const auth = await requireStaff(context, LEVEL.admin);
  if (auth.response) return auth.response;
  const { DB, user, tokenHash } = auth;
  const parsed = await readBody(context, 1024);
  if (parsed.response) return parsed.response;
  const action = String(parsed.body.action || "");

  if (action === "revoke") {
    const id = String(parsed.body.id ?? "");
    if (!/^[0-9a-f]{12}$/.test(id)) return json({ success: false, error: "Bad session id." }, 400);
    await DB.prepare("DELETE FROM staff_sessions WHERE substr(token_hash, 1, 12) = ?1 AND token_hash != ?2").bind(id, tokenHash).run();
    await audit(context.env, user, "admin.revoke_session", id);
    return json({ success: true });
  }
  if (action === "revokeAll") {
    await DB.prepare("DELETE FROM staff_sessions WHERE token_hash != ?1").bind(tokenHash).run();
    await audit(context.env, user, "admin.revoke_all");
    return json({ success: true });
  }
  return json({ success: false, error: "Unknown action." }, 400);
}
