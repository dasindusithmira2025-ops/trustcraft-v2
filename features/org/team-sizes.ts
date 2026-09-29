import type { Segment } from "@/lib/db/schema";

/** Team-size choices people recognise, and the segment each implies. */
export const TEAM_SIZES = [
  { id: "1", label: "Just me", size: 1 },
  { id: "5", label: "2–5 people", size: 4 },
  { id: "10", label: "6–10 people", size: 8 },
  { id: "25", label: "11–25 people", size: 18 },
  { id: "100", label: "26–100 people", size: 50 },
  { id: "500", label: "More than 100", size: 150 },
] as const;

export const segmentForSize = (size: number): Segment => (size <= 1 ? "solo" : size <= 10 ? "team" : "company");
