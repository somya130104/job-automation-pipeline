"use client";

import { useState } from "react";
import { X } from "lucide-react";

/**
 * Chip-style multi-value input. Commits on Enter or comma; Backspace on an
 * empty field removes the last chip (the behaviour people expect from every
 * other tag field).
 */
export function TagInput({
  value,
  onChange,
  placeholder,
  max = 12,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const next = raw.trim().replace(/,$/, "");
    if (!next) return;
    // Case-insensitive dedupe so "remote" and "Remote" don't both land.
    if (value.some((v) => v.toLowerCase() === next.toLowerCase())) {
      setDraft("");
      return;
    }
    if (value.length >= max) return;
    onChange([...value, next]);
    setDraft("");
  }

  return (
    <div className="input flex flex-wrap items-center gap-1.5 !py-2">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-accent/15 py-1 pl-2.5 pr-1 text-xs font-medium text-accent"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((v) => v !== tag))}
            className="rounded-full p-0.5 hover:bg-accent/25"
            aria-label={`Remove ${tag}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      <input
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) commit(v);
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        // Losing focus with uncommitted text silently drops it otherwise.
        onBlur={() => commit(draft)}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[9ch] flex-1 bg-transparent text-sm outline-none placeholder:text-muted/75"
      />
    </div>
  );
}
