"use client";

import { FilePlus } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createInvoiceForWork } from "../actions";

export function CreateInvoiceButton({ org, workOrderNumber }: { org: string; workOrderNumber: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        className="self-start"
        pending={pending}
        onClick={() =>
          start(async () => {
            // On success the action redirects to the new draft; anything returned is a problem to show.
            const res = await createInvoiceForWork(org, workOrderNumber);
            if (res?.error) setError(res.error);
          })
        }
      >
        <FilePlus aria-hidden /> Create invoice
      </Button>
      {error && (
        <p role="alert" className="text-compact text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
