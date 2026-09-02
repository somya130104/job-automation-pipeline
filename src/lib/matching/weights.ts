/**
 * Scoring weights live in config, never inline in the scorer — the eval
 * harness (scripts/eval.ts) tunes these against a labelled set and you want
 * the diff to be one file. Each profile must sum to 1.
 *
 * Phase 2 adds `semantic`: cosine similarity between the resume embedding and
 * the JD embedding (all-MiniLM-L6-v2). It catches relevance that keyword
 * overlap misses — a JD that says "component library / design tokens" matching
 * a resume that says "design system" — and is a different question from the
 * missing-keywords set-difference, which stays keyword-based.
 */

export interface WeightProfile {
  semantic: number;
  keyword: number;
  title: number;
  experience: number;
  location: number;
}

export const WEIGHT_PROFILES: Record<"fulltime" | "internship", WeightProfile> = {
  fulltime: {
    semantic: 0.3,
    keyword: 0.3,
    title: 0.2,
    experience: 0.12,
    location: 0.08,
  },
  // Internships: years-of-experience is nearly meaningless and the general
  // profile over-penalises students for it. Weight shifts to semantic +
  // keyword (which projects, coursework and hackathons legitimately supply)
  // and to location, since interns are far more location-constrained.
  internship: {
    semantic: 0.34,
    keyword: 0.32,
    title: 0.2,
    experience: 0.02,
    location: 0.12,
  },
};

// Fail-fast if someone edits a profile and forgets to rebalance.
for (const [name, p] of Object.entries(WEIGHT_PROFILES)) {
  const sum = p.semantic + p.keyword + p.title + p.experience + p.location;
  if (Math.abs(sum - 1) > 0.001) {
    throw new Error(`Weight profile "${name}" sums to ${sum}, must be 1`);
  }
}

/** Below this a job is not worth surfacing in the feed at all. */
export const FEED_FLOOR = 15;

/** Score bands used for the UI label + colour. */
export function scoreBand(score: number): {
  label: string;
  tone: "good" | "warn" | "bad";
} {
  if (score >= 75) return { label: "Strong match", tone: "good" };
  if (score >= 55) return { label: "Worth a shot", tone: "warn" };
  return { label: "Stretch", tone: "bad" };
}
