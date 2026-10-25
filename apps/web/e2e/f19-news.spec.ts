import { a11y, expect, ipHeaders, ownerState, test } from "./fixtures";

test.use({ storageState: ownerState("a") });
const CRON = { authorization: "Bearer e2e-cron-secret-0123456789abcdef" };
const BROKER = "http://localhost:3999";

test.describe.serial("F19 news", () => {
  test("F19-H1 stories arrive tagged with assets and a mood; filters work", async ({ page, request }) => {
    const r = await (await request.post("/api/cron/news", { headers: CRON })).json();
    expect(r.result?.problems ?? r.problems ?? []).toEqual([]);
    await page.goto("/news");
    await expect(page.getByRole("heading", { name: "Market news" })).toBeVisible();
    const feed = page.locator("#feed");
    const btc = feed.getByRole("listitem").filter({ hasText: "Bitcoin surges to a record high" });
    await expect(btc).toContainText("Positive mood");
    await expect(btc.getByRole("link", { name: "Bitcoin", exact: true })).toBeVisible();
    await expect(feed.getByRole("listitem").filter({ hasText: "Apple shares tumble" })).toContainText("Negative mood");
    await expect(feed.getByRole("listitem").filter({ hasText: "Ethereum upgrade approved" })).toContainText("Central Bank Wire");
    await expect(feed).toContainText(/Last 24 hours\d+ stories/);
    await a11y(page, "/news");
    await page.getByLabel("Mood").selectOption("negative");
    await page.getByRole("button", { name: "Show" }).click();
    await expect(page).toHaveURL(/mood=negative/);
    await expect(feed.getByRole("listitem").filter({ hasText: "Apple shares tumble" })).toBeVisible();
    await expect(feed).not.toContainText("Bitcoin surges");
    await page.getByLabel("Search").fill("jobs report");
    await page.getByLabel("Mood").selectOption("");
    await page.getByRole("button", { name: "Show" }).click();
    await expect(feed.getByRole("list").getByRole("listitem")).toHaveCount(1);
  });

  test("F19-H2 an asset page shows its own news", async ({ page }) => {
    await page.goto("/assets/bitcoin#news");
    const s = page.locator("#news");
    await expect(s.getByRole("heading", { name: "Bitcoin in the news" })).toBeVisible();
    await expect(s).toContainText("Bitcoin surges to a record high");
    await expect(s).not.toContainText("Apple shares tumble");
  });

  test("F19-H3 a keyword monitor lists past matches, then catches a new story", async ({ page, request }) => {
    await page.goto("/news#monitors");
    await page.getByLabel("Monitor name").fill("Rate decisions");
    await page.getByLabel("Keywords, separated by commas").fill("Fed, rate cut");
    await page.getByRole("button", { name: "Add monitor" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Watching for Fed, rate cut" })).toBeVisible();
    const matches = page.locator("#matches");
    await expect(matches).toContainText("the Fed signals patience");
    await expect(matches).toContainText("Rate decisions: Fed");
    await request.post(`${BROKER}/__news`, { data: { headline: "Treasury yields slide as traders price a rate cut" } });
    const run = await (await request.post("/api/cron/news", { headers: CRON })).json();
    expect(JSON.stringify(run)).toMatch(/"hits":1/);
    await page.reload();
    await expect(matches).toContainText("Treasury yields slide");
    await expect(page.locator("#monitors")).toContainText("2 matches");
    await page.getByRole("checkbox", { name: "Rate decisions on" }).uncheck();
    await expect(page.getByRole("status").filter({ hasText: "Rate decisions paused" })).toBeVisible();
    await a11y(page, "/news monitors");
  });

  test("F19-H4 add your own feed; bad addresses are refused", async ({ page }) => {
    await page.goto("/news#feeds");
    await page.getByLabel("Feed name").fill("Gold blog");
    await page.getByLabel("RSS or Atom address").fill("http://localhost:3999/rss/mine.xml");
    await page.getByRole("button", { name: "Add feed" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Gold blog added: 1 story" })).toBeVisible();
    await expect(page.locator("#feed")).toContainText("My blog: why gold could rally & what to watch");
    await expect(page.locator("#feed")).toContainText("your feed");
    const add = (url: string) => page.request.post("/api/v1/me/news-feeds", { headers: ipHeaders(), data: { name: "X", url } });
    expect((await (await add("http://localhost:3999/rss/notafeed.xml")).json()).message).toMatch(/No stories found/);
    expect((await (await add("ftp://example.com/feed")).json()).message).toMatch(/https/);
    expect((await (await add("https://10.0.0.1/feed.xml")).json()).message).toMatch(/isn't on the public internet/);
    expect((await (await add("http://localhost:3999/rss/mine.xml")).json()).message).toMatch(/already added/);
  });

  test("F19-N1 another owner doesn't see your feed's stories or your monitors", async ({ browser }) => {
    const other = await browser.newContext({ storageState: ownerState("b") });
    const p = await other.newPage();
    const items = await (await p.request.get("/api/v1/news?q=gold")).json();
    expect(items.map((a: { title: string }) => a.title).join()).not.toContain("My blog");
    expect(await (await p.request.get("/api/v1/me/news-monitors")).json()).toEqual([]);
    await other.close();
  });
});
