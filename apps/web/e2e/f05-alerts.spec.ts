import { a11y, expect, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a") });

test.describe("F05 set an alert", () => {
  test("F05-H1 price alert from an asset page", async ({ page }) => {
    await page.goto("/assets/solana");
    await page.getByRole("link", { name: "Set alert" }).click();
    await expect(page).toHaveURL(/\/alerts\?asset=solana/);
    await a11y(page, "/alerts");
    await expect(page.getByLabel("Asset")).toHaveValue("solana");
    await page.getByLabel("When").selectOption("price_above");
    await page.getByLabel("Price", { exact: true }).fill("1000000");
    await page.getByRole("button", { name: "Save alert" }).click();
    await expect(page.getByText("Solana: price above 1,000,000")).toBeVisible();
  });

  test("F05-E1 signal alert reads well", async ({ page }) => {
    await page.goto("/alerts");
    await page.getByLabel("Asset").selectOption("bitcoin");
    await page.getByLabel("When").selectOption("signal_becomes");
    await page.getByLabel("Signal", { exact: true }).selectOption("strong_buy");
    await page.getByLabel("Timeframe").selectOption("1d");
    await page.getByRole("button", { name: "Save alert" }).click();
    await expect(page.getByText("Bitcoin: 1 day signal turns strong buy")).toBeVisible();
  });

  for (const bad of ["-5", "", "abc"]) {
    test(`F05-N1 invalid threshold "${bad}" saves nothing`, async ({ page }) => {
      await page.goto("/alerts");
      const before = await page.getByRole("switch").count();
      await page.getByLabel("When").selectOption("price_below");
      await page.getByLabel("Price", { exact: true }).fill(bad);
      await page.getByRole("button", { name: "Save alert" }).click();
      await expect(page.getByRole("alert").filter({ hasText: /\w/ })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("switch")).toHaveCount(before);
    });
  }

  test("F05-E2 pause, resume, delete persist", async ({ page }) => {
    await page.goto("/alerts");
    const row = page.getByRole("listitem").filter({ hasText: "Solana: price above" });
    await row.getByRole("switch").uncheck();
    await expect(page.getByRole("status").filter({ hasText: "Alert paused" })).toBeVisible();
    await page.reload();
    await expect(row.getByRole("switch")).not.toBeChecked();
    await row.getByRole("switch").check();
    await page.reload();
    await expect(row.getByRole("switch")).toBeChecked();
    await row.getByRole("button", { name: /Delete alert/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Alert deleted" })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Solana: price above")).toHaveCount(0);
  });
});
