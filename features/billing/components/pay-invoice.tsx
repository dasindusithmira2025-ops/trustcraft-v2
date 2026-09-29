"use client";

import { Lock } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/features/work-orders/actions";
import { payInvoice } from "../actions";

export function PayInvoice({ invoiceId, amount }: { invoiceId: string; amount: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(payInvoice, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Button type="submit" variant="primary" size="xl" pending={pending} className="w-full sm:w-auto">
        Pay {amount}
      </Button>
      <p className="flex items-center gap-1.5 text-meta text-muted">
        <Lock className="size-3" aria-hidden /> Demo payment rail — no card is charged in development.
      </p>
      {state.error && <p role="alert" className="text-compact text-danger">{state.error}</p>}
    </form>
  );
}
