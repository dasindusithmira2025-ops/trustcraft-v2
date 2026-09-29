import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ComplianceBadge, complianceState } from "@/components/app/status";
import { DetailList } from "@/components/app/page";
import { TrustScorePanel } from "@/components/app/trust-score";
import { Badge } from "@/components/ui/badge";
import { VerificationForm } from "@/features/admin/components/admin-ui";
import { adminOrganization } from "@/features/admin/queries";
import { categoryName } from "@/features/requests/catalog";
import { getTrustScore } from "@/features/trust/queries";
import { requireAdmin } from "@/lib/auth/session";
import { DEFAULT_LOCALE, formatDate, formatDateTime } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/permissions";
import type { Role } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Organization" };

export default async function AdminOrganizationPage({ params }: PageProps<"/admin/organizations/[slug]">) {
  await requireAdmin();
  const { slug } = await params;
  const o = await adminOrganization(slug);
  if (!o) notFound();
  const isProvider = o.kind === "provider";
  const trust = isProvider ? await getTrustScore(o.id) : null;
  const now = new Date();
  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <div>
        <Link href="/admin/organizations" className="text-compact text-muted hover:text-primary">
          ← Organizations
        </Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-title text-primary">
          {o.name}
          {isProvider && (o.verifiedAt ? <Badge tone="success">Verified</Badge> : <Badge>Not verified</Badge>)}
        </h1>
        <p className="text-compact text-muted">/{o.slug}</p>
      </div>
      <DetailList
        items={[
          { label: "Kind", value: <span className="capitalize">{isProvider ? `Provider · ${o.segment ?? "—"}` : `Enterprise · ${o.orgType ?? "—"}`}</span> },
          { label: "Modules", value: o.modules.length ? o.modules.join(", ") : <span className="text-muted">None</span> },
          { label: "Timezone", value: `${o.timezone} · ${o.currency}` },
          { label: "Created", value: formatDate(o.createdAt, DEFAULT_LOCALE) },
          { label: "Work", value: `${o.openWork} open · ${o.doneWork} completed` },
          ...(isProvider ? [{ label: "Services", value: o.categories.map(categoryName).join(", ") || "—" }, { label: "Areas", value: o.areas.join(", ") || "—" }] : []),
        ]}
      />
      <section aria-labelledby="members">
        <h2 id="members" className="mb-2 text-heading text-primary">
          Members
        </h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {o.members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <Link href={`/admin/users/${m.id}`} className="min-w-0 truncate text-body text-primary hover:underline">
                {m.name} <span className="text-compact text-muted">{m.email}</span>
              </Link>
              <span className="shrink-0 text-compact text-muted">{ROLE_LABEL[m.role as Role]}</span>
            </li>
          ))}
        </ul>
      </section>

      {isProvider && trust && (
        <section aria-labelledby="trust" className="flex flex-col gap-3">
          <h2 id="trust" className="text-heading text-primary">
            TrustScore inspection
          </h2>
          <p className="text-compact text-muted">The exact breakdown a customer or enterprise would see — every number traces to verified jobs and reviews.</p>
          <TrustScorePanel trust={trust} audience="enterprise" />
        </section>
      )}

      {isProvider && (
        <section aria-labelledby="creds" className="flex flex-col gap-3">
          <h2 id="creds" className="text-heading text-primary">
            Credentials and verification
          </h2>
          {o.credentials.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {o.credentials.map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-body text-primary">{c.name}</span>
                    <span className="block truncate text-compact text-muted">
                      {c.issuer}
                      {c.expiresOn ? ` · expires ${c.expiresOn}` : ""}
                    </span>
                  </span>
                  <ComplianceBadge state={complianceState(c.expiresOn, now)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-muted">No credentials submitted.</p>
          )}
          <VerificationForm slug={o.slug} verified={o.verifiedAt !== null} />
        </section>
      )}

      <section aria-labelledby="audit">
        <h2 id="audit" className="mb-2 text-heading text-primary">
          Recent activity
        </h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {o.audit.map((a, i) => (
            <li key={i} className="px-4 py-2.5 text-body">
              <p className="text-primary">{a.summary}</p>
              <p className="text-meta text-muted">
                {a.email ?? "System"} · {formatDateTime(a.at, DEFAULT_LOCALE)}
              </p>
            </li>
          ))}
          {o.audit.length === 0 && <li className="px-4 py-6 text-center text-body text-muted">Nothing recorded.</li>}
        </ul>
      </section>
    </div>
  );
}
