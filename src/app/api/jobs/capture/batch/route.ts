import { createHash } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, ok, readJson, route } from "@/lib/api";
import { writeList } from "@/lib/json-list";
import { rescoreUser } from "@/lib/matching/rescore";
import { assessScam } from "@/lib/matching/scam";
import {
  dedupKey,
  inferEmploymentType,
  inferRemoteType,
  type NormalizedJob,
} from "@/lib/sources/types";

export const runtime = "nodejs";
// Up to ~60 upserts + one rescore pass.
export const maxDuration = 120;

/**
 * Bulk capture for the extension's "capture every job on this results page"
 * button. Same model as the single-job capture route — the extension posts
 * DOM text the user is already looking at on a LinkedIn / Naukri search page.
 * Nothing here crawls: the browser already fetched these cards.
 *
 * List views only carry a short teaser, so `description` is optional here and
 * synthesised from title/company/location when missing — scoring is weaker for
 * these than for a full-JD single capture, which is the deliberate trade.
 */
interface BatchItem {
  url: string;
  title: string;
  company: string;
  description?: string;
  location?: string;
}
interface BatchBody {
  /** "linkedin" | "naukri" | … — recorded as provenance on each row. */
  site?: string;
  jobs: BatchItem[];
}

const MAX_JOBS = 60;

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<BatchBody>(req);

  const site = (body.site ?? "").toString().trim().slice(0, 24).toLowerCase();
  const jobs = Array.isArray(body.jobs) ? body.jobs.slice(0, MAX_JOBS) : [];
  if (jobs.length === 0) {
    return fail("No jobs in the batch. `jobs` must be a non-empty array.");
  }

  let created = 0;
  let updated = 0;
  const skipped: Array<{ url?: string; reason: string }> = [];

  for (const item of jobs) {
    const url = item.url?.trim();
    const title = item.title?.trim();
    const company = item.company?.trim();
    if (!url || !title || !company) {
      skipped.push({ url, reason: "missing url / title / company" });
      continue;
    }

    const location = item.location?.trim() ?? "";
    const teaser = item.description?.trim() ?? "";
    // List cards are thin — guarantee something to score against.
    const description =
      teaser.length >= 40
        ? teaser
        : `${title} at ${company}${location ? ` — ${location}` : ""}.${
            teaser ? ` ${teaser}` : ""
          }`;

    const externalId = createHash("sha256").update(url).digest("hex").slice(0, 32);
    const fingerprint = createHash("sha256")
      .update(`capture::${externalId}`)
      .digest("hex")
      .slice(0, 32);

    const locations = location ? [location] : [];
    const normalized: NormalizedJob = {
      externalId,
      source: "capture",
      sourceToken: site,
      title,
      company,
      locations,
      remoteType: inferRemoteType(locations.join(" "), title, description),
      employmentType: inferEmploymentType(title, description),
      descriptionText: description.slice(0, 60_000),
      applyUrl: url,
      postedAt: new Date(),
    };
    const scam = assessScam(normalized);

    try {
      const existing = await db.job.findUnique({
        where: { fingerprint },
        select: { id: true },
      });
      await db.job.upsert({
        where: { fingerprint },
        create: {
          fingerprint,
          dedupKey: dedupKey(normalized),
          externalId,
          source: "capture",
          sourceToken: site,
          capturedVia: "extension",
          title,
          company,
          locations: writeList(locations),
          remoteType: normalized.remoteType,
          employmentType: normalized.employmentType,
          descriptionText: normalized.descriptionText,
          applyUrl: url,
          scamRisk: scam.risk,
          scamReasons: writeList(scam.reasons),
          postedAt: normalized.postedAt,
        },
        update: {
          title,
          company,
          // Don't overwrite a richer single-capture description with a teaser.
          ...(description.length >= 200
            ? { descriptionText: normalized.descriptionText }
            : {}),
        },
      });
      if (existing) updated++;
      else created++;
    } catch (err) {
      skipped.push({
        url,
        reason: err instanceof Error ? err.message : "write failed",
      });
    }
  }

  // One rescore pass for everything new.
  if (created > 0) {
    await rescoreUser(user.id, { onlyMissing: true });
  }

  return ok({
    received: jobs.length,
    created,
    updated,
    saved: created + updated,
    skipped: skipped.length,
    skippedDetail: skipped.slice(0, 10),
  });
});
