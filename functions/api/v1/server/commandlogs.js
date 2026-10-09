// GET /api/v1/server/commandlogs   (header: server-key)   commands sent through the API and their result
import { logsResponse } from "../../../_lib/serverApiLogs.js";

export const onRequestGet = (context) => logsResponse(context, ["command"]);
