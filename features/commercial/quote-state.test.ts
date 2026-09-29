import { expect, it } from "vitest";
import { canAcceptQuote, canReviseQuote, quoteState } from "./quote-state";

const now = new Date("2026-09-29T10:00:00Z");
const before = new Date("2026-09-28T10:00:00Z");
const after = new Date("2026-10-06T10:00:00Z");

it("expires an open quote once its validity passes, without anything having to run", () => {
  expect(quoteState({ status: "sent", validUntil: after }, now)).toBe("sent");
  expect(quoteState({ status: "sent", validUntil: before }, now)).toBe("expired");
  expect(quoteState({ status: "viewed", validUntil: before }, now)).toBe("expired");
  expect(quoteState({ status: "sent", validUntil: null }, now)).toBe("sent");
});

it("leaves decided quotes alone, whatever the date", () => {
  for (const status of ["accepted", "declined", "revised", "draft"] as const) expect(quoteState({ status, validUntil: before }, now)).toBe(status);
});

it("lets the customer accept only a live quote", () => {
  expect(canAcceptQuote({ status: "viewed", validUntil: after }, now)).toBe(true);
  expect(canAcceptQuote({ status: "sent", validUntil: before }, now)).toBe(false);
  expect(canAcceptQuote({ status: "declined", validUntil: after }, now)).toBe(false);
  expect(canAcceptQuote({ status: "draft", validUntil: after }, now)).toBe(false);
});

it("lets a provider revise anything not yet accepted", () => {
  for (const s of ["sent", "viewed", "declined", "expired"] as const) expect(canReviseQuote(s)).toBe(true);
  for (const s of ["accepted", "revised", "draft"] as const) expect(canReviseQuote(s)).toBe(false);
});
