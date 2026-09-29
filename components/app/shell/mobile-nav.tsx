"use client";

import { Menu as MenuIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import type { NavSection } from "@/features/workspace/navigation";
import { SidebarNav } from "./sidebar-nav";

/** Below lg the sidebar lives in a sheet; it closes itself on navigation. */
export function MobileNav({ sections, header }: { sections: NavSection[]; header: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label="Open navigation"
        className="-ml-1.5 flex size-9 items-center justify-center rounded-md text-secondary hover:bg-surface-hover lg:hidden"
      >
        <MenuIcon className="size-5" />
      </DialogTrigger>
      <SheetContent side="left" title="Navigation" className="w-[min(18rem,85vw)] bg-sidebar">
        <div className="flex flex-col gap-4 p-3">
          {header}
          <SidebarNav sections={sections} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Dialog>
  );
}
