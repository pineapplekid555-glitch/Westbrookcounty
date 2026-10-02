const ALLOWED_METHODS = ["GET", "POST"];

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
  const id = new URL(context.request.url).searchParams.get("id");
  if (id) {
    if (!validId(id)) return json({ success:false, error:"Invalid Roblox asset ID." }, 400);
    try {
      const imageUrl = await getAssetPreview(id);
      return json({ success:true, assetId:id, imageUrl, status:"pending_review" });
    } catch {
      return json({ success:false, error:"Unable to retrieve that Roblox asset." }, 404);
    }
  }

  return json({
    success: true,
    message: "Livery submissions require an asset ID and are awaiting AI review.",
    submissions: []
  });
}

export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); } catch {
    return json({ success:false, error:"Invalid JSON." }, 400);
  }

  const assetId = String(body.assetId || "").trim();
  const playerName = String(body.playerName || "").trim().slice(0, 50);

  if (!validId(assetId)) {
    return json({ success:false, error:"Enter a valid Roblox texture/decal ID." }, 400);
  }

  try {
    const imageUrl = await getAssetPreview(assetId);
    return json({
      success: true,
      submission: {
        id: crypto.randomUUID(),
        assetId,
        playerName,
        imageUrl,
        status: "pending_review",
        aiRecommendation: null,
        aiConfidence: null,
        aiReasons: []
      }
    }, 202);
  } catch {
    return json({ success:false, error:"That Roblox asset could not be previewed." }, 404);
  }
}
