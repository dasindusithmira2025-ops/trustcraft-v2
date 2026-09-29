"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { SettingsSection } from "../sections";

/** Section list: a vertical rail on desktop, a scrolling tab strip on phones. */
export function SettingsNav({ sections }: { sections: SettingsSection[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 lg:flex-col lg:gap-px">
        {sections.map((s) => {
          const active = !s.external && (s.id === "general" ? pathname === s.href : pathname === s.href || pathname.startsWith(`${s.href}/`));
          return (
            <li key={s.id} className="shrink-0">
              <Link
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-body transition-colors",
                  active ? "bg-sidebar-active font-medium text-primary" : "text-secondary hover:bg-surface-hover hover:text-primary",
                )}
              >
                {s.label}
                {s.external && <ArrowUpRight className="size-3.5 text-muted" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
