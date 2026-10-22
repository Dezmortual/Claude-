import { redirect } from "next/navigation";
import { IndicatorEditor } from "@/components/client/IndicatorEditor";
import { Label } from "@/components/ui";
import { alertableAssets } from "@/lib/data";
import { PRESETS } from "@/lib/indicators/presets";
import { viewer } from "@/lib/session";

export const metadata = { title: "New indicator" };

export default async function NewIndicator({ searchParams }: { searchParams: Promise<{ preset?: string }> }) {
  const { preset } = await searchParams;
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/indicators/new");
  const p = PRESETS.find((x) => x.key === preset);
  const assets = (await alertableAssets(v)).map(({ slug, name }) => ({ slug, name }));
  return (
    <div className="space-y-6">
      <div className="space-y-2"><Label>Indicators</Label><h1 className="text-xl">{p ? `Customise ${p.name}` : "New indicator"}</h1></div>
      <IndicatorEditor initial={p ? { ...p, name: `${p.name} (mine)` } : undefined} assets={assets} />
    </div>
  );
}
