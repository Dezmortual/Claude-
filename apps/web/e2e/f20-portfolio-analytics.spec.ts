import { randomUUID } from "node:crypto";
import { a11y, expect, ipHeaders, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("b") });
const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

test.describe.serial("F20 portfolio ledger, performance and risk", () => {
  test.beforeAll(async ({ browser }) => {
    const c = await browser.newContext({ storageState: ownerState("b") });
    const p = await c.newPage();
    for (const h of [{ assetSlug: "bitcoin", quantity: 1, costPrice: 50000, boughtOn: ago(200) }, { assetSlug: "aapl", quantity: 10, costPrice: 150, boughtOn: ago(100) }]) {
      const r = await p.request.post("/api/v1/me/holdings", { headers: ipHeaders(), data: h });
      expect(r.status(), await r.text()).toBe(200);
    }
    await c.close();
  });

  test("F20-H1 performance: time-weighted return, worst drop, months, benchmark", async ({ page }) => {
    await page.goto("/portfolio/performance");
    await expect(page.getByRole("link", { name: "Performance" })).toHaveAttribute("aria-current", "page");
    for (const k of ["Return", "Per year", "Worst drop"]) await expect(page.getByText(k, { exact: true })).toBeVisible();
    await expect(page.getByText(`Since ${ago(200)}`)).toBeVisible();
    await expect(page.getByText(/Paid in \$51,500 ·/)).toBeVisible();
    await expect(page.getByRole("img", { name: /Your portfolio's growth of 1/ })).toBeVisible();
    expect(await page.getByRole("region", { name: "Monthly returns table" }).getByRole("row").count()).toBeGreaterThanOrEqual(2);
    await a11y(page, "/portfolio/performance");
    await page.getByLabel("Compare with").selectOption({ label: "Bitcoin" });
    await expect(page.getByText("Bitcoin, same days")).toBeVisible();
  });

  test("F20-H2 ledger: record a sale and a dividend; holdings and profit follow", async ({ page }) => {
    await page.goto("/portfolio/ledger");
    await expect(page.getByRole("region", { name: "Ledger table" }).getByRole("row")).toHaveCount(3);
    await page.getByLabel("Asset").selectOption({ label: "Bitcoin" });
    await page.getByLabel("How many").fill("0.4");
    await page.getByLabel("Price each").fill("60000");
    await page.getByLabel("Date").fill(ago(10));
    await page.getByRole("button", { name: "Record it" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sale recorded" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Ledger table" })).toContainText(/Sold 0\.4 Bitcoin at \$60,000/);
    await page.getByLabel("What happened").selectOption("dividend");
    await page.getByLabel("Asset").selectOption({ label: "Apple" });
    await page.getByLabel("Received (USD)").fill("12.5");
    await page.getByRole("button", { name: "Record it" }).click();
    await expect(page.getByRole("region", { name: "Ledger table" })).toContainText("+$12.50");
    await a11y(page, "/portfolio/ledger");
    await page.goto("/portfolio");
    await expect(page.locator("#holdings")).toContainText("0.6 BTC");
    await expect(page.getByText(/Plus \+\$4,000(\.00)? locked in by sales, \$12\.50 in dividends/)).toBeVisible(); // 0.4 × (60,000 − 50,000)
    const r = await page.request.post("/api/v1/me/portfolio/entries", { headers: ipHeaders(), data: { slug: "bitcoin", kind: "sell", quantity: 5, price: 1, on: ago(1) } });
    expect((await r.json()).message).toMatch(/You hold 0\.6 Bitcoin; you can't record selling more/);
  });

  test("F20-H3 risk, stress, simulation, rebalance and limits", async ({ page }) => {
    await page.goto("/portfolio/risk");
    for (const k of ["Volatility", "A bad day (95%)", "The worst days"]) await expect(page.getByText(k, { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Risk by holding table" }).getByRole("row")).toHaveCount(3);
    await expect(page.locator("#stress")).toContainText("Crypto falls 30%");
    await expect(page.getByRole("region", { name: "Simulation table" }).getByRole("row")).toHaveCount(4);
    await a11y(page, "/portfolio/risk");
    await page.getByRole("button", { name: "Start from today's weights" }).click();
    await page.getByLabel("Target % for Bitcoin").fill("50");
    await page.getByLabel("Target % for Apple").fill("40");
    await expect(page.getByText("Adds up to 90%")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save targets" })).toBeDisabled();
    await page.getByLabel("Target % for Apple").fill("50");
    await page.getByRole("button", { name: "Save targets" }).click();
    await expect(page.getByRole("heading", { name: "Trades to get there" })).toBeVisible();
    await expect(page.locator("#rebalance")).toContainText(/(Buy|Sell) (Bitcoin|Apple)/);
    await page.getByLabel("At most %").fill("10");
    await page.getByRole("button", { name: "Add limit" }).click();
    await expect(page.locator("#limits").getByText("Any one holding at most 10%")).toBeVisible();
    await expect(page.locator("#limits").getByText("Over", { exact: true })).toBeVisible();
  });

  test("F20-H4 import Alpaca fills once; take them out again", async ({ page, request }) => {
    await request.post("http://localhost:3999/__reset");
    const t = await page.request.post("/api/v1/trade/orders", { headers: ipHeaders(), data: { clientOrderId: randomUUID(), slug: "ethereum", side: "buy", type: "market", amountUsd: 200 } });
    expect(t.status(), await t.text()).toBe(200);
    await page.goto("/portfolio/ledger");
    await page.getByRole("button", { name: "Import my Alpaca trades" }).click();
    await expect(page.getByRole("status").filter({ hasText: "1 fill added from Alpaca (practice)" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Ledger table" })).toContainText("Bought 2 Ethereum");
    await page.getByRole("button", { name: "Import my Alpaca trades" }).click();
    await expect(page.getByRole("status").filter({ hasText: "0 fills added from Alpaca (practice), 1 already there" })).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Remove imported entries" }).click();
    await expect(page.getByRole("status").filter({ hasText: "1 imported entries removed" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Ledger table" })).not.toContainText("Ethereum");
    await request.post("http://localhost:3999/__reset");
  });

  test("F20-N1 another owner sees none of it", async ({ browser }) => {
    const c = await browser.newContext({ storageState: ownerState("a") });
    const p = await c.newPage();
    const rows = await (await p.request.get("/api/v1/me/portfolio/entries")).json();
    expect(rows.some((r: { kind: string }) => r.kind === "sell" || r.kind === "dividend")).toBe(false);
    await c.close();
  });
});
