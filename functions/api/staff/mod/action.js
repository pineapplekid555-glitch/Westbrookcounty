// POST /api/staff/mod/action  - moderators act on players. Everything is logged and sent to the game through a queue.
//   {action:"ban", user, reason, notes?, days}      user = Roblox user id or username. days 0 = permanent, otherwise 1 to 365
//   {action:"unban", user, reason?}
//   {action:"kick", user, reason}
//   {action:"warn", user, reason}                    the player sees the message in game
//   {action:"announce", message}                     a message to every server
//   {action:"note", user, notes}                     internal note (any staff member)
//   ADMIN ONLY (whatever MOD_ACTION_LEVEL is):
//   {action:"removexp"|"givexp", user, pool:"police"|"fire"|"dot", amount, reason}   {action:"removemoney"|"givemoney", user, amount, reason}   {action:"removevehicle"|"givevehicle", user, vehicle, reason}
//   {action:"link", user, main}                      mark `user` as an alt of `main` (banning either bans the whole group)   {action:"unlink", user}
//   {action:"review", id}                            mark an anti-cheat ban as checked
//   {action:"cancel", queueId}                       withdraw a command the game has not picked up yet
// Allowed for the level in MOD_ACTION_LEVEL (default manager). Ids in MOD_PROTECTED_USER_IDS can never be banned or kicked here.
import { requireStaff, audit, nowSec, LEVEL, readBody } from "../../../_lib/staffAuth.js";
import { json, clean } from "../../../_lib/common.js";
import { getCatalog, getGroup, cascadeBan, hasActiveBan, actLevel, protectedIds, findTarget, recordAction, rememberName, ensurePayloadColumn, MAX_BAN_SECONDS, EDIT_TYPES, XP_POOLS } from "../../../_lib/moderation.js";

const bad = (msg, status = 400) => json({ success: false, error: msg }, status);

export async function onRequestPost(context) {
  const auth = await requireStaff(context, LEVEL.staff);
  if (auth.response) return auth.response;
  const { DB, user } = auth;
  const parsed = await readBody(context, 4096);
  if (parsed.response) return parsed.response;
  const b = parsed.body;
  const action = String(b.action || "");
  const now = nowSec();

  if (EDIT_TYPES.includes(action) && user.level < LEVEL.admin) return bad("Only admins can change a player's XP, money or vehicles.", 403);
  if (action !== "note" && user.level < actLevel(context.env)) return bad("You do not have permission to do this.", 403);

  const queue = (type, t, reason, durationSecs, actionId) =>
    DB.prepare("INSERT INTO mod_queue (type, user_id, username, reason, duration_secs, created_by_id, created_by_name, created_at, action_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) RETURNING id")
      .bind(type, t?.userId || 0, t?.username || "", reason, durationSecs || null, user.id, user.name, now, actionId ?? null).first();

  if (action === "announce") {
    const message = clean(b.message, 200);
    if (message.length < 3) return bad("Write a message.");
    const q = await queue("announce", null, message, null);
    await audit(context.env, user, "mod.announce", message);
    return json({ success: true, queueId: q?.id });
  }

  if (action === "review") {
    const id = Number.parseInt(b.id, 10);
    if (!Number.isInteger(id) || id < 1) return bad("Bad id.");
    await DB.prepare("UPDATE mod_actions SET reviewed = 1, reviewed_by = ?1 WHERE id = ?2 AND source = 'auto'").bind(user.name, id).run();
    await audit(context.env, user, "mod.review", `#${id}`);
    return json({ success: true });
  }

  if (action === "cancel") {
    const id = Number.parseInt(b.queueId, 10);
    if (!Number.isInteger(id) || id < 1) return bad("Bad id.");
    const r = await DB.prepare("UPDATE mod_queue SET status = 'cancelled', done_at = ?1 WHERE id = ?2 AND status = 'pending'").bind(now, id).run();
    if (!(r.meta?.changes > 0)) return bad("Too late: the game already picked that up.", 409);
    const q = await DB.prepare("SELECT type, action_id FROM mod_queue WHERE id = ?1").bind(id).first();
    if (q?.type === "ban" && q.action_id) await DB.prepare("UPDATE mod_actions SET active = 0 WHERE id = ?1").bind(q.action_id).run();
    await audit(context.env, user, "mod.cancel", `#${id}`);
    return json({ success: true });
  }

  if (![...EDIT_TYPES, "ban", "unban", "kick", "warn", "note", "link", "unlink"].includes(action)) return bad("Unknown action.");
  const target = await findTarget(DB, b.user);
  if (!target) return bad("Could not find that player. Try their Roblox user id.", 404);
  const label = target.username ? `${target.username} (${target.userId})` : String(target.userId);

  if (action === "note") {
    const notes = clean(b.notes, 400);
    if (notes.length < 2) return bad("Write a note.");
    await rememberName(DB, target.userId, target.username, now);
    await recordAction(DB, { userId: target.userId, username: target.username, type: "note", notes, byId: user.id, byName: user.name }, now);
    await audit(context.env, user, "mod.note", label);
    return json({ success: true });
  }

  if (action === "link" || action === "unlink") {
    if (action === "unlink") {
      const r = await DB.prepare("DELETE FROM mod_links WHERE alt_id = ?1").bind(target.userId).run();
      if (!(r.meta?.changes > 0)) return bad("That account is not linked as an alt of anything.", 404);
      await recordAction(DB, { userId: target.userId, username: target.username, type: "note", notes: "Unlinked from its main account.", byId: user.id, byName: user.name }, now);
      await audit(context.env, user, "mod.unlink", label);
      return json({ success: true });
    }
    const main = await findTarget(DB, b.main);
    if (!main) return bad("Could not find the main account. Try its Roblox user id.", 404);
    if (main.userId === target.userId) return bad("An account cannot be its own alt.");
    const mainGroup = await getGroup(DB, main.userId);
    const altGroup = await getGroup(DB, target.userId);
    if (altGroup.isAlt) return bad("That account is already linked as an alt. Unlink it first.", 409);
    if (altGroup.alts.length) return bad("That account is already the main account for other alts. Unlink those first.", 409);
    if (mainGroup.isAlt) return bad(`${main.username || main.userId} is itself an alt. Link to its main account instead (${mainGroup.main}).`, 409);
    await rememberName(DB, target.userId, target.username, now);
    await rememberName(DB, main.userId, main.username, now);
    await DB.prepare("INSERT INTO mod_links (alt_id, main_id, linked_by, created_at) VALUES (?1, ?2, ?3, ?4)").bind(target.userId, main.userId, user.name, now).run();
    const mname = main.username ? `${main.username} (${main.userId})` : String(main.userId);
    await recordAction(DB, { userId: target.userId, username: target.username, type: "note", notes: `Linked as an alt of ${mname}.`, byId: user.id, byName: user.name }, now);
    await recordAction(DB, { userId: main.userId, username: main.username, type: "note", notes: `${label} linked as an alt of this account.`, byId: user.id, byName: user.name }, now);
    await audit(context.env, user, "mod.link", `${label} is an alt of ${mname}`);
    // if one of them is already banned, bring the other in line straight away
    const banned = (await hasActiveBan(DB, target.userId, now)) ? target : (await hasActiveBan(DB, main.userId, now)) ? main : null;
    let alsoBanned = [];
    if (banned) {
      const row = await DB.prepare("SELECT reason, duration_secs FROM mod_actions WHERE user_id = ?1 AND type = 'ban' AND active = 1 ORDER BY id DESC LIMIT 1").bind(banned.userId).first();
      alsoBanned = await cascadeBan(DB, context.env, { userId: banned.userId, username: banned.username, reason: row?.reason, durationSecs: row?.duration_secs || 0, byId: user.id, byName: user.name }, now);
    }
    return json({ success: true, alsoBanned });
  }

  if ((action === "ban" || action === "kick") && protectedIds(context.env).includes(String(target.userId))) {
    return bad("That player is protected and cannot be banned or kicked from here.", 403);
  }

  const reason = clean(b.reason, 300);
  if (action !== "unban" && reason.length < 3) return bad("Give a reason.");
  await rememberName(DB, target.userId, target.username, now);

  if (EDIT_TYPES.includes(action)) {
    let payload, what;
    const verb = action.startsWith("give") ? "Gave" : "Removed";
    const kind = action.replace(/^(give|remove)/, "");
    if (kind === "xp") {
      const amount = Number.parseInt(b.amount, 10);
      if (!Object.prototype.hasOwnProperty.call(XP_POOLS, b.pool)) return bad("Pick Police, Fire or DOT.");
      if (!Number.isInteger(amount) || amount < 1 || amount > 1e9) return bad("Enter an amount of 1 or more.");
      payload = { pool: b.pool, amount }; what = `${verb} ${amount.toLocaleString("en-GB")} ${XP_POOLS[b.pool]}`;
    } else if (kind === "money") {
      const amount = Number.parseInt(b.amount, 10);
      if (!Number.isInteger(amount) || amount < 1 || amount > 1e12) return bad("Enter an amount of 1 or more.");
      payload = { amount }; what = `${verb} $${amount.toLocaleString("en-GB")}`;
    } else {
      const vehicle = clean(b.vehicle, 80);
      if (!vehicle) return bad("Pick a vehicle.");
      if (action === "givevehicle") {
        const catalog = await getCatalog(DB);
        if (!catalog.length) return bad("The game has not sent its vehicle list yet. Try again in a minute after a server has started.");
        if (!catalog.includes(vehicle)) return bad("That vehicle does not exist in the game.");
      }
      payload = { vehicle }; what = `${verb} vehicle: ${vehicle}`;
    }
    await ensurePayloadColumn(DB);
    const id = await recordAction(DB, { userId: target.userId, username: target.username, type: action, reason, notes: what, byId: user.id, byName: user.name }, now);
    const q = await DB.prepare(
      "INSERT INTO mod_queue (type, user_id, username, reason, created_by_id, created_by_name, created_at, action_id, payload) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) RETURNING id"
    ).bind(action, target.userId, target.username || "", reason, user.id, user.name, now, id, JSON.stringify(payload)).first();
    await audit(context.env, user, "mod." + action, `${label}: ${what} (${reason})`);
    return json({ success: true, id, queueId: q?.id });
  }

  if (action === "ban") {
    const days = Number.parseInt(b.days ?? 0, 10);
    if (!Number.isInteger(days) || days < 0 || days * 86400 > MAX_BAN_SECONDS) return bad("Ban length must be permanent or 1 to 365 days.");
    const already = await DB.prepare("SELECT id FROM mod_actions WHERE user_id = ?1 AND type = 'ban' AND active = 1 AND (expires_at IS NULL OR expires_at > ?2)").bind(target.userId, now).first();
    if (already) return bad("That player is already banned. Unban them first to change the ban.", 409);
    const secs = days * 86400;
    const id = await recordAction(DB, { userId: target.userId, username: target.username, type: "ban", reason, notes: clean(b.notes, 300), byId: user.id, byName: user.name, durationSecs: secs }, now);
    const q = await queue("ban", target, reason, secs, id);
    const alsoBanned = await cascadeBan(DB, context.env, { userId: target.userId, username: target.username, reason, durationSecs: secs, byId: user.id, byName: user.name }, now);
    await audit(context.env, user, "mod.ban", `${label}: ${reason} (${days ? days + "d" : "permanent"})` + (alsoBanned.length ? ` (also banned linked: ${alsoBanned.map((x) => x.username || x.userId).join(", ")})` : ""));
    return json({ success: true, id, queueId: q?.id, alsoBanned });
  }

  const id = await recordAction(DB, { userId: target.userId, username: target.username, type: action, reason, byId: user.id, byName: user.name }, now);
  const q = await queue(action, target, reason, null, id);
  await audit(context.env, user, "mod." + action, `${label}${reason ? ": " + reason : ""}`);
  return json({ success: true, id, queueId: q?.id });
}
