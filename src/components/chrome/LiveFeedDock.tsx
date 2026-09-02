"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play, Radio, X } from "lucide-react";

export interface FeedItem {
  id: string;
  title: string;
  company: string;
  score: number;
  source: string;
}

const ADVANCE_MS = 5000;

/**
 * The docked bottom-left widget that occupies the reference's mini music
 * player slot — same shape, same real estate, but it ticks through your
 * latest matches instead of a playlist.
 */
export function LiveFeedDock({ items }: { items: FeedItem[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [progress, setProgress] = useState(0);

  // A ref, not state: the RAF loop reads it every frame and we don't want the
  // loop torn down and rebuilt on each tick.
  const startedAt = useRef<number>(Date.now());

  const count = items.length;

  const go = useCallback(
    (delta: number) => {
      if (count === 0) return;
      setIndex((i) => (i + delta + count) % count);
      startedAt.current = Date.now();
      setProgress(0);
    },
    [count],
  );

  useEffect(() => {
    if (!playing || count === 0 || dismissed) return;

    let frame = 0;
    const loop = () => {
      const elapsed = Date.now() - startedAt.current;
      const pct = Math.min(1, elapsed / ADVANCE_MS);
      setProgress(pct);
      if (pct >= 1) {
        setIndex((i) => (i + 1) % count);
        startedAt.current = Date.now();
        setProgress(0);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing, count, dismissed]);

  // Pausing should freeze the bar where it is, not reset it, so remember how
  // far in we were and rebase the clock when play resumes.
  const togglePlay = () => {
    setPlaying((p) => {
      if (p) return false;
      startedAt.current = Date.now() - progress * ADVANCE_MS;
      return true;
    });
  };

  const current = useMemo(() => items[index], [items, index]);

  if (dismissed || count === 0 || !current) return null;

  return (
    <motion.aside
      initial={{ y: 90, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.7, type: "spring", stiffness: 180, damping: 22 }}
      className="fixed bottom-4 left-4 z-40 hidden w-[340px] md:block"
      aria-label="Live match feed"
    >
      <div
        className="relative overflow-hidden rounded-2xl border p-3"
        style={{
          background: "rgb(var(--c-ink) / 0.72)",
          borderColor: "rgb(255 255 255 / 0.13)",
          backdropFilter: "blur(16px) saturate(1.3)",
          WebkitBackdropFilter: "blur(16px) saturate(1.3)",
          boxShadow: "0 12px 40px -10px rgb(0 0 0 / 0.8)",
        }}
      >
        <div className="mb-2 flex items-center gap-2">
          <Radio className="h-3 w-3 text-accent" aria-hidden />
          <span className="label-mono !text-[10px] text-accent">Live feed</span>
          <span className="label-mono !text-[10px] ml-auto tabular-nums">
            {index + 1}/{count}
          </span>
          <button
            onClick={() => setDismissed(true)}
            className="rounded p-0.5 text-muted transition-colors hover:text-paper"
            aria-label="Dismiss live feed"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Score tile stands in for the reference's album art. */}
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border-2 border-ink bg-accent">
            <span className="display text-xl leading-none text-ink">
              {current.score}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
              >
                <Link
                  href={`/dashboard?job=${current.id}`}
                  className="block truncate text-sm font-bold leading-tight hover:text-accent"
                  title={current.title}
                >
                  {current.title}
                </Link>
                <p className="truncate text-xs text-muted">
                  {current.company} · {current.source}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => go(-1)}
              className="grid h-7 w-7 place-items-center rounded-full text-paper/70 transition-colors hover:bg-white/10 hover:text-paper"
              aria-label="Previous match"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={togglePlay}
              className="grid h-9 w-9 place-items-center rounded-full bg-accent text-ink transition-transform hover:scale-105"
              aria-label={playing ? "Pause feed" : "Play feed"}
            >
              {playing ? (
                <Pause className="h-4 w-4" fill="currentColor" />
              ) : (
                <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
              )}
            </button>
            <button
              onClick={() => go(1)}
              className="grid h-7 w-7 place-items-center rounded-full text-paper/70 transition-colors hover:bg-white/10 hover:text-paper"
              aria-label="Next match"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Playback-style progress bar. */}
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </motion.aside>
  );
}
