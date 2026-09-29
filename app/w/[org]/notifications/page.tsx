import type { Metadata } from "next";
import Link from "next/link";
import { Page, PageHeader } from "@/components/app/page";
import { NotificationCenter } from "@/features/notifications/components/notification-center";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ params, searchParams }: PageProps<"/w/[org]/notifications">) {
  const { org } = await params;
  const { user, membership: m } = await requireWorkspace(org);
  return (
    <Page width="narrow">
      <PageHeader
        title="Notifications"
        description="What needs you, and what changed."
        actions={
          <Link href={`/w/${m.slug}/settings/notifications`} className="text-compact font-medium text-brand-text hover:underline">
            Notification settings
          </Link>
        }
      />
      <NotificationCenter userId={user.id} path={`/w/${m.slug}/notifications`} params={await searchParams} now={new Date().toISOString()} />
    </Page>
  );
}
