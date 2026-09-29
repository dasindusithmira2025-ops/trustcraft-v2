import { expect, it } from "vitest";
import { formatDuration, formatMoney, parseMoney } from "./format";

it("formats and parses money in minor units", () => {
  expect(formatMoney(4_850_000, "LKR").replace(/\s/g, " ")).toBe("Rs 48,500");
  expect(formatMoney(4_850_050, "LKR").replace(/\s/g, " ")).toBe("Rs 48,500.50");
  expect(parseMoney("48,500.5", "LKR")).toBe(4_850_050);
  expect(parseMoney("12abc", "LKR")).toBeNull();
  expect(parseMoney("-5", "LKR")).toBeNull();
});

it("formats durations compactly", () => {
  expect(formatDuration(102 * 60_000)).toBe("1h 42m");
  expect(formatDuration(14 * 60_000)).toBe("14m");
  expect(formatDuration(-37 * 60_000)).toBe("37m");
  expect(formatDuration(3 * 86_400_000 + 4 * 3_600_000)).toBe("3d 4h");
});

it("finds timezone offsets and day ranges", async () => {
  const { tzOffset, dayRange } = await import("./format");
  expect(tzOffset("2026-09-29T00:00:00Z", "Asia/Colombo")).toBe("+05:30");
  expect(tzOffset("2026-09-29T00:00:00Z", "UTC")).toBe("+00:00");
  const { start } = dayRange("2026-09-29T20:00:00Z", "Asia/Colombo"); // 01:30 on the 30th in Colombo
  expect(start.toISOString()).toBe("2026-09-29T18:30:00.000Z");
});
