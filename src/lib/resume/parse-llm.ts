import { geminiEnabled, geminiJson } from "@/lib/llm/gemini";
import { canonicalizeSkill } from "@/lib/matching/skills";
import { parseResume, type ParsedResume } from "./parse";

/**
 * LLM-backed structured extraction from resume text, with the rule-based
 * `parseResume` as a strict fallback.
 *
 * The concept doc's plan: "pdf-parse / mammoth + an LLM call for structured
 * field extraction ... swapping in Gemini later is a one-function change".
 * This is that function. It returns the exact `ParsedResume` shape, so every
 * caller (the upload route, onboarding pre-fill, rescoring) is unchanged.
 *
 * Skills from the model are run through the same canonical taxonomy the
 * scorer uses, so "NodeJS" from the LLM and "Node.js" from a JD still match.
 */

const SCHEMA = {
  type: "object",
  properties: {
    skills: { type: "array", items: { type: "string" } },
    experienceYears: { type: "number" },
    inferredRoles: { type: "array", items: { type: "string" } },
    experience: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          company: { type: "string" },
          start: { type: "string", nullable: true },
          end: { type: "string", nullable: true },
          bullets: { type: "array", items: { type: "string" } },
        },
        required: ["title", "company", "bullets"],
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          school: { type: "string" },
          degree: { type: "string", nullable: true },
          year: { type: "string", nullable: true },
        },
        required: ["school"],
      },
    },
  },
  required: ["skills", "experienceYears", "inferredRoles", "experience", "education"],
} as const;

interface LlmResume {
  skills: string[];
  experienceYears: number;
  inferredRoles: string[];
  experience: Array<{
    title: string;
    company: string;
    start?: string | null;
    end?: string | null;
    bullets: string[];
  }>;
  education: Array<{ school: string; degree?: string | null; year?: string | null }>;
}

export async function extractResumeFields(text: string): Promise<ParsedResume> {
  const rulesBased = parseResume(text);
  if (!geminiEnabled()) return rulesBased;

  try {
    const out = await geminiJson<LlmResume>(
      `Extract structured fields from this resume. Rules:\n` +
        `- skills: concrete technologies, languages, frameworks, tools and named methodologies only. No soft skills, no full sentences. Max 40.\n` +
        `- experienceYears: total professional experience in years as a number (sum of non-overlapping employment, exclude education). Internships count at half weight.\n` +
        `- inferredRoles: 1-4 canonical job titles this person is a fit for, e.g. "Frontend Engineer".\n` +
        `- experience: one entry per role, newest first, bullets copied near-verbatim (trim leading dashes).\n` +
        `- education: degree + institution + graduation year.\n` +
        `Return null fields rather than guessing.\n\nRESUME:\n${text.slice(0, 12000)}`,
      SCHEMA as unknown as Record<string, unknown>,
      { maxOutputTokens: 3000 },
    );

    const skills = Array.from(
      new Set(
        (out.skills ?? [])
          .map((s) => canonicalizeSkill(String(s)))
          .filter((s) => s && s.length <= 40),
      ),
    );

    // If the model produced obviously worse output than the parser (e.g. it
    // choked and returned almost nothing), keep the parser's result.
    if (skills.length < rulesBased.skills.length * 0.5 && rulesBased.skills.length >= 6) {
      return rulesBased;
    }

    return {
      skills: skills.length ? skills : rulesBased.skills,
      experienceYears:
        Number.isFinite(out.experienceYears) && out.experienceYears >= 0
          ? Math.round(out.experienceYears * 10) / 10
          : rulesBased.experienceYears,
      inferredRoles: (out.inferredRoles ?? []).slice(0, 4).filter(Boolean),
      experience: (out.experience ?? []).slice(0, 12).map((e) => ({
        title: e.title || "Role",
        company: e.company || "",
        start: e.start ?? null,
        end: e.end ?? null,
        bullets: (e.bullets ?? []).map((b) => String(b).trim()).filter(Boolean),
      })),
      education: (out.education ?? []).slice(0, 6).map((ed) => ({
        school: ed.school || "",
        degree: ed.degree ?? null,
        year: ed.year ?? null,
      })),
    };
  } catch {
    return rulesBased;
  }
}
