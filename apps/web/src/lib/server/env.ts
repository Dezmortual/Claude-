import "server-only";
import { z } from "zod";
import { appUrl } from "@/lib/appurl";

// Every variable the server reads, validated once. Names and meanings are documented in .env.example.
const Env = z.object({
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url(),
  OWNER_EMAILS: z.string().default("").transform((s) => s.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)),
  PRIVATE_MODE: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_OUTBOX: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  EMAIL_FROM: z.string().default("FXDEZ <onboarding@resend.dev>"),
  CRON_SECRET: z.string().min(24).optional(),
  ALPACA_KEY_ID: z.string().optional(),
  ALPACA_SECRET_KEY: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  NODE_ENV: z.string().default("development"),
});

let cached: z.infer<typeof Env> | null = null;

export function env() {
  if (!cached) {
    const r = Env.safeParse({ ...process.env, APP_URL: appUrl() });
    if (!r.success) throw new Error(`Bad environment: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    cached = r.data;
  }
  return cached;
}
