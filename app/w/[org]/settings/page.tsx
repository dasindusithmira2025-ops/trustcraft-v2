import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GeneralForm } from "@/features/org/components/setup-forms";
import { ModulesForm } from "@/features/org/components/team-forms";
import { SettingsSection } from "@/features/org/components/settings-section";
import { getDb, schema as s } from "@/lib/db";
import { roleCan } from "@/lib/permissions";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Settings" };

export default async function GeneralSettings({ params }: PageProps<"/w/[org]/settings">) {
  const { org } = await params;
  const { membership: m } = await requireWorkspace(org);
  // Everyone reaches Settings; only people who can change the organization see its details.
  if (!roleCan(m.kind, m.role, "settings.manage")) redirect(`/w/${m.slug}/settings/notifications`);
  const db = await getDb();
  const [row] = await db.select().from(s.organizations).where(eq(s.organizations.id, m.orgId));
  const [profile] = m.kind === "provider" ? await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.orgId, m.orgId)) : [];

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title="Organization" description={m.kind === "provider" ? "How you appear to customers and on your public profile." : "The details your providers see."}>
        <GeneralForm
          org={m.slug}
          isProvider={m.kind === "provider"}
          values={{ name: row!.name, phone: row!.phone ?? "", email: row!.email ?? "", address: row!.address ?? "", timezone: row!.timezone, headline: profile?.headline ?? "", about: profile?.about ?? "" }}
        />
      </SettingsSection>
      {m.kind === "provider" && (
        <SettingsSection title="Workspace tools" description="TrustCraft starts small and grows with you. Switch tools on when you need them.">
          <ModulesForm org={m.slug} enabled={m.modules} segment={m.segment ?? "team"} />
        </SettingsSection>
      )}
      <p className="text-compact text-muted">
        Currency is {row!.currency} and can&apos;t be changed once you have work on record. Public profile: <a className="text-brand-text underline underline-offset-2" href={`/pros/${m.slug}`}>/pros/{m.slug}</a>
      </p>
    </div>
  );
}
