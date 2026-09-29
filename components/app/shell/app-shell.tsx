import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { NavSection } from "@/features/workspace/navigation";
import type { NotificationItem } from "@/features/notifications/queries";
import { CommandMenu, type Command } from "./command-menu";
import { MobileNav } from "./mobile-nav";
import { NotificationBell } from "./notification-bell";
import { OrgSwitcher, type SwitcherOrg } from "./org-switcher";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

type Props = {
  current: SwitcherOrg;
  orgs: SwitcherOrg[];
  sections: NavSection[];
  commands: Command[];
  searchPlaceholder: string;
  user: { name: string; email: string };
  notifications: { items: NotificationItem[]; unread: number };
  footerLink?: { label: string; href: string };
  now: string;
  children: ReactNode;
};

export function AppShell({ current, orgs, sections, commands, searchPlaceholder, user, notifications, footerLink, now, children }: Props) {
  const switcher = <OrgSwitcher current={current} orgs={orgs} />;
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only z-50 rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="p-2.5">{switcher}</div>
        <div className="flex-1 overflow-y-auto px-2.5 pb-4 pt-2">
          <SidebarNav sections={sections} />
        </div>
        {footerLink && (
          <div className="border-t border-border p-2.5">
            <Link
              href={footerLink.href}
              className="flex h-8 items-center gap-2 rounded-md px-2 text-compact text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
            >
              <ExternalLink className="size-3.5 text-muted" aria-hidden />
              {footerLink.label}
            </Link>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:px-6">
          <MobileNav sections={sections} header={switcher} />
          <div className="min-w-0 flex-1">
            <CommandMenu org={current.slug} commands={commands} placeholder={searchPlaceholder} />
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationBell items={notifications.items} unread={notifications.unread} now={now} allHref={`/w/${current.slug}/notifications`} />
            <UserMenu name={user.name} email={user.email} />
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
