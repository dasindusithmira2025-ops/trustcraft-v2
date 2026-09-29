import { Info } from "lucide-react";
import { BAND_LABEL, CONFIDENCE_LABEL, MIN_JOBS_FOR_SCORE, type TrustBand, type TrustScore } from "@/features/trust/score";
import { cn } from "@/lib/cn";

const BAND_STYLE: Record<TrustBand, { text: string; bg: string; bar: string }> = {
  excellent: { text: "text-success", bg: "bg-success-subtle", bar: "bg-success" },
  strong: { text: "text-info", bg: "bg-info-subtle", bar: "bg-info" },
  fair: { text: "text-warning", bg: "bg-warning-subtle", bar: "bg-warning" },
  weak: { text: "text-danger", bg: "bg-danger-subtle", bar: "bg-danger" },
  new: { text: "text-secondary", bg: "bg-neutral-subtle", bar: "bg-border-strong" },
};

const jobs = (n: number) => `${n.toLocaleString("en")} verified job${n === 1 ? "" : "s"}`;

/** Inline form for tables and lists: "94 Excellent". */
export function TrustScoreInline({ trust, className }: { trust: TrustScore; className?: string }) {
  const style = BAND_STYLE[trust.band];
  if (trust.score === null) return <span className={cn("text-compact text-muted", className)}>New · {jobs(trust.verifiedJobs)}</span>;
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 whitespace-nowrap", className)}>
      <span className={cn("text-body font-semibold tabular-nums", style.text)}>{trust.score}</span>
      <span className="text-compact text-secondary">{BAND_LABEL[trust.band]}</span>
    </span>
  );
}

/** Card form: the number, what it means, and how much evidence stands behind it. */
export function TrustScoreSummary({ trust, className }: { trust: TrustScore; className?: string }) {
  const style = BAND_STYLE[trust.band];
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className={cn("flex size-11 shrink-0 flex-col items-center justify-center rounded-lg tabular-nums", style.bg, style.text)}
        aria-hidden
      >
        <span className="text-[1.0625rem] font-semibold leading-none">{trust.score ?? "—"}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-body font-medium text-primary">
          <span className="sr-only">TrustScore {trust.score ?? "not yet available"}, </span>
          {BAND_LABEL[trust.band]}
        </span>
        <span className="block truncate text-meta text-muted">
          {trust.score === null ? jobs(trust.verifiedJobs) : `${CONFIDENCE_LABEL[trust.confidence]} · ${jobs(trust.verifiedJobs)}`}
        </span>
      </span>
    </div>
  );
}

/** Full, explainable breakdown for profiles and vendor reviews. */
export function TrustScorePanel({ trust, audience = "consumer" }: { trust: TrustScore; audience?: "consumer" | "enterprise" }) {
  const style = BAND_STYLE[trust.band];
  return (
    <section aria-labelledby="trustscore-heading" className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="trustscore-heading" className="text-compact font-medium text-secondary">
            TrustScore
          </h2>
          <div className="mt-1 flex items-baseline gap-3">
            <span className={cn("text-[2.5rem] font-semibold leading-none tracking-[-0.03em] tabular-nums", style.text)}>
              {trust.score ?? "—"}
            </span>
            <span className="flex flex-col">
              <span className="text-heading text-primary">{BAND_LABEL[trust.band]}</span>
              <span className="text-compact text-muted">
                {trust.score === null ? "Not enough verified work to score yet" : CONFIDENCE_LABEL[trust.confidence]}
              </span>
            </span>
          </div>
          <p className="mt-2 text-compact text-secondary">Based on {jobs(trust.verifiedJobs)} signed off by customers.</p>
        </div>
      </div>

      <dl className="flex flex-col gap-3.5">
        {trust.dimensions.map((d) => (
          <div key={d.key} className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-x-3 gap-y-1">
            <dt className="text-body text-primary">{d.label}</dt>
            <dd className="row-span-2 text-right text-body font-semibold tabular-nums text-primary">{d.score ?? "—"}</dd>
            <dd className="col-start-1 flex flex-col gap-1">
              <div
                role="meter"
                aria-label={`${d.label} score`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={d.score ?? undefined}
                aria-valuetext={d.score === null ? "No data yet" : `${d.score} out of 100`}
                className="h-1.5 overflow-hidden rounded-full bg-neutral-subtle"
              >
                {d.score !== null && <div className={cn("h-full rounded-full", style.bar)} style={{ width: `${d.score}%` }} />}
              </div>
              <span className="text-meta text-muted">{d.basis}</span>
            </dd>
          </div>
        ))}
      </dl>

      <p className="flex gap-2 rounded-md bg-surface-muted p-3 text-meta text-secondary">
        <Info className="mt-px size-3.5 shrink-0 text-muted" aria-hidden />
        <span>
          {audience === "enterprise"
            ? `Calculated by TrustCraft from verified work orders, customer reviews, quotes and credentials. Scores appear after ${MIN_JOBS_FOR_SCORE} verified jobs; confidence rises with volume. Providers cannot edit or remove verified history.`
            : "Only jobs that customers signed off count. Providers can't edit their score or remove reviews."}
        </span>
      </p>
    </section>
  );
}
