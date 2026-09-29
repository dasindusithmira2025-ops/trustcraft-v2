# System architecture

## Shape

```
Clients (browser, phone)
      ↓
Next.js 16 App Router  ── server components, server actions, route handlers
      ↓
Domain modules  (features/<domain>)  ── pure rules + queries + actions
      ↓
PostgreSQL  (Drizzle)
```

A **modular monolith**. Domains are folders with clear public surfaces, not services. No Kubernetes, no microservices, no event sourcing.

## Layering rules

- `app/` — routes only: resolve params, call `requireWorkspace` / `requireCapability`, fetch through a feature query, compose components.
- `features/<domain>/` — `queries.ts` (reads, `server-only`), `actions.ts` (`"use server"` mutations), pure rule modules (`lifecycle.ts`, `conflicts.ts`, `score.ts`, …) with unit tests, and domain components.
- `components/ui` — primitives (Base UI + native controls). `components/app` — product components shared across domains (shell, tables, status language, timeline).
- `lib/` — cross-cutting infrastructure: db, auth, permissions, format, storage, rate limiting, payments seam.
- Pure rules never import the database or React. The same rule decides what the server allows and what the UI offers.
- Non-`"use server"` helpers (e.g. `notify`) live outside action files: exported functions in a `"use server"` file become public endpoints.

## Consistency model

- **Synchronous, in one database transaction**, when the user needs an immediate consistent result: accepting a quote (claim request → create work order → close competitors), verifying work (status → invoice), recording a payment (payment row → invoice balance/status), recording an assignment with its audit row.
- **Asynchronous / eventually consistent** for secondary effects: notifications, search, analytics, TrustScore recomputation, webhooks, media processing. Today these are inline after the transaction; each is written so it can move behind a queue without changing callers (`notify()`, `generateDueOccurrences()`, `generateSlaNotifications()` are idempotent by construction).

## Authorization

1. `requireUser()` — session or redirect to sign-in.
2. `requireWorkspace(slug)` — membership or **404**. Technicians are redirected to Field.
3. `requireCapability(slug, cap)` — role capability or **404**.
4. Domain rules (`can(action, actor, status)`) for state transitions.
5. `requireAdmin()` — `users.platform_role = 'admin'` or **404**. Admin mutations write audit events with a required reason.

Queries take the tenant scope from the membership, never from request input.

## Idempotency and retry

Field mutations accept a client-generated operation id (`clientOpId`). `lib/idempotency.ts` records the result of each `(user, opId)` so a retry returns the original outcome instead of repeating the effect. This is the seam for offline queues: a device can replay operations in order and be safe. Status transitions are additionally guarded by "update where status = X".

## Storage

```
Client → requestUpload (authorized, size/type checked) → signed URL or authenticated PUT
       → storage object → completeUpload (verifies object) → stored_files row
       → evidence / attachment row references the key
```

`lib/storage/` exposes one adapter interface. `local` (default in development) writes under `.data/uploads`; `s3` speaks S3-compatible object storage using presigned URLs (SigV4, no SDK). Storage credentials never reach the client. Files are served through authorized route handlers, never public URLs.

## Database

- PostgreSQL through Drizzle. **PGlite** (Postgres in WASM, `.data/pglite`) is the zero-setup local default. Production sets `DATABASE_URL` and uses a pooled `node-postgres` connection (`DATABASE_POOL_MAX`, default 10); application code uses only portable SQL (no PGlite-specific behaviour). `lib/db/index.ts` is the only place that knows which driver is in use.
- Production migrations are applied deliberately with `pnpm db:migrate` before a release starts. `DB_AUTO_MIGRATE=1` applies them at boot instead (single-instance deployments); `DB_SEED_DEMO=1` loads the demo world into an empty database (staging only).
- Every schema change ships a migration in `lib/db/migrations` and updates the seed and tests. `pnpm db:generate` creates it; never edit tables by hand.
- `pnpm test:pg` boots the app's production database path (node-postgres, migrations, demo data) against a real Postgres wire connection — an in-memory server by default, or any database via `PG_CHECK_URL` — and runs the raw-SQL-heavy queries, rate limiting, idempotency and transactions. It is a smoke test of the driver seam, not a replacement for the browser suite, which runs on PGlite.

## Notifications

Domain model is transport-independent: a durable row (`category`, `kind`, entity link, `dedupe_key`, read state). Delivery is the simplest robust mechanism — the shell polls a lightweight summary endpoint on an interval and on focus. SSE or push can replace polling later without touching producers.

## Auth hardening

- Passwords: scrypt. Sessions: opaque token, only its SHA-256 stored, httpOnly + SameSite=Lax + `__Host-` prefixed and Secure in production, fixed 30-day expiry (no sliding renewal), a fresh token on every sign-in, revocable per device, and every other device is signed out when the password changes.
- Sign-in and sign-up are rate limited per account and per IP in the database (`rate_limits`), work across processes, and answer identically for unknown and known accounts.
- Security-relevant events (sign-in failures, lockouts, password changes, admin actions) write to `security_events`.
- Server Actions are same-origin protected by Next.js; state-changing route handlers require a session and check `Origin`.

## Deliberate shortcuts

Marked in code with `ponytail:` — what is simplified, why, and the upgrade path. `pnpm` search for `ponytail:` lists them; `implementation-status.md` summarises the important ones.
