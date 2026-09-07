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

  it("weights hard tech skills over soft-skill boilerplate", () => {
    const base = {
      title: "Backend Engineer",
      locations: ["Bengaluru"],
      remoteType: "onsite",
      employmentType: "fulltime",
    };
    // JD asks for the same tech, but one piles on soft-skill boilerplate the
    // resume doesn't name. That should barely move the score.
    const techOnly = scoreJob({
      job: { ...base, descriptionText: "Node.js and PostgreSQL and GraphQL and Redis." },
      profile: frontendProfile,
    });
    const withSoftNoise = scoreJob({
      job: {
        ...base,
        descriptionText:
          "Node.js and PostgreSQL and GraphQL and Redis. Strong communication, collaboration, ownership, mentoring and stakeholder management.",
      },
      profile: frontendProfile,
    });
    expect(techOnly.keywordScore - withSoftNoise.keywordScore).toBeLessThan(8);
    // Soft skills never surface as an actionable gap chip.
    for (const soft of ["Communication", "Collaboration", "Ownership", "Mentoring"]) {
      expect(withSoftNoise.missingKeywords).not.toContain(soft);
    }
  });

  it("orders gap chips hard-tools first", () => {
    const r = scoreJob({
      job: {
        title: "Data Engineer",
        descriptionText:
          "Kafka, Airflow, Spark, dbt pipelines. System design and testing discipline expected.",
        locations: ["Remote"],
        remoteType: "remote",
        employmentType: "fulltime",
      },
      profile: { ...frontendProfile, skills: [] },
    });
    const practiceIdx = r.missingKeywords.findIndex((s) => s === "System Design" || s === "Testing");
    const toolIdx = r.missingKeywords.findIndex((s) => ["Kafka", "Airflow", "Spark", "dbt"].includes(s));
    if (practiceIdx !== -1 && toolIdx !== -1) expect(toolIdx).toBeLessThan(practiceIdx);
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
