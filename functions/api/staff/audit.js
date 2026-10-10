// GET /api/staff/audit  - admin only: what staff did in the portal. ?limit=1..500 (default 100), ?q=text to search.
import { requireStaff, LEVEL } from "../../_lib/staffAuth.js";
import { json } from "../../_lib/common.js";

export async function onRequestGet(context) {
  const auth = await requireStaff(context, LEVEL.admin);
  if (auth.response) return auth.response;
  const url = new URL(context.request.url);
  const limit = Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "100", 10) || 100));
  const q = (url.searchParams.get("q") || "").slice(0, 60).replace(/[\\%_]/g, (c) => "\\" + c);
  const rows = q
    ? (await auth.DB.prepare("SELECT * FROM staff_audit WHERE actor_name LIKE ?1 ESCAPE '\\' OR action LIKE ?1 ESCAPE '\\' OR detail LIKE ?1 ESCAPE '\\' ORDER BY id DESC LIMIT ?2").bind(`%${q}%`, limit).all()).results || []
    : (await auth.DB.prepare("SELECT * FROM staff_audit ORDER BY id DESC LIMIT ?1").bind(limit).all()).results || [];
  return json({ success: true, entries: rows.map((r) => ({ at: r.at, by: r.actor_name, action: r.action, detail: r.detail })) });
}
