import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readList } from "@/lib/json-list";
import { AppNav } from "@/components/chrome/AppNav";
import { KanbanBoard, type TrackedApplication } from "@/components/tracker/KanbanBoard";
import { EmptyState } from "@/components/ui/EmptyState";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!user.onboarded) redirect("/onboarding");

  const applications = await db.application.findMany({
    where: { userId: user.id },
    orderBy: [{ boardOrder: "asc" }, { updatedAt: "desc" }],
    include: {
      job: {
        select: {
          id: true,
          title: true,
          company: true,
          applyUrl: true,
          locations: true,
          source: true,
        },
      },
    },
  });

  const scores = await db.matchScore.findMany({
    where: { userId: user.id, jobId: { in: applications.map((a) => a.jobId) } },
    select: { jobId: true, score: true },
  });
  const scoreByJob = new Map(scores.map((s) => [s.jobId, s.score]));

  const items: TrackedApplication[] = applications.map((a) => ({
    id: a.id,
    jobId: a.jobId,
    status: a.status,
    title: a.job.title,
    company: a.job.company,
    applyUrl: a.job.applyUrl,
    location: readList<string>(a.job.locations)[0] ?? null,
    score: scoreByJob.get(a.jobId) ?? 0,
    appliedAt: a.appliedAt?.toISOString() ?? null,
    followUpDate: a.followUpDate?.toISOString() ?? null,
    notes: a.notes,
    hasSnapshot: Boolean(a.jdSnapshot),
  }));

  // A follow-up is "due" once its date has passed and the application is still
  // sitting in `applied` — an interviewing role doesn't need a nudge.
  const dueCount = items.filter(
    (i) =>
      i.status === "applied" &&
      i.followUpDate &&
      new Date(i.followUpDate) <= new Date(),
  ).length;

  return (
    <>
      <AppNav />

      <main className="mx-auto max-w-[1600px] px-4 pb-32 pt-8">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-mono mb-1.5 !text-accent">Application tracker</p>
            <h1 className="display text-4xl sm:text-5xl">
              {items.length} in flight
            </h1>
          </div>

          {dueCount > 0 && (
            <div className="rounded-xl border-2 border-warn/40 bg-warn/10 px-4 py-2.5">
              <p className="text-sm font-bold text-warn">
                {dueCount} follow-up{dueCount > 1 ? "s" : ""} due
              </p>
              <p className="text-xs text-paper/60">
                No response after 7 days — worth a nudge.
              </p>
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <EmptyState
            title="Nothing tracked yet"
            body="Save or apply to a job from the feed and it lands here. Marking something applied also snapshots the job description, so you keep a copy even if the posting gets pulled."
            action={
              <Link href="/dashboard" className="btn btn-primary mt-2">
                Go to the feed
              </Link>
            }
          />
        ) : (
          <KanbanBoard initial={items} />
        )}
      </main>
    </>
  );
}
