import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export { expect };
export const OWNER_PASSWORD = "e2e owner password";
export const ownerState = (who: "a" | "b") => path.join(__dirname, ".auth", `owner-${who}.json`);

/** Every test fails on a console error or a 5xx response from the app. (No context-wide extra headers: Playwright's
 *  extraHTTPHeaders breaks Next's client-side navigation, so per-test client addresses are sent per API request.) */
/** After a page loads, wait until React has attached its handlers: a tap before that does nothing, which made a few
 *  tests fail now and then. Only HTML pages carry the marker. */
async function interactive(page: Page, r: Awaited<ReturnType<Page["goto"]>>) {
  if (r && (r.headers()["content-type"] ?? "").includes("text/html")) await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  return r;
}

export const test = base.extend<{ guard: void }>({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page), reload = page.reload.bind(page);
    page.goto = async (...a) => interactive(page, await goto(...a));
    page.reload = async (...a) => interactive(page, await reload(...a));
    await use(page);
  },
  guard: [async ({ page }, use) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      // Chrome logs expected 4xx fetches as "Failed to load resource"; 5xx responses are caught below.
      if (m.type() === "error" && !/Failed to load resource: the server responded with a status of 4\d\d/.test(m.text())) problems.push(`console: ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("response", (r) => { if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`); });
    await use();
    expect(problems, "console errors or 5xx responses").toEqual([]);
  }, { auto: true }],
});

function rand() { return Math.floor(Math.random() * 250) + 1; }
/** A fresh client address for API calls, so per-IP rate limits never leak between tests. */
export const ipHeaders = () => ({ "x-forwarded-for": `10.${rand()}.${rand()}.${rand()}` });

/** Fails on any WCAG 2.1 A/AA violation on the current page. */
export async function a11y(page: Page, label: string) {
  const r = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length}x ${v.help} | ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" ; ")}`);
  expect(summary, `axe on ${label}`).toEqual([]);
}

/** Latest link of a kind emailed to `to`, read from the dev outbox. */
export async function emailedLink(to: string, kind: "verify-email" | "reset-password") {
  const dir = path.join(process.cwd(), ".data", "outbox");
  for (let i = 0; i < 20; i++) {
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).sort().reverse() : [];
    for (const f of files) {
      const body = fs.readFileSync(path.join(dir, f), "utf8");
      if (!body.startsWith(`To: ${to}\n`)) continue;
      const m = body.match(new RegExp(`(/${kind}\\?token=[\\w-]+)`));
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no ${kind} email for ${to}`);
}

/** Sign up and confirm an owner account through the UI-facing API. */
export async function createOwner(page: Page, email: string, name = "E2E Owner") {
  const up = await page.request.post("/api/auth/sign-up", { headers: ipHeaders(), data: { name, email, password: OWNER_PASSWORD, acceptTerms: true } });
  expect(up.status(), await up.text()).toBe(200);
  await page.goto(await emailedLink(email, "verify-email"));
  await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
}

export async function signIn(page: Page, email: string, password = OWNER_PASSWORD) {
  const r = await page.request.post("/api/auth/sign-in", { headers: ipHeaders(), data: { email, password } });
  expect(r.status(), await r.text()).toBe(200);
}
