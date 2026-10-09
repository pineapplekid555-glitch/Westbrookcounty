import { authenticate, touchRead, apiError, json } from "./serverApi.js";

// Shared by /logs, /joinlogs, /commandlogs and /teamlogs.
// Newest first. ?limit=1..100 (default 50), ?before=<log id> to page backwards.
const LABEL = { join: "Join", leave: "Leave", team: "Team", command: "Command" };

export async function logsResponse(context, types) {
  const auth = await authenticate(context);
  if (auth.response) return auth.response;

  const url = new URL(context.request.url);
  let types2 = types;
  const asked = url.searchParams.get("type");
  if (asked) {
    types2 = asked.toLowerCase().split(",").map((t) => t.trim()).filter((t) => t in LABEL);
    if (types.length < 4) types2 = types2.filter((t) => types.includes(t));
    if (!types2.length) return apiError(400, 2003, "Unknown log type. Use join, leave, team or command.");
  }
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
  const before = parseInt(url.searchParams.get("before") || "0", 10) || 0;

  const marks = types2.map((_, i) => `?${i + 3}`).join(",");
  const sql =
    `SELECT id, ts, type, data FROM server_api_logs
      WHERE private_server_id = ?1 AND type IN (${marks}) ${before ? `AND id < ?${types2.length + 3}` : ""}
      ORDER BY id DESC LIMIT ?2`;
  const binds = [auth.row.id, limit, ...types2];
  if (before) binds.push(before);

  let rows;
  try {
    rows = (await auth.DB.prepare(sql).bind(...binds).all()).results || [];
  } catch {
    return apiError(500, 5001, "Could not read the logs right now.");
  }
  touchRead(context, auth);

  return json(
    rows.map((r) => {
      let data = {};
      try {
        data = JSON.parse(r.data);
      } catch {
        /* keep empty */
      }
      const out = { Id: r.id, Timestamp: r.ts, Type: LABEL[r.type] || r.type };
      if (r.type === "command") {
        out.Source = data.by;
        out.Command = data.cmd;
        out.Arguments = data.args;
        out.Success = data.ok === true;
        out.Result = data.result;
      } else {
        out.Player = `${data.name}:${data.userId}`;
        out.Name = data.name;
        out.UserId = data.userId;
        if (r.type === "team") out.Team = data.team;
        if (r.type === "join") out.Join = true;
        if (r.type === "leave") out.Join = false;
      }
      return out;
    })
  );
}
