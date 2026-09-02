import type { NormalizedJob } from "@/lib/sources/types";

/**
 * Scam-risk heuristic for job listings — aimed at remote/internship postings,
 * which have a genuinely high fraud rate in the Indian market.
 *
 * This is a *heuristic*, not a verdict: it produces a 0-100 risk score and a
 * list of specific reasons, surfaced as a warning banner on the job detail
 * page. It never hides or deletes a listing — the user decides.
 *
 * Signals (all cheap, all from text the posting already contains):
 *   - asks for money: "registration fee", "training fee", "security deposit",
 *     "pay to apply", "refundable deposit"
 *   - free-email contact domain (gmail/yahoo/outlook/rediff) instead of a
 *     company domain — normal for a tiny startup, a real signal in aggregate
 *   - outlier stipend/salary promises ("earn ₹80,000/month as an intern",
 *     "₹5000 per day from home")
 *   - no verifiable web presence: apply URL is a form host (Google Forms,
 *     Airtable form, bit.ly) rather than a company site or known ATS
 *   - urgency + vagueness combo ("limited seats", "immediate joining",
 *     "no interview required", "guaranteed placement")
 *   - contact only via WhatsApp / Telegram
 */

export interface ScamAssessment {
  risk: number; // 0-100
  reasons: string[];
}

const MONEY_RE =
  /\b(registration|training|enroll(?:ment)?|onboarding|security|caution|processing)\s+(?:fee|charge|amount|deposit)\b|\bpay\s+(?:to\s+apply|a\s+refundable|₹?\s?\d)|\brefundable\s+deposit\b|\bkit\s+fee\b/i;

const FREE_EMAIL_RE =
  /\b[\w.+-]+@(gmail|yahoo|ymail|outlook|hotmail|rediffmail|rediff|protonmail|aol|icloud)\.(com|co\.in|in)\b/i;

const FORM_HOST_RE =
  /(docs\.google\.com\/forms|forms\.gle|airtable\.com\/shr|bit\.ly|tinyurl\.com|forms\.office\.com|typeform\.com|jotform\.com)/i;

const MESSAGING_RE =
  /\b(whatsapp|whats app|telegram)\b.{0,30}\b(?:\+?\d[\d\s-]{7,}|@[\w]+)\b|\bcontact.{0,20}\b(whatsapp|telegram)\b/i;

const URGENCY_RE =
  /\b(limited seats|hurry|immediate joining|no interview|without interview|guaranteed (?:placement|job|stipend)|100%\s*placement|earn from home|work from home earn)\b/i;

const OUTLIER_STIPEND_RE =
  /\b(?:stipend|salary|earn|income)\b[^.\n]{0,40}?₹?\s?([1-9]\d{4,6})\s*(?:\/-|per\s*month|per\s*day|monthly|daily|p\.?m\.?)/i;

/** Rough monthly-INR ceiling above which an *internship* stipend is suspicious. */
const INTERN_STIPEND_CEILING = 60_000;

export function assessScam(
  job: Pick<
    NormalizedJob,
    "descriptionText" | "applyUrl" | "company" | "employmentType" | "title"
  >,
): ScamAssessment {
  const text = job.descriptionText ?? "";
  const reasons: string[] = [];
  let risk = 0;

  if (MONEY_RE.test(text)) {
    risk += 55;
    reasons.push(
      "Mentions a fee, deposit or payment to apply or train — legitimate employers never charge candidates.",
    );
  }

  const emailMatch = text.match(FREE_EMAIL_RE);
  if (emailMatch) {
    risk += 18;
    reasons.push(
      `Contact address uses a free email provider (${emailMatch[1]}) rather than a company domain.`,
    );
  }

  if (FORM_HOST_RE.test(job.applyUrl ?? "") || FORM_HOST_RE.test(text)) {
    risk += 20;
    reasons.push(
      "Applications go through a generic form or link-shortener, not a company site or a known applicant tracking system.",
    );
  }

  if (MESSAGING_RE.test(text)) {
    risk += 22;
    reasons.push("Directs applicants to apply or 'discuss' over WhatsApp/Telegram.");
  }

  if (URGENCY_RE.test(text)) {
    risk += 15;
    reasons.push(
      "Uses high-pressure or too-good-to-be-true language (guaranteed placement, no interview, limited seats).",
    );
  }

  const stipendMatch = text.match(OUTLIER_STIPEND_RE);
  if (stipendMatch) {
    const amount = Number(stipendMatch[1]);
    const perDay = /per\s*day|daily|\/day/i.test(stipendMatch[0]);
    const monthly = perDay ? amount * 22 : amount;
    if (
      (job.employmentType === "internship" && monthly > INTERN_STIPEND_CEILING) ||
      (perDay && amount > 3000)
    ) {
      risk += 20;
      reasons.push(
        `Promises an unusually high ${perDay ? "daily" : "monthly"} payout (₹${amount.toLocaleString("en-IN")}${perDay ? "/day" : "/month"}) for the role type.`,
      );
    }
  }

  // A company name that is generic or absent compounds everything else.
  if (
    reasons.length > 0 &&
    /^(hr|recruitment|hiring|company|consultancy|placement|jobs?)\b/i.test(
      job.company.trim(),
    )
  ) {
    risk += 10;
    reasons.push("Employer is listed under a generic name rather than a real company.");
  }

  return { risk: Math.min(100, risk), reasons };
}

export function scamBand(risk: number): "clear" | "caution" | "high" {
  if (risk >= 55) return "high";
  if (risk >= 25) return "caution";
  return "clear";
}
