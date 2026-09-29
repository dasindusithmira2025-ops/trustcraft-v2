import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";
import { seed } from "./seed";

/**
 * One type for both drivers. PGlite and node-postgres are two `PgDatabase`s with the same query API and
 * the same `{ rows }` shape for raw SQL, so the code is written against one (PGlite's, whose types are the
 * most precise) and the node-postgres client is cast to it. Application code uses only portable SQL —
 * nothing anywhere depends on how PGlite differs from a hosted Postgres; `pnpm test:pg` proves it over the wire.
 */
export type Db = PgliteDatabase<typeof schema>;

const migrations = path.join(process.cwd(), "lib", "db", "migrations");

/**
 * DATABASE_URL set → a real PostgreSQL through node-postgres (pooled): what production uses.
 *   Migrations are applied by `pnpm db:migrate` (or at boot with DB_AUTO_MIGRATE=1); demo data only with DB_SEED_DEMO=1.
 * Otherwise → PGlite, Postgres compiled to WASM, stored in `.data/`: zero setup for development.
 *   It migrates and seeds itself on first request.
 */
async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const [{ Pool }, { drizzle }, { migrate }] = await Promise.all([import("pg"), import("drizzle-orm/node-postgres"), import("drizzle-orm/node-postgres/migrator")]);
    const pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
    const pg = drizzle(pool, { schema });
    if (process.env.DB_AUTO_MIGRATE === "1") await migrate(pg, { migrationsFolder: migrations });
    const db = pg as unknown as Db; // see the note on `Db`
    if (process.env.DB_SEED_DEMO === "1") {
      const existing = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
      if (existing.length === 0) await seed(db);
    }
    return db;
  }

  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([import("@electric-sql/pglite"), import("drizzle-orm/pglite"), import("drizzle-orm/pglite/migrator")]);
  const dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  mkdirSync(dataDir, { recursive: true });
  const db = drizzle(new PGlite(dataDir), { schema });
  await migrate(db, { migrationsFolder: migrations });
  const existing = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (existing.length === 0) await seed(db);
  return db;
}

const g = globalThis as unknown as { __tcDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  g.__tcDb ??= open().catch((error) => {
    g.__tcDb = undefined; // let the next request retry instead of caching the failure
    throw error;
  });
  return g.__tcDb;
}

export { schema };
