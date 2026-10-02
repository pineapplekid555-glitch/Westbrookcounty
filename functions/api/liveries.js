function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    }
  });
}

export async function onRequestGet() {
  return json({
    success: true,
    liveries: [],
    message: "Livery storage and moderation are not connected yet."
  });
}

export async function onRequestPost() {
  return json({
    success: false,
    error: "Livery submission is not enabled yet."
  }, 501);
}
