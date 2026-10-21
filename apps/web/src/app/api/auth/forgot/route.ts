import { jsonBody, route } from "@/lib/api/handler";
import { requestPasswordReset } from "@/lib/data";
export const POST = route(async (req) => requestPasswordReset((await jsonBody<{ email: string }>(req)).email ?? ""));
