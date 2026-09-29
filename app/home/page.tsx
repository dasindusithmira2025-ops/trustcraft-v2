import { and, desc, eq, inArray } from "drizzle-orm";
import type { ReactNode } from "react";
import { ArrowRight, ChevronRight, Receipt, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { WorkOrderStatusBadge } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { CATEGORIES } from "@/features/requests/catalog";
import { listRequestsForUser } from "@/features/requests/queries";
import { listWorkOrders } from "@/features/work-orders/queries";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { formatDate, formatDateTime, formatMoney, invoiceNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Home" };

const POPULAR = ["plumbing", "hvac", "electrical", "appliance", "cleaning", "painting"];

export default async function HomePage() {
  const user = await requireUser();
  const scope = { customerUser: user.id };
  const db = await getDb();
  const [active, recent, requests, unpaid] = await Promise.all([
    listWorkOrders({ scope, view: "open", sort: "number", dir: "desc", page: 1, pageSize: 10 }),
    listWorkOrders({ scope, view: "completed", sort: "number", dir: "desc", page: 1, pageSize: 3 }),
    listRequestsForUser(user.id),
    db
      .select({ id: s.invoices.id, number: s.invoices.number, amountMinor: s.invoices.amountMinor, currency: s.invoices.currency, woNumber: s.workOrders.number, title: s.workOrders.title })
      .from(s.invoices)
      .innerJoin(s.workOrders, eq(s.workOrders.id, s.invoices.workOrderId))
      .innerJoin(s.customers, eq(s.customers.id, s.invoices.customerId))
      .where(and(eq(s.customers.userId, user.id), inArray(s.invoices.status, ["issued"])))
      .orderBy(desc(s.invoices.issuedAt)),
  ]);
  const toVerify = active.rows.filter((w) => w.status === "awaiting_verification");
  const inFlight = active.rows.filter((w) => w.status !== "awaiting_verification");
  const quoted = requests.filter((r) => r.status === "open" && r.quotes > 0);
  const waiting = requests.filter((r) => r.status === "open" && r.quotes === 0);
  const actions = toVerify.length + quoted.length + unpaid.length;

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="ask" className="flex flex-col gap-4">
        <div>
          <p className="text-body text-secondary">Hi {user.name.split(" ")[0]}</p>
          <h1 id="ask" className="mt-1 text-display text-primary">
            What do you need help with?
          </h1>
        </div>
        <form action="/home/request" className="rounded-xl border border-border-strong bg-surface shadow-raised transition-shadow focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
          <label htmlFor="d" className="sr-only">
            Describe the problem
          </label>
          <textarea
            id="d"
            name="d"
            rows={3}
            required
            minLength={3}
            placeholder="Describe it in your own words — e.g. “Water is dripping from the bedroom AC”"
            className="block w-full resize-none rounded-t-xl bg-transparent px-4 pt-4 text-[1rem] leading-relaxed text-primary placeholder:text-muted focus:outline-none"
          />
          <div className="flex items-center justify-between gap-3 px-3 pb-3">
            <p className="hidden pl-1 text-meta text-muted sm:block">We&apos;ll match you with verified professionals nearby.</p>
            <Button type="submit" variant="primary" size="lg" className="ml-auto">
              Find help <ArrowRight aria-hidden />
            </Button>
          </div>
        </form>
        <nav aria-label="Popular services">
          <ul className="flex flex-wrap gap-2">
            {POPULAR.map((id) => (
              <li key={id}>
                <Link href={`/home/request?category=${id}`} className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 text-body text-primary transition-colors hover:border-border-strong hover:bg-surface-hover">
                  {CATEGORIES.find((c) => c.id === id)!.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>

      {actions > 0 && (
        <section aria-labelledby="needs-you" className="flex flex-col gap-3">
          <h2 id="needs-you" className="text-heading text-primary">
            Needs you
          </h2>
          <ul className="flex flex-col gap-2">
            {toVerify.map((w) => (
              <ActionCard key={w.id} href={`/home/work/${w.number}`} icon={<ShieldCheck />} title={`Confirm: ${w.title}`} body={`${w.assigneeName ?? w.providerName} marked the work complete. Check the photos, then confirm.`} cta="Review work" />
            ))}
            {quoted.map((r) => (
              <ActionCard key={r.id} href={`/home/requests/${r.number}`} icon={<Receipt />} title={`${r.quotes} quote${r.quotes === 1 ? "" : "s"} for “${r.title}”`} body="Compare prices and TrustScores, then book the one you want." cta="Compare quotes" />
            ))}
            {unpaid.map((i) => (
              <ActionCard key={i.id} href={`/home/work/${i.woNumber}`} icon={<Receipt />} title={`Pay ${formatMoney(i.amountMinor, i.currency)}`} body={`${invoiceNumber(i.number)} · ${i.title}`} cta="Pay invoice" />
            ))}
          </ul>
        </section>
      )}

      {(inFlight.length > 0 || waiting.length > 0) && (
        <section aria-labelledby="active" className="flex flex-col gap-3">
          <h2 id="active" className="text-heading text-primary">
            In progress
          </h2>
          <ul className="divide-y divide-border overflow-clip rounded-xl border border-border bg-surface">
            {inFlight.map((w) => (
              <Row key={w.id} href={`/home/work/${w.number}`} title={w.title} meta={w.scheduledStart ? `${w.providerName} · ${formatDateTime(w.scheduledStart)}` : `${w.providerName} · Being scheduled`} badge={<WorkOrderStatusBadge status={w.status} />} />
            ))}
            {waiting.map((r) => (
              <Row key={r.id} href={`/home/requests/${r.number}`} title={r.title} meta={`Waiting for quotes from ${r.invited} professional${r.invited === 1 ? "" : "s"}`} />
            ))}
          </ul>
        </section>
      )}

      {recent.rows.length > 0 && (
        <section aria-labelledby="recent" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 id="recent" className="text-heading text-primary">
              Your service history
            </h2>
            <Link href="/home/activity" className="text-compact font-medium text-brand-text hover:underline">
              See all
            </Link>
          </div>
          <ul className="divide-y divide-border overflow-clip rounded-xl border border-border bg-surface">
            {recent.rows.map((w) => (
              <Row key={w.id} href={`/home/work/${w.number}`} title={w.title} meta={`${w.providerName} · ${w.completedAt ? formatDate(w.completedAt) : ""}`} badge={<WorkOrderStatusBadge status={w.status} />} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ActionCard({ href, icon, title, body, cta }: { href: string; icon: ReactNode; title: string; body: string; cta: string }) {
  return (
    <li>
      <Link href={href} className="group flex items-start gap-3 rounded-xl border border-brand/25 bg-brand-subtle p-4 transition-colors hover:border-brand/50">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-brand-text [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body font-medium text-primary">{title}</span>
          <span className="mt-0.5 block text-compact text-secondary">{body}</span>
          <span className="mt-2 inline-flex items-center gap-1 text-compact font-medium text-brand-text">
            {cta} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </span>
      </Link>
    </li>
  );
}

function Row({ href, title, meta, badge }: { href: string; title: string; meta: string; badge?: ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-hover">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-medium text-primary">{title}</span>
          <span className="block truncate text-compact text-muted">{meta}</span>
        </span>
        {badge}
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  );
}
