"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { newOpId } from "@/features/media/upload-client";
import type { ActionResult } from "@/lib/forms";
import { addPart, removePart } from "../actions";

export type Part = { id: string; description: string; quantity: number };

/** What was used on the job. Adding is one line and one tap; each entry is retry-safe. */
export function PartsUsed({ workOrderId, parts, editable }: { workOrderId: string; parts: Part[]; editable: boolean }) {
  const [opId, setOpId] = useState(newOpId);
  const [state, action, pending] = useActionState<ActionResult, FormData>(async (prev, form) => {
    const result = await addPart(prev, form);
    if (result.ok) setOpId(newOpId());
    return result;
  }, {});
  const [removing, startRemove] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {parts.length > 0 && (
        <ul className="divide-y divide-border overflow-clip rounded-xl border border-border bg-surface">
          {parts.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-10 text-body tabular-nums text-muted">{p.quantity} ×</span>
              <span className="min-w-0 flex-1 truncate text-body text-primary">{p.description}</span>
              {editable && (
                <button type="button" disabled={removing} aria-label={`Remove ${p.description}`} onClick={() => startRemove(async () => void (await removePart(workOrderId, p.id)))} className="rounded-md p-2 text-muted hover:bg-surface-hover hover:text-danger">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <form action={action} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-end gap-2">
          <input type="hidden" name="workOrderId" value={workOrderId} />
          <input type="hidden" name="clientOpId" value={opId} />
          <Field id="quantity" label="Qty">
            <Input id="quantity" name="quantity" type="number" min={1} max={999} defaultValue={1} inputMode="numeric" className="h-11 text-center" />
          </Field>
          <Field id="part" label="Part or material" error={state.fieldErrors?.description}>
            <Input id="part" name="description" required maxLength={120} placeholder="e.g. 63A RCCB" className="h-11" />
          </Field>
          <Button type="submit" size="lg" variant="secondary" pending={pending} className="mb-px">
            Add
          </Button>
        </form>
      )}
      {parts.length === 0 && !editable && <p className="text-compact text-muted">No parts recorded.</p>}
    </div>
  );
}
