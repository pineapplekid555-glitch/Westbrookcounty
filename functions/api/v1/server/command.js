// POST /api/v1/server/command   (header: server-key)   body: { "command": ":h Hello everyone" }
// Queues one command for the owner's private server. The reply means "sent", not "done": the game runs it
// within a couple of seconds and records the result in /api/v1/server/commandlogs.
import {
  authenticate, parseSnapshot, offline, touchRead, publishToServer, apiError, rateLimit, rateLimited, nowSec, json
} from "../../../_lib/serverApi.js";
import { clean } from "../../../_lib/common.js";

const MAX_COMMAND = 300;

export async function onRequestPost(context) {
  const auth = await authenticate(context);
  if (auth.response) return auth.response;

  const wait = rateLimit("c:" + auth.keyHash, 10, 60_000);
  if (wait) return rateLimited(wait);

  let body;
  try {
    const text = await context.request.text();
    if (text.length > 2048) return apiError(413, 2004, "Request body too large.");
    body = JSON.parse(text);
  } catch {
    return apiError(400, 2003, 'Send JSON like {"command": ":h Hello"}.');
  }
  if (!body || typeof body !== "object" || typeof body.command !== "string") {
    return apiError(400, 2003, 'Missing "command" (a string).');
  }
  const command = clean(body.command, MAX_COMMAND);
  if (!command) {
    return apiError(400, 2003, 'Missing "command" (a string).');
  }
  if (String(body.command).trim().length > MAX_COMMAND) {
    return apiError(400, 2003, `Command too long (max ${MAX_COMMAND} characters).`);
  }

  // Don't spend Roblox messaging quota on servers that aren't running.
  if (!parseSnapshot(auth.row)) return offline();

  const id = crypto.randomUUID();
  const sent = await publishToServer(context.env, auth.row.topic, {
    id,
    t: nowSec(),
    kh: auth.keyHash,
    c: command,
    by: "api"
  });
  if (!sent.ok) {
    if (sent.status === 429) return rateLimited(10);
    if (sent.reason === "not_configured") {
      return apiError(503, 5000, "Commands are not set up on this website yet (missing Open Cloud key).");
    }
    return apiError(502, 5002, "Could not reach Roblox to send the command. Try again in a moment.");
  }
  touchRead(context, auth);
  return json({ message: "Success", commandId: id });
}
