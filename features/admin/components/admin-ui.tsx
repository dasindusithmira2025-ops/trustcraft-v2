"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState } from "react";
import { FormStatus } from "@/components/app/form-status";
import { Button } from "@/components/ui/button";
import { describedBy, Field, Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { ActionResult } from "@/lib/forms";
import { setProviderVerification, signUserOutEverywhere } from "../actions";

const NAV = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/providers", label: "Providers & verification" },
  { href: "/admin/work-orders", label: "Work orders" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/audit", label: "Audit" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex flex-col gap-px">
      {NAV.map((n) => {
        const active = n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("flex h-8 items-center rounded-md px-2 text-body transition-colors", active ? "bg-sidebar-active font-medium text-primary" : "text-secondary hover:bg-surface-hover hover:text-primary")}>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Reason + typed confirmation: privileged changes are deliberate, and the reason is kept. */
function Danger({ children, state }: { children: React.ReactNode; state: ActionResult }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-danger/25 bg-danger-subtle/40 p-4">
      <p className="flex items-center gap-2 text-compact font-medium text-danger">
        <ShieldAlert className="size-4" aria-hidden /> Privileged action — recorded with your name and reason
      </p>
      {children}
      <FormStatus state={state} />
    </div>
  );
}

export function VerificationForm({ slug, verified }: { slug: string; verified: boolean }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(setProviderVerification, {});
  const err = state.fieldErrors ?? {};
  return (
    <form action={action}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="verified" value={verified ? "no" : "yes"} />
      <Danger state={state}>
        <Field id="reason" label={verified ? "Why is verification being removed?" : "What was checked?"} error={err.reason}>
          <Textarea {...describedBy("reason", err.reason)} className="min-h-16" required maxLength={300} />
        </Field>
        <Field id="confirm" label={`Type “${slug}” to confirm`} error={err.confirm}>
          <Input {...describedBy("confirm", err.confirm)} autoComplete="off" required />
        </Field>
        <Button type="submit" variant={verified ? "danger" : "primary"} pending={pending} className="self-start">
          {verified ? "Remove verification" : "Verify provider"}
        </Button>
      </Danger>
    </form>
  );
}

export function SignOutEverywhereForm({ userId, email }: { userId: string; email: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(signUserOutEverywhere, {});
  const err = state.fieldErrors ?? {};
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <Danger state={state}>
        <Field id="reason" label="Reason" error={err.reason}>
          <Textarea {...describedBy("reason", err.reason)} className="min-h-16" required maxLength={300} placeholder="e.g. Reported lost phone" />
        </Field>
        <Field id="confirm" label={`Type ${email} to confirm`} error={err.confirm}>
          <Input {...describedBy("confirm", err.confirm)} autoComplete="off" required />
        </Field>
        <Button type="submit" variant="danger" pending={pending} className="self-start">
          Sign out everywhere
        </Button>
      </Danger>
    </form>
  );
}
