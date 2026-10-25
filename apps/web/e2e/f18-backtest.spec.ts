import { a11y, expect, ipHeaders, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a") });
const spec = { slug: "bitcoin", timeframe: "1d", period: "all", template: null, side: "long", params: {}, stopPct: null, takePct: null,
  maxBars: null, feePct: 0.1, slippagePct: 0.05, strategyId: null, ranges: null };

test.describe.serial("F18 backtest lab", () => {
  test("F18-H1 run a template and read the results", async ({ page }) => {
    await page.goto("/backtest");
    await expect(page.getByRole("heading", { name: "Test a strategy on past prices" })).toBeVisible();
    await a11y(page, "/backtest");
    await expect(page.getByLabel("Strategy")).toHaveValue("t:ma-cross");
    await expect(page.getByLabel("Fast average (bars)", { exact: true })).toHaveValue("20");
    await expect(page.getByLabel("Fee % each way")).toHaveValue("0.1"); // the crypto cost profile, from the asset
    await page.getByRole("button", { name: "Run backtest" }).click();
    await expect(page).toHaveURL(/\/backtest\/runs\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bitcoin · ma cross");
    for (const k of ["Return", "Worst drop", "Sharpe ratio", "Trades", "Win rate"]) await expect(page.getByText(k, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Luck test" })).toBeVisible();
    await expect(page.getByText(/chance the edge is real|Too few bars/)).toBeVisible();
    await expect(page.getByRole("img", { name: /Growth of 1 on Bitcoin daily/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Trades table" })).toContainText(/Exit rule|Still open at the end/);
    await a11y(page, "run page");
  });

  test("F18-H2 sweep settings: walk-forward results, and every combination counts as a try", async ({ page }) => {
    await page.goto("/backtest");
    await page.getByLabel("Strategy").selectOption("t:breakout");
    await page.getByRole("checkbox", { name: "Sweep Breakout window (bars)" }).check();
    await expect(page.getByRole("button", { name: "Sweep 6 combinations" })).toBeEnabled();
    await page.getByRole("checkbox", { name: "Sweep Exit window (bars)" }).check();
    await page.getByRole("button", { name: "Sweep 36 combinations" }).click();
    await expect(page.getByRole("heading", { name: "Walk-forward test" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("region", { name: "Walk-forward stretches" }).getByRole("row")).toHaveCount(4);
    await expect(page.getByText("Unseen-data return")).toBeVisible();
    await expect(page.getByText(/after counting all 144 versions tried/)).toBeVisible(); // 36 × (1 + 3 stretches)
    await a11y(page, "sweep page");
  });

  test("F18-H3 save a strategy, change it, and keep both versions", async ({ page }) => {
    await page.goto("/backtest");
    await page.getByLabel("Strategy").selectOption("t:rsi-dip");
    await page.getByLabel("Name").fill("RSI dip on Bitcoin");
    await page.getByRole("button", { name: "Save strategy" }).click();
    await expect(page).toHaveURL(/\?strategy=/);
    await expect(page.getByRole("heading", { name: "Saved strategy · version 1" })).toBeVisible();
    await page.getByLabel("Oversold level", { exact: true }).fill("25");
    await page.getByRole("button", { name: "Save as a new version" }).click();
    await expect(page.getByRole("heading", { name: "Saved strategy · version 2" })).toBeVisible();
    await expect(page.getByLabel("Oversold level", { exact: true })).toHaveValue("25");
    await page.getByText("Version history (2)").click();
    await expect(page.getByText(/"low":30/)).toBeVisible();
    await expect(page.locator("#strategies")).toContainText("RSI dip on Bitcoin");
    // Runs of a saved strategy share one try count.
    await page.getByRole("button", { name: "Run backtest" }).click();
    await expect(page.getByText(/chance the edge is real\. |Too few bars/)).toBeVisible();
  });

  test("F18-H4 rules from one of my indicators, then compare two runs", async ({ page }) => {
    const r = await page.request.post("/api/v1/me/indicators", { headers: ipHeaders(), data: { name: "Fast EMA cross", lines: ["ema(close, 10)"], display: "overlay",
      buyRule: "crosses_above(close, ema(close, 10))", sellRule: "crosses_below(close, ema(close, 10))" } });
    expect(r.status(), await r.text()).toBe(200);
    await page.goto("/backtest");
    await page.getByLabel("Strategy").selectOption({ label: "Fast EMA cross" });
    await expect(page.getByLabel("Enter when")).toHaveValue("crosses_above(close, ema(close, 10))");
    await page.getByRole("button", { name: "Run backtest" }).click();
    await expect(page).toHaveURL(/\/backtest\/runs\//);
    await page.goto("/backtest#runs");
    const boxes = page.getByRole("checkbox", { name: /^Compare / });
    await boxes.nth(0).check(); await boxes.nth(1).check();
    await page.getByRole("button", { name: "Compare 2 runs" }).click();
    await expect(page.getByRole("heading", { name: "Compare backtests" })).toBeVisible();
    await expect(page.getByRole("img", { name: /Growth of 1, compared/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Comparison table" }).getByRole("row")).toHaveCount(9);
    await a11y(page, "compare");
  });

  test("F18-N1 bad rules are caught before anything runs", async ({ page }) => {
    await page.goto("/backtest");
    await page.getByLabel("Strategy").selectOption("custom");
    await page.getByLabel("Enter when").fill("close > sma(close, {n}");
    await expect(page.getByRole("button", { name: "Run backtest" })).toBeDisabled();
    await page.getByLabel("Enter when").fill("close > sma(close, {n})");
    await expect(page.getByText("Give {n} a value.")).toBeVisible();
    await page.getByLabel("{n}", { exact: true }).fill("50");
    await expect(page.getByRole("button", { name: "Run backtest" })).toBeEnabled();
    const post = (d: object) => page.request.post("/api/v1/backtests", { headers: ipHeaders(), data: { ...spec, ...d } });
    let res = await post({ entry: "crosses_above(close, sma(close, 20))", exit: null });
    expect(res.status()).toBe(422);
    expect((await res.json()).message).toMatch(/A crossing is true for one bar only/);
    res = await post({ entry: "close > nope(close)", exit: null });
    expect((await res.json()).message).toMatch(/^The entry rule: /);
    res = await post({ entry: "close > sma(close, {n})", exit: null, params: { n: 20 }, ranges: [{ name: "n", from: 2, to: 400, step: 1 }] });
    expect((await res.json()).message).toMatch(/keep it to 120 or fewer/);
    res = await post({ entry: "close > sma(close, 20)", exit: null, feePct: 9 });
    expect((await res.json()).message).toMatch(/surely a typo/);
  });

  test("F18-E1 pin and delete a run; another owner can't see it", async ({ page, browser }) => {
    await page.goto("/backtest#runs");
    await page.getByRole("region", { name: "Past backtests table" }).getByRole("link").first().click();
    await page.waitForURL(/\/backtest\/runs\/[0-9a-f-]{36}$/);
    const url = page.url();
    await page.getByRole("button", { name: "Pin" }).click();
    await expect(page.getByText("Pinned", { exact: true })).toBeVisible();
    const other = await browser.newContext({ storageState: ownerState("b") });
    const o = await other.newPage();
    const r = await o.request.get(`/api/v1/backtests/${url.split("/").pop()}`);
    expect(r.status()).toBe(404);
    await other.close();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/backtest#runs$/);
    expect((await page.request.get(`/api/v1/backtests/${url.split("/").pop()}`)).status()).toBe(404);
  });
});

test("F18-M1 the lab works at phone width @mobile", async ({ page }) => {
  await page.goto("/backtest");
  await page.getByRole("button", { name: "Run backtest" }).click();
  await expect(page.getByRole("heading", { name: "Luck test" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
