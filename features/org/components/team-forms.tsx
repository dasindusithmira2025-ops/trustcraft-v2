"use client";

import { Check, Copy, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition, type ReactNode } from "react";
import { CheckTile, FormStatus } from "@/components/app/form-status";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, SheetContent } from "@/components/ui/dialog";
import { Field, Input, Select, describedBy } from "@/components/ui/field";
import { CATEGORIES } from "@/features/requests/catalog";
import type { Role } from "@/lib/db/schema";
import type { ActionResult } from "@/lib/forms";
import { NOTIFICATION_CATEGORIES } from "@/lib/db/schema";
import { ROLE_LABEL } from "@/lib/permissions";
import { addTimeOff, changeMemberRole, inviteMember, removeMember, removeTimeOff, revokeInvitation, saveInvoiceDefaults, saveMemberProfile, saveModulesAction, saveNotificationPrefs } from "../actions";

function CopyLink({ path, label = "Copy link" }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this link", url);
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? "Copied" : label}
    </Button>
  );
}

/** Invite one person. There is no email transport yet, so the owner receives a link to send themselves. */
export function InviteForm({ org, roles, next, compact }: { org: string; roles: readonly Role[]; next?: string; compact?: boolean }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(inviteMember, {});
  const [role, setRole] = useState<Role>(roles.includes("technician") ? "technician" : roles[0]!);
  const link = state.data?.path;
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="org" value={org} />
      {next && <input type="hidden" name="next" value={next} />}
      <div className={compact ? "grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]" : "grid gap-4 sm:grid-cols-2"}>
        <Field id="email" label="Email address" error={state.fieldErrors?.email}>
          <Input {...describedBy("email", state.fieldErrors?.email)} type="email" autoComplete="off" placeholder="name@company.com" required />
        </Field>
        <Field id="role" label="Role" error={state.fieldErrors?.role}>
          <Select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        {!compact && (
          <Field id="title" label="Job title" optional>
            <Input id="title" name="title" maxLength={60} placeholder="e.g. Senior HVAC technician" />
          </Field>
        )}
      </div>
      {role === "technician" && (
        <fieldset>
          <legend className="text-compact font-medium text-primary">Skills</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map((c) => (
              <CheckTile key={c.id} type="checkbox" name="skills" value={c.id}>
                {c.name}
              </CheckTile>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" pending={pending}>
          Create invitation
        </Button>
        <FormStatus state={state} />
      </div>
      {link && (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-success/30 bg-success-subtle px-4 py-3">
          <p className="text-body text-primary">
            Send this link to <span className="font-medium">{state.data?.email}</span>. It works once, for that address, for 14 days.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2 py-1.5 text-compact text-secondary">{typeof window === "undefined" ? link : `${window.location.origin}${link}`}</code>
            <CopyLink path={link} />
          </div>
        </div>
      )}
    </form>
  );
}

export function RevokeInvite({ org, id, email }: { org: string; id: string; email: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" pending={pending} aria-label={`Revoke invitation for ${email}`} onClick={() => start(async () => void (await revokeInvitation(org, id)))}>
      Revoke
    </Button>
  );
}

/** Role menu and removal for one member. The server refuses anything unsafe (last owner, changing an owner). */
export function MemberControls({ org, userId, name, role, roles, isOwner, isSelf }: { org: string; userId: string; name: string; role: Role; roles: readonly Role[]; isOwner: boolean; isSelf: boolean }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex items-center gap-2">
      {isOwner ? (
        <span className="px-2 text-compact text-muted">Owner</span>
      ) : (
        <Select
          aria-label={`Role for ${name}`}
          value={role}
          disabled={pending}
          className="h-8 w-36"
          onChange={(e) =>
            start(async () => {
              const res = await changeMemberRole(org, userId, e.target.value as Role);
              setError(res.error);
            })
          }
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
      )}
      {!isSelf && (
        <>
          <Button variant="ghost" size="sm" aria-label={`Remove ${name}`} onClick={() => setConfirm(true)}>
            <Trash2 aria-hidden />
          </Button>
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title={`Remove ${name}?`}
            description="They lose access to this organization immediately. Any visits already booked for them go back to dispatch as unassigned."
            confirmLabel="Remove from team"
            pending={pending}
            onConfirm={() =>
              start(async () => {
                const res = await removeMember(org, userId);
                setError(res.error);
                if (!res.error) setConfirm(false);
              })
            }
          />
        </>
      )}
      {error && (
        <span role="alert" className="text-meta text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

export function MemberSkillsForm({ org, userId, title, skills, onDone }: { org: string; userId: string; title: string | null; skills: string[]; onDone?: () => void }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(async (prev, form) => {
    const res = await saveMemberProfile(prev, form);
    if (res.ok) onDone?.();
    return res;
  }, {});
  return (
    <form action={action} className="flex flex-col gap-4 p-5">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="userId" value={userId} />
      <Field id="title" label="Job title" optional>
        <Input id="title" name="title" defaultValue={title ?? ""} maxLength={60} />
      </Field>
      <fieldset>
        <legend className="text-compact font-medium text-primary">Skills</legend>
        <p className="mt-0.5 text-meta text-muted">Dispatch uses skills to suggest the right technician and to warn about a poor fit.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <CheckTile key={c.id} type="checkbox" name="skills" value={c.id} defaultChecked={skills.includes(c.id)}>
              {c.name}
            </CheckTile>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" pending={pending}>
          Save
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export function TimeOffForm({ org, members, today }: { org: string; members: { id: string; name: string }[]; today: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(addTimeOff, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,1fr))_minmax(0,1.2fr)_auto] lg:items-end">
      <input type="hidden" name="org" value={org} />
      <Field id="userId" label="Who" error={state.fieldErrors?.userId}>
        <Select {...describedBy("userId", state.fieldErrors?.userId)} defaultValue="">
          <option value="" disabled>
            Choose a person
          </option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="startsOn" label="First day off" error={state.fieldErrors?.startsOn}>
        <Input {...describedBy("startsOn", state.fieldErrors?.startsOn)} type="date" defaultValue={today} required />
      </Field>
      <Field id="endsOn" label="Last day off" error={state.fieldErrors?.endsOn}>
        <Input {...describedBy("endsOn", state.fieldErrors?.endsOn)} type="date" defaultValue={today} required />
      </Field>
      <Field id="reason" label="Reason" optional>
        <Input id="reason" name="reason" maxLength={80} placeholder="Annual leave" />
      </Field>
      <Button type="submit" variant="secondary" pending={pending}>
        Add time off
      </Button>
      <div className="sm:col-span-2 lg:col-span-full">
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export function RemoveTimeOff({ org, id, label }: { org: string; id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" pending={pending} aria-label={`Remove time off: ${label}`} onClick={() => start(async () => void (await removeTimeOff(org, id)))}>
      <Trash2 aria-hidden />
    </Button>
  );
}

const CATEGORY_LABEL: Record<(typeof NOTIFICATION_CATEGORIES)[number], { label: string; hint: string }> = {
  assignment: { label: "Assignments", hint: "Jobs assigned, rescheduled or moved" },
  work: { label: "Work updates", hint: "Progress on work you follow" },
  quote: { label: "Quotes and requests", hint: "New requests, quotes sent, accepted or declined" },
  verification: { label: "Verification", hint: "Work completed and ready to verify" },
  invoice: { label: "Invoices and payments", hint: "Invoices issued, payments received, overdue balances" },
  sla: { label: "SLA warnings", hint: "Jobs close to or past their deadline" },
  team: { label: "Team", hint: "People joining or leaving" },
  system: { label: "Everything else", hint: "Product and security notices" },
};

export function NotificationPrefsForm({ muted }: { muted: Record<string, boolean> }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveNotificationPrefs, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {NOTIFICATION_CATEGORIES.map((c) => (
          <li key={c}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-surface-hover">
              <input type="checkbox" name="on" value={c} defaultChecked={muted[c] !== false} className="size-4 accent-brand" />
              <span className="min-w-0">
                <span className="block text-body font-medium text-primary">{CATEGORY_LABEL[c].label}</span>
                <span className="block text-compact text-muted">{CATEGORY_LABEL[c].hint}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-compact text-muted">Anything that needs your action — like verifying finished work — is always delivered, whatever you choose here.</p>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" pending={pending}>
          Save preferences
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export function InvoiceDefaultsForm({ org, taxPercent, taxLabel, paymentTermsDays, footer }: { org: string; taxPercent: string; taxLabel: string; paymentTermsDays: number; footer: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveInvoiceDefaults, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="org" value={org} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="taxLabel" label="Tax name" error={state.fieldErrors?.taxLabel}>
          <Input {...describedBy("taxLabel", state.fieldErrors?.taxLabel)} defaultValue={taxLabel} />
        </Field>
        <Field id="taxPercent" label="Tax rate (%)" hint="Use 0 if you don't charge tax." error={state.fieldErrors?.taxPercent}>
          <Input {...describedBy("taxPercent", state.fieldErrors?.taxPercent, true)} inputMode="decimal" defaultValue={taxPercent} />
        </Field>
        <Field id="paymentTermsDays" label="Payment terms (days)" error={state.fieldErrors?.paymentTermsDays}>
          <Input {...describedBy("paymentTermsDays", state.fieldErrors?.paymentTermsDays)} type="number" min={0} max={120} defaultValue={paymentTermsDays} />
        </Field>
      </div>
      <Field id="invoiceFooter" label="Invoice footer" optional hint="Bank details or a thank-you line, printed on every invoice.">
        <Input id="invoiceFooter" name="invoiceFooter" defaultValue={footer} maxLength={400} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" pending={pending}>
          Save defaults
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

const MODULE_INFO = {
  dispatch: { label: "Dispatch board", hint: "See every technician's day and assign unscheduled work." },
  recurring: { label: "Recurring work", hint: "Repeat services — quarterly AC service, weekly inspections." },
  reports: { label: "Reports", hint: "Completed work, revenue, quote conversion and SLA performance." },
} as const;

export function ModulesForm({ org, enabled, segment }: { org: string; enabled: string[]; segment: string }): ReactNode {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveModulesAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="org" value={org} />
      <ul className="divide-y divide-border rounded-lg border border-border">
        {(Object.keys(MODULE_INFO) as (keyof typeof MODULE_INFO)[]).map((m) => (
          <li key={m}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-surface-hover">
              <input type="checkbox" name="modules" value={m} defaultChecked={enabled.includes(m)} className="size-4 accent-brand" />
              <span className="min-w-0">
                <span className="block text-body font-medium text-primary">{MODULE_INFO[m].label}</span>
                <span className="block text-compact text-muted">{MODULE_INFO[m].hint}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-compact text-muted">Your workspace is set up for a {segment === "company" ? "service company" : segment === "team" ? "small team" : "solo professional"}. Turn tools on when you need them; they stay out of the way otherwise.</p>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" pending={pending}>
          Save modules
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

/** Opens the skills and title editor for one person in a side sheet. */
export function MemberEditButton({ org, userId, name, title, skills }: { org: string; userId: string; name: string; title: string | null; skills: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Edit ${name}'s title and skills`}>
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <SheetContent title={name} description="Title and skills">
          <MemberSkillsForm org={org} userId={userId} title={title} skills={skills} onDone={() => setOpen(false)} />
        </SheetContent>
      </Dialog>
    </>
  );
}
