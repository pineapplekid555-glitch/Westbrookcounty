import { test } from "node:test";
import assert from "node:assert";
import { search } from "./lib/knowledge.js";
import { decide, isTicketChannel, staffActive } from "./lib/ticket.js";
const chunks = [{ text: "## Livery\nsubmit liveries", words: new Set(["livery", "submit", "liveries"]) }];
test("search", () => { assert.equal(search(chunks, "how to submit a livery").length, 1); assert.equal(search(chunks, "xyz").length, 0); });
test("decide", () => {
  const ok = { ok: true, needsHuman: false, confidence: 0.9 };
  assert.equal(decide({ text: "hi", botReplies: 0, maxReplies: 3, ai: ok }), "answer");
  assert.equal(decide({ text: "I want a real person", botReplies: 0, maxReplies: 3, ai: ok }), "handoff");
  assert.equal(decide({ text: "hi", botReplies: 3, maxReplies: 3, ai: ok }), "handoff");
  assert.equal(decide({ text: "hi", botReplies: 0, maxReplies: 3, ai: { ...ok, confidence: 0.3 } }), "handoff");
  assert.equal(decide({ text: "hi", botReplies: 0, maxReplies: 3, ai: { ok: false } }), "handoff");
});
test("channel + staff", () => {
  const cfg = { categoryIds: ["9"], prefixes: ["ticket-"] };
  assert.ok(isTicketChannel({ name: "Ticket-0001" }, cfg)); assert.ok(isTicketChannel({ name: "x", parentId: "9" }, cfg)); assert.ok(!isTicketChannel({ name: "general" }, cfg));
  assert.ok(staffActive([{ isStaff: true }])); assert.ok(!staffActive([{ isStaff: false }]));
});
