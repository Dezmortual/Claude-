import { a11y, expect, ipHeaders, ownerState, test } from "./fixtures";
import { test as base } from "@playwright/test";

test.use({ storageState: ownerState("a") });
const CRON = { authorization: "Bearer e2e-cron-secret-0123456789abcdef" };

test.describe("F10 indicators", () => {
  test("F10-H1 add a library indicator", async ({ page }) => {
    await page.goto("/indicators");
    await a11y(page, "/indicators");
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "RSI 14", exact: true }) });
    await card.getByRole("button", { name: "Add RSI 14" }).click();
    await expect(page.getByRole("status").filter({ hasText: "RSI 14 added" })).toBeVisible();
    await expect(card.getByText("Added")).toBeVisible();
    await expect(page.locator("#mine").getByRole("heading", { name: "RSI 14", exact: true })).toBeVisible();
  });

  test("F10-H2 write one, see errors, test it, save it", async ({ page }) => {
    await page.goto("/indicators/new");
    await page.getByLabel("Name").fill("Fast cross");
    await page.getByLabel("Line 1").fill("ema(close, 9");
    await expect(page.getByText(/Expected a closing bracket/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add indicator" })).toBeDisabled();
    await page.getByLabel("Line 1").fill("ema(close, 9)");
    await page.getByLabel(/Buy rule/).fill("crosses_above(close, ema(close, 9))");
    await expect(page.getByRole("region", { name: "Buy signals" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Buy signals" }).getByRole("row")).toHaveCount(4);
    await a11y(page, "/indicators/new");
    await page.getByRole("button", { name: "Add indicator" }).click();
    await expect(page).toHaveURL(/\/indicators$/);
    await expect(page.locator("#mine").getByRole("heading", { name: "Fast cross" })).toBeVisible();
  });

  test("F10-H3 switch an indicator on under a price chart", async ({ page }) => {
    await page.goto("/assets/bitcoin");
    const chip = page.getByRole("button", { name: "RSI 14", exact: true });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#bitcoin-chart-summary")).toContainText("Showing RSI 14");
    await page.reload();
    await expect(page.getByRole("button", { name: "RSI 14", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("F10-E1 an indicator alert fires, and goes with its indicator", async ({ page, request }) => {
    const h = ipHeaders();
    const ind = await page.request.post("/api/v1/me/indicators", { headers: h, data: { name: "Always up", lines: ["close"], display: "overlay", buyRule: "close > 0" } });
    expect(ind.ok()).toBe(true);
    const { id } = await ind.json();
    const a = await page.request.post("/api/v1/me/alerts", { headers: h, data: { assetSlug: "solana", condition: "indicator_signal", indicatorId: id, signal: "buy", timeframe: "1d", channels: ["email"] } });
    expect(a.ok()).toBe(true);
    const sellless = await page.request.post("/api/v1/me/alerts", { headers: h, data: { assetSlug: "solana", condition: "indicator_signal", indicatorId: id, signal: "sell", timeframe: "1d" } });
    expect(sellless.status()).toBe(422);
    const r = await (await request.post("/api/cron/alerts", { headers: CRON })).json();
    expect(r.fired).toBeGreaterThanOrEqual(1);
    await page.goto("/alerts");
    await expect(page.getByText('Solana: Always up gives a buy signal on the 1 day chart')).toBeVisible();
    expect((await page.request.delete(`/api/v1/me/indicators/${id}`, { headers: h })).ok()).toBe(true);
    await page.reload();
    await expect(page.getByText("Always up gives a buy signal")).toHaveCount(0);
  });

  test("F10-N1 bad formulas are refused with the reason", async ({ page }) => {
    const h = ipHeaders();
    for (const [lines, reason] of [[["fetch('x')"], /Unexpected/], [["sma(close, close)"], /whole number/], [["constructor"], /Unknown name/], [[], /at least one line/]] as const) {
      const r = await page.request.post("/api/v1/me/indicators", { headers: h, data: { name: "Bad", lines, display: "pane" } });
      expect(r.status()).toBe(422);
      expect((await r.json()).message).toMatch(reason);
    }
    expect((await page.request.get("/api/v1/me/indicators/not-a-uuid", { headers: h })).status()).toBe(422);
  });
});

base.describe("F10-N2 another owner's indicators", () => {
  base.use({ storageState: ownerState("b") });
  base("are invisible and can't be changed", async ({ page, browser }) => {
    const a = await browser.newContext({ storageState: ownerState("a") });
    const mine = await (await a.request.get("/api/v1/me/indicators")).json();
    await a.close();
    expect(mine.length).toBeGreaterThan(0);
    expect(await (await page.request.get("/api/v1/me/indicators")).json()).toEqual([]);
    expect((await page.request.get(`/api/v1/me/indicators/${mine[0].id}`)).status()).toBe(404);
    expect((await page.request.delete(`/api/v1/me/indicators/${mine[0].id}`)).status()).toBe(404);
  });
});
