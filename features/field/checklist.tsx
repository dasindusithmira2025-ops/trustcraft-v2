"use client";

import { Check } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import type { ChecklistItem } from "@/lib/db/schema";
import { cn } from "@/lib/cn";
import { toggleChecklistItem } from "@/features/work-orders/actions";

/** Big tap targets; ticks apply instantly and roll back if the server refuses. */
export function FieldChecklist({ workOrderId, items, editable }: { workOrderId: string; items: ChecklistItem[]; editable: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(items, (state, change: { id: string; done: boolean }) => state.map((i) => (i.id === change.id ? { ...i, done: change.done } : i)));
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const done = optimistic.filter((i) => i.done).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-subtle" role="progressbar" aria-label="Checklist progress" aria-valuenow={done} aria-valuemin={0} aria-valuemax={items.length}>
          <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${(done / Math.max(items.length, 1)) * 100}%` }} />
        </div>
        <span className="text-compact font-medium tabular-nums text-secondary">
          {done}/{items.length}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {optimistic.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              disabled={!editable}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  setOptimistic({ id: item.id, done: !item.done });
                  const res = await toggleChecklistItem(workOrderId, item.id, !item.done);
                  if (res.error) setError(res.error);
                })
              }
              className={cn(
                "flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-[0.9375rem] transition-colors",
                item.done ? "border-success/30 bg-success-subtle text-secondary" : "border-border bg-surface text-primary",
                editable ? "active:scale-[0.99]" : "cursor-default",
              )}
            >
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border-2", item.done ? "border-success bg-success text-white" : "border-border-strong")} aria-hidden>
                {item.done && <Check className="size-4" strokeWidth={3} />}
              </span>
              {item.label}
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-compact text-danger">{error}</p>}
    </div>
  );
}
