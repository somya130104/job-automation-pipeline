import { describe, expect, it } from "vitest";
import { scoreJob } from "@/lib/matching/score";

const frontendProfile = {
  skills: ["React", "TypeScript", "Next.js", "Node.js", "CSS", "GraphQL"],
  targetRoles: ["Frontend Engineer"],
  targetLocations: ["Bengaluru", "Remote"],
  experienceYears: 4,
  remoteOnly: false,
  roleType: "fulltime" as const,
};

const frontendJob = {
  title: "Senior Frontend Engineer",
  descriptionText:
    "Build our web app in React and TypeScript. Next.js, GraphQL, component libraries, 4+ years frontend experience.",
  locations: ["Bengaluru"],
  remoteType: "onsite",
  employmentType: "fulltime",
};

const unrelatedJob = {
  title: "Warehouse Forklift Operator",
  descriptionText:
    "Operate a forklift on the night shift. Physical stamina required. No computer experience needed. Lift 25kg repeatedly.",
  locations: ["Pune"],
  remoteType: "onsite",
  employmentType: "fulltime",
};

describe("scoreJob", () => {
  it("scores a matching frontend job highly", () => {
    const r = scoreJob({ job: frontendJob, profile: frontendProfile });
    expect(r.score).toBeGreaterThan(60);
    expect(r.matchedKeywords).toContain("React");
  });

  it("scores an unrelated job low", () => {
    const r = scoreJob({ job: unrelatedJob, profile: frontendProfile });
    expect(r.score).toBeLessThan(30);
  });

  it("ranks the matching job above the unrelated one", () => {
    const a = scoreJob({ job: frontendJob, profile: frontendProfile }).score;
    const b = scoreJob({ job: unrelatedJob, profile: frontendProfile }).score;
    expect(a).toBeGreaterThan(b + 30);
  });

  it("applies the role-type mismatch penalty for interns vs full-time", () => {
    const asIntern = scoreJob({
      job: frontendJob,
      profile: { ...frontendProfile, roleType: "internship" },
    }).score;
    const asFulltime = scoreJob({ job: frontendJob, profile: frontendProfile }).score;
    expect(asIntern).toBeLessThan(asFulltime);
  });

  it("redistributes weight when no semantic similarity is supplied", () => {
    const without = scoreJob({ job: frontendJob, profile: frontendProfile });
    const withSemantic = scoreJob({
      job: frontendJob,
      profile: frontendProfile,
      semanticSimilarity: 0.7,
    });
    // both should be sensible scores, not one collapsing to a third lower
    expect(without.score).toBeGreaterThan(55);
    expect(withSemantic.score).toBeGreaterThan(55);
  });

  it("gates a completely off-target title even with incidental keyword overlap", () => {
    const r = scoreJob({
      job: {
        title: "Stock Plan Administrator",
        descriptionText:
          "Manage our equity compensation. Some familiarity with Excel and basic SQL. Work with React-based internal tools occasionally.",
        locations: ["Bengaluru"],
        remoteType: "onsite",
        employmentType: "fulltime",
      },
      profile: frontendProfile,
    });
    expect(r.score).toBeLessThan(40);
  });
});
