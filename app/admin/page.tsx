import Link from "next/link";
import { adminOverview } from "@/features/admin/queries";
import { DEFAULT_LOCALE, formatDateTime, formatMoney, formatRelative } from "@/lib/format";

const LINKS = [
  ["/admin/users", "Users", "Find a person, see their organizations and sessions"],
  ["/admin/organizations", "Organizations", "Providers and enterprises, members and modules"],
  ["/admin/providers", "Providers & verification", "Who is verified, credentials, TrustScore"],
  ["/admin/work-orders", "Work orders", "Look up any work order and its timeline"],
  ["/admin/payments", "Payments", "Find a payment by reference, invoice or party"],
  ["/admin/audit", "Audit", "Everything that changed, and security events"],
] as const;

export default async function AdminHome() {
  const o = await adminOverview();
  const now = new Date();
  const stats = [
    ["Users", o.users],
    ["Providers", `${o.providers} (${o.verified} verified)`],
    ["Enterprises", o.enterprises],
    ["Open work orders", o.openWork],
    ["Paid, last 30 days", formatMoney(o.paid30, "LKR")],
    ["Failed sign-ins, 24 h", o.failed24],
  ] as const;
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-title text-primary">Admin overview</h1>
        <p className="mt-1 text-body text-secondary">Support and oversight for TrustCraft. Read freely; change carefully.</p>
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-3">
        {stats.map(([k, v]) => (
          <div key={k} className="bg-surface px-4 py-3">
            <dt className="text-compact text-secondary">{k}</dt>
            <dd className="mt-1 text-kpi tabular-nums text-primary">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <section aria-labelledby="events">
          <h2 id="events" className="mb-2 text-heading text-primary">
            Recent security events
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {o.events.map((e, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-body">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-primary">{e.type}</span> <span className="text-muted">{e.email ?? e.ip ?? ""}</span>
                </span>
                <span className="shrink-0 text-meta text-muted">{formatRelative(e.at, now, DEFAULT_LOCALE)}</span>
              </li>
            ))}
            {o.events.length === 0 && <li className="px-4 py-6 text-center text-body text-muted">None yet.</li>}
          </ul>
        </section>
        <section aria-labelledby="actions">
          <h2 id="actions" className="mb-2 text-heading text-primary">
            Recent admin actions
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {o.actions.map((a, i) => (
              <li key={i} className="px-4 py-2.5 text-body">
                <p className="text-primary">{a.summary}</p>
                <p className="text-meta text-muted">
                  {a.email} · {formatDateTime(a.at, DEFAULT_LOCALE)}
                </p>
              </li>
            ))}
            {o.actions.length === 0 && <li className="px-4 py-6 text-center text-body text-muted">No privileged actions yet.</li>}
          </ul>
        </section>
      </div>
      <section aria-labelledby="go">
        <h2 id="go" className="mb-2 text-heading text-primary">
          Go to
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {LINKS.map(([href, label, hint]) => (
            <li key={href}>
              <Link href={href} className="block rounded-lg border border-border bg-surface px-4 py-3 hover:bg-surface-hover">
                <span className="block text-body font-medium text-primary">{label}</span>
                <span className="block text-compact text-muted">{hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
