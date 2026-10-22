import { jsonBody, route } from "@/lib/api/handler";
import { DeliveryBody } from "@/lib/api/schemas";
import { deliverySettings, updateDeliverySettings } from "@/lib/data";
// F6: mute all, quiet hours, one email per alert or a daily summary.
export const GET = route((_r, v) => deliverySettings(v));
export const PATCH = route(async (req, v) => updateDeliverySettings(v, await jsonBody(req, DeliveryBody)));
