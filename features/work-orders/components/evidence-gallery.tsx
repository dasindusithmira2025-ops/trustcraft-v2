import { FileText, ImageOff, NotebookPen, PenLine, ScanLine } from "lucide-react";
import type { EvidenceKind } from "@/lib/db/schema";
import { formatDateTime, type Locale } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export type EvidenceItem = {
  id: string;
  kind: EvidenceKind;
  phase: "before" | "during" | "after";
  caption: string;
  hasFile: boolean;
  capturedAt: Date;
  capturedBy: string;
};

const KIND_ICON = { photo: ImageOff, note: NotebookPen, signature: PenLine, scan: ScanLine, document: FileText };
const PHASE = { before: "Before", during: "During", after: "After" } as const;

/**
 * Before/after evidence with provenance: who captured it and when. Images stream from
 * an authenticated route, never a public URL.
 */
export function EvidenceGallery({ items, locale }: { items: EvidenceItem[]; locale: Locale }) {
  const media = items.filter((e) => e.kind === "photo");
  const other = items.filter((e) => e.kind !== "photo");
  return (
    <div className="flex flex-col gap-4">
      {media.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {media.map((e) => (
            <li key={e.id} className="flex flex-col gap-1.5">
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-surface-muted">
                {e.hasFile ? (
                  // eslint-disable-next-line @next/next/no-img-element -- authenticated stream, not optimisable by next/image
                  <img src={`/api/evidence/${e.id}`} alt={e.caption} loading="lazy" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full flex-col items-center justify-center gap-1 p-3 text-center text-meta text-muted">
                    <ImageOff className="size-5" aria-hidden />
                    No image in demo data
                  </span>
                )}
                <Badge tone={e.phase === "after" ? "success" : "neutral"} className="absolute left-2 top-2 shadow-raised">
                  {PHASE[e.phase]}
                </Badge>
              </div>
              <p className="text-compact text-primary">{e.caption}</p>
              <p className="-mt-1 text-meta text-muted">
                {e.capturedBy} · {formatDateTime(e.capturedAt, locale)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {other.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {other.map((e) => {
            const Icon = KIND_ICON[e.kind];
            return (
              <li key={e.id} className="flex gap-3 px-3 py-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-body text-primary">{e.caption}</span>
                  <span className="block text-meta text-muted">
                    {e.kind === "scan" ? "Asset scan" : e.kind === "note" ? "Note" : e.kind === "signature" ? "Signature" : "Document"} · {e.capturedBy} ·{" "}
                    {formatDateTime(e.capturedAt, locale)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
