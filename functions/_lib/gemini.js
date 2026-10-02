// Thin wrapper around the Gemini API. The API key lives only in Cloudflare
// (Pages -> Settings -> Variables and Secrets -> GEMINI_API_KEY), never in Roblox.

export async function askGemini(env, parts) {
  if (!env.GEMINI_API_KEY) {
    return { ok: false, error: "GEMINI_API_KEY is not configured" };
  }

  const model = env.GEMINI_MODEL || "gemini-3.7-flash";
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent";

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 }
      }),
      signal: AbortSignal.timeout(25000)
    });
  } catch {
    return { ok: false, error: "Gemini request failed or timed out" };
  }

  if (!res.ok) return { ok: false, error: "Gemini returned HTTP " + res.status };

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: "Gemini sent an unreadable response" };
  }

  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  const stripped = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();

  try {
    return { ok: true, model, value: JSON.parse(stripped) };
  } catch {
    return { ok: false, error: "Gemini did not return valid JSON" };
  }
}
