// GET /api/staff/mod/resolve?q=<roblox username>  -> { userId, username } (asks Roblox; for people who never joined the game)
import { requireStaff, LEVEL } from "../../../_lib/staffAuth.js";
import { json } from "../../../_lib/common.js";
import { resolveRoblox } from "../../../_lib/moderation.js";

export async function onRequestGet(context) {
  const auth = await requireStaff(context, LEVEL.staff);
  if (auth.response) return auth.response;
  const q = (new URL(context.request.url).searchParams.get("q") || "").trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(q)) return json({ success: false, error: "That is not a valid Roblox username." }, 400);
  const r = await resolveRoblox(q);
  if (!r) return json({ success: false, error: "Roblox did not find that username. Try the user id." }, 404);
  return json({ success: true, userId: r.userId, username: r.username });
}
