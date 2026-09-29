"use client";

import { Ban, CircleCheck, Undo2, Wallet } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { FormStatus } from "@/components/app/form-status";
import { SheetForm, useCloseSheet } from "@/components/app/sheet-form";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { describedBy, Field, Input, Select, Textarea } from "@/components/ui/field";
import { LineItemsEditor, type EditorLine } from "@/features/commercial/components/line-items-editor";
import type { ActionResult } from "@/lib/forms";
import { issueInvoice, recordPayment, refundInvoice, saveInvoiceDraft, voidInvoice } from "../actions";

const METHODS = ["Bank transfer", "Cash", "Cheque", "Card (outside TrustCraft)", "Other"] as const;

/** Payment received outside TrustCraft. Defaults to the balance so "paid in full" is one click. */
function PaymentForm({ org, invoiceId, balance, currencySymbol }: { org: string; invoiceId: string; balance: string; currencySymbol: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(recordPayment, {});
  const close = useCloseSheet();
  useEffect(() => {
    if (state.ok) close();
  }, [state, close]);
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Field id="amount" label={`Amount received (${currencySymbol})`} error={err.amount} hint="Less than the balance records a part-payment.">
        <Input {...describedBy("amount", err.amount, true)} defaultValue={balance} inputMode="decimal" className="tabular-nums" required />
      </Field>
      <Field id="method" label="How was it paid?">
        <Select id="method" name="method" defaultValue="Bank transfer">
          {METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="reference" label="Reference" optional>
          <Input id="reference" name="reference" maxLength={60} placeholder="Transfer or cheque no." />
        </Field>
        <Field id="note" label="Note" optional>
          <Input id="note" name="note" maxLength={200} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" pending={pending}>
          Mark as paid
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

/** Reason-required destructive actions (void, refund) behind a confirmation that says what happens. */
function ReasonAction({ label, icon, title, description, confirm, run, tone = "danger" }: { label: string; icon: React.ReactNode; title: string; description: string; confirm: string; run: (reason: string) => Promise<ActionResult>; tone?: "danger" | "primary" }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {icon} {label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        confirmLabel={confirm}
        tone={tone}
        pending={pending}
        onConfirm={() =>
          start(async () => {
            const res = await run(reason);
            setResult(res);
            if (res.ok) setOpen(false);
          })
        }
      >
        <div className="mt-4">
          <Field id="reason" label="Reason" error={result.fieldErrors?.reason ?? result.error}>
            <Textarea {...describedBy("reason", result.fieldErrors?.reason ?? result.error)} value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-16" maxLength={200} />
          </Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

export function InvoiceControls({ org, invoiceId, status, balance, currencySymbol, canManage, canRefund }: { org: string; invoiceId: string; status: string; balance: string; currencySymbol: string; canManage: boolean; canRefund: boolean }) {
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  if (!canManage) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" && (
        <Button variant="primary" pending={pending} onClick={() => start(async () => setResult(await issueInvoice(org, invoiceId)))}>
          <CircleCheck aria-hidden /> Issue invoice
        </Button>
      )}
      {(status === "issued" || status === "partially_paid") && (
        <SheetForm label="Record payment" icon={<Wallet aria-hidden />} title="Record a payment" description={`${currencySymbol} ${balance} still owed`}>
          <PaymentForm org={org} invoiceId={invoiceId} balance={balance} currencySymbol={currencySymbol} />
        </SheetForm>
      )}
      {(status === "draft" || status === "issued") && (
        <ReasonAction
          label="Void"
          icon={<Ban aria-hidden />}
          title="Void this invoice?"
          description="The customer is told nothing is owed. A voided invoice stays on record and can't be reopened — issue a new one if needed."
          confirm="Void invoice"
          run={(reason) => voidInvoice(org, invoiceId, reason)}
        />
      )}
      {status === "paid" && canRefund && (
        <ReasonAction
          label="Refund"
          icon={<Undo2 aria-hidden />}
          title="Refund this invoice?"
          description="The full amount is recorded as returned to the customer, and they're told. Do this only after the money has actually been sent back."
          confirm="Record refund"
          run={(reason) => refundInvoice(org, invoiceId, reason)}
        />
      )}
      <FormStatus state={result} />
    </div>
  );
}

/** Edit a draft — lines, discount, tax, due date — then issue it. */
export function DraftEditor({ org, invoiceId, currency, locale, taxLabel, lines, discountMinor, taxBps, dueOn, notes }: { org: string; invoiceId: string; currency: string; locale: string; taxLabel: string; lines: EditorLine[]; discountMinor: number; taxBps: number; dueOn: string; notes: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveInvoiceDraft, {});
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <LineItemsEditor currency={currency} locale={locale} taxLabel={taxLabel} errors={err} initial={lines.length ? lines : undefined} initialDiscount={discountMinor} initialTaxBps={taxBps} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="dueOn" label="Due date" error={err.dueOn}>
          <Input {...describedBy("dueOn", err.dueOn)} type="date" defaultValue={dueOn} className="w-44" required />
        </Field>
        <Field id="notes" label="Note on the invoice" optional>
          <Input id="notes" name="notes" defaultValue={notes} maxLength={600} />
        </Field>
      </div>
      {state.error && (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-compact text-danger">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" pending={pending}>
          Save draft
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
