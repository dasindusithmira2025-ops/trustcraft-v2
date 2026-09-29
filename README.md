# TrustCraft

Service operations and trust platform: people and organizations find verified professionals, and every job — quote, visit, evidence, sign-off, payment, review — is recorded so reputation comes from verified work.

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:3000 — the database creates and seeds itself on first request
```

Sign in with any **Demo account** on the login page (development only; all use password `trustcraft`).

| Experience | Account | Try |
| --- | --- | --- |
| TrustCraft Home | Tharushi Wijesinghe | Compare two quotes, verify an AC repair, pay, review |
| TrustCraft Service (company) | Anura Bandara (owner) | Settings, invoicing and receivables, team, onboarding checklist |
| TrustCraft Service (company) | Ruwan Silva (dispatcher) | Attention-first dashboard, dispatch board, calendar, customers, recurring work |
| TrustCraft Service (independent) | Nimal Fernando | A one-person business: quote, schedule yourself, invoice |
| TrustCraft Service (small team) | `imran@coolair.test` (type it in; not a button) | CoolAir: a small team with recurring service contracts |
| TrustCraft Field | Kasun Perera (technician) | Today's jobs, checklist, camera-first evidence, complete work |
| TrustCraft Ops | Dilani Jayawardena (facility manager) | Sign-off queue, sites, assets, maintenance, raise work to a vendor |
| TrustCraft Admin | Malith Ranasinghe (platform staff) | `/admin`: users, organizations, provider verification, audit |

Create your own account at `/signup` to walk the onboarding for a consumer, an independent, a service business or an enterprise. All organizations and people are fictional; emails use the reserved `.test` domain.

```bash
pnpm db:reset            # wipe and reseed the local database (stop the dev server first)
pnpm test                # unit tests for the pure rules (lifecycle, SLA, TrustScore, totals, recurrence, dispatch, SigV4…)
pnpm test:e2e            # Playwright on a production build with its own database: every core flow, plus axe WCAG A/AA scans
pnpm test:pg             # the production database path over a real Postgres connection
pnpm db:verify-upgrade   # applies migration 0001 to a database holding Phase 1 data
pnpm typecheck && pnpm lint && pnpm build
```

## Running on PostgreSQL

Set `DATABASE_URL` and the app uses a pooled `node-postgres` connection instead of the embedded database.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Unset → embedded PGlite in `.data/pglite` |
| `DATABASE_POOL_MAX` | Pool size (default 10) |
| `DB_AUTO_MIGRATE=1` | Apply migrations at boot (single instance). Otherwise run `pnpm db:migrate` before each release |
| `DB_SEED_DEMO=1` | Load the demo world into an empty database (staging only) |
| `CRON_SECRET` | Bearer token for `POST /api/jobs/recurring` (generates due recurring visits) |
| `STORAGE_DRIVER` and `S3_*` | Object storage; unset → local files under `.data/uploads`. See `lib/storage/index.ts` |
| `PGLITE_DIR`, `UPLOADS_DIR`, `NEXT_DIST_DIR` | Point a second dev server at its own data (used by the e2e suite) |

Every schema change needs a migration: `pnpm db:generate`, review the SQL, commit it.

## Architecture

Modular monolith on Next.js 16 (App Router, React 19, strict TypeScript, Tailwind v4).

```
app/                 routes — /login, /signup, /onboarding, /home (consumer), /w/[org] (provider & enterprise
                     workspaces), /field (technicians), /admin (platform staff), /pros/[slug] (network profiles),
                     /api (notifications, uploads and files, recurring-job cron)
features/<domain>/   domain logic, queries, server actions and domain components
  work-orders/       lifecycle.ts — the state machine and who may drive it (pure, unit-tested)
  trust/             score.ts — TrustScore engine (pure, explainable, unit-tested)
  requests/          service requests, quotes, deterministic classifier
  dispatch/          board data and the assignment safety assessment (pure, unit-tested)
  commercial/        totals, tax, invoice and quote state (pure, integer money, unit-tested)
  recurring/         plans, occurrence math, lazy generation
  customers/ org/ onboarding/ billing/ schedule/ views/ notifications/ admin/ field/ media/
components/ui/       primitives on Base UI (menu, dialog, sheet, tooltip) + native form controls
components/app/      product components: shell, tables, status language, SLA clock, TrustScore, timeline
lib/                 db (Drizzle schema, migrations, seed), auth, permissions, storage, rate limiting, payments seam
```

Decisions worth knowing:

- **Database: PostgreSQL via Drizzle.** Development uses PGlite (Postgres compiled to WASM, stored in `.data/`), so there is nothing to install; production sets `DATABASE_URL`. Same schema and portable SQL either way — `lib/db/index.ts` is the only place that knows the driver.
- **Authorization lives on the server.** `lib/permissions.ts` maps roles to capabilities; `features/work-orders/lifecycle.ts` decides every transition. The UI reads the same rules to decide what to show, and every server action checks them again. A provider can never verify its own work.
- **Workspaces are derived, not configured:** navigation = organization kind + member role + enabled modules (`features/workspace/navigation.ts`). Non-members get a 404, never a hint the org exists.
- **Audit by default:** each state change writes an `activity_events` row; the timeline on every work order is that log.
- **No AI dependency.** Category suggestion is a deterministic keyword classifier; TrustScore is plain arithmetic over verified records.
- **URL state:** list views, filters, sort and pages live in the query string (bookmarkable, shareable, the base for saved views).
- **Money** is integer minor units with an ISO currency; dates render in the organization's timezone.
- **Payments** go through one seam (`lib/payments.ts`); the development rail records a demo payment and never sees card data.

Deliberate shortcuts are marked in code with `ponytail:` comments (search for them) with the upgrade path next to each.

The canonical documents are in [`docs/architecture/`](docs/architecture): product model, system architecture, domain model, UX principles, and [implementation status](docs/architecture/implementation-status.md) (what is built, how it was verified, what is deliberately missing).
