import { createHash } from "node:crypto";

export type SourceId =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "smartrecruiters"
  | "recruitee"
  | "workable"
  | "remoteok"
  | "remotive"
  | "arbeitnow"
  | "adzuna"
  | "hn"
  | "yc"
  | "career_page"
  | "capture"
  | "manual";

export type RemoteType = "remote" | "hybrid" | "onsite" | "unknown";
export type EmploymentType = "fulltime" | "internship" | "contract" | "parttime";

/**
 * The single shape every source normalises into. Adding a source means writing
 * one adapter that produces this — nothing downstream changes.
 */
export interface NormalizedJob {
  externalId: string;
  source: SourceId;
  sourceToken: string;
  title: string;
  company: string;
  companyLogo?: string | null;
  locations: string[];
  remoteType: RemoteType;
  employmentType: EmploymentType;
  department?: string | null;
  descriptionText: string;
  descriptionHtml?: string | null;
  applyUrl: string;
  compensationMin?: number | null;
  compensationMax?: number | null;
  compensationCurrency?: string | null;
  // Internship-shaped fields — mostly null except from career-page extraction
  // and the few ATSes that expose them (Recruitee close_at).
  stipend?: string | null;
  durationMonths?: number | null;
  startDate?: Date | null;
  applicationDeadline?: Date | null;
  postedAt: Date;
}

export interface JobSource {
  id: SourceId;
  label: string;
  /** `token` is the company's board slug; feed-style sources ignore it. */
  fetchJobs(token: string): Promise<NormalizedJob[]>;
}

/* ------------------------------------------------------------------ */
/* Shared normalisation helpers                                        */
/* ------------------------------------------------------------------ */

/**
 * Stable per-listing id. Same posting re-ingested tomorrow hashes identically,
 * so ingestion is idempotent without needing to diff anything.
 */
export function fingerprint(job: NormalizedJob): string {
  return createHash("sha256")
    .update(`${job.source}:${job.sourceToken}:${job.externalId}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Cross-source dedup key. The same role reached via Greenhouse and via a
 * RemoteOK feed has different external ids but the same title+company, so
 * this is what collapses them into one card.
 */
export function dedupKey(job: NormalizedJob): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\(.*?\)/g, " ") // drop "(Remote)", "(f/m/d)" style suffixes
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  return createHash("sha256")
    .update(`${norm(job.title)}|${norm(job.company)}`)
    .digest("hex")
    .slice(0, 32);
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  "#39": "'", "#x27": "'", "#x2F": "/", "#160": " ",
};

/** ATS descriptions arrive as HTML with inconsistent entity encoding. */
export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&([a-z#0-9x]+);/gi, (whole, entity: string) => {
      const key = entity.toLowerCase();
      if (HTML_ENTITIES[key] !== undefined) return HTML_ENTITIES[key];
      // Numeric entities the table does not cover.
      const num = /^#x([0-9a-f]+)$/i.exec(entity)
        ? parseInt(entity.slice(2), 16)
        : /^#(\d+)$/.test(entity)
          ? parseInt(entity.slice(1), 10)
          : NaN;
      return Number.isFinite(num) ? String.fromCodePoint(num) : whole;
    })
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const REMOTE_RE = /\b(remote|work from home|wfh|distributed|anywhere)\b/i;
const HYBRID_RE = /\bhybrid\b/i;

export function inferRemoteType(...signals: (string | null | undefined)[]): RemoteType {
  const blob = signals.filter(Boolean).join(" ");
  if (!blob) return "unknown";
  if (HYBRID_RE.test(blob)) return "hybrid";
  if (REMOTE_RE.test(blob)) return "remote";
  return "onsite";
}

const INTERN_RE = /\b(intern|internship|trainee|apprentice|co-?op)\b/i;
const CONTRACT_RE = /\b(contract|contractor|freelance|temporary|temp)\b/i;
const PARTTIME_RE = /\b(part[- ]?time)\b/i;

export function inferEmploymentType(
  ...signals: (string | null | undefined)[]
): EmploymentType {
  const blob = signals.filter(Boolean).join(" ");
  if (INTERN_RE.test(blob)) return "internship";
  if (PARTTIME_RE.test(blob)) return "parttime";
  if (CONTRACT_RE.test(blob)) return "contract";
  return "fulltime";
}

/**
 * Dates arrive as ISO strings, epoch seconds, epoch millis and "2024-01-05"
 * depending on the ATS. Anything unparseable falls back to now so the row is
 * still usable rather than being dropped.
 */
export function parseDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === "number") {
    // Heuristic: epoch seconds are ~1e9, millis ~1e12.
    const ms = value < 1e11 ? value * 1000 : value;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && value.trim().length >= 10) {
      return parseDate(numeric);
    }
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return new Date();
}

/** Title-case-ish cleanup for company slugs used as display names. */
export function slugToName(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

const UA = "job-automation-pipeline/0.1 (personal job tracker)";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * fetch with a timeout, a UA, JSON parsing, and bounded retry.
 *
 * Retries only transient failures — network errors and 5xx / 429 — with
 * exponential backoff. A 4xx (dead board, wrong slug) is not retried; it is
 * surfaced immediately so the ingest run records it and moves on.
 */
export async function fetchJson<T>(
  url: string,
  timeoutMs = 15_000,
  retries = 2,
): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": UA },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        const err = new HttpError(res.status, `${res.status} ${res.statusText} for ${url}`);
        // 4xx is permanent; stop now.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) throw err;
        lastErr = err;
        continue;
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof HttpError && err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw err;
      }
      lastErr =
        err instanceof Error && err.name === "AbortError"
          ? new Error(`Timed out after ${timeoutMs}ms: ${url}`)
          : err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
