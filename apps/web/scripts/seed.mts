// Upserts the asset catalogue and plans. Safe to rerun. Usage: npm run db:seed
import postgres from "postgres";
import { dbUrl } from "../src/lib/dburl";
import { ASSETS, PLANS } from "../src/lib/data/catalogue";
import { sourceFor } from "../src/lib/data/sources/map";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL (see .env.example)");
const sql = postgres(dbUrl(url), { max: 1, onnotice: () => {} });

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
