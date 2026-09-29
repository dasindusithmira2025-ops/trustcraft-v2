import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { ConnectionBanner } from "@/features/field/components/field-status";
import { NotificationBell } from "@/components/app/shell/notification-bell";
import { UserMenu } from "@/components/app/shell/user-menu";
import { getNotifications } from "@/features/notifications/queries";
import { requireUser } from "@/lib/auth/session";

/** TrustCraft Field: one column, no sidebar, nothing between the technician and the job. */
export default async function FieldLayout({ children }: LayoutProps<"/field">) {
  const user = await requireUser();
  const notifications = await getNotifications(user.id);
  return (
    <div className="min-h-dvh bg-surface-muted">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between gap-3 px-4">
          <Link href="/field" aria-label="Today's jobs" className="rounded-md">
            <Logo suffix="Field" />
          </Link>
          <div className="flex items-center gap-1.5">
            <NotificationBell items={notifications.items} unread={notifications.unread} now={new Date().toISOString()} allHref="/field/notifications" />
            <UserMenu name={user.name} email={user.email} />
          </div>
        </div>
      </header>
      <ConnectionBanner />
      <main id="main" className="mx-auto max-w-xl px-4 pb-16 pt-5">
        {children}
      </main>
    </div>
  );
}
