/**
 * Which URL parameters make up a saved view, per screen. A view is exactly a bookmark of these —
 * filters, sort and visible columns — never the page number or which record happens to be open.
 */
export const VIEW_KEYS = {
  work_orders: ["view", "q", "priority", "category", "tech", "sort", "dir", "hide"],
} as const;

export type ViewScope = keyof typeof VIEW_KEYS;

/** The canonical, order-independent query string for the saved-view parameters in `params`. */
export function viewQuery(scope: ViewScope, params: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const key of [...VIEW_KEYS[scope]].sort()) {
    const v = params[key];
    const value = typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
    if (value) q.set(key, value);
  }
  return q.toString();
}
