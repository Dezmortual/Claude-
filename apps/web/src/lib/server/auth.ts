import "server-only";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { DataError } from "@/lib/data/types";
import { sql } from "./db";
import { sendEmail } from "./email";
import { env } from "./env";

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_DAYS = 30;
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const token = () => crypto.randomBytes(32).toString("base64url");

export async function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pw, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function checkPassword(pw: string, stored: string) {
  const [alg, n, salt, hash] = stored.split("$");
  if (alg !== "scrypt") return false;
  const got = await scrypt(pw, Buffer.from(salt, "base64"), 32, { ...SCRYPT, N: Number(n) });
  const want = Buffer.from(hash, "base64");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// A real hash to compare against when the email is unknown, so timing doesn't reveal which accounts exist.
let dummy: string | null = null;
async function dummyHash() { return (dummy ??= await hashPassword(crypto.randomBytes(12).toString("hex"))); }

/** Fixed-window limiter in Postgres. Throws when `key` has been used `max` times in the current window. */
export async function rateLimit(key: string, max: number, windowSec: number) {
  const db = sql();
  const start = new Date(Math.floor(Date.now() / (windowSec * 1000)) * windowSec * 1000);
  const [r] = await db<{ count: number }[]>`
    insert into rate_limits (key, window_start, count) values (${key}, ${start}, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1 returning count`;
  if (r.count > max) throw new DataError("rate_limited", "Too many attempts. Wait a few minutes and try again.");
  if (Math.random() < 0.02) await db`delete from rate_limits where window_start < now() - interval '1 day'`;
}

export function isOwner(email: string) {
  return env().OWNER_EMAILS.includes(email.toLowerCase());
}

// ---------------------------------------------------------------- sessions

export async function createSession(userId: string, userAgent: string | null) {
  const t = token();
  await sql()`insert into sessions (user_id, token_hash, user_agent, expires_at)
    values (${userId}, ${sha256(t)}, ${userAgent?.slice(0, 200) ?? null}, now() + ${`${SESSION_DAYS} days`}::interval)`;
  return t;
}

export async function sessionUser(t: string | undefined) {
  if (!t) return null;
  const db = sql();
  const [row] = await db<{ session_id: string; id: string; name: string; email: string; timezone: string; created_at: Date; verified: boolean; last_seen_at: Date }[]>`
    select s.id as session_id, s.last_seen_at, u.id, u.name, u.email, u.timezone, u.created_at, u.email_verified_at is not null as verified
    from sessions s join users u on u.id = s.user_id where s.token_hash = ${sha256(t)} and s.expires_at > now()`;
  if (!row) return null;
  // Sliding expiry, written at most hourly.
  if (Date.now() - row.last_seen_at.getTime() > 3_600_000) {
    await db`update sessions set last_seen_at = now(), expires_at = now() + ${`${SESSION_DAYS} days`}::interval where id = ${row.session_id}`;
  }
  return row;
}

export async function endSession(t: string) {
  await sql()`delete from sessions where token_hash = ${sha256(t)}`;
}

export async function endAllSessions(userId: string) {
  await sql()`delete from sessions where user_id = ${userId}`;
}

// ---------------------------------------------------------------- email tokens

async function issueToken(userId: string, purpose: "verify" | "reset", minutes: number) {
  const t = token();
  const db = sql();
  await db`update email_tokens set used_at = now() where user_id = ${userId} and purpose = ${purpose} and used_at is null`;
  await db`insert into email_tokens (user_id, purpose, token_hash, expires_at) values (${userId}, ${purpose}, ${sha256(t)}, now() + ${`${minutes} minutes`}::interval)`;
  return t;
}

/** Marks the token used and returns its user, or null when unknown, used or expired. Single use, race-safe. */
async function consumeToken(t: string, purpose: "verify" | "reset") {
  const [r] = await sql()<{ user_id: string }[]>`
    update email_tokens set used_at = now()
    where token_hash = ${sha256(t)} and purpose = ${purpose} and used_at is null and expires_at > now() returning user_id`;
  return r?.user_id ?? null;
}

export async function sendVerification(user: { id: string; email: string; name: string }) {
  const t = await issueToken(user.id, "verify", 60 * 24);
  const link = `${env().APP_URL}/verify-email?token=${t}`;
  await sendEmail(user.email, "Confirm your email", `Hi ${user.name},\n\nConfirm your email to finish setting up your account:\n${link}\n\nThe link works once and expires in 24 hours. If you didn't sign up, ignore this email.`);
}

export async function verifyEmail(t: string) {
  let userId = await consumeToken(t, "verify");
  // Opening the link again (a second render of the page, or a mail scanner that opened it first) finds the code
  // already used; for an account it confirmed, that's still a success, not a broken link.
  if (!userId) {
    const [r] = await sql()<{ user_id: string }[]>`select t.user_id from email_tokens t join users u on u.id = t.user_id
      where t.token_hash = ${sha256(t)} and t.purpose = 'verify' and t.used_at is not null and u.email_verified_at is not null`;
    userId = r?.user_id ?? null;
  }
  if (!userId) throw new DataError("invalid", "This link has expired or was already used. Sign in to get a new one.");
  await sql()`update users set email_verified_at = coalesce(email_verified_at, now()) where id = ${userId}`;
  return userId;
}

export async function requestReset(email: string, ip: string) {
  email = email.trim().toLowerCase();
  await rateLimit(`reset:ip:${ip}`, 10, 3600);
  await rateLimit(`reset:email:${sha256(email)}`, 3, 3600);
  const [u] = await sql()<{ id: string; name: string }[]>`select id, name from users where email = ${email}`;
  if (!u) return; // same response either way
  const t = await issueToken(u.id, "reset", 60);
  await sendEmail(email, "Reset your password", `Hi ${u.name},\n\nChoose a new password here:\n${env().APP_URL}/reset-password?token=${t}\n\nThe link works once and expires in an hour. If you didn't ask for this, ignore this email; your password hasn't changed.`);
}

export async function resetPassword(t: string, password: string) {
  if (password.length < 8) throw new DataError("invalid", "Use at least 8 characters");
  const userId = await consumeToken(t, "reset");
  if (!userId) throw new DataError("invalid", "This link has expired or was already used. Ask for a new one.");
  // A reset proves control of the inbox, so it also verifies the email, and it signs out every other device.
  await sql()`update users set password_hash = ${await hashPassword(password)}, email_verified_at = coalesce(email_verified_at, now()) where id = ${userId}`;
  await endAllSessions(userId);
  return userId;
}

// ---------------------------------------------------------------- sign up / in

export async function signUp(input: { name: string; email: string; password: string }, ip: string) {
  const email = input.email.trim().toLowerCase();
  await rateLimit(`signup:ip:${ip}`, 5, 3600);
  if (env().PRIVATE_MODE && !isOwner(email)) throw new DataError("forbidden", "This app is private. Sign-ups are closed.");
  if (input.password.length < 8) throw new DataError("invalid", "Use at least 8 characters for your password");
  const db = sql();
  const [exists] = await db`select 1 from users where email = ${email}`;
  if (exists) throw new DataError("conflict", "An account with this email already exists. Sign in instead.");
  const [u] = await db<{ id: string; email: string; name: string }[]>`
    insert into users (email, name, password_hash) values (${email}, ${input.name.trim()}, ${await hashPassword(input.password)})
    returning id, email, name`;
  try {
    await sendVerification(u);
  } catch (e) {
    // No email means no way to verify: undo, so the owner can simply try again once email works.
    await db`delete from users where id = ${u.id}`;
    throw e;
  }
  return u;
}

export async function signIn(email: string, password: string, ip: string) {
  email = email.trim().toLowerCase();
  await rateLimit(`signin:ip:${ip}`, 20, 900);
  await rateLimit(`signin:email:${sha256(email)}`, 8, 900);
  const [u] = await sql()<{ id: string; password_hash: string; verified: boolean }[]>`
    select id, password_hash, email_verified_at is not null as verified from users where email = ${email}`;
  const ok = await checkPassword(password, u?.password_hash ?? (await dummyHash()));
  if (!u || !ok) throw new DataError("unauthorized", "That email and password don't match an account");
  if (env().PRIVATE_MODE && !isOwner(email)) throw new DataError("forbidden", "This app is private.");
  if (!u.verified) throw new DataError("forbidden", "Confirm your email first. We've sent you a new link.");
  return u.id;
}

/** After a failed sign-in because the email is unverified: send a fresh link, rate-limited. */
export async function resendVerification(email: string, ip: string) {
  email = email.trim().toLowerCase();
  await rateLimit(`verify:ip:${ip}`, 10, 3600);
  await rateLimit(`verify:email:${sha256(email)}`, 3, 3600);
  const [u] = await sql()<{ id: string; email: string; name: string }[]>`select id, email, name from users where email = ${email} and email_verified_at is null`;
  if (u) await sendVerification(u);
}
