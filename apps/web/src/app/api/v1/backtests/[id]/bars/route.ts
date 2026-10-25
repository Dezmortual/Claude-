import { route } from "@/lib/api/handler";
import { Uuid } from "@/lib/api/schemas";
import { runBars } from "@/lib/data";
// The prices a run traded on, for drawing its trades on a chart.
export const GET = route<{ id: string }>((_r, v, p) => runBars(v, Uuid.parse(p.id)));
