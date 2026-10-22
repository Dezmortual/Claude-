import { a11y, expect, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a") });

test("S06 year-by-year outlook cards set each scenario against the asset's own past moves", async ({ page }) => {
  await page.goto("/assets/bitcoin");
  const s = page.locator("#long-term");
  const cards = s.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3, name: /^\d{4} · in \d+ years?$/ }) });
  await expect(cards).toHaveCount(5);
  const year = new Date().getUTCFullYear();
  await expect(cards.first().getByRole("heading")).toHaveText(`${year + 1} · in 1 year`);
  await expect(cards.first()).toContainText("base case");
  await expect(cards.first()).toContainText(/Bitcoin's own 1-year moves since \w+ \d{4}: [+-]?\d+% to [+-]?\d+%, median [+-]?\d+%, up in \d+%\. The base case is above \d+% of them\./);
  await expect(cards.last()).toContainText("Not enough stored history to compare 10-year moves");
  await a11y(page, "/assets/bitcoin outlook cards");
});
