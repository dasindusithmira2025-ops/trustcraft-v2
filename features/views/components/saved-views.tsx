"use client";

import { Popover } from "@base-ui/react/popover";
import { Bookmark, Columns3, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { FormStatus } from "@/components/app/form-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { popupSurface } from "@/components/ui/menu";
import type { ActionResult } from "@/lib/forms";
import { cn } from "@/lib/cn";
import { deleteView, saveView } from "../actions";
import type { ViewScope } from "../keys";

type View = { id: string; name: string; query: string; shared: boolean; mine: boolean };

/**
 * Your saved views as chips: one click restores the filters, sort and columns. A view is just a
 * bookmarked URL, so the address bar stays the source of truth. "Save view" appears once the
 * current view differs from every saved one.
 */
export function SavedViews({ org, scope, views, current }: { org: string; scope: ViewScope; views: View[]; current: string }) {
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const active = views.find((v) => v.query === current);
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Saved views">
      {views.length > 0 && (
        <nav aria-label="Saved views" className="flex flex-wrap items-center gap-1.5">
          <Bookmark className="size-3.5 text-muted" aria-hidden />
          {views.map((v) => (
            <span key={v.id} className={cn("group inline-flex h-7 items-center rounded-md border text-compact", v.query === current ? "border-brand/40 bg-brand-subtle font-medium text-brand-text" : "border-border bg-surface text-secondary hover:text-primary")}>
              <Link href={v.query ? `${pathname}?${v.query}` : pathname} scroll={false} aria-current={v.query === current ? "true" : undefined} className="rounded-l-md px-2.5 leading-7">
                {v.name}
              </Link>
              {v.mine && (
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Delete view ${v.name}`}
                  onClick={() => start(async () => void (await deleteView(org, v.id)))}
                  className="flex size-7 items-center justify-center rounded-r-md text-muted opacity-0 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="size-3" aria-hidden />
                </button>
              )}
            </span>
          ))}
        </nav>
      )}
      {current && !active && <SaveViewPopover org={org} scope={scope} query={current} />}
    </div>
  );
}

function SaveViewPopover({ org, scope, query }: { org: string; scope: ViewScope; query: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult, FormData>(async (prev, form) => {
    const result = await saveView(prev, form);
    if (result.ok) setOpen(false);
    return result;
  }, {});
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="inline-flex h-7 items-center gap-1.5 rounded-md border border-dashed border-border-strong px-2.5 text-compact font-medium text-secondary hover:border-brand hover:text-brand-text">
        <Plus className="size-3.5" aria-hidden /> Save view
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start" className="z-50">
          <Popover.Popup className={cn(popupSurface, "w-72 p-3")}>
            <Popover.Title className="text-compact font-medium text-primary">Save this view</Popover.Title>
            <p className="mt-0.5 text-meta text-muted">Your current filters, sort and columns — just for you.</p>
            <form action={action} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="org" value={org} />
              <input type="hidden" name="scope" value={scope} />
              <input type="hidden" name="query" value={query} />
              <Input name="name" aria-label="View name" placeholder="e.g. Unassigned in Kandy" maxLength={40} required autoFocus className="h-8" />
              {state.fieldErrors?.name && (
                <p role="alert" className="text-meta text-danger">
                  {state.fieldErrors.name}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" variant="primary" pending={pending}>
                  Save
                </Button>
                <FormStatus state={state} />
              </div>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Choose which columns a table shows. Hidden columns live in `?hide=` so they travel with saved views. */
export function ColumnPicker({ columns, hidden }: { columns: { key: string; label: string }[]; hidden: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toggle = (key: string, show: boolean) => {
    const next = new Set(hidden);
    if (show) next.delete(key);
    else next.add(key);
    const q = new URLSearchParams(params.toString());
    if (next.size) q.set("hide", [...next].join(","));
    else q.delete("hide");
    router.replace(q.toString() ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  return (
    <Popover.Root>
      <Popover.Trigger className="hidden h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 text-body text-secondary shadow-raised hover:bg-surface-hover hover:text-primary md:inline-flex">
        <Columns3 className="size-4" aria-hidden /> Columns
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end" className="z-50">
          <Popover.Popup className={cn(popupSurface, "w-56 p-2")}>
            <Popover.Title className="px-2 pb-1 pt-1 text-meta font-medium text-muted">Show columns</Popover.Title>
            <ul>
              {columns.map((c) => (
                <li key={c.key}>
                  <label className="flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-body text-primary hover:bg-surface-hover">
                    <input type="checkbox" checked={!hidden.includes(c.key)} onChange={(e) => toggle(c.key, e.target.checked)} className="size-4 accent-brand" />
                    {c.label}
                  </label>
                </li>
              ))}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
