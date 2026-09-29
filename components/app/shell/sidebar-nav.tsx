"use client";

import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  Inbox,
  LayoutGrid,
  MapPin,
  Receipt,
  Repeat,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  Users,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavIcon, NavSection } from "@/features/workspace/navigation";
import { cn } from "@/lib/cn";

const ICONS: Record<NavIcon, LucideIcon> = {
  overview: LayoutGrid,
  requests: Inbox,
  work: ClipboardList,
  customers: UsersRound,
  invoices: Receipt,
  team: Users,
  locations: MapPin,
  assets: Building2,
  maintenance: Wrench,
  providers: ShieldCheck,
  dispatch: Truck,
  schedule: CalendarDays,
  recurring: Repeat,
  reports: BarChart3,
  services: SlidersHorizontal,
  settings: Settings,
};

export function SidebarNav({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  // The workspace root ("Overview") is only active on exact match; everything else by prefix.
  const rootHref = sections[0]?.items[0]?.href;
  // The most specific matching item wins, so "Services" (/settings/services) doesn't also light up "Settings".
  const hrefs = sections.flatMap((sec) => sec.items.map((i) => i.href));
  const matches = (href: string) => (href === rootHref ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  const best = hrefs.filter(matches).sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === best;

  return (
    <nav aria-label="Workspace" className="flex flex-col gap-5">
      {sections.map((section, i) => (
        <div key={section.label ?? i} className="flex flex-col gap-px">
          {section.label && <p className="px-2 pb-1 text-meta font-medium text-muted">{section.label}</p>}
          {section.items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex h-8 items-center gap-2.5 rounded-md px-2 text-body transition-colors duration-100",
                  active ? "bg-sidebar-active font-medium text-primary" : "text-secondary hover:bg-surface-hover hover:text-primary",
                )}
              >
                <Icon className={cn("size-4 shrink-0", active ? "text-brand" : "text-muted group-hover:text-secondary")} aria-hidden />
                <span className="truncate">{item.label}</span>
                {item.badge !== undefined && (
                  <span className="ml-auto min-w-5 rounded-full bg-brand-subtle px-1.5 text-center text-meta font-semibold tabular-nums text-brand-text">
                    {item.badge}
                    <span className="sr-only"> need attention</span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
