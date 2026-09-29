import { CATEGORIES, type CategoryId } from "./catalog";

export type Suggestion = { categoryId: CategoryId; confidence: "strong" | "possible" };

/**
 * Symptom words that show up across trades ("water", "leak", "power"). They count, but
 * naming the equipment ("AC", "sink", "breaker") counts double — so "water dripping from
 * the AC" is air conditioning, not plumbing.
 */
const GENERIC = new Set(["water", "leak", "leaking", "drip", "hot", "cool", "cooling", "power", "light", "lights", "stuck", "clean", "gas", "air"]);

/**
 * Deterministic keyword classifier: turns plain language into a category suggestion.
 * Works with no AI provider; an optional model can refine it later.
 */
export function classify(text: string): Suggestion | null {
  const words = text.toLowerCase().match(/[a-z/]+/g) ?? [];
  if (words.length === 0) return null;
  const scores = CATEGORIES.map((c) => ({
    id: c.id,
    score: words.reduce((sum, w) => sum + ((c.keywords as readonly string[]).includes(w) ? (GENERIC.has(w) ? 1 : 2) : 0), 0),
  })).sort((a, b) => b.score - a.score);
  const [best, next] = scores;
  if (!best || best.score === 0) return null;
  return { categoryId: best.id, confidence: best.score >= 3 && best.score > (next?.score ?? 0) ? "strong" : "possible" };
}
