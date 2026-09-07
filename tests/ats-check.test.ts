import { describe, expect, it } from "vitest";
import { checkAts } from "@/lib/resume/ats-check";
import type { ParsedResume } from "@/lib/resume/parse";

/** A parsed résumé shell — override the bits a case cares about. */
function parsed(over: Partial<ParsedResume> = {}): ParsedResume {
  return {
    skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "AWS", "Docker", "GraphQL", "Redis"],
    experience: [
      {
        title: "Software Engineer",
        company: "Acme",
        start: "2021",
        end: "2024",
        bullets: [],
      },
    ],
    education: [{ school: "IIT", degree: "B.Tech", year: "2021" }],
    experienceYears: 3,
    inferredRoles: ["Software Engineer"],
    ...over,
  };
}

const strongBullets = [
  "Built a payments service handling 12k requests/sec, cutting checkout latency 38%",
  "Reduced infra spend 24% by migrating 40 services to spot instances",
  "Shipped a React design system adopted by 9 teams across the org",
  "Automated release pipeline, dropping deploy time from 45 min to 6 min",
  "Led a 4-engineer squad delivering the search rewrite two weeks early",
  "Scaled the ingestion tier to 2B events/day with a Kafka repartition",
];

const strongText = `Jane Doe
jane@example.com  +91 98765 43210
github.com/janedoe  linkedin.com/in/janedoe
EXPERIENCE
Software Engineer, Acme (2021 - 2024)
${strongBullets.map((b) => `• ${b}`).join("\n")}
EDUCATION
B.Tech, IIT (2021)
SKILLS
React, TypeScript, Node.js, PostgreSQL, AWS, Docker, GraphQL, Redis`;

describe("checkAts strictness", () => {
  it("rules alone never award more than 88, even for a clean strong résumé", () => {
    const r = checkAts(strongText, parsed({ experience: [{ ...parsed().experience[0], bullets: strongBullets }] }));
    expect(r.score).toBeLessThanOrEqual(88);
    expect(r.score).toBeGreaterThanOrEqual(80);
  });

  it("flags verb-thesaurus overuse across the whole document", () => {
    const repetitive = Array.from({ length: 10 }, (_, i) =>
      `• Built feature ${i} serving ${1000 + i} users with 99.9% uptime`,
    ).join("\n");
    const text = strongText.replace(
      strongBullets.map((b) => `• ${b}`).join("\n"),
      repetitive,
    );
    const r = checkAts(
      text,
      parsed({ experience: [{ ...parsed().experience[0], bullets: Array.from({ length: 10 }, (_, i) => `Built feature ${i} serving ${1000 + i} users with 99.9% uptime`) }] }),
    );
    expect(r.issues.some((i) => /opens \d+ bullets/.test(i.label))).toBe(true);
    expect(r.score).toBeLessThan(80);
  });

  it("penalises icon-glyph / letter-spaced extraction noise", () => {
    const noisy = strongText.replace("EXPERIENCE", "E X P E R I E N C E\n∗\n†\n‡\n✱");
    const clean = checkAts(strongText, parsed({ experience: [{ ...parsed().experience[0], bullets: strongBullets }] }));
    const dirty = checkAts(noisy, parsed({ experience: [{ ...parsed().experience[0], bullets: strongBullets }] }));
    expect(dirty.score).toBeLessThan(clean.score);
    expect(dirty.issues.some((i) => i.category === "parseability")).toBe(true);
  });

  it("a weak-verb / cliché résumé is capped well below strong", () => {
    const weakBullets = [
      "Responsible for maintaining several internal tools",
      "Worked on various frontend tasks as a team player",
      "Helped with testing and involved in code reviews",
      "Assisted with multiple projects across the team",
    ];
    const text = strongText
      .replace(strongBullets.map((b) => `• ${b}`).join("\n"), weakBullets.map((b) => `• ${b}`).join("\n"))
      .replace("passionate", "passionate about problem solving");
    const r = checkAts(text, parsed({ experience: [{ ...parsed().experience[0], bullets: weakBullets }] }));
    expect(r.score).toBeLessThanOrEqual(74);
  });
});
