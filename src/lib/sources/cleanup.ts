import { db } from "@/lib/db";

/**
 * Job expiry sweep — run at the end of a full ingest.
 *
 * "Is this opening still open?" isn't answered by any date, so we use, in
 * order of confidence:
 *
 *   1. Vanished from its board. We poll every board exhaustively each run and
 *      bump `lastSeenAt` on every posting we see again. A board job we haven't
 *      re-seen in BOARD_STALE_DAYS is off the board — filled or closed.
 *   2. Explicit deadline passed (`applicationDeadline < now`), any source.
 *   3. Age backstop: `lastSeenAt` older than a per-source TTL, for the sources
 *      rule 1 can't cover (aggregator feeds, HN, career pages, captures).
 *
 * The clock is `lastSeenAt`, never `postedAt`: postedAt would delete a role
 * the day after we discover it just because the company posted it months ago,
 * and would kill senior/niche roles that legitimately stay open for months.
 *
 * Archived jobs are kept (Tracker, Recap, dedup history) but hidden from the
 * feed and digest, and their MatchScore rows are dropped — `jobs x users` is
 * what actually grows the database. A job that reappears on its board is
 * re-opened by the ingest upsert.
 */

const DAY_MS = 86_400_000;

/** Sources we poll exhaustively every run → absence means closed. */
const BOARD_SOURCES = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "recruitee",
  "workable",
  "yc",
] as const;

/** A board job not re-seen in this long is treated as closed (2 daily runs + a
 * grace day for a flaky board API). */
const BOARD_STALE_DAYS = 3;

/** Per-source shelf life (days) on `lastSeenAt` — the rule-3 backstop. */
const TTL_DAYS: Record<string, number> = {
  greenhouse: 45,
  lever: 45,
  ashby: 45,
  smartrecruiters: 45,
  recruitee: 45,
  workable: 45,
  yc: 45,
  remoteok: 21,
  remotive: 21,
  arbeitnow: 21,
  adzuna: 21,
  hn: 35,
  career_page: 30,
  capture: 45,
};
const DEFAULT_TTL_DAYS = 30;

/** Hard-delete archived jobs nobody touched, this long after archiving. */
const PURGE_AFTER_DAYS = 60;

export interface CleanupSummary {
  archivedDeadline: number;
  archivedVanished: number;
  archivedTTL: number;
  matchScoresDeleted: number;
  purged: number;
}

export async function sweepExpiredJobs(now = new Date()): Promise<CleanupSummary> {
  const ageBefore = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const summary: CleanupSummary = {
    archivedDeadline: 0,
    archivedVanished: 0,
    archivedTTL: 0,
    matchScoresDeleted: 0,
    purged: 0,
  };
  const archive = { status: "archived", archivedAt: now };

  // 2 — deadline passed (any source).
  summary.archivedDeadline = (
    await db.job.updateMany({
      where: { status: "open", applicationDeadline: { not: null, lt: now } },
      data: archive,
    })
  ).count;

  // 1 — board job gone from its board.
  summary.archivedVanished = (
    await db.job.updateMany({
      where: {
        status: "open",
        source: { in: [...BOARD_SOURCES] },
        lastSeenAt: { lt: ageBefore(BOARD_STALE_DAYS) },
      },
      data: archive,
    })
  ).count;

  // 3 — per-source TTL backstop.
  for (const [source, days] of Object.entries(TTL_DAYS)) {
    summary.archivedTTL += (
      await db.job.updateMany({
        where: { status: "open", source, lastSeenAt: { lt: ageBefore(days) } },
        data: archive,
      })
    ).count;
  }
  summary.archivedTTL += (
    await db.job.updateMany({
      where: {
        status: "open",
        source: { notIn: Object.keys(TTL_DAYS) },
        lastSeenAt: { lt: ageBefore(DEFAULT_TTL_DAYS) },
      },
      data: archive,
    })
  ).count;

  // Drop MatchScore rows for archived jobs (chunked — the IN list can be big on
  // the first sweep; it's near-empty on every run after).
  const stale = await db.job.findMany({
    where: { status: "archived", matchScores: { some: {} } },
    select: { id: true },
  });
  const CHUNK = 1000;
  for (let i = 0; i < stale.length; i += CHUNK) {
    summary.matchScoresDeleted += (
      await db.matchScore.deleteMany({
        where: { jobId: { in: stale.slice(i, i + CHUNK).map((j) => j.id) } },
      })
    ).count;
  }

  // Hard purge: long-archived and never applied to / emailed.
  summary.purged = (
    await db.job.deleteMany({
      where: {
        status: "archived",
        archivedAt: { lt: ageBefore(PURGE_AFTER_DAYS) },
        applications: { none: {} },
        digestSends: { none: {} },
      },
    })
  ).count;

  return summary;
}
