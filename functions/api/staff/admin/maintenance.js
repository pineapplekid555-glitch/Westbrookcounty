// POST /api/staff/admin/maintenance  - admin only: tidy old data.
//   {action:"purge", what:"audit"|"loa"|"duty"|"tasks", olderThanDays}   (at least 30 days)
import { requireStaff, audit, nowSec, LEVEL, readBody } from "../../../_lib/staffAuth.js";
import { json } from "../../../_lib/common.js";

export async function onRequestPost(context) {
  const auth = await requireStaff(context, LEVEL.admin);
  if (auth.response) return auth.response;
  const parsed = await readBody(context, 1024);
  if (parsed.response) return parsed.response;
  const b = parsed.body;
  if (b.action !== "purge") return json({ success: false, error: "Unknown action." }, 400);
  const days = Number.parseInt(b.olderThanDays, 10);
  if (!Number.isInteger(days) || days < 30 || days > 3650) return json({ success: false, error: "Choose 30 days or more." }, 400);
  const cutoff = nowSec() - days * 86400;
  const cutoffDate = new Date(cutoff * 1000).toISOString().slice(0, 10);
  const DB = auth.DB;
  let res;
  switch (b.what) {
    case "audit": res = await DB.prepare("DELETE FROM staff_audit WHERE at < ?1").bind(cutoff).run(); break;
    case "loa": res = await DB.prepare("DELETE FROM staff_loa WHERE status != 'pending' AND end_date < ?1").bind(cutoffDate).run(); break;
    case "duty": res = await DB.prepare("DELETE FROM staff_duty WHERE end_at IS NOT NULL AND end_at < ?1").bind(cutoff).run(); break;
    case "tasks": res = await DB.prepare("DELETE FROM staff_tasks WHERE status = 'done' AND done_at < ?1").bind(cutoff).run(); break;
    default: return json({ success: false, error: "Unknown data type." }, 400);
  }
  await audit(context.env, auth.user, "admin.purge", `${b.what} older than ${days} days`);
  return json({ success: true, deleted: res.meta?.changes ?? 0 });
}
