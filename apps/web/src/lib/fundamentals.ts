// Company fundamentals from SEC XBRL "company facts", and a discounted-cash-flow value. Pure functions.
// Annual figures come from 10-K filings: flows (revenue, profit, cash flow) over a full fiscal year, balances
// (cash, debt, equity) at the year's end. When a figure was restated, the latest filing wins.

type Fact = { start?: string; end: string; val: number; fy?: number; fp?: string; form?: string; filed?: string };
export type CompanyFacts = { entityName: string; facts: Record<string, Record<string, { units: Record<string, Fact[]> }>> };
export type Year = { fy: number; end: string; revenue: number | null; netIncome: number | null; eps: number | null; ocf: number | null; capex: number | null;
  fcf: number | null; cash: number | null; debt: number | null; equity: number | null };

const REVENUE = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"];
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

function entries(f: CompanyFacts, names: string[], unit = "USD"): Fact[] {
  const g = f.facts["us-gaap"] ?? {};
  // The first concept the company reports in the recent years wins; companies switch tags over time, so merge them.
  const all = names.flatMap((n) => g[n]?.units[unit] ?? []);
  return all.filter((e) => e.form === "10-K" || e.form === "10-K/A");
}
/** Full-year flows by fiscal-year end, latest filing first. */
function yearly(es: Fact[], flow: boolean): Map<string, number> {
  const out = new Map<string, { val: number; filed: string }>();
  for (const e of es) {
    if (flow && (!e.start || Math.abs(days(e.start, e.end) - 365) > 30)) continue;
    const cur = out.get(e.end);
    if (!cur || (e.filed ?? "") > cur.filed) out.set(e.end, { val: e.val, filed: e.filed ?? "" });
  }
  return new Map([...out].map(([k, v]) => [k, v.val]));
}

export function annual(f: CompanyFacts, n = 6): Year[] {
  const rev = yearly(entries(f, REVENUE), true), ni = yearly(entries(f, ["NetIncomeLoss"]), true);
  const eps = yearly(entries(f, ["EarningsPerShareDiluted"], "USD/shares"), true);
  const ocf = yearly(entries(f, ["NetCashProvidedByUsedInOperatingActivities"]), true);
  const capex = yearly(entries(f, ["PaymentsToAcquirePropertyPlantAndEquipment"]), true);
  const cash = yearly(entries(f, ["CashAndCashEquivalentsAtCarryingValue"]), false);
  const debt = yearly(entries(f, ["LongTermDebt", "LongTermDebtNoncurrent"]), false);
  const eq = yearly(entries(f, ["StockholdersEquity"]), false);
  const ends = [...new Set([...rev.keys(), ...ni.keys()])].filter((e) => rev.has(e) || ni.has(e)).sort().slice(-n);
  return ends.map((end) => {
    const o = ocf.get(end) ?? null, c = capex.get(end) ?? null;
    return { fy: Number(end.slice(0, 4)), end, revenue: rev.get(end) ?? null, netIncome: ni.get(end) ?? null, eps: eps.get(end) ?? null, ocf: o, capex: c,
      fcf: o !== null && c !== null ? o - c : null, cash: cash.get(end) ?? null, debt: debt.get(end) ?? null, equity: eq.get(end) ?? null };
  });
}

export function sharesOutstanding(f: CompanyFacts): number | null {
  const s = f.facts.dei?.EntityCommonStockSharesOutstanding?.units.shares ?? [];
  return s.length ? [...s].sort((a, b) => a.end.localeCompare(b.end)).at(-1)!.val : null;
}

/**
 * Value per share from free cash flow: grow it at `growth` for `years`, then at `terminal` for ever, discount
 * everything at `discount`, add net cash (cash minus debt), divide by shares. All rates are fractions (0.08 = 8%).
 */
export function dcf(i: { fcf: number; growth: number; years: number; terminal: number; discount: number; netCash: number; shares: number }) {
  if (!(i.discount > i.terminal)) throw new Error("The discount rate must be above the long-run growth rate");
  if (!(i.shares > 0)) throw new Error("Shares outstanding must be above 0");
  let pv = 0, f = i.fcf;
  const flows: { year: number; fcf: number; pv: number }[] = [];
  for (let t = 1; t <= i.years; t++) {
    f *= 1 + i.growth;
    const d = f / (1 + i.discount) ** t;
    pv += d; flows.push({ year: t, fcf: f, pv: d });
  }
  const terminalValue = (f * (1 + i.terminal)) / (i.discount - i.terminal);
  const terminalPv = terminalValue / (1 + i.discount) ** i.years;
  const equity = pv + terminalPv + i.netCash;
  return { perShare: equity / i.shares, equity, pvFlows: pv, terminalPv, terminalShare: terminalPv / (pv + terminalPv), flows };
}
