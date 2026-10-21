import "server-only";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

/** Plain-text transactional email through Resend's API. Without RESEND_API_KEY (local development) the message is
 *  written to .data/outbox/ and the console instead, so links can still be followed. */
export async function sendEmail(to: string, subject: string, text: string) {
  const { RESEND_API_KEY, EMAIL_FROM, NODE_ENV } = env();
  if (!RESEND_API_KEY) {
    if (NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set");
    const dir = path.join(process.cwd(), ".data", "outbox");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${Date.now()}-${subject.replace(/\W+/g, "-").toLowerCase()}.txt`), `To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    console.log(`[email to ${to.replace(/(.).*@/, "$1…@")}] ${subject}`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`email provider ${r.status}`);
}
