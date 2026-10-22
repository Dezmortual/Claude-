import { a11y, expect, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("b") });

test.describe("F08 customise columns", () => {
  test("F08-H1 turn on a column, it persists", async ({ page }) => {
    await page.goto("/forecasts");
    await page.getByRole("button", { name: "Columns" }).click();
    const dialog = page.getByRole("dialog", { name: "Table columns" });
    await a11y(page, "columns dialog");
    await dialog.getByRole("switch", { name: "1 year", exact: true }).check();
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("columnheader", { name: /1 year/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("columnheader", { name: /1 year/ })).toBeVisible();
  });

  test("F08-E1 reset then Escape saves nothing", async ({ page }) => {
    await page.goto("/forecasts");
    await page.getByRole("button", { name: "Columns" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Reset" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("columnheader", { name: /1 year/ })).toBeVisible();
  });

  test("F08-E2 the last column can't be turned off", async ({ page }) => {
    await page.goto("/forecasts");
    await page.getByRole("button", { name: "Columns" }).click();
    const switches = page.getByRole("dialog").getByRole("switch");
    for (let i = 0; i < (await switches.count()); i++) {
      const s = switches.nth(i);
      if ((await s.isChecked()) && (await s.isEnabled())) await s.uncheck();
    }
    const on = page.getByRole("dialog").getByRole("switch", { checked: true });
    await expect(on).toHaveCount(1);
    await expect(on).toBeDisabled();
    await page.keyboard.press("Escape");
  });
});
