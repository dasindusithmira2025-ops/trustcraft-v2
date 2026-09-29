"use client";

import { Clock, House, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS: { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean }[] = [
  { href: "/home", label: "Home", icon: House, match: (p) => p === "/home" || p.startsWith("/home/request") && !p.startsWith("/home/requests") },
  { href: "/home/activity", label: "Activity", icon: Clock, match: (p) => p.startsWith("/home/activity") || p.startsWith("/home/requests") || p.startsWith("/home/work") },
  { href: "/home/pros", label: "Professionals", icon: ShieldCheck, match: (p) => p.startsWith("/home/pros") },
];

/** Consumer navigation: inline links on wide screens, a bottom bar on phones. */
export function HomeNav({ variant }: { variant: "top" | "bottom" }) {
  const pathname = usePathname();
  if (variant === "top") {
    return (
      <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
        {ITEMS.map((i) => {
          const active = i.match(pathname);
          return (
            <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 text-body transition-colors", active ? "bg-surface-hover font-medium text-primary" : "text-secondary hover:text-primary")}>
              {i.label}
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-3">
        {ITEMS.map((i) => {
          const active = i.match(pathname);
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={active ? "page" : undefined} className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-brand-text" : "text-muted")}>
                <i.icon className="size-5" aria-hidden />
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
