"use client";

import { Check, ChevronsUpDown, Home } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuContent, MenuGroup, MenuLink, MenuSeparator, MenuTrigger } from "@/components/ui/menu";

export type SwitcherOrg = { slug: string; name: string; kind: "provider" | "enterprise"; roleLabel: string };

export function OrgSwitcher({ current, orgs }: { current: SwitcherOrg; orgs: SwitcherOrg[] }) {
  return (
    <Menu>
      <MenuTrigger className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-surface-hover data-popup-open:bg-surface-hover">
        <Avatar name={current.name} kind="org" size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-primary">{current.name}</span>
          <span className="block truncate text-meta text-muted">
            {current.kind === "provider" ? "Service" : "Operations"} · {current.roleLabel}
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden />
        <span className="sr-only">Switch workspace</span>
      </MenuTrigger>
      <MenuContent className="w-64">
        <MenuGroup label="Workspaces">
          {orgs.map((o) => (
            <MenuLink key={o.slug} href={`/w/${o.slug}`}>
              <Avatar name={o.name} kind="org" size="xs" />
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {o.slug === current.slug && <Check className="!text-brand" aria-label="Current" />}
            </MenuLink>
          ))}
        </MenuGroup>
        <MenuSeparator />
        <MenuLink href="/home">
          <Home />
          TrustCraft Home
        </MenuLink>
      </MenuContent>
    </Menu>
  );
}
