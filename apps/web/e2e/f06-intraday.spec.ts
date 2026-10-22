import { a11y, expect, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a") });

test("F06-H1 day trading tab and an hourly breakdown", async ({ page }) => {
  await page.goto("/forecasts");
  await page.getByRole("navigation", { name: "View" }).getByRole("link", { name: /Day trading/ }).click();
  await expect(page).toHaveURL(/tab=day_trading/);
  await expect(page.getByRole("columnheader", { name: "1 hour" })).toBeVisible();
  await a11y(page, "/forecasts day trading");
  await page.goto("/assets/bitcoin/signals");
  await page.getByRole("radiogroup", { name: "Timeframe" }).getByRole("radio", { name: /1 hour/ }).click();
  await expect(page.getByRole("table", { name: /Moving averages · 1 hour/ })).toBeVisible();
  await expect(page.getByRole("table", { name: /Oscillators · 1 hour/ })).toBeVisible();
});
