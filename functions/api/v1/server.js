// GET /api/v1/server   (header: server-key)
// Server info, like ER:LC's GET /v2/server. Data is the server's last report (usually under a minute old
// while the API is in use, up to ~4 minutes when nobody has used it for a while) - see UpdatedAt.
import { authenticate, parseSnapshot, offline, touchRead, nowSec, json } from "../../_lib/serverApi.js";

export async function onRequestGet(context) {
  const auth = await authenticate(context);
  if (auth.response) return auth.response;
  const snap = parseSnapshot(auth.row);
  if (!snap) return offline();
  touchRead(context, auth);

  const s = snap.server || {};
  return json({
    Name: s.name,
    OwnerId: s.ownerId,
    OwnerName: s.ownerName,
    CoOwnerIds: s.coOwnerIds || [],
    CurrentPlayers: s.currentPlayers,
    MaxPlayers: s.maxPlayers,
    JoinKey: s.joinKey,
    TeamBalance: s.teamBalance || {},
    UpdatedAt: auth.row.updated_at,
    AgeSeconds: Math.max(0, nowSec() - Number(auth.row.updated_at))
  });
}
