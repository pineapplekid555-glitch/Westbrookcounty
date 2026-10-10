// GET /api/staff/login  - sends the visitor to Discord to log in.
import { isConfigured, randomHex, cookie, STATE_COOKIE } from "../../_lib/staffAuth.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!isConfigured(env)) return Response.redirect(url.origin + "/pages/staff.html?e=setup", 302);

  const state = randomHex(16);
  const auth = new URL("https://discord.com/oauth2/authorize");
  auth.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("redirect_uri", url.origin + "/api/staff/callback");
  auth.searchParams.set("scope", "identify guilds.members.read");
  auth.searchParams.set("state", state);
  auth.searchParams.set("prompt", "none");

  return new Response(null, {
    status: 302,
    headers: {
      location: auth.toString(),
      "set-cookie": cookie(STATE_COOKIE, state, 600),
      "cache-control": "no-store"
    }
  });
}
