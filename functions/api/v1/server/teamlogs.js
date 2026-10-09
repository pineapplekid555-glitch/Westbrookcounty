// GET /api/v1/server/teamlogs   (header: server-key)   team changes (e.g. someone becoming Police)
import { logsResponse } from "../../../_lib/serverApiLogs.js";

export const onRequestGet = (context) => logsResponse(context, ["team"]);
