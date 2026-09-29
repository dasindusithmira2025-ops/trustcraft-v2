import "server-only";
import type { NextRequest } from "next/server";

/**
 * Server Actions are same-origin protected by Next.js. Route handlers that change state are not, so
 * they call this: a browser always sends `Origin` on a PUT/POST, and it must match the host it reached.
 * Requests without an Origin are refused — the session cookie alone is never enough to write.
 */
export function isSameOrigin(req: NextRequest | Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
