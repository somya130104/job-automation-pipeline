import { describe, expect, it } from "vitest";
import { assessScam, scamBand } from "@/lib/matching/scam";

const base = {
  title: "Remote Software Intern",
  company: "RealCo",
  employmentType: "internship" as const,
  applyUrl: "https://realco.com/careers/intern",
};

describe("assessScam", () => {
  it("flags a registration/training fee as high risk", () => {
    const r = assessScam({
      ...base,
      descriptionText:
        "Great remote internship! A one-time refundable security deposit of Rs 2500 is required for the training kit. Immediate joining.",
    });
    expect(r.risk).toBeGreaterThanOrEqual(55);
    expect(scamBand(r.risk)).toBe("high");
    expect(r.reasons.join(" ")).toMatch(/fee|deposit|payment/i);
  });

  it("flags WhatsApp-only contact + free email", () => {
    const r = assessScam({
      ...base,
      descriptionText:
        "Work from home. To apply, contact us on WhatsApp at +91 90000 00000 or email hiring.desk2024@gmail.com. Limited seats!",
    });
    expect(r.risk).toBeGreaterThanOrEqual(25);
    expect(r.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("flags an outlier internship stipend", () => {
    const r = assessScam({
      ...base,
      descriptionText:
        "Earn a stipend of 95000 per month as an intern working from home, no interview required, guaranteed placement after.",
    });
    expect(r.risk).toBeGreaterThan(25);
  });

  it("leaves a normal posting clear", () => {
    const r = assessScam({
      ...base,
      descriptionText:
        "We're hiring a software engineering intern to work on our React and Node.js codebase. 6-month duration, mentorship provided. Apply through our careers page; the team will review and schedule two interviews.",
    });
    expect(r.risk).toBeLessThan(25);
    expect(scamBand(r.risk)).toBe("clear");
    expect(r.reasons).toHaveLength(0);
  });

  it("does not flag a legit Google Doc JD link on its own without other signals", () => {
    const r = assessScam({
      ...base,
      applyUrl: "https://realco.com/apply",
      descriptionText:
        "Solid remote role. Full JD and team details in this doc: https://docs.google.com/document/d/abc. Standard interview process, offer within two weeks.",
    });
    // one signal (form/doc host) alone is caution at most, never high
    expect(scamBand(r.risk)).not.toBe("high");
  });
});
