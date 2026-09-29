import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ViewTabs } from "@/components/app/data-table";
import { EmptyState, Page, PageHeader, Panel } from "@/components/app/page";
import { InviteStatusBadge } from "@/components/app/status";
import { Badge } from "@/components/ui/badge";
import { categoryName, URGENCY_META } from "@/features/requests/catalog";
import { listProviderInvites } from "@/features/requests/queries";
import { formatMoney, formatRelative, srNumber } from "@/lib/format";
import { oneOf, param } from "@/lib/url";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Requests" };

const VIEWS = ["pending", "quoted", "closed"] as const;
const LABEL = { pending: "Needs quote", quoted: "Quoted", closed: "Closed" } as const;

export default async function RequestsPage({ params, searchParams }: PageProps<"/w/[org]/requests">) {
  const { org } = await params;
  const sp = await searchParams;
  const { membership: m } = await requireCapability(org, "quotes.send");
  const view = oneOf(param(sp, "view"), VIEWS, "pending");
  const all = await listProviderInvites(m.orgId);
  const bucket = (s: string) => (s === "pending" ? "pending" : s === "quoted" ? "quoted" : "closed");
  const rows = all.filter((r) => bucket(r.inviteStatus) === view);
  const now = new Date();
  const base = `/w/${m.slug}/requests`;

  return (
    <Page>
      <PageHeader title="Requests" description="Customers who asked you for a price. Quote quickly — response time is part of your TrustScore." />
      <div className="border-b border-border">
        <ViewTabs pathname={base} params={sp} views={VIEWS.map((id) => ({ id, label: LABEL[id], count: all.filter((r) => bucket(r.inviteStatus) === id).length }))} current={view} />
      </div>
      <Panel className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title={view === "pending" ? "No requests waiting" : `No ${LABEL[view].toLowerCase()} requests`}
            body={view === "pending" ? "When customers in your service areas ask for a quote, their requests arrive here." : "Requests move here as you quote on them and customers decide."}
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const urgency = URGENCY_META[r.urgency];
              return (
                <li key={r.requestId} className="relative flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-surface-hover sm:flex-row sm:items-center sm:gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-compact tabular-nums text-muted">{srNumber(r.number)}</span>
                      <Link href={`${base}/${r.number}`} className="truncate text-body font-medium text-primary after:absolute after:inset-0">
                        {r.title}
                      </Link>
                    </div>
                    <p className="mt-1 truncate text-compact text-secondary">
                      {r.requesterOrgName ?? r.requesterName} · {categoryName(r.categoryId)} · {r.address}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-compact">
                    {r.urgency !== "flexible" && <Badge tone={urgency.tone}>{urgency.label}</Badge>}
                    {r.quoteTotal !== null && <span className="tabular-nums text-primary">{formatMoney(r.quoteTotal, r.quoteCurrency!, m.locale)}</span>}
                    <InviteStatusBadge status={r.inviteStatus} />
                    <span className="w-20 text-right text-muted">{formatRelative(r.createdAt, now, m)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </Page>
  );
}
