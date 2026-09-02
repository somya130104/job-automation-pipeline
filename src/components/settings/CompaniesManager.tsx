"use client";

import { useState } from "react";
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

const STATUS_TONE: Record<string, string> = {
  resolved: "text-good",
  pending: "text-muted",
  none: "text-warn",
  error: "text-bad",
};

export function CompaniesManager({ initial }: { initial: Company[] }) {
  const [companies, setCompanies] = useState(initial);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crawling, setCrawling] = useState<string | null>(null);
  const [ycBusy, setYcBusy] = useState(false);

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
      alert(
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
    try {
      const res = await fetch("/api/sources/yc?limit=10", { method: "POST" });
      const data = await res.json();
      alert(
        res.ok
          ? `YC: tracked ${data.newlyTracked} new, resolved ${data.resolved} ATS tokens (of ${data.considered} recent-batch companies).`
          : data.error,
      );
      const list = await fetch("/api/companies").then((r) => r.json());
      setCompanies(list.companies ?? companies);
    } finally {
      setYcBusy(false);
    }
  }

  return (
    <section className="panel p-6">
      <h2 className="display mb-1 text-xl">Followed companies</h2>
      <p className="mb-5 text-xs text-muted">
        We resolve each company&apos;s ATS once (Greenhouse / Lever / Ashby /
        SmartRecruiters / Recruitee / Workable), then poll its public API on
        every ingest — no repeat scraping. Companies with no detectable ATS can
        be crawled via Firecrawl (markdown only, 1 credit/page).
      </p>

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

      <button onClick={syncYc} disabled={ycBusy} className="btn btn-ghost mb-4 !py-2 text-xs">
        {ycBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {ycBusy ? "Syncing…" : "Pull recent Y Combinator batches"}
      </button>

      {error && <p className="mb-3 text-xs text-bad">{error}</p>}

      {companies.length === 0 ? (
        <p className="text-sm text-muted">Not following any companies yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {companies.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-xl border border-hairline bg-raised p-3"
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
                  {c.discoveryStatus === "resolved"
                    ? `${c.atsType} · ${c.atsToken}`
                    : c.discoveryStatus === "none"
                      ? "no ATS detected — crawlable"
                      : c.discoveryStatus}
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
