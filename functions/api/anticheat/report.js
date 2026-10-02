import { json, checkAuth, readJson, clean, storeResult, HttpError } from "../../_lib/common.js";
import { askGemini } from "../../_lib/gemini.js";
import { buildAntiCheatPrompt } from "../../_lib/guidelines.js";

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

export async function onRequestPost(context) {
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
    storeResult(context, "anticheat", reviewId, { reviewId, report, result, ...extra, at: new Date().toISOString() });
    return json({ success: true, reviewId, ...result, ...extra });
  };

  const ai = await askGemini(context.env, [{ text: buildAntiCheatPrompt(report) }]);
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
