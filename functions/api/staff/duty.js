// /api/staff/duty  - clock in / clock out, and hours worked this week (Monday to Sunday, UTC).
//   GET   staff: my status and my hours; who is on duty now. manager+: everyone's hours this week.
//   POST  {action:"start"}                       clock in
//         {action:"stop"}                        clock out
//         {action:"stop", discordId}             manager+: clock someone else out (for forgotten clock-outs)
import { requireStaff, audit, nowSec, weekStart, MAX_SHIFT, ID_RE, LEVEL, readBody } from "../../_lib/staffAuth.js";
import { weeklySeconds, onDutyNow } from "../../_lib/staffDuty.js";
import { json } from "../../_lib/common.js";

export async function onRequestGet(context) {
  const auth = await requireStaff(context);
  if (auth.response) return auth.response;
  const { DB, user } = auth;
  const now = nowSec();
  const from = weekStart(now);
  const mine = (await weeklySeconds(DB, now, from, from + 7 * 86400, user.id))[0];
  const open = await DB.prepare("SELECT start_at FROM staff_duty WHERE discord_id = ?1 AND end_at IS NULL AND start_at > ?2").bind(user.id, now - MAX_SHIFT).first();
  const out = {
    success: true,
    weekStart: from,
    onDuty: Boolean(open),
    since: open ? open.start_at : null,
    mySeconds: Number(mine?.secs || 0),
    whoIsOn: await onDutyNow(DB, now)
  };
  if (user.level >= LEVEL.manager) {
    out.week = (await weeklySeconds(DB, now, from, from + 7 * 86400)).map((r) => ({ discordId: r.discord_id, name: r.name, seconds: Number(r.secs) }));
  }
  return json(out);
}

export async function onRequestPost(context) {
  const auth = await requireStaff(context);
  if (auth.response) return auth.response;
  const { DB, user } = auth;
  const parsed = await readBody(context, 1024);
  if (parsed.response) return parsed.response;
  const action = String(parsed.body.action || "");
  const now = nowSec();

  if (action === "start") {
    const open = await DB.prepare("SELECT id FROM staff_duty WHERE discord_id = ?1 AND end_at IS NULL AND start_at > ?2").bind(user.id, now - MAX_SHIFT).first();
    if (open) return json({ success: false, error: "You are already clocked in." }, 409);
    // tidy up any forgotten shift from long ago so it stops counting as open
    await DB.prepare("UPDATE staff_duty SET end_at = MIN(?1, start_at + ?2) WHERE discord_id = ?3 AND end_at IS NULL").bind(now, MAX_SHIFT, user.id).run();
    await DB.prepare("INSERT INTO staff_duty (discord_id, name, start_at) VALUES (?1, ?2, ?3)").bind(user.id, user.name, now).run();
    await audit(context.env, user, "duty.start");
    return json({ success: true });
  }

  if (action === "stop") {
    let target = user.id;
    if (parsed.body.discordId !== undefined) {
      if (user.level < LEVEL.manager) return json({ success: false, error: "Managers only." }, 403);
      target = String(parsed.body.discordId);
      if (!ID_RE.test(target)) return json({ success: false, error: "Bad member id." }, 400);
    }
    const res = await DB.prepare("UPDATE staff_duty SET end_at = MIN(?1, start_at + ?2) WHERE discord_id = ?3 AND end_at IS NULL").bind(now, MAX_SHIFT, target).run();
    if (!(res.meta?.changes > 0)) return json({ success: false, error: "That person is not clocked in." }, 409);
    await audit(context.env, user, target === user.id ? "duty.stop" : "duty.force_stop", target === user.id ? "" : target);
    return json({ success: true });
  }
  return json({ success: false, error: "Unknown action." }, 400);
}
