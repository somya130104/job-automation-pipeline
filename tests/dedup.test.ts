import { describe, expect, it } from "vitest";
import { dedupKey, fingerprint, type NormalizedJob } from "@/lib/sources/types";

function job(partial: Partial<NormalizedJob>): NormalizedJob {
  return {
    externalId: "1",
    source: "greenhouse",
    sourceToken: "acme",
    title: "Software Engineer",
    company: "Acme",
    locations: [],
    remoteType: "unknown",
    employmentType: "fulltime",
    descriptionText: "x".repeat(200),
    applyUrl: "https://example.com/job/1",
    postedAt: new Date("2026-01-01"),
    ...partial,
  };
}

describe("fingerprint", () => {
  it("is stable for the same posting re-ingested", () => {
    expect(fingerprint(job({}))).toBe(fingerprint(job({})));
  });

  it("differs when the external id changes", () => {
    expect(fingerprint(job({ externalId: "1" }))).not.toBe(
      fingerprint(job({ externalId: "2" })),
    );
  });

  it("differs across sources for the same role", () => {
    expect(fingerprint(job({ source: "greenhouse" }))).not.toBe(
      fingerprint(job({ source: "lever", sourceToken: "acme" })),
    );
  });
});

describe("dedupKey", () => {
  it("collapses the same role reached via two different sources", () => {
    const viaGh = job({ source: "greenhouse", externalId: "gh-1" });
    const viaFeed = job({ source: "remoteok", sourceToken: "", externalId: "rok-9" });
    expect(dedupKey(viaGh)).toBe(dedupKey(viaFeed));
  });

  it("ignores parenthetical suffixes like (Remote) / (f/m/d)", () => {
    expect(dedupKey(job({ title: "Software Engineer (Remote)" }))).toBe(
      dedupKey(job({ title: "Software Engineer" })),
    );
  });

  it("normalises punctuation and case in company names", () => {
    expect(dedupKey(job({ company: "Acme, Inc." }))).toBe(
      dedupKey(job({ company: "acme inc" })),
    );
  });

  it("keeps genuinely different roles apart", () => {
    expect(dedupKey(job({ title: "Frontend Engineer" }))).not.toBe(
      dedupKey(job({ title: "Backend Engineer" })),
    );
  });
});
