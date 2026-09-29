import { expect, it } from "vitest";
import { DEFAULT_MODULES, navigationFor } from "./navigation";

const labels = (s: ReturnType<typeof navigationFor>) => s.flatMap((x) => x.items.map((i) => i.label));

it("gives finance only what finance needs", () => {
  const nav = navigationFor({ slug: "abc", kind: "provider", role: "finance", segment: "company", modules: [] });
  expect(labels(nav)).toEqual(["Overview", "Work", "Customers", "Invoices", "Settings"]);
});

it("hides enterprise modules the organization has not enabled", () => {
  const nav = navigationFor({ slug: "m", kind: "enterprise", role: "facility_manager", modules: ["assets"] });
  expect(labels(nav)).toEqual(["Overview", "Work orders", "Assets", "Providers", "Settings"]);
});

it("drops empty sections and only shows non-zero badges", () => {
  const nav = navigationFor({ slug: "abc", kind: "provider", role: "dispatcher", segment: "team", modules: [], badges: { requests: 0 } });
  expect(nav.every((s) => s.items.length > 0)).toBe(true);
  expect(nav.flatMap((s) => s.items).find((i) => i.label === "Requests")?.badge).toBeUndefined();
});

it("keeps a solo professional's workspace small and in their own words", () => {
  const nav = navigationFor({ slug: "nimal", kind: "provider", role: "owner", segment: "solo", modules: DEFAULT_MODULES.solo });
  expect(labels(nav)).toEqual(["Today", "Requests", "Jobs", "Customers", "Money", "Profile"]);
});

it("gives a small team a schedule and team page but no dispatch board", () => {
  const nav = navigationFor({ slug: "c", kind: "provider", role: "owner", segment: "team", modules: DEFAULT_MODULES.team });
  expect(labels(nav)).toEqual(["Overview", "Requests", "Jobs", "Schedule", "Recurring", "Customers", "Invoices", "Team", "Settings"]);
});

it("gives a larger company dispatch, services and reports", () => {
  const nav = navigationFor({ slug: "abc", kind: "provider", role: "owner", segment: "company", modules: DEFAULT_MODULES.company });
  expect(labels(nav)).toEqual(["Overview", "Requests", "Work", "Dispatch", "Schedule", "Recurring", "Customers", "Invoices", "Team", "Services", "Reports", "Settings"]);
});

it("lets an owner switch the dispatch board on for a small team", () => {
  const nav = navigationFor({ slug: "c", kind: "provider", role: "owner", segment: "team", modules: ["recurring", "dispatch"] });
  expect(labels(nav)).toContain("Dispatch");
});

it("never offers finance dispatch or dispatchers billing", () => {
  const finance = labels(navigationFor({ slug: "abc", kind: "provider", role: "finance", segment: "company", modules: DEFAULT_MODULES.company }));
  expect(finance).not.toContain("Dispatch");
  const dispatcher = labels(navigationFor({ slug: "abc", kind: "provider", role: "dispatcher", segment: "company", modules: DEFAULT_MODULES.company }));
  expect(dispatcher).toContain("Dispatch");
  expect(dispatcher).not.toContain("Invoices");
  expect(dispatcher).not.toContain("Reports");
});

it("never shows enterprise procurement or estate to a provider", () => {
  const nav = labels(navigationFor({ slug: "abc", kind: "provider", role: "owner", segment: "company", modules: DEFAULT_MODULES.company }));
  for (const enterprise of ["Locations", "Assets", "Maintenance", "Providers"]) expect(nav).not.toContain(enterprise);
});
