// Hidden URLs for the PRIVATE endpoints (the ones only the Roblox game calls).
//
// Your repo is public, so a secret URL can't be written in the code. Instead the secret part
// of the URL is a Cloudflare variable called PRIVATE_API_PATH, and the same text is stored in
// Roblox as the secret "westbrook_api_path". The real URLs then look like
//     https://westbrookcounty.co.uk/api/p/livery-review/<PRIVATE_API_PATH>
// and any other value (or no value) gets a plain "Not found", exactly like a page that does
// not exist. The Bearer key (ROBLOX_API_KEY) is STILL required on top of this.
//
// PRIVATE_API_PATH set (16+ characters):  only the hidden URLs work; the old fixed URLs 404.
// PRIVATE_API_PATH not set:               the old fixed URLs keep working (nothing breaks).
// Public endpoints (maps, stats, status...) are NOT affected and keep their plain URLs.

import { safeEqual } from "./common.js";

export const notFound = () =>
  new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
  });

// Route that lives at /api/p/<name>/[token]
export function hiddenRoute(handle) {
  return {
    onRequestPost(context) {
      const secret = String(context.env.PRIVATE_API_PATH || "");
      const given = String(context.params?.token ?? "");
      if (secret.length < 16 || !safeEqual(given, secret)) return notFound();
      return handle(context);
    },
    // every other method looks like nothing is here
    onRequest: () => notFound()
  };
}

// The original fixed URL, only alive while PRIVATE_API_PATH is not configured.
export function legacyRoute(handle) {
  return {
    onRequestPost(context) {
      return context.env.PRIVATE_API_PATH ? notFound() : handle(context);
    },
    onRequest: () => notFound()
  };
}
