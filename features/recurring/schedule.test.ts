import { expect, it } from "vitest";
import { describeCadence, dueOccurrences, firstOccurrence, firstOnOrAfter, nextOccurrence, weekdayOf } from "./schedule";

it("moves months without drifting off the anchor day", () => {
  expect(nextOccurrence("2026-01-31", { unit: "month", every: 1 })).toBe("2026-02-28");
  expect(nextOccurrence("2026-02-28", { unit: "month", every: 1 }, 31)).toBe("2026-03-31");
  expect(nextOccurrence("2026-09-15", { unit: "month", every: 3 })).toBe("2026-12-15");
  expect(nextOccurrence("2026-11-30", { unit: "month", every: 3 })).toBe("2027-02-28");
});

it("aligns weekly plans to their weekday", () => {
  expect(weekdayOf("2026-09-28")).toBe(0); // a Monday
  expect(firstOccurrence("2026-09-29", { unit: "week", every: 1, weekday: 0 })).toBe("2026-10-05");
  expect(firstOccurrence("2026-09-28", { unit: "week", every: 1, weekday: 0 })).toBe("2026-09-28");
  expect(nextOccurrence("2026-09-28", { unit: "week", every: 2, weekday: 0 })).toBe("2026-10-12");
});

it("creates only what falls inside the look-ahead and returns where to resume", () => {
  const r = dueOccurrences({ nextRunOn: "2026-09-28", horizon: "2026-10-12", endsOn: null, cadence: { unit: "week", every: 1, weekday: 0 } });
  expect(r.dates).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"]);
  expect(r.nextRunOn).toBe("2026-10-19");
  expect(dueOccurrences({ nextRunOn: "2026-11-01", horizon: "2026-10-12", endsOn: null, cadence: { unit: "day", every: 1 } })).toEqual({ dates: [], nextRunOn: "2026-11-01" });
});

it("finishes a schedule at its end date", () => {
  const r = dueOccurrences({ nextRunOn: "2026-09-28", horizon: "2026-12-31", endsOn: "2026-10-10", cadence: { unit: "week", every: 1, weekday: 0 } });
  expect(r.dates).toEqual(["2026-09-28", "2026-10-05"]);
  expect(r.nextRunOn).toBeNull();
});

it("caps a long-idle plan instead of flooding the board", () => {
  const r = dueOccurrences({ nextRunOn: "2025-01-01", horizon: "2026-09-29", endsOn: null, cadence: { unit: "day", every: 1 } });
  expect(r.dates).toHaveLength(12);
});

it("describes cadences the way people say them", () => {
  expect(describeCadence({ unit: "week", every: 1, weekday: 0 })).toBe("Every Monday");
  expect(describeCadence({ unit: "month", every: 3 })).toBe("Every 3 months");
  expect(describeCadence({ unit: "week", every: 2, weekday: 4 })).toBe("Every 2 weeks on Friday");
});

it("restarts a plan from today without a backlog of past visits", () => {
  const monthly = { unit: "month", every: 3 } as const;
  expect(firstOnOrAfter("2026-01-15", monthly, "2026-09-29")).toBe("2026-10-15");
  expect(firstOnOrAfter("2026-10-15", monthly, "2026-09-29")).toBe("2026-10-15");
  expect(firstOnOrAfter("2026-01-05", { unit: "week", every: 1, weekday: 0 }, "2026-09-29")).toBe("2026-10-05");
  expect(firstOnOrAfter("2026-09-29", { unit: "day", every: 1 }, "2026-09-29")).toBe("2026-09-29");
});
