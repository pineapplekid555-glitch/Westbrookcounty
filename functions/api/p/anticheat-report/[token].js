// Hidden URL: /api/p/anticheat-report/<PRIVATE_API_PATH>
import { hiddenRoute } from "../../../_lib/privateRoute.js";
import { handle } from "../../../_lib/handlers/anticheat.js";

const route = hiddenRoute(handle);
export const onRequestPost = route.onRequestPost;
export const onRequest = route.onRequest;
