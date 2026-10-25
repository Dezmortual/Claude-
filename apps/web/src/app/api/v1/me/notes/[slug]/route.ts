import { jsonBody, route } from "@/lib/api/handler";
import { NoteBody } from "@/lib/api/schemas";
import { getNote, saveNote } from "@/lib/data";
// Your research note on one asset.
export const GET = route<{ slug: string }>((_r, v, p) => getNote(v, p.slug));
export const PUT = route<{ slug: string }>(async (req, v, p) => saveNote(v, p.slug, (await jsonBody(req, NoteBody)).body));
