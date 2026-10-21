import { route } from "@/lib/api/handler";
import { listPlans } from "@/lib/data";
export const GET = route(() => listPlans(), 300);
