"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Building2, MapPin, Wifi } from "lucide-react";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { STATUS_META, formatComp, timeAgo } from "@/lib/utils";

export interface JobCardData {
  id: string;
  title: string;
  company: string;
  source: string;
  locations: string[];
  remoteType: string;
  employmentType: string;
  postedAt: string;
  applyUrl: string;
  compensationMin: number | null;
  compensationMax: number | null;
  compensationCurrency: string | null;
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  status: string | null;
  applicationDeadline: string | null;
  scamRisk: number;
}

/** Whole days until a deadline; negative once it's passed. */
function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

const SOURCE_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  recruitee: "Recruitee",
  workable: "Workable",
  remoteok: "RemoteOK",
  remotive: "Remotive",
  arbeitnow: "Arbeitnow",
  adzuna: "Adzuna",
  hn: "HN Who's Hiring",
  yc: "Y Combinator",
  career_page: "Career page",
  capture: "Captured",
  manual: "Manual",
};

export function JobCard({ job, index }: { job: JobCardData; index: number }) {
  const comp = formatComp(
    job.compensationMin,
    job.compensationMax,
    job.compensationCurrency,
  );
  const status = job.status ? STATUS_META[job.status] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      // Cap the stagger so the last card in a 24-item page doesn't wait 2s.
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.4) }}
    >
      <Link
        href={`/dashboard?job=${job.id}`}
        scroll={false}
        className="panel group relative flex h-full flex-col p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-glass"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 font-bold leading-snug transition-colors group-hover:text-accent">
              {job.title}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-paper/70">
              <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{job.company}</span>
            </p>
            {job.score < 35 && (
              <p className="mt-1 font-mono text-[10px] italic text-muted/70">
                Could this BE any more of a stretch?
              </p>
            )}
          </div>
          <ScoreRing score={job.score} size={48} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
          {job.locations.length > 0 && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              <span className="max-w-[18ch] truncate">{job.locations[0]}</span>
              {job.locations.length > 1 && (
                <span className="text-muted/70">+{job.locations.length - 1}</span>
              )}
            </span>
          )}
          {job.remoteType === "remote" && (
            <span className="flex items-center gap-1 text-good">
              <Wifi className="h-3 w-3" aria-hidden />
              Remote
            </span>
          )}
          {job.remoteType === "hybrid" && <span>Hybrid</span>}
          {job.employmentType === "internship" && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 font-bold text-accent">
              Internship
            </span>
          )}
          {job.applicationDeadline &&
            (() => {
              const d = daysUntil(job.applicationDeadline);
              if (d < 0 || d > 14) return null;
              return (
                <span
                  className={`rounded px-1.5 py-0.5 font-bold ${
                    d <= 3
                      ? "bg-bad/15 text-bad"
                      : "bg-warn/15 text-warn"
                  }`}
                >
                  {d === 0 ? "Closes today" : `Closes in ${d}d`}
                </span>
              );
            })()}
          {job.scamRisk >= 55 && (
            <span className="rounded bg-bad/15 px-1.5 py-0.5 font-bold text-bad">
              ⚠ Scam risk
            </span>
          )}
        </div>

        {comp && (
          <p className="mt-2.5 font-mono text-sm font-bold text-good">{comp}</p>
        )}

        {job.matchedKeywords.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {job.matchedKeywords.slice(0, 4).map((k) => (
              <span
                key={k}
                className="rounded border border-good/25 bg-good/10 px-1.5 py-0.5 text-[11px] font-medium text-good"
              >
                {k}
              </span>
            ))}
            {job.missingKeywords.slice(0, 2).map((k) => (
              <span
                key={k}
                className="rounded border border-bad/25 bg-bad/10 px-1.5 py-0.5 text-[11px] font-medium text-bad line-through decoration-bad/50"
                title="Missing from your resume"
              >
                {k}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center gap-2 pt-3.5">
          <span className="label-mono !text-[10px]">
            {SOURCE_LABEL[job.source] ?? job.source}
          </span>
          <span className="text-[11px] text-muted">{timeAgo(job.postedAt)}</span>

          {/* The stamp lives in the footer rather than the top-right corner:
              the score ring already owns that corner and the two collided. */}
          {status && (
            <span
              className="stamp ml-auto border-current"
              style={{
                color:
                  status.tone === "good"
                    ? "rgb(var(--c-good))"
                    : status.tone === "bad"
                      ? "rgb(var(--c-bad))"
                      : status.tone === "accent"
                        ? "rgb(var(--c-accent))"
                        : "rgb(var(--c-muted))",
              }}
            >
              {status.stamp}
            </span>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
