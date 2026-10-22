import { a11y, expect, ownerState, test } from "./fixtures";

test.describe("G-H1 signal gauge", () => {
  test.use({ storageState: ownerState("a") });
  test("shows the overall reading and the counts for the chosen timeframe", async ({ page }) => {
    await page.goto("/assets/bitcoin/signals");
    await page.getByRole("radio", { name: /1 hour/ }).click();
    const gauge = page.getByRole("figure", { name: /^1 hour: (Strong buy|Buy|Neutral|Sell|Strong sell)\. \d+ sell, \d+ neutral, \d+ buy readings\.$/ });
    await expect(gauge).toBeVisible();
    await expect(gauge.getByText("Overall reading · 1 hour")).toBeVisible();
    // The three counts are the twenty indicators of that timeframe.
    const counts = await gauge.locator("dd").allTextContents();
    expect(counts.map(Number).reduce((a, b) => a + b, 0)).toBe(20);
    await page.getByRole("radio", { name: /1 day/ }).click();
    await expect(page.getByRole("figure", { name: /^1 day: / })).toBeVisible();
    await a11y(page, "/assets/bitcoin/signals gauge");
  });
});
