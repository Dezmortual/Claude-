import { defineConfig, devices } from "@playwright/test";
import webpush from "web-push";

// The suite runs against a production build on its own database, with demo market data (no network) and emails
// written to .data/outbox. The webServer command rebuilds the test database first, so every run starts clean.
const PORT = 3100;
const TEST_DB = process.env.E2E_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5499/forecast_test";
const VAPID = webpush.generateVAPIDKeys(); // a throwaway pair per run, so push is switched on in tests
export const OWNERS = ["owner-a", "owner-b", "owner-c", "owner-d", "owner-e", "owner-f"].map((n) => `${n}@e2e.test`);

export default defineConfig({
  testDir: "e2e",
  workers: 1, // one database, shared rate-limit tables: keep runs deterministic
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/report" }]],
  outputDir: "e2e/results",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", dependencies: ["setup"], grepInvert: /@mobile/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", dependencies: ["setup"], grep: /@mobile/, use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: true } },
  ],
  webServer: {
    command: `npm run e2e:db && npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    timeout: 400_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: TEST_DB, APP_URL: `http://localhost:${PORT}`, OWNER_EMAILS: OWNERS.join(","), PRIVATE_MODE: "true",
      EMAIL_OUTBOX: "true", MARKET_DATA: "demo", CRON_SECRET: "e2e-cron-secret-0123456789abcdef", TRUST_PROXY_HEADERS: "true",
      RESEND_API_KEY: "", NEXT_TELEMETRY_DISABLED: "1", NEXT_DIST_DIR: ".next-e2e",
      VAPID_PUBLIC_KEY: VAPID.publicKey, VAPID_PRIVATE_KEY: VAPID.privateKey,
    },
  },
});
