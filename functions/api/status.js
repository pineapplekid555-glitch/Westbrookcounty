export async function onRequestGet() {
  return new Response(JSON.stringify({
    online: true,
    service: "Westbrook County API",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    }
  });
}
