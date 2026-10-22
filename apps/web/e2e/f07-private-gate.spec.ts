import { createOwner, expect, OWNER_PASSWORD, ownerState, signIn, test } from "./fixtures";
import postgres from "postgres";

test.describe("F07 private gate (guest)", () => {
  for (const p of ["/", "/forecasts", "/assets/bitcoin", "/alerts", "/account", "/track-record", "/design"]) {
    test(`F07-H1 guest is sent to sign-in from ${p}`, async ({ page }) => {
      await page.goto(p);
      await expect(page).toHaveURL(/\/sign-in/);
      if (p !== "/") expect(new URL(page.url()).searchParams.get("next")).toBe(p);
    });
  }

  test("F07-N1 API refuses guests", async ({ request }) => {
    for (const p of ["/api/v1/forecasts", "/api/v1/me/alerts", "/api/v1/assets/bitcoin", "/api/v1/track-record"]) {
      expect((await request.get(p)).status(), p).toBe(401);
    }
  });

  test("F07-N2 next can't send you off-site", async ({ page }) => {
    for (const evil of ["//evil.example", "https://evil.example", "/\\evil.example"]) {
      await page.context().clearCookies();
      await page.goto(`/sign-in?next=${encodeURIComponent(evil)}`);
      await page.getByLabel("Email").fill("owner-a@e2e.test");
      await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL((u) => u.pathname === "/forecasts");
      expect(new URL(page.url()).host).toBe("localhost:3100");
    }
  });

  test("F07-E1 a session ended on the server signs you out", async ({ page }) => {
    await createOwner(page, "owner-e@e2e.test", "Owner E");
    await signIn(page, "owner-e@e2e.test");
    await page.goto("/forecasts");
    await expect(page).toHaveURL(/\/forecasts/);
    const sql = postgres(process.env.E2E_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5499/forecast_test", { max: 1 });
    await sql`delete from sessions where user_id = (select id from users where email = 'owner-e@e2e.test')`;
    await sql.end();
    await page.reload();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("F07-E2 owner", () => {
  test.use({ storageState: ownerState("a") });
  test("pricing is hidden in the private build", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page).toHaveURL(/\/account/);
  });
});
