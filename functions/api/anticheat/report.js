// Old fixed URL: /api/anticheat/report. Only active while PRIVATE_API_PATH is NOT set.
// Once PRIVATE_API_PATH is set, use /api/p/anticheat-report/<PRIVATE_API_PATH> instead.
import { legacyRoute } from "../../_lib/privateRoute.js";
import { handle } from "../../_lib/handlers/anticheat.js";

const route = legacyRoute(handle);
export const onRequestPost = route.onRequestPost;
export const onRequest = route.onRequest;
