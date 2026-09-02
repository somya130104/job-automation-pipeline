import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readList } from "@/lib/json-list";
import { AppNav } from "@/components/chrome/AppNav";
import { LiveFeedDock, type FeedItem } from "@/components/chrome/LiveFeedDock";
import { FeedFilters } from "@/components/dashboard/FeedFilters";
import { JobCard, type JobCardData } from "@/components/dashboard/JobCard";
import { JobDetailSheet } from "@/components/dashboard/JobDetailSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { RefreshJobsButton } from "@/components/dashboard/RefreshJobsButton";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

interface SearchParams {
  q?: string;
  source?: string;
  remote?: string;
  type?: string;
  min?: string;
  sort?: string;
  page?: string;
  job?: string;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!user.onboarded) redirect("/onboarding");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const minScore = Math.max(0, Math.min(100, Number(sp.min) || 0));
  const sort = sp.sort === "recent" ? "recent" : "score";

  // Filters are applied on the Job relation of MatchScore, so paging and
  // ordering both happen in SQL rather than by loading every row into memory.
  const jobWhere: Prisma.JobWhereInput = {};

  if (sp.q?.trim()) {
    const q = sp.q.trim();
    // SQLite's LIKE is case-insensitive for ASCII, which is what `contains`
    // compiles to here — Prisma's `mode: "insensitive"` is Postgres-only.
    jobWhere.OR = [
      { title: { contains: q } },
      { company: { contains: q } },
    ];
  }
  if (sp.source && sp.source !== "all") jobWhere.source = sp.source;
  if (sp.remote && sp.remote !== "all") jobWhere.remoteType = sp.remote;
  if (sp.type && sp.type !== "all") jobWhere.employmentType = sp.type;

  const where: Prisma.MatchScoreWhereInput = {
    userId: user.id,
    score: { gte: minScore },
    job: jobWhere,
  };

  const [total, rows, applications, tickerRows, sourceGroups] =
    await Promise.all([
      db.matchScore.count({ where }),
      db.matchScore.findMany({
        where,
        orderBy:
          sort === "recent"
            ? { job: { postedAt: "desc" } }
            : [{ score: "desc" }, { job: { postedAt: "desc" } }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { job: true },
      }),
      db.application.findMany({
        where: { userId: user.id },
        select: { jobId: true, status: true },
      }),
      db.matchScore.findMany({
        where: { userId: user.id },
        orderBy: { score: "desc" },
        take: 12,
        include: { job: { select: { id: true, title: true, company: true, source: true } } },
      }),
      db.job.groupBy({ by: ["source"], _count: true }),
    ]);

  const statusByJob = new Map(applications.map((a) => [a.jobId, a.status]));

  const cards: JobCardData[] = rows.map(({ job, ...score }) => ({
    id: job.id,
    title: job.title,
    company: job.company,
    source: job.source,
    locations: readList<string>(job.locations),
    remoteType: job.remoteType,
    employmentType: job.employmentType,
    postedAt: job.postedAt.toISOString(),
    applyUrl: job.applyUrl,
    compensationMin: job.compensationMin,
    compensationMax: job.compensationMax,
    compensationCurrency: job.compensationCurrency,
    score: score.score,
    applicationDeadline: job.applicationDeadline?.toISOString() ?? null,
    scamRisk: job.scamRisk,
    matchedKeywords: readList<string>(score.matchedKeywords),
    missingKeywords: readList<string>(score.missingKeywords),
    status: statusByJob.get(job.id) ?? null,
  }));

  const tickerItems: FeedItem[] = tickerRows.map((r) => ({
    id: r.job.id,
    title: r.job.title,
    company: r.job.company,
    source: r.job.source,
    score: r.score,
  }));

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <AppNav />

      <main className="mx-auto max-w-7xl px-4 pb-32 pt-8">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-mono mb-1.5 !text-accent">Your feed</p>
            <h1 className="display text-4xl sm:text-5xl">
              {total.toLocaleString("en-IN")} match
              {total === 1 ? "" : "es"}
            </h1>
            {user.streakCount > 0 && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-accent">
                🔥 {user.streakCount} day streak
              </p>
            )}
          </div>
          <RefreshJobsButton />
        </div>

        <FeedFilters
          sources={sourceGroups.map((g) => ({
            id: g.source,
            count: g._count,
          }))}
        />

        {cards.length === 0 ? (
          <EmptyState
            title="Nothing matches those filters"
            body={
              total === 0 && minScore > 0
                ? "Try lowering the minimum score — your current floor is filtering everything out."
                : "Loosen a filter, or pull a fresh batch of postings from the boards."
            }
          />
        ) : (
          <div className="mt-6 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card, i) => (
              <JobCard key={card.id} job={card} index={i} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} params={sp} />
        )}
      </main>

      {sp.job && <JobDetailSheet jobId={sp.job} userId={user.id} />}
      <LiveFeedDock items={tickerItems} />
    </>
  );
}

function Pagination({
  page,
  totalPages,
  params,
}: {
  page: number;
  totalPages: number;
  params: SearchParams;
}) {
  const build = (n: number) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v && k !== "page" && k !== "job") next.set(k, String(v));
    }
    next.set("page", String(n));
    return `/dashboard?${next}`;
  };

  return (
    <nav className="mt-10 flex items-center justify-center gap-3">
      {page > 1 && (
        <a href={build(page - 1)} className="btn btn-ghost">
          Previous
        </a>
      )}
      <span className="label-mono">
        Page {page} of {totalPages}
      </span>
      {page < totalPages && (
        <a href={build(page + 1)} className="btn btn-ghost">
          Next
        </a>
      )}
    </nav>
  );
}
