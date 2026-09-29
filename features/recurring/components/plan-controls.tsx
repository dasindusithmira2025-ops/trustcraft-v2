"use client";

import { Pause, Play, RefreshCw, StopCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { FormStatus } from "@/components/app/form-status";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/forms";
import { endPlan, generateNow, pausePlan, resumePlan } from "../actions";

/** Pause, resume, end — each says what it does to future visits, and none touches past ones. */
export function PlanControls({ org, id, status }: { org: string; id: string; status: "active" | "paused" | "ended" }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult>({});
  const [confirmEnd, setConfirmEnd] = useState(false);
  const run = (fn: () => Promise<ActionResult>) => start(async () => setResult(await fn()));
  if (status === "ended") return <p className="text-compact text-muted">This service has ended. Past visits remain on record.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "active" ? (
        <Button variant="secondary" pending={pending} onClick={() => run(() => pausePlan(org, id))}>
          <Pause aria-hidden /> Pause
        </Button>
      ) : (
        <Button variant="primary" pending={pending} onClick={() => run(() => resumePlan(org, id))}>
          <Play aria-hidden /> Resume
        </Button>
      )}
      {status === "active" && (
        <Button variant="secondary" pending={pending} onClick={() => run(() => generateNow(org))}>
          <RefreshCw aria-hidden /> Create due visits now
        </Button>
      )}
      <Button variant="ghost" onClick={() => setConfirmEnd(true)}>
        <StopCircle aria-hidden /> End service
      </Button>
      <ConfirmDialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="End this recurring service?"
        description="No more visits will be created. Visits already scheduled or completed stay exactly as they are — cancel any you don't want from their work order."
        confirmLabel="End service"
        pending={pending}
        onConfirm={() => {
          setConfirmEnd(false);
          run(() => endPlan(org, id));
        }}
      />
      <FormStatus state={result} />
    </div>
  );
}
