"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Info, Loader2, ShieldCheck } from "lucide-react";
import { TagInput } from "@/components/ui/TagInput";

interface Props {
  initial: {
    targetRoles: string[];
    targetLocations: string[];
    experienceYears: number;
    roleType: "fulltime" | "internship";
    remoteOnly: boolean;
    digestFrequency: string;
    matchThreshold: number;
  };
  resumes: Array<{
    id: string;
    label: string;
    fileName: string;
    isPrimary: boolean;
    atsScore: number;
    skillCount: number;
    createdAt: string;
  }>;
  authMode: "clerk" | "local";
}

export function SettingsForm({ initial, resumes, authMode }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );

  async function sendTest() {
    setTestBusy(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/digest/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (data.sent > 0) {
        setTestResult({ ok: true, msg: `Sent — check your inbox (${data.results[0]?.jobs ?? 0} jobs).` });
      } else if (data.failed > 0) {
        setTestResult({ ok: false, msg: data.results[0]?.error ?? "Send failed." });
      } else {
        setTestResult({
          ok: true,
          msg: "No new matches above your threshold right now — nothing to send (that's the suppression rule working).",
        });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        msg: err instanceof Error ? err.message : "Failed",
      });
    } finally {
      setTestBusy(false);
    }
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {authMode === "local" && (
        <div className="panel flex items-start gap-3 border-l-4 !border-l-accent p-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-xs leading-relaxed text-paper/75">
            Running in <strong>local single-user mode</strong> — no login wall.
            Add <code className="font-mono text-accent">CLERK_SECRET_KEY</code>{" "}
            and{" "}
            <code className="font-mono text-accent">
              NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
            </code>{" "}
            to <code className="font-mono">.env</code> and real multi-user auth
            takes over automatically, with no code change.
          </p>
        </div>
      )}

      <Section title="Targeting" hint="Changing any of these rescores your whole feed.">
        <Field label="Looking for">
          <div className="flex gap-2">
            {(["fulltime", "internship"] as const).map((t) => (
              <button
                key={t}
                onClick={() => set("roleType", t)}
                className={`flex-1 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-colors ${
                  form.roleType === t
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-hairline text-paper/60 hover:border-paper/30"
                }`}
              >
                {t === "fulltime" ? "Full-time" : "Internships"}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Target roles">
          <TagInput
            value={form.targetRoles}
            onChange={(v) => set("targetRoles", v)}
            placeholder="Frontend Engineer…"
          />
        </Field>

        <Field label="Target locations">
          <TagInput
            value={form.targetLocations}
            onChange={(v) => set("targetLocations", v)}
            placeholder="Bengaluru, Remote…"
          />
        </Field>

        <Field label={`Years of experience: ${form.experienceYears}`}>
          <input
            type="range"
            min={0}
            max={20}
            step={0.5}
            value={form.experienceYears}
            onChange={(e) => set("experienceYears", Number(e.target.value))}
            className="w-full accent-[rgb(var(--c-accent))]"
          />
        </Field>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-hairline p-3.5 transition-colors hover:border-paper/25">
          <input
            type="checkbox"
            checked={form.remoteOnly}
            onChange={(e) => set("remoteOnly", e.target.checked)}
            className="h-4 w-4 accent-[rgb(var(--c-accent))]"
          />
          <span className="text-sm font-medium">Remote roles only</span>
        </label>
      </Section>

      <Section title="Digest">
        <Field label="Frequency">
          <div className="flex gap-2">
            {[
              { id: "daily", label: "Daily" },
              { id: "weekdays", label: "Weekdays" },
              { id: "off", label: "Off" },
            ].map((o) => (
              <button
                key={o.id}
                onClick={() => set("digestFrequency", o.id)}
                className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition-colors ${
                  form.digestFrequency === o.id
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-hairline text-paper/60 hover:border-paper/30"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Sent every morning at 8:00 IST by a GitHub Actions cron. Nothing is
            sent on a day with zero new matches. One-click unsubscribe is in
            every email footer.
          </p>
        </Field>

        <Field label={`Only include matches scoring ${form.matchThreshold}+`}>
          <input
            type="range"
            min={0}
            max={95}
            step={5}
            value={form.matchThreshold}
            onChange={(e) => set("matchThreshold", Number(e.target.value))}
            className="w-full accent-[rgb(var(--c-accent))]"
          />
        </Field>

        <div>
          <button
            onClick={sendTest}
            disabled={testBusy || authMode === "local"}
            className="btn btn-ghost !py-2 text-xs"
          >
            {testBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {testBusy ? "Sending…" : "Send me a test digest now"}
          </button>
          {authMode === "local" && (
            <p className="mt-1.5 text-[11px] text-muted">
              Sign in with Clerk first so there&apos;s a verified address to send to.
            </p>
          )}
          {testResult && (
            <p
              className={`mt-1.5 text-[11px] ${
                testResult.ok ? "text-good" : "text-bad"
              }`}
            >
              {testResult.msg}
            </p>
          )}
        </div>
      </Section>

      <Section title="Resumes">
        {resumes.length === 0 ? (
          <p className="text-sm text-muted">Nothing uploaded yet.</p>
        ) : (
          <ul className="space-y-2">
            {resumes.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-xl border border-hairline bg-raised p-3.5"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {r.fileName}
                    {r.isPrimary && (
                      <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                        PRIMARY
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted">
                    ATS {r.atsScore} · {r.skillCount} skills ·{" "}
                    {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <a href="/onboarding" className="btn btn-ghost mt-3 !py-2 text-xs">
          Upload another
        </a>
      </Section>

      {error && (
        <p className="rounded-xl border-2 border-bad/40 bg-bad/10 p-3.5 text-sm text-bad">
          {error}
        </p>
      )}

      <div className="sticky bottom-4 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="btn btn-primary">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Saving & rescoring…" : "Save changes"}
        </button>
        {busy && (
          <span className="font-mono text-xs italic text-muted">
            Change is never fine. They say it is, but it&apos;s not.
          </span>
        )}
        {saved && (
          <span className="flex items-center gap-1.5 text-sm font-bold text-good">
            <Check className="h-4 w-4" />
            Saved — feed rescored
          </span>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-6">
      <h2 className="display mb-1 text-xl">{title}</h2>
      {hint && <p className="mb-5 text-xs text-muted">{hint}</p>}
      <div className={hint ? "space-y-5" : "mt-5 space-y-5"}>{children}</div>
    </section>
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
    <div>
      <p className="label-mono mb-2.5">{label}</p>
      {children}
    </div>
  );
}
