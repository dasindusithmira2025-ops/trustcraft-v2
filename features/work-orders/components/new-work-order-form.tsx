"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { PRIORITY } from "@/components/app/status";
import { Button, buttonClass } from "@/components/ui/button";
import { describedBy, Field, Input, Select, Textarea } from "@/components/ui/field";
import { CATEGORIES } from "@/features/requests/catalog";
import { cn } from "@/lib/cn";
import { createWorkOrder, type ActionResult } from "../actions";
import { SLA_HOURS } from "../lifecycle";

type Customer = { id: string; name: string; address: string | null };

/** Phone-in or repeat-customer work, created directly by dispatch. Priority sets the SLA. */
export function NewWorkOrderForm({ org, customers, categories, cancelHref, initialCustomerId, initialAddress }: { org: string; customers: Customer[]; categories: string[]; cancelHref: string; initialCustomerId?: string; initialAddress?: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(createWorkOrder, {});
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [priority, setPriority] = useState<keyof typeof PRIORITY>("normal");
  const err = state.fieldErrors ?? {};
  const customer = customers.find((c) => c.id === customerId);

  return (
    <form action={action} className="flex flex-col gap-8">
      <input type="hidden" name="org" value={org} />
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-heading text-primary">Customer and place</legend>
        <Field id="customerId" label="Customer" error={err.customerId}>
          <Select {...describedBy("customerId", err.customerId)} value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            <option value="" disabled>
              Choose a customer…
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="address" label="Address" optional hint={customer?.address ? `Leave blank to use ${customer.address}` : "Where the work happens"} error={err.address}>
          <Input {...describedBy("address", err.address, true)} autoComplete="street-address" maxLength={300} defaultValue={initialAddress} />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-heading text-primary">The job</legend>
        <Field id="title" label="Title" error={err.title}>
          <Input {...describedBy("title", err.title)} required minLength={4} maxLength={120} placeholder="e.g. AC not cooling — living room" />
        </Field>
        <Field id="description" label="What the customer reported" optional>
          <Textarea id="description" name="description" maxLength={2000} />
        </Field>
        <Field id="categoryId" label="Category" error={err.categoryId}>
          <Select {...describedBy("categoryId", err.categoryId)} defaultValue={categories[0]} required>
            {CATEGORIES.filter((c) => categories.includes(c.id)).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset>
          <legend className="text-compact font-medium text-primary">Priority</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["low", "normal", "high", "critical"] as const).map((p) => (
              <label key={p} className={cn("flex cursor-pointer flex-col rounded-lg border p-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-focus", priority === p ? "border-brand bg-brand-subtle" : "border-border hover:bg-surface-hover")}>
                <input type="radio" name="priority" value={p} checked={priority === p} onChange={() => setPriority(p)} className="sr-only" />
                <span className={cn("text-body font-medium", PRIORITY[p].className)}>{PRIORITY[p].label}</span>
                <span className="text-meta text-muted">SLA {SLA_HOURS[p] < 24 ? `${SLA_HOURS[p]} h` : `${SLA_HOURS[p] / 24} days`}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field id="amount" label="Agreed price" optional hint="Leave blank if it will be quoted after inspection." error={err.amount}>
          <Input {...describedBy("amount", err.amount, true)} inputMode="decimal" placeholder="e.g. 12,500" className="w-48 tabular-nums" />
        </Field>
      </fieldset>

      {state.error && <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-compact text-danger">{state.error}</p>}
      <div className="flex gap-2 border-t border-border pt-5">
        <Button type="submit" variant="primary" size="lg" pending={pending}>
          Create work order
        </Button>
        <Link href={cancelHref} className={buttonClass({ variant: "ghost", size: "lg" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
