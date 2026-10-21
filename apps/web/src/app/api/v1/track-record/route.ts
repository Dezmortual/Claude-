import { route } from "@/lib/api/handler";
import { trackRecord } from "@/lib/data";
export const GET = route(() => trackRecord(), 300);
