import postgres from "postgres";
import { a11y, expect, ipHeaders, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a") });
const TEST_DB = process.env.E2E_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5499/forecast_test";

test.describe.serial("F1 forecast ledger", () => {
  // The e2e suite runs on demo prices, which are never published, so three forecasts are written in directly:
  // a hit, a miss and one still waiting for its date.
  let sql: postgres.Sql, runId: string;
  test.beforeAll(async () => {
    sql = postgres(TEST_DB, { max: 1, onnotice: () => {} });
    [{ id: runId }] = await sql`insert into forecast_runs (model_version, status, published_at) values ('baseline-quantile-v1', 'published', now() - interval '3 days') returning id`;
    const [{ id: btc }] = await sql`select id from assets where slug = 'bitcoin'`;
    const [{ id: eth }] = await sql`select id from assets where slug = 'ethereum'`;
    const mk = (asset: string, horizon: string, ago: string, ahead: string) => sql`
      insert into forecasts (run_id, asset_id, horizon, base_price, generated_at, target_at, low, mid, high, p_up, signal)
      values (${runId}, ${asset}, ${horizon}, 100, now() - ${ago}::interval, now() + ${ahead}::interval, 90, 101, 110, 0.6, 'buy') returning id`;
    const [[hit], [miss]] = await Promise.all([mk(btc, "1d", "3 days", "-2 days"), mk(eth, "1d", "3 days", "-2 days"), mk(btc, "7d", "3 days", "4 days")]);
    await sql`insert into forecast_outcomes (forecast_id, realized_price, realized_at, direction_hit, inside_band, abs_pct_error)
      values (${hit.id}, 104, now() - interval '2 days', true, true, 2.97), (${miss.id}, 85, now() - interval '2 days', false, false, 15.84)`;
  });
  test.afterAll(async () => { await sql`delete from forecast_runs where id = ${runId}`; await sql.end(); });

  test("F1-H1 every forecast is listed, hits and misses alike", async ({ page }) => {
    await page.goto("/track-record");
    await page.getByRole("link", { name: "See every forecast in the ledger" }).click();
    await expect(page).toHaveURL(/\/track-record\/ledger$/);
    await expect(page.getByRole("status").filter({ hasText: "3 forecasts · 2 scored: direction right in 50%, inside the 80% range in 50% · 1 waiting" })).toBeVisible();
    const table = page.getByRole("region", { name: /^Forecasts, page 1 of 1$/ });
    await expect(table.getByRole("row")).toHaveCount(4);
    await expect(table.getByRole("row").filter({ hasText: "Ethereum" })).toContainText("Wrong");
    await expect(table.getByRole("row").filter({ hasText: "Ethereum" })).toContainText("Outside");
    await expect(table.getByRole("row").filter({ hasText: "Waiting until" })).toHaveCount(1);
    await a11y(page, "/track-record/ledger");
  });

  test("F1-H2 filters by asset, horizon and outcome", async ({ page }) => {
    await page.goto("/track-record/ledger");
    await page.getByLabel("Show").selectOption("misses");
    await expect(page).toHaveURL(/status=misses/);
    await expect(page.getByRole("region", { name: /^Forecasts/ }).getByRole("row")).toHaveCount(2);
    await page.goto("/track-record/ledger?asset=bitcoin&horizon=7d");
    await expect(page.getByRole("status")).toContainText("1 forecasts · 0 scored");
    expect((await page.request.get("/api/v1/ledger?horizon=2y", { headers: ipHeaders() })).status()).toBe(422);
    const api = await (await page.request.get("/api/v1/ledger?status=hits", { headers: ipHeaders() })).json();
    expect(api.rows.map((r: { slug: string }) => r.slug)).toEqual(["bitcoin"]);
  });

  test("F1-H3 each asset page shows its own record", async ({ page }) => {
    await page.goto("/assets/bitcoin");
    const s = page.locator("#record");
    await expect(s.getByRole("heading", { name: "This asset's forecast record" })).toBeVisible();
    await expect(s).toContainText("Of 1 scored so far, 100% got the direction right");
    await s.getByRole("link", { name: "All 2 forecasts" }).click();
    await expect(page).toHaveURL(/\/track-record\/ledger\?asset=bitcoin/);
  });
});

test("F2-H1 signal history lists each change with the moves after it and the worst against it", async ({ page }) => {
  await page.goto("/assets/bitcoin/signals");
  const s = page.locator("#history");
  await expect(s.getByRole("heading", { name: "Signal history" })).toBeVisible();
  await expect(s.getByRole("radio", { name: "Daily chart" })).toHaveAttribute("aria-checked", "true");
  await expect(s).toContainText(/Since \d+ \w+ the 1 day reading changed (once|\d+ times)/);
  await expect(s.getByText("Turned buy or strong buy")).toBeVisible();
  const table = s.getByRole("region", { name: "Signal changes on the 1 day chart" });
  await expect(table.getByRole("columnheader", { name: "Worst against, 7 days" })).toBeVisible();
  expect(await table.getByRole("row").count()).toBeGreaterThan(1);
  await s.getByRole("radio", { name: "Hourly chart" }).click();
  await expect(s).toContainText("the 1 hour reading changed");
  await a11y(page, "/assets/bitcoin/signals history");
  const api = await (await page.request.get("/api/v1/assets/bitcoin/signal-history", { headers: ipHeaders() })).json();
  expect(api.map((h: { timeframe: string }) => h.timeframe)).toEqual(["1h", "1d"]);
});
