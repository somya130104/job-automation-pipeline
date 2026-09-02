import { firecrawlScrape, isBlockedUrl } from "./firecrawl";
import type { SourceId } from "./types";

/**
 * ATS token discovery: given a company website or careers URL, work out which
 * applicant tracking system it runs and the board slug, so we can poll that
 * ATS's public API forever after instead of ever scraping the site again.
 *
 * Strategy, cheapest first:
 *   1. Plain fetch of the careers/home page HTML, regex for known ATS URLs.
 *      Free. Works for the majority — most careers pages either embed the
 *      board or link straight to it.
 *   2. Firecrawl /scrape in markdown mode (1 credit) as a fallback for
 *      JS-rendered pages where the ATS link only appears after hydration.
 *
 * Once resolved, TrackedCompany.atsType/atsToken is cached and this never runs
 * for that company again.
 */

export type AtsType = Extract<
  SourceId,
  "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "recruitee" | "workable"
>;

export interface AtsMatch {
  atsType: AtsType;
  atsToken: string;
}

const PATTERNS: Array<{ type: AtsType; re: RegExp }> = [
  { type: "greenhouse", re: /boards\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i },
  { type: "greenhouse", re: /job-boards\.greenhouse\.io\/([a-z0-9_-]+)/i },
  { type: "greenhouse", re: /greenhouse\.io\/([a-z0-9_-]+)\/jobs/i },
  { type: "lever", re: /jobs\.(?:eu\.)?lever\.co\/([a-z0-9_-]+)/i },
  { type: "ashby", re: /jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i },
  { type: "ashby", re: /ashbyhq\.com\/([a-z0-9_-]+)\/[a-f0-9-]{20,}/i },
  { type: "recruitee", re: /([a-z0-9_-]+)\.recruitee\.com/i },
  { type: "smartrecruiters", re: /careers\.smartrecruiters\.com\/([a-z0-9_-]+)/i },
  { type: "smartrecruiters", re: /jobs\.smartrecruiters\.com\/([a-z0-9_-]+)/i },
  { type: "workable", re: /([a-z0-9_-]+)\.workable\.com/i },
  { type: "workable", re: /apply\.workable\.com\/([a-z0-9_-]+)/i },
];

/** Tokens that are never a real board slug even if they match the regex. */
const JUNK_TOKENS = new Set([
  "embed", "www", "api", "jobs", "job", "careers", "boards", "job_board",
  "search", "for",
]);

export function matchAtsInText(text: string): AtsMatch | null {
  for (const { type, re } of PATTERNS) {
    const m = text.match(re);
    const token = m?.[1]?.toLowerCase().trim();
    if (token && !JUNK_TOKENS.has(token) && token.length >= 2) {
      return { atsType: type, atsToken: token };
    }
  }
  return null;
}

async function plainFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; job-automation-pipeline/0.1; personal job tracker)",
        accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 500_000);
  } catch {
    return null;
  }
}

function candidateUrls(input: string): string[] {
  let base: URL;
  try {
    base = new URL(input.startsWith("http") ? input : `https://${input}`);
  } catch {
    return [];
  }
  const origin = base.origin;
  return [
    base.toString(),
    `${origin}/careers`,
    `${origin}/careers/`,
    `${origin}/jobs`,
    `${origin}/company/careers`,
    `${origin}/about/careers`,
  ].filter((v, i, a) => a.indexOf(v) === i);
}

export interface DiscoveryOutcome {
  status: "resolved" | "none" | "error";
  match?: AtsMatch;
  error?: string;
  usedFirecrawl: boolean;
}

export async function discoverAts(
  websiteOrCareers: string,
  { allowFirecrawl = true }: { allowFirecrawl?: boolean } = {},
): Promise<DiscoveryOutcome> {
  if (isBlockedUrl(websiteOrCareers)) {
    return { status: "error", error: "blocked host", usedFirecrawl: false };
  }

  // 1) cheap: plain HTML of a few likely pages
  for (const url of candidateUrls(websiteOrCareers)) {
    const html = await plainFetch(url);
    if (html) {
      const match = matchAtsInText(html);
      if (match) return { status: "resolved", match, usedFirecrawl: false };
    }
  }

  // 2) fallback: one Firecrawl markdown scrape of the careers page
  if (allowFirecrawl) {
    try {
      const target = candidateUrls(websiteOrCareers)[1] ?? websiteOrCareers;
      const scraped = await firecrawlScrape(target);
      if (scraped) {
        const match = matchAtsInText(scraped.markdown);
        if (match) return { status: "resolved", match, usedFirecrawl: true };
      }
      return { status: "none", usedFirecrawl: true };
    } catch (err) {
      return {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        usedFirecrawl: true,
      };
    }
  }

  return { status: "none", usedFirecrawl: false };
}
