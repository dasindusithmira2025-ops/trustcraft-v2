import type { Module, OrgKind, Role, Segment } from "@/lib/db/schema";
import { roleCan } from "@/lib/permissions";

export type SettingsSection = { id: string; label: string; href: string; external?: boolean };

/**
 * Which settings a member sees. Small providers get a short list; enterprise organizations
 * get their own. Personal settings (notifications, security) are for everyone.
 */
export function settingsSections(input: { slug: string; kind: OrgKind; role: Role; modules: readonly Module[]; segment: Segment | null }): SettingsSection[] {
  const { slug, kind, role } = input;
  const can = (c: Parameters<typeof roleCan>[2]) => roleCan(kind, role, c);
  const base = `/w/${slug}/settings`;
  const out: SettingsSection[] = [];
  if (can("settings.manage")) out.push({ id: "general", label: "General", href: base });
  if (can("team.view")) {
    out.push({ id: "members", label: "Members", href: `${base}/members` });
    out.push({ id: "roles", label: "Roles & permissions", href: `${base}/roles` });
  }
  if (kind === "provider" && can("settings.manage")) {
    out.push({ id: "services", label: "Services", href: `${base}/services` });
    out.push({ id: "areas", label: "Service areas", href: `${base}/areas` });
    out.push({ id: "hours", label: "Business hours", href: `${base}/hours` });
  }
  if (kind === "enterprise" && input.modules.includes("locations") && can("assets.view")) out.push({ id: "locations", label: "Locations", href: `/w/${slug}/locations`, external: true });
  if (kind === "enterprise" && can("providers.view")) out.push({ id: "providers", label: "Approved providers", href: `/w/${slug}/providers`, external: true });
  if (kind === "provider" && can("invoices.manage")) out.push({ id: "billing", label: "Invoicing", href: `${base}/billing` });
  out.push({ id: "notifications", label: "Notifications", href: `${base}/notifications` });
  out.push({ id: "security", label: "Security", href: `${base}/security` });
  return out;
}
