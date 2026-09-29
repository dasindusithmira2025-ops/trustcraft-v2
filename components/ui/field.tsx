import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-md border border-border-strong bg-surface text-body text-primary placeholder:text-muted " +
  "transition-[border-color,box-shadow] duration-150 " +
  "hover:border-muted focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 " +
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted " +
  "aria-invalid:border-danger aria-invalid:focus:ring-danger/15";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-9 px-3", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 px-3 py-2 leading-relaxed", className)} {...props} />;
}

/** Native select — keyboard, mobile pickers and autofill for free. The chevron is a real CSS class (globals.css). */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "select-chevron h-9 appearance-none bg-no-repeat pl-3 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-compact font-medium text-primary", className)} {...props} />;
}

type FieldProps = {
  id: string;
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
};

/**
 * Label + control + hint/error, wired for screen readers. The control must use the
 * same `id`, and `aria-describedby={`${id}-desc`}` when a hint or error is shown.
 */
export function Field({ id, label, children, hint, error, optional, className }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {optional && <span className="ml-1 font-normal text-muted">(optional)</span>}
      </Label>
      {children}
      {(error || hint) && (
        <p id={`${id}-desc`} className={cn("text-meta", error ? "text-danger" : "text-muted")} role={error ? "alert" : undefined}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/** Props that connect a control to its Field's hint/error. */
export const describedBy = (id: string, error?: string, hint?: boolean) => ({
  id,
  name: id,
  "aria-invalid": error ? true : undefined,
  "aria-describedby": error || hint ? `${id}-desc` : undefined,
});
