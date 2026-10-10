// /api/staff/announcements  - staff-only announcements.
//   GET   staff+: newest first (pinned first).
//   POST  manager+: {action:"create", title, body, pinned?, notifyDiscord?}   {action:"delete", id}   {action:"pin", id, pinned}
import { requireStaff, audit, nowSec, LEVEL } from "../../_lib/staffAuth.js";
import { json, readJson, clean, HttpError } from "../../_lib/common.js";

const shape = (r) => ({
  id: r.id, title: r.title, body: r.body, authorName: r.author_name, pinned: Boolean(r.pinned), createdAt: r.created_at
});

export async function onRequestGet(context) {
  const auth = await requireStaff(context);
  if (auth.response) return auth.response;
  const rows = (await auth.DB.prepare("SELECT * FROM staff_announcements ORDER BY pinned DESC, id DESC LIMIT 100").all()).results || [];
  return json({ success: true, announcements: rows.map(shape) });
}

export async function onRequestPost(context) {
  const auth = await requireStaff(context, LEVEL.manager);
  if (auth.response) return auth.response;
  const { DB, user } = auth;
  let body;
  try { body = await readJson(context.request, 8192); }
  catch (e) { return json({ success: false, error: e instanceof HttpError ? e.message : "Bad request." }, e.status || 400); }

  const action = clean(body.action, 10);

  if (action === "create") {
    const title = clean(body.title, 100);
    // keep line breaks in the body, but drop other control characters
    const text = String(body.body ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, 2000);
    if (title.length < 2 || text.length < 2) return json({ success: false, error: "Add a title and a message." }, 400);
    const row = await DB.prepare(
      `INSERT INTO staff_announcements (title, body, author_id, author_name, pinned, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6) RETURNING id`
    ).bind(title, text, user.id, user.name, body.pinned === true ? 1 : 0, nowSec()).first();
    await audit(context.env, user, "announce.create", `#${row?.id} ${title}`);

    let sent = false;
    if (body.notifyDiscord === true) {
      const payload = JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [{ title, description: text.slice(0, 1800), footer: { text: "Posted by " + user.name } }]
      });
      const hook = String(context.env.STAFF_ANNOUNCE_WEBHOOK || "");
      const botToken = String(context.env.DISCORD_BOT_TOKEN || "");
      const channel = String(context.env.STAFF_CHAT_CHANNEL_ID || "");
      try {
        let res = null;
        if (botToken && /^\d{15,25}$/.test(channel)) {
          // post as the bot into the staff chat channel
          res = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bot ${botToken}` },
            body: payload
          });
        } else if (/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(hook)) {
          res = await fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: payload });
        }
        sent = Boolean(res && res.ok);
      } catch { /* the announcement is saved either way */ }
    }
    return json({ success: true, id: row?.id, discordSent: sent });
  }

  const id = Number.parseInt(body.id, 10);
  if (!Number.isInteger(id) || id < 1) return json({ success: false, error: "Bad id." }, 400);

  if (action === "delete") {
    await DB.prepare("DELETE FROM staff_announcements WHERE id = ?1").bind(id).run();
    await audit(context.env, user, "announce.delete", `#${id}`);
    return json({ success: true });
  }
  if (action === "pin") {
    await DB.prepare("UPDATE staff_announcements SET pinned = ?1 WHERE id = ?2").bind(body.pinned === true ? 1 : 0, id).run();
    await audit(context.env, user, "announce.pin", `#${id} ${body.pinned === true}`);
    return json({ success: true });
  }
  return json({ success: false, error: "Unknown action." }, 400);
}
