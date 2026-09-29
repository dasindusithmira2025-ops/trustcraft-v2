import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServiceAreasForm } from "@/features/org/components/setup-forms";
import { SettingsSection } from "@/features/org/components/settings-section";
import { listServiceAreas } from "@/features/service-areas/queries";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Service areas" };

export default async function AreasSettings({ params }: PageProps<"/w/[org]/settings/areas">) {
  const { org } = await params;
  const { membership: m } = await requireCapability(org, "settings.manage");
  if (m.kind !== "provider") notFound();
  const areas = await listServiceAreas(m.orgId);
  return (
    <SettingsSection title="Where you work" description="Customers in these areas can find you and ask for a quote. Dispatch warns before sending a technician outside them.">
      <ServiceAreasForm org={m.slug} selected={areas.map((a) => ({ city: a.city, radiusKm: a.radiusKm }))} />
    </SettingsSection>
  );
}
