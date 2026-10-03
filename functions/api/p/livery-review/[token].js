// Hidden URL: /api/p/livery-review/<PRIVATE_API_PATH>
import { hiddenRoute } from "../../../_lib/privateRoute.js";
import { handle } from "../../../_lib/handlers/livery.js";

const route = hiddenRoute(handle);
export const onRequestPost = route.onRequestPost;
export const onRequest = route.onRequest;
