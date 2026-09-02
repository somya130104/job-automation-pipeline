import { geminiEnabled, geminiJson } from "@/lib/llm/gemini";
import type { AtsIssue, AtsReport, Category, Severity } from "./ats-check";

/**
 * Gemini-backed résumé review, layered on top of the deterministic rule engine.
 *
 * The prompt encodes a strict, calibrated rubric (the kind of thing
 * resumeworded.com / a sharp recruiter applies) so the model doesn't hand out
 * 95s to average résumés. Returns null when no key is set or the call fails —
 * the caller then relies on `checkAts` alone.
 */

const SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["critical", "warning", "info"] },
          category: {
            type: "string",
            enum: ["parseability", "content", "format"],
          },
          label: { type: "string" },
          detail: { type: "string" },
        },
        required: ["severity", "category", "label", "detail"],
      },
    },
  },
  required: ["score", "summary", "issues"],
} as const;

interface LlmAts {
  score: number;
  summary: string;
  issues: Array<{
    severity: Severity;
    category: Category;
    label: string;
    detail: string;
  }>;
}

const RUBRIC = `You are a strict senior technical recruiter and ATS specialist reviewing a résumé.
Score it 0-100 on how well it would perform in a real hiring funnel. Be tough — calibrate like this:

  95-100  flawless. Rare. Every bullet quantified, every verb strong, zero clichés, perfect parseability.
  85-94   strong. Would clear an ATS and impress a recruiter. Minor nits only.
  70-84   solid but flawed. Real issues: some unquantified bullets, weak verbs, formatting risk, or thin skills.
  55-69   below bar. Multiple weak bullets, missing metrics, buzzwords, or an ATS parse risk.
  <55     serious problems: unparseable sections, no metrics anywhere, heavy clichés, or an image/2-column layout.

Most real résumés land 60-80. Do NOT inflate.

Judge these dimensions:
  PARSEABILITY — can an ATS extract contact info, section headings (Experience/Education/Skills),
    job titles, companies, dates? Flag two-column layouts, text-as-image, header/footer contact info,
    non-standard section names, unparseable date formats, words glued together on extraction.
  CONTENT — does every bullet start with a strong past-tense achievement verb? What fraction carry a
    real metric (%, count, $, time)? Flag weak openers ("responsible for", "worked on", "helped"),
    résumé clichés ("team player", "results-driven", "passionate about", "proven track record"),
    first-person pronouns, repeated opening verbs, vague quantifiers ("several", "significantly"),
    passive voice, bullets over ~45 words, and bullets that state duties instead of outcomes.
  FORMAT — length appropriate for experience level (a student/new-grad résumé should be one page),
    consistent date formatting, a real Skills section with named tools, no first-person summary blob.

Return 4-9 of the most important, specific, actionable issues (not generic advice). Each detail must
say exactly what to change. Order by severity. Also return a one-sentence overall summary.`;

export async function checkAtsLlm(text: string): Promise<AtsReport | null> {
  if (!geminiEnabled()) return null;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const out = await geminiJson<LlmAts>(
      `${RUBRIC}\n\nToday is ${today}. Dates on or before today are in the past — never flag them as "future-dated".\n\nRESUME TEXT (as extracted by an ATS parser — judge it as-is):\n"""\n${text.slice(0, 14000)}\n"""`,
      SCHEMA as unknown as Record<string, unknown>,
      { maxOutputTokens: 2200, temperature: 0.15 },
    );

    const score = Math.max(0, Math.min(100, Math.round(out.score)));
    const issues: AtsIssue[] = (out.issues ?? [])
      .slice(0, 12)
      .map((i) => ({
        severity: (["critical", "warning", "info"] as const).includes(i.severity)
          ? i.severity
          : "warning",
        category: (["parseability", "content", "format"] as const).includes(
          i.category,
        )
          ? i.category
          : "content",
        label: String(i.label).slice(0, 90),
        detail: String(i.detail).slice(0, 500),
      }));

    return { score, issues };
  } catch {
    return null;
  }
}

/**
 * Blend the rule engine and the LLM. The rules are the strictness anchor —
 * the LLM score can pull down freely but can only pull up a little, so a
 * clean-but-mediocre résumé can't be talked into a 95. Issues from both are
 * merged and de-duplicated.
 */
export function mergeAts(rules: AtsReport, llm: AtsReport | null): AtsReport {
  if (!llm) return rules;

  const blended = Math.round(0.45 * rules.score + 0.55 * llm.score);
  const score = Math.max(0, Math.min(blended, rules.score + 8));

  const seen = new Set<string>();
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).slice(0, 4).join(" ");

  const merged: AtsIssue[] = [];
  for (const issue of [...llm.issues, ...rules.issues]) {
    const key = norm(issue.label);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(issue);
  }

  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  merged.sort((a, b) => order[a.severity] - order[b.severity]);

  return { score, issues: merged.slice(0, 12), signals: rules.signals };
}
