// GET /api/v1/server/logs   (header: server-key)   all log types, or ?type=join,leave,team,command
import { logsResponse } from "../../../_lib/serverApiLogs.js";

export const onRequestGet = (context) => logsResponse(context, ["join", "leave", "team", "command"]);
