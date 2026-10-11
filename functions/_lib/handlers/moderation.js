import { json, checkAuth, readJson, clean, HttpError } from "../common.js";
import { getDB, nowSec } from "../staffAuth.js";
import {
  cleanProfile, savePlayer, rememberName, recordAction, ACTION_TYPES, MAX_BAN_SECONDS, CLAIM_TIMEOUT, SHORT_LIVED, POLL_SECONDS
} from "../moderation.js";

// POST /api/p/moderation/<PRIVATE_API_PATH>   (also /api/moderation/game while PRIVATE_API_PATH is unset)
// Called ONLY by the Roblox game servers (Authorization: Bearer ROBLOX_API_KEY).
//   { action: "profile", player: { userId, username, displayName, money, xp:{police,fire,dot}, vehicles:[..], gamepasses:[..],
//                                  firstJoined, lastJoined, accountCreated, playtimeSeconds, extra:{..} } }
//   { action: "event",   type: "ban"|"unban"|"kick"|"warn", userId, username, reason, durationSeconds?, by? }   (something the GAME did itself)
//   { action: "poll" }                        -> staff commands waiting to be carried out
//   { action: "ack", id, ok, result? }        -> the command was carried out (or failed)

export async function handle(context) {
  const denied = checkAuth(context.request, context.env);
  if (denied) return denied;
  const DB = getDB(context.env);
  if (!DB) return json({ success: false, error: "not_configured" }, 503);

  let body;
  try {
    body = await readJson(context.request, 65536);
  } catch (e) {
    if (e instanceof HttpError) return json({ success: false, error: e.message }, e.status);
    return json({ success: false, error: "Bad request." }, 400);
  }
  const now = nowSec();

  switch (body.action) {
    case "profile": {
      const p = cleanProfile(body.player);
      if (!(p.userId > 0)) return json({ success: false, error: "player.userId is required." }, 400);
      await savePlayer(DB, p, now);
      return json({ success: true });
    }

    case "event": {
      const type = clean(body.type, 10);
      const userId = Math.trunc(Number(body.userId));
      if (!["ban", "unban", "kick", "warn"].includes(type) || !(userId > 0)) return json({ success: false, error: "type and userId are required." }, 400);
      const username = clean(body.username, 40);
      const by = clean(body.by, 40);
      const dur = Math.min(MAX_BAN_SECONDS * 20, Math.max(0, Math.trunc(Number(body.durationSeconds)) || 0));
      await rememberName(DB, userId, username, now);
      // An anti-cheat ban that was already recorded through the review endpoint in the last minute is not logged twice.
      const auto = !by || by === "auto" || /anti-?cheat|automatic/i.test(by);
      if (type === "ban" && auto) {
        const dup = await DB.prepare("SELECT id FROM mod_actions WHERE user_id = ?1 AND type = 'ban' AND source = 'auto' AND created_at > ?2").bind(userId, now - 60).first();
        if (dup) return json({ success: true, duplicate: true });
      }
      const id = await recordAction(DB, {
        userId, username, type, reason: clean(body.reason, 300), notes: clean(body.details, 300),
        source: auto ? "auto" : "game", byName: auto ? "Anti-cheat" : by, durationSecs: dur
      }, now);
      return json({ success: true, id });
    }

    case "syncBans": {
      // bans that already exist in the game's ban list: add the ones the website does not know about yet
      const bans = (Array.isArray(body.bans) ? body.bans : []).slice(0, 150);
      let added = 0;
      for (const b of bans) {
        const userId = Math.trunc(Number(b?.userId));
        if (!(userId > 0)) continue;
        const ts = Math.trunc(Number(b.timestamp)) || now;
        const expires = Math.trunc(Number(b.expires)) || null;
        if (expires && expires <= now) continue;
        const known = await DB.prepare("SELECT id FROM mod_actions WHERE user_id = ?1 AND type = 'ban' AND active = 1").bind(userId).first();
        if (known) continue;
        const username = clean(b.username, 40);
        await rememberName(DB, userId, username, now);
        const id = await recordAction(DB, {
          userId, username, type: "ban", reason: clean(b.reason, 300), source: "game", byName: clean(b.by, 40) || "Game",
          durationSecs: expires ? expires - ts : 0
        }, ts);
        if (expires) await DB.prepare("UPDATE mod_actions SET expires_at = ?1 WHERE id = ?2").bind(expires, id).run();
        added++;
      }
      return json({ success: true, added });
    }

    case "poll": {
      // forget old short-lived commands, then take what is waiting (one server takes each command)
      await DB.prepare("UPDATE mod_queue SET status = 'expired', done_at = ?1 WHERE status IN ('pending','claimed') AND type IN ('kick','warn','announce') AND created_at < ?2").bind(now, now - SHORT_LIVED).run();
      await DB.prepare("UPDATE mod_queue SET status = 'expired', done_at = ?1 WHERE status IN ('pending','claimed') AND created_at < ?2").bind(now, now - 86400).run();
      const rows = (await DB.prepare(
        `UPDATE mod_queue SET status = 'claimed', claimed_at = ?1
          WHERE id IN (SELECT id FROM mod_queue WHERE status = 'pending' OR (status = 'claimed' AND claimed_at < ?2) ORDER BY id LIMIT 20)
          RETURNING id, type, user_id, username, reason, duration_secs, created_by_name`
      ).bind(now, now - CLAIM_TIMEOUT).all()).results || [];
      return json({
        success: true,
        pollIn: POLL_SECONDS,
        commands: rows.map((r) => ({
          id: r.id, type: r.type, userId: r.user_id, username: r.username, reason: r.reason,
          durationSeconds: r.duration_secs || 0, by: r.created_by_name
        })).filter((c) => ACTION_TYPES.includes(c.type))
      });
    }

    case "ack": {
      const id = Math.trunc(Number(body.id));
      if (!(id > 0)) return json({ success: false, error: "id is required." }, 400);
      const ok = body.ok === true;
      const result = clean(body.result, 200);
      const q = await DB.prepare("SELECT * FROM mod_queue WHERE id = ?1").bind(id).first();
      if (!q) return json({ success: false, error: "unknown_command" }, 404);
      await DB.prepare("UPDATE mod_queue SET status = ?1, done_at = ?2, result = ?3 WHERE id = ?4").bind(ok ? "done" : "failed", now, result, id).run();
      if (!ok && q.type === "ban" && q.action_id) {
        await DB.prepare("UPDATE mod_actions SET active = 0, notes = substr(notes || ' [game could not apply the ban: ' || ?1 || ']', 1, 400) WHERE id = ?2").bind(result, q.action_id).run();
      }
      return json({ success: true });
    }

    default:
      return json({ success: false, error: "Unknown action." }, 400);
  }
}
