import { jsonBody, route } from "@/lib/api/handler";
import { PushSubscriptionBody, PushUnsubscribeBody } from "@/lib/api/schemas";
import { pushStatus, removePushSubscription, savePushSubscription } from "@/lib/data";
// Web push subscriptions for the signed-in user's browsers and installed app.
export const GET = route((_r, v) => pushStatus(v));
export const POST = route(async (req, v) => savePushSubscription(v, await jsonBody(req, PushSubscriptionBody), req.headers.get("user-agent")));
export const DELETE = route(async (req, v) => removePushSubscription(v, (await jsonBody(req, PushUnsubscribeBody)).endpoint));
