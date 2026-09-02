import { db } from "@/lib/db";
import { renderDigest } from "./render";
import { sendEmail } from "./send";
import { selectAll } from "./select";

export interface DigestRunSummary {
  ranAt: string;
  origin: string;
  eligibleUsers: number;
  sent: number;
  suppressed: number; // users with zero new matches (no email)
  failed: number;
  results: Array<{
    userId: string;
    email: string;
    jobs: number;
    status: "sent" | "failed";
    error?: string;
  }>;
}

/**
 * One digest run. Idempotent by construction: a job that has a DigestSend row
 * for a user is never selected again, and DigestSend rows are written only
 * after a successful send. Re-running an hour later sends nothing new.
 *
 * `selectAll` already applied the suppression rule (users with no matches are
 * dropped before we get here), so `suppressed` is derived, not acted on.
 */
export async function runDigest(origin: string): Promise<DigestRunSummary> {
  const now = new Date();
  const selections = await selectAll(origin, now);

  const totalEligible = await db.user.count({
    where: { onboarded: true, digestFrequency: { not: "off" }, email: { not: null } },
  });

  const results: DigestRunSummary["results"] = [];
  let sent = 0;
  let failed = 0;

  for (const selection of selections) {
    const email = renderDigest(selection, origin);
    const res = await sendEmail(selection.email, email);

    if (res.ok) {
      sent++;
      await db.$transaction([
        db.digestSend.createMany({
          data: selection.jobs.map((j) => ({
            userId: selection.userId,
            jobId: j.jobId,
          })),
        }),
        db.user.update({
          where: { id: selection.userId },
          data: { lastDigestAt: now, lastDigestCount: selection.jobs.length },
        }),
      ]);
      results.push({
        userId: selection.userId,
        email: selection.email,
        jobs: selection.jobs.length,
        status: "sent",
      });
    } else {
      failed++;
      results.push({
        userId: selection.userId,
        email: selection.email,
        jobs: selection.jobs.length,
        status: "failed",
        error: res.error,
      });
    }
  }

  return {
    ranAt: now.toISOString(),
    origin,
    eligibleUsers: totalEligible,
    sent,
    suppressed: totalEligible - selections.length,
    failed,
    results,
  };
}
