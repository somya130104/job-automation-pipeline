"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Clipboard,
  ExternalLink,
  Loader2,
  MapPin,
  Users,
  X,
} from "lucide-react";
import { ScoreRing, ScoreBar } from "@/components/ui/ScoreRing";
import type { WeightProfile } from "@/lib/matching/weights";
import type { BulletSuggestion, OutreachDraft } from "@/lib/writing/drafts";
import { formatComp, timeAgo } from "@/lib/utils";

interface Props {
  job: {
    id: string;
    title: string;
    company: string;
    locations: string[];
    remoteType: string;
    employmentType: string;
    department: string | null;
    source: string;
    applyUrl: string;
    postedAt: string;
    descriptionText: string;
    compensationMin: number | null;
    compensationMax: number | null;
    compensationCurrency: string | null;
  };
  score: {
    total: number;
    semantic: number;
    keyword: number;
    title: number;
    experience: number;
    location: number;
    matched: string[];
    missing: string[];
  } | null;
  weights: WeightProfile;
  jd: { minYears: number | null; seniority: string; skillCount: number };
  scam: { risk: number; reasons: string[] } | null;
  salary: {
    what: string;
    where: string | null;
    mean: number | null;
    buckets: Array<{ floor: number; count: number }>;
  } | null;
  referralCompany: string;
  savedOutreach: { body: string; sentByUser: boolean } | null;
  application: {
    id: string;
    status: string;
    notes: string;
    prepNotes: string;
  } | null;
  bullets: BulletSuggestion[];
  outreach: OutreachDraft;
}

type Tab = "description" | "gaps" | "outreach";

export function JobDetailShell({
  job,
  score,
  weights,
  jd,
  scam,
  salary,
  referralCompany,
  savedOutreach,
  application,
  bullets,
  outreach,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("description");
  const [status, setStatus] = useState(application?.status ?? null);
  const [busy, setBusy] = useState(false);

  const close = () => router.push("/dashboard", { scroll: false });

  // Escape to close, and lock body scroll while the sheet is open so the page
  // behind doesn't scroll under it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setApplicationStatus(next: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: job.id, status: next }),
      });
      if (res.ok) {
        setStatus(next);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const comp = formatComp(
    job.compensationMin,
    job.compensationMax,
    job.compensationCurrency,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={close}
        className="absolute inset-0 bg-ink/85 backdrop-blur-sm"
        aria-hidden
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`${job.title} at ${job.company}`}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="panel relative z-10 flex max-h-[92svh] w-full max-w-4xl flex-col overflow-hidden !rounded-b-none sm:!rounded-b-2xl"
      >
        {/* ---------- header ---------- */}
        <div className="flex items-start gap-4 border-b border-hairline p-5">
          <div className="min-w-0 flex-1">
            <p className="label-mono mb-1.5 !text-accent">{job.source}</p>
            <h2 className="display text-2xl leading-tight sm:text-3xl">
              {job.title}
            </h2>
            <p className="mt-1.5 text-sm text-paper/70">
              {job.company}
              {job.department && (
                <span className="text-muted"> · {job.department}</span>
              )}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              {job.locations.length > 0 && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" aria-hidden />
                  {job.locations.slice(0, 3).join(" · ")}
                </span>
              )}
              <span className="capitalize">{job.remoteType}</span>
              <span>{timeAgo(job.postedAt)}</span>
              {comp && <span className="font-bold text-good">{comp}</span>}
            </div>
          </div>

          {score && <ScoreRing score={score.total} size={64} showBand />}

          <button
            onClick={close}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-paper"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {scam && scam.risk >= 25 && (
          <div
            className={`flex items-start gap-2.5 border-b px-5 py-3 text-xs leading-relaxed ${
              scam.risk >= 55
                ? "border-bad/40 bg-bad/10 text-bad"
                : "border-warn/40 bg-warn/10 text-warn"
            }`}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-bold">
                {scam.risk >= 55
                  ? "High scam-risk signals on this listing"
                  : "Some scam-risk signals on this listing"}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-paper/70">
                {scam.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ---------- tabs ---------- */}
        <div className="flex gap-1 border-b border-hairline px-5 pt-3">
          {(
            [
              ["description", "Description"],
              ["gaps", `Gaps${score ? ` (${score.missing.length})` : ""}`],
              ["outreach", "Outreach"],
            ] as Array<[Tab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-t-lg px-3.5 py-2 text-sm font-bold transition-colors ${
                tab === id
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted hover:text-paper"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ---------- body ---------- */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "description" && (
            <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
              <article className="whitespace-pre-wrap text-sm leading-relaxed text-paper/80">
                {job.descriptionText}
              </article>

              {score && (
                <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                  <div className="panel panel-raised p-4">
                    <p className="label-mono mb-3">Why this score</p>
                    <div className="space-y-3">
                      <ScoreBar
                        label="Semantic fit"
                        value={score.semantic}
                        weight={weights.semantic}
                      />
                      <ScoreBar
                        label="Keyword coverage"
                        value={score.keyword}
                        weight={weights.keyword}
                      />
                      <ScoreBar
                        label="Title relevance"
                        value={score.title}
                        weight={weights.title}
                      />
                      <ScoreBar
                        label="Experience fit"
                        value={score.experience}
                        weight={weights.experience}
                      />
                      <ScoreBar
                        label="Location fit"
                        value={score.location}
                        weight={weights.location}
                      />
                    </div>
                    <p className="mt-3.5 border-t border-hairline pt-3 text-[11px] leading-relaxed text-muted">
                      {jd.minYears !== null
                        ? `This posting asks for ${jd.minYears}+ years.`
                        : `No explicit experience bar stated; read as ${jd.seniority}-level.`}{" "}
                      {jd.skillCount} skills recognised in the JD.
                    </p>
                  </div>

                  {salary && salary.buckets.length > 0 && (
                    <SalaryPanel salary={salary} />
                  )}
                </aside>
              )}
            </div>
          )}

          {tab === "gaps" && score && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <KeywordList
                  title={`You have (${score.matched.length})`}
                  items={score.matched}
                  tone="good"
                  empty="No overlap found with your resume."
                />
                <KeywordList
                  title={`You're missing (${score.missing.length})`}
                  items={score.missing}
                  tone="bad"
                  empty="Nothing missing — you cover everything this JD names."
                />
              </div>

              {bullets.length > 0 && (
                <div>
                  <p className="label-mono mb-1">Suggested resume bullets</p>
                  <p className="mb-3.5 text-xs leading-relaxed text-muted">
                    Starting points, not replacements. Edit each one to describe
                    what you actually did — nothing here touches your saved
                    resume until you paste it in yourself.
                  </p>
                  <div className="space-y-2.5">
                    {bullets.map((b) => (
                      <BulletCard key={b.keyword} bullet={b} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "outreach" && (
            <div className="space-y-5">
              <ReferralChecklist company={referralCompany} />
              <OutreachPanel
                draft={outreach}
                jobId={job.id}
                saved={savedOutreach}
              />
            </div>
          )}
        </div>

        {/* ---------- footer actions ---------- */}
        <div className="flex flex-wrap items-center gap-2.5 border-t border-hairline bg-chrome p-4">
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            Apply on {job.company}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          {status !== "applied" ? (
            <button
              onClick={() => setApplicationStatus("applied")}
              disabled={busy}
              className="btn btn-ghost"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Mark applied
            </button>
          ) : (
            <span className="flex items-center gap-1.5 rounded-xl border-2 border-good/40 bg-good/10 px-3.5 py-2.5 text-sm font-bold text-good">
              <Check className="h-4 w-4" />
              Applied — JD snapshotted
            </span>
          )}

          {!status && (
            <button
              onClick={() => setApplicationStatus("saved")}
              disabled={busy}
              className="btn btn-ghost"
            >
              Save for later
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function KeywordList({
  title,
  items,
  tone,
  empty,
}: {
  title: string;
  items: string[];
  tone: "good" | "bad";
  empty: string;
}) {
  return (
    <div className="panel panel-raised p-4">
      <p className="label-mono mb-2.5">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((k) => (
            <span
              key={k}
              className={`rounded border px-2 py-0.5 text-xs font-medium ${
                tone === "good"
                  ? "border-good/25 bg-good/10 text-good"
                  : "border-bad/25 bg-bad/10 text-bad"
              }`}
            >
              {k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BulletCard({ bullet }: { bullet: BulletSuggestion }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="panel panel-raised p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-bad/15 px-1.5 py-0.5 text-[11px] font-bold text-bad">
          {bullet.keyword}
        </span>
        <CopyButton
          text={bullet.template}
          copied={copied}
          setCopied={setCopied}
        />
      </div>
      <p className="mb-2 font-mono text-xs leading-relaxed text-paper/85">
        {bullet.template}
      </p>
      <p className="text-[11px] leading-relaxed text-muted">{bullet.hint}</p>
    </div>
  );
}

function OutreachPanel({
  draft,
  jobId,
  saved,
}: {
  draft: OutreachDraft;
  jobId: string;
  saved: { body: string; sentByUser: boolean } | null;
}) {
  const [body, setBody] = useState(saved?.body ?? draft.body);
  const [copied, setCopied] = useState(false);
  const [sentByUser, setSentByUser] = useState(saved?.sentByUser ?? false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  async function persist(nextSent = sentByUser) {
    setSaveState("saving");
    await fetch("/api/outreach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobId,
        kind: "email",
        subject: draft.subject,
        body,
        sentByUser: nextSent,
      }),
    }).catch(() => {});
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 1500);
  }

  return (
    <div className="space-y-4">
      <div className="panel border-l-4 !border-l-accent p-3.5">
        <p className="text-xs leading-relaxed text-paper/75">
          This is a draft for <strong>you</strong> to send. The app never
          messages anyone on your behalf, and never scrapes recruiter contact
          details — find the right person yourself and send it from your own
          account.
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="label-mono">Subject</p>
        </div>
        <p className="input font-medium">{draft.subject}</p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="label-mono">Message</p>
          <CopyButton text={body} copied={copied} setCopied={setCopied} />
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          className="input resize-y font-mono text-xs leading-relaxed"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => persist()} className="btn btn-ghost !py-2 text-xs">
          {saveState === "saving"
            ? "Saving…"
            : saveState === "saved"
              ? "Saved"
              : "Save draft"}
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={sentByUser}
            onChange={(e) => {
              setSentByUser(e.target.checked);
              persist(e.target.checked);
            }}
            className="h-3.5 w-3.5 accent-[rgb(var(--c-accent))]"
          />
          I&apos;ve sent this myself
        </label>
      </div>
    </div>
  );
}

function CopyButton({
  text,
  copied,
  setCopied,
}: {
  text: string;
  copied: boolean;
  setCopied: (v: boolean) => void;
}) {
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard API needs a secure context; the textarea is still
          // selectable by hand, so fail quietly rather than alerting.
        }
      }}
      className="ml-auto flex items-center gap-1 text-[11px] font-bold text-muted transition-colors hover:text-accent"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" /> Copied
        </>
      ) : (
        <>
          <Clipboard className="h-3 w-3" /> Copy
        </>
      )}
    </button>
  );
}

function SalaryPanel({ salary }: { salary: NonNullable<Props["salary"]> }) {
  const max = Math.max(...salary.buckets.map((b) => b.count), 1);
  const fmt = (n: number) =>
    n >= 1e7
      ? `₹${(n / 1e7).toFixed(1)}Cr`
      : n >= 1e5
        ? `₹${Math.round(n / 1e5)}L`
        : `₹${Math.round(n / 1000)}k`;

  return (
    <div className="panel panel-raised p-4">
      <p className="label-mono mb-1">Salary reality check</p>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        Adzuna, &ldquo;{salary.what}&rdquo;
        {salary.where ? ` in ${salary.where}` : " (India)"}.
        {salary.mean ? ` Mean ~${fmt(salary.mean)}/yr.` : ""}
      </p>
      <div className="flex items-end gap-1" style={{ height: 72 }}>
        {salary.buckets.map((b) => (
          <div
            key={b.floor}
            className="w-full rounded-t bg-accent/70"
            style={{ height: `${(b.count / max) * 100}%`, minHeight: 2 }}
            title={`${fmt(b.floor)}+: ${b.count} postings`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-muted">
        <span>{fmt(salary.buckets[0].floor)}</span>
        <span>{fmt(salary.buckets[salary.buckets.length - 1].floor)}+</span>
      </div>
    </div>
  );
}

const REFERRAL_STEPS = [
  "Search your LinkedIn connections filtered to this company.",
  "Check for 2nd-degree connections via people you actually know.",
  "Look for alumni from your college or a past employer working here.",
  "Found someone? Ask for a referral, not just a chat — referrals skip the resume pile.",
  "No connection? Send the outreach note below to the hiring manager if the JD names one.",
];

function ReferralChecklist({ company }: { company: string }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  return (
    <div className="panel panel-raised p-4">
      <p className="label-mono mb-1 flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" /> Referral checklist
      </p>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        A referral into {company} beats a cold application. Your network
        isn&apos;t reachable through any API, so this is a manual two-minute
        pass every time you save a role.
      </p>
      <ul className="space-y-1.5">
        {REFERRAL_STEPS.map((step, i) => (
          <li key={i}>
            <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed">
              <input
                type="checkbox"
                checked={done.has(i)}
                onChange={(e) =>
                  setDone((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(i);
                    else next.delete(i);
                    return next;
                  })
                }
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[rgb(var(--c-accent))]"
              />
              <span
                className={
                  done.has(i) ? "text-muted line-through" : "text-paper/80"
                }
              >
                {step}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
