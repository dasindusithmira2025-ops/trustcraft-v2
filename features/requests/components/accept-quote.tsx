"use client";

import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import type { ActionResult } from "@/features/work-orders/actions";
import { acceptQuote, cancelRequest, declineQuote } from "../actions";

export function AcceptQuoteButton({ quoteId, providerName, total, others }: { quoteId: string; providerName: string; total: string; others: number }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(acceptQuote, {});
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" size="lg" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        Book for {total}
      </Button>
      {state.error && <p role="alert" className="mt-2 text-compact text-danger">{state.error}</p>}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone="primary"
        title={`Book ${providerName}?`}
        description={`${providerName} will schedule the visit and you'll see who is coming and when. You pay ${total} only after you've confirmed the work is done.${others ? ` The other ${others === 1 ? "quote" : `${others} quotes`} will be declined.` : ""}`}
        confirmLabel={`Book for ${total}`}
        pending={pending}
        onConfirm={() => {
          const fd = new FormData();
          fd.set("quoteId", quoteId);
          startTransition(() => action(fd));
        }}
      />
    </>
  );
}

export function CancelRequestButton({ requestNumber }: { requestNumber: number }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(cancelRequest, {});
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-compact font-medium text-secondary underline-offset-2 hover:text-danger hover:underline">
        Cancel request
      </button>
      {state.error && <p role="alert" className="text-compact text-danger">{state.error}</p>}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancel this request?"
        description="Professionals will stop quoting and any quotes you've received will close. You can always make a new request."
        confirmLabel="Cancel request"
        pending={pending}
        onConfirm={() => {
          const fd = new FormData();
          fd.set("requestNumber", String(requestNumber));
          startTransition(() => action(fd));
          setOpen(false);
        }}
      />
    </>
  );
}

export function DeclineQuoteButton({ quoteId, providerName }: { quoteId: string; providerName: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(declineQuote, {});
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="lg" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        Decline
      </Button>
      {state.error && <p role="alert" className="text-compact text-danger">{state.error}</p>}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Decline ${providerName}'s quote?`}
        description={`${providerName} is told, and can send you a revised quote. Your other quotes stay open.`}
        confirmLabel="Decline quote"
        pending={pending}
        onConfirm={() => {
          const fd = new FormData();
          fd.set("quoteId", quoteId);
          startTransition(() => action(fd));
          setOpen(false);
        }}
      />
    </>
  );
}
