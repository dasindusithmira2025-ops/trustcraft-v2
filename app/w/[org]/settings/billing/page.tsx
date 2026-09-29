import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsSection } from "@/features/org/components/settings-section";
import { InvoiceDefaultsForm } from "@/features/org/components/team-forms";
import { getDb, schema as s } from "@/lib/db";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Invoicing" };

export default async function BillingSettings({ params }: PageProps<"/w/[org]/settings/billing">) {
  const { org } = await params;
  const { membership: m } = await requireCapability(org, "invoices.manage");
  if (m.kind !== "provider") notFound();
  const [row] = await (await getDb()).select().from(s.organizations).where(eq(s.organizations.id, m.orgId));
  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title="Invoice defaults" description="Applied to new quotes and invoices. You can change them on any individual document before you send it.">
        <InvoiceDefaultsForm org={m.slug} taxPercent={String(row!.taxRateBps / 100)} taxLabel={row!.taxLabel} paymentTermsDays={row!.paymentTermsDays} footer={row!.invoiceFooter ?? ""} />
      </SettingsSection>
      <SettingsSection title="TrustCraft plan">
        <p className="text-body text-secondary">
          You&apos;re on the launch plan — everything in TrustCraft is included at no charge. Paid plans will be announced well before they apply.
        </p>
      </SettingsSection>
    </div>
  );
}
