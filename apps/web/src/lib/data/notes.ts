import "server-only";
// Research notes: one per asset, private to the owner who wrote them.
import { sql } from "@/lib/server/db";
import { ASSET_BY_SLUG } from "./catalogue";
import { requireUser } from "./live";
import { DataError, type Viewer } from "./types";

export type Note = { slug: string; name: string; body: string; updatedAt: string };

export async function getNote(v: Viewer, slug: string): Promise<Note | null> {
  const u = requireUser(v);
  const [r] = await sql()<{ body: string; updated_at: Date }[]>`select body, updated_at from asset_notes where user_id = ${u.id} and slug = ${slug}`;
  return r ? { slug, name: ASSET_BY_SLUG.get(slug)?.name ?? slug, body: r.body, updatedAt: r.updated_at.toISOString() } : null;
}

/** An empty note is deleted rather than kept. */
export async function saveNote(v: Viewer, slug: string, body: string) {
  const u = requireUser(v);
  if (!ASSET_BY_SLUG.has(slug)) throw new DataError("not_found", "No such asset");
  if (!body.trim()) { await sql()`delete from asset_notes where user_id = ${u.id} and slug = ${slug}`; return { saved: false }; }
  await sql()`insert into asset_notes (user_id, slug, body) values (${u.id}, ${slug}, ${body})
    on conflict (user_id, slug) do update set body = excluded.body, updated_at = now()`;
  return { saved: true };
}

export async function listNotes(v: Viewer): Promise<Note[]> {
  const u = requireUser(v);
  return (await sql()<{ slug: string; body: string; updated_at: Date }[]>`select slug, body, updated_at from asset_notes where user_id = ${u.id} order by updated_at desc`)
    .map((r) => ({ slug: r.slug, name: ASSET_BY_SLUG.get(r.slug)?.name ?? r.slug, body: r.body, updatedAt: r.updated_at.toISOString() }));
}
