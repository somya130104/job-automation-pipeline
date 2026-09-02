"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileUp,
  Info,
  Loader2,
  X,
} from "lucide-react";
import { TagInput } from "@/components/ui/TagInput";
import { ScoreRing } from "@/components/ui/ScoreRing";

interface Parsed {
  skills: string[];
  experience: Array<{ title: string; company: string; start: string | null; end: string | null; bullets: string[] }>;
  education: Array<{ school: string; degree: string | null; year: string | null }>;
  experienceYears: number;
  inferredRoles: string[];
}

interface AtsReport {
  score: number;
  issues: Array<{ severity: "critical" | "warning" | "info"; label: string; detail: string }>;
}

interface Props {
  initial: {
    targetRoles: string[];
    targetLocations: string[];
    experienceYears: number;
    roleType: "fulltime" | "internship";
    remoteOnly: boolean;
  };
}

const STEPS = ["Resume", "Confirm", "Targets"] as const;

export function OnboardingFlow({ initial }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [ats, setAts] = useState<AtsReport | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [roles, setRoles] = useState(initial.targetRoles);
  const [locations, setLocations] = useState(initial.targetLocations);
  const [years, setYears] = useState(initial.experienceYears);
  const [roleType, setRoleType] = useState(initial.roleType);
  const [remoteOnly, setRemoteOnly] = useState(initial.remoteOnly);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/resume", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");

      setParsed(data.parsed);
      setAts(data.ats);
      setFileName(file.name);
      setYears(data.suggestions.experienceYears || 0);
      // Only pre-fill roles if the user hasn't already set their own.
      if (roles.length === 0 && data.suggestions.targetRoles?.length) {
        setRoles(data.suggestions.targetRoles);
      }
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetRoles: roles,
          targetLocations: locations,
          experienceYears: years,
          roleType,
          remoteOnly,
          onboarded: true,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed.");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div>
      {/* --- progress --- */}
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                i < step
                  ? "border-good bg-good text-ink"
                  : i === step
                    ? "border-accent bg-accent text-ink"
                    : "border-hairline text-muted"
              }`}
            >
              {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={`label-mono !text-[10px] ${i === step ? "!text-accent" : ""}`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px flex-1 ${i < step ? "bg-good" : "bg-hairline"}`}
              />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border-2 border-bad/40 bg-bad/10 p-3.5 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X className="h-4 w-4 text-muted hover:text-paper" />
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ================= STEP 1: UPLOAD ================= */}
        {step === 0 && (
          <Panel key="upload">
            <h1 className="display mb-2 text-4xl">Drop your resume in.</h1>
            <p className="mb-7 text-sm leading-relaxed text-paper/65">
              PDF, DOCX or TXT. It gets parsed into skills, roles and education —
              and scored for whether an applicant tracking system can actually
              read it.
            </p>

            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="group flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-hairline p-10 transition-colors hover:border-accent disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
              ) : (
                <FileUp className="h-8 w-8 text-muted transition-colors group-hover:text-accent" />
              )}
              <span className="font-bold">
                {busy ? "Parsing…" : "Choose a file"}
              </span>
              <span className="text-xs text-muted">Max 8MB</span>
            </button>

            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
                // Reset so re-picking the same file still fires onChange.
                e.target.value = "";
              }}
            />

            <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Your resume is parsed locally by this app and stored in your own
              database. It is never sent to a third-party service.
            </p>
          </Panel>
        )}

        {/* ================= STEP 2: CONFIRM PARSE ================= */}
        {step === 1 && parsed && ats && (
          <Panel key="confirm">
            <h1 className="display mb-2 text-4xl">Here&apos;s what it read.</h1>
            <p className="mb-6 text-sm text-paper/65">
              From <span className="font-mono text-accent">{fileName}</span>. Fix
              anything it got wrong — these feed the match scores.
            </p>

            {/* ATS score */}
            <div className="panel panel-raised mb-6 flex items-center gap-5 p-5">
              <ScoreRing score={ats.score} size={72} label="ATS" />
              <div className="min-w-0 flex-1">
                <h3 className="mb-1 font-bold">ATS readability</h3>
                <p className="text-xs leading-relaxed text-paper/65">
                  {ats.issues.length === 0
                    ? "No parsing problems found. This resume should survive an automated screen intact."
                    : `${ats.issues.length} thing${ats.issues.length > 1 ? "s" : ""} worth fixing before you apply anywhere.`}
                </p>
              </div>
            </div>

            {ats.issues.length > 0 && (
              <ul className="mb-6 space-y-2">
                {ats.issues.map((issue) => (
                  <li
                    key={issue.label}
                    className="rounded-xl border-l-4 bg-chrome p-3.5"
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

            <Field label={`Skills found (${parsed.skills.length})`}>
              {parsed.skills.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {parsed.skills.map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">
                  None recognised — add a Skills section listing your tools by
                  name.
                </p>
              )}
            </Field>

            <Field label={`Roles found (${parsed.experience.length})`}>
              {parsed.experience.length ? (
                <ul className="space-y-2">
                  {parsed.experience.map((exp, i) => (
                    <li key={i} className="rounded-lg bg-ink/50 p-3 text-sm">
                      <span className="font-bold">{exp.title}</span>
                      {exp.company && (
                        <span className="text-muted"> · {exp.company}</span>
                      )}
                      {exp.start && (
                        <span className="ml-2 font-mono text-xs text-accent/70">
                          {exp.start} → {exp.end}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">
                  No dated roles detected. Check your Experience headings.
                </p>
              )}
            </Field>

            <Field label="Education">
              {parsed.education.length ? (
                <ul className="space-y-1.5 text-sm">
                  {parsed.education.map((ed, i) => (
                    <li key={i}>
                      <span className="font-bold">{ed.degree}</span>
                      <span className="text-muted"> · {ed.school}</span>
                      {ed.year && (
                        <span className="ml-1.5 font-mono text-xs text-accent/70">
                          {ed.year}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Nothing detected.</p>
              )}
            </Field>

            <Nav
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
              nextLabel="Looks right"
            />
          </Panel>
        )}

        {/* ================= STEP 3: TARGETS ================= */}
        {step === 2 && (
          <Panel key="targets">
            <h1 className="display mb-2 text-4xl">What are you after?</h1>
            <p className="mb-7 text-sm text-paper/65">
              This drives the ranking. Job titles matter most.
            </p>

            <Field label="Looking for">
              <div className="flex gap-2">
                {(["fulltime", "internship"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setRoleType(t)}
                    className={`flex-1 rounded-xl border-2 px-4 py-3 text-sm font-bold transition-colors ${
                      roleType === t
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-hairline text-paper/60 hover:border-paper/30"
                    }`}
                  >
                    {t === "fulltime" ? "Full-time roles" : "Internships"}
                  </button>
                ))}
              </div>
              {roleType === "internship" && (
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  Internship mode down-weights years-of-experience and leans on
                  skills instead, so projects and coursework count properly.
                </p>
              )}
            </Field>

            <Field label="Target roles">
              <TagInput
                value={roles}
                onChange={setRoles}
                placeholder="Frontend Engineer, Data Analyst…"
              />
            </Field>

            <Field label="Target locations">
              <TagInput
                value={locations}
                onChange={setLocations}
                placeholder="Bengaluru, Remote, India…"
              />
            </Field>

            <Field label={`Years of experience: ${years}`}>
              <input
                type="range"
                min={0}
                max={20}
                step={0.5}
                value={years}
                onChange={(e) => setYears(Number(e.target.value))}
                className="w-full accent-[rgb(var(--c-accent))]"
              />
            </Field>

            <label className="mb-6 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-hairline p-3.5 transition-colors hover:border-paper/25">
              <input
                type="checkbox"
                checked={remoteOnly}
                onChange={(e) => setRemoteOnly(e.target.checked)}
                className="h-4 w-4 accent-[rgb(var(--c-accent))]"
              />
              <span className="text-sm font-medium">Remote roles only</span>
            </label>

            <Nav
              onBack={() => setStep(1)}
              onNext={finish}
              nextLabel={busy ? "Scoring jobs…" : "Show me the jobs"}
              busy={busy}
            />
          </Panel>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.22 }}
      className="panel p-6 sm:p-8"
    >
      {children}
    </motion.div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <p className="label-mono mb-2.5">{label}</p>
      {children}
    </div>
  );
}

function Nav({
  onBack,
  onNext,
  nextLabel,
  busy,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  busy?: boolean;
}) {
  return (
    <div className="mt-8 flex items-center gap-3">
      <button onClick={onBack} className="btn btn-ghost" disabled={busy}>
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>
      <button onClick={onNext} className="btn btn-primary ml-auto" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {nextLabel}
        {!busy && <ArrowRight className="h-4 w-4" />}
      </button>
    </div>
  );
}
