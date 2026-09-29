import { ArrowRight, Circle, CircleCheck } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { SetupItem } from "../checklist";

/** A short "finish setting up" list at the top of the overview. It disappears when everything is done. */
export function SetupChecklist({ items, resumeOnboarding }: { items: SetupItem[]; resumeOnboarding: boolean }) {
  const done = items.filter((i) => i.done).length;
  return (
    <section aria-labelledby="setup-heading" className="mb-6 rounded-lg border border-brand/25 bg-brand-subtle/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="setup-heading" className="text-heading text-primary">
          Finish setting up <span className="ml-1 text-compact font-normal text-secondary tabular-nums">{done} of {items.length}</span>
        </h2>
        {resumeOnboarding && (
          <Link href="/onboarding" className="inline-flex items-center gap-1 text-compact font-medium text-brand-text hover:underline">
            Continue guided setup <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((i) => (
          <li key={i.id}>
            <Link href={i.href} className={cn("group flex items-start gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-surface/70", i.done && "opacity-60")}>
              {i.done ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Done" /> : <Circle className="mt-0.5 size-4 shrink-0 text-border-strong" aria-label="To do" />}
              <span className="min-w-0">
                <span className={cn("block text-body text-primary group-hover:underline", i.done && "line-through decoration-border-strong")}>{i.label}</span>
                {!i.done && <span className="block text-meta text-muted">{i.hint}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
