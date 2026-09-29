import type { Module, OrgKind, Role, Segment } from "@/lib/db/schema";
import { roleCan, type Capability } from "@/lib/permissions";

export type NavIcon =
  | "overview" | "requests" | "work" | "customers" | "invoices" | "team"
  | "locations" | "assets" | "maintenance" | "providers"
  | "dispatch" | "schedule" | "recurring" | "reports" | "services" | "settings";

export type NavItem = { label: string; href: string; icon: NavIcon; badge?: number };
export type NavSection = { label?: string; items: NavItem[] };

type BadgeKey = "requests" | "attention";
/** A label can vary by provider segment: a solo professional says "Jobs" and "Money". */
type Label = string | ({ default: string } & Partial<Record<Segment, string>>);
type Entry = {
  label: Label;
  path: string;
  icon: NavIcon;
  cap?: Capability;
  module?: Module;
  /** Only shown to these provider segments. */
  segments?: Segment[];
  badgeKey?: BadgeKey;
};

const PROVIDER_NAV: { label?: string; items: Entry[] }[] = [
  { items: [{ label: { default: "Overview", solo: "Today" }, path: "", icon: "overview" }] },
  {
    label: "Work",
    items: [
      { label: "Requests", path: "/requests", icon: "requests", cap: "quotes.send", badgeKey: "requests" },
      { label: { default: "Work orders", solo: "Jobs", team: "Jobs", company: "Work" }, path: "/work-orders", icon: "work", cap: "work.view_all" },
      { label: "Dispatch", path: "/dispatch", icon: "dispatch", cap: "work.dispatch", module: "dispatch" },
      { label: "Schedule", path: "/schedule", icon: "schedule", cap: "work.dispatch", segments: ["team", "company"] },
      { label: "Recurring", path: "/recurring", icon: "recurring", cap: "recurring.manage", module: "recurring" },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Customers", path: "/customers", icon: "customers", cap: "customers.view" },
      { label: { default: "Invoices", solo: "Money" }, path: "/invoices", icon: "invoices", cap: "invoices.view" },
      { label: "Team", path: "/team", icon: "team", cap: "team.view", segments: ["team", "company"] },
      { label: "Services", path: "/settings/services", icon: "services", cap: "settings.manage", segments: ["company"] },
      { label: "Reports", path: "/reports", icon: "reports", cap: "reports.view", module: "reports" },
    ],
  },
];

const ENTERPRISE_NAV: { label?: string; items: Entry[] }[] = [
  { items: [{ label: "Overview", path: "", icon: "overview" }] },
  {
    label: "Operations",
    items: [{ label: "Work orders", path: "/work-orders", icon: "work", cap: "work.view_all", badgeKey: "attention" }],
  },
  {
    label: "Estate",
    items: [
      { label: "Locations", path: "/locations", icon: "locations", cap: "assets.view", module: "locations" },
      { label: "Assets", path: "/assets", icon: "assets", cap: "assets.view", module: "assets" },
      { label: "Maintenance", path: "/maintenance", icon: "maintenance", cap: "assets.view", module: "maintenance" },
    ],
  },
  { label: "Supply", items: [{ label: "Providers", path: "/providers", icon: "providers", cap: "providers.view" }] },
];

const SETTINGS: Entry = { label: { default: "Settings", solo: "Profile" }, path: "/settings", icon: "settings" };

const resolve = (label: Label, segment: Segment) => (typeof label === "string" ? label : (label[segment] ?? label.default));

/**
 * Navigation is derived, never configured per screen: organization kind + provider
 * segment + the member's role + the organization's enabled modules. Features a workspace
 * cannot use never appear. (Hiding is convenience — every route checks its capability.)
 */
export function navigationFor(input: {
  slug: string;
  kind: OrgKind;
  role: Role;
  modules: readonly Module[];
  segment?: Segment | null;
  badges?: Partial<Record<BadgeKey, number>>;
}): NavSection[] {
  const segment: Segment = input.segment ?? "team";
  const tree = [...(input.kind === "provider" ? PROVIDER_NAV : ENTERPRISE_NAV), { items: [SETTINGS] }];
  return tree
    .map((section) => ({
      label: section.label,
      items: section.items
        .filter(
          (e) =>
            (!e.cap || roleCan(input.kind, input.role, e.cap)) &&
            (!e.module || input.modules.includes(e.module)) &&
            (input.kind !== "provider" || !e.segments || e.segments.includes(segment)),
        )
        .map((e) => ({
          label: resolve(e.label, segment),
          href: `/w/${input.slug}${e.path}`,
          icon: e.icon,
          badge: e.badgeKey ? input.badges?.[e.badgeKey] || undefined : undefined,
        })),
    }))
    .filter((section) => section.items.length > 0);
}

/** Modules a provider starts with for its segment. Owners can switch dispatch and recurring on or off in Settings. */
export const DEFAULT_MODULES: Record<Segment, Module[]> = {
  solo: [],
  team: ["recurring"],
  company: ["dispatch", "recurring", "reports"],
};
