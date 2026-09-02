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

const SECTION_ALIASES: Record<string, string[]> = {
  experience: [
    "experience", "work experience", "professional experience",
    "employment", "employment history", "work history", "career history",
    "internships", "internship experience", "relevant experience",
  ],
  education: ["education", "academics", "academic background", "qualifications"],
  skills: [
    "skills", "technical skills", "core skills", "technologies",
    "tech stack", "skills & tools", "competencies", "toolbox",
  ],
  projects: ["projects", "personal projects", "side projects", "selected projects"],
};

/**
 * A heading is a short line that matches a known section name. Requiring
 * shortness matters: "I have experience with distributed systems" would
 * otherwise be read as the start of the Experience section.
 */
function classifyHeading(line: string): string | null {
  const cleaned = line
    .trim()
    .replace(/[:•\-–—_*]+$/g, "")
    .replace(/^[•\-–—*]+/g, "")
    .trim()
    .toLowerCase();

  if (!cleaned || cleaned.length > 40) return null;

  for (const [section, aliases] of Object.entries(SECTION_ALIASES)) {
    if (aliases.includes(cleaned)) return section;
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

// "Jan 2020 - Present", "2020 – 2022", "03/2019 to 06/2021"
const DATE_RANGE_RE = new RegExp(
  `((?:${MONTHS})?\\.?\\s*\\d{4}|\\d{1,2}\\/\\d{4})\\s*(?:-|–|—|to|until)\\s*((?:${MONTHS})?\\.?\\s*\\d{4}|\\d{1,2}\\/\\d{4}|present|current|now|ongoing)`,
  "i",
);

function toDate(token: string): Date | null {
  const t = token.trim().toLowerCase();
  if (/^(present|current|now|ongoing)$/.test(t)) return new Date();

  const slash = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (slash) return new Date(Number(slash[2]), Number(slash[1]) - 1, 1);

  const monthYear = new RegExp(`^(${MONTHS})\\.?\\s*(\\d{4})$`, "i").exec(t);
  if (monthYear) {
    const idx = [
      "jan", "feb", "mar", "apr", "may", "jun",
      "jul", "aug", "sep", "oct", "nov", "dec",
    ].indexOf(monthYear[1].slice(0, 3).toLowerCase());
    return new Date(Number(monthYear[2]), idx < 0 ? 0 : idx, 1);
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

const BULLET_RE = /^\s*[•●▪◦*\-–—]\s+/;

function isBullet(line: string): boolean {
  return BULLET_RE.test(line);
}

function parseExperienceSection(section: string): ParsedExperience[] {
  if (!section) return [];

  const lines = section.split("\n").filter((l) => l.trim());
  const entries: ParsedExperience[] = [];
  let current: ParsedExperience | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (isBullet(trimmed)) {
      current?.bullets.push(trimmed.replace(BULLET_RE, "").trim());
      continue;
    }

    const dateMatch = trimmed.match(DATE_RANGE_RE);

    // A non-bullet line carrying a date range starts a new role. Resumes vary
    // wildly in whether title or company comes first, and in whether they're
    // on one line or two — so split on the common separators and take the
    // first two fields rather than guessing a fixed order.
    if (dateMatch) {
      if (current) entries.push(current);
      const withoutDate = trimmed.replace(DATE_RANGE_RE, "").trim();
      const parts = withoutDate
        .split(/\s+[|·•@,]\s+|\s{2,}|\s+–\s+|\s+-\s+/)
        .map((p) => p.trim())
        .filter(Boolean);

      current = {
        title: parts[0] ?? withoutDate ?? "Role",
        company: parts[1] ?? "",
        start: dateMatch[1].trim(),
        end: dateMatch[2].trim(),
        bullets: [],
      };
      continue;
    }

    // A short line right after a dated header is usually the company name
    // that wrapped onto its own line.
    if (current && !current.company && trimmed.length < 60) {
      current.company = trimmed;
    }
  }

  if (current) entries.push(current);
  return entries.slice(0, 12);
}

/* ------------------------------------------------------------------ */
/* Education                                                           */
/* ------------------------------------------------------------------ */

const DEGREE_RE =
  /\b(b\.?tech|b\.?e\.?|b\.?sc|bachelor(?:'?s)?|m\.?tech|m\.?sc|master(?:'?s)?|mba|ph\.?d|doctorate|diploma|b\.?com|bca|mca)\b/i;

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
