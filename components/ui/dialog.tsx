"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog as D } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

const backdrop =
  "fixed inset-0 z-50 bg-overlay transition-opacity duration-200 ease-standard data-starting-style:opacity-0 data-ending-style:opacity-0";

/** Short, focused decisions. Centered on desktop, bottom sheet on phones. */
export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <D.Portal>
      <D.Backdrop className={backdrop} />
      <D.Popup
        className={cn(
          "fixed z-50 flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden border border-border bg-surface-elevated shadow-overlay outline-none",
          "inset-x-0 bottom-0 rounded-t-xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[12vh] sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:rounded-xl",
          "transition-[translate,scale,opacity] duration-200 ease-standard data-starting-style:opacity-0 data-ending-style:opacity-0",
          "data-starting-style:translate-y-4 data-ending-style:translate-y-4 sm:data-starting-style:translate-y-0 sm:data-starting-style:scale-[0.98] sm:data-ending-style:translate-y-0 sm:data-ending-style:scale-[0.98]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <D.Title className="text-heading text-primary">{title}</D.Title>
            {description && <D.Description className="mt-0.5 text-compact text-muted">{description}</D.Description>}
          </div>
          <D.Close aria-label="Close" className="-m-1 rounded-md p-1 text-muted hover:bg-surface-hover hover:text-primary">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </D.Popup>
    </D.Portal>
  );
}

/** Inspect or edit something while keeping the page underneath in view. */
export function SheetContent({
  title,
  description,
  children,
  side = "right",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  side?: "right" | "left";
  className?: string;
}) {
  return (
    <D.Portal>
      <D.Backdrop className={backdrop} />
      <D.Popup
        className={cn(
          "fixed inset-y-0 z-50 flex w-[min(28rem,100vw)] flex-col border-border bg-surface-elevated shadow-overlay outline-none",
          "transition-transform duration-200 ease-standard",
          side === "right"
            ? "right-0 border-l data-starting-style:translate-x-full data-ending-style:translate-x-full"
            : "left-0 border-r data-starting-style:-translate-x-full data-ending-style:-translate-x-full",
          className,
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-5">
          <div className="min-w-0">
            <D.Title className="truncate text-heading text-primary">{title}</D.Title>
            {description && <D.Description className="truncate text-meta text-muted">{description}</D.Description>}
          </div>
          <D.Close aria-label="Close" className="-m-1 rounded-md p-1 text-muted hover:bg-surface-hover hover:text-primary">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </D.Popup>
    </D.Portal>
  );
}

/**
 * Confirmation for consequential actions. States exactly what will happen; the confirm
 * button carries the verb ("Cancel work order"), never a bare "OK".
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  tone = "danger",
  onConfirm,
  pending,
  open,
  onOpenChange,
  children,
}: {
  trigger?: ReactElement;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  pending?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialog.Trigger render={trigger} />}
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={backdrop} />
        <AlertDialog.Popup
          className={cn(
            "fixed left-1/2 top-[18vh] z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-border bg-surface-elevated p-5 shadow-overlay outline-none",
            "transition-[scale,opacity] duration-150 ease-standard data-starting-style:scale-[0.98] data-starting-style:opacity-0 data-ending-style:scale-[0.98] data-ending-style:opacity-0",
          )}
        >
          <AlertDialog.Title className="text-heading text-primary">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-1.5 text-body text-secondary">{description}</AlertDialog.Description>
          {children}
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Close render={<Button variant="secondary" />}>Keep it</AlertDialog.Close>
            <Button variant={tone} pending={pending} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
