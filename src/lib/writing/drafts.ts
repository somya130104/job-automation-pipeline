/**
 * Template-driven draft generation for resume bullets and outreach notes.
 *
 * Rule-based on purpose: Phase 1 runs with zero API keys. Every function here
 * returns a *starting point the user edits* — nothing is auto-applied to a
 * saved resume and nothing is ever auto-sent. Phase 2 swaps the bodies for an
 * LLM call behind these same signatures.
 */

export interface BulletSuggestion {
  keyword: string;
  template: string;
  hint: string;
}

/**
 * One suggested bullet per missing keyword, shaped as
 * action + the missing tool + a slot for the user's own metric.
 */
export function suggestBullets(
  missingKeywords: string[],
  jobTitle: string,
): BulletSuggestion[] {
  const verbs = [
    "Built", "Shipped", "Migrated", "Automated", "Designed",
    "Optimised", "Instrumented", "Scaled",
  ];

  return missingKeywords.slice(0, 6).map((keyword, i) => ({
    keyword,
    template: `${verbs[i % verbs.length]} [what you built] using ${keyword}, [measurable outcome — e.g. cutting p95 latency 40% / serving 12k daily users].`,
    hint: hintFor(keyword, jobTitle),
  }));
}

function hintFor(keyword: string, jobTitle: string): string {
  const lower = keyword.toLowerCase();

  if (/(aws|gcp|azure|kubernetes|docker|terraform)/.test(lower)) {
    return `Infrastructure keywords screen hard. Even coursework or a side project deployment counts — name ${keyword} explicitly rather than saying "cloud".`;
  }
  if (/(testing|ci\/cd|observability|code review)/.test(lower)) {
    return `Process signals like ${keyword} separate mid from senior candidates on a ${jobTitle} screen. Mention the specific tool you used.`;
  }
  if (/(communication|collaboration|mentoring|ownership)/.test(lower)) {
    return `Don't list ${keyword} as a skill — evidence it. "Mentored two interns through their first production deploy" beats the word itself.`;
  }
  return `Only claim ${keyword} if you have genuinely used it. A keyword you can't defend in an interview is worse than a gap.`;
}

export interface OutreachDraft {
  subject: string;
  body: string;
}

/**
 * A short connection note referencing the specific role. The user reviews,
 * edits and sends it themselves — the app never sends anything on their behalf.
 */
export function draftOutreach(input: {
  jobTitle: string;
  company: string;
  matchedKeywords: string[];
  userName: string | null;
  experienceYears: number;
}): OutreachDraft {
  const { jobTitle, company, matchedKeywords, userName, experienceYears } = input;

  const strengths = matchedKeywords.slice(0, 3);
  const strengthLine =
    strengths.length >= 2
      ? `${strengths.slice(0, -1).join(", ")} and ${strengths.at(-1)}`
      : (strengths[0] ?? "the core stack");

  const tenure =
    experienceYears >= 1
      ? `${Math.round(experienceYears)} years working with`
      : "hands-on project experience with";

  return {
    subject: `${jobTitle} role at ${company}`,
    body: [
      `Hi [name],`,
      ``,
      `I came across the ${jobTitle} opening at ${company} and wanted to reach out directly rather than disappear into the application pile.`,
      ``,
      `I have ${tenure} ${strengthLine}, which lines up closely with what the posting describes. [One specific sentence about something you built that's relevant — the more concrete the better.]`,
      ``,
      `Would you be open to a short conversation about the role, or able to point me toward whoever is running the hiring for it?`,
      ``,
      `Thanks,`,
      userName ?? "[your name]",
    ].join("\n"),
  };
}
