"use client";

import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, Building2, ClipboardList, CornerDownLeft, MapPin, Plus, Search, ShieldCheck, UsersRound, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

export type SearchResult = {
  type: "work_order" | "customer" | "asset" | "location" | "provider";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};
export type Command = { label: string; href: string; kind: "navigate" | "create" };

const TYPE_META: Record<SearchResult["type"], { label: string; icon: LucideIcon }> = {
  work_order: { label: "Work orders", icon: ClipboardList },
  customer: { label: "Customers", icon: UsersRound },
  asset: { label: "Assets", icon: Building2 },
  location: { label: "Locations", icon: MapPin },
  provider: { label: "Providers", icon: ShieldCheck },
};

type Row = { key: string; group: string; label: string; detail?: string; href: string; icon: LucideIcon };

/**
 * Ctrl/Cmd+K. Searches only what the current member may see (the API enforces it)
 * and offers the handful of commands their role can actually perform.
 */
export function CommandMenu({ org, commands, placeholder }: { org: string; commands: Command[]; placeholder: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?org=${encodeURIComponent(org)}&q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (res.ok) setResults((await res.json()).results);
      } catch {
        // Aborted by the next keystroke, or offline — keep the previous results.
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, org]);

  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cmdRows = commands
      .filter((c) => !q || c.label.toLowerCase().includes(q))
      .map((c) => ({ key: c.href + c.label, group: c.kind === "create" ? "Create" : "Go to", label: c.label, href: c.href, icon: c.kind === "create" ? Plus : ArrowRight }));
    const found = q.length >= 2 ? results.map((r) => ({ key: r.type + r.id, group: TYPE_META[r.type].label, label: r.title, detail: r.subtitle, href: r.href, icon: TYPE_META[r.type].icon })) : [];
    return [...found, ...cmdRows];
  }, [commands, results, query]);

  const go = (row: Row | undefined) => {
    if (!row) return;
    setOpen(false);
    router.push(row.href);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setResults([]);
      setActive(0);
    }
  };

  let lastGroup = "";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger className="flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-border bg-surface-muted px-2.5 text-body text-muted transition-colors hover:border-border-strong hover:bg-surface">
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{placeholder}</span>
        <kbd className="ml-auto hidden rounded border border-border bg-surface px-1.5 font-sans text-meta text-muted sm:inline">Ctrl K</kbd>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-overlay transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0" />
        <Dialog.Popup
          aria-label="Search and commands"
          className="fixed left-1/2 top-[10vh] z-50 flex max-h-[70dvh] w-[min(40rem,calc(100vw-1rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-overlay outline-none transition-[scale,opacity] duration-150 ease-standard data-starting-style:scale-[0.98] data-starting-style:opacity-0 data-ending-style:scale-[0.98] data-ending-style:opacity-0"
        >
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-muted" aria-hidden />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={rows[active] ? `${listId}-${active}` : undefined}
              aria-autocomplete="list"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
                if (e.target.value.trim().length < 2) setResults([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, rows.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(rows[active]);
                }
              }}
              placeholder={placeholder}
              className="h-12 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-primary outline-none placeholder:text-muted"
            />
            {loading && <span className="text-meta text-muted">Searching…</span>}
          </div>
          <ul id={listId} role="listbox" aria-label="Results" className="overflow-y-auto p-1.5">
            {rows.length === 0 && (
              <li className="px-3 py-8 text-center text-body text-muted">
                {query.trim().length >= 2 && !loading ? `Nothing matches “${query.trim()}”.` : "Type to search."}
              </li>
            )}
            {rows.map((row, i) => {
              const header = row.group !== lastGroup ? row.group : null;
              lastGroup = row.group;
              const Icon = row.icon;
              return (
                <li key={row.key} role="presentation">
                  {header && <p className="px-2.5 pb-1 pt-2.5 text-meta font-medium text-muted">{header}</p>}
                  <div
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(row)}
                    className={cn("flex h-10 cursor-default items-center gap-3 rounded-md px-2.5", i === active && "bg-surface-hover")}
                  >
                    <Icon className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-body text-primary">
                      {row.label}
                      {row.detail && <span className="ml-2 text-compact text-muted">{row.detail}</span>}
                    </span>
                    {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-muted" aria-hidden />}
                  </div>
                </li>
              );
            })}
          </ul>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
