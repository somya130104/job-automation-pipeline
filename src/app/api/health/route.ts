import { db } from "@/lib/db";
import { ok, route } from "@/lib/api";
import { DEFAULT_TARGETS } from "@/lib/sources/registry";
import { firecrawlCreditsUsed } from "@/lib/sources/firecrawl";

export const runtime = "nodejs";

/**
 * Per-source ingestion health. Surfaced on the Insights page so a board that
 * quietly started 404ing (companies do migrate ATS) is visible rather than
 * just showing up as "fewer jobs than usual".
 */
export const GET = route(async () => {
  const jobs = await db.job.count();

  const perSource = await Promise.all(
    [...new Set(DEFAULT_TARGETS.map((t) => t.source))].map(async (source) => {
      const latest = await db.ingestRun.findFirst({
        where: { source },
        orderBy: { startedAt: "desc" },
      });
      const recent = await db.ingestRun.findMany({
        where: { source },
        orderBy: { startedAt: "desc" },
        take: 20,
        select: { status: true },
      });
      const succeeded = recent.filter((r) => r.status === "ok").length;

      return {
        source,
        jobs: await db.job.count({ where: { source } }),
        lastRunAt: latest?.startedAt ?? null,
        lastStatus: latest?.status ?? "never-run",
        lastError: latest?.error ?? null,
        successRate: recent.length
          ? Math.round((succeeded / recent.length) * 100)
          : null,
      };
    }),
  );

  const failing = perSource.filter((s) => s.lastStatus === "failed");

  const [firecrawlCredits, lastDigestUser, hnParses, trackedResolved] =
    await Promise.all([
      firecrawlCreditsUsed(30),
      db.user.findFirst({
        where: { lastDigestAt: { not: null } },
        orderBy: { lastDigestAt: "desc" },
        select: { lastDigestAt: true, lastDigestCount: true },
      }),
      db.hnParse.count(),
      db.trackedCompany.count({ where: { discoveryStatus: "resolved" } }),
    ]);

  return ok({
    status: failing.length === 0 ? "ok" : "degraded",
    jobs,
    sources: perSource,
    failing: failing.map((s) => s.source),
    firecrawl: { creditsUsedLast30d: firecrawlCredits, monthlyFree: 1000 },
    digest: {
      lastSentAt: lastDigestUser?.lastDigestAt ?? null,
      lastCount: lastDigestUser?.lastDigestCount ?? null,
    },
    hnParsedComments: hnParses,
    trackedCompaniesResolved: trackedResolved,
    checkedAt: new Date().toISOString(),
  });
});
