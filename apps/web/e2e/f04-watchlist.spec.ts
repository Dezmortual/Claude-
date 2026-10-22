import { a11y, expect, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a") });

test.describe("F04 watch an asset", () => {
  test("F04-E4 empty watchlist", async ({ page }) => {
    await page.goto("/watchlist");
    await expect(page.getByRole("heading", { name: "Nothing on your watchlist yet" })).toBeVisible();
    await a11y(page, "/watchlist empty");
  });

  test("F04-H1 star an asset and see it on the watchlist", async ({ page }) => {
    await page.goto("/assets/bitcoin");
    await page.getByRole("button", { name: "Watch", exact: true }).click();
    await expect(page.getByRole("button", { name: "Watching" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "added to your watchlist" })).toBeVisible();
    await page.goto("/watchlist");
    await expect(page.getByRole("link", { name: "Bitcoin" })).toBeVisible();
    await a11y(page, "/watchlist");
  });

  test("F04-E1 double click on the star leaves a consistent state", async ({ page }) => {
    await page.goto("/assets/ethereum");
    // The button is disabled while saving, so a double click must end in exactly one watchlist entry.
    await page.getByRole("button", { name: "Watch", exact: true }).dblclick();
    await expect(page.getByRole("button", { name: "Watching" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Watching" })).toBeVisible();
    await page.goto("/watchlist");
    await expect(page.getByRole("link", { name: "Ethereum" })).toHaveCount(1);
  });

  test("F04-E2 removal in a second tab shows after refresh", async ({ page, context }) => {
    await page.goto("/watchlist");
    await expect(page.getByRole("link", { name: "Bitcoin" })).toBeVisible();
    const tab2 = await context.newPage();
    await tab2.goto("/assets/bitcoin");
    await tab2.getByRole("button", { name: "Watching" }).click();
    await expect(tab2.getByRole("button", { name: "Watch", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("link", { name: "Bitcoin" })).toHaveCount(0);
  });
});

test.describe("F04-E3 another user's watchlist", () => {
  test.use({ storageState: ownerState("b") });
  test("owner B sees none of A's items", async ({ page }) => {
    await page.goto("/watchlist");
    await expect(page.getByRole("heading", { name: "Nothing on your watchlist yet" })).toBeVisible();
  });
});
