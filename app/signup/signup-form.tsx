"use client";

import { Building2, Home, Hammer, Users } from "lucide-react";
import { useActionState } from "react";
import { CheckTile } from "@/components/app/form-status";
import { Button } from "@/components/ui/button";
import { Field, Input, describedBy } from "@/components/ui/field";
import { signUp, type SignInState } from "@/features/auth/actions";
import type { Intent } from "@/features/auth/rules";

const CHOICES: { id: Intent; label: string; hint: string; icon: typeof Home }[] = [
  { id: "consumer", label: "I need work done", hint: "Home or small business", icon: Home },
  { id: "professional", label: "I'm an independent professional", hint: "Electrician, plumber, technician…", icon: Hammer },
  { id: "business", label: "I run a service business", hint: "A team that does the work", icon: Users },
  { id: "facility", label: "I manage properties or facilities", hint: "Hotels, offices, estates", icon: Building2 },
];

export function SignupForm({ next, defaultIntent }: { next?: string; defaultIntent: Intent }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signUp, {});
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-compact font-medium text-primary">I&apos;m here to…</legend>
        {CHOICES.map(({ id, label, hint, icon: Icon }) => (
          <CheckTile key={id} type="radio" name="intent" value={id} defaultChecked={id === defaultIntent} className="items-start py-2.5">
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <span className="block text-body">{label}</span>
              <span className="block text-meta font-normal text-muted">{hint}</span>
            </span>
          </CheckTile>
        ))}
      </fieldset>
      <Field id="name" label="Your name" error={err.name}>
        <Input {...describedBy("name", err.name)} autoComplete="name" required className="h-10" />
      </Field>
      <Field id="email" label="Email" error={err.email}>
        <Input {...describedBy("email", err.email)} type="email" autoComplete="email" inputMode="email" defaultValue={state.email} required className="h-10" />
      </Field>
      <Field id="phone" label="Phone" optional>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" className="h-10" />
      </Field>
      <Field id="password" label="Password" hint="At least 10 characters." error={err.password}>
        <Input {...describedBy("password", err.password, true)} type="password" autoComplete="new-password" minLength={10} required className="h-10" />
      </Field>
      {state.error && (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-compact text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" pending={pending} className="mt-1 w-full">
        Create account
      </Button>
    </form>
  );
}
