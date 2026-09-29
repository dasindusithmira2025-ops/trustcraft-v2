"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Dialog, SheetContent } from "@/components/ui/dialog";

/**
 * A side drawer whose open state *is* a URL parameter. The page decides to render it (because
 * `?wo=…` is present); closing navigates to `closeHref`. So back/forward, reloading and sharing
 * the link all behave, and the page underneath keeps its place (scroll is never reset).
 */
export function UrlDrawer({ title, description, closeHref, children }: { title: ReactNode; description?: ReactNode; closeHref: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <Dialog open onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}>
      <SheetContent title={title} description={description} className="w-[min(36rem,100vw)]">
        {children}
      </SheetContent>
    </Dialog>
  );
}
