import { a11y, expect, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a") });

test.describe("F02 read an outlook and size a position", () => {
  test("F02-H1 calculator gives an ordered range", async ({ page }) => {
    await page.goto("/assets/bitcoin");
    await a11y(page, "/assets/bitcoin");
    const calc = page.getByRole("heading", { name: "What would that mean for me?" }).locator("..");
    await calc.getByLabel("Amount (USD)").fill("1000");
    await calc.getByRole("button", { name: "Calculate" }).click();
    const values = await calc.locator("dd").allTextContents();
    expect(values).toHaveLength(3);
    const [lo, mid, hi] = values.map((v) => Number(v.replace(/[^0-9.]/g, "")));
    expect(lo).toBeLessThan(mid);
    expect(mid).toBeLessThan(hi);
  });

  for (const bad of ["12,5x", "", "-5", "🚀"]) {
    test(`F02-E1 invalid amount "${bad}"`, async ({ page }) => {
      await page.goto("/assets/bitcoin");
      const calc = page.getByRole("heading", { name: "What would that mean for me?" }).locator("..");
      await calc.getByLabel("Amount (USD)").fill(bad);
      await calc.getByRole("button", { name: "Calculate" }).click();
      await expect(calc.getByText("Enter an amount above 0")).toBeVisible();
      await expect(calc.locator("dd")).toHaveCount(0);
    });
  }

  test("F02-E2 chart range switches", async ({ page }) => {
    await page.goto("/assets/bitcoin");
    const ranges = page.getByRole("radiogroup", { name: "Chart range" });
    for (const r of ["1Y", "1D", "3M"]) {
      await ranges.getByRole("radio", { name: r }).click();
      await expect(ranges.getByRole("radio", { name: r })).toHaveAttribute("aria-checked", "true");
    }
  });

  test("F02-E3 a timeframe without enough bars says so", async ({ page }) => {
    await page.goto("/assets/eurusd/signals");
    await a11y(page, "/assets/eurusd/signals");
    await page.getByRole("radiogroup", { name: "Timeframe" }).getByRole("radio", { name: /5 min/ }).click();
    await expect(page.getByText(/Not enough history on this timeframe/)).toBeVisible();
  });

  test("F02-N1 unknown asset is a 404 with a way back", async ({ page }) => {
    const r = await page.goto("/assets/not-a-coin");
    expect(r?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "There's nothing at this address" })).toBeVisible();
    await page.getByRole("link", { name: "Go to forecasts" }).click();
    await expect(page).toHaveURL(/\/forecasts/);
  });

  test("F02-E4 asset page at phone width @mobile", async ({ page }) => {
    await page.goto("/assets/bitcoin");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await a11y(page, "/assets/bitcoin mobile");
  });

  test("live price and signals pages pass axe", async ({ page }) => {
    await page.goto("/assets/bitcoin/live");
    await a11y(page, "/assets/bitcoin/live");
    await page.goto("/markets/crypto");
    await a11y(page, "/markets/crypto");
    await page.goto("/markets/forex/assets");
    await a11y(page, "/markets/forex/assets");
    await page.goto("/track-record");
    await a11y(page, "/track-record");
    await page.goto("/");
    await a11y(page, "/");
  });
});

test.describe("bugs found in the manual pass", () => {
  test.use({ storageState: ownerState("a") });

  test("BUG-009 no cross-check claim where there is no second source", async ({ page }) => {
    await page.goto("/assets/gold"); // demo series: no second source exists
    await expect(page.getByText("Cross-check: none for this source")).toBeVisible();
    await expect(page.getByText(/Cross-check:\s*agrees within/)).toHaveCount(0);
  });

  test("BUG-011 the price chart has an accessible name", async ({ page }) => {
    await page.goto("/assets/bitcoin");
    await expect(page.getByRole("figure", { name: "Bitcoin price chart" })).toBeVisible();
  });
});
