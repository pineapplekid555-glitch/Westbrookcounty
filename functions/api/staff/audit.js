// GET /api/staff/audit  - admin only: the last 100 things staff did in the portal.
import { requireStaff, LEVEL } from "../../_lib/staffAuth.js";
import { json } from "../../_lib/common.js";

export async function onRequestGet(context) {
  const auth = await requireStaff(context, LEVEL.admin);
  if (auth.response) return auth.response;
  const rows = (await auth.DB.prepare("SELECT * FROM staff_audit ORDER BY id DESC LIMIT 100").all()).results || [];
  return json({ success: true, entries: rows.map((r) => ({ at: r.at, by: r.actor_name, action: r.action, detail: r.detail })) });
}
