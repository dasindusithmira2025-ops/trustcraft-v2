import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-secondary",
  brand: "text-brand-text",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
};

const TONE_BG: Record<Tone, string> = {
  neutral: "bg-neutral-subtle",
  brand: "bg-brand-subtle",
  success: "bg-success-subtle",
  warning: "bg-warning-subtle",
  danger: "bg-danger-subtle",
  info: "bg-info-subtle",
};

/** Status and label chip. Always carries text; icons are supplementary, never the only signal. */
export function Badge({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-[5px] px-1.5 text-meta font-medium [&_svg]:size-3",
        TONE_BG[tone],
        TONE_TEXT[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
