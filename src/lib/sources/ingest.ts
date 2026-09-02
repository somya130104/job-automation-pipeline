import { db } from "@/lib/db";
import { writeList } from "@/lib/json-list";
import { DEFAULT_TARGETS, getSource, type SourceTarget } from "./registry";
import { assessScam } from "@/lib/matching/scam";
import { dedupKey, fingerprint, type NormalizedJob } from "./types";

export interface TargetResult {
  source: string;
  token: string;
  ok: boolean;
  fetched: number;
  created: number;
  duplicates: number;
  error?: string;
}

export interface IngestSummary {
  startedAt: Date;
  finishedAt: Date;
  targets: TargetResult[];
  totalCreated: number;
  totalFetched: number;
}

/** Postings older than this are noise for a "what's new" feed. */
const MAX_AGE_DAYS = 45;

function isFresh(job: NormalizedJob): boolean {
  const ageMs = Date.now() - job.postedAt.getTime();
  return ageMs < MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function isUsable(job: NormalizedJob): boolean {
  return Boolean(
    job.externalId &&
      job.title?.trim() &&
      job.company?.trim() &&
      job.applyUrl?.trim() &&
      // A posting with no description can't be scored or gap-analysed, so it
      // would only ever show up as a 0% match. Drop it at the door.
      job.descriptionText?.trim().length > 80,
  );
}

async function persist(
  jobs: NormalizedJob[],
  displayCompany?: string,
): Promise<{ created: number; duplicates: number }> {
  let created = 0;
  let duplicates = 0;

  // Dedup within this batch first — a single board can list the same role
  // across several offices as separate postings.
  const seenInBatch = new Set<string>();

  for (const job of jobs) {
    if (!isUsable(job) || !isFresh(job)) continue;

    const fp = fingerprint(job);
    if (seenInBatch.has(fp)) continue;
    seenInBatch.add(fp);

    const key = dedupKey(job);

    // Cross-source dedup: if this exact role already exists from another
    // source, keep the incumbent. ATS records beat aggregator records because
    // they carry the full JD and a direct apply link.
    const crossSource = await db.job.findFirst({
      where: { dedupKey: key, fingerprint: { not: fp } },
      select: { id: true, source: true },
    });
    if (crossSource) {
      duplicates++;
      continue;
    }

    const scam = assessScam(job);

    const data = {
      dedupKey: key,
      externalId: job.externalId,
      source: job.source,
      sourceToken: job.sourceToken,
      capturedVia: "api",
      title: job.title.trim(),
      company: (displayCompany || job.company).trim(),
      companyLogo: job.companyLogo ?? null,
      locations: writeList(job.locations),
      remoteType: job.remoteType,
      employmentType: job.employmentType,
      department: job.department ?? null,
      descriptionText: job.descriptionText,
      descriptionHtml: job.descriptionHtml ?? null,
      applyUrl: job.applyUrl,
      compensationMin: job.compensationMin ?? null,
      compensationMax: job.compensationMax ?? null,
      compensationCurrency: job.compensationCurrency ?? null,
      stipend: job.stipend ?? null,
      durationMonths: job.durationMonths ?? null,
      startDate: job.startDate ?? null,
      applicationDeadline: job.applicationDeadline ?? null,
      scamRisk: scam.risk,
      scamReasons: writeList(scam.reasons),
      postedAt: job.postedAt,
    };

    const before = await db.job.findUnique({
      where: { fingerprint: fp },
      select: { id: true },
    });

    await db.job.upsert({
      where: { fingerprint: fp },
      create: { fingerprint: fp, ...data },
      // Re-ingesting refreshes the copy (titles and comp bands do get edited)
      // but must not move postedAt, or every job looks new every night.
      update: { ...data, postedAt: undefined },
    });

    if (before) duplicates++;
    else created++;
  }

  return { created, duplicates };
}

/**
 * Persist a batch of already-normalised jobs that didn't come from a polled
 * board (HN parser, career-page crawler results handed back in bulk). Records
 * one IngestRun row so the source still shows on the health page.
 */
export async function ingestNormalized(
  jobs: NormalizedJob[],
  source: string,
): Promise<{ created: number; duplicates: number }> {
  const run = await db.ingestRun.create({
    data: { source, token: "", status: "running" },
  });
  try {
    const { created, duplicates } = await persist(jobs);
    await db.ingestRun.update({
      where: { id: run.id },
      data: { status: "ok", fetched: jobs.length, created, duplicates, finishedAt: new Date() },
    });
    return { created, duplicates };
  } catch (err) {
    await db.ingestRun.update({
      where: { id: run.id },
      data: { status: "failed", error: err instanceof Error ? err.message : String(err), finishedAt: new Date() },
    });
    return { created: 0, duplicates: 0 };
  }
}

/** Run one target, recording the attempt whether it succeeds or fails. */
export async function ingestTarget(target: SourceTarget): Promise<TargetResult> {
  const adapter = getSource(target.source);
  const run = await db.ingestRun.create({
    data: { source: target.source, token: target.token, status: "running" },
  });

  const base = { source: target.source, token: target.token };

  if (!adapter) {
    const error = `No adapter registered for source "${target.source}"`;
    await db.ingestRun.update({
      where: { id: run.id },
      data: { status: "failed", error, finishedAt: new Date() },
    });
    return { ...base, ok: false, fetched: 0, created: 0, duplicates: 0, error };
  }

  try {
    const jobs = await adapter.fetchJobs(target.token);
    const { created, duplicates } = await persist(jobs, target.company);

    await db.ingestRun.update({
      where: { id: run.id },
      data: {
        status: "ok",
        fetched: jobs.length,
        created,
        duplicates,
        finishedAt: new Date(),
      },
    });

    return { ...base, ok: true, fetched: jobs.length, created, duplicates };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db.ingestRun.update({
      where: { id: run.id },
      data: { status: "failed", error, finishedAt: new Date() },
    });
    return { ...base, ok: false, fetched: 0, created: 0, duplicates: 0, error };
  }
}

/**
 * Ingest every target. Boards are polled with a small concurrency cap and a
 * stagger — these are free public endpoints and hammering them in parallel is
 * both rude and a good way to get rate-limited.
 *
 * One dead board must never fail the run: `ingestTarget` swallows its own
 * errors into a result row, so a company that migrated ATS just shows up as
 * a failed target on /api/health.
 */
export async function ingestAll(
  targets: SourceTarget[] = DEFAULT_TARGETS,
  concurrency = 3,
): Promise<IngestSummary> {
  const startedAt = new Date();
  const results: TargetResult[] = [];
  const queue = [...targets];

  async function worker() {
    while (queue.length) {
      const target = queue.shift();
      if (!target) return;
      results.push(await ingestTarget(target));
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, worker),
  );

  return {
    startedAt,
    finishedAt: new Date(),
    targets: results,
    totalCreated: results.reduce((n, r) => n + r.created, 0),
    totalFetched: results.reduce((n, r) => n + r.fetched, 0),
  };
}
