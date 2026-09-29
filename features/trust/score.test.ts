import { describe, expect, it } from "vitest";
import { computeTrustScore, type VerifiedJob } from "./score";

const now = new Date("2026-09-29T00:00:00Z");
const job = (over: Partial<VerifiedJob> = {}): VerifiedJob => ({
  rating: 5,
  slaDueAt: new Date("2026-09-20T12:00:00Z"),
  completedAt: new Date("2026-09-20T10:00:00Z"),
  quotedMinor: 100_00,
  finalMinor: 100_00,
  responseMinutes: 20,
  ...over,
});

describe("computeTrustScore", () => {
  it("withholds an overall score until there is enough verified work", () => {
    const t = computeTrustScore({ jobs: [job(), job()], identityVerified: true, credentials: [], now });
    expect(t.score).toBeNull();
    expect(t.band).toBe("new");
    expect(t.confidence).toBe("low");
  });

  it("scores a consistently excellent provider highly with high confidence", () => {
    const t = computeTrustScore({ jobs: Array.from({ length: 60 }, () => job()), identityVerified: true, credentials: [], now });
    expect(t.score).toBeGreaterThanOrEqual(95);
    expect(t.band).toBe("excellent");
    expect(t.confidence).toBe("high");
  });

  it("does not let three perfect reviews read as perfect quality", () => {
    const t = computeTrustScore({ jobs: [job(), job(), job()], identityVerified: true, credentials: [], now });
    expect(t.dimensions.find((d) => d.key === "quality")!.score).toBeLessThan(90);
  });

  it("penalises missed SLAs, quote drift and expired credentials", () => {
    const late = job({ completedAt: new Date("2026-09-21T00:00:00Z"), finalMinor: 150_00 });
    const t = computeTrustScore({
      jobs: Array.from({ length: 20 }, () => late),
      identityVerified: true,
      credentials: [{ name: "CIDA", expiresOn: "2026-01-01" }],
      now,
    });
    const dim = (k: string) => t.dimensions.find((d) => d.key === k)!.score;
    expect(dim("sla")).toBe(0);
    expect(dim("quote")).toBe(0);
    expect(dim("compliance")).toBe(75);
  });

  it("ignores dimensions with no data instead of scoring them zero", () => {
    const t = computeTrustScore({
      jobs: Array.from({ length: 5 }, () => job({ quotedMinor: null, responseMinutes: null })),
      identityVerified: true,
      credentials: [],
      now,
    });
    expect(t.dimensions.find((d) => d.key === "quote")!.score).toBeNull();
    expect(t.score).toBeGreaterThan(80);
  });
});
