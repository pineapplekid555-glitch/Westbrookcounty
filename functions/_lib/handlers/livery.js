import { json, checkAuth, readJson, clean, storeResult, HttpError } from "../common.js";
import { askAI } from "../ai.js";
import { buildLiveryPrompt } from "../guidelines.js";

// POST /api/livery/review
// Called by the Roblox game server (LiveryModerationHandler) with:
//   { liveryName, vehicleType?, submittedBy?: { userId, username },
//     textures: { "<slot name>": "<roblox asset id>", ... } }   (0-5 textures)
// Replies 200 with { success, status: "approved" | "rejected" | "needs_human", reason }.
// "needs_human" means the AI could not give a verdict (outage, bad config...) - the game
// leaves the livery queued for staff instead of approving or rejecting it.

const MAX_TEXTURES = 5;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// "reject" = the submitter's problem (bad/unready image). "infra" = our/Roblox's problem.
class ImageError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

function toBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchRobloxImage(assetId) {
  let thumb;
  try {
    thumb = await fetch(
      "https://thumbnails.roblox.com/v1/assets?assetIds=" +
        encodeURIComponent(assetId) +
        "&size=420x420&format=Png&isCircular=false",
      { signal: AbortSignal.timeout(10000) }
    );
  } catch {
    throw new ImageError("infra", "Roblox thumbnail service unreachable");
  }
  if (!thumb.ok) throw new ImageError("infra", "Roblox thumbnail service returned " + thumb.status);

  let entry;
  try {
    entry = (await thumb.json())?.data?.[0];
  } catch {
    throw new ImageError("infra", "Roblox thumbnail service sent an unreadable response");
  }

  if (!entry || entry.state !== "Completed" || !entry.imageUrl) {
    throw new ImageError("reject", "That image isn't available or ready to be reviewed yet - check the asset ID or try again later");
  }

  // Only ever download from Roblox's image CDN.
  let imageUrl;
  try {
    imageUrl = new URL(entry.imageUrl);
  } catch {
    throw new ImageError("infra", "Roblox returned a bad image URL");
  }
  if (imageUrl.protocol !== "https:" || !imageUrl.hostname.endsWith(".rbxcdn.com")) {
    throw new ImageError("infra", "Roblox returned an unexpected image host");
  }

  let img;
  try {
    img = await fetch(imageUrl.toString(), { signal: AbortSignal.timeout(10000) });
  } catch {
    throw new ImageError("infra", "Couldn't download that image");
  }
  if (!img.ok) throw new ImageError("infra", "Image download returned " + img.status);

  const bytes = new Uint8Array(await img.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new ImageError("reject", "That image is empty or too large to review");
  }

  const mime = (img.headers.get("content-type") || "image/png").split(";")[0];
  return { mime: mime.startsWith("image/") ? mime : "image/png", data: toBase64(bytes) };
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

  const liveryName = clean(body.liveryName, 80);
  if (!liveryName) return json({ success: false, error: "liveryName is required." }, 400);

  const slots = [];
  const rawTextures = body.textures && typeof body.textures === "object" ? body.textures : {};
  for (const [slot, assetId] of Object.entries(rawTextures)) {
    if (assetId === "" || assetId === null || assetId === undefined) continue;
    if (!/^[A-Za-z0-9_ -]{1,32}$/.test(slot)) {
      return json({ success: false, error: "Invalid texture slot name." }, 400);
    }
    if (!/^\d{3,20}$/.test(String(assetId))) {
      return json({ success: false, error: "Invalid Roblox asset ID for slot " + slot + "." }, 400);
    }
    slots.push({ slot, assetId: String(assetId) });
  }
  if (slots.length > MAX_TEXTURES) {
    return json({ success: false, error: "At most " + MAX_TEXTURES + " textures per livery." }, 400);
  }

  const reviewId = crypto.randomUUID();
  const meta = {
    reviewId,
    liveryName,
    vehicleType: clean(body.vehicleType, 80),
    userId: Number(body.submittedBy?.userId) || null,
    username: clean(body.submittedBy?.username, 50),
    slots
  };

  const finish = (status, reason, extra = {}) => {
    storeResult(context, "livery", reviewId, { ...meta, status, reason, ...extra, at: new Date().toISOString() });
    return json({ success: true, reviewId, status, reason, ...extra });
  };

  // Fetch every image at once.
  const images = await Promise.allSettled(slots.map((s) => fetchRobloxImage(s.assetId)));
  const parts = [{ text: buildLiveryPrompt(liveryName) }];

  for (let i = 0; i < slots.length; i++) {
    const result = images[i];
    if (result.status === "rejected") {
      const err = result.reason;
      if (err instanceof ImageError && err.kind === "reject") {
        return finish("rejected", slots[i].slot + ": " + err.message);
      }
      return finish("needs_human", "Couldn't load an image for review - needs manual review");
    }
    parts.push({ text: 'Image for slot "' + slots[i].slot + '":' });
    parts.push({ inline_data: { mime_type: result.value.mime, data: result.value.data } });
  }

  const ai = await askAI(context.env, parts);
  if (!ai.ok) {
    return finish("needs_human", "Automatic review is unavailable right now - needs manual review", { error: ai.error });
  }

  const verdict = ai.value;
  if (!verdict || typeof verdict.approved !== "boolean") {
    return finish("needs_human", "Automatic review gave an unexpected answer - needs manual review", { model: ai.model });
  }

  const reason = clean(verdict.reason, 300) || (verdict.approved ? "Approved." : "Rejected.");
  return finish(verdict.approved ? "approved" : "rejected", reason, { model: ai.model });
}
