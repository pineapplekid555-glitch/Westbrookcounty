// Old fixed URL: /api/server-api. Only active while PRIVATE_API_PATH is NOT set.
// Once PRIVATE_API_PATH is set, the game uses /api/p/server-api/<PRIVATE_API_PATH> instead.
import { legacyRoute } from "../../_lib/privateRoute.js";
import { handle } from "../../_lib/handlers/serverApiGame.js";

const route = legacyRoute(handle);
export const onRequestPost = route.onRequestPost;
export const onRequest = route.onRequest;
