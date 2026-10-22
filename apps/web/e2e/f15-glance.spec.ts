import { a11y, expect, ipHeaders, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a") });

test("Glance shows the watchlist at a glance, refreshes itself, and is a shortcut on the app icon", async ({ page, request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m.shortcuts.map((s: { url: string }) => s.url)).toEqual(["/glance", "/watchlist", "/alerts", "/indicators"]);
  for (const s of m.shortcuts) expect((await request.get(s.icons[0].src)).status()).toBe(200);

  const w = await page.request.post("/api/v1/me/watchlist", { headers: ipHeaders(), data: { asset: "solana" } });
  expect([200, 409]).toContain(w.status()); // 409: already on the watchlist
  await page.goto("/glance");
  await expect(page.getByRole("heading", { name: "Glance", level: 1 })).toBeVisible();
  await expect(page.getByText(/^Updated \d\d:\d\d · every minute$/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Solana/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Latest alerts" })).toBeVisible();
  await a11y(page, "/glance");
  await page.getByRole("link", { name: /Solana/ }).click();
  await expect(page).toHaveURL(/\/assets\/solana$/);
});
