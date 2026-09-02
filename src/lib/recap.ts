import { db } from "@/lib/db";
import { readList } from "@/lib/json-list";

export interface WeeklyRecap {
  weekStart: string;
  weekEnd: string;
  applied: number;
  appliedAllTime: number;
  saved: number;
  interviews: number;
  offers: number;
  responseRate: number | null;
  avgResponseDays: number | null;
  streak: number;
  topMissingKeyword: string | null;
  newBadges: Array<{ slug: string; label: string; emoji: string }>;
  bestMatch: { title: string; company: string; score: number } | null;
}

function startOfWeek(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // Sunday
  return x;
}

export async function buildRecap(userId: string): Promise<WeeklyRecap> {
  const weekStart = startOfWeek();
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);

  const [apps, allApplied, badges, scores, topScore] = await Promise.all([
    db.application.findMany({
      where: { userId, createdAt: { gte: weekStart } },
    }),
    db.application.count({ where: { userId, appliedAt: { not: null } } }),
    db.badge.findMany({
      where: { userId, earnedAt: { gte: weekStart } },
    }),
    db.matchScore.findMany({
      where: { userId },
      select: { missingKeywords: true },
      take: 2000,
    }),
    db.matchScore.findFirst({
      where: { userId },
      orderBy: { score: "desc" },
      include: { job: { select: { title: true, company: true } } },
    }),
  ]);

  const user = await db.user.findUnique({ where: { id: userId } });

  const appliedThisWeek = apps.filter((a) => a.appliedAt).length;
  const responded = apps.filter(
    (a) => a.status === "interviewing" || a.status === "offer" || a.status === "rejected",
  ).length;

  // avg time-to-response across all applications that have moved past "applied"
  const allApps = await db.application.findMany({
    where: {
      userId,
      appliedAt: { not: null },
      status: { in: ["interviewing", "offer", "rejected"] },
    },
    select: { appliedAt: true, updatedAt: true },
  });
  const responseDays = allApps
    .map((a) =>
      a.appliedAt
        ? (a.updatedAt.getTime() - a.appliedAt.getTime()) / 86_400_000
        : null,
    )
    .filter((d): d is number => d !== null && d >= 0 && d < 120);
  const avgResponseDays = responseDays.length
    ? Math.round((responseDays.reduce((s, d) => s + d, 0) / responseDays.length) * 10) / 10
    : null;

  const gapCounts = new Map<string, number>();
  for (const s of scores)
    for (const k of readList<string>(s.missingKeywords))
      gapCounts.set(k, (gapCounts.get(k) ?? 0) + 1);
  const topMissingKeyword =
    [...gapCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const { BADGE_BY_SLUG } = await import("./gamification");

  return {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    applied: appliedThisWeek,
    appliedAllTime: allApplied,
    saved: apps.filter((a) => a.status === "saved").length,
    interviews: apps.filter((a) => a.status === "interviewing").length,
    offers: apps.filter((a) => a.status === "offer").length,
    responseRate: appliedThisWeek ? Math.round((responded / appliedThisWeek) * 100) : null,
    avgResponseDays,
    streak: user?.streakCount ?? 0,
    topMissingKeyword,
    newBadges: badges.flatMap((b) => {
      const def = BADGE_BY_SLUG.get(b.slug);
      return def ? [{ slug: def.slug, label: def.label, emoji: def.emoji }] : [];
    }),
    bestMatch: topScore
      ? {
          title: topScore.job.title,
          company: topScore.job.company,
          score: topScore.score,
        }
      : null,
  };
}
