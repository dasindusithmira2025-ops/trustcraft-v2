"use client";

import { Ban, CalendarClock, CircleCheck, EllipsisVertical, Pause, Play, RotateCcw, ShieldCheck } from "lucide-react";
import { startTransition, useActionState, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, SheetContent } from "@/components/ui/dialog";
import { describedBy, Field, Textarea } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { transitionWorkOrder, type ActionResult } from "../actions";
import type { WorkOrderAction } from "../lifecycle";
import { AssignForm, type AssignableTechnician, type AssignDefaults } from "./assign-form";

type Props = {
  workOrderId: string;
  label: string;
  actions: WorkOrderAction[];
  verifyConsequence?: string;
  technicians?: AssignableTechnician[];
  assign?: AssignDefaults;
  /** Field app uses big touch targets. */
  size?: "md" | "xl";
};

type ReasonAction = "hold" | "reject" | "cancel" | "complete";

const REASON_COPY: Record<ReasonAction, { title: string; description: string; label: string; placeholder: string; submit: string; tone: "primary" | "danger" }> = {
  hold: { title: "Pause this job", description: "The customer and dispatch will see why the job is waiting.", label: "What is the job waiting for?", placeholder: "e.g. Replacement compressor contactor arriving tomorrow", submit: "Pause job", tone: "primary" },
  reject: { title: "Send back for rework", description: "The technician is notified and the job returns to in progress.", label: "What still needs fixing?", placeholder: "Be specific so it can be fixed on the next visit", submit: "Send back", tone: "primary" },
  cancel: { title: "Cancel work order", description: "Cancelled work can't be restarted — create a new work order if it's needed later. The customer and assigned technician are told why.", label: "Reason for cancelling", placeholder: "e.g. Customer resolved the issue themselves", submit: "Cancel work order", tone: "danger" },
  complete: { title: "Complete work", description: "The customer is asked to check the evidence and verify.", label: "What was done?", placeholder: "Summarise the fix, parts used and anything the customer should know", submit: "Complete work", tone: "primary" },
};

function ReasonDialog({ action, workOrderId, open, onOpenChange }: { action: ReasonAction; workOrderId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(transitionWorkOrder, {});
  const copy = REASON_COPY[action];
  useEffect(() => {
    if (state.ok) onOpenChange(false);
  }, [state, onOpenChange]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={copy.title} description={copy.description}>
        <form action={formAction} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="workOrderId" value={workOrderId} />
          <input type="hidden" name="action" value={action} />
          <Field id="reason" label={copy.label} error={state.fieldErrors?.reason}>
            <Textarea {...describedBy("reason", state.fieldErrors?.reason)} placeholder={copy.placeholder} required autoFocus maxLength={500} />
          </Field>
          {state.error && <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-compact text-danger">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Back
            </Button>
            <Button type="submit" variant={copy.tone} pending={pending}>
              {copy.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One-click transitions (start, resume, verify) share one form so pending and errors are consistent. */
function useDirect(workOrderId: string) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(transitionWorkOrder, {});
  const run = (action: WorkOrderAction) => {
    const fd = new FormData();
    fd.set("workOrderId", workOrderId);
    fd.set("action", action);
    startTransition(() => formAction(fd));
  };
  return { state, run, pending };
}

/**
 * Context-aware actions: only transitions this person can take right now, with one
 * primary. Anything irreversible asks first and says exactly what will happen.
 */
export function WorkOrderActions({ workOrderId, label, actions, verifyConsequence, technicians, assign, size = "md" }: Props) {
  const [reason, setReason] = useState<ReasonAction | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const direct = useDirect(workOrderId);
  const has = (a: WorkOrderAction) => actions.includes(a);
  const btn = size === "xl" ? "xl" : "md";

  const buttons: ReactNode[] = [];
  if (has("assign") && technicians && assign) {
    const reassign = Boolean(assign.assigneeUserId);
    buttons.push(
      <Button key="assign" size={btn} variant={reassign ? "secondary" : "primary"} onClick={() => setAssignOpen(true)}>
        <CalendarClock aria-hidden /> {reassign ? "Reschedule" : "Assign technician"}
      </Button>,
    );
  }
  if (has("hold")) buttons.push(<Button key="hold" size={btn} variant="secondary" onClick={() => setReason("hold")}><Pause aria-hidden /> Pause</Button>);
  if (has("reject")) buttons.push(<Button key="reject" size={btn} variant="secondary" onClick={() => setReason("reject")}><RotateCcw aria-hidden /> Send back</Button>);
  if (has("start")) buttons.push(<Button key="start" size={btn} variant="primary" pending={direct.pending} onClick={() => direct.run("start")}><Play aria-hidden /> Start job</Button>);
  if (has("resume")) buttons.push(<Button key="resume" size={btn} variant="primary" pending={direct.pending} onClick={() => direct.run("resume")}><Play aria-hidden /> Resume</Button>);
  if (has("complete")) buttons.push(<Button key="complete" size={btn} variant="primary" onClick={() => setReason("complete")}><CircleCheck aria-hidden /> Complete work</Button>);
  if (has("verify")) buttons.push(<Button key="verify" size={btn} variant="primary" onClick={() => setVerifyOpen(true)}><ShieldCheck aria-hidden /> Verify work</Button>);

  if (buttons.length === 0 && !has("cancel")) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {buttons}
      {has("cancel") && (
        <Menu>
          <MenuTrigger aria-label="More actions" className="flex size-8 items-center justify-center rounded-md border border-border-strong bg-surface text-secondary shadow-raised hover:bg-surface-hover">
            <EllipsisVertical className="size-4" />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onClick={() => setReason("cancel")} className="text-danger [&_svg]:!text-danger">
              <Ban /> Cancel work order
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
      {direct.state.error && <p role="alert" className="basis-full text-compact text-danger">{direct.state.error}</p>}

      {reason && <ReasonDialog action={reason} workOrderId={workOrderId} open onOpenChange={(o) => !o && setReason(null)} />}

      {has("verify") && (
        <ConfirmDialog
          open={verifyOpen}
          onOpenChange={setVerifyOpen}
          title={`Verify ${label}?`}
          description={verifyConsequence ?? "This confirms the work was completed to your satisfaction."}
          confirmLabel="Verify work"
          tone="primary"
          pending={direct.pending}
          onConfirm={() => {
            direct.run("verify");
            setVerifyOpen(false);
          }}
        />
      )}

      {has("assign") && technicians && assign && (
        <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
          <SheetContent title={assign.assigneeUserId ? "Reschedule visit" : "Assign technician"} description={label}>
            <AssignForm workOrderId={workOrderId} technicians={technicians} defaults={assign} onDone={() => setAssignOpen(false)} />
          </SheetContent>
        </Dialog>
      )}
    </div>
  );
}
