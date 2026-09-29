import { expect, it } from "vitest";
import { DEFAULT_HOURS } from "@/lib/db/schema";
import { assessAssignment, hasBlock, layoutLanes, needsOverride, openMinutes, type AssessInput } from "./conflicts";

const loc = { locale: "en-LK", timezone: "Asia/Colombo" };
// Monday 2026-09-28, 09:00 Colombo (UTC+5:30) = 03:30Z
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`);
const now = at("2026-09-28", "07:00");

const base = (over: Partial<AssessInput> = {}): AssessInput => ({
  window: { start: at("2026-09-28", "09:00"), end: at("2026-09-28", "11:00") },
  loc,
  job: { id: "j1", categoryId: "hvac", categoryName: "Air conditioning", city: "Colombo", slaDueAt: at("2026-09-30", "17:00"), priority: "normal" },
  technician: { name: "Kasun Perera", skills: ["hvac", "electrical"] },
  booked: [],
  timeOff: [],
  hours: DEFAULT_HOURS,
  serviceAreaCities: ["Colombo", "Kandy"],
  now,
  ...over,
});
const codes = (i: AssessInput) => assessAssignment(i).map((w) => w.code);

it("has nothing to say about a sensible assignment", () => {
  expect(assessAssignment(base())).toEqual([]);
});

it("blocks a visit that ends before it starts or runs longer than a day", () => {
  const backwards = assessAssignment(base({ window: { start: at("2026-09-28", "11:00"), end: at("2026-09-28", "09:00") } }));
  expect(hasBlock(backwards)).toBe(true);
  const endless = assessAssignment(base({ window: { start: at("2026-09-28", "09:00"), end: at("2026-09-30", "09:00") } }));
  expect(hasBlock(endless)).toBe(true);
});

it("warns — but does not block — on overlapping visits", () => {
  const w = assessAssignment(base({ booked: [{ id: "b", number: 10482, title: "Filter", start: at("2026-09-28", "10:00"), end: at("2026-09-28", "12:00") }] }));
  expect(w.map((x) => x.code)).toEqual(["overlap"]);
  expect(w[0]!.message).toContain("WO-10482");
  expect(needsOverride(w) && !hasBlock(w)).toBe(true);
  // Back-to-back is not an overlap.
  expect(codes(base({ booked: [{ id: "b", number: 1, title: "x", start: at("2026-09-28", "11:00"), end: at("2026-09-28", "12:00") }] }))).toEqual([]);
});

it("warns when the technician is on leave", () => {
  expect(codes(base({ timeOff: [{ startsOn: "2026-09-28", endsOn: "2026-09-29", reason: "Annual leave" }] }))).toEqual(["time_off"]);
  expect(codes(base({ timeOff: [{ startsOn: "2026-09-29", endsOn: "2026-09-30", reason: "Leave" }] }))).toEqual([]);
});

it("warns about hours, but lets emergencies through", () => {
  const sundayJob = base({ window: { start: at("2026-09-27", "09:00"), end: at("2026-09-27", "11:00") }, now: at("2026-09-27", "07:00") });
  expect(codes(sundayJob)).toContain("outside_hours");
  expect(codes({ ...sundayJob, job: { ...sundayJob.job, priority: "critical" } })).not.toContain("outside_hours");
  expect(codes(base({ window: { start: at("2026-09-28", "16:00"), end: at("2026-09-28", "18:00") } }))).toContain("outside_hours");
});

it("flags missing skills only when skills are declared, and jobs outside the service area", () => {
  expect(codes(base({ technician: { name: "Sampath Kumara", skills: ["plumbing"] } }))).toEqual(["missing_skill"]);
  expect(codes(base({ technician: { name: "Nimal Fernando", skills: [] } }))).toEqual([]);
  expect(codes(base({ job: { ...base().job, city: "Jaffna" } }))).toEqual(["outside_area"]);
  expect(codes(base({ serviceAreaCities: [], job: { ...base().job, city: "Jaffna" } }))).toEqual([]);
});

it("warns when the visit would end after the SLA deadline", () => {
  expect(codes(base({ job: { ...base().job, slaDueAt: at("2026-09-28", "10:00") } }))).toEqual(["sla"]);
});

it("warns when the technician is already loaded that day", () => {
  const booked = Array.from({ length: 5 }, (_, n) => ({ id: `b${n}`, number: n, title: "x", start: at("2026-09-28", `${12 + n}:00`.padStart(5, "0")), end: at("2026-09-28", `${12 + n}:30`.padStart(5, "0")) }));
  expect(codes(base({ booked, hours: { ...DEFAULT_HOURS, mon: { open: "08:00", close: "23:00" } } }))).toContain("overloaded");
});

it("measures a day's capacity from business hours", () => {
  expect(openMinutes(DEFAULT_HOURS, at("2026-09-28", "12:00"), "Asia/Colombo")).toBe(9 * 60);
  expect(openMinutes(DEFAULT_HOURS, at("2026-09-27", "12:00"), "Asia/Colombo")).toBe(0);
});

it("lays overlapping visits side by side without hiding any", () => {
  const laid = layoutLanes([
    { id: "a", start: at("2026-09-28", "09:00"), end: at("2026-09-28", "11:00") },
    { id: "b", start: at("2026-09-28", "10:00"), end: at("2026-09-28", "12:00") },
    { id: "c", start: at("2026-09-28", "13:00"), end: at("2026-09-28", "14:00") },
  ]);
  const by = Object.fromEntries(laid.map((l) => [l.id, l]));
  expect([by.a!.lane, by.b!.lane]).toEqual([0, 1]);
  expect(by.a!.lanes).toBe(2);
  expect([by.c!.lane, by.c!.lanes]).toEqual([0, 1]);
});
