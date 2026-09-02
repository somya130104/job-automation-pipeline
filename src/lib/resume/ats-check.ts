import type { ParsedResume } from "./parse";

/**
 * ATS-readability check.
 *
 * This deliberately scores *parseability*, not writing quality. The question
 * is "will an applicant tracking system read this correctly", and the strongest
 * evidence available is how well our own parser did — if a rule-based parser
 * can't find your dates or your skills, neither can a resume-parsing vendor.
 */

export type Severity = "critical" | "warning" | "info";

export interface AtsIssue {
  severity: Severity;
  label: string;
  detail: string;
}

export interface AtsReport {
  score: number; // 0-100
  issues: AtsIssue[];
}

interface CheckContext {
  text: string;
  parsed: ParsedResume;
  likelyImageOnly: boolean;
  wordCount: number;
}

interface Rule {
  id: string;
  penalty: number;
  evaluate(ctx: CheckContext): AtsIssue | null;
}

const RULES: Rule[] = [
  {
    id: "image-only",
    penalty: 45,
    evaluate: ({ likelyImageOnly }) =>
      likelyImageOnly
        ? {
            severity: "critical",
            label: "No selectable text found",
            detail:
              "This file looks like a scan or an image export. Most ATS parsers read zero content from it. Export directly to PDF from your editor instead of scanning or screenshotting.",
          }
        : null,
  },
  {
    id: "no-contact",
    penalty: 15,
    evaluate: ({ text }) => {
      const hasEmail = /[\w.+-]+@[\w-]+\.[\w.]+/.test(text);
      const hasPhone = /(\+?\d[\d\s\-()]{7,}\d)/.test(text);
      if (hasEmail && hasPhone) return null;
      const missing = [!hasEmail && "email", !hasPhone && "phone number"]
        .filter(Boolean)
        .join(" and ");
      return {
        severity: hasEmail ? "warning" : "critical",
        label: `Missing ${missing}`,
        detail:
          "Contact details are the fields an ATS indexes first. Put them as plain text in the body — not inside a header, footer, or image, which many parsers skip entirely.",
      };
    },
  },
  {
    id: "no-sections",
    penalty: 20,
    evaluate: ({ parsed }) =>
      parsed.experience.length === 0
        ? {
            severity: "critical",
            label: "Experience section not detected",
            detail:
              "No dated roles were found under a recognised heading. Use a plain 'Experience' or 'Work Experience' heading, and put a date range on the same line as each role.",
          }
        : null,
  },
  {
    id: "no-education",
    penalty: 6,
    evaluate: ({ parsed }) =>
      parsed.education.length === 0
        ? {
            severity: "warning",
            label: "Education section not detected",
            detail:
              "Add an 'Education' heading with your degree and graduation year. Indian ATS screens filter on graduation year more often than you'd expect.",
          }
        : null,
  },
  {
    id: "thin-skills",
    penalty: 14,
    evaluate: ({ parsed }) =>
      parsed.skills.length < 6
        ? {
            severity: "warning",
            label: `Only ${parsed.skills.length} recognisable skills`,
            detail:
              "Keyword screens match on named tools and technologies. List them explicitly — 'built the payments service' scores nothing where 'Node.js, PostgreSQL, Stripe API' scores three hits.",
          }
        : null,
  },
  {
    id: "no-dates",
    penalty: 12,
    evaluate: ({ parsed }) =>
      parsed.experienceYears === 0 && parsed.experience.length > 0
        ? {
            severity: "warning",
            label: "Date ranges are unparseable",
            detail:
              "Roles were found but their dates weren't readable. Use an unambiguous format like 'Jan 2023 – Present' rather than '01.23-now' or date ranges rendered as graphics.",
          }
        : null,
  },
  {
    id: "tables",
    penalty: 10,
    evaluate: ({ text }) => {
      // Column layouts survive text extraction as runs of wide whitespace on
      // many consecutive lines — a decent proxy for a multi-column template.
      const lines = text.split("\n");
      const wideGaps = lines.filter((l) => /\S {4,}\S/.test(l)).length;
      return wideGaps > lines.length * 0.25 && lines.length > 20
        ? {
            severity: "warning",
            label: "Multi-column layout detected",
            detail:
              "Two-column resume templates get read left-to-right across both columns by many parsers, scrambling your content. A single-column layout is the safest format.",
          }
        : null;
    },
  },
  {
    id: "length",
    penalty: 8,
    evaluate: ({ wordCount }) => {
      if (wordCount < 180) {
        return {
          severity: "warning",
          label: `Very short (${wordCount} words)`,
          detail:
            "There isn't enough text here to match against a job description. Aim for 350–800 words with concrete, quantified bullets.",
        };
      }
      if (wordCount > 1400) {
        return {
          severity: "info",
          label: `Very long (${wordCount} words)`,
          detail:
            "Long resumes parse fine but dilute keyword density and rarely get read past page two. Trim to the most recent and most relevant roles.",
        };
      }
      return null;
    },
  },
  {
    id: "weak-bullets",
    penalty: 7,
    evaluate: ({ parsed }) => {
      const bullets = parsed.experience.flatMap((e) => e.bullets);
      if (bullets.length === 0) return null;
      // Quantified bullets are the single strongest signal a human reviewer
      // uses, and they survive parsing perfectly.
      const quantified = bullets.filter((b) => /\d/.test(b)).length;
      return quantified / bullets.length < 0.3
        ? {
            severity: "info",
            label: "Few quantified achievements",
            detail:
              `Only ${quantified} of ${bullets.length} bullets contain a number. Add scale or impact — 'cut p95 latency 40%', 'served 12k daily users' — rather than listing responsibilities.`,
          }
        : null;
    },
  },
];

export function checkAts(
  text: string,
  parsed: ParsedResume,
  likelyImageOnly = false,
): AtsReport {
  const ctx: CheckContext = {
    text,
    parsed,
    likelyImageOnly,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };

  const issues: AtsIssue[] = [];
  let score = 100;

  for (const rule of RULES) {
    const issue = rule.evaluate(ctx);
    if (issue) {
      issues.push(issue);
      score -= rule.penalty;
    }
  }

  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  return { score: Math.max(0, Math.min(100, score)), issues };
}
