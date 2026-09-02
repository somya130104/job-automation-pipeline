"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, Search, SlidersHorizontal, X } from "lucide-react";

const REMOTE = [
  { id: "all", label: "Anywhere" },
  { id: "remote", label: "Remote" },
  { id: "hybrid", label: "Hybrid" },
  { id: "onsite", label: "Onsite" },
];

const TYPES = [
  { id: "all", label: "All roles" },
  { id: "fulltime", label: "Full-time" },
  { id: "internship", label: "Internship" },
  { id: "contract", label: "Contract" },
];

const SORTS = [
  { id: "score", label: "Best match" },
  { id: "recent", label: "Newest" },
];

export function FeedFilters({
  sources,
}: {
  sources: Array<{ id: string; count: number }>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState(params.get("q") ?? "");

  const get = (key: string, fallback = "all") => params.get(key) ?? fallback;

  function apply(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === "all" || value === "") next.delete(key);
      else next.set(key, value);
    }
    // Any filter change invalidates the current page offset.
    next.delete("page");
    next.delete("job");
    startTransition(() => router.push(`/dashboard?${next}`));
  }

  // Debounce the search box so typing doesn't fire a query per keystroke.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (query === current) return;
    const timer = setTimeout(() => apply({ q: query || null }), 350);
    return () => clearTimeout(timer);
    // `params` intentionally omitted: including it re-runs the debounce on
    // every navigation and immediately re-applies a stale query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const minScore = Number(params.get("min")) || 0;
  const activeCount = ["source", "remote", "type", "min"].filter((k) =>
    params.get(k),
  ).length;

  return (
    <div className="panel p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or company…"
            className="input !py-2 pl-9"
            aria-label="Search jobs"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-paper"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Select
          value={get("sort", "score")}
          options={SORTS}
          onChange={(v) => apply({ sort: v === "score" ? null : v })}
          label="Sort"
        />

        <button
          onClick={() => setExpanded((v) => !v)}
          className={`pill !py-2 ${expanded || activeCount ? "!border-accent/60 !text-accent" : ""}`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-ink">
              {activeCount}
            </span>
          )}
        </button>

        {pending && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
      </div>

      {expanded && (
        <div className="mt-4 grid gap-4 border-t border-hairline pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <Group label="Location type">
            <Chips
              options={REMOTE}
              active={get("remote")}
              onPick={(v) => apply({ remote: v })}
            />
          </Group>

          <Group label="Role type">
            <Chips
              options={TYPES}
              active={get("type")}
              onPick={(v) => apply({ type: v })}
            />
          </Group>

          <Group label="Source">
            <Chips
              options={[
                { id: "all", label: "All" },
                ...sources.map((s) => ({
                  id: s.id,
                  label: `${s.id} (${s.count})`,
                })),
              ]}
              active={get("source")}
              onPick={(v) => apply({ source: v })}
            />
          </Group>

          <Group label={`Minimum score: ${minScore}`}>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              defaultValue={minScore}
              onMouseUp={(e) =>
                apply({ min: e.currentTarget.value === "0" ? null : e.currentTarget.value })
              }
              onTouchEnd={(e) =>
                apply({ min: e.currentTarget.value === "0" ? null : e.currentTarget.value })
              }
              className="w-full accent-[rgb(var(--c-accent))]"
            />
          </Group>

          {activeCount > 0 && (
            <button
              onClick={() =>
                apply({ source: null, remote: null, type: null, min: null })
              }
              className="btn btn-ghost !py-1.5 text-xs sm:col-span-2 lg:col-span-4"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label-mono mb-2">{label}</p>
      {children}
    </div>
  );
}

function Chips({
  options,
  active,
  onPick,
}: {
  options: Array<{ id: string; label: string }>;
  active: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onPick(o.id)}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
            active === o.id
              ? "border-accent bg-accent/15 text-accent"
              : "border-hairline text-paper/60 hover:border-paper/30 hover:text-paper"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Select({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="input !w-auto !py-2 cursor-pointer"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id} className="bg-chrome">
          {o.label}
        </option>
      ))}
    </select>
  );
}
