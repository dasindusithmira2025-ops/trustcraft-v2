"use client";

import { Building2, Hammer, Users } from "lucide-react";
import { useActionState } from "react";
import { CheckTile, FormStatus } from "@/components/app/form-status";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, describedBy } from "@/components/ui/field";
import { TEAM_SIZES } from "@/features/org/team-sizes";
import { ORG_TYPES, type OnboardingPath } from "@/lib/db/schema";
import type { ActionResult } from "@/lib/forms";
import { choosePath, createBusinessWorkspace, createFacilityWorkspace, createProfessionalWorkspace } from "../actions";

const PATHS: { id: OnboardingPath; label: string; hint: string; icon: typeof Hammer }[] = [
  { id: "professional", label: "Independent professional", hint: "Just you — set up your services and start taking jobs.", icon: Hammer },
  { id: "business", label: "Service business", hint: "A team with dispatch, scheduling, customers and invoicing.", icon: Users },
  { id: "facility", label: "Facility or property organization", hint: "Sites, assets and approved service providers.", icon: Building2 },
];

export function PathPicker({ current }: { current?: OnboardingPath }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(choosePath, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">What are you setting up?</legend>
        {PATHS.map(({ id, label, hint, icon: Icon }) => (
          <CheckTile key={id} type="radio" name="path" value={id} defaultChecked={id === current} className="items-start py-3">
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <span className="block text-body">{label}</span>
              <span className="block text-compact font-normal text-muted">{hint}</span>
            </span>
          </CheckTile>
        ))}
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="lg" pending={pending}>
          Continue
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export function ProfessionalForm({ name, phone }: { name: string; phone: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(createProfessionalWorkspace, {});
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field id="name" label="Your name" error={err.name}>
        <Input {...describedBy("name", err.name)} defaultValue={name} autoComplete="name" required />
      </Field>
      <Field id="businessName" label="Business or trading name" hint="Shown on quotes, invoices and your public profile. Your own name works." error={err.businessName}>
        <Input {...describedBy("businessName", err.businessName, true)} required placeholder="e.g. Nimal Fernando Plumbing" />
      </Field>
      <Field id="headline" label="What you do, in one line" optional>
        <Input id="headline" name="headline" maxLength={140} placeholder="e.g. Leaks, blockages and bathroom plumbing — same day in Colombo south" />
      </Field>
      <Field id="phone" label="Phone" optional>
        <Input id="phone" name="phone" type="tel" defaultValue={phone} autoComplete="tel" />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="lg" pending={pending}>
          Continue
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export function BusinessForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(createBusinessWorkspace, {});
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field id="name" label="Business name" error={err.name}>
        <Input {...describedBy("name", err.name)} required placeholder="e.g. ABC Engineering (Pvt) Ltd" />
      </Field>
      <Field id="size" label="How many people work in it?" hint="This sets up the right tools — you can change them later." error={err.size}>
        <Select {...describedBy("size", err.size, true)} defaultValue="5">
          {TEAM_SIZES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="phone" label="Business phone" optional>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" />
      </Field>
      <Field id="address" label="Address" optional>
        <Input id="address" name="address" autoComplete="street-address" />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="lg" pending={pending}>
          Continue
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

const TYPE_LABEL: Record<(typeof ORG_TYPES)[number], string> = {
  hotel: "Hotel or resort",
  hospital: "Hospital or clinic",
  office: "Office or commercial building",
  retail: "Retail or shopping centre",
  industrial: "Factory or industrial site",
  property: "Property or estate management",
  other: "Something else",
};

export function FacilityForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(createFacilityWorkspace, {});
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field id="name" label="Organization name" error={err.name}>
        <Input {...describedBy("name", err.name)} required placeholder="e.g. Meridian Hospitality (Pvt) Ltd" />
      </Field>
      <Field id="orgType" label="What do you manage?" error={err.orgType}>
        <Select {...describedBy("orgType", err.orgType)} defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          {ORG_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="phone" label="Phone" optional>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="lg" pending={pending}>
          Continue
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
