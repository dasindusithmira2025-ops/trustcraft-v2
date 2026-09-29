import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6 shrink-0", className)} aria-hidden>
      <rect width="24" height="24" rx="6" className="fill-brand" />
      <path d="M7 8.5h10M12 8.5V17" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M14.6 14.4l1.6 1.6 3-3.2" stroke="white" strokeOpacity=".72" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Logo({ className, suffix }: { className?: string; suffix?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-primary">
        TrustCraft{suffix && <span className="font-medium text-muted"> {suffix}</span>}
      </span>
    </span>
  );
}
