import { json, checkAuth, readJson, clean, storeResult, HttpError } from "../common.js";
import { askAI } from "../ai.js";
import { buildAntiCheatPrompt } from "../guidelines.js";
import { getDB, nowSec } from "../staffAuth.js";
import { recordAction, rememberName } from "../moderation.js";

// POST /api/anticheat/report
// Called by the Roblox game server every time the anti-cheat flags a player:
//   { player: { userId, username, accountAgeDays }, violationType, details,
//     outcome: "warning" | "auto_ban", recentFlags?: [{ type, details, secondsAgo }],
//     serverId?, placeId? }
// The AI only ADVISES. This endpoint never bans or unbans anyone - it returns a second
// opinion for staff, and (optionally) posts it to a Discord channel.

const VERDICTS = ["likely_exploit", "possible_false_positive", "inconclusive"];
const SEVERITIES = ["low", "medium", "high"];
const ACTIONS = ["none", "monitor", "staff_review"];

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function discordEmbed(report, result) {
  const colours = { high: 0xe74c3c, medium: 0xe67e22, low: 0xf1c40f };
  const banned = report.outcome === "auto_ban";
  return {
    embeds: [
      {
        title: banned ? "AI review: auto-ban" : "AI review: anti-cheat flag",
        color: colours[result.severity] || 0x95a5a6,
        fields: [
          { name: "Player", value: `${report.player.username} (${report.player.userId})`.slice(0, 256), inline: false },
          { name: "Violation", value: report.violationType.slice(0, 256), inline: true },
          { name: "AI verdict", value: `${result.verdict} (${Math.round(result.confidence * 100)}%)`, inline: true },
          { name: "Recommended", value: result.recommendedAction, inline: true },
          { name: "Reason", value: result.reason.slice(0, 1000) || "-", inline: false },
          { name: "Details", value: report.details.slice(0, 500) || "-", inline: false }
        ],
        footer: { text: "AI second opinion - staff make the final call" },
        timestamp: new Date().toISOString()
      }
    ]
  };
}

// Anti-cheat bans also appear on the staff website (Moderation page) with the AI's second opinion.
function logAutoBan(context, report, result, rowId) {
  if (report.outcome !== "auto_ban") return;
  const DB = getDB(context.env);
  if (!DB) return;
  const now = nowSec();
  context.waitUntil(
    (async () => {
      if (rowId) {
        await DB.prepare("UPDATE mod_actions SET ai_verdict = ?1, ai_reason = ?2 WHERE id = ?3")
          .bind(result.reviewed === false ? "" : result.verdict, result.reviewed === false ? "" : result.reason, rowId).run();
        return;
      }
      await rememberName(DB, report.player.userId, report.player.username, now);
      await recordAction(DB, {
        userId: report.player.userId, username: report.player.username, type: "ban", reason: report.violationType,
        notes: report.details, source: "auto", byName: "Anti-cheat",
        aiVerdict: result.reviewed === false ? "" : result.verdict, aiReason: result.reviewed === false ? "" : result.reason
      }, now);
    })().catch(() => {})
  );
}

export async function handle(context) {
  const denied = checkAuth(context.request, context.env);
  if (denied) return denied;

  let body;
  try {
    body = await readJson(context.request);
  } catch (e) {
    if (e instanceof HttpError) return json({ success: false, error: e.message }, e.status);
    return json({ success: false, error: "Bad request." }, 400);
  }

  const userId = Number(body.player?.userId);
  const violationType = clean(body.violationType, 60);
  if (!Number.isInteger(userId) || userId <= 0 || !violationType) {
    return json({ success: false, error: "player.userId and violationType are required." }, 400);
  }

  let autoBanRowId = null;
  // The game can report the same auto-ban several times (one per flag, per server, or on rejoin).
  // If this player's latest record is already an auto-ban from the last 15 minutes, don't log,
  // review or ping staff again.
  if (body.outcome === "auto_ban") {
    const DB = getDB(context.env);
    if (DB) {
      try {
        // one atomic statement: insert only if this player's latest record is not already a recent auto-ban
        const at = nowSec();
        const uname = clean(body.player?.username, 50);
        await rememberName(DB, userId, uname, at);
        const row = await DB.prepare(
          `INSERT INTO mod_actions (user_id, username, type, reason, notes, source, by_name, active, created_at)
           SELECT ?1, ?2, 'ban', ?3, ?4, 'auto', 'Anti-cheat', 1, ?5
           WHERE NOT EXISTS (
             SELECT 1 FROM mod_actions WHERE user_id = ?1 AND type = 'ban' AND source = 'auto' AND created_at > ?6
               AND id = (SELECT MAX(id) FROM mod_actions WHERE user_id = ?1)
           ) RETURNING id`
        ).bind(userId, uname, clean(body.violationType, 60), clean(body.details, 500), at, at - 900).first();
        if (!row) return json({ success: true, duplicate: true, reviewed: false });
        autoBanRowId = row.id;
      } catch {}
    }
  }

  const report = {
    player: {
      userId,
      username: clean(body.player?.username, 50),
      accountAgeDays: Math.max(0, Math.floor(Number(body.player?.accountAgeDays) || 0))
    },
    violationType,
    details: clean(body.details, 500),
    outcome: body.outcome === "auto_ban" ? "auto_ban" : "warning",
    recentFlags: (Array.isArray(body.recentFlags) ? body.recentFlags : []).slice(0, 10).map((f) => ({
      type: clean(f?.type, 60),
      details: clean(f?.details, 200),
      secondsAgo: Math.max(0, Math.floor(Number(f?.secondsAgo) || 0))
    })),
    serverId: clean(body.serverId, 64),
    placeId: Number(body.placeId) || null
  };

  const reviewId = crypto.randomUUID();
  const finish = (result, extra = {}) => {
    logAutoBan(context, report, result, autoBanRowId);
    storeResult(context, "anticheat", reviewId, { reviewId, report, result, ...extra, at: new Date().toISOString() });
    return json({ success: true, reviewId, ...result, ...extra });
  };

  // Prefer the free Cloudflare Workers AI for this text-only task; falls back to any other provider.
  const ai = await askAI(context.env, [{ text: buildAntiCheatPrompt(report) }], { prefer: "workers-ai" });
  if (!ai.ok || !ai.value || typeof ai.value !== "object") {
    return finish({ reviewed: false, verdict: "inconclusive", confidence: 0, severity: "low", recommendedAction: "staff_review", reason: "AI review unavailable." }, { error: ai.error || "Bad AI answer" });
  }

  const v = ai.value;
  const verdict = pick(v.verdict, VERDICTS, "inconclusive");
  let recommendedAction = pick(v.recommendedAction, ACTIONS, "staff_review");

  // Once a player has actually been auto-banned, the only useful questions for staff are
  // "does this ban stand?" and "should it be reversed?". Decided here, not by the model.
  if (report.outcome === "auto_ban") {
    recommendedAction =
      verdict === "likely_exploit" ? "ban_review" : verdict === "possible_false_positive" ? "unban_review" : "staff_review";
  }

  const confidence = Math.min(1, Math.max(0, Number(v.confidence) || 0));
  const result = {
    reviewed: true,
    verdict,
    confidence,
    severity: pick(v.severity, SEVERITIES, "low"),
    recommendedAction,
    reason: clean(v.reason, 400),
    model: ai.model
  };

  // Only ping staff for things that matter: bans, and flags the AI thinks are real.
  const webhook = context.env.DISCORD_ANTICHEAT_WEBHOOK;
  if (webhook && webhook.startsWith("https://") && (report.outcome === "auto_ban" || (verdict === "likely_exploit" && result.severity !== "low"))) {
    context.waitUntil(
      fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(discordEmbed(report, result))
      }).catch(() => {})
    );
  }

  return finish(result);
}
