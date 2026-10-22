import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

/** Plain-text transactional email through Resend's API. Without RESEND_API_KEY (local development) the message is
 *  written to .data/outbox/ and the console instead, so links can still be followed. */
export async function sendEmail(to: string, subject: string, text: string, headers?: Record<string, string>) {
  const { RESEND_API_KEY, EMAIL_FROM, NODE_ENV, EMAIL_OUTBOX } = env();
  if (!RESEND_API_KEY || EMAIL_OUTBOX) {
    if (NODE_ENV === "production" && !EMAIL_OUTBOX) throw new Error("RESEND_API_KEY is not set");
    const dir = path.join(process.cwd(), ".data", "outbox");
    fs.mkdirSync(dir, { recursive: true });
    // A random part too: several emails can go out in the same millisecond (one per owner) and must not overwrite each other.
    const name = `${Date.now()}-${randomUUID().slice(0, 8)}-${subject.replace(/\W+/g, "-").toLowerCase()}.txt`;
    fs.writeFileSync(path.join(dir, name), `To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    console.log(`[email to ${to.replace(/(.).*@/, "$1…@")}] ${subject}`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, text, ...(headers ? { headers } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`email provider ${r.status}`);
}
