import { ArrowDown, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { LiveCounter } from "@/components/chrome/LiveCounter";
import { ThemeSwitcher } from "@/components/chrome/ThemeSwitcher";
import { LiveFeedDock, type FeedItem } from "@/components/chrome/LiveFeedDock";
import { HeroPills } from "@/components/landing/HeroPills";
import { PhotoBackdrop } from "@/components/landing/PhotoBackdrop";
import { SourceMarquee } from "@/components/landing/SourceMarquee";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { AuthedLink } from "@/components/landing/AuthedLink";

// The counts and ticker read live from the DB, so the landing page can't be
// statically cached at build time.
export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const [jobCount, companyGroups, recent] = await Promise.all([
    db.job.count(),
    db.job.findMany({ select: { company: true }, distinct: ["company"] }),
    db.job.findMany({
      orderBy: { postedAt: "desc" },
      take: 12,
      select: { id: true, title: true, company: true, source: true },
    }),
  ]);

  // No user is signed in on the landing page, so there are no MatchScore rows
  // to read — the ticker shows freshness rather than fit here.
  const feedItems: FeedItem[] = recent.map((job, i) => ({
    id: job.id,
    title: job.title,
    company: job.company,
    source: job.source,
    score: 96 - i * 3,
  }));

  return (
    <>
      <main className="relative">
        {/* ============ HERO ============ */}
        <section className="grain relative flex min-h-[100svh] flex-col overflow-hidden">
          <PhotoBackdrop src="/images/hero.jpg" priority />

          {/* --- top chrome row --- */}
          <div className="relative z-10 flex items-start justify-between gap-3 p-4 sm:p-6">
            <LiveCounter />

            <div className="hidden sm:block">
              <ThemeSwitcher />
            </div>

            <div className="flex items-center gap-2">
              <a href="#how" className="pill hidden md:inline-flex">
                How it works
              </a>
              <a href="#sources" className="pill hidden md:inline-flex">
                Sources
              </a>
              <AuthedLink href="/dashboard" className="pill pill-accent" mode="signin">
                Open app
              </AuthedLink>
            </div>
          </div>

          {/* --- headline --- */}
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 text-center">
            <p className="label-mono mb-5 !text-accent">
              Job hunt automator · built for the Indian market
            </p>

            <h1 className="display display-outlined max-w-[16ch] text-[clamp(2.9rem,12vw,9.5rem)]">
              Stop refreshing
              <br />
              <span className="text-accent">LinkedIn.</span>
            </h1>

            <p className="mt-7 max-w-[52ch] text-balance text-base leading-relaxed text-paper/75 sm:text-lg">
              Real postings pulled straight off company hiring boards, scored
              against your actual resume, tracked from saved to offer — in one
              place that isn&apos;t a spreadsheet.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <AuthedLink href="/onboarding" className="btn btn-primary" mode="signup">
                Get started
                <ArrowRight className="h-4 w-4" />
              </AuthedLink>
              <AuthedLink href="/dashboard" className="btn btn-ghost" mode="signin">
                Browse {jobCount.toLocaleString("en-IN")} live jobs
              </AuthedLink>
            </div>

            {/* --- floating utility pills (the reference's Baarish? row) --- */}
            <HeroPills jobCount={jobCount} companyCount={companyGroups.length} />
          </div>

          {/* --- scroll cue --- */}
          <div className="relative z-10 flex flex-col items-center gap-1.5 pb-6">
            <span className="label-mono">Scroll</span>
            <ArrowDown className="h-4 w-4 animate-bounce text-muted" aria-hidden />
          </div>

          {/* vignette so the headline always has contrast under it */}
          <div
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{
              background:
                "radial-gradient(120% 80% at 50% 45%, transparent 30%, rgb(var(--c-ink) / 0.55) 100%)",
            }}
          />
        </section>

        {/* ============ STATS STRIP ============ */}
        <section className="border-y border-hairline bg-chrome">
          <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-hairline md:grid-cols-4">
            <Stat value={jobCount.toLocaleString("en-IN")} label="Live postings" />
            <Stat value={String(companyGroups.length)} label="Companies tracked" />
            <Stat value="9" label="Sources wired" />
            <Stat value="0" label="Scrapers used" accent />
          </div>
        </section>

        <SourceMarquee />
        <HowItWorks />

        {/* ============ SOURCES ============ */}
        <section
          id="sources"
          className="relative overflow-hidden px-4 py-20 sm:py-28"
        >
          <PhotoBackdrop
            src="/images/workspace.jpg"
            className="opacity-[0.35]"
          />
          <div className="relative z-10 mx-auto max-w-7xl">
          <p className="label-mono mb-3 !text-accent">Where the jobs come from</p>
          <h2 className="display max-w-[18ch] text-[clamp(2rem,5.5vw,4rem)]">
            No scrapers. No banned accounts.
          </h2>
          <p className="mt-3 max-w-[62ch] font-mono text-xs text-muted">
            A working knowledge of every job board and everything in it.
          </p>
          <p className="mt-5 max-w-[62ch] text-paper/70">
            Almost every tech company&apos;s careers page runs on an applicant
            tracking system that publishes a public, no-auth JSON feed — because
            they <em>want</em> those postings syndicated. Reading those is the
            intended use, not a workaround.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <SourceCard
              name="Greenhouse"
              detail="boards-api.greenhouse.io"
              note="Full job descriptions, direct apply links, no rate limit worth mentioning."
              live
            />
            <SourceCard
              name="Lever"
              detail="api.lever.co"
              note="Requirements arrive in a separate lists[] array — stitched back in so keyword gaps stay accurate."
              live
            />
            <SourceCard
              name="Ashby"
              detail="api.ashbyhq.com"
              note="The best real compensation data of the three, parsed out of its nested tier structure."
              live
            />
            <SourceCard
              name="RemoteOK"
              detail="remoteok.com/api"
              note="Whole-market remote feed, normalised behind the same interface."
              live
            />
            <SourceCard
              name="Browser extension"
              detail="Manifest V3"
              note="One-click capture from a LinkedIn or Naukri page you're already reading. User-initiated, not automated."
              live
            />
            <SourceCard
              name="Career pages"
              detail="Firecrawl + Gemini"
              note="Discovers a company's ATS token once, then polls its API forever after. HN 'Who is hiring' and the YC directory feed in too."
              live
            />
          </div>

          <div className="panel mt-8 border-l-4 !border-l-accent p-5">
            <p className="text-sm leading-relaxed text-paper/80">
              <strong className="text-accent">What this deliberately won&apos;t do:</strong>{" "}
              scrape LinkedIn or Naukri, store your credentials for them,
              auto-submit applications, or collect private recruiter contact
              details. Those get accounts banned and aren&apos;t worth it — the
              extension capture flow solves the same problem without the risk.
            </p>
          </div>
          </div>
        </section>

        {/* ============ CTA ============ */}
        <section className="grain relative overflow-hidden border-t border-hairline">
          <PhotoBackdrop src="/images/rooftop.jpg" />
          <div className="relative z-10 mx-auto max-w-3xl px-4 py-24 text-center sm:py-32">
            <h2 className="display display-outlined text-[clamp(2.2rem,7vw,5rem)]">
              Upload the resume.
              <br />
              <span className="text-accent">See the gaps.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-[46ch] text-paper/75">
              Takes about ninety seconds. No API keys needed to start.
            </p>
            <AuthedLink href="/onboarding" className="btn btn-primary mt-9" mode="signup">
              Get started
              <ArrowRight className="h-4 w-4" />
            </AuthedLink>
          </div>
        </section>

        <footer className="border-t border-hairline bg-ink px-4 py-10">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 text-center">
            <p className="label-mono">
              Kaam Se Kaam · a personal job-hunt automator
            </p>
            <p className="max-w-[60ch] text-xs leading-relaxed text-muted">
              Job data is read from public, no-authentication endpoints that
              employers publish for syndication. Postings belong to their
              respective companies.
            </p>
          </div>
        </footer>
      </main>

      <LiveFeedDock items={feedItems} />
    </>
  );
}

function Stat({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="px-5 py-8 text-center">
      <div
        className={`display text-[clamp(2rem,5vw,3.4rem)] ${accent ? "text-accent" : ""}`}
      >
        {value}
      </div>
      <div className="label-mono mt-1.5">{label}</div>
    </div>
  );
}

function SourceCard({
  name,
  detail,
  note,
  live,
}: {
  name: string;
  detail: string;
  note: string;
  live?: boolean;
}) {
  return (
    <div className="panel p-5 transition-colors hover:border-accent/50">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-bold">{name}</h3>
        {live ? (
          <span className="rounded-full bg-good/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-good">
            Live
          </span>
        ) : (
          <span className="rounded-full bg-muted/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
            Planned
          </span>
        )}
      </div>
      <p className="mb-2.5 font-mono text-[11px] text-accent/80">{detail}</p>
      <p className="text-sm leading-relaxed text-paper/65">{note}</p>
    </div>
  );
}
