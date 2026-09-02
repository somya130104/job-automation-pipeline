import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, ok, readJson, route } from "@/lib/api";
import { refreshBadges } from "@/lib/gamification";

export const runtime = "nodejs";

const VALID_STATUSES = [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "ghosted",
];

interface Body {
  jobId: string;
  status: string;
  notes: string;
  prepNotes: string;
  followUpDate: string | null;
}

/** Create or move an application. Idempotent per (job, user). */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<Body>(req);

  if (!body.jobId) return fail("jobId is required.");
  const status = body.status ?? "saved";
  if (!VALID_STATUSES.includes(status)) {
    return fail(`Unknown status "${status}".`);
  }

  const job = await db.job.findUnique({ where: { id: body.jobId } });
  if (!job) return fail("That job no longer exists.", 404);

  const existing = await db.application.findUnique({
    where: { jobId_userId: { jobId: job.id, userId: user.id } },
  });

  const movingToApplied = status === "applied" && existing?.status !== "applied";

  const shared = {
    status,
    ...(body.notes !== undefined ? { notes: String(body.notes).slice(0, 8000) } : {}),
    ...(body.prepNotes !== undefined
      ? { prepNotes: String(body.prepNotes).slice(0, 8000) }
      : {}),
    ...(body.followUpDate !== undefined
      ? {
          followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
        }
      : {}),
  };

  const application = await db.application.upsert({
    where: { jobId_userId: { jobId: job.id, userId: user.id } },
    create: {
      jobId: job.id,
      userId: user.id,
      ...shared,
      ...(status === "applied"
        ? {
            appliedAt: new Date(),
            // Postings get edited and pulled while you wait to hear back —
            // keep our own copy of what you actually applied to.
            jdSnapshot: job.descriptionText,
            // Nudge at day 7 if nothing has moved.
            followUpDate: new Date(Date.now() + 7 * 86_400_000),
          }
        : {}),
    },
    update: {
      ...shared,
      ...(movingToApplied
        ? {
            appliedAt: new Date(),
            jdSnapshot: job.descriptionText,
            followUpDate:
              body.followUpDate !== undefined
                ? shared.followUpDate
                : new Date(Date.now() + 7 * 86_400_000),
          }
        : {}),
    },
  });

  if (movingToApplied) await bumpStreak(user.id);
  await refreshBadges(user.id);

  return ok({ application });
});

/**
 * Daily applying streak. Only counts the first application of each day, and
 * only continues if the previous one was yesterday.
 */
async function bumpStreak(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const last = user.streakUpdatedAt ? new Date(user.streakUpdatedAt) : null;
  last?.setHours(0, 0, 0, 0);

  if (last && last.getTime() === today.getTime()) return; // already counted

  const yesterday = new Date(today.getTime() - 86_400_000);
  const continues = last && last.getTime() === yesterday.getTime();

  await db.user.update({
    where: { id: userId },
    data: {
      streakCount: continues ? user.streakCount + 1 : 1,
      streakUpdatedAt: new Date(),
    },
  });
}
