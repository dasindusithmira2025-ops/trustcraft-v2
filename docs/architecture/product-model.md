# TrustCraft product model

Canonical reference. If code and this document disagree, one of them is a bug — fix it or amend this file in the same change.

## What TrustCraft is

> The operating and trust network connecting people and organizations with professionals and service companies while managing the complete lifecycle of physical-world service work.

It is **not** a home-services marketplace. The marketplace is one way work arrives; the operating system for delivering, invoicing and proving that work is the product.

## The ladder

```
Consumer → Independent professional → Small service business → Professional service company
        → Facility / property organization → Enterprise
```

Complexity is revealed progressively. Nobody sees enterprise features they cannot use, and nobody outgrows the product: the platform underneath is the same for the electrician and the 200-technician company.

## Experiences (one platform, several surfaces)

| Surface | Route | Audience |
| --- | --- | --- |
| TrustCraft **Home** | `/home` | Consumers — describe a problem, compare quotes, verify, pay, review |
| TrustCraft **Service** | `/w/[org]` (provider orgs) | Professionals and service businesses |
| TrustCraft **Field** | `/field` | Technicians — today's jobs, evidence, completion |
| TrustCraft **Ops** | `/w/[org]` (enterprise orgs) | Facility / property organizations |
| TrustCraft **Network** | `/pros/[slug]` | Public provider profile and TrustScore |
| TrustCraft **Admin** | `/admin` | TrustCraft staff only (privileged, audited) |

These are experiences over shared domain modules, not separate systems. `/w/[org]` renders Service or Ops depending on `organization.kind`.

## Provider segments

Provider organizations have a `segment`, chosen at onboarding and changed automatically when the team grows:

| Segment | Who | Default modules | Navigation shape |
| --- | --- | --- | --- |
| `solo` | One independent professional | — | Today · Requests · Jobs · Customers · Money · Settings |
| `team` | Small business, a handful of people | `recurring` | Overview · Requests · Jobs · Schedule · Customers · Team · Invoices |
| `company` | Larger service company | `dispatch`, `recurring`, `reports` | Overview · Work · Dispatch · Schedule · Customers · Team · Services · Invoices · Reports |

Navigation is **derived**: organization kind + segment labels + role capabilities + enabled modules. See `features/workspace/navigation.ts`.

Enterprise organizations have an `orgType` (hotel, hospital, office, retail, industrial, property, other) and modules `locations`, `assets`, `maintenance`.

## Roles

`owner`, `admin`, `dispatcher`, `technician`, `finance`, `facility_manager`, `viewer`. Roles map to capabilities in `lib/permissions.ts`. A role is scoped to one organization; a person may hold different roles in different organizations.

## Trust rules that must never regress

1. **The provider never verifies its own work.** Only the customer side (or the client organization's approvers) can verify or reject.
2. **TrustScore is explainable.** Plain arithmetic over verified records; every number traces to jobs and reviews. No opaque model.
3. **Server-side authorization is the boundary.** UI visibility is convenience.
4. **Tenant isolation.** A non-member gets a 404 for anything in an organization — never a hint that it exists.
5. **Money is integer minor units plus an ISO currency.** Dates render in the organization's timezone.
6. **TrustCraft never stores card data.** Payments go through `lib/payments.ts`.
7. **Audit by default.** Meaningful state changes write an activity event.
8. **No mandatory AI.** Every workflow is deterministic.

## Out of scope until later phases

Enterprise procurement and quote comparison, contract/SLA engine, preventive asset maintenance at scale, inventory, fleet, payroll, accounting, SSO, multi-region, escrow, financing, AI agents, predictive maintenance.
