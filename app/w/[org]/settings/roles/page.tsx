import { Check } from "lucide-react";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { SettingsSection } from "@/features/org/components/settings-section";
import { ASSIGNABLE_ROLES, capabilitiesOf, CAPABILITY_LABEL, ROLE_LABEL, ROLE_SUMMARY, type Capability } from "@/lib/permissions";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Roles & permissions" };

const ORDER: Capability[] = [
  "work.view_all", "work.create", "work.dispatch", "quotes.send", "customers.view", "customers.manage", "recurring.manage",
  "invoices.view", "invoices.manage", "reports.view", "assets.view", "assets.manage", "providers.view", "providers.manage",
  "team.view", "team.manage", "settings.manage",
];

/** What each role can do, read straight from the rules the server enforces. */
export default async function RolesSettings({ params }: PageProps<"/w/[org]/settings/roles">) {
  const { org } = await params;
  const { membership: m } = await requireCapability(org, "team.view");
  const roles = ["owner", ...ASSIGNABLE_ROLES[m.kind]] as const;
  const rows = ORDER.filter((c) => roles.some((r) => capabilitiesOf(m.kind, r).includes(c)));

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title="Roles" description="Roles are fixed and enforced on the server — a hidden button is never the only protection.">
        <ul className="-my-1 divide-y divide-border">
          {roles.map((r) => (
            <li key={r} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
              <span className="flex w-40 shrink-0 items-center gap-2 text-body font-medium text-primary">
                {ROLE_LABEL[r]}
                {r === m.role && <Badge tone="brand">You</Badge>}
              </span>
              <span className="text-compact text-secondary">{ROLE_SUMMARY[r]}</span>
            </li>
          ))}
        </ul>
      </SettingsSection>
      <section className="flex flex-col gap-3" aria-labelledby="matrix">
        <h2 id="matrix" className="text-heading text-primary">
          Permissions by role
        </h2>
        <div tabIndex={0} role="region" aria-label="Permissions by role" className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <caption className="sr-only">Permissions by role</caption>
            <thead className="bg-surface-muted">
              <tr className="border-b border-border">
                <th scope="col" className="h-9 px-4 text-meta font-medium text-secondary">
                  Can…
                </th>
                {roles.map((r) => (
                  <th key={r} scope="col" className="h-9 px-2 text-center text-meta font-medium text-secondary">
                    {ROLE_LABEL[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c} className="border-b border-border last:border-0">
                  <th scope="row" className="h-10 px-4 text-left text-body font-normal text-primary">
                    {CAPABILITY_LABEL[c]}
                  </th>
                  {roles.map((r) => (
                    <td key={r} className="px-2 text-center">
                      {capabilitiesOf(m.kind, r).includes(c) ? <Check className="mx-auto size-4 text-success" aria-label="Yes" /> : <span className="text-border-strong" aria-label="No">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
