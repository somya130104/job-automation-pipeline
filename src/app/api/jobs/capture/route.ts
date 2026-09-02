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

/**
 * Capture endpoint for the Phase 3 browser extension.
 *
 * This exists now so the extension can be built against a stable contract.
 * The important distinction: this is *user-initiated capture of a page the
 * user is already viewing*, which is how Teal/Huntr/Simplify solve the
 * LinkedIn/Naukri problem. Nothing here crawls anything — the extension
 * posts DOM text the user is already looking at.
 */
interface CaptureBody {
  url: string;
  title: string;
  company: string;
  description: string;
  location?: string;
  postedAt?: string;
}

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<CaptureBody>(req);

  const url = body.url?.trim();
  const title = body.title?.trim();
  const company = body.company?.trim();
  const description = body.description?.trim();

  if (!url || !title || !company || !description) {
    return fail("url, title, company and description are all required.");
  }
  if (description.length < 80) {
    return fail("That description is too short to score against a resume.");
  }

  // The page URL is the natural stable id for a captured posting.
  const externalId = createHash("sha256").update(url).digest("hex").slice(0, 32);
  const fingerprint = createHash("sha256")
    .update(`capture::${externalId}`)
    .digest("hex")
    .slice(0, 32);

  const locations = body.location?.trim() ? [body.location.trim()] : [];

  const normalized: NormalizedJob = {
    externalId,
    source: "capture",
    sourceToken: "",
    title,
    company,
    locations,
    remoteType: inferRemoteType(locations.join(" "), title, description),
    employmentType: inferEmploymentType(title, description),
    descriptionText: description.slice(0, 60_000),
    applyUrl: url,
    postedAt: body.postedAt ? new Date(body.postedAt) : new Date(),
  };

  const scam = assessScam(normalized);

  const job = await db.job.upsert({
    where: { fingerprint },
    create: {
      fingerprint,
      dedupKey: dedupKey(normalized),
      externalId,
      source: "capture",
      capturedVia: "extension",
      title: normalized.title,
      company: normalized.company,
      locations: writeList(locations),
      remoteType: normalized.remoteType,
      employmentType: normalized.employmentType,
      descriptionText: normalized.descriptionText,
      applyUrl: url,
      scamRisk: scam.risk,
      scamReasons: JSON.stringify(scam.reasons),
      postedAt: normalized.postedAt,
    },
    update: {
      title: normalized.title,
      company: normalized.company,
      descriptionText: normalized.descriptionText,
    },
  });

  // Score it immediately — the extension shows the match score in its popup
  // right after saving, so it can't wait for the next batch run.
  await rescoreUser(user.id, { onlyMissing: true });

  const score = await db.matchScore.findUnique({
    where: { jobId_userId: { jobId: job.id, userId: user.id } },
  });

  return ok({
    jobId: job.id,
    score: score?.score ?? null,
    appUrl: `/dashboard?job=${job.id}`,
  });
});
