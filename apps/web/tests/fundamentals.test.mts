// Unit checks for fundamentals and the DCF. Run: npm run test:unit
import assert from "node:assert/strict";
import { annual, dcf, sharesOutstanding, type CompanyFacts } from "../src/lib/fundamentals";

let passed = 0;
const ok = (name: string, fn: () => void) => { fn(); passed++; console.log("  ok", name); };
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const flow = (y: number, val: number, form = "10-K", filed = `${y + 1}-01-30`) => ({ start: `${y}-01-01`, end: `${y}-12-31`, val, fy: y, fp: "FY", form, filed });
const f: CompanyFacts = { entityName: "Test Co", facts: {
  dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: "2024-01-20", val: 90 }, { end: "2025-01-20", val: 100 }] } } },
  "us-gaap": {
    Revenues: { units: { USD: [flow(2022, 800)] } },
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [flow(2023, 900), flow(2024, 1000), flow(2024, 1010, "10-K", "2026-01-30"),
      { start: "2024-10-01", end: "2024-12-31", val: 260, form: "10-Q" }] } },
    NetIncomeLoss: { units: { USD: [flow(2023, 90), flow(2024, 120)] } },
    NetCashProvidedByUsedInOperatingActivities: { units: { USD: [flow(2024, 200)] } },
    PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [flow(2024, 50)] } },
    CashAndCashEquivalentsAtCarryingValue: { units: { USD: [{ end: "2024-12-31", val: 300, form: "10-K", filed: "2025-01-30" }] } },
  },
} };

ok("annual figures: full years from 10-Ks, merged tags, the latest restatement wins, quarters ignored", () => {
  const y = annual(f);
  assert.deepEqual(y.map((x) => x.fy), [2022, 2023, 2024]);
  assert.equal(y[0].revenue, 800); assert.equal(y[2].revenue, 1010);
  assert.equal(y[2].fcf, 150); assert.equal(y[2].cash, 300); assert.equal(y[1].fcf, null);
});
ok("shares come from the latest cover-page figure", () => assert.equal(sharesOutstanding(f), 100));
ok("a DCF with no growth is a perpetuity", () => {
  const r = dcf({ fcf: 100, growth: 0, years: 5, terminal: 0, discount: 0.1, netCash: 0, shares: 10 });
  near(r.equity, 1000); near(r.perShare, 100);
});
ok("net cash adds to the value; the discount must exceed long-run growth", () => {
  near(dcf({ fcf: 100, growth: 0, years: 5, terminal: 0, discount: 0.1, netCash: 500, shares: 10 }).perShare, 150);
  assert.throws(() => dcf({ fcf: 100, growth: 0.05, years: 5, terminal: 0.1, discount: 0.08, netCash: 0, shares: 1 }), /above the long-run growth/);
});
console.log(`${passed} passed`);
