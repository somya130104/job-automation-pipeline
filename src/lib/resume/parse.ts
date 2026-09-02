import { extractSkills } from "@/lib/matching/skills";

/**
 * Heuristic structured extraction from resume text.
 *
 * Deliberately rule-based, not LLM-based: Phase 1 must run with zero API keys.
 * The shapes here are exactly what an LLM extraction call would return, so
 * swapping in Gemini later is a one-function change (`parseResume` keeps its
 * signature; only the body changes).
 */

export interface ParsedExperience {
  title: string;
  company: string;
  start: string | null;
  end: string | null;
  bullets: string[];
}

export interface ParsedEducation {
  school: string;
  degree: string | null;
  year: string | null;
}

export interface ParsedResume {
  skills: string[];
  experience: ParsedExperience[];
  education: ParsedEducation[];
  experienceYears: number;
  inferredRoles: string[];
}

/* ------------------------------------------------------------------ */
/* Section splitting                                                   */
/* ------------------------------------------------------------------ */

/**
 * Section keyword matchers, checked in priority order. A heading only has to
 * *contain* one of these — so "EDUCATIONAL QUALIFICATIONS", "INTERNSHIP
 * EXPERIENCES", "KEY PROJECTS", "SKILLS & INTERESTS" all resolve correctly,
 * which exact-string matching used to miss.
 */
const SECTION_MATCHERS: Array<{ section: string; re: RegExp }> = [
  { section: "experience", re: /\b(work|professional|industry|relevant)?\s*experiences?\b/i },
  { section: "experience", re: /\binternships?\b|\binternship experiences?\b/i },
  { section: "experience", re: /\b(employment|work) history\b|\bcareer history\b/i },
  { section: "experience", re: /\bpositions? of responsibilit(?:y|ies)\b/i },
  { section: "education", re: /\beducat(?:ion|ional)\b|\bacademic (?:background|qualifications?)\b/i },
  { section: "education", re: /\beducational qualifications?\b|\bacademic details\b/i },
  { section: "projects", re: /\b(key|academic|selected|personal|side|technical)?\s*projects?\b/i },
  { section: "skills", re: /\b(technical|core|key)?\s*skills\b|\btech(?:nical)? stack\b|\btechnolog(?:y|ies)\b|\bcompetenc(?:y|ies)\b|\btoolbox\b/i },
];

/** Words that mean a "heading" line is really prose, not a heading. */
const HEADING_STOPWORDS =
  /\b(i|my|we|our|with|using|including|such as|responsible|worked|built|developed|and the|for the)\b/i;

/**
 * A heading is a short, punctuation-free line whose text contains a section
 * keyword. The shortness + stopword guards stop "I have experience with
 * distributed systems" being read as the Experience heading.
 */
function classifyHeading(line: string): string | null {
  const raw = line.trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/[:•\-–—_*|]+$/g, "")
    .replace(/^[•\-–—*#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Headings are short and terse: few words, no mid-line sentence punctuation.
  const wordCount = cleaned.split(" ").filter(Boolean).length;
  if (!cleaned || cleaned.length > 48 || wordCount > 6) return null;
  if (/[.!?;]\s/.test(cleaned) || /\d{4}/.test(cleaned)) return null;
  if (HEADING_STOPWORDS.test(cleaned)) return null;

  for (const { section, re } of SECTION_MATCHERS) {
    if (re.test(cleaned)) return section;
  }
  return null;
}

export function splitSections(text: string): Record<string, string> {
  const lines = text.split("\n");
  const sections: Record<string, string[]> = { _preamble: [] };
  let current = "_preamble";

  for (const line of lines) {
    const heading = classifyHeading(line);
    if (heading) {
      current = heading;
      if (!sections[current]) sections[current] = [];
      continue;
    }
    (sections[current] ??= []).push(line);
  }

  return Object.fromEntries(
    Object.entries(sections).map(([k, v]) => [k, v.join("\n").trim()]),
  );
}

/* ------------------------------------------------------------------ */
/* Dates & tenure                                                      */
/* ------------------------------------------------------------------ */

const MONTHS =
  "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";

// One date token: "Jan 2020", "May'25", "05/2019", "2020", "Sept. 2021".
const DATE_TOKEN = `(?:(?:${MONTHS})\\.?[\\s']*)?(?:\\d{4}|'?\\d{2})|\\d{1,2}\\/\\d{2,4}`;

// A range: "<token> - <token|present>". Handles hyphen/en-dash/em-dash/"to",
// 2-digit apostrophe years ("May'25 - Jul'25") and parenthesised ranges.
const DATE_RANGE_RE = new RegExp(
  `(${DATE_TOKEN})\\s*(?:-|–|—|to|until|through)\\s*(${DATE_TOKEN}|present|current|now|ongoing|date)`,
  "i",
);

function normYear(y: string): number {
  const n = Number(y.replace(/'/g, ""));
  return n < 100 ? 2000 + n : n;
}

function toDate(token: string): Date | null {
  const t = token.trim().toLowerCase().replace(/[()]/g, "");
  if (/^(present|current|now|ongoing|date)$/.test(t)) return new Date();

  const slash = /^(\d{1,2})\/(\d{2,4})$/.exec(t);
  if (slash) return new Date(normYear(slash[2]), Number(slash[1]) - 1, 1);

  const monthYear = new RegExp(`^(${MONTHS})\\.?[\\s']*('?\\d{2}|\\d{4})$`, "i").exec(t);
  if (monthYear) {
    const idx = [
      "jan", "feb", "mar", "apr", "may", "jun",
      "jul", "aug", "sep", "oct", "nov", "dec",
    ].indexOf(monthYear[1].slice(0, 3).toLowerCase());
    return new Date(normYear(monthYear[2]), idx < 0 ? 0 : idx, 1);
  }

  const yearOnly2 = /^'?(\d{2})$/.exec(t);
  if (yearOnly2) {
    const year = 2000 + Number(yearOnly2[1]);
    if (year >= 1990 && year <= new Date().getFullYear() + 1) return new Date(year, 0, 1);
  }

  const yearOnly = /^(\d{4})$/.exec(t);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    // Guard against picking up "GPA 3.85" style numbers or future typos.
    if (year >= 1970 && year <= new Date().getFullYear() + 1) {
      return new Date(year, 0, 1);
    }
  }
  return null;
}

/**
 * Total professional experience, measured as the union of employment date
 * ranges rather than their sum — overlapping roles (a job plus a concurrent
 * contract) must not be double-counted into inflated seniority.
 */
export function computeExperienceYears(text: string): number {
  const ranges: Array<[number, number]> = [];
  const re = new RegExp(DATE_RANGE_RE.source, "gi");

  for (const match of text.matchAll(re)) {
    const start = toDate(match[1]);
    const end = toDate(match[2]);
    if (!start || !end) continue;
    if (end.getTime() <= start.getTime()) continue;
    ranges.push([start.getTime(), end.getTime()]);
  }

  if (ranges.length === 0) return 0;

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [ranges[0]];
  for (const [start, end] of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }

  const totalMs = merged.reduce((sum, [s, e]) => sum + (e - s), 0);
  const years = totalMs / (365.25 * 24 * 60 * 60 * 1000);
  return Math.round(years * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* Experience entries                                                  */
/* ------------------------------------------------------------------ */

const LEAD_MARKER_RE = /^\s*[•●○◦▪‣·*\u2022\u25AA\u25E6-]\s+/;
/** Sub-bullets use a *different* marker than the role header in many resumes
 * ("•" for the role, "◦"/"-" for bullets). Treat these as always-a-bullet. */
const SUB_BULLET_RE = /^\s*[◦‣▸▹\-*]\s+/;
/** Signals a line is a job/role header rather than a bullet or prose. */
const ROLE_HEADER_RE = /\s[|–—]\s|\s+\bat\b\s+|\)\s*$/;

function stripMarker(line: string): string {
  return line.replace(LEAD_MARKER_RE, "").trim();
}

function splitTitleCompany(text: string): { title: string; company: string } {
  const parts = text
    .split(/\s*[|–—]\s*|\s{2,}|\s+\bat\b\s+|,\s+(?=[A-Z])/)
    .map((p) => p.trim())
    .filter(Boolean);
  return { title: parts[0] ?? text ?? "Role", company: parts[1] ?? "" };
}

function parseExperienceSection(section: string): ParsedExperience[] {
  if (!section) return [];

  const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);
  const entries: ParsedExperience[] = [];
  let current: ParsedExperience | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const body = stripMarker(line);
    const dateMatch = body.match(DATE_RANGE_RE);
    const looksLikeHeader =
      !SUB_BULLET_RE.test(line) &&
      body.length < 170 &&
      (dateMatch !== null || ROLE_HEADER_RE.test(body)) &&
      // guard against a sentence-y bullet that happens to contain "at" / a year
      !/\b(built|led|developed|designed|implemented|created|improved|reduced|increased)\b/i.test(
        body.split(/\s+/).slice(0, 2).join(" "),
      );

    if (looksLikeHeader) {
      if (current) entries.push(current);
      // Date might be on this line, or wrap to the next.
      const dm =
        dateMatch ??
        lines[i + 1]?.match(DATE_RANGE_RE) ??
        lines[i + 2]?.match(DATE_RANGE_RE);
      const withoutDate = body.replace(DATE_RANGE_RE, "").replace(/\(\s*\)/g, "").trim();
      const { title, company } = splitTitleCompany(withoutDate);
      current = {
        title,
        company,
        start: dm ? dm[1].trim() : null,
        end: dm ? dm[2].trim() : null,
        bullets: [],
      };
      continue;
    }

    // Otherwise it's bullet/detail text belonging to the current role.
    if (current) {
      const b = SUB_BULLET_RE.test(line) ? line.replace(SUB_BULLET_RE, "").trim() : body;
      if (b.length > 2) current.bullets.push(b);
    }
  }

  if (current) entries.push(current);
  return entries.slice(0, 14);
}

/* ------------------------------------------------------------------ */
/* Education                                                           */
/* ------------------------------------------------------------------ */

// Allow spaces after the abbreviation dot ("B. Tech", "M. Tech"), plus Indian
// board exams which resumes routinely list as education entries.
const DEGREE_RE =
  /\b(b\.?\s?tech|b\.?\s?e\.?|b\.?\s?sc|bachelor(?:'?s)?|m\.?\s?tech|m\.?\s?sc|master(?:'?s)?|dual degree|integrated m\.?\s?tech|mba|pgdm|ph\.?\s?d|doctorate|diploma|b\.?\s?com|b\.?\s?a\b|bca|mca|class\s+(?:x{1,3}|xii|10|12))\b/i;

const FIELD_OF_STUDY_PREFIX_RE =
  /^(?:computer science(?:\s+(?:&|and)\s+engineering)?|information technology|data science|artificial intelligence|electrical(?:\s+(?:&|and)\s+electronics)?|electronics(?:\s+(?:&|and)\s+communication)?|mechanical|civil|chemical|biotechnology|mathematics|statistics|physics|chemistry|business administration|commerce|economics|design)\s+/i;

function parseEducationSection(section: string): ParsedEducation[] {
  if (!section) return [];

  const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);
  const entries: ParsedEducation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const degree = line.match(DEGREE_RE);
    if (!degree) continue;

    // The graduation year often sits a line or two below the degree on
    // stacked (non-inline) education blocks.
    const yearMatch =
      line.match(/\b(19|20)\d{2}\b/) ??
      lines[i + 1]?.match(/\b(19|20)\d{2}\b/) ??
      lines[i + 2]?.match(/\b(19|20)\d{2}\b/);

    // The school is whichever of this line / the neighbours reads like an
    // institution rather than the degree itself.
    const candidates = [line, lines[i - 1], lines[i + 1]].filter(Boolean);
    const school =
      candidates.find((c) =>
        /\b(university|college|institute|school|iit|nit|iiit|academy)\b/i.test(c!),
      ) ?? line;

    // Strip the degree, the year and any leading field-of-study fragment so
    // the school reads as an institution name rather than the whole line.
    const cleanedSchool =
      school!
        .replace(DEGREE_RE, " ")
        .replace(/\b(19|20)\d{2}\b/g, " ")
        .replace(/[,|•·]/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim()
        // "B.E." leaves a stray "." behind once the degree token is removed.
        .replace(/^[.\-–—:;\s]+/, "")
        .replace(/^(?:in|of)\s+/i, "")
        .trim() || school!;

    entries.push({
      // "Computer Science National Institute of Technology" — the field of
      // study sits between the degree and the institution on most Indian
      // resumes. A regex anchored on the institution keyword can't tell
      // "Computer Science" from "National" (both precede "Institute"), so
      // strip known study fields off the front explicitly instead.
      school: cleanedSchool.replace(FIELD_OF_STUDY_PREFIX_RE, "").trim() ||
        cleanedSchool,
      degree: degree[0],
      year: yearMatch ? yearMatch[0] : null,
    });
  }

  // De-dupe: a single education line can match on several passes.
  const seen = new Set<string>();
  return entries
    .filter((e) => {
      const key = `${e.school}|${e.degree}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

/* ------------------------------------------------------------------ */
/* Role inference                                                      */
/* ------------------------------------------------------------------ */

const ROLE_PATTERNS = [
  "software engineer", "frontend engineer", "front end developer",
  "backend engineer", "full stack engineer", "full stack developer",
  "data scientist", "data engineer", "data analyst", "ml engineer",
  "machine learning engineer", "devops engineer", "site reliability engineer",
  "mobile engineer", "android developer", "ios developer",
  "product manager", "product designer", "ui designer", "ux designer",
  "qa engineer", "security engineer", "platform engineer", "web developer",
];

function inferRoles(text: string, experience: ParsedExperience[]): string[] {
  const found = new Set<string>();
  const haystack = `${experience.map((e) => e.title).join(" ")} ${text}`.toLowerCase();

  for (const role of ROLE_PATTERNS) {
    if (haystack.includes(role)) {
      found.add(role.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
    if (found.size >= 4) break;
  }
  return [...found];
}

/* ------------------------------------------------------------------ */

export function parseResume(text: string): ParsedResume {
  const sections = splitSections(text);

  // Skills can appear anywhere — a "Tech Stack" line, inside bullets, in a
  // projects section. Scan the whole document, not just the skills heading.
  const skills = extractSkills(text);
  const experience = parseExperienceSection(sections.experience ?? "");
  const education = parseEducationSection(sections.education ?? "");

  // Prefer dates found inside the experience section; fall back to the whole
  // document only if that section was never identified, since education dates
  // would otherwise inflate the number.
  const experienceYears = sections.experience
    ? computeExperienceYears(sections.experience)
    : computeExperienceYears(text);

  return {
    skills,
    experience,
    education,
    experienceYears,
    inferredRoles: inferRoles(text, experience),
  };
}
