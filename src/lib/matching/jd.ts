import { extractSkills } from "./skills";

/** Structured signals pulled out of a raw job description. */
export interface JdSignals {
  skills: string[];
  /** Minimum years of experience the JD asks for, if it states one. */
  minYears: number | null;
  seniority: Seniority;
  isInternship: boolean;
}

export type Seniority =
  | "intern"
  | "junior"
  | "mid"
  | "senior"
  | "staff"
  | "unknown";

const YEARS_PATTERNS: RegExp[] = [
  // "5+ years", "5 + yrs", "5plus years"
  /(\d{1,2})\s*\+\s*(?:years?|yrs?)/i,
  // "3-5 years" -> take the lower bound, it is the actual bar
  /(\d{1,2})\s*(?:-|–|—|to)\s*\d{1,2}\s*(?:years?|yrs?)/i,
  // "at least 4 years", "minimum of 4 years"
  /(?:at least|minimum(?:\s+of)?|min\.?)\s*(\d{1,2})\s*(?:years?|yrs?)/i,
  // "4 years of experience"
  /(\d{1,2})\s*(?:years?|yrs?)\s*(?:of\s*)?(?:relevant\s*|professional\s*|industry\s*)?experience/i,
];

export function extractMinYears(text: string): number | null {
  for (const re of YEARS_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const years = Number(m[1]);
      // Guard against matching things like "10 years founded in..." nonsense.
      if (Number.isFinite(years) && years >= 0 && years <= 20) return years;
    }
  }
  return null;
}

const SENIORITY_RULES: Array<{ level: Seniority; re: RegExp }> = [
  { level: "intern", re: /\b(intern|internship|trainee|apprentice|co-?op)\b/i },
  {
    level: "staff",
    re: /\b(staff|principal|distinguished|architect|head of|director|vp of)\b/i,
  },
  { level: "senior", re: /\b(senior|sr\.?|lead|iii)\b/i },
  {
    level: "junior",
    re: /\b(junior|jr\.?|entry[- ]level|graduate|new grad|fresher|associate|i{1,2}\b)\b/i,
  },
];

export function extractSeniority(title: string, body = ""): Seniority {
  // Title is far more reliable than the body — a senior JD often says
  // "you'll mentor juniors", which the body-only check would misread.
  for (const { level, re } of SENIORITY_RULES) {
    if (re.test(title)) return level;
  }
  if (/\b(intern|internship)\b/i.test(body)) return "intern";
  return "unknown";
}

/** Rough years-of-experience each seniority band implies, for fallback fit. */
export const SENIORITY_YEARS: Record<Seniority, number | null> = {
  intern: 0,
  junior: 1,
  mid: 3,
  senior: 6,
  staff: 9,
  unknown: null,
};

export function analyseJd(title: string, description: string): JdSignals {
  const combined = `${title}\n${description}`;
  const seniority = extractSeniority(title, description);
  return {
    skills: extractSkills(combined),
    minYears: extractMinYears(description),
    seniority,
    isInternship: seniority === "intern",
  };
}
