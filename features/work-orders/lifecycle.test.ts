import { describe, expect, it } from "vitest";
import { availableActions, can, canView, slaState, type WorkOrderActor } from "./lifecycle";

const none: WorkOrderActor = { providerRole: null, isAssignee: false, clientRole: null, isCustomer: false };
const dispatcher = { ...none, providerRole: "dispatcher" as const };
const tech = { ...none, providerRole: "technician" as const, isAssignee: true };
const otherTech = { ...none, providerRole: "technician" as const };
const customer = { ...none, isCustomer: true };
const fm = { ...none, clientRole: "facility_manager" as const };

describe("work order lifecycle", () => {
  it("lets dispatch assign but not technicians", () => {
    expect(can("assign", dispatcher, "open")).toBe(true);
    expect(can("assign", tech, "open")).toBe(false);
  });

  it("walks the happy path", () => {
    expect(availableActions(tech, "scheduled")).toEqual(["start"]);
    expect(availableActions(tech, "in_progress")).toEqual(["hold", "complete"]);
    expect(availableActions(customer, "awaiting_verification")).toEqual(["verify", "reject"]);
  });

  it("never lets the provider verify its own work", () => {
    const owner = { ...none, providerRole: "owner" as const, isAssignee: true };
    expect(can("verify", owner, "awaiting_verification")).toBe(false);
    expect(can("verify", fm, "awaiting_verification")).toBe(true);
  });

  it("blocks transitions from the wrong state", () => {
    expect(can("complete", tech, "scheduled")).toBe(false);
    expect(can("cancel", dispatcher, "completed")).toBe(false);
    expect(can("cancel", dispatcher, "in_progress")).toBe(false);
  });

  it("lets a customer cancel only before dispatch", () => {
    expect(can("cancel", customer, "open")).toBe(true);
    expect(can("cancel", customer, "scheduled")).toBe(false);
  });

  it("hides other technicians' work", () => {
    expect(canView(otherTech)).toBe(false);
    expect(canView(tech)).toBe(true);
    expect(canView(none)).toBe(false);
  });
});

describe("slaState", () => {
  const createdAt = new Date("2026-09-29T00:00:00Z");
  const slaDueAt = new Date("2026-09-29T10:00:00Z"); // 10 h window, risk under 2 h
  const at = (iso: string) => new Date(iso);
  const base = { createdAt, slaDueAt, completedAt: null, status: "in_progress" as const };

  it("is healthy early, at risk late, breached after", () => {
    expect(slaState({ ...base, now: at("2026-09-29T02:00:00Z") }).state).toBe("healthy");
    expect(slaState({ ...base, now: at("2026-09-29T08:30:00Z") }).state).toBe("risk");
    expect(slaState({ ...base, now: at("2026-09-29T11:00:00Z") }).state).toBe("breached");
  });

  it("judges finished work at completion time", () => {
    expect(slaState({ ...base, completedAt: at("2026-09-29T09:00:00Z"), now: at("2026-10-05T00:00:00Z") }).state).toBe("met");
    expect(slaState({ ...base, completedAt: at("2026-09-29T12:00:00Z"), now: at("2026-10-05T00:00:00Z") }).state).toBe("missed");
  });

  it("has no SLA when there is no due date or the job is cancelled", () => {
    expect(slaState({ ...base, slaDueAt: null, now: createdAt }).state).toBe("none");
    expect(slaState({ ...base, status: "cancelled", now: createdAt }).state).toBe("none");
  });
});
