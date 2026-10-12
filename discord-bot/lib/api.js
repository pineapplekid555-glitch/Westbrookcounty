export async function ask(cfg, payload) {
  try {
    const res = await fetch(cfg.siteUrl.replace(/\/$/, "") + "/api/bot/ask", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + cfg.secret },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    });
    return await res.json();
  } catch {
    return { ok: false };
  }
}
