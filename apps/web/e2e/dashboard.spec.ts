import { a11y, expect, ownerState, test } from "./fixtures";

test.describe("D-H1 owner dashboard", () => {
  test.use({ storageState: ownerState("a") });
  test("panel, market cards, signals and watchlist render; axe passes", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Your markets today" })).toBeVisible();
    for (const h of ["Markets", "Strongest signals", "Watchlist", "Crypto signals right now"]) {
      await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: /Bitcoin/ }).first()).toHaveAttribute("href", "/assets/bitcoin");
    await expect(page.getByText("Live assets")).toBeVisible();
    await a11y(page, "/ dashboard");
  });

  test("two cards per row and no sideways scroll at phone width @mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await a11y(page, "/ dashboard mobile");
  });
});
