// GET /api/v1/server/joinlogs   (header: server-key)   joins and leaves
import { logsResponse } from "../../../_lib/serverApiLogs.js";

export const onRequestGet = (context) => logsResponse(context, ["join", "leave"]);
