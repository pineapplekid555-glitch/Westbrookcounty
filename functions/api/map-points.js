// PUBLIC endpoint: GET /api/map-points
// The places, street names, postal codes and building numbers of the map, with their game
// coordinates and the map bounds, so other tools can draw their own labels on the map images.
// Data comes from assets/maps/map-data.json (written by tools/export_map.py).
//
// To turn a game position (x, z) into a pixel on a map image of size (width, height):
//   px = (x - bounds.minX) / (bounds.maxX - bounds.minX) * width
//   py = (z - bounds.minZ) / (bounds.maxZ - bounds.minZ) * height     (north-south: top row is minZ)

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
  try {
    const res = await context.env.ASSETS.fetch(new Request(origin + "/assets/maps/map-data.json"));
    if (res.ok) {
      const data = await res.json();
      return json(data, 200, { "cache-control": "public, max-age=300" });
    }
  } catch {
    // fall through to the not-published answer
  }
  return json({ success: false, error: "No map data has been published yet." }, 404, { "cache-control": "no-store" });
}
