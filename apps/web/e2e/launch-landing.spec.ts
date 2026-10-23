import { a11y, expect, ownerState, test } from "./fixtures";

// The landing page stays private unless PUBLIC_LANDING=true (the e2e server leaves it off).
test("L-N1 guest can't see the landing page in the private build", async ({ page }) => {
  await page.goto("/welcome");
  await expect(page).toHaveURL(/\/sign-in/);
});

test.describe("L-H1 owner previews the landing page", () => {
  test.use({ storageState: ownerState("a") });
  test("every section renders, the screenshot loads, axe passes", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.getByRole("heading", { level: 1, name: "Forecasts that keep score, misses included." })).toBeVisible();
    await expect(page.getByText("Preview: only you can see this page.")).toBeVisible();
    for (const h of ["Signal apps grade their own homework", "How it works", "Built to be checked", "Pricing", "Questions"]) {
      await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
    }
    const img = page.getByRole("img", { name: /A FXDEZ asset page/ });
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByRole("link", { name: "Open the forecasts" }).first()).toHaveAttribute("href", "/forecasts");
    await a11y(page, "/welcome");
  });
});

test.describe("L-E1 landing page at phone width", () => {
  test.use({ storageState: ownerState("a") });
  test("no sideways scroll @mobile", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await a11y(page, "/welcome mobile");
  });
});
