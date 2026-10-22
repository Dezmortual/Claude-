import { route } from "@/lib/api/handler";
import { sendTestPush } from "@/lib/data";
export const POST = route((_r, v) => sendTestPush(v));
