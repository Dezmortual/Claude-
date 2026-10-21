import { route } from "@/lib/api/handler";
import { alertEvents } from "@/lib/data";
export const GET = route((_r, v) => alertEvents(v));
