"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/** A native date input that writes `?date=` to the URL — pick any day without stepping through them. */
export function DateJump({ value, param = "date", label = "Jump to date" }: { value: string; param?: string; label?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <input
      type="date"
      aria-label={label}
      value={value}
      aria-busy={pending || undefined}
      onChange={(e) => {
        if (!e.target.value) return;
        const next = new URLSearchParams(params.toString());
        next.set(param, e.target.value);
        next.delete("wo");
        start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
      }}
      className="h-8 rounded-md border border-border-strong bg-surface px-2 text-body text-primary tabular-nums focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15"
    />
  );
}
