// PUBLIC endpoint (no key needed, like ER:LC's /maps): GET /api/maps
// Returns the list of map image links:
//   { "maps": ["https://westbrookcounty.co.uk/assets/maps/westbrook_blank.png", ...], ... }
// The list comes from assets/maps/manifest.json, which tools/export_map.py writes for you.
// To update the map: re-bake in Studio, run the exporter, upload the new files to GitHub.

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type"
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS, ...extra }
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet(context) {
  const origin = new URL(context.request.url).origin;

  let manifest = null;
  try {
    const res = await context.env.ASSETS.fetch(new Request(origin + "/assets/maps/manifest.json"));
    if (res.ok) manifest = await res.json();
  } catch {
    manifest = null;
  }

  if (!manifest || !Array.isArray(manifest.files)) {
    return json({ maps: [], message: "No map has been published yet." }, 200, { "cache-control": "no-store" });
  }

  // Only plain image file names are ever turned into links.
  const maps = manifest.files
    .filter((f) => typeof f === "string" && /^[A-Za-z0-9_.-]+\.(png|jpg|jpeg|webp)$/i.test(f))
    .map((f) => origin + "/assets/maps/" + f);

  return json(
    {
      maps,
      updated: manifest.updated || null,
      size: manifest.size || null,
      studsPerPixel: manifest.studsPerPixel || null,
      bounds: manifest.bounds || null,
      data: origin + "/api/map-points"
    },
    200,
    { "cache-control": "public, max-age=300" }
  );
}
