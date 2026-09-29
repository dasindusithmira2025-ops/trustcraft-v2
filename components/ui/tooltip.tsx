"use client";

import { Tooltip as T } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

export const TooltipProvider = T.Provider;

/** Names icon-only controls for sighted users; the control itself still needs aria-label. */
export function Tooltip({ label, children, side = "bottom" }: { label: ReactNode; children: ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root>
      <T.Trigger render={children} />
      <T.Portal>
        <T.Positioner side={side} sideOffset={6} className="z-50">
          <T.Popup className="rounded-md bg-primary px-2 py-1 text-meta font-medium text-inverse shadow-overlay transition-opacity duration-100 data-starting-style:opacity-0 data-ending-style:opacity-0 dark:bg-surface-hover dark:text-primary">
            {label}
          </T.Popup>
        </T.Positioner>
      </T.Portal>
    </T.Root>
  );
}
