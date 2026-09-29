"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/app/form-status";
import { Button } from "@/components/ui/button";
import { describedBy, Field, Input, Textarea } from "@/components/ui/field";
import { LineItemsEditor, type EditorLine } from "@/features/commercial/components/line-items-editor";
import type { ActionResult } from "@/lib/forms";
import { declineInvite, sendQuote } from "../actions";
import { AttachmentPicker, type AttachmentInfo } from "./attachment-picker";

export type QuoteFormDefaults = {
  lines?: EditorLine[];
  discountMinor?: number;
  taxBps?: number;
  validUntil: string;
  earliestStart: string;
  inclusions?: string;
  exclusions?: string;
  note?: string;
};

/**
 * A quote a customer can decide on: itemised, with what is and isn't included and how long it
 * stays open. Save a draft, send it, or revise one already sent — the customer only ever sees
 * what was sent.
 */
export function QuoteForm({
  org,
  requestNumber,
  requestId,
  attachments,
  currency,
  locale,
  taxLabel,
  minDate,
  suggestion,
  defaults,
  reviseOf,
  allowDecline,
}: {
  org: string;
  requestNumber: number;
  requestId: string;
  attachments: AttachmentInfo[];
  currency: string;
  locale: string;
  taxLabel: string;
  minDate: string;
  suggestion: string;
  defaults: QuoteFormDefaults;
  reviseOf?: string;
  allowDecline?: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(sendQuote, {});
  const [declineState, decline, declining] = useActionState<ActionResult, FormData>(declineInvite, {});
  const err = state.fieldErrors ?? {};

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-6">
        <input type="hidden" name="org" value={org} />
        <input type="hidden" name="requestNumber" value={requestNumber} />
        {reviseOf && <input type="hidden" name="reviseOf" value={reviseOf} />}

        <LineItemsEditor
          currency={currency}
          locale={locale}
          taxLabel={taxLabel}
          errors={err}
          initial={defaults.lines}
          initialDiscount={defaults.discountMinor}
          initialTaxBps={defaults.taxBps}
          starter={[
            { description: "Call-out and inspection", kind: "labor", quantity: 1, unit: "visit", unitMinor: 0 },
            { description: suggestion, kind: "labor", quantity: 1, unit: "job", unitMinor: 0 },
          ]}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="earliestStart" label="Earliest start" error={err.earliestStart}>
            <Input {...describedBy("earliestStart", err.earliestStart)} type="date" min={minDate} defaultValue={defaults.earliestStart} className="w-44" required />
          </Field>
          <Field id="validUntil" label="Quote valid until" error={err.validUntil} hint="After this date the customer can no longer accept it.">
            <Input {...describedBy("validUntil", err.validUntil, true)} type="date" min={minDate} defaultValue={defaults.validUntil} className="w-44" required />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="inclusions" label="What's included" optional hint="In plain words — parts, clean-up, warranty.">
            <Textarea id="inclusions" name="inclusions" defaultValue={defaults.inclusions} maxLength={1000} className="min-h-20" placeholder="e.g. All labour, replacement trap, clean-up after the work." />
          </Field>
          <Field id="exclusions" label="What's not included" optional hint="Say what could change the price, so there are no surprises.">
            <Textarea id="exclusions" name="exclusions" defaultValue={defaults.exclusions} maxLength={1000} className="min-h-20" placeholder="e.g. Repairs to pipes inside the wall — quoted separately." />
          </Field>
        </div>
        <Field id="note" label="Note to the customer" optional>
          <Textarea id="note" name="note" defaultValue={defaults.note} maxLength={1000} placeholder="Anything else they should know before deciding." />
        </Field>
        <AttachmentPicker requestId={requestId} initial={attachments} />

        {state.error && (
          <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-compact text-danger">
            {state.error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="intent" value="send" variant="primary" size="lg" pending={pending}>
            {reviseOf ? "Send revised quote" : "Send quote"}
          </Button>
          <Button type="submit" name="intent" value="draft" variant="secondary" size="lg" disabled={pending}>
            Save draft
          </Button>
          <FormStatus state={state} />
        </div>
      </form>
      {allowDecline && (
        <form action={decline} className="border-t border-border pt-4">
          <input type="hidden" name="org" value={org} />
          <input type="hidden" name="requestNumber" value={requestNumber} />
          <p className="text-compact text-secondary">
            Can&apos;t take this job?{" "}
            <button type="submit" disabled={declining} className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50">
              Decline the request
            </button>{" "}
            so the customer can choose someone else.
          </p>
          {declineState.error && (
            <p role="alert" className="mt-1 text-meta text-danger">
              {declineState.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
