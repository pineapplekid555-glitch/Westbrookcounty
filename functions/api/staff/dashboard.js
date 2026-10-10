// GET /api/staff/dashboard  - everything the home screen shows, in one request.
import { requireStaff, nowSec, todayStr, LEVEL } from "../../_lib/staffAuth.js";
import { onDutyNow } from "../../_lib/staffDuty.js";
import { json } from "../../_lib/common.js";

const count = async (DB, sql, ...binds) => Number((await DB.prepare(sql).bind(...binds).first())?.n || 0);

export async function onRequestGet(context) {
  const auth = await requireStaff(context);
  if (auth.response) return auth.response;
  const { DB, user } = auth;
  const now = nowSec();
  const today = todayStr();
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const away = (await DB.prepare(
    "SELECT name, start_date, end_date FROM staff_loa WHERE status = 'approved' AND start_date <= ?1 AND end_date >= ?1 ORDER BY end_date LIMIT 50"
  ).bind(today).all()).results || [];
  const soon = (await DB.prepare(
    "SELECT name, start_date, end_date FROM staff_loa WHERE status = 'approved' AND start_date > ?1 AND start_date <= ?2 ORDER BY start_date LIMIT 50"
  ).bind(today, in14).all()).results || [];
  const news = (await DB.prepare("SELECT id, title, body, author_name, pinned, created_at FROM staff_announcements ORDER BY pinned DESC, id DESC LIMIT 3").all()).results || [];
  const duty = await onDutyNow(DB, now);

  const out = {
    success: true,
    today,
    counts: {
      staff: await count(DB, "SELECT COUNT(*) AS n FROM staff_roster"),
      onDuty: duty.length,
      onLeave: away.length
    },
    onLeave: away.map((r) => ({ name: r.name, end: r.end_date })),
    upcomingLeave: soon.map((r) => ({ name: r.name, start: r.start_date, end: r.end_date })),
    onDuty: duty.map((d) => ({ name: d.name, since: d.since })),
    announcements: news.map((a) => ({ id: a.id, title: a.title, body: a.body.slice(0, 280), authorName: a.author_name, pinned: Boolean(a.pinned), createdAt: a.created_at })),
    mine: {
      openTasks: await count(DB, "SELECT COUNT(*) AS n FROM staff_tasks WHERE status = 'open' AND (assignee_id = ?1 OR assignee_id = '')", user.id),
      activeStrikes: await count(DB, "SELECT COUNT(*) AS n FROM staff_strikes WHERE discord_id = ?1 AND revoked = 0 AND (expires_at IS NULL OR expires_at > ?2)", user.id, now),
      pendingLoa: await count(DB, "SELECT COUNT(*) AS n FROM staff_loa WHERE discord_id = ?1 AND status = 'pending'", user.id)
    }
  };

  if (user.level >= LEVEL.manager) {
    out.manager = {
      pendingLoa: await count(DB, "SELECT COUNT(*) AS n FROM staff_loa WHERE status = 'pending'"),
      openTasks: await count(DB, "SELECT COUNT(*) AS n FROM staff_tasks WHERE status = 'open'"),
    };
  }
  if (user.level >= LEVEL.admin) {
    // strikes and the activity log are admin-only
    out.manager.activeStrikes = await count(DB, "SELECT COUNT(*) AS n FROM staff_strikes WHERE revoked = 0 AND (expires_at IS NULL OR expires_at > ?1)", now);
    out.manager.recent = ((await DB.prepare("SELECT at, actor_name, action, detail FROM staff_audit WHERE action NOT LIKE 'login%' ORDER BY id DESC LIMIT 8").all()).results || [])
      .map((r) => ({ at: r.at, by: r.actor_name, action: r.action, detail: r.detail }));
  }
  return json(out);
}
