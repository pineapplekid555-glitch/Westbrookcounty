// GET /api/staff/callback  - Discord sends the member back here after they log in.
// We check their roles in the staff Discord server. No staff role = no session, nothing is stored.
import { safeEqual } from "../../_lib/common.js";
import {
  isConfigured, levelFor, createSession, audit, getDB, parseCookies, cookie,
  SESSION_COOKIE, STATE_COOKIE, SESSION_SECONDS, ID_RE, LEVEL, nowSec
} from "../../_lib/staffAuth.js";

const back = (origin, code, extraHeaders = {}) => {
  const headers = new Headers({ location: `${origin}/pages/staff.html${code ? "?e=" + code : ""}`, "cache-control": "no-store" });
  headers.append("set-cookie", cookie(STATE_COOKIE, "", 0));
  for (const [k, v] of Object.entries(extraHeaders)) headers.append(k, v);
  return new Response(null, { status: 302, headers });
};

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const origin = url.origin;
  if (!isConfigured(env)) return back(origin, "setup");

  const state = url.searchParams.get("state") || "";
  const saved = parseCookies(request)[STATE_COOKIE] || "";
  if (!state || !saved || !safeEqual(state, saved)) return back(origin, "state");
  const code = url.searchParams.get("code");
  if (!code) return back(origin, "denied");

  let accessToken;
  try {
    const res = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: origin + "/api/staff/callback"
      })
    });
    if (!res.ok) return back(origin, "discord");
    accessToken = (await res.json()).access_token;
  } catch {
    return back(origin, "discord");
  }
  if (!accessToken) return back(origin, "discord");

  const auth = { authorization: "Bearer " + accessToken };
  let me;
  let member = null;
  try {
    const meRes = await fetch("https://discord.com/api/users/@me", { headers: auth });
    if (!meRes.ok) return back(origin, "discord");
    me = await meRes.json();
    const memRes = await fetch(`https://discord.com/api/users/@me/guilds/${encodeURIComponent(env.DISCORD_GUILD_ID)}/member`, { headers: auth });
    if (memRes.ok) member = await memRes.json();
  } catch {
    return back(origin, "discord");
  } finally {
    // We only needed Discord for this one check; give the token back.
    context.waitUntil(
      fetch("https://discord.com/api/oauth2/token/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, token: accessToken })
      }).catch(() => {})
    );
  }

  if (!me || !ID_RE.test(String(me.id))) return back(origin, "discord");
  const level = levelFor(env, me.id, member?.roles);
  if (level === LEVEL.none) return back(origin, "noaccess");

  const name = String(member?.nick || me.global_name || me.username || "Staff").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 40);
  const avatar = /^[a-f0-9_]{1,40}$/i.test(String(me.avatar || "")) ? String(me.avatar) : "";
  const user = { id: String(me.id), name, avatar, level };

  const DB = getDB(env);
  const now = nowSec();
  await DB.prepare(
    `INSERT INTO staff_roster (discord_id, name, avatar, rank, notes, first_login, last_login)
     VALUES (?1, ?2, ?3, '', '', ?4, ?4)
     ON CONFLICT(discord_id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar, last_login = excluded.last_login`
  ).bind(user.id, name, avatar, now).run();

  const token = await createSession(env, user);
  await audit(env, user, "login", `level ${level}`);
  return back(origin, "", { "set-cookie": cookie(SESSION_COOKIE, token, SESSION_SECONDS) });
}
