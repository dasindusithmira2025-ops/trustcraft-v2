"use client";

import { Laptop, Smartphone } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { FormStatus } from "@/components/app/form-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, describedBy } from "@/components/ui/field";
import { formatRelative } from "@/lib/format";
import { changePassword, signOutDevice, signOutOtherDevices, type SecurityState } from "../actions";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<SecurityState, FormData>(changePassword, {});
  return (
    <form action={action} className="flex max-w-sm flex-col gap-4">
      <Field id="current" label="Current password" error={state.fieldErrors?.current}>
        <Input {...describedBy("current", state.fieldErrors?.current)} type="password" autoComplete="current-password" required />
      </Field>
      <Field id="next" label="New password" hint="At least 10 characters. A few random words works well." error={state.fieldErrors?.next}>
        <Input {...describedBy("next", state.fieldErrors?.next, true)} type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" pending={pending}>
          Change password
        </Button>
        <FormStatus state={{ error: state.error, ok: state.ok, message: state.ok ? "Password changed. Other devices were signed out." : undefined }} />
      </div>
    </form>
  );
}

export type DeviceRow = { id: string; label: string; mobile: boolean; lastSeenAt: string; current: boolean };

export function DeviceList({ devices, now }: { devices: DeviceRow[]; now: string }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const nowDate = new Date(now);
  const others = devices.filter((d) => !d.current).length;
  return (
    <div className="flex flex-col gap-3">
      <ul className="-mx-5 divide-y divide-border border-y border-border">
        {devices.map((d) => {
          const Icon = d.mobile ? Smartphone : Laptop;
          return (
            <li key={d.id} className="flex items-center gap-3 px-5 py-3">
              <Icon className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-body text-primary">
                  {d.label} {d.current && <Badge tone="brand">This device</Badge>}
                </span>
                <span className="block text-compact text-muted">Last active {formatRelative(d.lastSeenAt, nowDate)}</span>
              </span>
              {!d.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await signOutDevice(d.id);
                      setError(res.error);
                    })
                  }
                >
                  Sign out
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {others > 0 && (
        <div>
          <Button variant="secondary" pending={pending} onClick={() => start(async () => void (await signOutOtherDevices()))}>
            Sign out of {others} other {others === 1 ? "device" : "devices"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-compact text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
