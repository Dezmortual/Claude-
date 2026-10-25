import Link from "next/link";
import { redirect } from "next/navigation";
import { NotebookPen } from "lucide-react";
import { AssetMark, Card, EmptyState, Label } from "@/components/ui";
import { getAsset, listNotes } from "@/lib/data";
import { viewer } from "@/lib/session";

export const metadata = { title: "Notes" };

export default async function Notes() {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/notes");
  const notes = await listNotes(v);
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Label>Notes</Label>
        <h1 className="text-xl md:text-display">Your research notes</h1>
        <p className="max-w-prose text-muted">One note per asset, written on its page. Only you can see them.</p>
      </div>
      {!notes.length ? <Card><EmptyState icon={<NotebookPen aria-hidden className="h-6 w-6" />} title="No notes yet">Open any asset and write in its Notes box.</EmptyState></Card> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {notes.map((n) => (
            <li key={n.slug}><Card className="grid h-full gap-2 p-4">
              <Link href={`/assets/${n.slug}#notes`} className="flex items-center gap-2 font-semibold hover:underline">
                {getAsset(n.slug) && <AssetMark ticker={getAsset(n.slug)!.ticker} slug={n.slug} />}{n.name}
              </Link>
              <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted">{n.body}</p>
              <p className="text-2xs text-subtle">Edited {new Date(n.updatedAt).toLocaleString("en-GB", { timeZone: v.user!.timezone, dateStyle: "medium", timeStyle: "short" })}</p>
            </Card></li>
          ))}
        </ul>
      )}
    </div>
  );
}
