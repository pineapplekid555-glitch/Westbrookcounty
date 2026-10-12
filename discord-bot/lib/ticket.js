// Pure decision helpers (no Discord objects) so they can be tested.
export const HUMAN_WORDS = /\b(human|real person|staff member|speak to (a )?(staff|someone|admin)|talk to (a )?(staff|someone|admin)|moderator|admin please)\b/i;

export function isTicketChannel(ch, cfg) {
  if (!ch || !ch.name) return false;
  if (cfg.categoryIds.includes(ch.parentId)) return true;
  return cfg.prefixes.some((p) => p && ch.name.toLowerCase().startsWith(p.toLowerCase()));
}

// msgs: [{ authorBot, isStaff }] newest first. Stay quiet if staff spoke recently.
export function staffActive(msgs) {
  return msgs.slice(0, 20).some((m) => m.isStaff && !m.authorBot);
}

export function decide({ text, botReplies, maxReplies, ai }) {
  if (HUMAN_WORDS.test(text)) return "handoff";
  if (botReplies >= maxReplies) return "handoff";
  if (!ai || !ai.ok || ai.needsHuman || ai.confidence < 0.6) return "handoff";
  return "answer";
}
