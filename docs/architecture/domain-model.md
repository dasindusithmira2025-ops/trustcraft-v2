# Domain model

Logical bounded contexts. These are **folders and table groups inside one application**, not services.

```
IDENTITY & TENANCY   users · sessions · organizations · memberships · invitations · onboarding
SERVICE NETWORK      provider_profiles · service_categories · service_areas · skills (membership) · marketplace matching
WORK OPERATIONS      service_requests · work_orders · assignments · scheduling · dispatch · time_off · recurring_plans
ASSET OPERATIONS     locations · assets · maintenance intervals · (inspections: later)
COMMERCIAL           quotes · invoices · payments · (contracts, procurement, SLA contracts: later)
TRUST & COMPLIANCE   evidence · reviews · TrustScore · credentials · (disputes: later)
PLATFORM             notifications · activity_events (audit) · security_events · saved_views · stored_files
                     · rate_limits · client_ops (idempotency) · search · (automation, integrations, analytics: later)
```

## Key entities and their invariants

**Organization** — `kind` (`provider` | `enterprise`), provider `segment`, `modules[]`, `currency`, `timezone`, `business_hours`, invoice defaults (`payment_terms_days`, `tax_rate_bps`). Currency is fixed once work exists.

**Membership** — (user, org) with a `role`, `title`, and technician `skills[]` (service category ids). Roles → capabilities in `lib/permissions.ts`.

**Service area** — `(org, country, region, city, radius_km?)`. Practical, not GIS. Drives marketplace eligibility (`matchProviders`), dispatch warnings ("outside your service area") and public profile text.

**Service request** — a consumer/enterprise ask, sent to up to three matched providers (`request_invites`). Quotes attach to a request.

**Quote** — `draft → sent → viewed → accepted | declined | revised | expired`. Lines (`kind`: labor/material/other, quantity, unit, unit price in minor units), discount, tax (basis points), validity, inclusions/exclusions, attachments. A revision is a new quote row (`revision`, `revises_quote_id`); the earlier one becomes `revised`. Total = subtotal − discount + tax, always integer minor units.

**Work order** — the unit of delivery. Statuses: `open → scheduled → in_progress ⇄ on_hold → awaiting_verification → completed`, or `cancelled` (rules in `features/work-orders/lifecycle.ts`). Carries assignee, one scheduled visit window, SLA due time, checklist, city (for service-area checks), optional `recurring_plan_id` + `occurrence_on`.

**Recurring plan** — a template: customer, location text, service, priority, preferred technician, duration, start time, cadence (`interval_unit` day/week/month, `interval_count`, weekday/day-of-month), `next_run_on`, `status` (`active | paused | ended`). `generateDueOccurrences` creates work orders inside the look-ahead window, idempotent on `(plan, occurrence_on)`. Generated work orders are **copies**: editing or ending a plan never rewrites history.

**Invoice** — `draft | issued | partially_paid | paid | void | refunded`; *overdue* is derived (`issued/partially_paid` and past `due_at`). Lines, subtotal, tax, total (`amount_minor`), `amount_paid_minor`, balance = total − paid. Payments are append-only rows; the invoice's paid amount and status change in the same transaction.

**Activity event** — the audit/timeline primitive. Scoped by any of `work_order_id`, `request_id`, `customer_id`, `recurring_plan_id`, plus `org_id`. Customer timeline = customer-scoped events ∪ events of that customer's work orders. Summaries are written in plain human language ("Assigned to Kasun Perera for Mon 3 Nov, 9:00 am").

**Notification** — durable per-user row: `category` (assignment, quote, verification, invoice, sla, system…), `kind` (`action` needs a response, `update` informs), optional entity link and `dedupe_key` (so periodic generators — SLA warnings — never repeat).

**Saved view** — `(user, org, scope, name, params, visibility)`. `params` is the URL query (filters/sort) so a view is exactly a bookmark. `visibility` is `personal` today; `org` is reserved for shared views.

## Relationships worth remembering

- A provider's **customer** may be linked to a TrustCraft user (`user_id`) or an enterprise organization (`client_org_id`); the linked side can verify, pay and view.
- An enterprise raises work **directly** with approved providers (customers with `client_org_id` = enterprise). No quote step in Phase 2.
- Work-order visibility: assignee, requester/customer side, client org members, and non-technician provider members (see `canView`).
- Evidence belongs to a work order; files live in object storage and are referenced by key.
