import { Check, CircleAlert } from "lucide-react";

/**
 * "Before you complete": what the customer will see, at a glance. Nudges, never blocks — only the
 * checklist is a hard requirement — because a technician standing in a plant room should be helped, not stopped.
 */
export function CompletionSummary({ checklist, photos, hasAfterPhoto, parts }: { checklist: { done: number; total: number }; photos: number; hasAfterPhoto: boolean; parts: number }) {
  const rows = [
    { ok: checklist.total === 0 || checklist.done === checklist.total, text: checklist.total ? `Checklist ${checklist.done} of ${checklist.total}` : "No checklist on this job" },
    { ok: photos > 0, text: photos ? `${photos} photo${photos === 1 ? "" : "s"}` : "No photos yet" },
    { ok: hasAfterPhoto, text: hasAfterPhoto ? "After photo taken" : "No after photo — customers verify faster with one" },
    { ok: true, text: parts ? `${parts} part${parts === 1 ? "" : "s"} recorded` : "No parts recorded", muted: parts === 0 },
  ];
  return (
    <section aria-labelledby="summary" className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <h2 id="summary" className="text-heading text-primary">
        Before you complete
      </h2>
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.text} className="flex items-center gap-2 text-body">
            {r.ok ? <Check className="size-4 shrink-0 text-success" aria-label="Done" /> : <CircleAlert className="size-4 shrink-0 text-warning" aria-label="Worth doing" />}
            <span className={r.ok ? ("muted" in r && r.muted ? "text-muted" : "text-secondary") : "text-primary"}>{r.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
