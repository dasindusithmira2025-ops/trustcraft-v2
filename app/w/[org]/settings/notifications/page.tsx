import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { SettingsSection } from "@/features/org/components/settings-section";
import { NotificationPrefsForm } from "@/features/org/components/team-forms";
import { getDb, schema as s } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Notification settings" };

export default async function NotificationSettings({ params }: PageProps<"/w/[org]/settings/notifications">) {
  const { org } = await params;
  const { user } = await requireWorkspace(org);
  const [row] = await (await getDb()).select({ prefs: s.users.notificationPrefs }).from(s.users).where(eq(s.users.id, user.id));
  return (
    <SettingsSection title="What you're told about" description="These are your own preferences and follow you across every organization you belong to.">
      <NotificationPrefsForm muted={row?.prefs ?? {}} />
    </SettingsSection>
  );
}
