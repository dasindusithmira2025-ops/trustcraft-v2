"use client";

import { Camera, CircleCheck, CircleX, LoaderCircle, NotebookPen, RefreshCw, WifiOff, X } from "lucide-react";
import Image from "next/image";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { addEvidence } from "@/features/work-orders/actions";
import { compressImage, newOpId, uploadFile, UploadError, withRetry, type UploadStage } from "@/features/media/upload-client";
import type { ActionResult } from "@/lib/forms";
import { cn } from "@/lib/cn";

type Phase = "before" | "during" | "after";
type Stage = "waiting" | UploadStage | "saving" | "done" | "retrying" | "failed";
type Item = { id: string; file: File; preview: string; caption: string; phase: Phase; stage: Stage; progress: number; attempt: number; error?: string };

const LABEL: Record<Stage, string> = {
  waiting: "Waiting for a connection",
  compressing: "Getting the photo ready…",
  preparing: "Starting the upload…",
  uploading: "Uploading",
  confirming: "Checking it arrived…",
  saving: "Saving to the job…",
  done: "Saved to the job",
  retrying: "Connection is weak — trying again",
  failed: "Not saved",
};

/**
 * Camera first. Tap Photo, the camera opens; the shot is shrunk, uploaded with visible progress, verified by the server
 * and attached to the job — while the technician takes the next one. Every step is retried, and every photo says plainly
 * whether it is safe: uploading, saved, or failed with a Retry. The device generates one operation id per photo, so a retry
 * (or a replay after coming back online) can never save it twice.
 * ponytail: photos wait in memory while offline. A page reload loses unsent ones — an IndexedDB queue is the upgrade.
 */
export function EvidenceCapture({ workOrderId, defaultPhase }: { workOrderId: string; defaultPhase: Phase }) {
  const [phase, setPhase] = useState<Phase>(defaultPhase);
  const [items, setItems] = useState<Item[]>([]);
  const [pending, setPending] = useState<{ file: File; preview: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const online = useRef(true);
  const waiting = useRef<Map<string, () => void>>(new Map());

  const patch = useCallback((id: string, change: Partial<Item>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...change } : i))), []);

  const run = useCallback(
    async (item: Item) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        patch(item.id, { stage: "waiting", error: undefined });
        // Resume the moment the connection returns.
        await new Promise<void>((resolve) => waiting.current.set(item.id, resolve));
      }
      patch(item.id, { stage: "compressing", progress: 0, error: undefined });
      try {
        const file = await compressImage(item.file);
        const fileId = await withRetry(
          (attempt) => {
            if (attempt > 0) patch(item.id, { stage: "preparing", progress: 0 });
            return uploadFile({ purpose: "evidence", subjectId: workOrderId, file, onStage: (stage) => patch(item.id, { stage }), onProgress: (f) => patch(item.id, { progress: f }) });
          },
          (attempt) => patch(item.id, { stage: "retrying", attempt }),
        );
        patch(item.id, { stage: "saving" });
        const fd = new FormData();
        fd.set("workOrderId", workOrderId);
        fd.set("kind", "photo");
        fd.set("phase", item.phase);
        fd.set("caption", item.caption);
        fd.set("fileId", fileId);
        fd.set("clientOpId", item.id);
        const res = await withRetry(
          async () => {
            const r = await addEvidence({}, fd);
            if (r.error || r.fieldErrors) throw new UploadError(r.error ?? Object.values(r.fieldErrors ?? {})[0] ?? "Couldn't save the photo.", false);
            return r;
          },
          (attempt) => patch(item.id, { stage: "retrying", attempt }),
        );
        void res;
        patch(item.id, { stage: "done", progress: 1 });
        setTimeout(() => setItems((list) => list.filter((i) => i.id !== item.id)), 6000);
      } catch (error) {
        patch(item.id, { stage: "failed", error: error instanceof Error ? error.message : "Something went wrong." });
      }
    },
    [patch, workOrderId],
  );

  useEffect(() => {
    const onOnline = () => {
      online.current = true;
      waiting.current.forEach((resume) => resume());
      waiting.current.clear();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps -- release previews only when leaving the screen

  const begin = () => {
    if (!pending) return;
    const item: Item = { id: newOpId(), file: pending.file, preview: pending.preview, caption: caption.trim(), phase, stage: "compressing", progress: 0, attempt: 0 };
    setItems((list) => [item, ...list]);
    setPending(null);
    setCaption("");
    void run(item);
  };

  return (
    <div className="flex flex-col gap-3">
      <fieldset>
        <legend className="sr-only">Which stage is this?</legend>
        <div className="grid grid-cols-3 gap-2">
          {(["before", "during", "after"] as const).map((p) => (
            <label key={p} className="flex h-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-body capitalize has-checked:border-brand has-checked:bg-brand-subtle has-checked:font-medium has-checked:text-brand-text has-focus-visible:outline-2 has-focus-visible:outline-focus">
              <input type="radio" name="phase" value={p} checked={phase === p} onChange={() => setPhase(p)} className="sr-only" />
              {p}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <Button size="xl" variant="primary" onClick={() => cameraRef.current?.click()}>
          <Camera aria-hidden /> Photo
        </Button>
        <Button size="xl" variant="secondary" onClick={() => setNoteOpen(true)}>
          <NotebookPen aria-hidden /> Note
        </Button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) setPending({ file, preview: URL.createObjectURL(file) });
          }}
        />
      </div>

      {items.length > 0 && (
        <ul aria-live="polite" className="flex flex-col gap-2">
          {items.map((i) => (
            <li key={i.id} className={cn("flex items-center gap-3 rounded-xl border bg-surface p-2.5", i.stage === "failed" ? "border-danger/40" : i.stage === "done" ? "border-success/40" : "border-border")}>
              <Image src={i.preview} alt="" width={48} height={48} unoptimized className="size-12 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium capitalize text-primary">{i.caption || `${i.phase} photo`}</p>
                <p className={cn("flex items-center gap-1.5 text-compact", i.stage === "failed" ? "text-danger" : i.stage === "done" ? "text-success" : "text-secondary")}>
                  {i.stage === "done" ? <CircleCheck className="size-3.5" aria-hidden /> : i.stage === "failed" ? <CircleX className="size-3.5" aria-hidden /> : i.stage === "waiting" ? <WifiOff className="size-3.5" aria-hidden /> : <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
                  {i.stage === "uploading" ? `Uploading ${Math.round(i.progress * 100)}%` : i.stage === "retrying" ? `${LABEL.retrying} (${i.attempt}/3)` : i.stage === "failed" ? (i.error ?? LABEL.failed) : LABEL[i.stage]}
                </p>
                {i.stage === "uploading" && (
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-subtle" role="progressbar" aria-label="Upload progress" aria-valuenow={Math.round(i.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${i.progress * 100}%` }} />
                  </div>
                )}
              </div>
              {i.stage === "failed" && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => void run(i)}>
                    <RefreshCw aria-hidden /> Retry
                  </Button>
                  <button type="button" aria-label="Discard photo" onClick={() => setItems((l) => l.filter((x) => x.id !== i.id))} className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-primary">
                    <X className="size-4" aria-hidden />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent title="Save this photo" description="It uploads in the background — you can take the next one straight away.">
          {pending && (
            <div className="flex flex-col gap-4 p-5">
              <Image src={pending.preview} alt="The photo you just took" width={640} height={480} unoptimized className="max-h-64 w-full rounded-lg border border-border object-contain" />
              <Field id="caption" label="What does it show?" optional>
                <Input id="caption" name="caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={280} placeholder="e.g. Coil iced over before defrost" autoFocus />
              </Field>
              <p className="text-compact text-muted">
                Stage: <span className="font-medium capitalize text-primary">{phase}</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button size="xl" variant="secondary" onClick={() => setPending(null)}>
                  Retake
                </Button>
                <Button size="xl" variant="primary" onClick={begin}>
                  Save photo
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <NoteDialog workOrderId={workOrderId} phase={phase} open={noteOpen} onOpenChange={setNoteOpen} />
    </div>
  );
}

function NoteDialog({ workOrderId, phase, open, onOpenChange }: { workOrderId: string; phase: Phase; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [opId, setOpId] = useState(newOpId);
  const [state, action, pending] = useActionState<ActionResult, FormData>(async (prev, form) => {
    const result = await addEvidence(prev, form);
    if (result.ok) {
      onOpenChange(false);
      setOpId(newOpId());
    }
    return result;
  }, {});
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add a note" description="Visible to the customer as part of the record of the work.">
        <form action={action} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="workOrderId" value={workOrderId} />
          <input type="hidden" name="kind" value="note" />
          <input type="hidden" name="phase" value={phase} />
          <input type="hidden" name="clientOpId" value={opId} />
          <Field id="note" label="Note" error={state.fieldErrors?.caption}>
            <Textarea id="note" name="caption" required maxLength={280} autoFocus className="min-h-28" />
          </Field>
          {state.error && (
            <p role="alert" className="text-compact text-danger">
              {state.error}
            </p>
          )}
          <Button type="submit" size="xl" variant="primary" pending={pending}>
            Save note
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
