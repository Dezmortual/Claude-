import { notFound, redirect } from "next/navigation";
import { IndicatorEditor } from "@/components/client/IndicatorEditor";
import { Label } from "@/components/ui";
import { alertableAssets, DataError, getIndicator } from "@/lib/data";
import { viewer } from "@/lib/session";

export const metadata = { title: "Edit indicator" };

export default async function EditIndicator({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await viewer();
  if (!v.user) redirect(`/sign-in?next=/indicators/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ind = await getIndicator(v, id).catch((e) => { if (e instanceof DataError && e.code === "not_found") notFound(); throw e; });
  const assets = (await alertableAssets(v)).map(({ slug, name }) => ({ slug, name }));
  return (
    <div className="space-y-6">
      <div className="space-y-2"><Label>Indicators</Label><h1 className="text-xl">{ind.name}</h1></div>
      <IndicatorEditor initial={ind} assets={assets} />
    </div>
  );
}
