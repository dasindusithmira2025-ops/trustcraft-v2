import { expect, it } from "vitest";
import { classify } from "./classify";

it("maps plain language to a category", () => {
  expect(classify("The AC is not cooling at all")).toEqual({ categoryId: "hvac", confidence: "strong" });
  expect(classify("kitchen sink is blocked and leaking")?.categoryId).toBe("plumbing");
  expect(classify("breaker keeps tripping")?.categoryId).toBe("electrical");
  expect(classify("hello there")).toBeNull();
});

it("lets the named equipment beat a generic symptom", () => {
  expect(classify("Water is dripping from the bedroom AC when it runs")?.categoryId).toBe("hvac");
  expect(classify("water leaking under the toilet")?.categoryId).toBe("plumbing");
});
