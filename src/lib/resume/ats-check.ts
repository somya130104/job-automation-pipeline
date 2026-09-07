import type { ParsedResume } from "./parse";

/**
 * Résumé check — parseability AND writing quality, scored strictly.
 *
 * The old version only scored parseability and topped out at 100 for anything
 * a rule-based parser could read, so clean-but-mediocre résumés got perfect
 * marks. This version adds a content-quality layer modelled on what tools like
 * resumeworded.com actually flag (weak verbs, missing metrics, buzzwords,
 * pronouns, verb repetition) and applies hard ceilings so a real 90+ requires
 * a genuinely strong résumé.
 *
 * `checkAtsLlm` (ats-llm.ts) layers a Gemini pass on top when a key is set;
 * this rule engine is always run as the deterministic floor.
 */

export type Severity = "critical" | "warning" | "info";
export type Category = "parseability" | "content" | "format";

export interface AtsIssue {
  severity: Severity;
  category: Category;
  label: string;
  detail: string;
}

export interface AtsReport {
  score: number; // 0-100
  issues: AtsIssue[];
  /** Cheap derived signals the UI / LLM merge can reuse. */
  signals?: {
    bulletCount: number;
    quantifiedRatio: number;
    actionVerbRatio: number;
    wordCount: number;
  };
}

/* ------------------------------------------------------------------ */
/* Vocab                                                               */
/* ------------------------------------------------------------------ */

const STRONG_VERBS = new Set(
  `built shipped led drove owned launched designed architected engineered
   developed created implemented delivered scaled migrated automated optimised
   optimized reduced increased improved cut grew accelerated streamlined
   refactored rearchitected established founded initiated spearheaded directed
   coordinated mentored trained analysed analyzed researched investigated
   modelled modeled prototyped deployed integrated instrumented benchmarked
   debugged resolved fixed diagnosed negotiated secured won closed generated
   saved boosted doubled tripled halved eliminated consolidated standardised
   standardized modernised modernized orchestrated devised crafted synthesized
   architected pioneered tailored backtested constructed formulated authored
   overhauled reworked hardened productionised productionized`
    .split(/\s+/)
    .filter(Boolean),
);

const WEAK_OPENERS = [
  "responsible for",
  "worked on",
  "worked with",
  "helped",
  "assisted with",
  "assisted in",
  "involved in",
  "participated in",
  "tasked with",
  "duties included",
  "in charge of",
  "part of a team that",
  "contributed to",
];

const BUZZWORDS = [
  "team player",
  "hard working",
  "hardworking",
  "detail oriented",
  "detail-oriented",
  "go getter",
  "go-getter",
  "self motivated",
  "self-motivated",
  "results driven",
  "results-driven",
  "results-oriented",
  "think outside the box",
  "synergy",
  "synergies",
  "dynamic professional",
  "proven track record",
  "fast learner",
  "quick learner",
  "passionate about",
  "highly motivated",
  "excellent communication skills",
  "strong work ethic",
  "value add",
  "value-add",
  "best of breed",
  "hit the ground running",
];

const VAGUE_QUANTIFIERS = [
  "several",
  "multiple",
  "various",
  "many",
  "numerous",
  "a lot of",
  "lots of",
  "a number of",
  "significantly",
  "substantially",
  "greatly",
];

const PRONOUN_RE = /\b(i|i'm|i've|my|me|myself)\b/i;

/* ------------------------------------------------------------------ */

function firstWord(s: string): string {
  return (s.trim().split(/\s+/)[0] ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

function hasNumber(s: string): boolean {
  // A real metric: a digit, a percent, a currency amount, or a written scale.
  return /\d/.test(s) || /\b(zero|one|two|three|four|five|ten|hundred|thousand|million|billion)\b/i.test(s);
}

export function checkAts(
  text: string,
  parsed: ParsedResume,
  likelyImageOnly = false,
): AtsReport {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const bullets = parsed.experience.flatMap((e) => e.bullets);

  const issues: AtsIssue[] = [];
  const push = (i: AtsIssue) => issues.push(i);

  let score = 100;
  let hardCap = 100;
  let contentFlaw = false; // any weak opener / buzzword / pronoun
  const cap = (v: number) => {
    hardCap = Math.min(hardCap, v);
  };

  /* ---------- PARSEABILITY ---------- */

  if (likelyImageOnly) {
    push({
      severity: "critical",
      category: "parseability",
      label: "No selectable text found",
      detail:
        "This file reads as a scan or image export — most ATS parsers extract nothing from it. Export straight to PDF from your editor, never a screenshot or scan.",
    });
    cap(15);
  }

  const hasEmail = /[\w.+-]+@[\w-]+\.[\w.]+/.test(text);
  const hasPhone = /(\+?\d[\d\s\-()]{7,}\d)/.test(text);
  if (!hasEmail || !hasPhone) {
    const missing = [!hasEmail && "email", !hasPhone && "phone number"]
      .filter(Boolean)
      .join(" and ");
    push({
      severity: hasEmail ? "warning" : "critical",
      category: "parseability",
      label: `Missing ${missing}`,
      detail:
        "Contact details are the first fields an ATS indexes. Put them as plain text in the body — not in a header, footer, sidebar or image, which many parsers skip.",
    });
    score -= hasEmail ? 12 : 22;
    if (!hasEmail) cap(62);
  }

  if (parsed.experience.length === 0) {
    push({
      severity: "critical",
      category: "parseability",
      label: "Experience section not detected",
      detail:
        "No dated roles were found under a recognised heading. Use a plain 'Experience' / 'Work Experience' / 'Internships' heading, put each role's title and company on one line, and a date range (e.g. 'May 2025 – Jul 2025') on that same line or the next.",
    });
    score -= 24;
    cap(55);
  }

  if (parsed.education.length === 0) {
    push({
      severity: "warning",
      category: "parseability",
      label: "Education section not detected",
      detail:
        "Add a plain 'Education' heading with your degree, institution and graduation year on adjacent lines. Indian ATS screens filter on graduation year more than you'd expect.",
    });
    score -= 10;
  }

  if (parsed.experienceYears === 0 && parsed.experience.length > 0) {
    push({
      severity: "warning",
      category: "parseability",
      label: "Date ranges are unreadable",
      detail:
        "Roles were found but their dates didn't parse. Use an unambiguous format like 'Jan 2023 – Present' or 'May 2025 – Jul 2025'. Avoid 'Jan'23–Now' rendered as graphics or split across columns.",
    });
    score -= 12;
  }

  // Column-layout / bad-extraction proxy: many wide whitespace gaps, or lots of
  // glued words like "usingSpringBatchto".
  const lines = text.split("\n");
  const wideGaps = lines.filter((l) => /\S {4,}\S/.test(l)).length;
  const gluedWords = (text.match(/[a-z]{2}[A-Z][a-z]{2}/g) ?? []).length;
  if ((wideGaps > lines.length * 0.22 && lines.length > 18) || gluedWords > 25) {
    push({
      severity: "warning",
      category: "parseability",
      label: "Two-column / dense layout detected",
      detail:
        "Multi-column templates get read left-to-right across both columns by many parsers, scrambling your content — and words end up glued together on extraction. A single-column layout is the safest.",
    });
    score -= 12;
  }

  const hasLinks = /(linkedin\.com|github\.com|gitlab\.com|behance|dribbble|portfolio|\.dev\b|\.io\b)/i.test(
    text,
  );
  if (!hasLinks) {
    push({
      severity: "info",
      category: "parseability",
      label: "No portfolio / profile links",
      detail:
        "Add your LinkedIn and GitHub (or portfolio) URLs as plain text. Recruiters click through, and some ATS pipelines index them.",
    });
    score -= 4;
  }

  // Icon-font contact glyphs, LaTeX footnote markers (∗ † ‡) and letter-spaced
  // headings ("L A T E X") come through an ATS parser as stray symbols and
  // orphaned single characters. Cheap, reliable tells that the template wasn't
  // built for machine parsing.
  const strayLines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        l.length <= 2 &&
        !/^[•◦▪‣·*+\-–—]$/.test(l) &&
        !/^\d{1,2}[.)]?$/.test(l),
    ).length;
  const letterSpaced = /(?:\b[A-Za-z]\s+){3,}[A-Za-z]\b/.test(text);
  const daggerGlyphs = (text.match(/[†‡∗✱✲-]/g) ?? []).length;
  if (strayLines >= 3 || letterSpaced || daggerGlyphs >= 4) {
    push({
      severity: "warning",
      category: "parseability",
      label: "Icon glyphs / stray characters in the extracted text",
      detail:
        "Contact-row icon fonts, footnote daggers (∗ † ‡) and letter-spaced words extract as garbled symbols or lone letters. Use plain-text labels ('Email:', 'GitHub:') and don't letter-space headings.",
    });
    score -= 7;
  }

  /* ---------- CONTENT QUALITY ---------- */

  const totalBullets = bullets.length;
  const quantified = bullets.filter(hasNumber).length;
  const actionStarts = bullets.filter((b) => STRONG_VERBS.has(firstWord(b))).length;
  const quantifiedRatio = totalBullets ? quantified / totalBullets : 0;
  const actionVerbRatio = totalBullets ? actionStarts / totalBullets : 0;

  if (totalBullets >= 3) {
    if (quantifiedRatio < 0.4) {
      push({
        severity: "warning",
        category: "content",
        label: `Only ${quantified}/${totalBullets} bullets have a number`,
        detail:
          "Quantified impact is the single strongest bullet signal. Aim for 60%+ with a real metric — 'cut p95 latency 40%', 'processed 10M records/day', 'served 12k users' — not just responsibilities.",
      });
      score -= 14;
      contentFlaw = true;
    } else if (quantifiedRatio < 0.6) {
      push({
        severity: "info",
        category: "content",
        label: `${Math.round(quantifiedRatio * 100)}% of bullets are quantified`,
        detail: "Push toward 60%+. Add scale or outcome to the bullets that currently state only what you did.",
      });
      score -= 6;
    }

    if (actionVerbRatio < 0.7) {
      push({
        severity: "warning",
        category: "content",
        label: `${Math.round(actionVerbRatio * 100)}% of bullets start with a strong verb`,
        detail:
          "Start every bullet with a past-tense achievement verb (Built, Shipped, Reduced, Led, Automated…). Aim for 90%+.",
      });
      score -= 12;
    } else if (actionVerbRatio < 0.85) {
      push({
        severity: "info",
        category: "content",
        label: "A few bullets don't open with an action verb",
        detail: "Rework them to lead with a strong past-tense verb.",
      });
      score -= 5;
    }

    // Overly long bullets.
    const longBullets = bullets.filter((b) => b.split(/\s+/).length > 45).length;
    if (longBullets >= 2) {
      push({
        severity: "info",
        category: "content",
        label: `${longBullets} bullets run over 45 words`,
        detail: "Tighten to one line of impact each. Long bullets don't get read past the first clause.",
      });
      score -= 4;
    }
  }

  /* ---------- VERB VARIETY (whole document) ---------- */
  // parsed.experience only covers dated roles; a Projects section can carry as
  // many bullets again. Verb-thesaurus overuse — "Architected / Engineered /
  // Devised / Crafted" recycled across 20 bullets — is the clearest template
  // tell, so scan every bullet line in the document, not just the roles.
  const docBullets = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[•◦▪‣·*•◦▪]\s+\S/.test(l))
    .map((l) => l.replace(/^[•◦▪‣·*•◦▪]\s+/, ""));
  const verbPool = docBullets.length >= totalBullets ? docBullets : bullets;

  const openCounts = new Map<string, number>();
  let strongOpens = 0;
  for (const b of verbPool) {
    const v = firstWord(b);
    if (STRONG_VERBS.has(v)) {
      strongOpens++;
      openCounts.set(v, (openCounts.get(v) ?? 0) + 1);
    }
  }
  const worst = [...openCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] >= 3) {
    const shown = worst[0][0].toUpperCase() + worst[0].slice(1);
    push({
      severity: "warning",
      category: "content",
      label: `"${shown}" opens ${worst[1]} bullets`,
      detail:
        "One verb carrying 3+ bullets reads as fill-in-the-blank. Give each bullet its own verb — a recruiter clocks the repetition within two lines.",
    });
    score -= Math.min(12, (worst[1] - 2) * 4);
  }
  const diversity = strongOpens ? openCounts.size / strongOpens : 1;
  if (verbPool.length >= 8 && diversity < 0.6) {
    push({
      severity: "info",
      category: "content",
      label: `Only ${openCounts.size} distinct opening verbs across ${strongOpens} bullets`,
      detail:
        "Cycling a handful of verbs (Built / Devised / Engineered / Crafted…) flattens the résumé. Aim for a fresh, specific verb per bullet.",
    });
    score -= 6;
  }

  const blob = text.toLowerCase();

  const weakHits = WEAK_OPENERS.filter((w) => blob.includes(w));
  if (weakHits.length) {
    push({
      severity: "warning",
      category: "content",
      label: `Weak phrasing: "${weakHits[0]}"`,
      detail:
        `Replace "${weakHits[0]}" and similar ("worked on", "helped with", "involved in") with a verb that claims the outcome — what did you actually build or change?`,
    });
    score -= 6 + Math.min(8, weakHits.length * 3);
    contentFlaw = true;
  }

  const buzzHits = BUZZWORDS.filter((b) => blob.includes(b));
  if (buzzHits.length) {
    push({
      severity: "warning",
      category: "content",
      label: `Buzzwords: "${buzzHits[0]}"${buzzHits.length > 1 ? ` +${buzzHits.length - 1}` : ""}`,
      detail:
        "Cut résumé clichés (team player, hardworking, results-driven, passionate about, proven track record). They take space and signal nothing — evidence the trait in a bullet instead.",
    });
    score -= 4 + Math.min(10, buzzHits.length * 3);
    contentFlaw = true;
  }

  const pronounBullets = bullets.filter((b) => PRONOUN_RE.test(b)).length;
  if (pronounBullets > 0 || /\b(i am|i have|my responsibilities)\b/i.test(text.slice(0, 600))) {
    push({
      severity: "warning",
      category: "content",
      label: "First-person pronouns used",
      detail:
        "Résumé bullets are written without 'I' / 'my' — they're implied. 'I built the pipeline' → 'Built the pipeline'.",
    });
    score -= 6;
    contentFlaw = true;
  }

  const vagueHits = VAGUE_QUANTIFIERS.filter((v) => new RegExp(`\\b${v}\\b`).test(blob));
  if (vagueHits.length >= 2) {
    push({
      severity: "info",
      category: "content",
      label: `Vague quantifiers ("${vagueHits[0]}", …)`,
      detail:
        "Swap 'several', 'multiple', 'significantly' for the actual number. If you don't know it, estimate a defensible one.",
    });
    score -= 4;
  }

  if (/\b(was|were)\s+\w+(ed|en)\b/i.test(blob) && /\b(was|were)\s+(responsible|involved|tasked)\b/i.test(blob)) {
    push({
      severity: "info",
      category: "content",
      label: "Passive voice in places",
      detail: "'was responsible for X' → 'Did X'. Active, past-tense, verb-first.",
    });
    score -= 3;
  }

  /* ---------- FORMAT / STRUCTURE ---------- */

  const yrs = parsed.experienceYears;
  const idealLow = yrs < 2 ? 350 : 450;
  const idealHigh = yrs < 2 ? 720 : yrs < 6 ? 950 : 1200;
  if (wordCount < idealLow) {
    push({
      severity: "warning",
      category: "format",
      label: `Short résumé (${wordCount} words)`,
      detail:
        "Too little text to match against a job description. Aim for a full page of concrete, quantified bullets.",
    });
    score -= 8;
  } else if (wordCount > idealHigh + 400) {
    push({
      severity: "info",
      category: "format",
      label: `Long résumé (${wordCount} words)`,
      detail:
        "Long résumés dilute keyword density and rarely get read past page one. Trim to the most recent, most relevant roles.",
    });
    score -= 5;
  }

  if (parsed.skills.length < 6) {
    push({
      severity: "warning",
      category: "format",
      label: `Only ${parsed.skills.length} recognisable skills`,
      detail:
        "Keyword screens match on named tools. List them explicitly in a Skills section — 'built the payments service' scores nothing where 'Node.js, PostgreSQL, Stripe API' scores three hits.",
    });
    score -= 10;
  }

  /* ---------- SCORE ASSEMBLY ---------- */

  score = Math.max(0, Math.min(100, score));
  score = Math.min(score, hardCap);

  const parseWarnings = issues.some(
    (i) => i.category === "parseability" && i.severity !== "info",
  );

  // Polish ceiling: only a genuinely clean résumé — well quantified, varied
  // verbs, cliché-free, and parsing without warnings — is allowed near the top.
  const polished =
    totalBullets >= 4 &&
    quantifiedRatio >= 0.6 &&
    actionVerbRatio >= 0.85 &&
    diversity >= 0.6 &&
    !contentFlaw &&
    !parseWarnings &&
    parsed.skills.length >= 8;
  if (!polished) score = Math.min(score, 82);
  // Any weak-opener / buzzword / pronoun flaw caps it well short of "strong".
  if (contentFlaw) score = Math.min(score, 74);
  // The rule engine is a heuristic floor, not a final verdict — it can't judge
  // relevance, specificity, seniority fit or tone. Anything above "strong with
  // minor nits" needs the LLM pass (mergeAts). Rules alone never exceed 88.
  score = Math.min(score, 88);

  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    score: Math.round(score),
    issues,
    signals: {
      bulletCount: totalBullets,
      quantifiedRatio: Math.round(quantifiedRatio * 100) / 100,
      actionVerbRatio: Math.round(actionVerbRatio * 100) / 100,
      wordCount,
    },
  };
}
