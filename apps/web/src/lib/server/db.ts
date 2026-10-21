import "server-only";
import postgres from "postgres";
import { env } from "./env";

// One pool per server instance. Serverless hosts get a small pool; use the provider's pooled connection string there.
const g = globalThis as unknown as { __sql?: postgres.Sql };

export function sql() {
  if (!g.__sql) {
    g.__sql = postgres(env().DATABASE_URL, {
      max: process.env.VERCEL ? 3 : 10,
      idle_timeout: 20,
      prepare: !/pooler|pgbouncer|:6543/.test(env().DATABASE_URL), // transaction poolers can't use prepared statements
      transform: { undefined: null },
    });
  }
  return g.__sql;
}
