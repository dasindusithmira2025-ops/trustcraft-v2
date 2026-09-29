/**
 * TrustScore engine. Deterministic and explainable: every number the UI shows is
 * traceable to verified work orders, customer reviews, quotes and credentials.
 * Runs on the server only — the client receives the finished breakdown.
 */

export type VerifiedJob = {
  rating: number | null; // 1–5 customer review, if left
  slaDueAt: Date | null;
  completedAt: Date;
  quotedMinor: number | null;
  finalMinor: number | null;
  /** Minutes from the request reaching the provider to their quote. */
  responseMinutes: number | null;
};

export type Credential = { name: string; expiresOn: string | null };

export type TrustInput = {
  jobs: VerifiedJob[];
  identityVerified: boolean;
  credentials: Credential[];
  now: Date;
};

export type DimensionKey = "quality" | "sla" | "response" | "quote" | "compliance";

export type TrustDimension = {
  key: DimensionKey;
  label: string;
  score: number | null;
  /** Plain-language evidence behind the number. */
  basis: string;
};

export type TrustBand = "excellent" | "strong" | "fair" | "weak" | "new";
export type Confidence = "high" | "medium" | "low";

export type TrustScore = {
  score: number | null;
  band: TrustBand;
  confidence: Confidence;
  verifiedJobs: number;
  dimensions: TrustDimension[];
};

const WEIGHTS: Record<DimensionKey, number> = { quality: 0.3, sla: 0.25, response: 0.15, quote: 0.15, compliance: 0.15 };

/** Minimum verified jobs before we publish an overall score at all. */
export const MIN_JOBS_FOR_SCORE = 3;

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const plural = (n: number, word: string) => `${n.toLocaleString("en")} ${word}${n === 1 ? "" : "s"}`;

function quality(jobs: VerifiedJob[]): TrustDimension {
  const ratings = jobs.map((j) => j.rating).filter((r): r is number => r !== null);
  if (ratings.length === 0) return { key: "quality", label: "Work quality", score: null, basis: "No reviews yet" };
  // Shrink toward a neutral prior so three 5-star reviews do not read as a perfect 100.
  const PRIOR_MEAN = 3.8, PRIOR_WEIGHT = 5;
  const mean = (ratings.reduce((a, b) => a + b, 0) + PRIOR_MEAN * PRIOR_WEIGHT) / (ratings.length + PRIOR_WEIGHT);
  const raw = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  return {
    key: "quality",
    label: "Work quality",
    score: Math.round(clamp(((mean - 1) / 4) * 100)),
    basis: `${raw.toFixed(1)} average from ${plural(ratings.length, "verified review")}`,
  };
}

function sla(jobs: VerifiedJob[]): TrustDimension {
  const withSla = jobs.filter((j) => j.slaDueAt);
  if (withSla.length === 0) return { key: "sla", label: "SLA compliance", score: null, basis: "No SLA-bound work yet" };
  const met = withSla.filter((j) => j.completedAt.getTime() <= j.slaDueAt!.getTime()).length;
  return {
    key: "sla",
    label: "SLA compliance",
    score: Math.round((met / withSla.length) * 100),
    basis: `${met.toLocaleString("en")} of ${plural(withSla.length, "job")} finished within SLA`,
  };
}

function response(jobs: VerifiedJob[]): TrustDimension {
  const times = jobs.map((j) => j.responseMinutes).filter((m): m is number => m !== null);
  if (times.length === 0) return { key: "response", label: "Response time", score: null, basis: "No quoted requests yet" };
  const m = median(times);
  // 30 min or faster scores 100; a full day scores 40; slower bottoms out at 20.
  const score = m <= 30 ? 100 : clamp(100 - ((m - 30) / (1440 - 30)) * 60, 20);
  const label = m < 60 ? `${Math.round(m)} min` : `${(m / 60).toFixed(m < 600 ? 1 : 0)} h`;
  return { key: "response", label: "Response time", score: Math.round(score), basis: `Median quote in ${label}` };
}

function quoteAccuracy(jobs: VerifiedJob[]): TrustDimension {
  const pairs = jobs.filter((j) => j.quotedMinor && j.finalMinor !== null);
  if (pairs.length === 0) return { key: "quote", label: "Quote accuracy", score: null, basis: "No quoted jobs yet" };
  const drift = pairs.map((j) => Math.abs(j.finalMinor! - j.quotedMinor!) / j.quotedMinor!);
  const onQuote = drift.filter((d) => d <= 0.05).length;
  const meanDrift = drift.reduce((a, b) => a + b, 0) / drift.length;
  return {
    key: "quote",
    label: "Quote accuracy",
    score: Math.round(clamp(100 - meanDrift * 200)),
    basis: `${onQuote} of ${plural(pairs.length, "job")} billed within 5% of quote`,
  };
}

function compliance(input: TrustInput): TrustDimension {
  const today = input.now.toISOString().slice(0, 10);
  const expired = input.credentials.filter((c) => c.expiresOn !== null && c.expiresOn < today);
  let score = input.identityVerified ? 100 : 60;
  score -= expired.length * 25;
  const parts = [input.identityVerified ? "Identity verified" : "Identity not verified"];
  parts.push(expired.length ? `${plural(expired.length, "credential")} expired` : `${plural(input.credentials.length, "credential")} current`);
  return { key: "compliance", label: "Compliance", score: clamp(score), basis: parts.join(" · ") };
}

export function bandFor(score: number | null): TrustBand {
  if (score === null) return "new";
  if (score >= 90) return "excellent";
  if (score >= 80) return "strong";
  if (score >= 65) return "fair";
  return "weak";
}

export function confidenceFor(verifiedJobs: number): Confidence {
  if (verifiedJobs >= 50) return "high";
  if (verifiedJobs >= 10) return "medium";
  return "low";
}

export function computeTrustScore(input: TrustInput): TrustScore {
  const dimensions = [quality(input.jobs), sla(input.jobs), response(input.jobs), quoteAccuracy(input.jobs), compliance(input)];
  const n = input.jobs.length;
  let score: number | null = null;
  if (n >= MIN_JOBS_FOR_SCORE) {
    // Missing dimensions are left out and the remaining weights renormalised.
    const scored = dimensions.filter((d) => d.score !== null);
    const totalWeight = scored.reduce((s, d) => s + WEIGHTS[d.key], 0);
    score = Math.round(scored.reduce((s, d) => s + d.score! * WEIGHTS[d.key], 0) / totalWeight);
  }
  return { score, band: bandFor(score), confidence: confidenceFor(n), verifiedJobs: n, dimensions };
}

export const BAND_LABEL: Record<TrustBand, string> = {
  excellent: "Excellent",
  strong: "Strong",
  fair: "Fair",
  weak: "Needs attention",
  new: "New on TrustCraft",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};
