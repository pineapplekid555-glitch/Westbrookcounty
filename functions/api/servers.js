export async function onRequestGet() {
  return new Response(JSON.stringify({
    success: true,
    servers: [],
    message: "Server reporting is not connected yet."
  }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    }
  });
}
