"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <Field id="email" label="Work or personal email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.email}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "signin-error" : undefined}
          className="h-10"
        />
      </Field>
      <Field id="password" label="Password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10" />
      </Field>
      {state.error && (
        <p id="signin-error" role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-compact text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" pending={pending} className="mt-1 w-full">
        Sign in
      </Button>
    </form>
  );
}

export function DemoSignIn({ email, name, role }: { email: string; name: string; role: string }) {
  const [, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  return (
    <form action={action}>
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="demo" value="1" />
      <button
        type="submit"
        disabled={pending}
        className="group flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-surface-hover disabled:opacity-60"
      >
        <span className="min-w-0">
          <span className="block truncate text-body font-medium text-primary">{name}</span>
          <span className="block truncate text-meta text-muted">{role}</span>
        </span>
        <span className="text-meta font-medium text-brand-text opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {pending ? "Signing in…" : "Sign in →"}
        </span>
      </button>
    </form>
  );
}
