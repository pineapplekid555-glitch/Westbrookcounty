// GET /api/staff/admin/overview  - admin only: is everything set up, and how much is stored.
import { requireStaff, nowSec, listFrom, LEVEL } from "../../../_lib/staffAuth.js";
import { json } from "../../../_lib/common.js";

const count = async (DB, table, where = "", ...binds) => {
  try { return Number((await DB.prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`).bind(...binds).first())?.n || 0); }
  catch { return null; }
};

export async function onRequestGet(context) {
  const auth = await requireStaff(context, LEVEL.admin);
  if (auth.response) return auth.response;
  const { DB } = auth;
  const env = context.env;
  const now = nowSec();
  return json({
    success: true,
    setup: {
      database: env.STAFF_DB ? "STAFF_DB (own database)" : "SERVER_API_DB (shared - not recommended)",
      discordLogin: Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_GUILD_ID),
      staffRoles: listFrom(env.STAFF_ROLE_IDS).length,
      managerRoles: listFrom(env.MANAGER_ROLE_IDS).length,
      adminRoles: listFrom(env.ADMIN_ROLE_IDS).length,
      alwaysAdmins: listFrom(env.STAFF_ADMIN_USER_IDS).length,
      announceWebhook: Boolean(env.STAFF_ANNOUNCE_WEBHOOK || (env.DISCORD_BOT_TOKEN && env.STAFF_CHAT_CHANNEL_ID))
    },
    counts: {
      members: await count(DB, "staff_roster"),
      suspended: await count(DB, "staff_access", "WHERE suspended = 1"),
      activeSessions: await count(DB, "staff_sessions", "WHERE expires_at > ?1", now),
      loa: await count(DB, "staff_loa"),
      announcements: await count(DB, "staff_announcements"),
      strikes: await count(DB, "staff_strikes"),
      tasks: await count(DB, "staff_tasks"),
      shifts: await count(DB, "staff_duty"),
      auditEntries: await count(DB, "staff_audit")
    }
  });
}
