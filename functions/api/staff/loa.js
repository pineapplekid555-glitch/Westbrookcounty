// /api/staff/loa  - leave of absence requests.
//   GET   staff: own requests. manager+: everyone's (add ?status=pending|approved|denied|cancelled).
//   POST  {action:"create", start, end, reason}   any staff
//         {action:"cancel", id}                    the requester, while pending or approved
//         {action:"decide", id, decision:"approved"|"denied", note}   manager+ (not on your own request, unless admin)
import { requireStaff, audit, nowSec, validDate, LEVEL } from "../../_lib/staffAuth.js";
import { json, readJson, clean, HttpError } from "../../_lib/common.js";

const STATUSES = ["pending", "approved", "denied", "cancelled"];
const DAY = 86400000;

const shape = (r) => ({
  id: r.id, discordId: r.discord_id, name: r.name, start: r.start_date, end: r.end_date, reason: r.reason,
  status: r.status, decidedBy: r.decided_name || "", decidedAt: r.decided_at || null, note: r.note || "", createdAt: r.created_at
});

export async function onRequestGet(context) {
  const auth = await requireStaff(context);
  if (auth.response) return auth.response;
  const { DB, user } = auth;
  const status = new URL(context.request.url).searchParams.get("status");
  const filter = STATUSES.includes(status) ? status : null;

  let sql = "SELECT * FROM staff_loa WHERE 1=1";
  const binds = [];
  if (user.level < LEVEL.manager) { binds.push(user.id); sql += ` AND discord_id = ?${binds.length}`; }
  if (filter) { binds.push(filter); sql += ` AND status = ?${binds.length}`; }
  sql += " ORDER BY id DESC LIMIT 200";
  const rows = (await DB.prepare(sql).bind(...binds).all()).results || [];
  return json({ success: true, requests: rows.map(shape) });
}

export async function onRequestPost(context) {
  const auth = await requireStaff(context);
  if (auth.response) return auth.response;
  const { DB, user } = auth;
  let body;
  try { body = await readJson(context.request, 4096); }
  catch (e) { return json({ success: false, error: e instanceof HttpError ? e.message : "Bad request." }, e.status || 400); }

  const action = clean(body.action, 12);

  if (action === "create") {
    const start = clean(body.start, 10);
    const end = clean(body.end, 10);
    const reason = clean(body.reason, 500);
    const s = validDate(start);
    const e = validDate(end);
    if (s === null || e === null) return json({ success: false, error: "Use real dates (YYYY-MM-DD)." }, 400);
    const today = Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    if (e < s) return json({ success: false, error: "The end date is before the start date." }, 400);
    if (e < today) return json({ success: false, error: "That leave has already finished." }, 400);
    if ((e - s) / DAY > 180) return json({ success: false, error: "Leave can be at most 180 days. Ask a manager for longer." }, 400);
    if (reason.length < 3) return json({ success: false, error: "Please give a reason." }, 400);

    const open = await DB.prepare("SELECT COUNT(*) AS n FROM staff_loa WHERE discord_id = ?1 AND status = 'pending'").bind(user.id).first();
    if (Number(open?.n || 0) >= 5) return json({ success: false, error: "You already have 5 requests waiting." }, 429);

    const row = await DB.prepare(
      `INSERT INTO staff_loa (discord_id, name, start_date, end_date, reason, status, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6) RETURNING id`
    ).bind(user.id, user.name, start, end, reason, nowSec()).first();
    await audit(context.env, user, "loa.create", `#${row?.id} ${start} to ${end}`);
    return json({ success: true, id: row?.id });
  }

  const id = Number.parseInt(body.id, 10);
  if (!Number.isInteger(id) || id < 1) return json({ success: false, error: "Bad id." }, 400);
  const req = await DB.prepare("SELECT * FROM staff_loa WHERE id = ?1").bind(id).first();
  if (!req) return json({ success: false, error: "Not found." }, 404);

  if (action === "cancel") {
    if (req.discord_id !== user.id) return json({ success: false, error: "You can only cancel your own request." }, 403);
    if (req.status !== "pending" && req.status !== "approved") return json({ success: false, error: "That request is already closed." }, 409);
    await DB.prepare("UPDATE staff_loa SET status = 'cancelled' WHERE id = ?1").bind(id).run();
    await audit(context.env, user, "loa.cancel", `#${id}`);
    return json({ success: true });
  }

  if (action === "decide") {
    if (user.level < LEVEL.manager) return json({ success: false, error: "Managers only." }, 403);
    const decision = clean(body.decision, 10);
    if (decision !== "approved" && decision !== "denied") return json({ success: false, error: "Decision must be approved or denied." }, 400);
    if (req.discord_id === user.id && user.level < LEVEL.admin) return json({ success: false, error: "You cannot decide your own request." }, 403);
    if (req.status !== "pending") return json({ success: false, error: "That request is not waiting any more." }, 409);
    await DB.prepare("UPDATE staff_loa SET status = ?1, decided_by = ?2, decided_name = ?3, decided_at = ?4, note = ?5 WHERE id = ?6 AND status = 'pending'")
      .bind(decision, user.id, user.name, nowSec(), clean(body.note, 300), id).run();
    await audit(context.env, user, "loa." + decision, `#${id} for ${req.name}`);
    return json({ success: true });
  }

  return json({ success: false, error: "Unknown action." }, 400);
}
