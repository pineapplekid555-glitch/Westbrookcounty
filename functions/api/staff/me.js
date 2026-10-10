// GET /api/staff/me  - who am I? (used by the page to decide between the login screen and the portal)
import { requireStaff, LEVEL_NAME } from "../../_lib/staffAuth.js";
import { json } from "../../_lib/common.js";

export async function onRequestGet(context) {
  const auth = await requireStaff(context);
  if (auth.response) return auth.response;
  const u = auth.user;
  return json({ success: true, id: u.id, name: u.name, avatar: u.avatar, level: u.level, levelName: LEVEL_NAME[u.level] });
}
