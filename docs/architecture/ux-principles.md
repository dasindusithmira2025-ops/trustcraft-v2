# UX principles

Target: **Linear-level precision, Stripe-level clarity, operations-software density, TrustCraft's own identity.** Craft, not cloning.

TrustCraft feels: calm · precise · fast · professional · trustworthy · dense where necessary · simple where possible.

## Do

- Let **operational information dominate**. Hierarchy from weight, contrast and position — not size.
- Ask "**what needs my attention?**" first. Dashboards order: Attention → Today → Performance → Recent activity.
- Use the **canonical status language** (`components/app/status.tsx`). A "Waiting" job looks identical in a table, a drawer and the field app.
- Keep **state in the URL**: filters, sort, page, selected record, calendar date/view. Views are bookmarkable and shareable; back/forward behave.
- Preserve context: inspect records in a drawer or split view instead of navigating away. The dedicated route stays canonical and shareable.
- Say what will happen. Confirmations name the consequence; buttons carry verbs ("Send quote", "Issue invoice", "Mark as paid", "Assign technician", "Create recurring service").
- Warn about mistakes; allow legitimate overrides **with a reason**, and record it.
- Make every interaction available without drag-and-drop, without hover, and with a keyboard. Drag-and-drop is an accelerator.
- Design empty, loading, error and disabled states as first-class screens.
- One accent colour. Colour never carries meaning alone — icon and words change too.

## Don't

Generic admin-template chrome · oversized cards and headings · gradient / glassmorphism · random badges · decorative animation · chart spam · KPI-card walls · excessive radius.

## Density and layout

- Type scale: `title 20 / heading 15 / body 14 / compact 13 / meta 12 / kpi 24`. Tables use 44px rows, 36px headers.
- Pages use `Page` (max 90rem) with `PageHeader`, `Section`, `Panel`. Sections are structure, not floating cards.
- Hairline dividers over boxes. Radius: 6 (controls), 8 (panels), 12 (dialogs/field cards).

## Responsive

Verified widths: **390 · 768 · 1024 · 1440 · 1920**.

- Tables become titled lists below `md`.
- Dispatch, calendar and split view are **not** shrunk on phones. Phones get task views: Dispatch → Unassigned / At risk / Technicians / Today; Calendar → agenda list; Work orders → list then full page.
- Touch targets ≥ 40px on Home and Field surfaces.

## Accessibility (WCAG 2.2 AA)

Skip link; focus-visible rings; `aria-current`, `aria-sort`, `aria-live` for async results; dialogs trap focus (Base UI); calendar and dispatch are keyboard-operable (roving focus is not required because every item is a real link/button reachable in DOM order); prefers-reduced-motion honoured; target size ≥ 24px minimum.

## Field (technicians)

One column, no sidebar, big targets, camera-first evidence. Always show whether something is **saved**: capturing → compressing → uploading → uploaded / retrying / failed. Offline state is visible; operations carry idempotency keys so retry is safe.

## Copy

Human, short, specific. "Assign technician" not "Create assignment". "Send quote" not "Submit". Errors explain what to do next.
