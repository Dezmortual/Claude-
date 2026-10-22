import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { Banner, Card, EmptyState, Label, Section, cx } from "@/components/ui";
import { calibration, modelComparison, trackRecord } from "@/lib/data";

export const metadata = { title: "Track record", description: "Every forecast we publish is scored when its date arrives. This is where the results live." };

const H: Record<string, string> = { "1d": "Next day", "7d": "7 days", "1m": "1 month" };
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const MODEL_NAME: Record<string, string> = { "baseline-quantile-v1": "Live model", "volscaled-momentum-v2": "Challenger (hidden)" };

type Totals = { n: number; hit: number; up: number; cov: number; err: number; naive: number; brier: number };

/** Pools rows weighted by forecast count. Medians can't be pooled exactly, so errors are count-weighted medians. */
function pool(rows: { n: number; hit_rate: number; up_rate: number; coverage: number; median_err: number; naive_err: number; brier: number }[]): Totals {
  const n = rows.reduce((a, r) => a + r.n, 0);
  const w = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r) * r.n, 0) / n;
  return { n, hit: w((r) => r.hit_rate), up: w((r) => r.up_rate), cov: w((r) => r.coverage), err: w((r) => r.median_err), naive: w((r) => r.naive_err), brier: w((r) => r.brier) };
}

function Verdict({ good, children }: { good: boolean; children: React.ReactNode }) {
  return <span className={cx("text-xs font-semibold", good ? "text-up" : "text-down")}>{children}</span>;
}

export default async function TrackRecord() {
  const [rows, cal, cmp] = await Promise.all([trackRecord(), calibration(), modelComparison()]);
  const t = rows.length ? pool(rows) : null;
  return (
    <div className="space-y-12">
      <div className="space-y-3">
        <Label>Track record</Label>
        <h1 className="text-xl md:text-display">Every forecast, scored. Misses included.</h1>
        <p className="max-w-prose text-muted">
          Forecasts are locked when they&apos;re published (hourly) and compared with what actually happened once their target
          time passes. Wins and misses alike, for every live asset, each one also scored against two naive forecasts that
          take no skill at all. Demo-data assets are never scored.
        </p>
        <p className="text-sm"><Link href="/track-record/ledger" className="font-semibold text-accent underline">See every forecast in the ledger</Link>, one by one, with what actually happened.</p>
      </div>

      {!t ? (
        <Card>
          <EmptyState icon={<ClipboardCheck aria-hidden className="h-6 w-6" />} title="Nothing scored yet">
            The first results appear a day after the publish job starts running. Give it about a month before reading anything into them.
          </EmptyState>
        </Card>
      ) : (
        <>
          {t.n < 300 && <Banner tone="warning">Only {t.n} forecasts scored so far. Small samples swing a lot; treat these as early numbers.</Banner>}

          <Section id="summary" title="Against doing nothing">
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <li><Card className="h-full space-y-1 p-5">
                <p className="text-2xs uppercase tracking-wide text-subtle">Direction right</p>
                <p className="tabular text-xl">{pct(t.hit)}</p>
                <p className="text-sm text-muted">&ldquo;Always up&rdquo; scores {pct(t.up)} on the same forecasts.</p>
                <Verdict good={t.hit > t.up}>{t.hit > t.up ? "Beats always up" : "Not beating always up"}</Verdict>
              </Card></li>
              <li><Card className="h-full space-y-1 p-5">
                <p className="text-2xs uppercase tracking-wide text-subtle">Median error</p>
                <p className="tabular text-xl">{t.err.toFixed(2)}%</p>
                <p className="text-sm text-muted">Forecasting no change misses by {t.naive.toFixed(2)}%.</p>
                <Verdict good={t.err < t.naive}>{t.err < t.naive ? "Beats no change" : "Not beating no change"}</Verdict>
              </Card></li>
              <li><Card className="h-full space-y-1 p-5">
                <p className="text-2xs uppercase tracking-wide text-subtle">Inside the 80% range</p>
                <p className="tabular text-xl">{pct(t.cov)}</p>
                <p className="text-sm text-muted">Honest ranges land near 80%.</p>
                <Verdict good={Math.abs(t.cov - 0.8) <= 0.05}>{Math.abs(t.cov - 0.8) <= 0.05 ? "Ranges are honest" : t.cov < 0.8 ? "Ranges too narrow" : "Ranges too wide"}</Verdict>
              </Card></li>
              <li><Card className="h-full space-y-1 p-5">
                <p className="text-2xs uppercase tracking-wide text-subtle">Brier score</p>
                <p className="tabular text-xl">{t.brier.toFixed(3)}</p>
                <p className="text-sm text-muted">Grades the &ldquo;% up&rdquo;. A flat 50% scores 0.250; lower is better.</p>
                <Verdict good={t.brier < 0.25}>{t.brier < 0.25 ? "Better than a coin flip" : "No better than a coin flip"}</Verdict>
              </Card></li>
            </ul>
          </Section>

          <div tabIndex={0} role="region" aria-label="Results by market and horizon" className="relative overflow-x-auto rounded-lg border bg-surface">
            <table className="w-full text-sm">
              <caption className="px-4 pt-4 text-left text-sm font-semibold">By market and horizon</caption>
              <thead><tr className="text-2xs uppercase tracking-wide text-subtle">
                <th scope="col" className="px-4 py-2 text-left">Market</th><th scope="col" className="px-4 py-2 text-left">Horizon</th>
                <th scope="col" className="px-4 py-2 text-right">Forecasts</th><th scope="col" className="px-4 py-2 text-right">Direction right</th>
                <th scope="col" className="px-4 py-2 text-right">Always up</th><th scope="col" className="px-4 py-2 text-right">Inside 80% range</th>
                <th scope="col" className="px-4 py-2 text-right">Median error</th><th scope="col" className="px-4 py-2 text-right">No-change error</th>
                <th scope="col" className="px-4 py-2 text-right">Brier</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.market}-${r.horizon}`} className="border-t">
                    <th scope="row" className="px-4 py-2 text-left font-normal capitalize">{r.market}</th>
                    <td className="px-4 py-2">{H[r.horizon] ?? r.horizon}</td>
                    <td className="tabular px-4 py-2 text-right">{r.n}</td>
                    <td className={cx("tabular px-4 py-2 text-right", r.hit_rate > r.up_rate && "font-semibold")}>{pct(r.hit_rate)}</td>
                    <td className="tabular px-4 py-2 text-right text-muted">{pct(r.up_rate)}</td>
                    <td className={cx("tabular px-4 py-2 text-right", Math.abs(r.coverage - 0.8) > 0.1 && "text-warning")}>{pct(r.coverage)}</td>
                    <td className={cx("tabular px-4 py-2 text-right", r.median_err < r.naive_err && "font-semibold")}>{r.median_err.toFixed(2)}%</td>
                    <td className="tabular px-4 py-2 text-right text-muted">{r.naive_err.toFixed(2)}%</td>
                    <td className="tabular px-4 py-2 text-right">{r.brier.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Section id="calibration" title="Is the “% up” honest?">
            <p className="max-w-prose text-sm text-muted">Forecasts grouped by the chance of rising they stated, next to how often they actually rose. Honest numbers sit close together.</p>
            <Card className="divide-y">
              {cal.map((b) => (
                <div key={b.bucket} className="grid grid-cols-1 gap-2 p-4 md:grid-cols-4 md:items-center">
                  <span className="font-semibold">Said {b.label}</span>
                  <span className="text-sm text-muted">{b.n.toLocaleString("en-US")} forecasts</span>
                  <span className="tabular text-sm">stated {pct(b.stated)} · rose {pct(b.actual)}</span>
                  <span aria-hidden className="relative h-2 rounded-pill bg-surface-sunken">
                    <span className="absolute inset-y-0 left-0 rounded-pill bg-accent/30" style={{ width: pct(b.stated) }} />
                    <span className="absolute inset-y-0 left-0 rounded-pill bg-accent" style={{ width: pct(b.actual) }} />
                  </span>
                </div>
              ))}
            </Card>
          </Section>
        </>
      )}

      <Section id="challenger" title="Challenger in testing">
        <p className="max-w-prose text-sm text-muted">
          A second model publishes hidden forecasts in every run and is scored the same way: volatility-scaled ranges, a
          momentum condition, and moves pulled halfway towards no change. It replaces the live model only if it wins by a
          rule written down before its first result: lower Brier score, ranges at least as honest, and errors no worse,
          over at least four weeks.
        </p>
        {!cmp.length ? (
          <Card className="p-6 text-sm text-muted">No scored forecasts from either model yet.</Card>
        ) : (
          <div tabIndex={0} role="region" aria-label="Live model against the challenger" className="relative overflow-x-auto rounded-lg border bg-surface">
            <table className="w-full text-sm">
              <caption className="px-4 pt-4 text-left text-sm font-semibold">Live model against the challenger</caption>
              <thead><tr className="text-2xs uppercase tracking-wide text-subtle">
                <th scope="col" className="px-4 py-2 text-left">Horizon</th><th scope="col" className="px-4 py-2 text-left">Model</th>
                <th scope="col" className="px-4 py-2 text-right">Forecasts</th><th scope="col" className="px-4 py-2 text-right">Direction right</th>
                <th scope="col" className="px-4 py-2 text-right">Inside 80% range</th><th scope="col" className="px-4 py-2 text-right">Median error</th>
                <th scope="col" className="px-4 py-2 text-right">Brier</th>
              </tr></thead>
              <tbody>
                {cmp.map((r) => (
                  <tr key={`${r.horizon}-${r.model}`} className="border-t">
                    <td className="px-4 py-2">{H[r.horizon] ?? r.horizon}</td>
                    <th scope="row" className="px-4 py-2 text-left font-normal">{MODEL_NAME[r.model] ?? r.model}</th>
                    <td className="tabular px-4 py-2 text-right">{r.n}</td>
                    <td className="tabular px-4 py-2 text-right">{pct(r.hit_rate)}</td>
                    <td className="tabular px-4 py-2 text-right">{pct(r.coverage)}</td>
                    <td className="tabular px-4 py-2 text-right">{r.median_err.toFixed(2)}%</td>
                    <td className="tabular px-4 py-2 text-right">{r.brier.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section id="measure" title="How to read it">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            ["Direction right", "How often the price ended on the side of the starting price the forecast pointed to. Compare it with “always up”: in a rising market, guessing up every time scores well too."],
            ["Inside the 80% range", "How often the price landed inside the range. Near 80% means the ranges are honest; far from it is flagged."],
            ["Median error and Brier", "The typical distance between the forecast and the real price, next to the error of forecasting no change at all. The Brier score grades the stated chance of rising; a flat 50% scores 0.250."],
          ].map(([h, d]) => <Card key={h} className="space-y-2 p-5"><h3 className="text-base font-semibold">{h}</h3><p className="text-sm text-muted">{d}</p></Card>)}
        </div>
        <p className="text-sm"><Link href="/forecasts" className="font-semibold text-accent underline">Back to forecasts</Link></p>
      </Section>
    </div>
  );
}
