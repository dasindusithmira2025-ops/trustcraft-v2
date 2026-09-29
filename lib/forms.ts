import type { z } from "zod";

/** What every form action returns. `fieldErrors` keys are input names. */
export type ActionResult = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string>; data?: Record<string, string> };

export const fieldErrorsOf = (error: z.ZodError): { fieldErrors: Record<string, string> } => {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
  return { fieldErrors };
};

/** Only same-app relative paths — never an open redirect. */
export const safePath = (next: unknown): string | undefined =>
  typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : undefined;

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "org";
