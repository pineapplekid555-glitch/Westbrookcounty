import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const STOP = new Set("the a an and or to of in on is it i my me you do how can what why for with this that are be of at".split(" "));
const words = (s) => (s.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w));

export function loadKnowledge(dir) {
  const chunks = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    for (const part of text.split(/\n(?=## )/)) {
      const t = part.trim();
      if (t.length > 20) chunks.push({ text: t.slice(0, 1200), words: new Set(words(t)) });
    }
  }
  return chunks;
}

export function search(chunks, question, n = 5) {
  const q = words(question);
  return chunks
    .map((c) => ({ c, s: q.reduce((a, w) => a + (c.words.has(w) ? 1 : 0), 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.c.text);
}
