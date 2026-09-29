import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HoursForm } from "@/features/org/components/setup-forms";
import { SettingsSection } from "@/features/org/components/settings-section";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Business hours" };

export default async function HoursSettings({ params }: PageProps<"/w/[org]/settings/hours">) {
  const { org } = await params;
  const { membership: m } = await requireCapability(org, "settings.manage");
  if (m.kind !== "provider") notFound();
  return (
    <SettingsSection title="Business hours" description={`Times are in ${m.timezone}. The dispatch board and calendar show these hours, and warn about visits booked outside them (emergencies excepted).`}>
      <HoursForm org={m.slug} hours={m.businessHours} />
    </SettingsSection>
  );
}
