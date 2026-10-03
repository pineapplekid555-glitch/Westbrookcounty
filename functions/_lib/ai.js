// Provider-agnostic AI caller. The review endpoints call askAI(env, parts) and don't care
// which company answers. Set whichever keys you have in Cloudflare (Settings -> Variables
// and Secrets); every configured provider is tried in order until one gives a usable answer,
// so a rate limit or outage at one provider falls through to the next.
//
//   AI_PROVIDER         optional: "anthropic" | "openai" | "gemini" | "workers-ai" (tried first)
//   ANTHROPIC_API_KEY   -> Claude   (model: ANTHROPIC_MODEL, default claude-haiku-4-5-20251001)
//   OPENAI_API_KEY      -> OpenAI   (model: OPENAI_MODEL,    default gpt-4o-mini)
//   GEMINI_API_KEY      -> Gemini   (model: GEMINI_MODEL,    default gemini-3.7-flash)
//   AI binding          -> Cloudflare Workers AI (model: WORKERS_AI_MODEL). TEXT ONLY, so it can
//                          review anti-cheat flags and livery names, but not livery images.
//
// `parts` is [{ text }, { inline_data: { mime_type, data } }, ...]. Returns
// { ok: true, model, provider, value } or { ok: false, error }.

const TIMEOUT_MS = 25000;

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object");
  return JSON.parse(text.slice(start, end + 1));
}

const hasImages = (parts) => parts.some((p) => p.inline_data);

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

const PROVIDERS = {
  anthropic: {
    configured: (env) => !!env.ANTHROPIC_API_KEY,
    async run(env, parts) {
      const model = env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
      const content = parts.map((p) =>
        p.inline_data
          ? { type: "image", source: { type: "base64", media_type: p.inline_data.mime_type, data: p.inline_data.data } }
          : { type: "text", text: p.text }
      );
      const data = await postJson(
        "https://api.anthropic.com/v1/messages",
        { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        { model, max_tokens: 400, temperature: 0, messages: [{ role: "user", content }] }
      );
      const text = (data.content || []).map((c) => c.text || "").join("");
      return { model, text };
    }
  },

  openai: {
    configured: (env) => !!env.OPENAI_API_KEY,
    async run(env, parts) {
      const model = env.OPENAI_MODEL || "gpt-4o-mini";
      const content = parts.map((p) =>
        p.inline_data
          ? { type: "image_url", image_url: { url: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}` } }
          : { type: "text", text: p.text }
      );
      const data = await postJson(
        "https://api.openai.com/v1/chat/completions",
        { authorization: "Bearer " + env.OPENAI_API_KEY },
        { model, response_format: { type: "json_object" }, messages: [{ role: "user", content }] }
      );
      return { model, text: data.choices?.[0]?.message?.content || "" };
    }
  },

  gemini: {
    configured: (env) => !!env.GEMINI_API_KEY,
    async run(env, parts) {
      const model = env.GEMINI_MODEL || "gemini-3.7-flash";
      const data = await postJson(
        "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
        { "x-goog-api-key": env.GEMINI_API_KEY },
        { contents: [{ parts }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }
      );
      const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      return { model, text };
    }
  },

  "workers-ai": {
    configured: (env) => !!env.AI && typeof env.AI.run === "function",
    async run(env, parts) {
      if (hasImages(parts)) throw new Error("Workers AI path is text-only");
      const model = env.WORKERS_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
      const prompt = parts.map((p) => p.text).join("\n\n");
      const out = await env.AI.run(model, { messages: [{ role: "user", content: prompt }], max_tokens: 400 });
      const text = typeof out === "string" ? out : typeof out?.response === "string" ? out.response : JSON.stringify(out?.response ?? "");
      return { model, text };
    }
  }
};

// `prefer` lets one task jump the queue (anti-cheat prefers the free Workers AI so it doesn't
// burn the small free quota of an image-capable provider that liveries need).
function providerOrder(env, prefer) {
  const all = Object.keys(PROVIDERS).filter((name) => PROVIDERS[name].configured(env));
  const first = prefer && all.includes(prefer) ? prefer : env.AI_PROVIDER;
  return first && all.includes(first) ? [first, ...all.filter((n) => n !== first)] : all;
}

export async function askAI(env, parts, opts = {}) {
  const order = providerOrder(env, opts.prefer);
  if (order.length === 0) {
    return { ok: false, error: "No AI provider is configured (set ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY or add a Workers AI binding named AI)" };
  }

  const errors = [];
  for (const name of order) {
    // A text-only provider must never be allowed to "review" a livery by ignoring its images.
    if (name === "workers-ai" && hasImages(parts)) {
      errors.push("workers-ai: skipped (cannot read images)");
      continue;
    }
    try {
      const { model, text } = await PROVIDERS[name].run(env, parts);
      return { ok: true, provider: name, model, value: extractJson(text) };
    } catch (e) {
      errors.push(name + ": " + (e && e.message ? e.message : "failed"));
    }
  }
  return { ok: false, error: errors.join("; ") };
}
