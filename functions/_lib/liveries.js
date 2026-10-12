// Flagged custom liveries (AI said "rejected" or "needs a human") show up on the Moderation page's Liveries tab.
// Staff approve or reject there; the decision is queued for the game's :livery system (type "livery" in mod_queue).
// The game can also tell us when its own staff decided (action "liveryEvent"), so both sides stay in step.
import { clean } from "./common.js";
import { nowSec } from "./staffAuth.js";

let checked = false;
export async function ensureLiveriesTable(DB) {
  if (checked) return;
  try {
    await DB.prepare("CREATE TABLE IF NOT EXISTS mod_liveries (id INTEGER PRIMARY KEY AUTOINCREMENT, review_id TEXT NOT NULL DEFAULT '', game_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', vehicle TEXT NOT NULL DEFAULT '', user_id INTEGER, username TEXT NOT NULL DEFAULT '', slots TEXT NOT NULL DEFAULT '[]', ai_status TEXT NOT NULL DEFAULT '', ai_reason TEXT NOT NULL DEFAULT '', decision TEXT NOT NULL DEFAULT 'pending', decided_by TEXT NOT NULL DEFAULT '', decided_at INTEGER, decided_reason TEXT NOT NULL DEFAULT '', applied TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)").run();
    await DB.prepare("CREATE INDEX IF NOT EXISTS idx_mod_liveries_decision ON mod_liveries (decision, id)").run();
  } catch { /* ignore */ }
  checked = true;
}

// Called when the review API finishes. Only flagged liveries are kept (approved ones need nobody).
export async function recordFlagged(DB, meta, status, reason, gameId = "") {
  if (!DB || status === "approved") return;
  await ensureLiveriesTable(DB);
  const now = nowSec();
  const slots = JSON.stringify((meta.slots || []).map((s) => ({ slot: s.slot, assetId: s.assetId })));
  if (gameId) {
    const old = await DB.prepare("SELECT id FROM mod_liveries WHERE game_id = ?1 AND decision = 'pending'").bind(gameId).first();
    if (old) {
      await DB.prepare("UPDATE mod_liveries SET review_id = ?1, name = ?2, vehicle = ?3, slots = ?4, ai_status = ?5, ai_reason = ?6 WHERE id = ?7")
        .bind(meta.reviewId, meta.liveryName, meta.vehicleType || "", slots, status, clean(reason, 400), old.id).run();
      return;
    }
  }
  await DB.prepare("INSERT INTO mod_liveries (review_id, game_id, name, vehicle, user_id, username, slots, ai_status, ai_reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)")
    .bind(meta.reviewId, gameId, meta.liveryName, meta.vehicleType || "", meta.userId || null, meta.username || "", slots, status, clean(reason, 400), now).run();
}

export function shapeLivery(r) {
  let slots = [];
  try { slots = JSON.parse(r.slots); } catch { /* ignore */ }
  return {
    id: r.id, gameId: r.game_id, name: r.name, vehicle: r.vehicle, userId: r.user_id, username: r.username,
    slots: slots.filter((s) => /^\d{3,20}$/.test(String(s.assetId))).map((s) => ({ slot: String(s.slot), assetId: String(s.assetId) })),
    aiStatus: r.ai_status, aiReason: r.ai_reason, decision: r.decision, decidedBy: r.decided_by, decidedAt: r.decided_at,
    decidedReason: r.decided_reason, applied: r.applied, at: r.created_at
  };
}
