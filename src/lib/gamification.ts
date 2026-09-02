import { db } from "@/lib/db";

/**
 * Small badges for consistent applying — the salon site's personality,
 * translated. Awarded idempotently (Badge has @@unique([userId, slug])), so
 * calling this after every status change is safe.
 */

export interface BadgeDef {
  slug: string;
  label: string;
  emoji: string;
  describe: string;
}

export const BADGES: BadgeDef[] = [
  { slug: "first-application", label: "Off the mark", emoji: "🚀", describe: "Sent your first application" },
  { slug: "ten-applied", label: "In the arena", emoji: "🔟", describe: "10 applications sent" },
  { slug: "fifty-applied", label: "Grinder", emoji: "💯", describe: "50 applications sent" },
  { slug: "week-streak", label: "Habit formed", emoji: "🔥", describe: "7-day applying streak" },
  { slug: "month-streak", label: "Relentless", emoji: "⚡", describe: "30-day applying streak" },
  { slug: "first-interview", label: "In the room", emoji: "🎙️", describe: "First role reached interviewing" },
  { slug: "first-offer", label: "Landed", emoji: "🎯", describe: "First offer" },
];

export const BADGE_BY_SLUG = new Map(BADGES.map((b) => [b.slug, b]));

async function grant(userId: string, slug: string) {
  await db.badge.upsert({
    where: { userId_slug: { userId, slug } },
    create: { userId, slug },
    update: {},
  });
}

/** Re-evaluate every badge for a user from current DB state. Cheap. */
export async function refreshBadges(userId: string): Promise<string[]> {
  const [user, applied, interviewing, offer] = await Promise.all([
    db.user.findUnique({ where: { id: userId } }),
    db.application.count({ where: { userId, appliedAt: { not: null } } }),
    db.application.count({ where: { userId, status: "interviewing" } }),
    db.application.count({ where: { userId, status: "offer" } }),
  ]);
  if (!user) return [];

  const earned: string[] = [];
  const maybe = async (cond: boolean, slug: string) => {
    if (cond) {
      await grant(userId, slug);
      earned.push(slug);
    }
  };

  await maybe(applied >= 1, "first-application");
  await maybe(applied >= 10, "ten-applied");
  await maybe(applied >= 50, "fifty-applied");
  await maybe(user.streakCount >= 7, "week-streak");
  await maybe(user.streakCount >= 30, "month-streak");
  await maybe(interviewing >= 1 || offer >= 1, "first-interview");
  await maybe(offer >= 1, "first-offer");

  return earned;
}
