"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { getDb, schema as s } from "@/lib/db";
import { fieldErrorsOf, type ActionResult } from "@/lib/forms";
import { memberWith } from "@/lib/workspace";
import { VIEW_KEYS, viewQuery } from "./keys";

const Save = z.object({
  org: z.string(),
  scope: z.enum(Object.keys(VIEW_KEYS) as [keyof typeof VIEW_KEYS]),
  name: z.string().trim().min(1, "Give the view a name").max(40, "Keep it under 40 characters"),
  query: z.string().max(600),
});

/** Saves the current filters, sort and columns as a personal view. Saving under an existing name updates it. */
export async function saveView(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = Save.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const ctx = await memberWith(parsed.data.org, "work.view_all");
  if (!ctx) return { error: "You can't save views here." };
  // Only the parameters that define a view are kept, whatever the browser sent.
  const incoming = Object.fromEntries(new URLSearchParams(parsed.data.query));
  const canonical = viewQuery(parsed.data.scope, incoming);
  if (!canonical) return { error: "Change a filter first — there's nothing to save yet." };
  const params = Object.fromEntries(new URLSearchParams(canonical));
  const db = await getDb();
  await db
    .insert(s.savedViews)
    .values({ userId: ctx.user.id, orgId: ctx.membership.orgId, scope: parsed.data.scope, name: parsed.data.name, params })
    .onConflictDoUpdate({ target: [s.savedViews.userId, s.savedViews.orgId, s.savedViews.scope, s.savedViews.name], set: { params } });
  refresh();
  return { ok: true, message: "View saved" };
}

export async function deleteView(org: string, id: string): Promise<ActionResult> {
  const ctx = await memberWith(org, "work.view_all");
  if (!ctx || !z.string().uuid().safeParse(id).success) return { error: "You can't change this view." };
  // Owner-scoped: a guessed id never touches someone else's view.
  await (await getDb()).delete(s.savedViews).where(and(eq(s.savedViews.id, id), eq(s.savedViews.userId, ctx.user.id), eq(s.savedViews.orgId, ctx.membership.orgId)));
  refresh();
  return { ok: true };
}
