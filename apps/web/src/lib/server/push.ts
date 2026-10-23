import "server-only";
// Web push through the browser vendors' push services (Google, Mozilla, Apple), signed with our VAPID key pair.
// Subscriptions the push service reports as gone (404/410) are deleted.
import webpush from "web-push";
import { sql } from "./db";
import { env } from "./env";

export function pushConfigured() {
  const e = env();
  return !!(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY);
}

let ready = false;
function setup() {
  if (ready) return;
  const e = env();
  // The subject tells push services who to contact about abuse: the site's https address, else the owner's email.
  const subject = e.APP_URL.startsWith("https://") ? e.APP_URL : `mailto:${e.OWNER_EMAILS[0] ?? "owner@example.com"}`;
  webpush.setVapidDetails(subject, e.VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
  ready = true;
}

export type PushMessage = { title: string; body: string; url: string; tag?: string };

/** Sends to every device the user turned on. Returns how many accepted it; throws only if all of them failed. */
export async function sendPush(userId: string, msg: PushMessage) {
  if (!pushConfigured()) throw new Error("push is not configured (VAPID keys missing)");
  setup();
  const db = sql();
  const subs = await db<{ id: string; endpoint: string; p256dh: string; auth: string }[]>`
    select id, endpoint, p256dh, auth from push_subscriptions where user_id = ${userId}`;
  let sent = 0, removed = 0, failed = 0, lastError = "";
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 3600, urgency: "high" });
      await db`update push_subscriptions set last_sent_at = now() where id = ${s.id}`;
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) { await db`delete from push_subscriptions where id = ${s.id}`; removed++; }
      else {
        failed++;
        // web-push puts the push service's own answer in statusCode and body; that's what explains a refusal.
        const w = e as { statusCode?: number; body?: string; message?: string };
        lastError = w.statusCode ? `${w.statusCode} ${String(w.body ?? "").trim() || w.message}` : e instanceof Error ? e.message : String(e);
        console.error(`push to ${new URL(s.endpoint).host}: ${lastError}`);
      }
    }
  }
  if (failed && !sent) throw new Error(`push failed on every device: ${lastError.slice(0, 200)}`);
  return { devices: subs.length, sent, removed, failed };
}
