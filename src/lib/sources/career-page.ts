import { db } from "@/lib/db";
import { geminiEnabled, geminiJson } from "@/lib/llm/gemini";
import { assessScam } from "@/lib/matching/scam";
import { writeList } from "@/lib/json-list";
import { firecrawlMap, firecrawlScrape, isBlockedUrl } from "./firecrawl";
import {
  dedupKey,
  fingerprint,
  inferEmploymentType,
  inferRemoteType,
  type NormalizedJob,
} from "./types";

/**
 * Career-page crawler for companies with NO detectable ATS
 * (TrackedCompany.discoveryStatus === 'none'). This is the differentiated
 * source — startups post intern/junior roles on their own site days before
 * (or instead of) syndicating anywhere.
 *
 * Credit discipline (Firecrawl free tier = 1,000/mo):
 *   - /map the careers URL once  -> 1 credit
 *   - /scrape each NEW job link in PLAIN MARKDOWN -> 1 credit each
 *   - structured extraction is done by Gemini on the markdown, never by
 *     paying Firecrawl for JSON mode
 *   - content-hash every page; an unchanged page is skipped on the next run
 *   - hard cap on links per company per run
 *
 * linkedin.com / naukri.com are refused up-front (isBlockedUrl) with a clear
 * reason — see the blocklist comment in firecrawl.ts.
 */

const MAX_LINKS_PER_RUN = 12;

const JOB_LINK_RE =
  /(\/jobs?\/|\/careers?\/|\/positions?\/|\/openings?\/|\/roles?\/|\/vacan|greenhouse|lever|ashby|workable|\/apply\/)/i;

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    isJobPosting: { type: "boolean" },
    title: { type: "string", nullable: true },
    location: { type: "string", nullable: true },
    workplaceType: { type: "string", enum: ["remote", "hybrid", "onsite", "unknown"] },
    employmentType: {
      type: "string",
      enum: ["fulltime", "internship", "contract", "parttime", "unknown"],
    },
    stipendOrSalary: { type: "string", nullable: true },
    description: { type: "string", nullable: true },
    deadline: { type: "string", nullable: true },
    applyUrl: { type: "string", nullable: true },
  },
  required: ["isJobPosting", "workplaceType", "employmentType"],
} as const;

interface Extracted {
  isJobPosting: boolean;
  title: string | null;
  location: string | null;
  workplaceType: "remote" | "hybrid" | "onsite" | "unknown";
  employmentType: "fulltime" | "internship" | "contract" | "parttime" | "unknown";
  stipendOrSalary: string | null;
  description: string | null;
  deadline: string | null;
  applyUrl: string | null;
}

export interface CareerCrawlResult {
  company: string;
  status: "ok" | "skipped" | "error";
  mapped: number;
  scraped: number;
  created: number;
  unchanged: number;
  creditsUsed: number;
  error?: string;
}

function plausibleJobLinks(links: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const link of links) {
    if (!JOB_LINK_RE.test(link)) continue;
    if (isBlockedUrl(link)) continue;
    // Skip the careers index itself and obvious non-detail pages.
    if (/\/careers?\/?$/i.test(link) || /\/jobs?\/?$/i.test(link)) continue;
    const norm = link.split("#")[0].replace(/\/$/, "");
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(link);
  }
  return out.slice(0, MAX_LINKS_PER_RUN);
}

export async function crawlCareerPage(
  trackedCompanyId: string,
): Promise<CareerCrawlResult> {
  const tc = await db.trackedCompany.findUnique({ where: { id: trackedCompanyId } });
  if (!tc) return { company: "?", status: "error", mapped: 0, scraped: 0, created: 0, unchanged: 0, creditsUsed: 0, error: "not found" };

  const result: CareerCrawlResult = {
    company: tc.name,
    status: "ok",
    mapped: 0,
    scraped: 0,
    created: 0,
    unchanged: 0,
    creditsUsed: 0,
  };

  const careers = tc.careersUrl || tc.website;
  if (!careers) {
    return { ...result, status: "skipped", error: "no careers URL" };
  }
  if (isBlockedUrl(careers)) {
    return { ...result, status: "skipped", error: "blocked domain (LinkedIn/Naukri are never crawled)" };
  }
  if (!geminiEnabled()) {
    return { ...result, status: "skipped", error: "GEMINI_API_KEY not set (needed to extract fields from markdown)" };
  }

  let links: string[];
  try {
    links = await firecrawlMap(careers, 120);
    result.mapped = links.length;
    result.creditsUsed += 1;
  } catch (err) {
    return { ...result, status: "error", error: err instanceof Error ? err.message : String(err) };
  }

  const candidates = plausibleJobLinks(links);

  for (const url of candidates) {
    let scraped;
    try {
      scraped = await firecrawlScrape(url);
      result.creditsUsed += 1;
    } catch {
      continue;
    }
    if (!scraped) continue;
    result.scraped += 1;

    // content-hash: skip if we've already ingested this exact page unchanged
    const already = await db.job.findFirst({
      where: { source: "career_page", applyUrl: url },
      select: { id: true, contentHash: true },
    });
    if (already?.contentHash === scraped.hash) {
      result.unchanged += 1;
      continue;
    }

    let fields: Extracted;
    try {
      fields = await geminiJson<Extracted>(
        `This is the markdown of one page from a company careers site. If it is a single job posting, extract its fields. If it's a listing page or not a job, set isJobPosting=false.\n\nMARKDOWN:\n${scraped.markdown.slice(0, 9000)}`,
        EXTRACT_SCHEMA as unknown as Record<string, unknown>,
      );
    } catch {
      continue;
    }
    if (!fields.isJobPosting || !fields.title) continue;

    const normalized: NormalizedJob = {
      externalId: url,
      source: "career_page",
      sourceToken: tc.id,
      title: fields.title,
      company: tc.name,
      locations: fields.location ? [fields.location] : [],
      remoteType:
        fields.workplaceType !== "unknown"
          ? fields.workplaceType
          : inferRemoteType(fields.location, fields.title, scraped.markdown.slice(0, 1000)),
      employmentType:
        fields.employmentType !== "unknown"
          ? (fields.employmentType as NormalizedJob["employmentType"])
          : inferEmploymentType(fields.title, scraped.markdown.slice(0, 1000)),
      department: null,
      descriptionText: (fields.description ?? scraped.markdown).slice(0, 40_000),
      applyUrl: fields.applyUrl?.startsWith("http") ? fields.applyUrl : url,
      stipend: fields.stipendOrSalary ?? null,
      applicationDeadline: fields.deadline ? new Date(fields.deadline) : null,
      postedAt: new Date(),
    };
    if (Number.isNaN(normalized.applicationDeadline?.getTime())) {
      normalized.applicationDeadline = null;
    }

    const scam = assessScam(normalized);
    const fp = fingerprint(normalized);

    await db.job.upsert({
      where: { fingerprint: fp },
      create: {
        fingerprint: fp,
        dedupKey: dedupKey(normalized),
        externalId: url,
        source: "career_page",
        sourceToken: tc.id,
        capturedVia: "api",
        title: normalized.title,
        company: tc.name,
        locations: writeList(normalized.locations),
        remoteType: normalized.remoteType,
        employmentType: normalized.employmentType,
        descriptionText: normalized.descriptionText,
        applyUrl: normalized.applyUrl,
        stipend: normalized.stipend,
        applicationDeadline: normalized.applicationDeadline,
        contentHash: scraped.hash,
        scamRisk: scam.risk,
        scamReasons: writeList(scam.reasons),
        postedAt: normalized.postedAt,
      },
      update: {
        title: normalized.title,
        descriptionText: normalized.descriptionText,
        stipend: normalized.stipend,
        applicationDeadline: normalized.applicationDeadline,
        contentHash: scraped.hash,
        scamRisk: scam.risk,
        scamReasons: writeList(scam.reasons),
      },
    });
    result.created += 1;
  }

  await db.trackedCompany.update({
    where: { id: tc.id },
    data: { lastCrawledAt: new Date() },
  });

  return result;
}
