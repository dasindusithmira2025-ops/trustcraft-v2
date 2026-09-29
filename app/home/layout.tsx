import { Briefcase } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { NotificationBell } from "@/components/app/shell/notification-bell";
import { UserMenu } from "@/components/app/shell/user-menu";
import { HomeNav } from "@/features/home/home-nav";
import { getNotifications } from "@/features/notifications/queries";
import { requireUser } from "@/lib/auth/session";
import { getMemberships, homePath } from "@/lib/workspace";

export default async function HomeLayout({ children }: LayoutProps<"/home">) {
  const user = await requireUser();
  const [notifications, memberships] = await Promise.all([getNotifications(user.id), getMemberships(user.id)]);
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-4">
          <Link href="/home" aria-label="TrustCraft Home" className="rounded-md">
            <Logo />
          </Link>
          <HomeNav variant="top" />
          <div className="ml-auto flex items-center gap-1.5">
            {memberships.length > 0 && (
              <Link href={homePath(memberships)} className="hidden h-8 items-center gap-1.5 rounded-md px-2.5 text-compact font-medium text-secondary hover:bg-surface-hover hover:text-primary sm:flex">
                <Briefcase className="size-4" aria-hidden /> Work
              </Link>
            )}
            <NotificationBell items={notifications.items} unread={notifications.unread} now={new Date().toISOString()} allHref="/home/notifications" />
            <UserMenu name={user.name} email={user.email} />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 pb-28 pt-6 md:pb-16 md:pt-10">
        {children}
      </main>
      <HomeNav variant="bottom" />
    </div>
  );
}
