// GET  /api/staff/mod/assess?id=<user id>        -> the last bot/alt estimate for this account (no AI call)
// POST /api/staff/mod/assess {user}              -> works out a fresh estimate (Roblox facts + AI) and saves it
// Any staff member can ask. The AI only advises.
import { requireStaff, audit, nowSec, LEVEL, readBody } from "../../../_lib/staffAuth.js";
import { json } from "../../../_lib/common.js";
import { askAI } from "../../../_lib/ai.js";
import { findTarget, shapePlayer, getGroup, nameOf, hasActiveBan, shapeAction } from "../../../_lib/moderation.js";
import { getRobloxInfo } from "../../../_lib/robloxInfo.js";
import { gatherSignals, buildPrompt, shapeAssessment, readCached, writeCached } from "../../../_lib/botcheck.js";

// accounts in this game whose username starts the same way (letters only, at least 4)
export async function similarAccounts(DB, userId, username) {
  const stem = String(username || "").toLowerCase().replace(/[^a-z]/g, "");
  if (stem.length < 4) return [];
  const like = stem.slice(0, Math.max(4, Math.min(stem.length, 8))).replace(/[\\%_]/g, "") + "%";
  const rows = (await DB.prepare("SELECT user_id, username, first_joined FROM mod_players WHERE REPLACE(REPLACE(LOWER(username), '_', ''), '0', '') LIKE ?1 AND user_id != ?2 LIMIT 6").bind(like, Number(userId)).all()).results || [];
  const now = nowSec();
  const out = [];
  for (const r of rows) out.push({ userId: Number(r.user_id), username: r.username, firstJoined: r.first_joined, banned: !!(await hasActiveBan(DB, r.user_id, now)) });
  return out;
}

export async function onRequestGet(context) {
  const auth = await requireStaff(context, LEVEL.staff);
  if (auth.response) return auth.response;
  const id = new URL(context.request.url).searchParams.get("id") || "";
  if (!/^\d{1,15}$/.test(id)) return json({ success: false, error: "Bad user id." }, 400);
  return json({ success: true, assessment: await (await import("../../../_lib/botcheck.js")).readCached(auth.DB, id) });
}

export async function onRequestPost(context) {
  const auth = await requireStaff(context, LEVEL.staff);
  if (auth.response) return auth.response;
  const { DB, user } = auth;
  const parsed = await readBody(context, 1024);
  if (parsed.response) return parsed.response;
  const target = await findTarget(DB, parsed.body.user);
  if (!target) return json({ success: false, error: "Could not find that player." }, 404);

  const now = nowSec();
  const row = await DB.prepare("SELECT * FROM mod_players WHERE user_id = ?1").bind(target.userId).first();
  const player = row ? { ...shapePlayer(row), seen: true } : { userId: target.userId, username: target.username, seen: false, xp: {}, vehicles: [], gamepasses: [] };
  const info = await getRobloxInfo(DB, target.userId, true);
  const actions = ((await DB.prepare("SELECT * FROM mod_actions WHERE user_id = ?1 ORDER BY id DESC LIMIT 50").bind(target.userId).all()).results || []).map((a) => shapeAction(a, now));
  const username = player.username || info?.username || target.username || String(target.userId);
  const similar = await similarAccounts(DB, target.userId, username);
  const group = await getGroup(DB, target.userId);
  const signals = gatherSignals({ info, player, actions, similar, group });

  const ai = await askAI(context.env, [{ text: buildPrompt(signals, username) }], { prefer: "workers-ai", maxTokens: 800 });
  const assessment = shapeAssessment(ai.ok ? ai.value : null, signals, ai.model);
  assessment.facts = signals.facts;
  assessment.by = user.name;
  await writeCached(DB, target.userId, assessment);
  await audit(context.env, user, "mod.assess", `${username} (${target.userId}): bot ${assessment.botLikelihood}%, alt ${assessment.altLikelihood}% (${assessment.source})`);
  return json({ success: true, assessment: { ...assessment, at: now } });
}
