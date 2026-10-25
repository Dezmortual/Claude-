import { route } from "@/lib/api/handler";
import { headlineNote } from "@/lib/data";
// A desk note on the latest headlines, written by Claude and kept for an hour.
export const maxDuration = 120;
export const POST = route((_r, v) => headlineNote(v));
