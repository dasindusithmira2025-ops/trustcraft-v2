import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page, PageHeader } from "@/components/app/page";
import { listCustomerOptions } from "@/features/customers/queries";
import { PlanForm } from "@/features/recurring/components/plan-form";
import { getPlan } from "@/features/recurring/queries";
import { listAssignableTechnicians } from "@/features/work-orders/queries";
import { getDb, schema as s } from "@/lib/db";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Edit recurring service" };

export default async function EditPlanPage({ params }: PageProps<"/w/[org]/recurring/[id]/edit">) {
  const { org, id } = await params;
  const { membership: m } = await requireCapability(org, "recurring.manage");
  if (m.kind !== "provider" || !m.modules.includes("recurring") || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const detail = await getPlan(m.orgId, id);
  if (!detail || detail.plan.status === "ended") notFound();
  const p = detail.plan;
  const db = await getDb();
  const [customers, technicians, [profile]] = await Promise.all([
    listCustomerOptions(m.orgId),
    listAssignableTechnicians(m.orgId),
    db.select({ categories: s.providerProfiles.categories }).from(s.providerProfiles).where(eq(s.providerProfiles.orgId, m.orgId)),
  ]);
  const base = `/w/${m.slug}/recurring`;
  return (
    <Page width="narrow">
      <PageHeader breadcrumbs={[{ label: "Recurring work", href: base }, { label: p.title, href: `${base}/${p.id}` }, { label: "Edit" }]} title="Edit recurring service" />
      <div className="max-w-2xl">
        <PlanForm
          org={m.slug}
          customers={customers}
          technicians={technicians.map((t) => ({ id: t.id, name: t.name }))}
          categories={profile?.categories ?? []}
          cancelHref={`${base}/${p.id}`}
          locale={m.locale}
          timezone={m.timezone}
          values={{
            id: p.id, customerId: p.customerId, title: p.title, description: p.description, categoryId: p.categoryId, priority: p.priority, address: p.address, city: p.city ?? "",
            preferredUserId: p.preferredUserId ?? "", durationMinutes: p.durationMinutes, startTime: p.startTime, intervalUnit: p.intervalUnit, intervalCount: p.intervalCount,
            weekday: p.weekday, startsOn: p.startsOn, endsOn: p.endsOn ?? "", amount: p.amountMinor !== null ? String(p.amountMinor / 100) : "", checklist: p.checklist.join("\n"),
          }}
        />
      </div>
    </Page>
  );
}
