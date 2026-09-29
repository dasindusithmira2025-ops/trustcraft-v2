import { eq, sql } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Page, PageHeader, Panel } from "@/components/app/page";
import { ComplianceBadge, complianceState } from "@/components/app/status";
import { TrustScoreSummary } from "@/components/app/trust-score";
import { categoryName } from "@/features/requests/catalog";
import { getTrustScores } from "@/features/trust/queries";
import { getDb, schema as s } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { Plus } from "lucide-react";
import { SheetForm } from "@/components/app/sheet-form";
import { ProviderPicker } from "@/features/org/components/setup-forms";
import { roleCan } from "@/lib/permissions";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Providers" };

/**
 * Approved providers compared on evidence: network TrustScore next to how they have
 * actually performed on this organization's own work, and their compliance state.
 */
export default async function ProvidersPage({ params }: PageProps<"/w/[org]/providers">) {
  const { org } = await params;
  const { membership: m } = await requireCapability(org, "providers.view");
  const db = await getDb();
  const rows = await db
    .select({
      orgId: s.organizations.id,
      slug: s.organizations.slug,
      name: s.organizations.name,
      categories: s.providerProfiles.categories,
      credentials: s.providerProfiles.credentials,
      jobs: sql<number>`(select count(*)::int from work_orders w where w.provider_org_id = ${s.organizations.id} and w.client_org_id = ${m.orgId})`,
      open: sql<number>`(select count(*)::int from work_orders w where w.provider_org_id = ${s.organizations.id} and w.client_org_id = ${m.orgId} and w.status not in ('completed','cancelled'))`,
      slaMet: sql<number>`(select count(*)::int from work_orders w where w.provider_org_id = ${s.organizations.id} and w.client_org_id = ${m.orgId} and w.completed_at <= w.sla_due_at)`,
      slaJudged: sql<number>`(select count(*)::int from work_orders w where w.provider_org_id = ${s.organizations.id} and w.client_org_id = ${m.orgId} and w.completed_at is not null and w.sla_due_at is not null)`,
      spend: sql<number>`(select coalesce(sum(i.amount_minor),0)::bigint from invoices i join work_orders w on w.id = i.work_order_id where w.provider_org_id = ${s.organizations.id} and w.client_org_id = ${m.orgId})`,
    })
    .from(s.customers)
    .innerJoin(s.organizations, eq(s.organizations.id, s.customers.providerOrgId))
    .innerJoin(s.providerProfiles, eq(s.providerProfiles.orgId, s.organizations.id))
    .where(eq(s.customers.clientOrgId, m.orgId));
  const trust = await getTrustScores(rows.map((r) => r.orgId));
  const now = new Date();
  const canApprove = roleCan(m.kind, m.role, "providers.manage");
  const network = canApprove
    ? await db
        .select({ id: s.organizations.id, name: s.organizations.name, headline: s.providerProfiles.headline, categories: s.providerProfiles.categories, verifiedAt: s.providerProfiles.verifiedAt })
        .from(s.organizations)
        .innerJoin(s.providerProfiles, eq(s.providerProfiles.orgId, s.organizations.id))
        .orderBy(s.organizations.name)
    : [];

  return (
    <Page>
      <PageHeader
        title="Providers"
        description="Approved providers for your sites, compared on verified evidence."
        actions={
          canApprove && (
            <SheetForm label="Approve providers" icon={<Plus aria-hidden />} title="Approve providers" description="Approved providers can be given work directly — no quote step.">
              <ProviderPicker
                org={m.slug}
                providers={network.map((p) => ({ id: p.id, name: p.name, headline: p.headline, categories: p.categories, verified: p.verifiedAt !== null }))}
                approved={rows.map((r) => r.orgId)}
                submit="Approve selected"
              />
            </SheetForm>
          )
        }
      />
      <Panel>
        {rows.length === 0 ? (
          <EmptyState icon={<ShieldCheck />} title="No approved providers yet" body="Providers you've worked with through TrustCraft appear here with their performance on your sites." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((p) => {
              const worst = p.credentials.map((c) => complianceState(c.expiresOn, now)).sort((a, b) => ["expired", "expiring", "valid", "no_expiry"].indexOf(a) - ["expired", "expiring", "valid", "no_expiry"].indexOf(b))[0] ?? "no_expiry";
              return (
                <li key={p.orgId} className="relative grid gap-4 px-4 py-4 hover:bg-surface-hover md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.4fr)] md:items-center">
                  <div className="min-w-0">
                    <Link href={`/pros/${p.slug}`} className="text-body font-semibold text-primary after:absolute after:inset-0">
                      {p.name}
                    </Link>
                    <p className="truncate text-compact text-muted">{p.categories.map(categoryName).join(" · ")}</p>
                    <div className="mt-2">
                      <ComplianceBadge state={worst} />
                      {worst !== "valid" && worst !== "no_expiry" && <span className="ml-2 text-meta text-muted">{worst === "expired" ? "A credential has expired" : "A credential expires within 60 days"}</span>}
                    </div>
                  </div>
                  <TrustScoreSummary trust={trust.get(p.orgId)!} />
                  <dl className="grid grid-cols-3 gap-3 text-compact">
                    <div>
                      <dt className="text-muted">Jobs for you</dt>
                      <dd className="text-body font-medium tabular-nums text-primary">
                        {p.jobs} <span className="text-compact font-normal text-muted">· {p.open} open</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Your SLA</dt>
                      <dd className="text-body font-medium tabular-nums text-primary">{p.slaJudged ? `${Math.round((p.slaMet / p.slaJudged) * 100)}%` : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Invoiced</dt>
                      <dd className="text-body font-medium tabular-nums text-primary">{formatMoney(Number(p.spend), m.currency, m.locale)}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </Page>
  );
}
