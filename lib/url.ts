export type Params = Record<string, string | string[] | undefined>;

/** Rebuilds a URL from current search params with a patch applied (null removes a key). */
export function withParams(pathname: string, params: Params, patch: Record<string, string | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v !== "") q.set(k, v);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "") q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  return s ? `${pathname}?${s}` : pathname;
}

/** First value of a search param as a string. */
export const param = (params: Params, key: string) => {
  const v = params[key];
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
};

/** Reads a param constrained to an allowed set, falling back to the first. */
export function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}
