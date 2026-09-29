"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { PRIORITY } from "@/components/app/status";
import { Button, buttonClass } from "@/components/ui/button";
import { describedBy, Field, Input, Select, Textarea } from "@/components/ui/field";
import { CATEGORIES, CITIES } from "@/features/requests/catalog";
import { PRIORITIES } from "@/lib/db/schema";
import { formatDateShort } from "@/lib/format";
import type { ActionResult } from "@/lib/forms";
import { createPlan, updatePlan } from "../actions";
import { describeCadence, firstOccurrence } from "../schedule";

type Customer = { id: string; name: string; address: string | null; city: string | null };
type Tech = { id: string; name: string };
export type PlanValues = {
  id?: string;
  customerId: string;
  title: string;
  description: string;
  categoryId: string;
  priority: string;
  address: string;
  city: string;
  preferredUserId: string;
  durationMinutes: number;
  startTime: string;
  intervalUnit: string;
  intervalCount: number;
  weekday: number | null;
  startsOn: string;
  endsOn: string;
  amount: string;
  checklist: string;
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Create or edit a recurring service. The line under the form says, in words, what it will do. */
export function PlanForm({ org, customers, technicians, categories, values, cancelHref, locale, timezone }: { org: string; customers: Customer[]; technicians: Tech[]; categories: string[]; values: PlanValues; cancelHref: string; locale: string; timezone: string }) {
  const editing = Boolean(values.id);
  const [state, action, pending] = useActionState<ActionResult, FormData>(editing ? updatePlan : createPlan, {});
  const [customerId, setCustomerId] = useState(values.customerId);
  const [address, setAddress] = useState(values.address);
  const [unit, setUnit] = useState(values.intervalUnit);
  const [every, setEvery] = useState(String(values.intervalCount));
  const [weekday, setWeekday] = useState(values.weekday === null ? "0" : String(values.weekday));
  const [startsOn, setStartsOn] = useState(values.startsOn);
  const [priority, setPriority] = useState(values.priority);
  const err = state.fieldErrors ?? {};
  const customer = customers.find((c) => c.id === customerId);

  const summary = useMemo(() => {
    const n = Math.max(1, Number(every) || 1);
    const cadence = { unit: unit as "day" | "week" | "month", every: n, weekday: unit === "week" ? Number(weekday) : null };
    const first = startsOn ? firstOccurrence(startsOn, cadence) : null;
    return `${describeCadence(cadence)}${first ? ` — first visit ${formatDateShort(new Date(`${first}T12:00:00Z`), { locale, timezone: "UTC" })}` : ""}`;
  }, [unit, every, weekday, startsOn, locale]);
  void timezone;

  return (
    <form action={action} className="flex flex-col gap-8">
      <input type="hidden" name="org" value={org} />
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-heading text-primary">The service</legend>
        <Field id="customerId" label="Customer" error={err.customerId}>
          <Select
            {...describedBy("customerId", err.customerId)}
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              const c = customers.find((x) => x.id === e.target.value);
              if (c?.address && !address) setAddress(c.address);
            }}
            required
          >
            <option value="" disabled>
              Choose a customer…
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="title" label="Service" error={err.title}>
          <Input {...describedBy("title", err.title)} defaultValue={values.title} required maxLength={120} placeholder="e.g. Quarterly split AC service" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="categoryId" label="Kind of work" error={err.categoryId}>
            <Select {...describedBy("categoryId", err.categoryId)} defaultValue={values.categoryId || categories[0]} required>
              {CATEGORIES.filter((c) => categories.includes(c.id)).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="preferredUserId" label="Preferred technician" optional hint="Visits are booked straight to them. Leave empty to assign each in dispatch.">
            <Select id="preferredUserId" name="preferredUserId" defaultValue={values.preferredUserId}>
              <option value="">— Decide each time —</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field id="address" label="Where" error={err.address} hint={customer?.address && address !== customer.address ? `The customer's usual address is ${customer.address}` : undefined}>
          <Input {...describedBy("address", err.address, true)} value={address} onChange={(e) => setAddress(e.target.value)} required maxLength={300} autoComplete="off" />
        </Field>
        <Field id="city" label="Area" optional hint="Checked against your service areas when visits are booked.">
          <Select id="city" name="city" defaultValue={values.city || customer?.city || ""}>
            <option value="">—</option>
            {CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field id="description" label="What each visit involves" optional>
          <Textarea id="description" name="description" defaultValue={values.description} maxLength={1500} />
        </Field>
        <Field id="checklist" label="Checklist" optional hint="One step per line. Every visit starts with these.">
          <Textarea id="checklist" name="checklist" defaultValue={values.checklist} maxLength={2000} placeholder={"Clean filters and coil\nCheck drain\nTest cooling"} className="min-h-24" />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-heading text-primary">How often</legend>
        <div className="flex flex-wrap items-end gap-3">
          <Field id="intervalCount" label="Every" error={err.intervalCount}>
            <Input {...describedBy("intervalCount", err.intervalCount)} type="number" min={1} max={24} value={every} onChange={(e) => setEvery(e.target.value)} className="w-20" required />
          </Field>
          <Field id="intervalUnit" label="Unit">
            <Select id="intervalUnit" name="intervalUnit" value={unit} onChange={(e) => setUnit(e.target.value)} className="w-32">
              <option value="day">{every === "1" ? "day" : "days"}</option>
              <option value="week">{every === "1" ? "week" : "weeks"}</option>
              <option value="month">{every === "1" ? "month" : "months"}</option>
            </Select>
          </Field>
          {unit === "week" && (
            <Field id="weekday" label="On" error={err.weekday}>
              <Select {...describedBy("weekday", err.weekday)} value={weekday} onChange={(e) => setWeekday(e.target.value)} className="w-40">
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="startsOn" label="Starts" error={err.startsOn}>
            <Input {...describedBy("startsOn", err.startsOn)} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
          </Field>
          <Field id="endsOn" label="Ends" optional error={err.endsOn}>
            <Input {...describedBy("endsOn", err.endsOn)} type="date" defaultValue={values.endsOn} />
          </Field>
          <Field id="startTime" label="Visit time" error={err.startTime}>
            <Input {...describedBy("startTime", err.startTime)} type="time" defaultValue={values.startTime} step={900} required />
          </Field>
          <Field id="durationMinutes" label="Takes (minutes)" error={err.durationMinutes}>
            <Input {...describedBy("durationMinutes", err.durationMinutes)} type="number" min={15} max={720} step={15} defaultValue={values.durationMinutes} required />
          </Field>
        </div>
        <p className="rounded-md bg-brand-subtle px-3 py-2 text-compact text-brand-text" aria-live="polite">
          {summary}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-heading text-primary">Priority and price</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PRIORITIES.map((p) => (
            <label key={p} className={`flex cursor-pointer flex-col rounded-lg border p-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-focus ${priority === p ? "border-brand bg-brand-subtle" : "border-border hover:bg-surface-hover"}`}>
              <input type="radio" name="priority" value={p} checked={priority === p} onChange={() => setPriority(p)} className="sr-only" />
              <span className={`text-body font-medium ${PRIORITY[p].className}`}>{PRIORITY[p].label}</span>
            </label>
          ))}
        </div>
        <Field id="amount" label="Price per visit" optional hint="Becomes the agreed price on every work order." error={err.amount}>
          <Input {...describedBy("amount", err.amount, true)} inputMode="decimal" defaultValue={values.amount} className="w-48 tabular-nums" placeholder="e.g. 6,500" />
        </Field>
      </fieldset>

      {editing && <p className="text-compact text-muted">Changes apply to visits that haven&apos;t been created yet. Work orders already created keep their details.</p>}
      {state.error && (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-compact text-danger">
          {state.error}
        </p>
      )}
      <div className="flex gap-2 border-t border-border pt-5">
        <Button type="submit" variant="primary" size="lg" pending={pending}>
          {editing ? "Save changes" : "Create recurring service"}
        </Button>
        <Link href={cancelHref} className={buttonClass({ variant: "ghost", size: "lg" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
