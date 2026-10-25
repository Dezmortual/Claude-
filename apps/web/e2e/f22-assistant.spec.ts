import { randomUUID } from "node:crypto";
import { a11y, expect, ipHeaders, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a") });
const BROKER = "http://localhost:3999";
const CRON = { authorization: "Bearer e2e-cron-secret-0123456789abcdef" };

test.describe.serial("F22 assistant, notes and exit orders", () => {
  test("F22-H1 ask: it looks things up, answers with links, and a follow-up continues the same conversation", async ({ page, request }) => {
    await request.post("/api/cron/news", { headers: CRON });
    await page.goto("/assistant");
    await expect(page.getByRole("heading", { name: "Ask the research assistant" })).toBeVisible();
    await a11y(page, "/assistant");
    await page.getByRole("button", { name: /Write a short research note on Bitcoin/ }).click();
    const convo = page.getByRole("list", { name: "Conversation" });
    await expect(convo.locator(":scope > li").nth(1)).toContainText("looked up Bitcoin · searched the news about Bitcoin", { timeout: 30_000 });
    await expect(convo.getByRole("link", { name: "Bitcoin", exact: true })).toHaveAttribute("href", "/assets/bitcoin");
    await expect(convo.getByRole("link", { name: /Bitcoin surges to a record high/ })).toHaveAttribute("href", "https://news.example/1");
    await expect(page).toHaveURL(/\/assistant\?c=[0-9a-f-]{36}$/);
    await expect(page.getByText(/Spent today: \$0\.0\d of \$2\.00/)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Conversations" })).toContainText("Write a short research note on Bitcoin");
    // The follow-up replays the stored history unchanged; the stand-in refuses if a thinking block was altered.
    await page.getByLabel("Ask a follow-up").fill("And what about the hourly chart?");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(convo.locator(":scope > li")).toHaveCount(4, { timeout: 30_000 });
    await page.reload();
    await expect(convo.locator(":scope > li")).toHaveCount(4);
    await a11y(page, "/assistant conversation");
  });

  test("F22-N1 a refusal is explained; a conversation can be deleted", async ({ page }) => {
    await page.goto("/assistant");
    await page.getByLabel(/Ask about markets/).fill("Please refuse this one");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Claude declined to answer that" })).toBeVisible({ timeout: 30_000 });
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Delete conversation" }).click();
    await expect(page).toHaveURL(/\/assistant$/);
    await expect(page.getByRole("navigation", { name: "Conversations" })).not.toContainText("Please refuse this one");
  });

  test("F22-H2 a desk note on the latest headlines", async ({ page }) => {
    await page.goto("/news");
    await page.getByRole("button", { name: "Summarise the latest headlines" }).click();
    await expect(page.getByText(/Desk note · \d+ headlines/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "story" })).toHaveAttribute("href", /^https:\/\//);
  });

  test("F22-H3 notes save themselves and are listed", async ({ page }) => {
    await page.goto("/assets/ethereum#notes");
    await page.getByLabel("Your notes on Ethereum").fill("Watching the 200-day average. Add below 2,000.");
    await expect(page.locator("#notes").getByRole("status")).toHaveText("Saved", { timeout: 10_000 });
    await page.reload();
    await expect(page.getByLabel("Your notes on Ethereum")).toHaveValue("Watching the 200-day average. Add below 2,000.");
    await page.goto("/notes");
    await expect(page.getByRole("link", { name: /Ethereum/ })).toBeVisible();
    await expect(page.getByText("Watching the 200-day average.")).toBeVisible();
    await a11y(page, "/notes");
  });

  test("F22-H4 a trailing stop and a target-plus-stop protect a stock you hold", async ({ page, request }) => {
    await request.post(`${BROKER}/__reset`);
    const buy = await page.request.post("/api/v1/trade/orders", { headers: ipHeaders(), data: { clientOrderId: randomUUID(), slug: "aapl", side: "buy", type: "market", amountUsd: 500 } });
    expect(buy.status(), await buy.text()).toBe(200);
    await page.goto("/assets/aapl?side=sell#trade");
    const t = page.locator("#trade");
    await t.getByRole("radio", { name: "Trailing stop" }).click();
    await t.getByLabel(/How many/).fill("2");
    await t.getByLabel("Trail (%)").fill("8");
    await t.getByRole("button", { name: "Review sell" }).click();
    await expect(t.getByRole("region", { name: "Review your order" })).toContainText("if the price falls 8% from its highest point from now on");
    await t.getByRole("button", { name: "Confirm sell" }).click();
    await expect(t.getByRole("status").filter({ hasText: "Order sent to Alpaca: accepted." })).toBeVisible();
    const post = (d: object) => page.request.post("/api/v1/trade/orders", { headers: ipHeaders(), data: { clientOrderId: randomUUID(), slug: "aapl", side: "sell", qty: 1, ...d } });
    let r = await post({ type: "oco", takeProfit: 1, stopLoss: 1e6 });
    expect((await r.json()).message).toMatch(/target must be above the current price/);
    r = await post({ type: "trailing", trailPct: 80 });
    expect((await r.json()).message).toMatch(/between 0\.1% and 50%/);
    r = await page.request.post("/api/v1/trade/orders", { headers: ipHeaders(), data: { clientOrderId: randomUUID(), slug: "bitcoin", side: "sell", qty: 1, type: "trailing", trailPct: 5 } });
    expect((await r.json()).message).toMatch(/not crypto|don't hold/);
    await request.post(`${BROKER}/__reset`);
  });

  test("F22-N2 the daily spending cap stops the assistant", async ({ browser }) => {
    const c = await browser.newContext({ storageState: ownerState("b") });
    const p = await c.newPage();
    let r = await (await p.request.post("/api/v1/assistant", { headers: ipHeaders(), data: { conversationId: null, text: "Give me an expensive answer" } })).json();
    expect(r.spent).toBeGreaterThan(2);
    r = await (await p.request.post("/api/v1/assistant", { headers: ipHeaders(), data: { conversationId: r.id, text: "One more" } })).json();
    expect(r.note).toMatch(/reached its \$2\.00 limit/);
    await c.close();
  });
});
