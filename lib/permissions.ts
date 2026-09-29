import type { OrgKind, Role } from "@/lib/db/schema";

/**
 * What each role may do inside its organization. The UI uses this to decide what to
 * show; server actions call it again before every mutation — hiding a button is never
 * the security boundary.
 */
export type Capability =
  | "work.view_all"
  | "work.create"
  | "work.dispatch"
  | "quotes.send"
  | "customers.view"
  | "customers.manage"
  | "invoices.view"
  | "invoices.manage"
  | "team.view"
  | "team.manage"
  | "settings.manage"
  | "recurring.manage"
  | "reports.view"
  | "assets.view"
  | "assets.manage"
  | "providers.view"
  | "providers.manage";

const PROVIDER_ALL: Capability[] = [
  "work.view_all", "work.create", "work.dispatch", "quotes.send", "customers.view", "customers.manage",
  "invoices.view", "invoices.manage", "team.view", "team.manage", "settings.manage", "recurring.manage", "reports.view",
];

const PROVIDER: Record<Role, Capability[]> = {
  owner: PROVIDER_ALL,
  admin: PROVIDER_ALL,
  dispatcher: ["work.view_all", "work.create", "work.dispatch", "quotes.send", "customers.view", "customers.manage", "team.view", "recurring.manage"],
  finance: ["work.view_all", "customers.view", "invoices.view", "invoices.manage", "reports.view"],
  technician: [],
  facility_manager: [],
  viewer: ["work.view_all"],
};

const ENTERPRISE: Record<Role, Capability[]> = {
  owner: ["work.view_all", "work.create", "assets.view", "assets.manage", "providers.view", "providers.manage", "invoices.view", "team.view", "team.manage", "settings.manage"],
  admin: ["work.view_all", "work.create", "assets.view", "assets.manage", "providers.view", "providers.manage", "invoices.view", "team.view", "team.manage", "settings.manage"],
  facility_manager: ["work.view_all", "work.create", "assets.view", "assets.manage", "providers.view", "providers.manage", "team.view"],
  finance: ["work.view_all", "invoices.view", "providers.view"],
  viewer: ["work.view_all", "assets.view"],
  dispatcher: ["work.view_all"],
  technician: [],
};

export function roleCan(kind: OrgKind, role: Role, capability: Capability): boolean {
  return (kind === "provider" ? PROVIDER : ENTERPRISE)[role].includes(capability);
}

/** Every capability a role holds in an organization kind — the Roles & Permissions screen reads this. */
export const capabilitiesOf = (kind: OrgKind, role: Role): readonly Capability[] => (kind === "provider" ? PROVIDER : ENTERPRISE)[role];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  dispatcher: "Dispatcher",
  technician: "Technician",
  finance: "Finance",
  facility_manager: "Facility manager",
  viewer: "Viewer",
};

/** Roles that make sense to hand out in each kind of organization. */
export const ASSIGNABLE_ROLES: Record<OrgKind, readonly Role[]> = {
  provider: ["admin", "dispatcher", "technician", "finance", "viewer"],
  enterprise: ["admin", "facility_manager", "finance", "viewer"],
};

export const ROLE_SUMMARY: Record<Role, string> = {
  owner: "Everything, including team and settings.",
  admin: "Everything except transferring ownership.",
  dispatcher: "Runs the day: requests, quotes, scheduling, customers.",
  technician: "Works assigned jobs in TrustCraft Field.",
  finance: "Invoices, payments and reports.",
  facility_manager: "Raises work, approves and verifies it, manages sites and assets.",
  viewer: "Read-only access to work.",
};

export const CAPABILITY_LABEL: Record<Capability, string> = {
  "work.view_all": "See all work orders",
  "work.create": "Create work orders",
  "work.dispatch": "Assign and schedule technicians",
  "quotes.send": "Answer requests and send quotes",
  "customers.view": "See customers",
  "customers.manage": "Edit customers and notes",
  "invoices.view": "See invoices and payments",
  "invoices.manage": "Issue invoices and record payments",
  "team.view": "See the team",
  "team.manage": "Invite and manage people",
  "settings.manage": "Change organization settings",
  "recurring.manage": "Manage recurring services",
  "reports.view": "See performance reports",
  "assets.view": "See locations and assets",
  "assets.manage": "Add and edit sites and assets",
  "providers.view": "See approved providers",
  "providers.manage": "Approve providers",
};
