import { db } from "@/lib/db";

/**
 * Firecrawl client — deliberately minimal and credit-paranoid.
 *
 * The free tier is 1,000 credits/month and it goes fast:
 *   base scrape/map/crawl = 1 credit/page
 *   +JSON structured output ≈ +4
 *   +stealth/enhanced      ≈ +4
 *   "smart extract"        ≈ 9×
 *
 * So this module ONLY ever does plain-markdown scrape (1 credit) and /map
 * (1 credit). Structured extraction is done afterwards by Gemini on the
 * returned markdown — never by paying Firecrawl for it. Every call is logged
 * to FirecrawlUsage so the spend is visible on the health page.
 *
 * Hard domain blocklist: LinkedIn and Naukri have aggressive bot protection,
 * Firecrawl burns stealth credits losing to it, and scraping them violates
 * their ToS and risks the user's account. Never point this at them.
 */

export const BLOCKED_HOSTS = [
  "linkedin.com",
  "naukri.com",
  "indeed.com",
  "glassdoor.com",
  "instagram.com",
  "facebook.com",
];

export function isBlockedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`));
  } catch {
    return true; // unparseable -> refuse
  }
}

export function firecrawlEnabled(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY?.trim());
}

async function log(
  op: "map" | "scrape",
  url: string,
  credits: number,
  ok: boolean,
  note?: string,
) {
  await db.firecrawlUsage.create({ data: { op, url, credits, ok, note } });
}

const API = "https://api.firecrawl.dev/v1";

function headers() {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${process.env.FIRECRAWL_API_KEY?.trim()}`,
  };
}

export class FirecrawlError extends Error {}

/** /map — list URLs on a site. 1 credit. Returns [] on failure (logged). */
export async function firecrawlMap(url: string, limit = 150): Promise<string[]> {
  if (!firecrawlEnabled()) return [];
  if (isBlockedUrl(url)) throw new FirecrawlError(`Blocked host: ${url}`);

  try {
    const res = await fetch(`${API}/map`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ url, limit, includeSubdomains: false }),
    });
    const data = (await res.json()) as { success?: boolean; links?: string[]; error?: string };
    await log("map", url, 1, Boolean(data.success), data.error);
    if (!data.success) throw new FirecrawlError(data.error ?? `map failed (${res.status})`);
    return data.links ?? [];
  } catch (err) {
    await log("map", url, 1, false, err instanceof Error ? err.message : String(err));
    if (err instanceof FirecrawlError) throw err;
    throw new FirecrawlError(err instanceof Error ? err.message : String(err));
  }
}

export interface ScrapeResult {
  markdown: string;
  /** sha256 of the markdown, for content-hash dedup / skip-if-unchanged. */
  hash: string;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/** /scrape in PLAIN MARKDOWN MODE ONLY. 1 credit. Never JSON/stealth here. */
export async function firecrawlScrape(url: string): Promise<ScrapeResult | null> {
  if (!firecrawlEnabled()) return null;
  if (isBlockedUrl(url)) throw new FirecrawlError(`Blocked host: ${url}`);

  try {
    const res = await fetch(`${API}/scrape`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        url,
        formats: ["markdown"], // NOT ["json"] — that costs ~5×
        onlyMainContent: true,
      }),
    });
    const data = (await res.json()) as {
      success?: boolean;
      data?: { markdown?: string };
      error?: string;
    };
    await log("scrape", url, 1, Boolean(data.success), data.error);
    if (!data.success) throw new FirecrawlError(data.error ?? `scrape failed (${res.status})`);
    const markdown = data.data?.markdown ?? "";
    return { markdown, hash: await sha256(markdown) };
  } catch (err) {
    await log("scrape", url, 1, false, err instanceof Error ? err.message : String(err));
    if (err instanceof FirecrawlError) throw err;
    throw new FirecrawlError(err instanceof Error ? err.message : String(err));
  }
}

export async function firecrawlCreditsUsed(sinceDays = 30): Promise<number> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const rows = await db.firecrawlUsage.findMany({
    where: { createdAt: { gte: since } },
    select: { credits: true },
  });
  return rows.reduce((n, r) => n + r.credits, 0);
}
