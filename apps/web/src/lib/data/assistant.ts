import "server-only";
// The research assistant: Claude answers questions using read-only tools over the owner's own FXDEZ data (prices,
// signals, forecasts, news, portfolio, economy, prediction markets, the broker account). It can't trade or change
// anything. Conversations are stored append-only, exactly as the API returned them, so they can be continued.
//
// A hand-written tool loop rather than the SDK's tool runner: every step is saved and the daily spending cap is
// checked before each request, which the runner doesn't give a place for.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { sql } from "@/lib/server/db";
import { MODEL, aiConfigured, claude, dailyLimit, recordUsage, spentToday } from "@/lib/server/ai";
import { ASSETS, ASSET_BY_SLUG } from "./catalogue";
import { dashboard, listForecasts, portfolio, requireUser, tradingOverview } from "./live";
import { listNews, newsMood } from "./news";
import { listRuns } from "./backtests";
import { MACRO, macroSeries, predictions } from "./macro";
import { portfolioPerformance, portfolioRisk } from "./portfolioLedger";
import { DataError, type MarketCode, type Viewer } from "./types";

type Block = Anthropic.Beta.BetaContentBlock;
type Param = Anthropic.Beta.BetaMessageParam;
const MAX_STEPS = 8;
const round = (x: number | null | undefined, d = 2) => (x === null || x === undefined ? null : +x.toFixed(d));

// ---------------------------------------------------------------- tools

const obj = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: "object" as const, properties, required, additionalProperties: false });
const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });

const TOOLS: (Anthropic.Beta.BetaTool & { input: z.ZodType })[] = [
  { name: "list_assets", description: "Every asset FXDEZ covers in a market (or all), with price, 24-hour change and the daily signal.",
    input_schema: obj({ market: str("crypto, forex, stocks, commodities, indices, etfs, bonds; leave empty for all", { enum: ["crypto", "forex", "stocks", "commodities", "indices", "etfs", "bonds", ""] }) }, ["market"]),
    input: z.object({ market: z.string() }) },
  { name: "asset_snapshot", description: "One asset in detail: price, 24-hour change, the daily signal and chance of a rise, the 1-day/7-day/1-month forecast mid-points, trend and volatility. Use the slug from list_assets (e.g. bitcoin, aapl, eurusd).",
    input_schema: obj({ slug: str("The asset's slug") }, ["slug"]), input: z.object({ slug: z.string().max(40) }) },
  { name: "top_signals", description: "The strongest buy and sell signals across all assets right now, where the daily chart, hourly chart and 7-day forecast agree.",
    input_schema: obj({}), input: z.object({}) },
  { name: "search_news", description: "Recent news stories (newest first) with source, date, link and a word-list mood. Filter by words and/or an asset slug.",
    input_schema: obj({ query: str("Words to search for; empty for any"), slug: str("An asset slug; empty for all assets") }, ["query", "slug"]),
    input: z.object({ query: z.string().max(80), slug: z.string().max(40) }) },
  { name: "portfolio_overview", description: "The owner's portfolio: holdings with value, weight and profit, the time-weighted return, worst drop, volatility, a bad day (95%) and beta.",
    input_schema: obj({}), input: z.object({}) },
  { name: "broker_account", description: "The owner's Alpaca account (practice unless set to live): value, cash, open positions with profit or loss, open orders. Read only.",
    input_schema: obj({}), input: z.object({}) },
  { name: "economic_series", description: `An economic series from FRED: latest value, change over a year, and the last 24 readings. Curated codes: ${MACRO.map((m) => `${m.id} (${m.name})`).join(", ")}. Any other FRED code also works.`,
    input_schema: obj({ code: str("The FRED code, e.g. CPIAUCSL") }, ["code"]), input: z.object({ code: z.string().max(30) }) },
  { name: "prediction_markets", description: "Polymarket's odds (price of yes, 0 to 1) on the busiest open questions, filtered by words.",
    input_schema: obj({ query: str("Words to match in the question; empty for the busiest overall") }, ["query"]), input: z.object({ query: z.string().max(80) }) },
  { name: "past_backtests", description: "The owner's recent backtests from the lab: strategy, asset, return, buy-and-hold, worst drop, trades and the luck test.",
    input_schema: obj({}), input: z.object({}) },
].map((t) => ({ ...t, strict: true }));

const fmtRow = (r: Awaited<ReturnType<typeof listForecasts>>["rows"][number]) => ({
  slug: r.asset.slug, name: r.asset.name, ticker: r.asset.ticker, market: r.asset.market, demoData: !!r.demo,
  ...(r.locked ? { locked: true } : { price: r.price, change24hPct: round(r.change24hPct), signal: r.signal, chanceUp7d: round(r.pUp, 3) }),
});

async function runTool(v: Viewer, name: string, raw: unknown): Promise<unknown> {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`No tool called ${name}`);
  const i = t.input.parse(raw) as Record<string, string>;
  switch (name) {
    case "list_assets": {
      const m = i.market && ASSETS.some((a) => a.market === i.market) ? (i.market as MarketCode) : "all";
      return (await listForecasts(v, { market: m, perPage: 100, page: 1 })).rows.map(fmtRow);
    }
    case "asset_snapshot": {
      const a = ASSET_BY_SLUG.get(i.slug) ?? ASSETS.find((x) => x.ticker.toLowerCase() === i.slug.toLowerCase() || x.name.toLowerCase() === i.slug.toLowerCase());
      if (!a) return { error: `No asset "${i.slug}". Use list_assets for slugs.` };
      const r = (await listForecasts(v, { q: a.slug, market: "all", perPage: 100, page: 1 })).rows.find((x) => x.asset.slug === a.slug)!;
      const mood = await newsMood(v, a.slug);
      return { ...fmtRow(r), quoteUnit: a.quoteUnit, forecast: r.horizons, intraday: r.intraday, metrics: r.metrics,
        newsMoodLast7Days: mood.week, page: `/assets/${a.slug}` };
    }
    case "top_signals": {
      const d = await dashboard(v);
      const s = (t: (typeof d.top.buys)[number]) => ({ slug: t.row.asset.slug, name: t.row.asset.name, side: t.side, strength: t.strength, score: round(t.score),
        dailyIndicatorsAgreeing: `${t.daily.agree}/20`, hourlyAgrees: t.aligned, chance7d: round(t.pSide, 3), range7d: t.range7d });
      return { buys: d.top.buys.map(s), sells: d.top.sells.map(s), scanned: d.top.scanned };
    }
    case "search_news":
      return (await listNews(v, { q: i.query || undefined, slug: i.slug || undefined, limit: 15 })).map((a) => ({ title: a.title, source: a.source,
        url: a.url, published: a.publishedAt.slice(0, 16), mood: a.mood, moodWords: a.moodWords, assets: a.slugs.map((s) => s.slug), summary: a.summary.slice(0, 280) }));
    case "portfolio_overview": {
      const p = await portfolio(v);
      if (!p.positions.length) return { empty: true };
      const [perf, risk] = await Promise.all([portfolioPerformance(v), portfolioRisk(v)]);
      return { valueUsd: round(p.total), profitUsd: round(p.pnl), profitPct: round(p.pnlPct), realisedUsd: round(p.realised), dividendsUsd: round(p.income),
        holdings: p.positions.map((x) => ({ slug: x.asset.slug, name: x.asset.name, quantity: x.quantity, valueUsd: round(x.value), weightPct: round(x.weight * 100, 1),
          profitPct: round(x.pnlPct), signal: x.signal })),
        timeWeightedReturnPct: round(perf.twr), worstDropPct: round(perf.dd.worst),
        risk: risk && { volatilityPctYear: round(risk.risk.vol, 1), badDay95Pct: round(risk.risk.var95), beta: round(risk.risk.beta), benchmark: risk.bench.name,
          riskShare: risk.risk.contributions.map((c) => ({ slug: c.slug, pct: round(c.share * 100, 1) })) } };
    }
    case "broker_account": {
      const o = await tradingOverview(v);
      if (!o.configured || !o.account) return { configured: false };
      return { mode: o.mode, account: o.account, positions: o.positions.map((x) => ({ name: x.name, qty: x.qty, avgPrice: x.avgPrice, price: x.price, valueUsd: round(x.value), profitUsd: round(x.pnl), profitPct: round(x.pnlPct) })),
        openOrders: o.open.length, marketOpen: o.marketOpen };
    }
    case "economic_series": {
      const s = await macroSeries(v, i.code);
      return { code: s.def.id, name: s.def.name, unit: s.def.unit, frequency: s.def.freq, latest: s.latest && { date: new Date(s.latest.ts).toISOString().slice(0, 10), value: s.latest.v },
        changeOverYearPct: s.yoyPoints?.at(-1) ? round(s.yoyPoints.at(-1)!.v) : null, yearAgo: s.yearAgo?.v ?? null,
        recent: s.points.slice(-24).map((p) => [new Date(p.ts).toISOString().slice(0, 10), p.v]), source: `https://fred.stlouisfed.org/series/${s.def.id}` };
    }
    case "prediction_markets":
      return (await predictions(v, i.query)).markets.slice(0, 12).map((m) => ({ question: m.question, yes: m.yes, change24h: m.change24h, volume24hUsd: Math.round(m.volume24h), ends: m.endsAt?.slice(0, 10), url: m.url }));
    case "past_backtests":
      return (await listRuns(v)).slice(0, 15).map((r) => ({ name: r.name, when: r.createdAt.slice(0, 10), returnPct: round(r.totalReturn, 1), buyHoldPct: round(r.buyHold, 1),
        worstDropPct: round(r.maxDrawdown, 1), trades: r.trades, luckTest: round(r.luck), page: `/backtest/runs/${r.id}` }));
  }
  throw new Error(`No tool called ${name}`);
}

const SYSTEM = `You are the research assistant inside FXDEZ, a private markets app used by one person, its owner. You help them understand markets and their own positions.

Use the tools for every price, signal, forecast, figure or story you mention: don't state numbers from memory. FXDEZ's signals and forecasts are statistics about past prices that are often wrong; say so when it matters, and give the chance or range rather than a verdict. Some assets run on generated demo data (demoData: true); say so if you use one.

When you use news, cite the story with a markdown link to its url. Link FXDEZ pages with their path, e.g. [Bitcoin](/assets/bitcoin). You can't place or change trades: for that, point to the order ticket on the asset's page.

Write plainly and briefly for a phone screen: short paragraphs, a list when comparing, no tables wider than three columns. This is research, not personal financial advice; you don't need to repeat that in every answer.`;

// ---------------------------------------------------------------- conversations

export type ChatMessage = { seq: number; role: "user" | "assistant"; text: string; tools: string[]; note: string | null };
export type Conversation = { id: string; title: string; updatedAt: string };

const TOOL_LABEL: Record<string, (i: Record<string, string>) => string> = {
  list_assets: (i) => `listed ${i.market || "all"} assets`, asset_snapshot: (i) => `looked up ${ASSET_BY_SLUG.get(i.slug)?.name ?? i.slug}`,
  top_signals: () => "checked the top signals", search_news: (i) => `searched the news${i.query ? ` for "${i.query}"` : ""}${i.slug ? ` about ${ASSET_BY_SLUG.get(i.slug)?.name ?? i.slug}` : ""}`,
  portfolio_overview: () => "read your portfolio", broker_account: () => "read your Alpaca account", economic_series: (i) => `read ${i.code}`,
  prediction_markets: (i) => `checked prediction markets${i.query ? ` for "${i.query}"` : ""}`, past_backtests: () => "read your backtests",
};

/** What the screen shows of the stored messages: the user's words, and per assistant turn its text and what it looked up. */
function toChat(rows: { seq: number; role: "user" | "assistant"; content: Block[] | Param["content"] }[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const r of rows) {
    const blocks = typeof r.content === "string" ? [{ type: "text", text: r.content }] : (r.content as { type: string; text?: string; name?: string; input?: unknown }[]);
    if (r.role === "user") {
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      if (text) out.push({ seq: r.seq, role: "user", text, tools: [], note: null });
      continue;
    }
    const last = out.at(-1);
    const cur = last?.role === "assistant" ? last : (out.push({ seq: r.seq, role: "assistant", text: "", tools: [], note: null }), out.at(-1)!);
    for (const b of blocks) {
      if (b.type === "text" && b.text) cur.text += (cur.text ? "\n\n" : "") + b.text;
      if (b.type === "tool_use" && b.name) cur.tools.push(TOOL_LABEL[b.name]?.((b.input ?? {}) as Record<string, string>) ?? b.name);
    }
  }
  return out;
}

export async function listConversations(v: Viewer): Promise<Conversation[]> {
  const u = requireUser(v);
  return (await sql()<{ id: string; title: string; updated_at: Date }[]>`select id, title, updated_at from ai_conversations where user_id = ${u.id} order by updated_at desc limit 50`)
    .map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at.toISOString() }));
}

export async function getConversation(v: Viewer, id: string) {
  const u = requireUser(v);
  const [c] = await sql()<{ id: string; title: string; last_note: string | null }[]>`select id, title, last_note from ai_conversations where id = ${id} and user_id = ${u.id}`;
  if (!c) throw new DataError("not_found", "No such conversation");
  const rows = await sql()<{ seq: number; role: "user" | "assistant"; content: Block[] }[]>`select seq, role, content from ai_messages where conversation_id = ${id} order by seq`;
  return { id: c.id, title: c.title, messages: toChat(rows), note: c.last_note };
}

export async function deleteConversation(v: Viewer, id: string) {
  const u = requireUser(v);
  const [r] = await sql()`delete from ai_conversations where id = ${id} and user_id = ${u.id} returning id`;
  if (!r) throw new DataError("not_found", "No such conversation");
}

export async function assistantStatus(v: Viewer) {
  const u = requireUser(v);
  return { configured: aiConfigured(), spent: await spentToday(u.id), limit: dailyLimit(), model: MODEL };
}

/** One question: the tool loop runs until Claude answers, the step limit, or the day's cap. Every message is stored. */
export async function ask(v: Viewer, i: { conversationId: string | null; text: string }) {
  const u = requireUser(v);
  if (!aiConfigured()) throw new DataError("invalid", "The assistant isn't set up: add ANTHROPIC_API_KEY in Vercel's settings, then redeploy.");
  const db = sql();
  let id = i.conversationId;
  if (id) { const [c] = await db`select 1 from ai_conversations where id = ${id} and user_id = ${u.id}`; if (!c) throw new DataError("not_found", "No such conversation"); }
  else id = (await db<{ id: string }[]>`insert into ai_conversations (user_id, title) values (${u.id}, ${i.text.trim().slice(0, 80) || "Question"}) returning id`)[0].id;

  const history = await db<{ seq: number; role: "user" | "assistant"; content: Param["content"] }[]>`select seq, role, content from ai_messages where conversation_id = ${id} order by seq`;
  const messages: Param[] = history.map((h) => ({ role: h.role, content: h.content }));
  let seq = history.at(-1)?.seq ?? 0;
  const save = async (role: "user" | "assistant", content: Param["content"], model: string | null = null) => {
    seq++;
    await db`insert into ai_messages (conversation_id, seq, role, content, model) values (${id}, ${seq}, ${role}, ${db.json(content as never)}, ${model})`;
    messages.push({ role, content });
  };
  // A turn cut off half-way (the cap, an error) can leave a tool call without its result; answer it before going on.
  const last = messages.at(-1);
  if (last?.role === "assistant" && Array.isArray(last.content)) {
    const open = (last.content as Block[]).filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (open.length) await save("user", open.map((b) => ({ type: "tool_result" as const, tool_use_id: b.id, content: "Not run: the previous turn stopped first.", is_error: true })));
  }
  await save("user", [{ type: "text", text: i.text.trim() }]);

  let note: string | null = null;
  for (let step = 0; step < MAX_STEPS; step++) {
    const spent = await spentToday(u.id);
    if (spent >= dailyLimit()) { note = `Stopped: today's assistant spending reached its $${dailyLimit().toFixed(2)} limit. It resets at midnight UTC.`; break; }
    let r: Anthropic.Beta.BetaMessage;
    try {
      r = await claude().beta.messages.create({
        model: MODEL, max_tokens: 16000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
        output_config: { effort: "medium" }, cache_control: { type: "ephemeral" },
        system: SYSTEM + `\n\nToday is ${new Date().toISOString().slice(0, 10)}.`,
        tools: TOOLS.map(({ input: _i, ...t }) => t), messages,
      });
    } catch (e) {
      note = `Claude didn't answer (${e instanceof Error ? e.message.slice(0, 160) : e}). Try again in a moment.`;
      break;
    }
    await recordUsage(u.id, r.model, r.usage);
    await save("assistant", r.content, r.model);
    if (r.stop_reason === "refusal") { note = "Claude declined to answer that. Try asking it a different way."; break; }
    if (r.stop_reason === "max_tokens") { note = "The answer was cut off at its length limit."; break; }
    if (r.stop_reason !== "tool_use") break;
    const calls = r.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const results = await Promise.all(calls.map(async (c): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
      try { return { type: "tool_result", tool_use_id: c.id, content: JSON.stringify(await runTool(v, c.name, c.input)).slice(0, 60_000) }; }
      catch (e) { return { type: "tool_result", tool_use_id: c.id, content: e instanceof DataError || e instanceof z.ZodError ? (e as Error).message : "That lookup failed.", is_error: true }; }
    }));
    await save("user", results); // all results in one message
    if (step === MAX_STEPS - 1) note = "Stopped after eight lookups. Ask a narrower question, or say \"carry on\".";
  }
  await db`update ai_conversations set updated_at = now(), last_note = ${note} where id = ${id}`;
  const c = await getConversation(v, id);
  return { ...c, spent: await spentToday(u.id), limit: dailyLimit() };
}

/** A short desk note on the latest headlines, kept for an hour. */
export async function headlineNote(v: Viewer) {
  const u = requireUser(v);
  if (!aiConfigured()) throw new DataError("invalid", "The assistant isn't set up: add ANTHROPIC_API_KEY in Vercel's settings, then redeploy.");
  const db = sql();
  const key = `note:${u.id}`;
  const [c] = await db<{ data: { text: string; count: number }; fetched_at: Date }[]>`select data, fetched_at from macro_cache where key = ${key}`;
  if (c && Date.now() - c.fetched_at.getTime() < 3_600_000) return { ...c.data, at: c.fetched_at.toISOString(), cached: true };
  if ((await spentToday(u.id)) >= dailyLimit()) throw new DataError("limit", `Today's assistant spending reached its $${dailyLimit().toFixed(2)} limit.`);
  const items = await listNews(v, { limit: 60 });
  if (!items.length) throw new DataError("invalid", "There are no stories to summarise yet.");
  const list = items.map((a) => `- ${a.title} (${a.source}, ${a.publishedAt.slice(0, 16)}) ${a.url}`).join("\n");
  const r = await claude().beta.messages.create({
    model: MODEL, max_tokens: 4000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "low" },
    system: "You write short market desk notes for a private markets app. Group the headlines into the three to five themes that matter most for markets, one short paragraph each, linking one or two stories per theme with markdown links. Plain words, no hype, no advice.",
    messages: [{ role: "user", content: `Today's latest headlines:\n${list}` }],
  });
  await recordUsage(u.id, r.model, r.usage);
  if (r.stop_reason === "refusal") throw new DataError("invalid", "Claude declined to summarise these headlines.");
  const text = r.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n\n");
  const data = { text, count: items.length };
  await db`insert into macro_cache (key, data, fetched_at) values (${key}, ${db.json(data as never)}, now()) on conflict (key) do update set data = excluded.data, fetched_at = excluded.fetched_at`;
  return { ...data, at: new Date().toISOString(), cached: false };
}
