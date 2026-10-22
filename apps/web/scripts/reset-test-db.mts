// Wipes and rebuilds the e2e database. Refuses any database whose name doesn't end in "_test".
import { execSync } from "node:child_process";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "";
const name = new URL(url).pathname.slice(1);
if (!name.endsWith("_test")) throw new Error(`refusing to reset "${name}": not a *_test database`);
const sql = postgres(url, { max: 1, onnotice: () => {} });
await sql`drop schema public cascade`;
await sql`create schema public`;
await sql.end();
execSync("tsx scripts/migrate.mts && tsx scripts/seed.mts", { stdio: "inherit", env: process.env });
