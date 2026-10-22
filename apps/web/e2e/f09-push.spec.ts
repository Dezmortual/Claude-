import { createECDH, randomBytes } from "node:crypto";
import { a11y, expect, ipHeaders, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a") });

const CRON = { authorization: "Bearer e2e-cron-secret-0123456789abcdef" };
/** A well-formed subscription whose push service doesn't exist (.invalid never resolves), so every send fails. */
function fakeSubscription() {
  const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  return { endpoint: `https://push.invalid/e2e/${randomBytes(6).toString("hex")}`, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
}

test.describe("F09 app and push alerts", () => {
  test("F09-H1 the app is installable", async ({ page, request }) => {
    const m = await (await request.get("/manifest.webmanifest")).json();
    expect(m).toMatchObject({ name: "Proofcast", display: "standalone", start_url: "/" });
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const i of m.icons) expect((await request.get(i.src)).status()).toBe(200);
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(await sw.text()).toContain("notificationclick");
    await page.goto("/account");
    await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()))).toBe(true);
  });

  test("F09-H2 account shows the notification controls", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "App and notifications" })).toBeVisible();
    await expect(page.getByText(/Off for this device/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn on" })).toBeVisible();
    await a11y(page, "/account");
  });

  test("F09-E1 devices: save, list, failed test, remove", async ({ page }) => {
    const sub = fakeSubscription(), h = ipHeaders();
    const before = (await (await page.request.get("/api/v1/me/devices", { headers: h })).json()).devices;
    expect((await page.request.post("/api/v1/me/devices", { headers: h, data: sub })).ok()).toBe(true);
    expect((await page.request.post("/api/v1/me/devices", { headers: h, data: sub })).ok()).toBe(true); // same device twice is one device
    const st = await (await page.request.get("/api/v1/me/devices", { headers: h })).json();
    expect(st).toMatchObject({ configured: true, devices: before + 1 });
    expect(st.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    const t = await page.request.post("/api/v1/me/devices/test", { headers: h });
    expect(t.status()).toBe(422);
    expect((await page.request.delete("/api/v1/me/devices", { headers: h, data: { endpoint: sub.endpoint } })).ok()).toBe(true);
    expect((await (await page.request.get("/api/v1/me/devices", { headers: h })).json()).devices).toBe(before);
  });

  test("F09-N1 a subscription must be https with both keys", async ({ page }) => {
    const sub = fakeSubscription(), h = ipHeaders();
    expect((await page.request.post("/api/v1/me/devices", { headers: h, data: { ...sub, endpoint: "http://push.invalid/x" } })).status()).toBe(422);
    expect((await page.request.post("/api/v1/me/devices", { headers: h, data: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh } } })).status()).toBe(422);
  });

  test("F09-E2 a push-only alert fires to devices and sends no email", async ({ page, request }) => {
    const sub = fakeSubscription(), h = ipHeaders();
    await page.request.post("/api/v1/me/devices", { headers: h, data: sub });
    const a = await page.request.post("/api/v1/me/alerts", { headers: h, data: { assetSlug: "ethereum", condition: "price_above", threshold: 0.0001, channels: ["push"] } });
    expect(a.ok()).toBe(true);
    const alertId = (await a.json()).id;
    const r = await (await request.post("/api/cron/alerts", { headers: CRON })).json();
    expect(r.fired).toBeGreaterThanOrEqual(1);
    expect(r.pushFailed).toBeGreaterThanOrEqual(1); // the fake device can't be reached; it's recorded, not retried
    expect(r.sent).toBe(0);
    await page.request.delete(`/api/v1/me/alerts/${alertId}`, { headers: h });
    await page.request.delete("/api/v1/me/devices", { headers: h, data: { endpoint: sub.endpoint } });
  });

  test("F09-E3 the alert form offers push", async ({ page }) => {
    await page.goto("/alerts");
    await page.getByLabel("Asset").selectOption("bitcoin");
    await page.getByLabel("When").selectOption("price_above");
    await page.getByLabel("Price", { exact: true }).fill("9999999");
    await page.getByLabel("Email").uncheck();
    await page.getByLabel("Push notification").check();
    await page.getByRole("button", { name: "Save alert" }).click();
    const row = page.getByRole("listitem").filter({ hasText: "Bitcoin: price above 9,999,999" });
    await expect(row.getByText(/^push ·/)).toBeVisible();
    await row.getByRole("button", { name: /Delete alert/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Alert deleted" })).toBeVisible();
  });
});
