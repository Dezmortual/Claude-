import { a11y, expect, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a") });

test.describe("F01 find a strong signal", () => {
  test("F01-H1 filter the table and open an asset", async ({ page }) => {
    await page.goto("/forecasts");
    await a11y(page, "/forecasts");
    await page.getByRole("navigation", { name: "Market" }).getByRole("link", { name: "Crypto" }).click();
    await expect(page).toHaveURL(/market=crypto/);
    await page.getByLabel("Signal").selectOption("neutral");
    await expect(page).toHaveURL(/signal=neutral/);
    const first = page.getByRole("table").getByRole("rowheader").first().getByRole("link");
    const name = (await first.textContent())!.trim();
    await first.click();
    await expect(page.getByRole("heading", { level: 1, name: `${name} price forecast` })).toBeVisible();
  });

  test("F01-E1 no results shows an empty state that clears", async ({ page }) => {
    await page.goto("/forecasts?q=zzzz");
    await expect(page.getByRole("heading", { name: "No assets match these filters" })).toBeVisible();
    await a11y(page, "/forecasts empty");
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("F01-E2 emoji, accents and long input", async ({ page }) => {
    await page.goto("/forecasts");
    const box = page.getByRole("searchbox", { name: "Search assets" });
    await box.fill("₿ Ünïcødé 🚀");
    await box.press("Enter");
    await expect(page.getByRole("heading", { name: "No assets match these filters" })).toBeVisible();
    await box.fill("x".repeat(200));
    expect((await box.inputValue()).length).toBe(60);
    await box.press("Enter");
    await expect(page.getByRole("heading", { name: "No assets match these filters" })).toBeVisible();
  });

  test("F01-E3 sort, rows per page, paginate, back button", async ({ page }) => {
    await page.goto("/forecasts");
    await page.getByRole("table").getByRole("link", { name: /7 days/ }).click();
    await expect(page).toHaveURL(/sort=7d/);
    await expect(page.getByRole("columnheader", { name: /7 days/ })).toHaveAttribute("aria-sort", /descending|ascending/);
    await page.getByRole("navigation", { name: "Pagination" }).getByRole("link", { name: "10", exact: true }).click();
    await expect(page.getByRole("table").getByRole("rowheader")).toHaveCount(10);
    const page1 = await page.getByRole("table").getByRole("rowheader").allTextContents();
    await page.getByRole("navigation", { name: "Pagination" }).getByRole("link", { name: "2", exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    const page2 = await page.getByRole("table").getByRole("rowheader").allTextContents();
    expect(page2).not.toEqual(page1);
    await page.goBack();
    await expect(page).not.toHaveURL(/page=2/);
    expect(await page.getByRole("table").getByRole("rowheader").allTextContents()).toEqual(page1);
  });

  test("F01-E4 keyboard: change the signal filter, focus stays", async ({ page }) => {
    await page.goto("/forecasts");
    await page.getByLabel("Signal").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page).toHaveURL(/signal=strong_buy/);
    await expect(page.getByLabel("Signal")).toBeFocused();
  });

  test("F01-E6 refresh keeps filters", async ({ page }) => {
    await page.goto("/forecasts?market=crypto&volatility=medium");
    const before = await page.getByRole("table").getByRole("rowheader").allTextContents();
    await page.reload();
    await expect(page.getByLabel("Volatility")).toHaveValue("medium");
    expect(await page.getByRole("table").getByRole("rowheader").allTextContents()).toEqual(before);
  });

  test("F01-E5 mobile shows cards, no sideways scroll @mobile", async ({ page }) => {
    await page.goto("/forecasts");
    await expect(page.getByRole("list", { name: "Forecasts" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await a11y(page, "/forecasts mobile");
  });
});

test("BUG-010 search box is usable at phone width @mobile", async ({ page }) => {
  await page.goto("/forecasts");
  const search = await page.getByRole("searchbox", { name: "Search assets" }).boundingBox();
  const signal = await page.getByLabel("Signal").boundingBox();
  expect(search!.width).toBeGreaterThan(300);
  const overlaps = !(search!.x + search!.width <= signal!.x || signal!.x + signal!.width <= search!.x || search!.y + search!.height <= signal!.y || signal!.y + signal!.height <= search!.y);
  expect(overlaps).toBe(false);
});
