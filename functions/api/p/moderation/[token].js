// Hidden URL: /api/p/moderation/<PRIVATE_API_PATH>
import { hiddenRoute } from "../../../_lib/privateRoute.js";
import { handle } from "../../../_lib/handlers/moderation.js";

const route = hiddenRoute(handle);
export const onRequestPost = route.onRequestPost;
export const onRequest = route.onRequest;
