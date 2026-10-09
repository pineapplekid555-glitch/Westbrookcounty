// Hidden URL: /api/p/server-api/<PRIVATE_API_PATH>   (game servers only)
import { hiddenRoute } from "../../../_lib/privateRoute.js";
import { handle } from "../../../_lib/handlers/serverApiGame.js";

const route = hiddenRoute(handle);
export const onRequestPost = route.onRequestPost;
export const onRequest = route.onRequest;
