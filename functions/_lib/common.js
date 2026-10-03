// Shared helpers for the Roblox -> website review APIs.
// This folder has no onRequest* exports, so Cloudflare Pages does not turn it into a route.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    }
  });
}

// Compares in constant time so the key can't be recovered by timing requests.
function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

// Only the Roblox game servers should be able to call these endpoints.
// They send:  Authorization: Bearer <ROBLOX_API_KEY>
export function checkAuth(request, env) {
  if (!env.ROBLOX_API_KEY) {
    return json({ success: false, error: "Server is not configured (ROBLOX_API_KEY missing)." }, 503);
  }
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !safeEqual(token, env.ROBLOX_API_KEY)) {
    return json({ success: false, error: "Unauthorized." }, 401);
  }
  return null;
}

export async function readJson(request, maxChars = 32768) {
  const text = await request.text();
  if (text.length > maxChars) throw new HttpError(413, "Payload too large.");
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value;
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}

// Strips control characters/newlines and caps length. Everything the game sends is
// player-influenced text, so it is cleaned before it goes anywhere near a prompt.
export function clean(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

// Optional audit trail: bind a KV namespace named REVIEWS to the Pages project and
// every AI decision is kept for 30 days so staff can check what the AI said.
export function storeResult(context, kind, id, record) {
  const kv = context.env.REVIEWS;
  if (!kv) return;
  const key = `${kind}:${Date.now()}:${id}`;
  context.waitUntil(
    kv.put(key, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 30 }).catch(() => {})
  );
}
