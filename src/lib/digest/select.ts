import { db } from "@/lib/db";
import { readList } from "@/lib/json-list";

export interface DigestJob {
  jobId: string;
  title: string;
  company: string;
  location: string | null;
  remoteType: string;
  score: number;
  matched: string[];
  missing: string[];
  postedAt: Date;
  applyUrl: string;
  deepLink: string; // in-app link (path only; caller prefixes origin)
}

export interface DigestSelection {
  userId: string;
  email: string;
  name: string | null;
  unsubToken: string | null;
  jobs: DigestJob[];
}

/** How far back "new" reaches when a user has never had a digest. */
const FIRST_RUN_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_JOBS = 15;

/**
 * Pick the jobs that belong in one user's digest:
 *   - posted since their last digest (or last 24h on first run)
 *   - match score >= their threshold
 *   - not already sent to them in a previous digest (DigestSend)
 * Ordered by score, capped at 15.
 */
export async function selectForUser(userId: string): Promise<DigestJob[]> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return [];

  const since = user.lastDigestAt
    ? user.lastDigestAt
    : new Date(Date.now() - FIRST_RUN_WINDOW_MS);

  const rows = await db.matchScore.findMany({
    where: {
      userId,
      score: { gte: user.matchThreshold },
      job: { postedAt: { gte: since } },
      // exclude anything already digested
      NOT: { job: { digestSends: { some: { userId } } } },
    },
    orderBy: [{ score: "desc" }, { job: { postedAt: "desc" } }],
    take: MAX_JOBS,
    include: { job: true },
  });

  return rows.map(({ job, ...s }) => ({
    jobId: job.id,
    title: job.title,
    company: job.company,
    location: readList<string>(job.locations)[0] ?? null,
    remoteType: job.remoteType,
    score: s.score,
    matched: readList<string>(s.matchedKeywords).slice(0, 3),
    missing: readList<string>(s.missingKeywords).slice(0, 3),
    postedAt: job.postedAt,
    applyUrl: job.applyUrl,
    deepLink: `/dashboard?job=${job.id}`,
  }));
}

/** Is a digest due for this user right now, given frequency + day of week? */
export function digestDueToday(
  frequency: string,
  now = new Date(),
): boolean {
  if (frequency === "off") return false;
  if (frequency === "weekdays") {
    const day = now.getDay(); // 0 Sun .. 6 Sat
    return day >= 1 && day <= 5;
  }
  return true; // "daily"
}

/** Every user who should get a digest this run, with their picked jobs. */
export async function selectAll(
  origin: string,
  now = new Date(),
): Promise<DigestSelection[]> {
  const users = await db.user.findMany({
    where: { onboarded: true, digestFrequency: { not: "off" }, email: { not: null } },
  });

  const out: DigestSelection[] = [];
  for (const user of users) {
    if (!digestDueToday(user.digestFrequency, now)) continue;
    const jobs = await selectForUser(user.id);
    if (jobs.length === 0) continue; // suppression rule: no email on zero matches
    out.push({
      userId: user.id,
      email: user.email!,
      name: user.name,
      unsubToken: user.unsubToken,
      jobs: jobs.map((j) => ({ ...j, deepLink: `${origin}${j.deepLink}` })),
    });
  }
  return out;
}
