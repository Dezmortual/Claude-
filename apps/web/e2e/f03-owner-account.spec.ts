import { a11y, emailedLink, expect, OWNER_PASSWORD, signIn, test } from "./fixtures";

test.describe("F03 set up the owner account", () => {
  test("F03-N1 a non-owner cannot sign up", async ({ page }) => {
    await page.goto("/sign-up");
    await a11y(page, "/sign-up");
    await page.getByLabel("Name").fill("Stranger");
    await page.getByLabel("Email").fill("stranger@e2e.test");
    await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
    await page.getByLabel("Confirm password").fill(OWNER_PASSWORD);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /private\. Sign-ups are closed/ })).toBeVisible();
  });

  test("F03-N5 short and mismatched passwords", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Name").fill("X");
    await page.getByLabel("Email").fill("owner-c@e2e.test");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Use at least 8 characters")).toBeVisible();
    await page.getByLabel("Password", { exact: true }).fill("long enough 1");
    await page.getByLabel("Confirm password").fill("long enough 2");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("The passwords don't match")).toBeVisible();
  });

  test("F03-H1 + N3 + E3 sign up, unverified sign-in, confirm once, sign in", async ({ page }) => {
    const email = "owner-c@e2e.test";
    await page.goto("/sign-up");
    await page.getByLabel("Name").fill("Owner C");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
    await page.getByLabel("Confirm password").fill(OWNER_PASSWORD);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("status")).toContainText("Confirm your email");

    await page.goto("/sign-in");
    await a11y(page, "/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /Confirm your email first/ })).toBeVisible();

    const link = await emailedLink(email, "verify-email");
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
    await page.goto(link); // used, but for this now-confirmed account: still a success
    await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
    await page.goto("/verify-email?token=not-a-real-code");
    await expect(page.getByText(/expired or was already used/)).toBeVisible();

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/forecasts/);
  });

  test("F03-E1 + E2 long emoji name, double click creates one account", async ({ page }) => {
    const name = "Zoë 🚀 Ångström-Núñez ".repeat(4).slice(0, 80);
    await page.goto("/sign-up");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Email").fill("owner-d@e2e.test");
    await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
    await page.getByLabel("Confirm password").fill(OWNER_PASSWORD);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).dblclick();
    await expect(page.getByRole("status")).toContainText("Confirm your email");
    const link = await emailedLink("owner-d@e2e.test", "verify-email");
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
    // Opening it again (or a mail scanner having opened it first) still says confirmed, not "didn't work".
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("owner-d@e2e.test");
    await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/forecasts/);
    await page.goto("/account");
    await expect(page.getByLabel("Name")).toHaveValue(name.trim());
  });

  test("F03-N2 wrong password", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("owner-a@e2e.test");
    await page.getByLabel("Password", { exact: true }).fill("not the password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /don't match an account/ })).toBeVisible();
    await page.goto("/forecasts");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("F03-N4 password reset works once and ends other sessions", async ({ page, browser }) => {
    const email = "owner-c@e2e.test";
    const other = await browser.newContext();
    const op = await other.newPage();
    await signIn(op, email);
    await op.goto("/forecasts");
    await expect(op).toHaveURL(/\/forecasts/);

    await page.goto("/forgot-password");
    await a11y(page, "/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("Check your inbox");
    const link = await emailedLink(email, "reset-password");
    await page.goto(link);
    await a11y(page, "/reset-password");
    await page.getByLabel("New password").fill("a new password 2");
    await page.getByLabel("Confirm password").fill("a new password 2");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByRole("status")).toContainText("Password changed");

    await op.goto("/forecasts");
    await expect(op).toHaveURL(/\/sign-in/);
    await other.close();

    await page.goto(link);
    await page.getByLabel("New password").fill("yet another one 3");
    await page.getByLabel("Confirm password").fill("yet another one 3");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /expired or was already used/ })).toBeVisible();
  });
});
