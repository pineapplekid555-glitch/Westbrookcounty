// POST /api/staff/logout  - ends the session on the server and clears the cookie.
import { parseCookies, cookie, sha256Hex, getDB, SESSION_COOKIE } from "../../_lib/staffAuth.js";
import { json, safeEqual } from "../../_lib/common.js";

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("origin") || "";
  if (!safeEqual(origin, new URL(request.url).origin)) return json({ success: false, error: "Blocked: bad origin." }, 403);
  const token = parseCookies(request)[SESSION_COOKIE];
  const DB = getDB(env);
  if (DB && token && /^[0-9a-f]{64}$/.test(token)) {
    await DB.prepare("DELETE FROM staff_sessions WHERE token_hash = ?1").bind(await sha256Hex(token)).run();
  }
  const res = json({ success: true });
  res.headers.append("set-cookie", cookie(SESSION_COOKIE, "", 0));
  return res;
}
