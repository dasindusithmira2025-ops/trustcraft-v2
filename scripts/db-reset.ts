/** Wipes the local embedded database and rebuilds it from migrations + demo seed. */
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../lib/db/schema";
import { seed } from "../lib/db/seed";

async function main() {
  // `pnpm db:reset --dir .data/e2e` resets a side database without touching the main one.
  const flag = process.argv.indexOf("--dir");
  const dir = path.resolve(flag > -1 ? process.argv[flag + 1]! : (process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite")));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  const started = Date.now();
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "lib", "db", "migrations") });
  await seed(db);
  const { rows } = await client.query<{ count: number }>("select count(*)::int as count from work_orders");
  console.log(`Seeded ${rows[0]?.count} work orders in ${Date.now() - started} ms → ${dir}`);
  await client.close();
}

void main();
