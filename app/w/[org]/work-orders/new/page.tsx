import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page, PageHeader } from "@/components/app/page";
import { NewWorkOrderForm } from "@/features/work-orders/components/new-work-order-form";
import { getDb, schema as s } from "@/lib/db";
import { param } from "@/lib/url";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "New work order" };

export default async function NewWorkOrderPage({ params, searchParams }: PageProps<"/w/[org]/work-orders/new">) {
  const { org } = await params;
  const sp = await searchParams;
  const { membership: m } = await requireCapability(org, "work.create");
  if (m.kind !== "provider") notFound();
  const db = await getDb();
  const [customers, [profile]] = await Promise.all([
    db.select({ id: s.customers.id, name: s.customers.name, address: s.customers.address }).from(s.customers).where(eq(s.customers.providerOrgId, m.orgId)).orderBy(asc(s.customers.name)),
    db.select({ categories: s.providerProfiles.categories }).from(s.providerProfiles).where(eq(s.providerProfiles.orgId, m.orgId)),
  ]);
  const base = `/w/${m.slug}/work-orders`;
  return (
    <Page width="narrow">
      <PageHeader breadcrumbs={[{ label: "Work orders", href: base }, { label: "New" }]} title="Create work order" description="For customers who call or message you directly. Assign a technician once it's created." />
      <div className="max-w-2xl">
        <NewWorkOrderForm org={m.slug} customers={customers} categories={profile?.categories ?? []} cancelHref={base} initialCustomerId={customers.find((c) => c.id === param(sp, "customer"))?.id} initialAddress={param(sp, "address")} />
      </div>
    </Page>
  );
}
