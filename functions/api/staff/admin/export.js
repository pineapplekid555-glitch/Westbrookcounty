// GET /api/staff/admin/export?table=loa|roster|audit|strikes|duty|tasks|announcements   - admin only, downloads a CSV.
import { requireStaff, audit, LEVEL, csvCell } from "../../../_lib/staffAuth.js";
import { json } from "../../../_lib/common.js";

const TABLES = {
  loa: ["id", "discord_id", "name", "start_date", "end_date", "reason", "status", "decided_name", "decided_at", "note", "created_at"],
  roster: ["discord_id", "name", "rank", "notes", "first_login", "last_login"],
  audit: ["id", "at", "actor_id", "actor_name", "action", "detail"],
  strikes: ["id", "discord_id", "name", "reason", "issued_by_name", "issued_at", "expires_at", "revoked", "revoked_by_name", "revoked_note"],
  duty: ["id", "discord_id", "name", "start_at", "end_at"],
  tasks: ["id", "title", "detail", "assignee_name", "due_date", "status", "created_by_name", "created_at", "done_by_name", "done_at"],
  announcements: ["id", "title", "body", "author_name", "pinned", "created_at"]
};
const SOURCE = { loa: "staff_loa", roster: "staff_roster", audit: "staff_audit", strikes: "staff_strikes", duty: "staff_duty", tasks: "staff_tasks", announcements: "staff_announcements" };

export async function onRequestGet(context) {
  const auth = await requireStaff(context, LEVEL.admin);
  if (auth.response) return auth.response;
  const name = new URL(context.request.url).searchParams.get("table") || "";
  if (!Object.prototype.hasOwnProperty.call(TABLES, name)) return json({ success: false, error: "Unknown table." }, 400);
  const cols = TABLES[name];
  const rows = (await auth.DB.prepare(`SELECT ${cols.join(", ")} FROM ${SOURCE[name]} ORDER BY 1 LIMIT 50000`).all()).results || [];
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
  await audit(context.env, auth.user, "admin.export", name);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="westbrook-${name}.csv"`,
      "cache-control": "no-store"
    }
  });
}
