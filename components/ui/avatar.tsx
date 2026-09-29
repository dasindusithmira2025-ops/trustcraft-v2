import { initials } from "@/lib/format";
import { cn } from "@/lib/cn";

const SIZES = { xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-meta", lg: "size-10 text-compact", xl: "size-14 text-heading" };

/** People are round, organizations are square — the shape tells you which is which. */
export function Avatar({
  name,
  kind = "person",
  size = "md",
  className,
}: {
  name: string;
  kind?: "person" | "org";
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center border border-border bg-surface-muted font-semibold text-secondary",
        kind === "person" ? "rounded-full" : "rounded-md",
        SIZES[size],
        className,
      )}
    >
      {initials(name) || "?"}
    </span>
  );
}
