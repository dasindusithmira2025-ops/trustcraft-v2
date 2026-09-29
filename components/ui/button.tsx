import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover shadow-raised",
  secondary: "bg-surface text-primary border border-border-strong hover:bg-surface-hover shadow-raised",
  subtle: "bg-surface-hover text-primary hover:bg-sidebar-active",
  ghost: "text-secondary hover:bg-surface-hover hover:text-primary",
  danger: "bg-danger-solid text-white hover:opacity-90 shadow-raised",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 gap-1.5 text-compact rounded-md [&_svg]:size-3.5",
  md: "h-8 px-3 gap-2 text-body rounded-md [&_svg]:size-4",
  // Touch-first surfaces (consumer, field) use lg/xl — 40px and 48px targets.
  lg: "h-10 px-4 gap-2 text-body rounded-lg [&_svg]:size-4",
  xl: "h-12 px-5 gap-2.5 text-[0.9375rem] rounded-lg [&_svg]:size-5",
};

export function buttonClass({
  variant = "secondary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium",
    "transition-[background-color,color,opacity,box-shadow] duration-150 ease-standard",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:shrink-0",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

type ButtonProps = ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; pending?: boolean };

export function Button({ variant, size, pending, className, children, disabled, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, className })}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4 animate-spin", className)} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
