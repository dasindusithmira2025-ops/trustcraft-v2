"use client";

import { CalendarClock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { AssignForm, type AssignableTechnician, type AssignDefaults } from "@/features/work-orders/components/assign-form";

/** The same assignment flow as the board, behind a button — for phones and anywhere a list is clearer than a timeline. */
export function AssignButton({ workOrderId, label, technicians, defaults, size = "sm", variant = "secondary", text = "Assign" }: { workOrderId: string; label: string; technicians: AssignableTechnician[]; defaults: AssignDefaults; size?: "sm" | "md"; variant?: "primary" | "secondary"; text?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)} aria-label={`${text} ${label}`}>
        <CalendarClock aria-hidden /> {text}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <SheetContent title="Assign technician" description={label}>
          <AssignForm workOrderId={workOrderId} technicians={technicians} defaults={defaults} onDone={() => setOpen(false)} />
        </SheetContent>
      </Dialog>
    </>
  );
}
