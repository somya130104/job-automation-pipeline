import { db } from "@/lib/db";
import { discoverAts } from "./discovery";

/**
 * Y Combinator company directory as an ingestion entry point.
 *
 * The pattern (Addendum 2 §13): YC companies API → company list + websites →
 * ATS-token discovery on each → then poll their Greenhouse/Lever/Ashby boards
 * like any other TrackedCompany. Most YC companies are on Ashby or Greenhouse,
 * so we end up with full JDs, real comp and direct apply links — better data
 * than workatastartup.com exposes, entirely from intended-use endpoints.
 *
 * We do NOT scrape workatastartup.com job pages: they sit behind Cloudflare
 * and datacenter IPs get blocked.
 *
 * Recent batches are the useful filter for interns/remote — those companies
 * hire students far more readily.
 */

const YC_API = "https://api.ycombinator.com/v0.1/companies";

interface YcCompany {
  id: number;
  name: string;
  slug: string;
  website?: string;
  batch?: string;
  status?: string; // Active | Acquired | Public | Inactive
  regions?: string[];
}

interface YcPage {
  companies: YcCompany[];
  nextPage?: string | null;
  totalPages?: number;
}

/** Fetch YC companies, newest batches first, capped. */
export async function fetchYcCompanies(maxPages = 4): Promise<YcCompany[]> {
  const all: YcCompany[] = [];
  let url: string | null = `${YC_API}?count=250`;
  let pages = 0;

  while (url && pages < maxPages) {
    const res: Response = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`YC API ${res.status}`);
    const data = (await res.json()) as YcPage;
    all.push(...(data.companies ?? []));
    url = data.nextPage ?? null;
    pages++;
  }
  return all;
}

/** Recency rank for a batch string like "W24", "S23", "F26". Higher = newer. */
export function batchRank(batch: string | undefined): number {
  if (!batch) return -1;
  const m = /^([WSF])(\d{2})$/i.exec(batch.trim());
  if (!m) return -1;
  const season = { w: 0, s: 1, f: 2 }[m[1].toLowerCase()] ?? 0;
  return Number(m[2]) * 3 + season;
}

export interface YcSyncSummary {
  fetched: number;
  considered: number;
  newlyTracked: number;
  resolved: number;
  none: number;
  errors: number;
}

/**
 * Pull the YC directory, keep Active companies from the most recent N batches,
 * upsert them as TrackedCompany rows for `userId`, and run ATS discovery on
 * the ones not yet resolved.
 *
 * `discoverLimit` caps how many discovery passes run per invocation so a
 * single sync can't burn the whole Firecrawl budget — the rest stay 'pending'
 * and get picked up next run.
 */
export async function syncYc(
  userId: string,
  {
    recentBatches = 8,
    discoverLimit = 15,
    allowFirecrawl = true,
  }: { recentBatches?: number; discoverLimit?: number; allowFirecrawl?: boolean } = {},
): Promise<YcSyncSummary> {
  const companies = await fetchYcCompanies();
  const ranked = companies
    .filter((c) => c.website && (c.status ?? "Active") === "Active")
    .sort((a, b) => batchRank(b.batch) - batchRank(a.batch));

  const cutoff = ranked.length
    ? batchRank(ranked[0].batch) - recentBatches * 3
    : 0;
  const considered = ranked.filter((c) => batchRank(c.batch) >= cutoff);

  const summary: YcSyncSummary = {
    fetched: companies.length,
    considered: considered.length,
    newlyTracked: 0,
    resolved: 0,
    none: 0,
    errors: 0,
  };

  let discoveries = 0;

  for (const c of considered) {
    let row = await db.trackedCompany.findUnique({
      where: { userId_name: { userId, name: c.name } },
    });
    if (!row) {
      row = await db.trackedCompany.create({
        data: {
          userId,
          name: c.name,
          website: c.website,
          ycBatch: c.batch,
          discoveryStatus: "pending",
        },
      });
      summary.newlyTracked++;
    }

    if (row.discoveryStatus === "resolved" || row.discoveryStatus === "none") {
      continue;
    }
    if (discoveries >= discoverLimit) continue;
    discoveries++;

    const outcome = await discoverAts(c.website!, { allowFirecrawl });
    if (outcome.status === "resolved" && outcome.match) {
      summary.resolved++;
      await db.trackedCompany.update({
        where: { id: row.id },
        data: {
          atsType: outcome.match.atsType,
          atsToken: outcome.match.atsToken,
          discoveryStatus: "resolved",
          discoveryError: null,
        },
      });
    } else if (outcome.status === "none") {
      summary.none++;
      await db.trackedCompany.update({
        where: { id: row.id },
        data: { discoveryStatus: "none" },
      });
    } else {
      summary.errors++;
      await db.trackedCompany.update({
        where: { id: row.id },
        data: { discoveryStatus: "error", discoveryError: outcome.error ?? "unknown" },
      });
    }
  }

  return summary;
}

export interface ResolvePendingSummary {
  attempted: number;
  resolved: number;
  none: number;
  errors: number;
  remaining: number;
}

/**
 * Drain the discovery backlog: run ATS discovery over companies already
 * tracked for `userId` that are still 'pending' or 'error', up to `limit` per
 * call. This is the "Resolve pending" button — it doesn't re-fetch the YC
 * directory, it just works through what's already queued.
 */
export async function resolvePending(
  userId: string,
  { limit = 40, allowFirecrawl = true }: { limit?: number; allowFirecrawl?: boolean } = {},
): Promise<ResolvePendingSummary> {
  const queue = await db.trackedCompany.findMany({
    where: {
      userId,
      discoveryStatus: { in: ["pending", "error"] },
      website: { not: null },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const summary: ResolvePendingSummary = {
    attempted: queue.length,
    resolved: 0,
    none: 0,
    errors: 0,
    remaining: 0,
  };

  for (const row of queue) {
    const outcome = await discoverAts(row.website!, { allowFirecrawl });
    if (outcome.status === "resolved" && outcome.match) {
      summary.resolved++;
      await db.trackedCompany.update({
        where: { id: row.id },
        data: {
          atsType: outcome.match.atsType,
          atsToken: outcome.match.atsToken,
          discoveryStatus: "resolved",
          discoveryError: null,
        },
      });
    } else if (outcome.status === "none") {
      summary.none++;
      await db.trackedCompany.update({
        where: { id: row.id },
        data: { discoveryStatus: "none" },
      });
    } else {
      summary.errors++;
      await db.trackedCompany.update({
        where: { id: row.id },
        data: { discoveryStatus: "error", discoveryError: outcome.error ?? "unknown" },
      });
    }
  }

  summary.remaining = await db.trackedCompany.count({
    where: { userId, discoveryStatus: { in: ["pending", "error"] } },
  });

  return summary;
}
