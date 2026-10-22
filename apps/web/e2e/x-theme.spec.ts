import { a11y, expect, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a"), colorScheme: "dark" });

for (const p of ["/forecasts", "/assets/bitcoin", "/alerts", "/account", "/watchlist"]) {
  test(`X-2 dark mode passes axe on ${p}`, async ({ page }) => {
    await page.goto(p);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
    await a11y(page, `${p} dark`);
  });
}

test("X-2 the theme toggle switches and remembers", async ({ page }) => {
  await page.goto("/forecasts");
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
