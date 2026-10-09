// GET /api/v1/server/players   (header: server-key)
// [{ Player: "Name:UserId", Name, UserId, DisplayName, Permission, Team }]
import { authenticate, parseSnapshot, offline, touchRead, json } from "../../../_lib/serverApi.js";

export async function onRequestGet(context) {
  const auth = await authenticate(context);
  if (auth.response) return auth.response;
  const snap = parseSnapshot(auth.row);
  if (!snap) return offline();
  touchRead(context, auth);

  return json(
    (snap.players || []).map((p) => ({
      Player: `${p.name}:${p.userId}`,
      Name: p.name,
      UserId: p.userId,
      DisplayName: p.displayName,
      Permission: p.permission,
      Team: p.team
    }))
  );
}
