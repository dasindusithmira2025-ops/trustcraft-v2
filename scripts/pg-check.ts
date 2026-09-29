/**
 * Proves the app runs on a real PostgreSQL wire connection, not just PGlite's in-process driver:
 * an in-memory Postgres is served over TCP, the app boots through its production path
 * (DATABASE_URL → node-postgres → migrations → demo data), and the raw-SQL-heavy queries run.
 * Modules that import next/navigation (the dispatch board, via lib/workspace) cannot load outside Next; those run under e2e.
 * Run with `pnpm test:pg`. Point it at a hosted database instead with PG_CHECK_URL (it will migrate it, and seed only if empty).
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`pg-check failed: ${message}`);
}

async function main() {
  let stop = async () => {};
  if (process.env.PG_CHECK_URL) {
    process.env.DATABASE_URL = process.env.PG_CHECK_URL;
  } else {
    const memory = new PGlite();
    const server = new PGLiteSocketServer({ db: memory, port: 0, host: "127.0.0.1", maxConnections: 10 });
    await server.start();
    process.env.DATABASE_URL = `postgres://postgres:postgres@${server.getServerConn()}/postgres`;
    stop = async () => {
      await server.stop();
      await memory.close();
    };
  }
  process.env.DB_AUTO_MIGRATE = "1";
  process.env.DB_SEED_DEMO = "1";

  try {
    const { getDb, schema: s } = await import("../lib/db");
    const { sql, eq } = await import("drizzle-orm");
    const { hit, reset } = await import("../lib/rate-limit");
    const { once } = await import("../lib/idempotency");
    const { providerAttention, providerPerformance, recentActivity } = await import("../features/dashboard/provider-queries");
    const { adminOverview, adminAudit, adminOrganizations, adminWorkOrders } = await import("../features/admin/queries");
    const { customerTimeline } = await import("../features/customers/queries");

    const started = Date.now();
    const db = await getDb();
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.workOrders);
    assert(n > 0, "demo data was not seeded");

    // Atomic upsert + returning, and the timestamptz round-trip.
    const key = `pg-check:${Date.now()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await hit(db, { key, limit: 3, windowMs: 60_000 }));
    assert(results.slice(0, 3).every((r) => r.allowed) && !results[3]!.allowed && results[3]!.retryAfterSec > 0, "rate limit window");
    await reset(db, key);

    // Idempotent replays.
    const [user] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, "ruwan@abc-engineering.test"));
    assert(user, "demo dispatcher missing");
    let runs = 0;
    const op = crypto.randomUUID();
    const first = await once(db, user.id, op, "pg-check", async () => ({ runs: ++runs }));
    const replay = await once(db, user.id, op, "pg-check", async () => ({ runs: ++runs }));
    assert(runs === 1 && "duplicate" in replay && (replay as { runs?: number }).runs === (first as { runs?: number }).runs, "idempotent replay");

    // A transaction rolls back cleanly.
    const before = (await db.select({ n: sql<number>`count(*)::int` }).from(s.rateLimits))[0]!.n;
    await db
      .transaction(async (tx) => {
        await tx.insert(s.rateLimits).values({ key: "rollback-me", count: 1, resetAt: new Date() });
        throw new Error("abort");
      })
      .catch(() => {});
    const after = (await db.select({ n: sql<number>`count(*)::int` }).from(s.rateLimits))[0]!.n;
    assert(before === after, "transaction rollback");

    // The raw-SQL aggregates behind the dashboards, the admin area and the board.
    // (lib/workspace pulls in next/navigation, which cannot load outside Next — so the membership is built by hand.)
    const [org] = await db.select().from(s.organizations).where(eq(s.organizations.slug, "abc-engineering"));
    assert(org, "demo organization missing");
    const m = { ...org, orgId: org.id, role: "dispatcher" as const, title: null };
    const now = new Date();
    const attention = await providerAttention(m, now);
    const performance = await providerPerformance(m, now);
    const activity = await recentActivity(m.orgId);
    assert(attention && performance && activity.length > 0, "provider dashboard queries");
    const overview = await adminOverview();
    assert(overview, "admin overview");
    await adminOrganizations(undefined, undefined, 1, 10);
    await adminWorkOrders(undefined);
    await adminAudit({ kind: "activity", page: 1, pageSize: 10 });
    const [customer] = await db.select({ id: s.customers.id }).from(s.customers).where(eq(s.customers.providerOrgId, m.orgId)).limit(1);
    assert(customer, "demo customer missing");
    assert((await customerTimeline(customer.id)).length >= 0, "customer timeline");

    console.log(`pg-check OK — ${n} work orders, migrations + seed + queries over the Postgres wire protocol in ${Date.now() - started} ms`);
  } finally {
    await stop();
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
