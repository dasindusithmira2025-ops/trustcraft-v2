"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { CheckTile, FormStatus } from "@/components/app/form-status";
import { useCloseSheet } from "@/components/app/sheet-form";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, describedBy } from "@/components/ui/field";
import { CATEGORIES, CITIES, areasByProvince, categoryName } from "@/features/requests/catalog";
import { WEEKDAYS, type BusinessHours } from "@/lib/db/schema";
import type { ActionResult } from "@/lib/forms";
import { addCredential, approveProviders, createLocation, saveGeneral, saveHoursAction, saveServiceAreasAction, saveServicesAction } from "../actions";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/** Shared skeleton: hidden org/next, the fields, a submit button and the outcome. */
function SetupForm({ action, org, next, submit, secondary, children }: { action: Action; org: string; next?: string; submit: string; secondary?: ReactNode; children: (s: ActionResult) => ReactNode }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, {});
  const closeSheet = useCloseSheet();
  useEffect(() => {
    if (state.ok) closeSheet();
  }, [state, closeSheet]);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="org" value={org} />
      {next && <input type="hidden" name="next" value={next} />}
      {children(state)}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" pending={pending}>
          {submit}
        </Button>
        {secondary}
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export function ServicesForm({ org, selected, next, submit = "Save services", secondary }: { org: string; selected: string[]; next?: string; submit?: string; secondary?: ReactNode }) {
  return (
    <SetupForm action={saveServicesAction} org={org} next={next} submit={submit} secondary={secondary}>
      {(state) => (
        <fieldset>
          <legend className="sr-only">Services you offer</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CATEGORIES.map((c) => (
              <CheckTile key={c.id} type="checkbox" name="categories" value={c.id} defaultChecked={selected.includes(c.id)}>
                {c.name}
              </CheckTile>
            ))}
          </div>
          {state.fieldErrors?.categories && (
            <p role="alert" className="mt-2 text-meta text-danger">
              {state.fieldErrors.categories}
            </p>
          )}
        </fieldset>
      )}
    </SetupForm>
  );
}

export function ServiceAreasForm({ org, selected, next, submit = "Save areas", secondary }: { org: string; selected: { city: string; radiusKm: number | null }[]; next?: string; submit?: string; secondary?: ReactNode }) {
  const [chosen, setChosen] = useState(() => new Set(selected.map((s) => s.city)));
  const groups = [...areasByProvince().entries()];
  return (
    <SetupForm action={saveServiceAreasAction} org={org} next={next} submit={submit} secondary={secondary}>
      {(state) => (
        <>
          <div className="flex flex-col gap-5">
            {groups.map(([province, districts]) => (
              <fieldset key={province}>
                <legend className="text-compact font-medium text-primary">{province} Province</legend>
                <div className="mt-2 flex flex-col gap-3">
                  {[...districts.entries()].map(([district, cities]) => (
                    <div key={district}>
                      <p className="mb-1.5 text-meta text-muted">{district} district</p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {cities.map((city) => {
                          const on = chosen.has(city);
                          const radius = selected.find((s) => s.city === city)?.radiusKm;
                          return (
                            <div key={city} className="flex flex-col gap-1.5">
                              <CheckTile
                                type="checkbox"
                                name="city"
                                value={city}
                                checked={on}
                                onChange={(e) => setChosen((prev) => (e.target.checked ? new Set(prev).add(city) : new Set([...prev].filter((c) => c !== city))))}
                              >
                                {city}
                              </CheckTile>
                              {on && (
                                <label className="flex items-center gap-2 pl-1 text-meta text-muted">
                                  Travels up to
                                  <Input name={`radius:${city}`} type="number" min={1} max={500} inputMode="numeric" defaultValue={radius ?? ""} placeholder="—" aria-label={`${city} travel radius in kilometres`} className="h-7 w-16 px-2 text-compact" />
                                  km beyond
                                </label>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          {state.fieldErrors?.city && (
            <p role="alert" className="text-meta text-danger">
              {state.fieldErrors.city}
            </p>
          )}
        </>
      )}
    </SetupForm>
  );
}

const DAY_LABEL: Record<(typeof WEEKDAYS)[number], string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

export function HoursForm({ org, hours, next, submit = "Save hours", secondary }: { org: string; hours: BusinessHours; next?: string; submit?: string; secondary?: ReactNode }) {
  const [closed, setClosed] = useState<Record<string, boolean>>(() => Object.fromEntries(WEEKDAYS.map((d) => [d, hours[d] === null])));
  return (
    <SetupForm action={saveHoursAction} org={org} next={next} submit={submit} secondary={secondary}>
      {(state) => (
        <div className="divide-y divide-border rounded-lg border border-border">
          {WEEKDAYS.map((d) => (
            <div key={d} className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:grid-cols-[7rem_auto_minmax(0,1fr)] sm:gap-x-4">
              <span className="text-body font-medium text-primary">{DAY_LABEL[d]}</span>
              <div className="flex min-w-0 items-center gap-2">
                <Input name={`${d}:open`} type="time" defaultValue={hours[d]?.open ?? "08:00"} disabled={closed[d]} aria-label={`${DAY_LABEL[d]} opens`} className="h-8 min-w-0 flex-1 sm:w-28 sm:flex-none" />
                <span className="text-muted" aria-hidden>
                  –
                </span>
                <Input name={`${d}:close`} type="time" defaultValue={hours[d]?.close ?? "17:00"} disabled={closed[d]} aria-label={`${DAY_LABEL[d]} closes`} className="h-8 min-w-0 flex-1 sm:w-28 sm:flex-none" />
              </div>
              <label className="col-span-full flex items-center gap-2 text-compact text-secondary sm:col-span-1 sm:justify-self-end">
                <input type="checkbox" name={`${d}:closed`} checked={closed[d]} onChange={(e) => setClosed((c) => ({ ...c, [d]: e.target.checked }))} className="size-4 accent-brand" />
                Closed
              </label>
              {state.fieldErrors?.[d] && (
                <p role="alert" className="col-span-full text-meta text-danger">
                  {state.fieldErrors[d]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </SetupForm>
  );
}

export function CredentialForm({ org, next, submit = "Add credential", secondary }: { org: string; next?: string; submit?: string; secondary?: ReactNode }) {
  return (
    <SetupForm action={addCredential} org={org} next={next} submit={submit} secondary={secondary}>
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label="Licence or certificate" error={state.fieldErrors?.name} className="sm:col-span-2">
            <Input {...describedBy("name", state.fieldErrors?.name)} placeholder="e.g. Electrician licence, NVQ Level 3 — Plumbing" />
          </Field>
          <Field id="issuer" label="Issued by" error={state.fieldErrors?.issuer}>
            <Input {...describedBy("issuer", state.fieldErrors?.issuer)} placeholder="e.g. Public Utilities Commission" />
          </Field>
          <Field id="expiresOn" label="Expires" optional>
            <Input id="expiresOn" name="expiresOn" type="date" />
          </Field>
        </div>
      )}
    </SetupForm>
  );
}

export function SiteForm({ org, sites, next, submit = "Add site", secondary }: { org: string; sites?: { id: string; name: string }[]; next?: string; submit?: string; secondary?: ReactNode }) {
  return (
    <SetupForm action={createLocation} org={org} next={next} submit={submit} secondary={secondary}>
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label="Name" error={state.fieldErrors?.name} className="sm:col-span-2">
            <Input {...describedBy("name", state.fieldErrors?.name)} placeholder="e.g. Head office, Colombo warehouse" />
          </Field>
          <Field id="address" label="Address" optional className="sm:col-span-2">
            <Input id="address" name="address" autoComplete="street-address" />
          </Field>
          <Field id="city" label="City" error={state.fieldErrors?.city}>
            <Select {...describedBy("city", state.fieldErrors?.city)} defaultValue="">
              <option value="" disabled>
                Choose a city
              </option>
              {CITIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          {sites && sites.length > 0 && (
            <Field id="parentId" label="Inside" optional hint="Leave empty for a top-level site.">
              <Select id="parentId" name="parentId" defaultValue="">
                <option value="">— Top-level site —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      )}
    </SetupForm>
  );
}

export type ProviderOption = { id: string; name: string; headline: string; categories: string[]; verified: boolean };

export function ProviderPicker({ org, providers, approved, next, submit = "Approve selected", secondary }: { org: string; providers: ProviderOption[]; approved: string[]; next?: string; submit?: string; secondary?: ReactNode }) {
  return (
    <SetupForm action={approveProviders} org={org} next={next} submit={submit} secondary={secondary}>
      {(state) => (
        <fieldset>
          <legend className="sr-only">Providers to approve</legend>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {providers.map((p) => {
              const already = approved.includes(p.id);
              return (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-surface-hover has-disabled:cursor-default has-disabled:opacity-70">
                    <input type="checkbox" name="providers" value={p.id} disabled={already} className="size-4 accent-brand" />
                    <Avatar name={p.name} kind="org" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-medium text-primary">
                        {p.name}
                        {p.verified && <span className="ml-1.5 text-meta font-normal text-success">Verified</span>}
                        {already && <span className="ml-1.5 text-meta font-normal text-muted">Approved</span>}
                      </span>
                      <span className="block truncate text-compact text-muted">{p.categories.map(categoryName).join(" · ")}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {state.fieldErrors?.providers && (
            <p role="alert" className="mt-2 text-meta text-danger">
              {state.fieldErrors.providers}
            </p>
          )}
        </fieldset>
      )}
    </SetupForm>
  );
}

const ZONES = ["Asia/Colombo", "Asia/Kolkata", "Asia/Dhaka", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York"];

export function GeneralForm({ org, isProvider, values }: { org: string; isProvider: boolean; values: { name: string; phone: string; email: string; address: string; timezone: string; headline: string; about: string } }) {
  return (
    <SetupForm action={saveGeneral} org={org} submit="Save changes">
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label="Organization name" error={state.fieldErrors?.name} className="sm:col-span-2">
            <Input {...describedBy("name", state.fieldErrors?.name)} defaultValue={values.name} required />
          </Field>
          <Field id="phone" label="Phone" optional>
            <Input id="phone" name="phone" type="tel" defaultValue={values.phone} autoComplete="tel" />
          </Field>
          <Field id="email" label="Contact email" optional error={state.fieldErrors?.email}>
            <Input {...describedBy("email", state.fieldErrors?.email)} type="email" defaultValue={values.email} />
          </Field>
          <Field id="address" label="Address" optional className="sm:col-span-2">
            <Input id="address" name="address" defaultValue={values.address} autoComplete="street-address" />
          </Field>
          <Field id="timezone" label="Timezone" hint="Schedules, SLA clocks and invoice dates use this.">
            <Select id="timezone" name="timezone" defaultValue={values.timezone}>
              {ZONES.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </Select>
          </Field>
          {isProvider && (
            <>
              <Field id="headline" label="Public headline" hint="One line under your name on your TrustCraft profile." className="sm:col-span-2">
                <Input id="headline" name="headline" defaultValue={values.headline} maxLength={140} />
              </Field>
              <Field id="about" label="About" optional className="sm:col-span-2">
                <Textarea id="about" name="about" defaultValue={values.about} maxLength={1200} />
              </Field>
            </>
          )}
        </div>
      )}
    </SetupForm>
  );
}
