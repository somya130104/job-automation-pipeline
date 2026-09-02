import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readList } from "@/lib/json-list";
import { AppNav } from "@/components/chrome/AppNav";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!user.onboarded) redirect("/onboarding");

  const [resume, applications, scores, ingestRuns, badges] = await Promise.all([
    db.resume.findFirst({
      where: { userId: user.id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    }),
    db.application.findMany({
      where: { userId: user.id },
      select: { status: true, appliedAt: true, createdAt: true },
    }),
    db.matchScore.findMany({
      where: { userId: user.id },
      select: { missingKeywords: true, score: true },
    }),
    db.ingestRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 40,
    }),
    db.badge.findMany({ where: { userId: user.id }, orderBy: { earnedAt: "desc" } }),
  ]);

  const { BADGE_BY_SLUG } = await import("@/lib/gamification");

  /* ---- aggregate keyword gaps across every scored job ---- */
  // This is the "what should I actually go learn" number: a skill that is
  // missing on 400 postings matters far more than one missing on 3.
  const gapCounts = new Map<string, number>();
  for (const s of scores) {
    for (const keyword of readList<string>(s.missingKeywords)) {
      gapCounts.set(keyword, (gapCounts.get(keyword) ?? 0) + 1);
    }
  }
  const topGaps = [...gapCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14);
  const maxGap = topGaps[0]?.[1] ?? 1;

  /* ---- funnel ---- */
  const counts = {
    total: applications.length,
    applied: applications.filter((a) => a.appliedAt).length,
    interviewing: applications.filter((a) => a.status === "interviewing").length,
    offer: applications.filter((a) => a.status === "offer").length,
    rejected: applications.filter(
      (a) => a.status === "rejected" || a.status === "ghosted",
    ).length,
  };

  const responded = counts.interviewing + counts.offer + counts.rejected;
  const responseRate = counts.applied
    ? Math.round((responded / counts.applied) * 100)
    : null;
  const interviewRate = counts.applied
    ? Math.round(((counts.interviewing + counts.offer) / counts.applied) * 100)
    : null;

  /* ---- source health ---- */
  const bySource = new Map<
    string,
    { ok: number; failed: number; lastError: string | null }
  >();
  for (const run of ingestRuns) {
    const entry = bySource.get(run.source) ?? {
      ok: 0,
      failed: 0,
      lastError: null,
    };
    if (run.status === "ok") entry.ok++;
    if (run.status === "failed") {
      entry.failed++;
      entry.lastError ??= run.error;
    }
    bySource.set(run.source, entry);
  }

  const atsIssues = readList<{
    severity: string;
    label: string;
    detail: string;
  }>(resume?.atsIssues);

  return (
    <>
      <AppNav />

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8">
        <div>
          <p className="label-mono mb-1.5 !text-accent">Resume insights</p>
          <h1 className="display text-4xl sm:text-5xl">What to fix next</h1>
        </div>

        {!resume ? (
          <EmptyState
            title="No resume uploaded"
            body="Upload a resume and this page fills in with your ATS score, keyword gaps and application funnel."
            action={
              <Link href="/onboarding" className="btn btn-primary mt-2">
                Upload a resume
              </Link>
            }
          />
        ) : (
          <>
            {/* ---------- funnel ---------- */}
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Applications sent" value={String(counts.applied)} />
              <StatTile
                label="Response rate"
                value={responseRate === null ? "—" : `${responseRate}%`}
                hint={
                  counts.applied < 5
                    ? "Needs more data to mean anything"
                    : undefined
                }
              />
              <StatTile
                label="Interview rate"
                value={interviewRate === null ? "—" : `${interviewRate}%`}
              />
              <StatTile
                label="Daily streak"
                value={`${user.streakCount}`}
                accent
              />
            </section>

            {/* ---------- badges ---------- */}
            {badges.length > 0 && (
              <section className="panel p-6">
                <h2 className="display mb-4 text-2xl">Badges</h2>
                <div className="flex flex-wrap gap-2.5">
                  {badges.map((b) => {
                    const def = BADGE_BY_SLUG.get(b.slug);
                    if (!def) return null;
                    return (
                      <div
                        key={b.slug}
                        className="flex items-center gap-2 rounded-full border-2 border-accent/30 bg-accent/10 px-3.5 py-2"
                        title={def.describe}
                      >
                        <span className="text-lg">{def.emoji}</span>
                        <span className="text-sm font-bold text-accent">
                          {def.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ---------- ATS ---------- */}
            <section className="panel p-6">
              <div className="mb-5 flex items-start gap-5">
                <ScoreRing score={resume.atsScore} size={80} label="ATS" />
                <div>
                  <h2 className="display mb-1.5 text-2xl">ATS readability</h2>
                  <p className="max-w-[58ch] text-sm leading-relaxed text-paper/65">
                    Scores whether a machine can parse your resume, not whether
                    it reads well. If our own parser can&apos;t find your dates
                    or skills, a recruiter&apos;s screening software probably
                    can&apos;t either.
                  </p>
                  <p className="mt-2 font-mono text-xs text-muted">
                    {resume.fileName}
                  </p>
                </div>
              </div>

              {atsIssues.length === 0 ? (
                <p className="rounded-xl border-2 border-good/30 bg-good/10 p-3.5 text-sm text-good">
                  No parsing problems found.
                </p>
              ) : (
                <ul className="space-y-2">
                  {atsIssues.map((issue) => (
                    <li
                      key={issue.label}
                      className="rounded-xl border-l-4 bg-raised p-3.5"
                      style={{
                        borderLeftColor:
                          issue.severity === "critical"
                            ? "rgb(var(--c-bad))"
                            : issue.severity === "warning"
                              ? "rgb(var(--c-warn))"
                              : "rgb(var(--c-muted))",
                      }}
                    >
                      <p className="mb-1 text-sm font-bold">{issue.label}</p>
                      <p className="text-xs leading-relaxed text-paper/65">
                        {issue.detail}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ---------- keyword gaps ---------- */}
            <section className="panel p-6">
              <h2 className="display mb-1.5 text-2xl">
                Keywords you keep missing
              </h2>
              <p className="mb-6 max-w-[64ch] text-sm leading-relaxed text-paper/65">
                Counted across all {scores.length.toLocaleString("en-IN")} scored
                postings. A skill near the top of this list is one the market is
                asking you for repeatedly — that&apos;s the signal for what to
                actually go learn, not a suggestion to keyword-stuff.
              </p>

              {topGaps.length === 0 ? (
                <p className="text-sm text-muted">
                  No gaps found — your resume covers everything these postings
                  name.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {topGaps.map(([keyword, count]) => (
                    <div key={keyword} className="flex items-center gap-3">
                      <span className="w-36 shrink-0 truncate text-sm font-medium">
                        {keyword}
                      </span>
                      <div className="h-5 flex-1 overflow-hidden rounded bg-hairline">
                        <div
                          className="flex h-full items-center justify-end rounded bg-accent px-2"
                          style={{ width: `${(count / maxGap) * 100}%` }}
                        >
                          <span className="font-mono text-[10px] font-bold text-ink">
                            {count}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ---------- source health ---------- */}
            <section className="panel p-6">
              <h2 className="display mb-1.5 text-2xl">Source health</h2>
              <p className="mb-6 max-w-[64ch] text-sm leading-relaxed text-paper/65">
                Companies migrate between applicant tracking systems, and a board
                that starts returning 404 would otherwise just look like
                &ldquo;fewer jobs than usual&rdquo;.
              </p>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {[...bySource.entries()].map(([source, stat]) => {
                  const total = stat.ok + stat.failed;
                  const rate = total ? Math.round((stat.ok / total) * 100) : 0;
                  return (
                    <div key={source} className="panel panel-raised p-3.5">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-sm font-bold capitalize">
                          {source}
                        </span>
                        <span
                          className="font-mono text-xs font-bold"
                          style={{
                            color:
                              rate === 100
                                ? "rgb(var(--c-good))"
                                : rate >= 60
                                  ? "rgb(var(--c-warn))"
                                  : "rgb(var(--c-bad))",
                          }}
                        >
                          {rate}%
                        </span>
                      </div>
                      <p className="text-[11px] text-muted">
                        {stat.ok} ok · {stat.failed} failed
                      </p>
                      {stat.lastError && (
                        <p className="mt-1.5 line-clamp-2 font-mono text-[10px] text-bad">
                          {stat.lastError}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="panel p-5">
      <p className="label-mono mb-1.5">{label}</p>
      <p className={`display text-4xl ${accent ? "text-accent" : ""}`}>
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
