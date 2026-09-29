"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { FormStatus } from "@/components/app/form-status";
import { useCloseSheet } from "@/components/app/sheet-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, describedBy } from "@/components/ui/field";
import { CITIES } from "@/features/requests/catalog";
import type { ActionResult } from "@/lib/forms";
import { addCustomerNote, createCustomer, deleteCustomerNote, updateCustomer } from "../actions";

type Values = { id?: string; name: string; phone: string; email: string; address: string; city: string };

/** Add or edit a customer. Linked TrustCraft accounts keep their own name; everything else is editable. */
export function CustomerForm({ org, values, lockName }: { org: string; values?: Values; lockName?: boolean }) {
  const editing = Boolean(values?.id);
  const [state, action, pending] = useActionState<ActionResult, FormData>(editing ? updateCustomer : createCustomer, {});
  const close = useCloseSheet();
  useEffect(() => {
    if (state.ok) close();
  }, [state, close]);
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="org" value={org} />
      {values?.id && <input type="hidden" name="id" value={values.id} />}
      <Field id="name" label="Name" error={err.name} hint={lockName ? "This customer has a TrustCraft account, so their name comes from it." : undefined}>
        <Input {...describedBy("name", err.name, Boolean(lockName))} defaultValue={values?.name} readOnly={lockName} required autoComplete="off" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="phone" label="Phone" optional>
          <Input id="phone" name="phone" type="tel" defaultValue={values?.phone} autoComplete="off" />
        </Field>
        <Field id="email" label="Email" optional error={err.email}>
          <Input {...describedBy("email", err.email)} type="email" defaultValue={values?.email} autoComplete="off" />
        </Field>
      </div>
      <Field id="address" label="Address" optional>
        <Input id="address" name="address" defaultValue={values?.address} autoComplete="off" />
      </Field>
      <Field id="city" label="Area" optional hint="Used to check the job is inside your service areas.">
        <Select id="city" name="city" defaultValue={values?.city ?? ""}>
          <option value="">—</option>
          {CITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" pending={pending}>
          {editing ? "Save changes" : "Add customer"}
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export function NoteForm({ org, customerId }: { org: string; customerId: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(addCustomerNote, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} data-reset className="flex flex-col gap-3">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="customerId" value={customerId} />
      <Field id="body" label="Add a note" error={state.fieldErrors?.body} hint="Gate codes, access, preferences — visible to your team only.">
        <Textarea {...describedBy("body", state.fieldErrors?.body, true)} maxLength={2000} className="min-h-20" />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" pending={pending}>
          Add note
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export function DeleteNote({ org, id }: { org: string; id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" pending={pending} aria-label="Delete note" onClick={() => start(async () => void (await deleteCustomerNote(org, id)))}>
      <Trash2 aria-hidden />
    </Button>
  );
}
