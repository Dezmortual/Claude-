import { a11y, createOwner, expect, OWNER_PASSWORD, signIn, test } from "./fixtures";

test.describe("Account", () => {
  test("A-H1 name and time zone save and apply", async ({ page }) => {
    await createOwner(page, "owner-f@e2e.test", "Owner F");
    await signIn(page, "owner-f@e2e.test");
    await page.goto("/account");
    await a11y(page, "/account");
    await page.getByLabel("Name").fill("Frida 🌍");
    await page.getByLabel("Time zone").selectOption("Asia/Tokyo");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Name")).toHaveValue("Frida 🌍");
    await page.goto("/assets/bitcoin");
    await expect(page.getByText(/Checked .* \d{2}:\d{2}$/).first()).not.toContainText("UTC");
  });

  test("A-E1 sign out everywhere ends other sessions", async ({ page, browser }) => {
    await signIn(page, "owner-f@e2e.test");
    const other = await browser.newContext();
    const op = await other.newPage();
    await signIn(op, "owner-f@e2e.test");
    await op.goto("/watchlist");
    await expect(op).toHaveURL(/\/watchlist/);
    await page.goto("/account");
    await page.getByRole("button", { name: "Sign out on every device" }).click();
    await expect(page.getByText("signed out on every device")).toBeVisible();
    await op.reload();
    await expect(op).toHaveURL(/\/sign-in/);
    await other.close();
  });

  test("A-N1 + A-H2 delete needs the exact email, then removes the account", async ({ page }) => {
    await signIn(page, "owner-f@e2e.test");
    await page.goto("/account");
    await page.getByText("Delete my account").click();
    await page.getByLabel(/to confirm/).fill("someone-else@e2e.test");
    await page.getByRole("button", { name: "Delete account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /Type your email exactly/ })).toBeVisible();
    await page.getByLabel(/to confirm/).fill("owner-f@e2e.test");
    await page.getByRole("button", { name: "Delete account" }).click();
    await expect(page.getByText("has been deleted")).toBeVisible();
    const r = await page.request.post("/api/auth/sign-in", { data: { email: "owner-f@e2e.test", password: OWNER_PASSWORD } });
    expect(r.status()).toBe(401);
  });
});
