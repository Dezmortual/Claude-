import { a11y, expect, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a") });

test.describe.serial("F21 economy and prediction markets", () => {
  test("F21-H1 the economy page groups the series with their latest readings", async ({ page }) => {
    await page.goto("/macro");
    await expect(page.getByRole("heading", { name: "The economy behind the markets" })).toBeVisible();
    for (const g of ["Inflation", "Jobs", "Growth", "Rates", "Money and markets", "Housing"]) await expect(page.getByRole("heading", { name: g, exact: true })).toBeVisible();
    const cpi = page.getByRole("link", { name: /US consumer prices \(CPI\)/ });
    await expect(cpi).toContainText(/\+3\.\d%over the year to/);
    await expect(page.getByRole("link", { name: /US unemployment rate/ })).toContainText(/\d\.\d\d%/);
    await a11y(page, "/macro");
  });

  test("F21-H2 one series: change over a year or level, periods, values, pin to home", async ({ page }) => {
    await page.goto("/macro/CPIAUCSL");
    await expect(page.getByRole("heading", { name: "US consumer prices (CPI)" })).toBeVisible();
    await expect(page.getByRole("img", { name: /change over a year: from/ })).toBeVisible();
    await page.getByRole("link", { name: "Level" }).click();
    await expect(page).toHaveURL(/view=level/);
    await expect(page.getByRole("img", { name: /US consumer prices \(CPI\): from/ })).toBeVisible();
    await page.getByRole("link", { name: "5 years" }).click();
    await expect(page.getByRole("link", { name: "5 years" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("region", { name: "Latest values table" }).getByRole("row")).toHaveCount(13);
    await a11y(page, "/macro/CPIAUCSL");
    await page.getByRole("button", { name: "Pin to home" }).click();
    await expect(page.getByRole("status").filter({ hasText: "pinned to the home screen" })).toBeVisible();
    await page.goto("/");
    await expect(page.locator("#economy").getByRole("link", { name: /US consumer prices/ })).toBeVisible();
    await page.goto("/macro/CPIAUCSL");
    await page.getByRole("button", { name: "Unpin from home" }).click();
    await expect(page.getByRole("status").filter({ hasText: "taken off the home screen" })).toBeVisible();
  });

  test("F21-H3 open any FRED code; an unknown one is a not-found page", async ({ page }) => {
    await page.goto("/macro");
    await page.getByLabel("Open any FRED series by its code").fill("sp500");
    await page.getByRole("button", { name: "Open" }).click();
    await expect(page).toHaveURL(/\/macro\/SP500$/);
    await expect(page.getByRole("heading", { name: "SP500" })).toBeVisible();
    const r = await page.goto("/macro/NOPE");
    expect(r?.status()).toBe(404);
  });

  test("F21-H4 compare countries", async ({ page }) => {
    await page.goto("/macro/world");
    const t = page.getByRole("region", { name: "Countries table" });
    await expect(t.getByRole("row")).toHaveCount(5);
    await expect(t).toContainText("United Kingdom");
    await page.getByRole("link", { name: "Inflation" }).click();
    await expect(page.getByRole("link", { name: "Inflation" })).toHaveAttribute("aria-current", "page");
    await a11y(page, "/macro/world");
  });

  test("F21-H5 prediction markets: odds, search, and the ones about an asset", async ({ page }) => {
    await page.goto("/predictions");
    const fed = page.getByRole("listitem").filter({ hasText: "Will the Fed cut rates in December?" });
    await expect(fed).toContainText("62% yes");
    await expect(fed).toContainText("+4 points today");
    await expect(fed.getByRole("link")).toHaveAttribute("href", "https://polymarket.com/event/fed-december");
    await expect(page.getByRole("listitem").filter({ hasText: "Who will win the league?" })).not.toContainText("yes");
    await a11y(page, "/predictions");
    await page.getByLabel("Search questions").fill("bitcoin");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/q=bitcoin/);
    await expect(page.getByRole("list").getByRole("listitem")).toHaveCount(1);
    await page.goto("/assets/bitcoin#predictions");
    await expect(page.locator("#predictions")).toContainText("Will Bitcoin reach $150,000");
    await expect(page.locator("#predictions")).not.toContainText("Fed");
  });
});
