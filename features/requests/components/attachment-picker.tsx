"use client";

import { CircleX, FileText, LoaderCircle, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import { uploadFile, withRetry } from "@/features/media/upload-client";
import { cn } from "@/lib/cn";

export type AttachmentInfo = { id: string; name: string; sizeBytes: number };
type Entry = AttachmentInfo & { state: "uploading" | "ready" | "failed"; progress: number; error?: string };

const size = (b: number) => (b > 1_000_000 ? `${(b / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1000))} KB`);

/** Photos or a PDF to go with a quote — a datasheet, a site photo. Each uploads and is verified before the quote can use it. */
export function AttachmentPicker({ requestId, initial }: { requestId: string; initial: AttachmentInfo[] }) {
  const [entries, setEntries] = useState<Entry[]>(initial.map((a) => ({ ...a, state: "ready", progress: 1 })));
  const input = useRef<HTMLInputElement>(null);
  const patch = (key: string, change: Partial<Entry>) => setEntries((list) => list.map((e) => (e.id === key ? { ...e, ...change } : e)));

  const add = async (file: File) => {
    const tempId = `pending-${crypto.randomUUID()}`;
    setEntries((list) => [...list, { id: tempId, name: file.name, sizeBytes: file.size, state: "uploading", progress: 0 }]);
    try {
      const fileId = await withRetry(() => uploadFile({ purpose: "quote_attachment", subjectId: requestId, file, onStage: () => {}, onProgress: (f) => patch(tempId, { progress: f }) }), () => {});
      setEntries((list) => list.map((e) => (e.id === tempId ? { ...e, id: fileId, state: "ready", progress: 1 } : e)));
    } catch (error) {
      patch(tempId, { state: "failed", error: error instanceof Error ? error.message : "Upload failed" });
    }
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-compact font-medium text-primary">
        Attachments <span className="font-normal text-muted">(optional)</span>
      </legend>
      {entries.filter((e) => e.state === "ready").map((e) => (
        <input key={e.id} type="hidden" name="attachmentId" value={e.id} />
      ))}
      {entries.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {entries.map((e) => (
            <li key={e.id} className={cn("flex items-center gap-2.5 rounded-lg border bg-surface px-3 py-2 text-body", e.state === "failed" ? "border-danger/40" : "border-border")}>
              {e.state === "uploading" ? <LoaderCircle className="size-4 animate-spin text-muted" aria-hidden /> : e.state === "failed" ? <CircleX className="size-4 text-danger" aria-hidden /> : <FileText className="size-4 text-muted" aria-hidden />}
              <span className="min-w-0 flex-1 truncate text-primary">{e.name}</span>
              <span className="text-meta text-muted">{e.state === "uploading" ? `${Math.round(e.progress * 100)}%` : e.state === "failed" ? e.error : size(e.sizeBytes)}</span>
              <button type="button" aria-label={`Remove ${e.name}`} onClick={() => setEntries((l) => l.filter((x) => x.id !== e.id))} className="rounded p-1 text-muted hover:bg-surface-hover hover:text-danger">
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" disabled={entries.length >= 5} onClick={() => input.current?.click()} className="flex items-center gap-1.5 self-start rounded text-compact font-medium text-brand-text hover:underline disabled:opacity-40">
        <Paperclip className="size-3.5" aria-hidden /> Attach a photo or PDF
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          for (const f of Array.from(e.target.files ?? []).slice(0, 5 - entries.length)) void add(f);
          e.target.value = "";
        }}
      />
    </fieldset>
  );
}
