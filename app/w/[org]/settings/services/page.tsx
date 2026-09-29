import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { ComplianceBadge, complianceState } from "@/components/app/status";
import { CredentialForm, ServicesForm } from "@/features/org/components/setup-forms";
import { SettingsSection } from "@/features/org/components/settings-section";
import { getDb, schema as s } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesSettings({ params }: PageProps<"/w/[org]/settings/services">) {
  const { org } = await params;
  const { membership: m } = await requireCapability(org, "settings.manage");
  if (m.kind !== "provider") notFound();
  const [profile] = await (await getDb()).select().from(s.providerProfiles).where(eq(s.providerProfiles.orgId, m.orgId));
  const now = new Date();
  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title="Services you offer" description="Customers only see you for these trades. Dispatch matches technicians by their own skills, set under Members.">
        <ServicesForm org={m.slug} selected={profile?.categories ?? []} />
      </SettingsSection>
      <SettingsSection title="Credentials and verification" description={profile?.verifiedAt ? "Your business is verified. Keep credentials current — expired ones show on your public profile." : "TrustCraft reviews new credentials before showing you as verified."}>
        <div className="flex flex-col gap-5">
          {profile && profile.credentials.length > 0 && (
            <ul className="-mx-5 divide-y divide-border border-y border-border">
              {profile.credentials.map((c) => (
                <li key={c.name} className="flex items-center gap-3 px-5 py-2.5">
                  <CircleCheck className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-primary">{c.name}</span>
                    <span className="block truncate text-compact text-muted">
                      {c.issuer}
                      {c.expiresOn && ` · expires ${formatDate(c.expiresOn, { locale: m.locale, timezone: m.timezone })}`}
                    </span>
                  </span>
                  <ComplianceBadge state={complianceState(c.expiresOn, now)} />
                </li>
              ))}
            </ul>
          )}
          <CredentialForm org={m.slug} />
        </div>
      </SettingsSection>
    </div>
  );
}
