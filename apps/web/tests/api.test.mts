// API-level checks against a running server and its database. Run with the server started with
//   OWNER_EMAILS=<your owner>,a@test.example,b@test.example
// then: npm run test:api   (reads DATABASE_URL and BASE_URL; uses .data/outbox for email links)
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const A = "a@test.example", B = "b@test.example", PW = "test password 1";
let passed = 0;

async function call(method: string, p: string, body?: unknown, cookie?: string, ip?: string) {
  const r = await fetch(BASE + p, {
    method, redirect: "manual",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), "x-forwarded-for": ip ?? "10.0.0.1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json: json as any, cookie: r.headers.get("set-cookie")?.split(";")[0] };
}

async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log("  ok", name);
}

async function makeUser(email: string, ip: string) {
  await sql`delete from users where email = ${email}`;
  const up = await call("POST", "/api/auth/sign-up", { name: email.split("@")[0], email, password: PW, acceptTerms: true }, undefined, ip);
  assert.equal(up.status, 200, JSON.stringify(up.json));
  await sql`update users set email_verified_at = now() where email = ${email}`; // the emailed link is tested separately
  const s = await call("POST", "/api/auth/sign-in", { email, password: PW }, undefined, ip);
  assert.equal(s.status, 200, JSON.stringify(s.json));
  return s.cookie!;
}

function latestLink(kind: "verify-email" | "reset-password") {
  const dir = path.join(process.cwd(), ".data", "outbox");
  const files = fs.readdirSync(dir).sort().reverse();
  for (const f of files) {
    const m = fs.readFileSync(path.join(dir, f), "utf8").match(new RegExp(`/${kind}\\?token=([\\w-]+)`));
    if (m) return m[1];
  }
  throw new Error("no link in outbox");
}

console.log("authorisation and auth checks against", BASE);
// Start from clean counters for the test accounts (keys hold a hash of the email, never the address).
const h = (e: string) => crypto.createHash("sha256").update(e).digest("hex");
await sql`delete from rate_limits where key like any(${[A, B].flatMap((e) => [`%${h(e)}`])})`;
const ip = () => `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const a = await makeUser(A, ip());
const b = await makeUser(B, ip());

await check("guest gets 401 on every user route", async () => {
  for (const p of ["/api/v1/me/watchlist", "/api/v1/me/alerts", "/api/v1/me/preferences", "/api/v1/me/alert-events", "/api/v1/forecasts"]) {
    assert.equal((await call("GET", p)).status, 401, p);
  }
});

let alertId = "";
await check("user A can write their own data", async () => {
  assert.equal((await call("POST", "/api/v1/me/watchlist", { asset: "bitcoin" }, a)).status, 200);
  const al = await call("POST", "/api/v1/me/alerts", { assetSlug: "ethereum", condition: "price_below", threshold: 1, channels: ["email"] }, a);
  assert.equal(al.status, 200, JSON.stringify(al.json));
  alertId = al.json.id;
  assert.equal((await call("PUT", "/api/v1/me/preferences", { visibleColumns: ["price", "7d"], rowsPerPage: 50, defaultTab: "investing" }, a)).status, 200);
});

await check("user B sees none of A's data", async () => {
  assert.deepEqual((await call("GET", "/api/v1/me/watchlist", undefined, b)).json, []);
  assert.deepEqual((await call("GET", "/api/v1/me/alerts", undefined, b)).json, []);
  assert.deepEqual((await call("GET", "/api/v1/me/alert-events", undefined, b)).json, []);
  assert.equal((await call("GET", "/api/v1/me/preferences", undefined, b)).json.rowsPerPage, 20);
});

await check("user B cannot change or delete A's alert", async () => {
  assert.equal((await call("PATCH", `/api/v1/me/alerts/${alertId}`, { isActive: false }, b)).status, 404);
  await call("DELETE", `/api/v1/me/alerts/${alertId}`, undefined, b);
  const mine = (await call("GET", "/api/v1/me/alerts", undefined, a)).json;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].isActive, true);
});

await check("user B removing a watchlist item leaves A's alone", async () => {
  await call("DELETE", "/api/v1/me/watchlist/bitcoin", undefined, b);
  assert.equal((await call("GET", "/api/v1/me/watchlist", undefined, a)).json.length, 1);
});

await check("invalid input is rejected with 422", async () => {
  assert.equal((await call("POST", "/api/v1/me/alerts", { assetSlug: "ethereum", condition: "price_below", threshold: -1 }, a)).status, 422);
  assert.equal((await call("POST", "/api/v1/me/alerts", { assetSlug: "../etc", condition: "price_below", threshold: 1 }, a)).status, 422);
  assert.equal((await call("PATCH", "/api/v1/me/alerts/not-a-uuid", { isActive: true }, a)).status, 422);
});

await check("strangers cannot sign up", async () => {
  const r = await call("POST", "/api/auth/sign-up", { name: "X", email: "stranger@test.example", password: PW, acceptTerms: true }, undefined, ip());
  assert.equal(r.status, 403);
});

await check("sign-in is rate limited per email", async () => {
  const addr = ip();
  let last = 0;
  for (let i = 0; i < 10; i++) last = (await call("POST", "/api/auth/sign-in", { email: B, password: "wrong password" }, undefined, addr)).status;
  assert.equal(last, 429);
});

await check("email verification link works once", async () => {
  await sql`update users set email_verified_at = null where email = ${A}`;
  const r = await call("POST", "/api/auth/sign-in", { email: A, password: PW }, undefined, ip()); // sends a fresh link
  assert.equal(r.status, 403);
  const t = latestLink("verify-email");
  assert.match(await (await fetch(`${BASE}/verify-email?token=${t}`)).text(), /Email confirmed/);
  assert.match(await (await fetch(`${BASE}/verify-email?token=${t}`)).text(), /already used/);
});

await check("password reset works once and signs out every session", async () => {
  assert.equal((await call("POST", "/api/auth/forgot", { email: A }, undefined, ip())).status, 200);
  const t = latestLink("reset-password");
  assert.equal((await call("POST", "/api/auth/reset", { token: t, password: "a brand new password" }, undefined, ip())).status, 200);
  assert.equal((await call("POST", "/api/auth/reset", { token: t, password: "another password 2" }, undefined, ip())).status, 422);
  assert.equal((await call("GET", "/api/v1/me/alerts", undefined, a)).status, 401, "old session must be gone");
  assert.equal((await call("POST", "/api/auth/sign-in", { email: A, password: "a brand new password" }, undefined, ip())).status, 200);
});

await check("forgot password does not reveal whether an account exists", async () => {
  assert.equal((await call("POST", "/api/auth/forgot", { email: "nobody@test.example" }, undefined, ip())).status, 200);
});

await check("deleting an account removes all of its rows", async () => {
  assert.equal((await call("DELETE", "/api/v1/me", undefined, b)).status, 204);
  const [{ n }] = await sql`select (select count(*) from users where email = ${B})
    + (select count(*) from sessions s join users u on u.id = s.user_id where u.email = ${B}) as n`;
  assert.equal(Number(n), 0);
  assert.equal((await call("GET", "/api/v1/me/alerts", undefined, b)).status, 401);
});

await sql`delete from users where email in (${A}, ${B})`;
console.log(`${passed} checks passed`);
await sql.end();
