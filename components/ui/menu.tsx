"use client";

import { Menu as M } from "@base-ui/react/menu";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export const popupSurface =
  "rounded-lg border border-border bg-surface-elevated shadow-overlay outline-none " +
  "origin-[var(--transform-origin)] transition-[scale,opacity] duration-150 ease-standard " +
  "data-starting-style:scale-[0.97] data-starting-style:opacity-0 data-ending-style:scale-[0.97] data-ending-style:opacity-0";

export function MenuContent({
  children,
  align = "start",
  side = "bottom",
  className,
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <M.Portal>
      <M.Positioner sideOffset={6} align={align} side={side} className="z-50 outline-none">
        <M.Popup className={cn(popupSurface, "min-w-48 p-1", className)}>{children}</M.Popup>
      </M.Positioner>
    </M.Portal>
  );
}

const itemClass =
  "flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 text-body text-primary outline-none " +
  "data-highlighted:bg-surface-hover data-disabled:text-muted [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted";

export function MenuItem({ className, ...props }: ComponentProps<typeof M.Item>) {
  return <M.Item className={cn(itemClass, className)} {...props} />;
}

export function MenuLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <M.LinkItem className={cn(itemClass, className)} render={<Link href={href} />}>
      {children}
    </M.LinkItem>
  );
}

export function MenuSeparator() {
  return <M.Separator className="-mx-1 my-1 h-px bg-border" />;
}

export function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <M.Group>
      <M.GroupLabel className="px-2 pb-1 pt-1.5 text-meta font-medium text-muted">{label}</M.GroupLabel>
      {children}
    </M.Group>
  );
}

export const MenuRadioGroup = M.RadioGroup;

export function MenuRadioItem({ className, children, ...props }: ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem className={cn(itemClass, "pr-8", className)} {...props}>
      {children}
      <M.RadioItemIndicator className="ml-auto size-1.5 rounded-full bg-brand" />
    </M.RadioItem>
  );
}
