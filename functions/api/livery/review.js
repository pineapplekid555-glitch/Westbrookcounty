// Old fixed URL: /api/livery/review. Only active while PRIVATE_API_PATH is NOT set.
// Once PRIVATE_API_PATH is set, use /api/p/livery-review/<PRIVATE_API_PATH> instead.
import { legacyRoute } from "../../_lib/privateRoute.js";
import { handle } from "../../_lib/handlers/livery.js";

const route = legacyRoute(handle);
export const onRequestPost = route.onRequestPost;
export const onRequest = route.onRequest;
