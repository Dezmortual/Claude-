import { a11y, expect, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a") });
const CRON = { authorization: "Bearer e2e-cron-secret-0123456789abcdef" };

test("F23-H1 options: expiries, calls and puts with greeks, the move priced in", async ({ page }) => {
  await page.goto("/assets/aapl");
  await page.getByRole("link", { name: "Options and greeks" }).click();
  await expect(page.getByRole("heading", { name: "Apple options (AAPL)" })).toBeVisible();
  const t = page.getByRole("region", { name: "Option chain table" });
  await expect(t.getByRole("row")).toHaveCount(6);
  await expect(t).toContainText("30%");
  await expect(page.getByRole("navigation", { name: "Expiry" }).getByRole("link")).toHaveCount(2);
  await a11y(page, "options");
  await page.getByRole("link", { name: "Puts" }).click();
  await expect(page.getByRole("link", { name: "Puts" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("navigation", { name: "Expiry" }).getByRole("link").nth(1).click();
  await expect(page.getByRole("navigation", { name: "Expiry" }).getByRole("link").nth(1)).toHaveAttribute("aria-current", "page");
  const r = await page.goto("/assets/bitcoin/options");
  expect(r?.status()).toBe(200);
  await expect(page.getByText("Bitcoin has no listed options through Alpaca.")).toBeVisible();
});

test("F23-H2 fundamentals: annual figures, ratios, and a cash-flow value you can steer", async ({ page }) => {
  await page.goto("/assets/aapl/fundamentals");
  await expect(page.getByRole("heading", { name: "Apple fundamentals" })).toBeVisible();
  const y = page.getByRole("region", { name: "Annual figures table" });
  await expect(y.getByRole("columnheader")).toHaveText(["Figure", "FY2023", "FY2024", "FY2025"]);
  await expect(y.getByRole("row", { name: /^Revenue/ })).toContainText("$416bn");
  await expect(y.getByRole("row", { name: /^Free cash flow/ })).toContainText("$99bn");
  await expect(page.getByText("Free cash flow yield")).toBeVisible();
  const value = page.locator("#dcf").getByRole("status");
  await expect(value).toContainText(/Value: \$[\d,.]+ a share/);
  const before = await value.textContent();
  await page.getByLabel("Discount rate (%)").fill("12");
  await expect(value).not.toHaveText(before!);
  await page.getByLabel("Then for ever (%)").fill("13");
  await expect(value).toHaveText("The discount rate must be above the long-run growth rate.");
  await a11y(page, "fundamentals");
  expect((await page.goto("/assets/spy/fundamentals"))?.status()).toBe(404);
});

test("F23-H3 world affairs is its own news topic", async ({ page, request }) => {
  await request.post("/api/cron/news", { headers: CRON });
  await page.goto("/news?topic=world");
  const feed = page.locator("#feed");
  await expect(feed).toContainText("Ceasefire talks resume");
  await expect(feed).not.toContainText("Apple shares tumble");
  await page.goto("/news?topic=markets");
  await expect(page.locator("#feed")).not.toContainText("Ceasefire talks resume");
});
