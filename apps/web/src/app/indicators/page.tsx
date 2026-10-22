import Link from "next/link";
import { redirect } from "next/navigation";
import { LineChart } from "lucide-react";
import { AddPreset } from "@/components/client/AddPreset";
import { Badge, ButtonLink, Card, EmptyState, Label, Section } from "@/components/ui";
import { listIndicators } from "@/lib/data";
import { FUNCTIONS, VARIABLES } from "@/lib/indicators/formula";
import { PRESETS } from "@/lib/indicators/presets";
import { viewer } from "@/lib/session";

export const metadata = { title: "Indicators" };

const Code = ({ children }: { children: React.ReactNode }) => <code className="break-all rounded-sm bg-surface-sunken px-1 font-mono text-xs">{children}</code>;

export default async function Indicators() {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/indicators");
  const mine = await listIndicators(v);
  const have = new Set(mine.map((i) => i.name));
  return (
    <div className="space-y-12">
      <div className="space-y-3">
        <Label>Indicators</Label>
        <h1 className="text-xl md:text-display">Your indicators</h1>
        <p className="max-w-prose text-muted">
          Start from the library or write your own formula. Switch them on under any price chart, see how their buy and sell
          signals did on past prices, and get an alert when one fires.
        </p>
        <ButtonLink href="/indicators/new">New indicator</ButtonLink>
      </div>

      <Section id="mine" title="Yours">
        {!mine.length ? (
          <Card><EmptyState icon={<LineChart aria-hidden className="h-6 w-6" />} title="No indicators yet">Add one from the library below, or write your own.</EmptyState></Card>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {mine.map((i) => (
              <li key={i.id}><Card className="grid h-full gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{i.name}</h3>
                  <Badge>{i.display === "overlay" ? "On the price" : "Below the price"}</Badge>
                </div>
                <ul className="grid gap-1">{i.lines.map((l, k) => <li key={k}><Code>{l}</Code></li>)}</ul>
                <p className="text-xs text-muted">
                  {i.buyRule ? <>Buy: <Code>{i.buyRule}</Code></> : "No buy rule"}{" · "}{i.sellRule ? <>Sell: <Code>{i.sellRule}</Code></> : "no sell rule"}
                </p>
                <div className="mt-auto flex flex-wrap gap-3 pt-1 text-sm font-semibold">
                  <Link href={`/indicators/${i.id}`} className="text-accent underline">Edit and test<span className="sr-only"> {i.name}</span></Link>
                  {(i.buyRule || i.sellRule) && <Link href={`/indicators/${i.id}/screen`} className="text-accent underline">Screen all assets<span className="sr-only"> with {i.name}</span></Link>}
                  {(i.buyRule || i.sellRule) && <Link href="/alerts" className="text-accent underline">Set an alert<span className="sr-only"> on {i.name}</span></Link>}
                </div>
              </Card></li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="library" title="Library">
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {PRESETS.map((p) => (
            <li key={p.key}><Card className="grid h-full gap-2 p-4">
              <h3 className="font-semibold">{p.name}</h3>
              <p className="text-sm text-muted">{p.about}</p>
              <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                {have.has(p.name) ? <Badge tone="up">Added</Badge> : <AddPreset preset={p} />}
                <Link href={`/indicators/new?preset=${p.key}`} className="text-sm font-semibold text-accent underline">Customise<span className="sr-only"> {p.name}</span></Link>
              </div>
            </Card></li>
          ))}
        </ul>
      </Section>

      <Section id="formulas" title="Writing a formula">
        <Card className="grid gap-4 p-5 text-sm">
          <p className="max-w-prose text-muted">
            A formula works out one value per bar from <Code>{VARIABLES.join(", ")}</Code>, numbers, <Code>+ - * /</Code> and brackets.
            Rules also use <Code>{"< > <= >= == !="}</Code> with <Code>and</Code>, <Code>or</Code> and <Code>not</Code>; a signal is given on
            the bar where a rule turns true. Window sizes like <Code>n</Code> are whole numbers up to 500.
          </p>
          <dl className="grid gap-2 md:grid-cols-2">
            {Object.entries(FUNCTIONS).map(([name, f]) => (
              <div key={name}><dt><Code>{name}({f.args.join(", ")})</Code></dt><dd className="text-muted">{f.doc}</dd></div>
            ))}
          </dl>
        </Card>
      </Section>
    </div>
  );
}
