"use client";

import { BadgeCheck, Check } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { TrustScoreSummary } from "@/components/app/trust-score";
import { Button } from "@/components/ui/button";
import type { TrustScore } from "@/features/trust/score";
import type { ActionResult } from "@/features/work-orders/actions";
import { cn } from "@/lib/cn";
import { createServiceRequest } from "../actions";

export type Match = { orgId: string; slug: string; name: string; headline: string; verified: boolean; trust: TrustScore; reasons: string[] };

const MAX = 3;

/** Step 2 — pick up to three professionals. Each card says why it was recommended. */
export function ChooseProviders({ matches, hidden }: { matches: Match[]; hidden: Record<string, string> }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(createServiceRequest, {});
  const [picked, setPicked] = useState<string[]>(matches.slice(0, 2).map((m) => m.orgId));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < MAX ? [...p, id] : p));
  const errors = state.fieldErrors ? Object.values(state.fieldErrors) : [];

  return (
    <form action={action} className="flex flex-col gap-4">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Professionals to ask for a quote</legend>
        {matches.map((m, i) => {
          const on = picked.includes(m.orgId);
          const disabled = !on && picked.length >= MAX;
          return (
            <label
              key={m.orgId}
              className={cn(
                "relative flex cursor-pointer gap-4 rounded-xl border bg-surface p-4 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-focus",
                on ? "border-brand ring-1 ring-brand" : "border-border hover:border-border-strong",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input type="checkbox" name="providers" value={m.orgId} checked={on} disabled={disabled} onChange={() => toggle(m.orgId)} className="sr-only" />
              <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border", on ? "border-brand bg-brand text-white" : "border-border-strong bg-surface")} aria-hidden>
                {on && <Check className="size-3.5" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-body font-semibold text-primary">{m.name}</span>
                  {m.verified && (
                    <span className="inline-flex items-center gap-1 text-meta font-medium text-success">
                      <BadgeCheck className="size-3.5" aria-hidden /> Verified
                    </span>
                  )}
                  {i === 0 && m.trust.score !== null && <span className="text-meta font-medium text-brand-text">Best match</span>}
                </span>
                <span className="mt-0.5 block text-compact text-secondary">{m.headline}</span>
                <TrustScoreSummary trust={m.trust} className="mt-3" />
                <span className="mt-3 block text-meta font-medium text-muted">Why we suggest them</span>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {m.reasons.map((r) => (
                    <li key={r} className="flex gap-1.5 text-compact text-secondary">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden /> {r}
                    </li>
                  ))}
                </ul>
                <Link href={`/pros/${m.slug}`} target="_blank" className="relative z-10 mt-2 inline-block text-compact font-medium text-brand-text hover:underline">
                  View profile
                </Link>
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="sticky bottom-16 z-20 -mx-4 flex flex-col gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        {(state.error || errors.length > 0) && (
          <p role="alert" className="text-compact text-danger">
            {state.error ?? errors[0]}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="text-compact text-secondary" aria-live="polite">
            {picked.length} of {MAX} selected
          </p>
          <Button type="submit" variant="primary" size="xl" pending={pending} disabled={picked.length === 0}>
            Ask for {picked.length === 1 ? "a quote" : "quotes"}
          </Button>
        </div>
      </div>
    </form>
  );
}
