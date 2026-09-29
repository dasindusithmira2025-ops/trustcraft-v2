/** Proves 0001 upgrades a database that already holds Phase 1 data. Run with `pnpm tsx scripts/verify-upgrade.ts`. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const run = async (db: PGlite, file: string) => {
  const sql = readFileSync(path.join(process.cwd(), "lib", "db", "migrations", file), "utf8");
  for (const stmt of sql.split("--> statement-breakpoint")) if (stmt.trim()) await db.exec(stmt);
};

async function main() {
  const db = new PGlite();
  await run(db, "0000_init.sql");
  await db.exec(`
    insert into users (id, email, name, password_hash) values ('00000000-0000-0000-0000-000000000001','a@x.test','A','x');
    insert into organizations (id, slug, name, kind) values ('00000000-0000-0000-0000-0000000000a1','solo','Solo','provider'), ('00000000-0000-0000-0000-0000000000a2','big','Big','provider'), ('00000000-0000-0000-0000-0000000000a3','ent','Ent','enterprise');
    insert into provider_profiles (org_id, headline, about, categories, service_areas, team_size) values
      ('00000000-0000-0000-0000-0000000000a1','h','a','{plumbing}','{Nugegoda,Kandy}',1),
      ('00000000-0000-0000-0000-0000000000a2','h','a','{hvac}','{Colombo}',24);
    insert into service_categories (id, name) values ('hvac','HVAC');
    insert into customers (id, provider_org_id, name) values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a2','C');
    insert into work_orders (id, provider_org_id, customer_id, title, category_id, address, currency, amount_minor) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c1','Fix AC','hvac','Colombo','LKR',50000);
    insert into invoices (work_order_id, provider_org_id, customer_id, amount_minor, currency, status, due_at) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c1',50000,'LKR','paid', now());
    insert into activity_events (work_order_id, type, summary) values ('00000000-0000-0000-0000-0000000000d1','created','x');
  `);
  await run(db, "0001_phase2_foundation.sql");
  const q = async (sql: string) => (await db.query(sql)).rows;
  const areas = await q("select o.slug, a.city, a.district, a.province from service_areas a join organizations o on o.id=a.org_id order by 1,2");
  const orgs = await q("select slug, segment, org_type, modules from organizations order by slug");
  const inv = await q("select amount_paid_minor::int as paid, subtotal_minor::int as sub, lines from invoices");
  const ev = await q("select o.slug from activity_events e join organizations o on o.id=e.org_id");
  console.log(JSON.stringify({ areas, orgs, inv, ev }, null, 1));
  const cols = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name='provider_profiles'");
  if (cols.rows.some((c) => c.column_name === "service_areas")) throw new Error("service_areas column should be dropped");
  console.log("upgrade OK");
}
void main();
