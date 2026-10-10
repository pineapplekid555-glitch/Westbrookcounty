// /api/staff/tasks  - a simple to-do board.
//   GET   staff: tasks assigned to you plus open "anyone" tasks. manager+: every task (?status=open|done).
//   POST  manager+: {action:"create", title, detail, assigneeId (optional), due (optional YYYY-MM-DD)}   {action:"delete", id}
//         Tasks created by an admin are locked: only an admin can delete them.
//         anyone who can see a task: {action:"done"|"reopen", id}
import { requireStaff, audit, nowSec, ID_RE, LEVEL, validDate, readBody } from "../../_lib/staffAuth.js";
import { json, clean } from "../../_lib/common.js";

const shape = (r) => ({
  id: r.id, title: r.title, detail: r.detail, assigneeId: r.assignee_id, assigneeName: r.assignee_name, due: r.due_date,
  status: r.status, createdBy: r.created_by_name, createdAt: r.created_at, doneBy: r.done_by_name, doneAt: r.done_at, adminLocked: Number(r.admin_locked) === 1
});

export async function onRequestGet(context) {
  const auth = await requireStaff(context);
  if (auth.response) return auth.response;
  const { DB, user } = auth;
  const status = new URL(context.request.url).searchParams.get("status");
  const binds = [];
  const where = [];
  if (user.level < LEVEL.manager) { binds.push(user.id); where.push(`(assignee_id = ?${binds.length} OR assignee_id = '')`); }
  if (status === "open" || status === "done") { binds.push(status); where.push(`status = ?${binds.length}`); }
  const sql = `SELECT * FROM staff_tasks ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY status = 'done', CASE WHEN due_date = '' THEN 1 ELSE 0 END, due_date, id DESC LIMIT 200`;
  const rows = (await DB.prepare(sql).bind(...binds).all()).results || [];
  return json({ success: true, tasks: rows.map(shape) });
}

export async function onRequestPost(context) {
  const auth = await requireStaff(context);
  if (auth.response) return auth.response;
  const { DB, user } = auth;
  const parsed = await readBody(context, 4096);
  if (parsed.response) return parsed.response;
  const b = parsed.body;
  const action = String(b.action || "");

  if (action === "create" || action === "delete") {
    if (user.level < LEVEL.manager) return json({ success: false, error: "Managers only." }, 403);
  }

  if (action === "create") {
    const title = clean(b.title, 120);
    if (title.length < 2) return json({ success: false, error: "Give the task a title." }, 400);
    let assigneeId = "", assigneeName = "";
    if (b.assigneeId) {
      assigneeId = String(b.assigneeId);
      if (!ID_RE.test(assigneeId)) return json({ success: false, error: "Bad assignee." }, 400);
      const m = await DB.prepare("SELECT name FROM staff_roster WHERE discord_id = ?1").bind(assigneeId).first();
      if (!m) return json({ success: false, error: "That person has not logged in yet." }, 404);
      assigneeName = m.name;
    }
    let due = "";
    if (b.due) {
      due = clean(b.due, 10);
      if (validDate(due) === null) return json({ success: false, error: "Use a real due date." }, 400);
    }
    const row = await DB.prepare(
      `INSERT INTO staff_tasks (title, detail, assignee_id, assignee_name, due_date, status, created_by, created_by_name, created_at, admin_locked)
       VALUES (?1, ?2, ?3, ?4, ?5, 'open', ?6, ?7, ?8, ?9) RETURNING id`
    ).bind(title, String(b.detail ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, 1000), assigneeId, assigneeName, due, user.id, user.name, nowSec(), user.level >= LEVEL.admin ? 1 : 0).first();
    await audit(context.env, user, "task.create", `#${row?.id} ${title}`);
    return json({ success: true, id: row?.id });
  }

  const id = Number.parseInt(b.id, 10);
  if (!Number.isInteger(id) || id < 1) return json({ success: false, error: "Bad id." }, 400);
  const task = await DB.prepare("SELECT * FROM staff_tasks WHERE id = ?1").bind(id).first();
  if (!task) return json({ success: false, error: "Not found." }, 404);

  if (action === "delete") {
    if (Number(task.admin_locked) === 1 && user.level < LEVEL.admin) return json({ success: false, error: "Only an admin can delete a task an admin set." }, 403);
    await DB.prepare("DELETE FROM staff_tasks WHERE id = ?1").bind(id).run();
    await audit(context.env, user, "task.delete", `#${id} ${task.title}`);
    return json({ success: true });
  }

  if (action === "done" || action === "reopen") {
    const mine = task.assignee_id === "" || task.assignee_id === user.id;
    if (!mine && user.level < LEVEL.manager) return json({ success: false, error: "That task is not yours." }, 403);
    if (action === "done") await DB.prepare("UPDATE staff_tasks SET status = 'done', done_by_name = ?1, done_at = ?2 WHERE id = ?3").bind(user.name, nowSec(), id).run();
    else await DB.prepare("UPDATE staff_tasks SET status = 'open', done_by_name = '', done_at = NULL WHERE id = ?1").bind(id).run();
    await audit(context.env, user, "task." + action, `#${id}`);
    return json({ success: true });
  }
  return json({ success: false, error: "Unknown action." }, 400);
}
