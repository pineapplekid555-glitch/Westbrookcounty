function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    }
  });
}

function validId(value) {
  return /^\d{3,20}$/.test(String(value || ""));
}

async function getAssetImageResponse(assetId) {
  const r = await fetch(
    "https://assetdelivery.roblox.com/v1/asset/?id=" + encodeURIComponent(assetId),
    { redirect: "follow" }
  );

  if (!r.ok) throw new Error("Roblox asset request failed");

  const type = r.headers.get("content-type") || "application/octet-stream";
  if (!type.startsWith("image/")) throw new Error("Roblox asset is not an image");

  return new Response(r.body, {
    status: 200,
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=300"
    }
  });
}

async function getAssetPreview(assetId) {
  const r = await fetch(
    "https://thumbnails.roblox.com/v1/assets?assetIds=" +
      encodeURIComponent(assetId) +
      "&returnPolicy=PlaceHolder&size=420x420&format=Png&isCircular=false"
  );

  if (!r.ok) throw new Error("Roblox thumbnail request failed");

  const data = await r.json();
  const item = data.data?.[0];

  if (!item?.imageUrl) throw new Error("Roblox asset thumbnail unavailable");

  return item.imageUrl;
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const id = requestUrl.searchParams.get("id");

  if (requestUrl.searchParams.get("image") === "1") {
    if (!validId(id)) {
      return json({ success: false, error: "Invalid Roblox asset ID." }, 400);
    }
    try {
      return await getAssetImageResponse(id);
    } catch {
      return json({ success: false, error: "Unable to load that Roblox image asset." }, 404);
    }
  }

  if (id) {
    if (!validId(id)) {
      return json({ success: false, error: "Invalid Roblox asset ID." }, 400);
    }

    try {
      const imageUrl = await getAssetPreview(id);
      return json({
        success: true,
        assetId: id,
        imageUrl
      });
    } catch {
      return json({
        success: false,
        error: "Unable to retrieve that Roblox asset."
      }, 404);
    }
  }

  return json({
    success: true,
    submissions: []
  });
}

export async function onRequestPost(context) {
  let body;

  try {
    body = await context.request.json();
  } catch {
    return json({ success: false, error: "Invalid JSON." }, 400);
  }

  const playerName = String(body.playerName || "").trim().slice(0, 50);
  const vehicleName = String(body.vehicleName || "").trim().slice(0, 80);
  const surfaces = body.surfaces || {};

  const allowedSurfaces = ["left", "right", "front", "back", "top"];
  const providedSurfaces = allowedSurfaces.filter(
    (surface) => surfaces[surface] !== undefined && String(surfaces[surface]).trim() !== ""
  );

  if (providedSurfaces.length < 1 || providedSurfaces.length > 5) {
    return json({
      success: false,
      error: "Provide between 1 and 5 vehicle texture/decal IDs."
    }, 400);
  }

  for (const surface of providedSurfaces) {
    if (!validId(surfaces[surface])) {
      return json({
        success: false,
        error: "Invalid Roblox texture/decal ID for " + surface + "."
      }, 400);
    }
  }

  try {
    const previews = {};

    for (const surface of providedSurfaces) {
      previews[surface] = "https://www.roblox.com/asset-thumbnail/image?assetId=" +
        encodeURIComponent(String(surfaces[surface])) +
        "&width=420&height=420&format=png";
    }

    return json({
      success: true,
      submission: {
        id: crypto.randomUUID(),
        playerName,
        vehicleName,
        surfaces: Object.fromEntries(
          providedSurfaces.map((surface) => [surface, String(surfaces[surface])])
        ),
        previews,
        status: "pending_review",
        aiRecommendation: null,
        aiConfidence: null,
        aiReasons: []
      }
    }, 202);
  } catch {
    return json({
      success: false,
      error: "One or more Roblox assets could not be previewed."
    }, 404);
  }
}
