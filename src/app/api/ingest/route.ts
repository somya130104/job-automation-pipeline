import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, ok, route } from "@/lib/api";
import { rescoreUser } from "@/lib/matching/rescore";
import { ingestAll } from "@/lib/sources/ingest";
import { allIngestTargets } from "@/lib/sources/all-targets";
import { hnNormalizedJobs } from "@/lib/sources/hn";

export const runtime = "nodejs";
// Polling a dozen boards takes longer than the default serverless budget.
export const maxDuration = 300;

/**
 * Triggers a full ingestion run.
 *
 * Two ways in, because this endpoint serves two callers:
 *  - a signed-in user pressing "Refresh jobs" in the UI
 *  - a cron job (Phase 3) carrying the CRON_SECRET bearer token
 */
export const POST = route(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const viaCron = Boolean(secret && auth === `Bearer ${secret}`);

  if (!viaCron) {
    const user = await getCurrentUser();
    if (!user) return fail("Sign in, or send the CRON_SECRET bearer token.", 401);
  }

  const url = new URL(req.url);
  const only = url.searchParams.get("source");
  const allTargets = await allIngestTargets();
  const targets = only
    ? allTargets.filter((t) => t.source === only)
    : allTargets;

  // "hn" isn't a polled board — it's folded in below from already-parsed
  // HnParse rows — so an empty target list is only an error for other sources.
  if (targets.length === 0 && only !== "hn") {
    return fail(`No targets for source "${only}".`);
  }

  const summary = targets.length
    ? await ingestAll(targets)
    : { targets: [], totalCreated: 0, totalFetched: 0, startedAt: new Date(), finishedAt: new Date() };

  // Fold in already-parsed HN "Who is hiring?" postings (parsed separately via
  // POST /api/sources/hn, which needs Gemini). Cheap set-difference, no fetch.
  if (!only || only === "hn") {
    try {
      const hnJobs = await hnNormalizedJobs();
      if (hnJobs.length) {
        const { ingestNormalized } = await import("@/lib/sources/ingest");
        const res = await ingestNormalized(hnJobs, "hn");
        summary.totalCreated += res.created;
        summary.totalFetched += hnJobs.length;
      }
    } catch {
      // HN is best-effort; never fail the run for it.
    }
  }

  // Score whatever is new for everyone who has finished onboarding, so the
  // feed is populated the moment the run finishes.
  const users = await db.user.findMany({
    where: { onboarded: true },
    select: { id: true },
  });
  for (const user of users) {
    await rescoreUser(user.id, { onlyMissing: true });
  }

  return ok({
    created: summary.totalCreated,
    fetched: summary.totalFetched,
    durationMs: summary.finishedAt.getTime() - summary.startedAt.getTime(),
    targets: summary.targets,
  });
});
