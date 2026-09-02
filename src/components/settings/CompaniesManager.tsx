"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

interface Company {
  id: string;
  name: string;
  website: string | null;
  atsType: string | null;
  atsToken: string | null;
  discoveryStatus: string;
  ycBatch: string | null;
}

/** Plain-language explanation of each discovery state, shown under the name. */
const STATUS_LABEL: Record<string, string> = {
  resolved: "Live — polled for openings every refresh",
  pending: "Not checked yet — hit “Resolve pending”",
  none: "No job board found — use “Crawl” to read the careers page",
  error: "Couldn’t reach the site — “Resolve pending” retries it",
};

const STATUS_TONE: Record<string, string> = {
  resolved: "text-good",
  pending: "text-muted",
  none: "text-warn",
  error: "text-bad",
};

/** Sort order for the list: live first, then work still to do. */
const STATUS_RANK: Record<string, number> = {
  resolved: 0,
  none: 1,
  pending: 2,
  error: 3,
};

export function CompaniesManager({ initial }: { initial: Company[] }) {
  const [companies, setCompanies] = useState(initial);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crawling, setCrawling] = useState<string | null>(null);
  const [ycBusy, setYcBusy] = useState(false);
  const [resolveBusy, setResolveBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { resolved: 0, none: 0, pending: 0, error: 0 };
    for (const co of companies) {
      if (co.discoveryStatus in c) c[co.discoveryStatus as keyof typeof c]++;
    }
    return c;
  }, [companies]);

  const sorted = useMemo(
    () =>
      [...companies].sort(
        (a, b) =>
          (STATUS_RANK[a.discoveryStatus] ?? 9) -
            (STATUS_RANK[b.discoveryStatus] ?? 9) ||
          a.name.localeCompare(b.name),
      ),
    [companies],
  );

  const pendingCount = counts.pending + counts.error;

  async function refreshList() {
    const list = await fetch("/api/companies").then((r) => r.json());
    if (list.companies) setCompanies(list.companies);
  }

  async function add() {
    if (!name.trim() || !website.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, website }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setCompanies((c) => [data.company, ...c]);
      setName("");
      setWebsite("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/companies?id=${id}`, { method: "DELETE" });
    setCompanies((c) => c.filter((x) => x.id !== id));
  }

  async function crawl(id: string) {
    setCrawling(id);
    try {
      const res = await fetch(`/api/sources/crawl?id=${id}`, { method: "POST" });
      const data = await res.json();
      setNote(
        res.ok
          ? `${data.company}: ${data.created} new, ${data.unchanged} unchanged, ${data.creditsUsed} Firecrawl credits.`
          : data.error,
      );
    } finally {
      setCrawling(null);
    }
  }

  async function syncYc() {
    setYcBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/sources/yc?limit=15", { method: "POST" });
      const data = await res.json();
      setNote(
        res.ok
          ? `Tracked ${data.newlyTracked} new companies, resolved ${data.resolved} job boards (of ${data.considered} recent-batch companies). Run “Resolve pending” to work through the rest.`
          : data.error,
      );
      await refreshList();
    } finally {
      setYcBusy(false);
    }
  }

  async function resolvePending() {
    setResolveBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/sources/yc?mode=resolve&limit=40", {
        method: "POST",
      });
      const data = await res.json();
      setNote(
        res.ok
          ? `Checked ${data.attempted}: ${data.resolved} now live, ${data.none} have no job board, ${data.errors} unreachable. ${data.remaining} still queued.`
          : data.error,
      );
      await refreshList();
    } finally {
      setResolveBusy(false);
    }
  }

  return (
    <section className="panel p-6">
      <h2 className="display mb-1 text-xl">Followed companies</h2>
      <p className="mb-4 text-xs text-muted">
        For each company we find its job board once (Greenhouse / Lever / Ashby /
        SmartRecruiters / Recruitee / Workable), then read that board&apos;s
        public feed on every refresh — the company&apos;s site is never scraped
        again. Companies with no detectable board can be read once via Firecrawl
        (careers page → Markdown, 1 credit/page).
      </p>

      {/* summary bar */}
      <div className="mb-4 flex flex-wrap gap-2 text-[11px] font-bold">
        <span
          className="rounded-md bg-good/15 px-2 py-1 text-good"
          title="Job board found. These are polled for new openings on every feed refresh."
        >
          {counts.resolved} live
        </span>
        <span
          className="rounded-md bg-warn/15 px-2 py-1 text-warn"
          title="No standard job board detected. Use the Crawl button to read the careers page directly."
        >
          {counts.none} need crawl
        </span>
        <span
          className="rounded-md bg-white/5 px-2 py-1 text-muted"
          title="Tracked but not yet checked. Resolve pending works through these in batches of 40."
        >
          {counts.pending} unchecked
        </span>
        {counts.error > 0 && (
          <span
            className="rounded-md bg-bad/15 px-2 py-1 text-bad"
            title="The site didn't respond last time. Resolve pending retries them."
          >
            {counts.error} unreachable
          </span>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Company name"
          className="input flex-1"
        />
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://company.com"
          className="input flex-1"
        />
        <button onClick={add} disabled={busy} className="btn btn-primary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Follow
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button onClick={syncYc} disabled={ycBusy} className="btn btn-ghost !py-2 text-xs">
          {ycBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {ycBusy ? "Syncing…" : "Pull recent Y Combinator batches"}
        </button>
        {pendingCount > 0 && (
          <button
            onClick={resolvePending}
            disabled={resolveBusy}
            className="btn btn-ghost !py-2 text-xs"
          >
            {resolveBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {resolveBusy ? "Checking…" : `Resolve pending (${pendingCount})`}
          </button>
        )}
      </div>

      {error && <p className="mb-3 text-xs text-bad">{error}</p>}
      {note && (
        <p className="mb-3 rounded-lg border border-hairline bg-raised p-2.5 text-[11px] leading-relaxed text-paper/75">
          {note}
        </p>
      )}

      {companies.length === 0 ? (
        <p className="text-sm text-muted">Not following any companies yet.</p>
      ) : (
        <ul className="max-h-[420px] space-y-1.5 overflow-y-auto rounded-xl border border-hairline bg-ink/40 p-2">
          {sorted.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-lg border border-hairline bg-raised p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {c.name}
                  {c.ycBatch && (
                    <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                      YC {c.ycBatch}
                    </span>
                  )}
                </p>
                <p className={`text-[11px] ${STATUS_TONE[c.discoveryStatus] ?? "text-muted"}`}>
                  {c.discoveryStatus === "resolved" && c.atsType
                    ? `Live — ${c.atsType} board`
                    : STATUS_LABEL[c.discoveryStatus] ?? c.discoveryStatus}
                </p>
              </div>
              {c.discoveryStatus === "none" && (
                <button
                  onClick={() => crawl(c.id)}
                  disabled={crawling === c.id}
                  className="btn btn-ghost !py-1.5 text-[11px]"
                >
                  {crawling === c.id ? "Crawling…" : "Crawl"}
                </button>
              )}
              <button
                onClick={() => remove(c.id)}
                className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-bad"
                aria-label={`Unfollow ${c.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
