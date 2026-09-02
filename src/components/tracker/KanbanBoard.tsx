"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlarmClock, ExternalLink, FileCheck2, GripVertical } from "lucide-react";
import { STATUS_META, timeAgo } from "@/lib/utils";

export interface TrackedApplication {
  id: string;
  jobId: string;
  status: string;
  title: string;
  company: string;
  applyUrl: string;
  location: string | null;
  score: number;
  appliedAt: string | null;
  followUpDate: string | null;
  notes: string;
  hasSnapshot: boolean;
}

const COLUMNS: Array<{ id: string; label: string; sub?: string }> = [
  { id: "saved", label: "Saved", sub: "That's my spot." },
  { id: "applied", label: "Applied" },
  { id: "interviewing", label: "Interviewing" },
  { id: "offer", label: "Offer", sub: "Mogambo khush hua." },
  { id: "rejected", label: "Rejected / Ghosted", sub: "We were on a break." },
];

export function KanbanBoard({ initial }: { initial: TrackedApplication[] }) {
  const [items, setItems] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);

  async function move(id: string, status: string) {
    const current = items.find((i) => i.id === id);
    if (!current || current.status === status) return;

    // Optimistic: the card moves immediately, then reverts if the write fails.
    const previous = items;
    setItems((list) =>
      list.map((i) => (i.id === id ? { ...i, status } : i)),
    );

    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Update failed");
    } catch {
      setItems(previous);
    }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-5">
      {COLUMNS.map((column) => {
        const columnItems = items.filter((i) =>
          column.id === "rejected"
            ? i.status === "rejected" || i.status === "ghosted"
            : i.status === column.id,
        );

        return (
          <section
            key={column.id}
            onDragOver={(e) => {
              e.preventDefault();
              setOverColumn(column.id);
            }}
            onDragLeave={() => setOverColumn((c) => (c === column.id ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              setOverColumn(null);
              if (dragging) move(dragging, column.id);
              setDragging(null);
            }}
            className={`panel flex min-h-[220px] flex-col p-2.5 transition-colors ${
              overColumn === column.id ? "!border-accent bg-accent/5" : ""
            }`}
            aria-label={column.label}
          >
            <header className="mb-2.5 px-1.5 pt-1">
              <div className="flex items-center justify-between">
                <h2 className="label-mono !text-[10px]">{column.label}</h2>
                <span className="rounded-full bg-hairline px-1.5 text-[10px] font-bold tabular-nums">
                  {columnItems.length}
                </span>
              </div>
              {column.sub && (
                <p className="mt-0.5 font-mono text-[9px] italic text-muted/70">
                  {column.sub}
                </p>
              )}
            </header>

            <div className="flex flex-1 flex-col gap-2">
              {columnItems.map((item) => (
                <Card
                  key={item.id}
                  item={item}
                  onDragStart={() => setDragging(item.id)}
                  onDragEnd={() => setDragging(null)}
                  onMove={move}
                  isDragging={dragging === item.id}
                />
              ))}

              {columnItems.length === 0 && (
                <p className="px-1.5 py-6 text-center text-[11px] text-muted">
                  Drop here
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Card({
  item,
  onDragStart,
  onDragEnd,
  onMove,
  isDragging,
}: {
  item: TrackedApplication;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (id: string, status: string) => void;
  isDragging: boolean;
}) {
  const stamp = STATUS_META[item.status];
  const followUpDue =
    item.status === "applied" &&
    item.followUpDate &&
    new Date(item.followUpDate) <= new Date();

  return (
    <motion.article
      layout
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group relative cursor-grab rounded-xl border bg-raised p-3 active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      } ${followUpDue ? "border-warn/50" : "border-hairline"}`}
    >
      <div className="mb-1.5 flex items-start gap-1.5">
        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted/50" aria-hidden />
        <h3 className="line-clamp-2 flex-1 text-xs font-bold leading-snug">
          {item.title}
        </h3>
        <span
          className="shrink-0 font-mono text-[11px] font-bold tabular-nums"
          style={{
            color:
              item.score >= 75
                ? "rgb(var(--c-good))"
                : item.score >= 55
                  ? "rgb(var(--c-warn))"
                  : "rgb(var(--c-muted))",
          }}
        >
          {item.score}
        </span>
      </div>

      <p className="mb-2 pl-5 text-[11px] text-muted">
        {item.company}
        {item.location && ` · ${item.location}`}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 pl-5">
        {item.hasSnapshot && (
          <span
            className="flex items-center gap-1 text-[10px] text-good"
            title="Job description snapshotted when you applied"
          >
            <FileCheck2 className="h-3 w-3" />
            Snapshot
          </span>
        )}
        {followUpDue && (
          <span
            className="flex items-center gap-1 text-[10px] font-bold text-warn"
            title="Knock, knock, knock. Day 7, still no reply."
          >
            <AlarmClock className="h-3 w-3" />
            Follow up
          </span>
        )}
        {item.appliedAt && (
          <span className="text-[10px] text-muted">
            {timeAgo(item.appliedAt)}
          </span>
        )}
      </div>

      {/* Keyboard/touch fallback — drag-and-drop alone would make the board
          unusable on a phone and inaccessible without a mouse. */}
      <div className="mt-2 flex items-center gap-1.5 pl-5">
        <select
          value={item.status}
          onChange={(e) => onMove(item.id, e.target.value)}
          aria-label={`Move ${item.title}`}
          className="flex-1 cursor-pointer rounded border border-hairline bg-ink/60 px-1.5 py-1 text-[10px] text-paper/70 outline-none focus:border-accent"
        >
          {["saved", "applied", "interviewing", "offer", "rejected", "ghosted"].map(
            (s) => (
              <option key={s} value={s} className="bg-chrome">
                {STATUS_META[s]?.label ?? s}
              </option>
            ),
          )}
        </select>
        <a
          href={item.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded p-1 text-muted transition-colors hover:text-accent"
          aria-label={`Open ${item.title} posting`}
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {stamp && (
        <span
          className="stamp absolute -right-1 -top-1.5 border-current opacity-0 transition-opacity group-hover:opacity-80"
          style={{
            color:
              stamp.tone === "good"
                ? "rgb(var(--c-good))"
                : stamp.tone === "bad"
                  ? "rgb(var(--c-bad))"
                  : stamp.tone === "accent"
                    ? "rgb(var(--c-accent))"
                    : "rgb(var(--c-muted))",
          }}
        >
          {stamp.stamp}
        </span>
      )}
    </motion.article>
  );
}
