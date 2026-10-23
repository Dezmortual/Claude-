import { randomUUID } from "node:crypto";
import { a11y, expect, ipHeaders, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a") });
const BROKER = "http://localhost:3999";

test.describe.serial("Trading through the broker (a stand-in for Alpaca's practice account)", () => {
  test.beforeAll(async ({ request }) => { await request.post(`${BROKER}/__reset`); });

  test("T-H1 buy from an asset page: review, confirm, see it on the Trade page", async ({ page }) => {
    await page.goto("/assets/bitcoin#trade");
    const t = page.locator("#trade");
    await expect(t.getByText("Practice account")).toBeVisible();
    await t.getByLabel("Amount in dollars").fill("250");
    await t.getByRole("button", { name: "Review buy" }).click();
    const review = t.getByRole("region", { name: "Review your order" });
    await expect(review).toContainText("Buy about $250.00 of Bitcoin (BTC/USD), at the market price.");
    await expect(review).toContainText("Practice account: no real money.");
    await a11y(page, "order review");
    await review.getByRole("button", { name: "Confirm buy" }).click();
    await expect(t.getByRole("status").filter({ hasText: "Order sent to Alpaca: filled." })).toBeVisible();
    await t.getByRole("link", { name: "See it on the Trade page" }).click();
    await expect(page.getByRole("heading", { name: "Your Alpaca account" })).toBeVisible();
    await expect(page.locator("#positions")).toContainText("Bitcoin");
    await expect(page.locator("#positions")).toContainText("2.5 at $100.00");
    await expect(page.getByRole("region", { name: "Orders table" })).toContainText("Buy $250.00 BTC/USD");
    await a11y(page, "/trade");
  });

  test("T-N1 the order limit, selling more than held, and a bad stop-loss are refused before anything is sent", async ({ page }) => {
    const post = (d: object) => page.request.post("/api/v1/trade/orders", { headers: ipHeaders(), data: { clientOrderId: randomUUID(), type: "market", ...d } });
    let r = await post({ slug: "bitcoin", side: "buy", amountUsd: 5000 });
    expect(r.status()).toBe(422);
    expect((await r.json()).message, await r.text()).toMatch(/above your limit of \$1,000/);
    r = await post({ slug: "bitcoin", side: "sell", qty: 99 });
    expect((await r.json()).message).toMatch(/You hold 2\.5; you can't sell more than that/);
    r = await post({ slug: "aapl", side: "buy", amountUsd: 500, stopLoss: 1000000 });
    expect((await r.json()).message).toMatch(/stop-loss must be below the buy price/);
    r = await post({ slug: "eurusd", side: "buy", amountUsd: 100 });
    expect((await r.json()).message).toMatch(/isn't traded through Alpaca/);
    await page.goto("/trade");
    await page.getByLabel("Largest single order (USD)").fill("100");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Limit saved" })).toBeVisible();
    r = await post({ slug: "bitcoin", side: "buy", amountUsd: 150 });
    expect((await r.json()).message).toMatch(/above your limit of \$100/);
    await page.getByLabel("Largest single order (USD)").fill("1000");
    await page.getByRole("button", { name: "Save" }).click();
  });

  test("T-E1 the same confirmation sent twice makes one order", async ({ page, request }) => {
    const id = randomUUID();
    const body = { slug: "ethereum", side: "buy", type: "market", amountUsd: 100, clientOrderId: id };
    const [a, b] = await Promise.all([1, 2].map(() => page.request.post("/api/v1/trade/orders", { headers: ipHeaders(), data: body })));
    expect([a.status(), b.status()]).toEqual([200, 200]);
    expect([(await a.json()).duplicate, (await b.json()).duplicate].sort()).toEqual([false, true]);
    const orders = await (await request.get(`${BROKER}/v2/orders?status=all&limit=50`, { headers: { "APCA-API-KEY-ID": "e2e-key", "APCA-API-SECRET-KEY": "e2e-secret" } })).json();
    expect(orders.filter((o: { client_order_id: string }) => o.client_order_id === id)).toHaveLength(1);
  });

  test("T-H2 a stock with stop-loss and take-profit, sell all, then close a position", async ({ page }) => {
    await page.goto("/assets/aapl#trade");
    const t = page.locator("#trade");
    await t.getByLabel("Amount in dollars").fill("500");
    await t.getByLabel("Add a stop-loss and take-profit").check();
    await t.getByRole("textbox", { name: "Stop-loss" }).fill("90");
    await t.getByRole("textbox", { name: "Take-profit" }).fill("120");
    // The demo price for AAPL isn't the broker's 100, so check only the parts that don't depend on it.
    await t.getByRole("button", { name: "Review buy" }).click();
    await expect(t.getByRole("region", { name: "Review your order" })).toContainText("Stop-loss: sells if the price falls to $90.00.");
    await t.getByRole("button", { name: "Back" }).click();
    await page.goto("/assets/bitcoin#trade");
    await page.locator("#trade").getByRole("radio", { name: "Sell" }).click();
    await page.locator("#trade").getByRole("button", { name: "All" }).click();
    await page.locator("#trade").getByRole("button", { name: "Review sell" }).click();
    await expect(page.locator("#trade").getByRole("region", { name: "Review your order" })).toContainText("Sell 2.5 BTC of Bitcoin (BTC/USD)");
    await page.locator("#trade").getByRole("button", { name: "Confirm sell" }).click();
    await expect(page.locator("#trade").getByRole("status").filter({ hasText: "filled" })).toBeVisible();
    await page.goto("/trade");
    await expect(page.locator("#positions")).not.toContainText("Bitcoin");
    page.once("dialog", (d) => d.accept());
    await page.locator("#positions").getByRole("button", { name: "Close Ethereum" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Closing Ethereum" })).toBeVisible();
    await expect(page.locator("#positions")).toContainText("No open positions");
  });

  test("T-N2 assets Alpaca doesn't trade say so; refused keys are explained", async ({ page, request }) => {
    await page.goto("/assets/eurusd#trade");
    await expect(page.locator("#trade")).toContainText("isn't traded through Alpaca");
    await request.post(`${BROKER}/__badkeys`);
    await page.goto("/trade");
    await expect(page.getByRole("alert").filter({ hasText: "Alpaca refused the keys" })).toBeVisible();
    await request.post(`${BROKER}/__reset`);
  });
});
