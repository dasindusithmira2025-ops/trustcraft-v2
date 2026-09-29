import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page, PageHeader } from "@/components/app/page";
import { listCustomerOptions } from "@/features/customers/queries";
import { PlanForm } from "@/features/recurring/components/plan-form";
import { listAssignableTechnicians } from "@/features/work-orders/queries";
import { getDb, schema as s } from "@/lib/db";
import { dayKey } from "@/lib/format";
import { param } from "@/lib/url";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "New recurring service" };

export default async function NewPlanPage({ params, searchParams }: PageProps<"/w/[org]/recurring/new">) {
  const { org } = await params;
  const sp = await searchParams;
  const { membership: m } = await requireCapability(org, "recurring.manage");
  if (m.kind !== "provider" || !m.modules.includes("recurring")) notFound();
  const db = await getDb();
  const [customers, technicians, [profile]] = await Promise.all([
    listCustomerOptions(m.orgId),
    listAssignableTechnicians(m.orgId),
    db.select({ categories: s.providerProfiles.categories }).from(s.providerProfiles).where(eq(s.providerProfiles.orgId, m.orgId)),
  ]);
  const customerId = customers.find((c) => c.id === param(sp, "customer"))?.id ?? "";
  const base = `/w/${m.slug}/recurring`;
  return (
    <Page width="narrow">
      <PageHeader breadcrumbs={[{ label: "Recurring work", href: base }, { label: "New" }]} title="Create recurring service" description="Set it up once. TrustCraft creates each visit as a work order a couple of weeks ahead and puts it in dispatch." />
      <div className="max-w-2xl">
        <PlanForm
          org={m.slug}
          customers={customers}
          technicians={technicians.map((t) => ({ id: t.id, name: t.name }))}
          categories={profile?.categories ?? []}
          cancelHref={base}
          locale={m.locale}
          timezone={m.timezone}
          values={{ customerId, title: "", description: "", categoryId: "", priority: "normal", address: customers.find((c) => c.id === customerId)?.address ?? "", city: "", preferredUserId: "", durationMinutes: 120, startTime: "09:00", intervalUnit: "month", intervalCount: 3, weekday: null, startsOn: dayKey(new Date(), m.timezone), endsOn: "", amount: "", checklist: "" }}
        />
      </div>
    </Page>
  );
}
