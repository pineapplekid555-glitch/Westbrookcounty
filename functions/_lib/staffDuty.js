// Duty-clock queries shared by the duty and dashboard endpoints.
import { MAX_SHIFT } from "./staffAuth.js";

// seconds worked inside [from, to), counting an unclosed shift for at most MAX_SHIFT
const HOURS_SQL = `
  SUM(MAX(0, MIN(COALESCE(end_at, MIN(?1, start_at + ${MAX_SHIFT})), ?2) - MAX(start_at, ?3)))`;

export async function weeklySeconds(DB, now, from, to, discordId) {
  const where = discordId ? "WHERE discord_id = ?4" : "";
  const sql = `SELECT discord_id, name, ${HOURS_SQL} AS secs FROM staff_duty ${where} GROUP BY discord_id, name HAVING secs > 0 ORDER BY secs DESC`;
  const binds = [now, to, from];
  if (discordId) binds.push(discordId);
  return (await DB.prepare(sql).bind(...binds).all()).results || [];
}

export async function onDutyNow(DB, now) {
  const rows = (await DB.prepare("SELECT discord_id, name, start_at FROM staff_duty WHERE end_at IS NULL AND start_at > ?1 ORDER BY start_at").bind(now - MAX_SHIFT).all()).results || [];
  return rows.map((r) => ({ discordId: r.discord_id, name: r.name, since: r.start_at }));
}

