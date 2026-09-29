"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CITIES } from "@/features/requests/catalog";
import { logActivity } from "@/lib/activity";
import { getDb, schema as s } from "@/lib/db";
import { fieldErrorsOf, type ActionResult } from "@/lib/forms";
import { memberWith } from "@/lib/workspace";

const NOT_ALLOWED: ActionResult = { error: "You don't have permission to change customers." };

const Customer = z.object({
  org: z.string(),
  name: z.string().trim().min(2, "Enter the customer's name").max(120),
  phone: z.string().trim().max(30).optional(),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email address")]).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.union([z.literal(""), z.enum(CITIES)]).optional(),
});

export async function createCustomer(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = Customer.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const ctx = await memberWith(parsed.data.org, "customers.manage");
  if (!ctx || ctx.membership.kind !== "provider") return NOT_ALLOWED;
  const { name, phone, email, address, city } = parsed.data;
  const db = await getDb();
  const [created] = await db
    .insert(s.customers)
    .values({ providerOrgId: ctx.membership.orgId, name, phone: phone || null, email: email || null, address: address || null, city: city || null })
    .returning({ id: s.customers.id });
  await logActivity(db, { orgId: ctx.membership.orgId, customerId: created!.id, actorUserId: ctx.user.id, type: "customer_created", summary: `Customer added by ${ctx.user.name}` });
  redirect(`/w/${ctx.membership.slug}/customers/${created!.id}`);
}

export async function updateCustomer(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(form.get("id"));
  const parsed = Customer.safeParse(Object.fromEntries(form));
  if (!id.success) return { error: "Customer not found." };
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const ctx = await memberWith(parsed.data.org, "customers.manage");
  if (!ctx) return NOT_ALLOWED;
  const db = await getDb();
  const [before] = await db.select().from(s.customers).where(and(eq(s.customers.id, id.data), eq(s.customers.providerOrgId, ctx.membership.orgId)));
  if (!before) return { error: "Customer not found." };
  const { name, phone, email, address, city } = parsed.data;
  // Customers linked to a TrustCraft account or organization keep the name that account uses.
  const next = { name: before.userId || before.clientOrgId ? before.name : name, phone: phone || null, email: email || null, address: address || null, city: city || null };
  await db.update(s.customers).set(next).where(eq(s.customers.id, before.id));
  const changed = (["name", "phone", "email", "address", "city"] as const).filter((k) => (before[k] ?? null) !== next[k]);
  if (changed.length) {
    await logActivity(db, { orgId: ctx.membership.orgId, customerId: before.id, actorUserId: ctx.user.id, type: "customer_updated", summary: `${ctx.user.name} updated the customer's ${changed.join(", ")}`, data: { changed } });
  }
  refresh();
  return { ok: true, message: "Saved" };
}

const Note = z.object({ org: z.string(), customerId: z.string().uuid(), body: z.string().trim().min(1, "Write the note first").max(2000) });

export async function addCustomerNote(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = Note.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const ctx = await memberWith(parsed.data.org, "customers.manage");
  if (!ctx) return NOT_ALLOWED;
  const db = await getDb();
  const [customer] = await db.select({ id: s.customers.id }).from(s.customers).where(and(eq(s.customers.id, parsed.data.customerId), eq(s.customers.providerOrgId, ctx.membership.orgId)));
  if (!customer) return { error: "Customer not found." };
  await db.insert(s.customerNotes).values({ customerId: customer.id, authorUserId: ctx.user.id, body: parsed.data.body });
  await logActivity(db, { orgId: ctx.membership.orgId, customerId: customer.id, actorUserId: ctx.user.id, type: "note", summary: `Note added — ${parsed.data.body.length > 60 ? `${parsed.data.body.slice(0, 57)}…` : parsed.data.body}` });
  refresh();
  return { ok: true, message: "Note added" };
}

export async function deleteCustomerNote(org: string, noteId: string): Promise<ActionResult> {
  const ctx = await memberWith(org, "customers.manage");
  if (!ctx || !z.string().uuid().safeParse(noteId).success) return NOT_ALLOWED;
  const db = await getDb();
  const [note] = await db
    .select({ id: s.customerNotes.id, authorUserId: s.customerNotes.authorUserId })
    .from(s.customerNotes)
    .innerJoin(s.customers, eq(s.customers.id, s.customerNotes.customerId))
    .where(and(eq(s.customerNotes.id, noteId), eq(s.customers.providerOrgId, ctx.membership.orgId)));
  if (!note) return { error: "That note no longer exists." };
  // People delete their own notes; owners and admins can clear any.
  if (note.authorUserId !== ctx.user.id && ctx.membership.role !== "owner" && ctx.membership.role !== "admin") return { error: "You can only delete your own notes." };
  await db.delete(s.customerNotes).where(eq(s.customerNotes.id, note.id));
  refresh();
  return { ok: true };
}
