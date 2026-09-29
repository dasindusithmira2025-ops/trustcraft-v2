"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { UrlDrawer } from "./url-drawer";

const QUERY = "(min-width: 1280px)";
const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

/**
 * The open record beside its list on wide screens, and the same content in a side drawer on
 * narrower ones. Either way the record is a URL parameter, so back, forward and reload just work.
 */
export function SplitPane({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  const wide = useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
  if (!wide) {
    return (
      <UrlDrawer title={title} closeHref={closeHref}>
        {children}
      </UrlDrawer>
    );
  }
  return (
    <aside aria-label={title} className="sticky top-[4.5rem] max-h-[calc(100dvh-5.5rem)] overflow-y-auto rounded-lg border border-border bg-surface">
      <div className="sticky top-0 z-10 flex h-10 items-center justify-between border-b border-border bg-surface px-4">
        <span className="text-compact font-medium text-secondary">{title}</span>
        <Link href={closeHref} scroll={false} aria-label="Close" className="-mr-1.5 rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-primary">
          <X className="size-4" aria-hidden />
        </Link>
      </div>
      {children}
    </aside>
  );
}
