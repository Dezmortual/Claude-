import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { test as base } from "@playwright/test";
import { OWNERS } from "../playwright.config";
import { a11y, expect, ipHeaders, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a") });
const CRON = { authorization: "Bearer e2e-cron-secret-0123456789abcdef" };
const TEST_DB = process.env.E2E_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5499/forecast_test";
const OUTBOX = path.join(process.cwd(), ".data", "outbox");
/** Emails with this subject sent to the first owner (every owner gets one). */
const mails = (subject: string) => (fs.existsSync(OUTBOX) ? fs.readdirSync(OUTBOX) : [])
  .map((f) => fs.readFileSync(path.join(OUTBOX, f), "utf8")).filter((b) => b.startsWith(`To: ${OWNERS[0]}\n`) && b.includes(`Subject: ${subject}`)).length;

test("Screener: an indicator across every asset, firing now first", async ({ page }) => {
  const r = await page.request.post("/api/v1/me/indicators", { headers: ipHeaders(), data: { name: "Above its 20-bar average", lines: ["sma(close, 20)"], display: "overlay",
    buyRule: "close > sma(close, 20)", sellRule: "crosses_below(close, sma(close, 20))" } });
  const { id } = await r.json();
  await page.goto("/indicators");
  await page.getByRole("link", { name: "Screen all assets with Above its 20-bar average" }).click();
  await expect(page.getByRole("heading", { name: "Above its 20-bar average on every asset" })).toBeVisible();
  const table = page.getByRole("region", { name: "Above its 20-bar average across assets" });
  const rows = table.getByRole("row");
  expect(await rows.count()).toBeGreaterThan(10);
  // Rows where the rule holds come first.
  const now = await table.locator("tbody tr td:nth-child(2)").allTextContents();
  const firstQuiet = now.findIndex((x) => !x.includes("holds"));
  expect(now.slice(firstQuiet).some((x) => x.includes("Buy rule holds"))).toBe(false);
  await a11y(page, "screener");
  await page.getByRole("link", { name: /^Only firing now/ }).click();
  await expect(page).toHaveURL(/firing=1/);
  await expect(page.getByRole("link", { name: /^Showing only firing now/ })).toBeVisible();
  await page.getByRole("link", { name: "Hourly chart" }).click();
  await expect(page).toHaveURL(/tf=1h/);
  await page.request.delete(`/api/v1/me/indicators/${id}`, { headers: ipHeaders() });
});

test.describe.serial("Portfolio", () => {
  test("add purchases, see value and profit, remove one", async ({ page }) => {
    await page.goto("/portfolio");
    await expect(page.getByRole("heading", { name: "Your portfolio" })).toBeVisible();
    await expect(page.getByLabel("Asset").locator("option", { hasText: "Euro / US Dollar" })).toHaveCount(0);
    await page.getByLabel("Asset").selectOption("bitcoin");
    await page.getByLabel("Quantity").fill("0.5");
    await page.getByLabel(/Price paid each/).fill("50,000");
    await page.getByLabel(/Bought on/).fill("2025-06-01");
    await page.getByRole("button", { name: "Add purchase" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Added to your portfolio" })).toBeVisible();
    await expect(page.locator("#holdings").getByRole("link", { name: "Bitcoin" })).toBeVisible(); // the page now shows holdings and a new form
    await page.getByLabel("Asset").selectOption("gold");
    await page.getByLabel("Quantity").fill("10");
    await page.getByRole("button", { name: "Add purchase" }).click();
    const holdings = page.locator("#holdings");
    await expect(holdings.getByRole("link", { name: "Bitcoin" })).toBeVisible();
    await expect(holdings.getByText("10 GLD shares")).toBeVisible();
    const p = await (await page.request.get("/api/v1/me/holdings", { headers: ipHeaders() })).json();
    const btc = p.positions.find((x: { asset: { slug: string } }) => x.asset.slug === "bitcoin");
    expect(btc.cost).toBe(25_000);
    expect(btc.pnl).toBeCloseTo(btc.value - 25_000, 6);
    expect(p.total).toBeCloseTo(p.positions.reduce((t: number, x: { value: number }) => t + x.value, 0), 6);
    expect(p.pnl).toBeCloseTo(btc.pnl, 6); // the gold lot has no price paid, so it isn't in profit and loss
    await expect(page.getByText("Profit or loss")).toBeVisible();
    await a11y(page, "/portfolio");
    const gold = holdings.getByRole("listitem").filter({ hasText: "Gold" }).first();
    await gold.getByText("1 purchase").click();
    page.once("dialog", (d) => d.accept());
    await gold.getByRole("button", { name: /^Remove 10 Gold/ }).click();
    await expect(holdings.getByText("10 GLD shares")).toHaveCount(0);
  });

  test("refuses what can't be added up, and nothing leaks to another owner", async ({ page, browser }) => {
    const h = ipHeaders();
    expect((await page.request.post("/api/v1/me/holdings", { headers: h, data: { assetSlug: "eurusd", quantity: 1000 } })).status()).toBe(422);
    expect((await page.request.post("/api/v1/me/holdings", { headers: h, data: { assetSlug: "bitcoin", quantity: -1 } })).status()).toBe(422);
    expect((await page.request.post("/api/v1/me/holdings", { headers: h, data: { assetSlug: "bitcoin", quantity: 1, boughtOn: "2999-01-01" } })).status()).toBe(422);
    const b = await browser.newContext({ storageState: ownerState("b") });
    expect((await (await b.request.get("/api/v1/me/holdings")).json()).positions).toEqual([]);
    const mine = await (await page.request.get("/api/v1/me/holdings", { headers: h })).json();
    expect((await b.request.delete(`/api/v1/me/holdings/${mine.positions[0].lots[0].id}`)).status()).toBe(404);
    await b.close();
  });
});

base.describe("Data health", () => {
  base.use({ storageState: ownerState("a") });
  base("a silent scheduler opens a problem, tells the owner, and closes when updates resume", async ({ page, request }) => {
    const sql = postgres(TEST_DB, { max: 1, onnotice: () => {} });
    try {
      await sql`delete from health_incidents`;
      await sql`delete from job_runs where job = 'tick'`;
      await sql`insert into job_runs (job, status, started_at, finished_at) values ('tick', 'ok', now() - interval '3 hours', now() - interval '3 hours')`;
      const before = mails("FXDEZ: data problem");
      const r1 = await (await request.post("/api/cron/alerts", { headers: CRON })).json();
      expect(r1.health).toMatchObject({ problems: 1, opened: 1 });
      expect(mails("FXDEZ: data problem")).toBe(before + 1);
      const again = await (await request.post("/api/cron/alerts", { headers: CRON })).json();
      expect(again.health).toMatchObject({ problems: 1, opened: 0 }); // told once, not every run
      await page.goto("/status");
      await expect(page.getByRole("status").filter({ hasText: "1 problem right now" })).toContainText("check cron-job.org");
      await a11y(page, "/status");
      await sql`insert into job_runs (job, status, started_at, finished_at) values ('tick', 'ok', now(), now())`;
      const fixedBefore = mails("FXDEZ: data back to normal");
      const r2 = await (await request.post("/api/cron/alerts", { headers: CRON })).json();
      expect(r2.health).toMatchObject({ problems: 0, resolved: 1 });
      expect(mails("FXDEZ: data back to normal")).toBe(fixedBefore + 1);
      await page.reload();
      await expect(page.getByRole("status").filter({ hasText: "Everything is running" })).toBeVisible();
      await expect(page.locator("#history")).toContainText("No successful 30-minute update since");
    } finally {
      await sql`delete from job_runs where job = 'tick'`;
      await sql.end();
    }
  });
});
