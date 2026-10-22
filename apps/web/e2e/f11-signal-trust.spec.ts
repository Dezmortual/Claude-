import { a11y, expect, ipHeaders, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a") });
const CRON = { authorization: "Bearer e2e-cron-secret-0123456789abcdef" };

test.describe("F11 why, when and how steady", () => {
  test("F3 every reading says why and which bar it was read on; F5 how steady it is", async ({ page }) => {
    await page.goto("/assets/bitcoin/signals");
    for (const tf of ["1 hour", "1 day"]) {
      await page.getByRole("radio", { name: new RegExp(tf) }).click();
      const why = page.locator("#pulse-detail").getByText(/^Why:/).locator("..");
      await expect(why).toContainText(/(\d+ of 20 indicators say (buy|sell) \(\d+ of 10 averages, \d+ of 10 oscillators\)|\d+ indicators say buy and \d+ say sell, too close to call)/);
      await expect(why).toContainText(`on the ${tf} bar that closed`);
      await expect(page.locator("#pulse-detail")).toContainText(/Held for \d+ closed bars? · changed (once|\d+ times) in the last (24 hours|30 daily bars)/);
    }
    await a11y(page, "/assets/bitcoin/signals why line");
  });

  test("F4 a fired alert shows when its data was from and when it was sent", async ({ page, request }) => {
    const h = ipHeaders();
    const a = await page.request.post("/api/v1/me/alerts", { headers: h, data: { assetSlug: "cardano", condition: "price_above", threshold: 0.000001, channels: ["email"] } });
    expect(a.ok()).toBe(true);
    const r = await (await request.post("/api/cron/alerts", { headers: CRON })).json();
    expect(r.fired).toBeGreaterThanOrEqual(1);
    expect(r.sent).toBeGreaterThanOrEqual(1);
    await page.goto("/alerts");
    const item = page.locator("#recent-alerts ~ ul li").filter({ hasText: "Cardano is at" }).first();
    await expect(item).toContainText(/Data up to \d+ \w+, \d\d:\d\d · fired \d+ \w+, \d\d:\d\d · email sent \d+ \w+, \d\d:\d\d/);
    const ev = (await (await page.request.get("/api/v1/me/alert-events", { headers: h })).json()).find((e: { message: string }) => e.message.startsWith("Cardano"));
    expect(ev.observedAt).toBeTruthy();
    expect(Date.parse(ev.email.sentAt)).toBeGreaterThanOrEqual(Date.parse(ev.firedAt));
    await page.request.delete(`/api/v1/me/alerts/${(await a.json()).id}`, { headers: h });
  });
});
