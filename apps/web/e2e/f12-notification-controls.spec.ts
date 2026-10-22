import fs from "node:fs";
import path from "node:path";
import { OWNERS } from "../playwright.config";
import { a11y, expect, ipHeaders, ownerState, test } from "./fixtures";
import { test as base, type APIRequestContext, type Page } from "@playwright/test";

test.use({ storageState: ownerState("a") });
const CRON = { authorization: "Bearer e2e-cron-secret-0123456789abcdef" };
const OWNER_A = OWNERS[0];
const OUTBOX = path.join(process.cwd(), ".data", "outbox");

async function tz(page: Page) {
  await page.goto("/account");
  return page.locator("#pf-tz").inputValue();
}
const hourIn = (zone: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
const set = (page: Page, data: object) => page.request.patch("/api/v1/me/delivery", { headers: ipHeaders(), data });

/** Creates an alert that fires on the next run, runs the alerts job, and returns the job's result and the event. */
async function fire(page: Page, request: APIRequestContext, slug: string) {
  const a = await page.request.post("/api/v1/me/alerts", { headers: ipHeaders(), data: { assetSlug: slug, condition: "price_above", threshold: 0.000001, channels: ["email"] } });
  expect(a.ok()).toBe(true);
  const alert = await a.json();
  const run = await (await request.post("/api/cron/alerts", { headers: CRON })).json();
  const events = await (await page.request.get("/api/v1/me/alert-events", { headers: ipHeaders() })).json();
  return { alert, run, event: events.find((e: { slug: string }) => e.slug === slug) };
}
const remove = (page: Page, id: string) => page.request.delete(`/api/v1/me/alerts/${id}`, { headers: ipHeaders() });

test.describe.serial("F6 notification controls", () => {
  test.afterEach(async ({ page }) => { await set(page, { muteFor: "off", quiet: null, emailMode: "instant" }); });

  test("F6-H1 the settings save and say what they do", async ({ page }) => {
    await page.goto("/alerts#delivery");
    await a11y(page, "/alerts delivery");
    await page.getByRole("button", { name: "For 8 hours" }).click();
    await expect(page.locator("#delivery").getByRole("status").filter({ hasText: /^Muted until/ })).toBeVisible();
    await page.reload();
    await expect(page.locator("#delivery").getByText(/^Muted until/)).toBeVisible();
    await page.getByRole("button", { name: "Unmute" }).click();
    await expect(page.locator("#delivery").getByText("Not muted: alerts are sent as they fire.")).toBeVisible();
    await page.getByLabel("Hold alerts overnight").check();
    await expect(page.getByLabel("From")).toBeEnabled();
    await page.getByLabel("to", { exact: true }).selectOption("6");
    await page.getByLabel("One summary a day, at").check();
    await page.reload();
    await expect(page.getByLabel("Hold alerts overnight")).toBeChecked();
    await expect(page.getByLabel("to", { exact: true })).toHaveValue("6");
    await expect(page.getByLabel("One summary a day, at")).toBeChecked();
  });

  test("F6-E1 muted: the alert fires and is listed, nothing is sent", async ({ page, request }) => {
    await set(page, { muteFor: "24h" });
    const { alert, run, event } = await fire(page, request, "polkadot");
    expect(run.muted).toBeGreaterThanOrEqual(1);
    expect(event.email.status).toBe("muted");
    await page.goto("/alerts");
    await expect(page.locator("#recent-alerts ~ ul li").filter({ hasText: "Polkadot is at" }).first()).toContainText("email not sent (muted or quiet hours)");
    await remove(page, alert.id);
  });

  test("F6-E2 quiet hours hold the email until they end", async ({ page, request }) => {
    const h = hourIn(await tz(page));
    await set(page, { quiet: { start: h, end: (h + 1) % 24 } });
    const { alert, run, event } = await fire(page, request, "litecoin");
    expect(run.held).toBeGreaterThanOrEqual(1);
    expect(event.email.status).toBe("pending");
    await set(page, { quiet: null });
    await request.post("/api/cron/alerts", { headers: CRON });
    const after = (await (await page.request.get("/api/v1/me/alert-events", { headers: ipHeaders() })).json()).find((e: { id: string }) => e.id === event.id);
    expect(after.email.status).toBe("sent");
    await remove(page, alert.id);
  });

  test("F6-E3 the daily summary collects alerts into one email at the chosen hour", async ({ page, request }) => {
    const h = hourIn(await tz(page));
    await set(page, { emailMode: "digest", digestHour: (h + 12) % 24 });
    const { alert, run, event } = await fire(page, request, "stellar");
    expect(event.email.status).toBe("digest");
    expect(run.digests).toBe(0); // not the chosen hour
    await set(page, { digestHour: h });
    const due = await (await request.post("/api/cron/alerts", { headers: CRON })).json();
    expect(due.digests).toBe(1);
    const after = (await (await page.request.get("/api/v1/me/alert-events", { headers: ipHeaders() })).json()).find((e: { id: string }) => e.id === event.id);
    expect(after.email.status).toBe("sent");
    const summary = fs.readdirSync(OUTBOX).sort().reverse().map((f) => fs.readFileSync(path.join(OUTBOX, f), "utf8"))
      .find((b) => b.startsWith(`To: ${OWNER_A}\n`) && b.includes("Subject: Your alerts:"));
    expect(summary).toContain("Stellar is at");
    expect(summary).toMatch(/Stop this alert: http\S+\/alerts\/stop\?t=[0-9a-f]{64}/);
    await remove(page, alert.id);
  });
});

base.describe("F6-H2 the stop link in an alert email", () => {
  base("works without signing in, asks first, and pauses only that alert", async ({ browser }) => {
    const owner = await browser.newContext({ storageState: ownerState("a") });
    const op = await owner.newPage();
    const { alert } = await fire(op, op.request, "hedera");
    const mail = fs.readdirSync(OUTBOX).sort().reverse().map((f) => fs.readFileSync(path.join(OUTBOX, f), "utf8"))
      .find((b) => b.startsWith(`To: ${OWNER_A}\n`) && b.includes("Hedera is at"))!;
    const link = mail.match(/Stop this alert: (http\S+)/)![1];
    const guest = await browser.newContext();
    const g = await guest.newPage();
    await g.goto(new URL(link).pathname + new URL(link).search);
    await expect(g.getByRole("heading", { name: "Stop this alert?" })).toBeVisible();
    await expect(g.getByText("Hedera: price above 0.000001")).toBeVisible();
    await g.getByRole("button", { name: "Stop this alert" }).click();
    await expect(g.getByRole("heading", { name: "Stopped" })).toBeVisible();
    const mine = await (await op.request.get("/api/v1/me/alerts", { headers: ipHeaders() })).json();
    expect(mine.find((a: { id: string }) => a.id === alert.id).isActive).toBe(false);
    // One-click from a mail app's unsubscribe button, and a made-up token.
    const token = new URL(link).searchParams.get("t");
    expect((await guest.request.post(`/api/v1/alerts/stop?t=${token}`)).status()).toBe(200);
    expect((await guest.request.post(`/api/v1/alerts/stop?t=${"0".repeat(64)}`)).status()).toBe(404);
    await g.goto(`/alerts/stop?t=${"0".repeat(64)}`);
    await expect(g.getByRole("heading", { name: "This stop link isn't valid" })).toBeVisible();
    await remove(op, alert.id);
    await guest.close(); await owner.close();
  });
});
