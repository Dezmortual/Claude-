// Upserts the asset catalogue and plans. Safe to rerun. Usage: npm run db:seed
import path from "node:path";
import postgres from "postgres";
import { dbUrl } from "../src/lib/dburl";
import { ASSETS, PLANS } from "../src/lib/data/catalogue";
import { sourceFor } from "../src/lib/data/sources/map";

// The direct (unpooled) string when there is one: schema changes shouldn't go through a transaction pooler. A value that
// isn't a connection string (a placeholder pasted by mistake) is ignored rather than crashing the deploy.
const isPg = (v?: string) => !!v && /^postgres(ql)?:\/\/\S+$/.test(v.trim());
if (process.env.DATABASE_URL_DIRECT && !isPg(process.env.DATABASE_URL_DIRECT)) console.warn("DATABASE_URL_DIRECT isn't a postgres:// connection string; using DATABASE_URL");
const url = isPg(process.env.DATABASE_URL_DIRECT) ? process.env.DATABASE_URL_DIRECT!.trim() : process.env.DATABASE_URL?.trim();
if (!isPg(url)) throw new Error("DATABASE_URL must be a postgres:// or postgresql:// connection string (see .env.example)");
console.log(`${path.basename(import.meta.filename)}: connecting to ${new URL(url!).host}`);
const sql = postgres(dbUrl(url!), { max: 1, onnotice: () => {} });

for (const a of ASSETS) {
  const { source, symbol } = sourceFor(a);
  await sql`
    insert into assets (market_id, slug, ticker, name, source, source_symbol, is_public)
    select id, ${a.slug}, ${a.ticker}, ${a.name}, ${source}, ${symbol}, ${a.isPublic} from markets where code = ${a.market}
    on conflict (slug) do update set ticker = excluded.ticker, name = excluded.name, source = excluded.source,
      source_symbol = excluded.source_symbol, is_public = excluded.is_public, is_active = true`;
}
await sql`update assets set is_active = false where slug <> all(${ASSETS.map((a) => a.slug)})`;
for (const [i, p] of PLANS.entries()) {
  await sql`insert into plans (code, name, price_month_cents, price_year_cents, currency, rank)
    values (${p.code}, ${p.name}, ${p.priceMonthCents}, ${p.priceYearCents}, ${p.currency}, ${i})
    on conflict (code) do update set name = excluded.name, price_month_cents = excluded.price_month_cents,
      price_year_cents = excluded.price_year_cents, rank = excluded.rank`;
}
console.log(`seeded ${ASSETS.length} assets, ${PLANS.length} plans`);
await sql.end();
