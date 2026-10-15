import { promises as fs } from "fs";
import path from "path";
import type { DB } from "../types";
import { buildSeed } from "../seed";

const DB_PATH = path.join(process.cwd(), "data", "db.json");

let cache: DB | null = null;
let chain: Promise<unknown> = Promise.resolve();

async function ensureDir() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
}

/** Read (and lazily seed) the DB. Returns the cached object. */
export async function readDb(): Promise<DB> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    cache = JSON.parse(raw) as DB;
  } catch {
    cache = buildSeed();
    await ensureDir();
    await fs.writeFile(DB_PATH, JSON.stringify(cache, null, 2));
  }
  return cache;
}

async function persist(db: DB): Promise<void> {
  await ensureDir();
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

/**
 * Serialized mutation. `fn` receives the live DB object and may mutate it
 * in place or return a value. The write happens after `fn` resolves.
 * Concurrent calls are queued, so reads-then-writes are safe.
 */
export function mutate<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const db = await readDb();
    const result = await fn(db);
    await persist(db);
    return result;
  });
  chain = run.catch(() => {});
  return run;
}

/** Replace the whole DB (used by PUT /api/db and seed reset). */
export function replaceDb(next: DB): Promise<void> {
  return mutate((db) => {
    db.categories = next.categories;
    db.products = next.products;
    db.transactions = next.transactions;
    db.settings = next.settings;
  });
}