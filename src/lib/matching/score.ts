import { analyseJd, SENIORITY_YEARS, type Seniority } from "./jd";
import { WEIGHT_PROFILES, type WeightProfile } from "./weights";

export interface ScoreInput {
  job: {
    title: string;
    descriptionText: string;
    locations: string[];
    remoteType: string;
    employmentType: string;
  };
  profile: {
    skills: string[];
    targetRoles: string[];
    targetLocations: string[];
    experienceYears: number;
    remoteOnly: boolean;
    roleType: "fulltime" | "internship";
  };
  /**
   * Cosine similarity (0..1) between the resume embedding and this JD's
   * embedding, precomputed by the caller (rescore.ts). Left undefined when
   * embeddings aren't available yet — the scorer then redistributes the
   * semantic weight across the other terms so nothing is scored as if the
   * resume were a poor semantic match when it simply hasn't been embedded.
   */
  semanticSimilarity?: number;
}

export interface ScoreResult {
  score: number;
  semanticScore: number;
  keywordScore: number;
  titleScore: number;
  experienceScore: number;
  locationScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const pct = (n: number) => Math.round(clamp01(n) * 100);

/** Words that carry no signal when comparing a job title to a target role. */
const TITLE_STOPWORDS = new Set([
  "senior", "junior", "sr", "jr", "lead", "staff", "principal", "associate",
  "i", "ii", "iii", "iv", "engineer", "developer", "the", "a", "an", "of",
  "and", "for", "to", "in", "at", "with", "remote", "intern", "internship",
]);

function titleTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !TITLE_STOPWORDS.has(t)),
  );
}

/**
 * Keyword half of the score: what fraction of the skills the JD actually asks
 * for does this resume evidence?
 *
 * Deliberately asymmetric — extra skills on the resume that the JD never
 * mentions are neither credit nor penalty. Coverage of the JD's asks is the
 * question a recruiter's screen is answering.
 */
/** Below this many recognised skills, a JD's keyword ratio is mostly noise. */
const CONFIDENT_SKILL_COUNT = 6;

function scoreKeywords(jdSkills: string[], resumeSkills: string[]) {
  const have = new Set(resumeSkills.map((s) => s.toLowerCase()));
  const matched: string[] = [];
  const missing: string[] = [];

  for (const skill of jdSkills) {
    if (have.has(skill.toLowerCase())) matched.push(skill);
    else missing.push(skill);
  }

  // A JD that names no recognisable skill tells us nothing; scoring it 0 would
  // bury perfectly good postings that are simply written vaguely. Score it
  // neutral instead and let the other signals decide.
  if (jdSkills.length === 0) {
    return { ratio: 0.5, matched, missing };
  }

  const raw = matched.length / jdSkills.length;

  // Damp toward neutral when the denominator is tiny. A non-technical JD that
  // happens to say "testing" once would otherwise score a perfect 1.0 on a
  // single incidental hit and outrank genuinely well-matched engineering
  // roles — observed with "Senior Stock Administrator" scoring 100% keywords.
  const confidence = Math.min(1, jdSkills.length / CONFIDENT_SKILL_COUNT);
  const ratio = raw * confidence + 0.5 * (1 - confidence);

  return { ratio, matched, missing };
}

/**
 * The title gate only applies when the user actually told us what they want.
 * With no target roles, scoreTitle returns a neutral 0.5 for everything and
 * gating on it would be meaningless.
 */
function targetRolesProvided(roles: string[]): boolean {
  return roles.some((r) => r.trim().length > 0);
}

/** Best Jaccard-ish overlap between the job title and any target role. */
function scoreTitle(jobTitle: string, targetRoles: string[]): number {
  if (targetRoles.length === 0) return 0.5;
  const jobTokens = titleTokens(jobTitle);
  if (jobTokens.size === 0) return 0.5;

  let best = 0;
  for (const role of targetRoles) {
    const roleTokens = titleTokens(role);
    if (roleTokens.size === 0) continue;
    let hits = 0;
    for (const token of roleTokens) if (jobTokens.has(token)) hits++;
    // Denominator is the target role's tokens: "Frontend Engineer" fully
    // matching inside "Senior Frontend Engineer, Payments" should score 1,
    // not be diluted by the job title's extra words.
    best = Math.max(best, hits / roleTokens.size);
  }
  return best;
}

/**
 * Experience fit. Over-qualification is a mild penalty (you can apply, but
 * it's often a waste of a slot); under-qualification falls off faster the
 * further below the bar you are.
 */
function scoreExperience(
  userYears: number,
  minYears: number | null,
  seniority: Seniority,
): number {
  const required = minYears ?? SENIORITY_YEARS[seniority];
  if (required === null) return 0.6; // unknown bar — mildly optimistic

  const gap = userYears - required;
  if (gap >= 0) {
    // 0 to +3 years over is ideal; beyond that taper toward 0.6.
    return gap <= 3 ? 1 : clamp01(1 - (gap - 3) * 0.08);
  }
  // Under the bar: 1 year short is still very applyable, 4+ years short is not.
  return clamp01(1 + gap * 0.28);
}

function scoreLocation(
  jobLocations: string[],
  remoteType: string,
  targetLocations: string[],
  remoteOnly: boolean,
): number {
  const isRemote = remoteType === "remote";
  if (remoteOnly) return isRemote ? 1 : 0.1;
  if (isRemote) return 1;
  if (targetLocations.length === 0) return 0.6;

  const haystack = jobLocations.join(" ").toLowerCase();
  if (!haystack) return 0.5;

  for (const target of targetLocations) {
    const needle = target.trim().toLowerCase();
    if (needle && haystack.includes(needle)) return 1;
  }
  return remoteType === "hybrid" ? 0.4 : 0.2;
}

export function scoreJob(input: ScoreInput): ScoreResult {
  const { job, profile } = input;

  const jd = analyseJd(job.title, job.descriptionText);
  const weights: WeightProfile = WEIGHT_PROFILES[profile.roleType];

  const keyword = scoreKeywords(jd.skills, profile.skills);
  const title = scoreTitle(job.title, profile.targetRoles);
  const experience = scoreExperience(
    profile.experienceYears,
    jd.minYears,
    jd.seniority,
  );
  const location = scoreLocation(
    job.locations,
    job.remoteType,
    profile.targetLocations,
    profile.remoteOnly,
  );

  // gemini-embedding-001 cosine for English text sits in a compressed, shifted
  // band: unrelated role pairs ~0.45-0.55, strong matches ~0.72-0.82. Stretch
  // that window to 0..1 so the term can actually pull its weight in the blend.
  const hasSemantic = typeof input.semanticSimilarity === "number";
  const semantic = hasSemantic
    ? clamp01((input.semanticSimilarity! - 0.48) / 0.3)
    : 0;

  // When we don't have an embedding yet, spread the semantic weight across the
  // remaining terms pro-rata rather than scoring the job as 0 on a third of
  // its total.
  const w = { ...weights };
  if (!hasSemantic) {
    const rest = w.keyword + w.title + w.experience + w.location;
    const bump = w.semantic / rest;
    w.keyword += w.keyword * bump;
    w.title += w.title * bump;
    w.experience += w.experience * bump;
    w.location += w.location * bump;
    w.semantic = 0;
  }

  let blended =
    semantic * w.semantic +
    keyword.ratio * w.keyword +
    title * w.title +
    experience * w.experience +
    location * w.location;

  // Role-type mismatch is a hard filter in practice, not a soft signal — a
  // student hunting internships does not want senior roles at 70%, and vice
  // versa. Applied after blending so the breakdown still shows real subscores.
  const wantsIntern = profile.roleType === "internship";
  if (wantsIntern !== jd.isInternship) blended *= 0.45;

  // Title is the strongest relevance signal there is, and at a 0.25 weight a
  // completely unrelated role could still clear 70% on incidental keyword and
  // location credit (a "Stock Administrator" outranking frontend roles for a
  // frontend engineer). Treat a near-zero title match as a relevance gate
  // rather than just another weighted term.
  if (targetRolesProvided(profile.targetRoles) && title < 0.2) blended *= 0.35;

  return {
    score: pct(blended),
    semanticScore: pct(semantic),
    keywordScore: pct(keyword.ratio),
    titleScore: pct(title),
    experienceScore: pct(experience),
    locationScore: pct(location),
    // Cap the stored lists — a 40-skill JD makes for unreadable UI and a
    // pointlessly fat row.
    matchedKeywords: keyword.matched.slice(0, 20),
    missingKeywords: keyword.missing.slice(0, 20),
  };
}
