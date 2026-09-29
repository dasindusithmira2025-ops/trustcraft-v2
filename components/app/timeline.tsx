import { dayKey, formatDateShort, formatTime, type Locale } from "@/lib/format";
import { cn } from "@/lib/cn";

export type TimelineEvent = {
  id: string;
  type: string;
  summary: string;
  actor: string | null;
  occurredAt: Date;
};

const EMPHASIS = new Set(["created", "completed", "verified", "rejected", "cancelled", "paid"]);

/**
 * One audit-grade timeline for every entity: when, what, and who. Grouped by day in the
 * organization's timezone so "Today" means the same thing to everyone looking at it.
 */
export function Timeline({ events, locale, now }: { events: TimelineEvent[]; locale: Locale; now: Date }) {
  if (events.length === 0) return <p className="text-body text-muted">No activity yet.</p>;
  const today = dayKey(now, locale.timezone);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000), locale.timezone);
  const groups = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const k = dayKey(e.occurredAt, locale.timezone);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }

  return (
    <div className="flex flex-col gap-5">
      {[...groups.entries()].map(([k, list]) => (
        <section key={k} aria-label={k === today ? "Today" : k === yesterday ? "Yesterday" : formatDateShort(list[0]!.occurredAt, locale)}>
          <p className="mb-2 text-meta font-medium text-muted">{k === today ? "Today" : k === yesterday ? "Yesterday" : formatDateShort(list[0]!.occurredAt, locale)}</p>
          <ol className="relative flex flex-col">
            {list.map((e, i) => (
              <li key={e.id} className="relative grid grid-cols-[4.5rem_1rem_minmax(0,1fr)] gap-x-2 pb-3.5 last:pb-0">
                <time dateTime={e.occurredAt.toISOString()} className="whitespace-nowrap pt-px text-right text-compact tabular-nums text-muted">
                  {formatTime(e.occurredAt, locale)}
                </time>
                <span className="relative flex justify-center" aria-hidden>
                  {i < list.length - 1 && <span className="absolute top-3 bottom-[-0.875rem] w-px bg-border" />}
                  <span className={cn("mt-1.5 size-2 rounded-full ring-4 ring-surface", EMPHASIS.has(e.type) ? "bg-brand" : "bg-border-strong")} />
                </span>
                <p className="text-body text-primary">
                  {e.summary}
                  {e.actor && !e.summary.includes(e.actor) && <span className="text-muted"> · {e.actor}</span>}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
