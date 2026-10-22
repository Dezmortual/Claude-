// Applies db/migrations/*.sql in order, once each, inside a transaction. Usage: npm run db:migrate
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { dbUrl } from "../src/lib/dburl";

// The direct (unpooled) string when there is one: schema changes shouldn't go through a transaction pooler. A value that
// isn't a connection string (a placeholder pasted by mistake) is ignored rather than crashing the deploy.
const isPg = (v?: string) => !!v && /^postgres(ql)?:\/\/\S+$/.test(v.trim());
if (process.env.DATABASE_URL_DIRECT && !isPg(process.env.DATABASE_URL_DIRECT)) console.warn("DATABASE_URL_DIRECT isn't a postgres:// connection string; using DATABASE_URL");
const url = isPg(process.env.DATABASE_URL_DIRECT) ? process.env.DATABASE_URL_DIRECT!.trim() : process.env.DATABASE_URL?.trim();
if (!isPg(url)) throw new Error("DATABASE_URL must be a postgres:// or postgresql:// connection string (see .env.example)");
console.log(`${path.basename(import.meta.filename)}: connecting to ${new URL(url!).host}`);
const sql = postgres(dbUrl(url!), { max: 1, onnotice: () => {} });
const dir = path.join(process.cwd(), "db", "migrations");

await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(file)) continue;
  await sql.begin(async (tx) => {
    await tx.unsafe(fs.readFileSync(path.join(dir, file), "utf8"));
    await tx`insert into schema_migrations (name) values (${file})`;
  });
  console.log("applied", file);
}
console.log("migrations up to date");
await sql.end();
