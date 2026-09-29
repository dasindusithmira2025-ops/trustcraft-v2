# TrustCraft implementation status

What is built, how it was checked, and what is deliberately not there. Update this file in the same change as the code it describes.

Status words: **ALIGNED** (code matches the architecture documents), **PARTIAL** (works, with a known ceiling listed below), **MISSING** (not built, and why).

## Architecture reconciliation (Phase 2 start)

| Area | Result | Resolution |
| --- | --- | --- |
| Modular monolith, `features/<domain>` + `lib/` | ALIGNED | — |
| Server-side authorization, tenant isolation returning 404 | ALIGNED | Capability map extended for the new modules; every action re-checks it |
| Explainable TrustScore, no mandatory AI | ALIGNED | — |
| Integer money, org timezone, payment seam | ALIGNED | Totals/tax/discount/payments moved into pure, tested rules (`features/commercial`) |
| Audit by default | PARTIAL → ALIGNED | Activity events gained `org_id`/`customer_id`/`recurring_plan_id` so CRM and admin views can read them; admin actions and security events audited |
| URL state | ALIGNED | Saved views are canonical URL queries |
| Customers and service areas | CONFLICT | Customers were a bare name; service areas were a string array on the profile. Both became real tables (migration 0001 moves the data) |
| Quotes and invoices | CONFLICT | Single-amount rows could not express tax, validity, revision or partial payment. Replaced with line-based documents; invoice overdue state is derived, never stored |
| Notifications | PARTIAL → ALIGNED | Added category, entity link and dedupe key |
| Production database | MISSING → ALIGNED | `DATABASE_URL` selects node-postgres; PGlite remains the development default |
| Object storage | MISSING → ALIGNED | Adapter interface with local and S3-compatible implementations |
| Auth hardening | MISSING → ALIGNED | Rate limits, `__Host-` cookie, Origin checks on writes, enumeration-safe errors, security log |

## Built in Phase 2

| Capability | Status | Notes |
| --- | --- | --- |
| Onboarding (solo, business, enterprise; resumable) | ALIGNED | Path and step stored per user, so an unfinished setup resumes where it stopped; a checklist tracks what remains after setup |
| Organization settings | ALIGNED | Business details, hours, services, service areas, invoicing/tax, members and invitations, roles, notifications, security |
| Customer CRM and timeline | ALIGNED | Notes, locations, work, quotes, invoices, payments, one merged timeline |
| Service areas | ALIGNED | Feed dispatch warnings and provider matching |
| Dispatch board | ALIGNED | Timeline board, unassigned queue, drag *or* Assign button, safety warnings (overlap, leave, hours, skill, area, SLA, past, overload), reasoned override recorded in the audit log |
| Calendar (day/week/month) | ALIGNED | Same URL-driven filters as the board |
| Recurring work | ALIGNED | Plans generate visits lazily and through a cron route; month-end clamping; pause/resume |
| Quotes | ALIGNED | Lines, discount, tax, validity, attachments, revisions, expiry |
| Invoicing and receivables | ALIGNED | Issue from work, partial payments, aging view, who owes you |
| Provider dashboard | ALIGNED | Attention first, team today, 30-day performance |
| Reports (module) | ALIGNED | Verified work, money received, quote conversion and SLA over time; by technician and by service; each measure is defined on the page. Fixed-window (30/90 days) — no custom date ranges or export yet |
| Work-order split view | ALIGNED | `?split=1` opens a work order beside the list; dedicated route unchanged |
| Saved views | ALIGNED | Per user, per organization, per list |
| Notification center | ALIGNED | Durable rows, polling transport (45 s + on focus) |
| Admin foundation | ALIGNED | Separate `/admin`, explicit `platform_role`, provider verification and sign-out-everywhere both audited |
| Storage abstraction, signed uploads | ALIGNED | `requestUpload → PUT → completeUpload`; files served through authorized routes |
| Field improvements | PARTIAL | Camera-first evidence, idempotent mutations (`client_ops`); offline queue is in memory only (see gaps) |

## How it was verified

Run on the final tree; the report at the end of the phase lists the exact commands and results. The layers are:

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (pure rules: lifecycle, SLA, TrustScore, totals, invoice/quote state, recurrence, dispatch assessment, SigV4, navigation).
- `pnpm test:e2e`: Playwright against a production build with an isolated database — core loop, onboarding, dispatch, customers, recurring, commercial, platform, field, security and accessibility specs.
- `pnpm db:verify-upgrade`: applies migration 0001 to a database holding Phase 1 data and checks the moves.
- `pnpm test:pg`: the production database path over a real Postgres wire connection.
- Accessibility: `e2e/a11y.spec.ts` runs axe-core (WCAG 2.0/2.1/2.2 A and AA rules) over the main screens of every experience, light and dark, desktop and phone. A scripted sweep at 390 / 768 / 1024 / 1440 / 1920 px checked horizontal overflow, console errors, unnamed controls and one `h1` per page, and the main screens were reviewed as screenshots. Automated rules cover contrast, names, roles, target size and keyboard reachability of scrollers; they do not replace a manual screen-reader pass, and complete keyboard-only walkthroughs were not separately tested.

## Deliberate gaps

Marked in code with `ponytail:` where they are shortcuts. Everything here has a named upgrade path.

- **No outbound email or SMS.** Invitations produce a link to share; there is no password-reset flow and no email verification, so sign-up reports an existing email honestly instead of hiding it. Both arrive together with a mail transport.
- **Offline field work is state-aware, not queued.** Evidence waits in memory while offline; a reload loses unsent photos. An IndexedDB queue replaying through the idempotent mutations is the upgrade.
- **Payments are a demo rail** that always succeeds behind `lib/payments.ts`; a hosted-checkout adapter replaces it.
- **Notifications poll.** SSE or push can replace polling without touching producers.
- **SLA notices and recurring visits are generated lazily** when a scheduling screen loads or a client polls, plus the `/api/jobs/recurring` cron route (`CRON_SECRET`). No separate worker.
- **TrustScore is computed on read** — fine at thousands of jobs per provider; materialize past that.
- **Money in `number`** — exact to 9e15 minor units; move to bigint mode past that.
- **Client IP** is the first `X-Forwarded-For` hop; correct only behind a proxy you control.
- **Service catalog** is a flat Sri Lankan list; a managed taxonomy replaces it.
- **Assets** are one level deep (site › floor).
- **Per-contract SLAs** are global defaults until Phase 3 contracts exist.
- **No MFA, no malware scanning of uploads, no bulk customer import.**
- **Playwright runs on PGlite.** Postgres is exercised by `pnpm test:pg` (queries and driver behaviour), not by re-running the browser suite; dispatch-board queries load `next/navigation` and are covered by the browser suite only.
