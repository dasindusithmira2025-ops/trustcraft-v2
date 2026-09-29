"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { describedBy, Field, Input, Select, Textarea } from "@/components/ui/field";
import { PRIORITY } from "@/components/app/status";
import { CATEGORIES } from "@/features/requests/catalog";
import { raiseWorkOrder, type ActionResult } from "../actions";

type Option = { id: string; label: string };
type AssetOption = { id: string; label: string; locationId: string | null; categoryId: string | null };

/** Enterprise: raise work with an approved provider, optionally against a specific asset. */
export function RaiseWorkOrder({
  org,
  vendors,
  locations,
  assets,
  defaults,
  buttonLabel = "Raise work order",
  variant = "primary",
}: {
  org: string;
  vendors: Option[];
  locations: Option[];
  assets: AssetOption[];
  defaults?: { locationId?: string; assetId?: string; categoryId?: string };
  buttonLabel?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult, FormData>(raiseWorkOrder, {});
  const [locationId, setLocationId] = useState(defaults?.locationId ?? "");
  const [assetId, setAssetId] = useState(defaults?.assetId ?? "");
  const [categoryId, setCategoryId] = useState(defaults?.categoryId ?? "");
  const err = state.fieldErrors ?? {};
  const assetsHere = assets.filter((a) => !locationId || a.locationId === locationId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus aria-hidden /> {buttonLabel}
      </Button>
      <SheetContent title="Raise work order" description="Sent straight to the provider's dispatch team.">
        {vendors.length === 0 ? (
          <p className="p-5 text-body text-secondary">You don&apos;t have an approved provider yet. Work with a provider once through TrustCraft and they&apos;ll appear here.</p>
        ) : (
          <form action={action} className="flex flex-col gap-4 p-5">
            <input type="hidden" name="org" value={org} />
            <Field id="title" label="What's wrong?" error={err.title}>
              <Input {...describedBy("title", err.title)} required minLength={4} maxLength={120} placeholder="e.g. Guest lift stopping between floors" />
            </Field>
            <Field id="description" label="Details" optional>
              <Textarea id="description" name="description" maxLength={2000} placeholder="What you've seen, when it started, access instructions" />
            </Field>
            <Field id="locationId" label="Location" error={err.locationId}>
              <Select
                {...describedBy("locationId", err.locationId)}
                value={locationId}
                required
                onChange={(e) => {
                  setLocationId(e.target.value);
                  setAssetId("");
                }}
              >
                <option value="" disabled>
                  Choose a location…
                </option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="assetId" label="Asset" optional error={err.assetId}>
              <Select
                {...describedBy("assetId", err.assetId)}
                value={assetId}
                onChange={(e) => {
                  setAssetId(e.target.value);
                  const cat = assets.find((a) => a.id === e.target.value)?.categoryId;
                  if (cat) setCategoryId(cat);
                }}
              >
                <option value="">{assetsHere.length ? "Not about a specific asset" : "No assets at this location"}</option>
                {assetsHere.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="categoryId" label="Kind of work" error={err.categoryId}>
                <Select {...describedBy("categoryId", err.categoryId)} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
                  <option value="" disabled>
                    Choose…
                  </option>
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="priority" label="Priority" hint="Sets the SLA deadline">
                <Select {...describedBy("priority", undefined, true)} defaultValue="normal">
                  {(["critical", "high", "normal", "low"] as const).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY[p].label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field id="providerOrgId" label="Provider" error={err.providerOrgId}>
              <Select {...describedBy("providerOrgId", err.providerOrgId)} defaultValue={vendors.length === 1 ? vendors[0]!.id : ""} required>
                <option value="" disabled>
                  Choose a provider…
                </option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </Field>
            {state.error && <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-compact text-danger">{state.error}</p>}
            <Button type="submit" variant="primary" size="lg" pending={pending}>
              Send to provider
            </Button>
          </form>
        )}
      </SheetContent>
    </Dialog>
  );
}
