import { CircleCheck } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ActionResult } from "@/lib/forms";

/** Result of the last submit, announced to screen readers. Errors persist; success says what happened. */
export function FormStatus({ state }: { state: ActionResult }) {
  if (state.error) {
    return (
      <p role="alert" className="text-compact text-danger">
        {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-compact text-success">
        <CircleCheck className="size-3.5" aria-hidden /> {state.message}
      </p>
    );
  }
  return null;
}

/** A tile that is a real checkbox or radio underneath — keyboard and screen-reader friendly. */
export function CheckTile({ children, className, ...input }: ComponentProps<"input"> & { children: ReactNode }) {
  return (
    <label
      className={cn(
        "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-body text-primary transition-colors hover:bg-surface-hover",
        "has-checked:border-brand has-checked:bg-brand-subtle has-checked:font-medium has-checked:text-brand-text has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
        className,
      )}
    >
      <input className="sr-only" {...input} />
      {children}
    </label>
  );
}
