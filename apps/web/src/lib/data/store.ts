// Dev-only user store: a JSON file in .data/ so accounts survive restarts. Replaced by Postgres in /replica-backend.
import fs from "node:fs";
import path from "node:path";
import type { Alert, Subscription, TablePrefs, User } from "./types";

interface StoredUser extends User { passwordHash: string; salt: string }

interface Db {
  users: StoredUser[];
  sessions: Record<string, { userId: string; expiresAt: number }>;
  subscriptions: Record<string, Subscription>;
  watchlists: Record<string, string[]>;
  alerts: Record<string, Alert[]>;
  prefs: Record<string, TablePrefs>;
}

const FILE = path.join(process.cwd(), ".data", "store.json");
const empty = (): Db => ({ users: [], sessions: {}, subscriptions: {}, watchlists: {}, alerts: {}, prefs: {} });

const g = globalThis as unknown as { __db?: Db };

export function db(): Db {
  if (!g.__db) {
    try {
      g.__db = { ...empty(), ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
    } catch {
      g.__db = empty();
    }
  }
  return g.__db!;
}

export function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(g.__db));
  fs.renameSync(tmp, FILE);
}

export type { StoredUser };
