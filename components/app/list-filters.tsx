"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";

type SelectFilter = { param: string; label: string; options: { value: string; label: string }[] };

/**
 * Search box + select filters that write to the URL, so a filtered view survives refresh,
 * back/forward and sharing. Debounced typing; `replace` so keystrokes don't flood history.
 */
export function ListFilters({ placeholder, selects = [], className, search = true }: { placeholder: string; selects?: SelectFilter[]; className?: string; search?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, startTransition] = useTransition();
  const first = useRef(true);

  const push = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => push({ q: q.trim() || null }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the query text should re-trigger the debounce
  }, [q]);

  const active = selects.filter((s) => params.get(s.param)).length + (params.get("q") ? 1 : 0);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} aria-busy={pending || undefined}>
      {search && (
      <div className="relative w-full sm:w-80">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-8 w-full rounded-md border border-border-strong bg-surface pl-8 pr-3 text-body text-primary placeholder:text-muted focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15"
        />
      </div>
      )}
      {selects.map((s) => {
        const value = params.get(s.param) ?? "";
        return (
          <label key={s.param} className="relative">
            <span className="sr-only">{s.label}</span>
            <select
              value={value}
              onChange={(e) => push({ [s.param]: e.target.value || null })}
              className={cn(
                "h-8 appearance-none rounded-md border bg-surface pl-2.5 pr-7 text-body transition-colors focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15",
                value ? "border-brand/40 bg-brand-subtle font-medium text-brand-text" : "border-border-strong text-secondary",
              )}
            >
              <option value="">{s.label}: All</option>
              {s.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {s.label}: {o.label}
                </option>
              ))}
            </select>
            <svg viewBox="0 0 16 16" className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="m4 6 4 4 4-4" />
            </svg>
          </label>
        );
      })}
      {active > 0 && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            push({ q: null, ...Object.fromEntries(selects.map((s) => [s.param, null])) });
          }}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-compact font-medium text-secondary hover:bg-surface-hover hover:text-primary"
        >
          <X className="size-3.5" aria-hidden /> Clear
        </button>
      )}
    </div>
  );
}
