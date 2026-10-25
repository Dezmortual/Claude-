import "server-only";
// Claude for the research assistant, through the official SDK with the owner's own key (ANTHROPIC_API_KEY).
// Spend is counted per day and stops at AI_DAILY_LIMIT_USD (default $2), checked before every request.
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db";

export const MODEL = "claude-opus-5-5";
const clean = (v?: string) => v?.trim().replace(/^["']|["']$/g, "").trim() ?? "";
export const aiConfigured = () => !!clean(process.env.ANTHROPIC_API_KEY);
export const dailyLimit = () => { const n = Number(clean(process.env.AI_DAILY_LIMIT_USD)); return Number.isFinite(n) && n > 0 ? n : 2; };

let client: Anthropic | null = null;
export function claude() {
  if (!client) client = new Anthropic({ apiKey: clean(process.env.ANTHROPIC_API_KEY), maxRetries: 2, timeout: 120_000 });
  return client;
}

/** Dollars per million tokens. A refusal can be re-run on another model (fallbacks), billed at that model's rates. */
const PRICE: Record<string, { in: number; out: number; read: number; write: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, read: 0.2, write: 5 },
  "claude-opus-5": { in: 5, out: 25, read: 0.5, write: 6.25 },
  "claude-fable-5-1": { in: 10, out: 50, read: 0.25, write: 12.5 },
  "claude-sonnet-5-5": { in: 2, out: 10, read: 0.2, write: 2.5 },
};
export function costOf(model: string, u: Anthropic.Beta.BetaUsage): number {
  const p = PRICE[model] ?? PRICE["claude-fable-5-1"]; // unknown: count it at the dearest rate, so the cap errs on the safe side
  return (u.input_tokens * p.in + u.output_tokens * p.out + (u.cache_read_input_tokens ?? 0) * p.read + (u.cache_creation_input_tokens ?? 0) * p.write) / 1e6;
}

const today = () => new Date().toISOString().slice(0, 10);
export async function spentToday(userId: string): Promise<number> {
  const [r] = await sql()<{ cost_usd: number }[]>`select cost_usd from ai_usage where user_id = ${userId} and day = ${today()}`;
  return r?.cost_usd ?? 0;
}
export async function recordUsage(userId: string, model: string, u: Anthropic.Beta.BetaUsage) {
  const c = costOf(model, u);
  await sql()`insert into ai_usage (user_id, day, requests, input_tokens, output_tokens, cost_usd)
    values (${userId}, ${today()}, 1, ${u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)}, ${u.output_tokens}, ${c})
    on conflict (user_id, day) do update set requests = ai_usage.requests + 1, input_tokens = ai_usage.input_tokens + excluded.input_tokens,
      output_tokens = ai_usage.output_tokens + excluded.output_tokens, cost_usd = ai_usage.cost_usd + excluded.cost_usd`;
  return c;
}
