// POST /api/bot/ask  - used by the Discord ticket bot.  Authorization: Bearer <BOT_API_SECRET>
import { json, safeEqual, readJson, HttpError } from "../../_lib/common.js";
import { rateLimit } from "../../_lib/serverApi.js";
import { answerTicket } from "../../_lib/botAnswer.js";

export async function onRequestPost({ request, env }) {
  if (!env.BOT_API_SECRET) return json({ ok: false, error: "Not configured (BOT_API_SECRET missing)." }, 503);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const wait = rateLimit("bot:" + ip, 30, 60_000);
  if (wait) return json({ ok: false, error: "Rate limited." }, 429);
  const h = request.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token || !safeEqual(token, env.BOT_API_SECRET)) return json({ ok: false, error: "Unauthorized." }, 401);
  try {
    const body = await readJson(request, 16384);
    const out = await answerTicket(env, body);
    return json(out, out.ok ? 200 : out.error === "No question." ? 400 : 502);
  } catch (e) {
    if (e instanceof HttpError) return json({ ok: false, error: e.message }, e.status);
    return json({ ok: false, error: "Server error." }, 500);
  }
}
export const onRequest = () => json({ ok: false, error: "Method not allowed." }, 405);
