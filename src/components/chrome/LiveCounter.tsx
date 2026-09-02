"use client";

import { useEffect, useState } from "react";

/**
 * The "1345 online" badge from the reference, reskinned as job seekers.
 *
 * The number is decorative ambience, not a claim about real users — it drifts
 * around a seed derived from the hour so it looks alive without pretending to
 * be telemetry we don't have. Seeded from the hour (not Math.random) so the
 * server and client agree on the first render and hydration stays clean.
 */
function seedForHour(): number {
  const now = new Date();
  const h = now.getUTCHours();
  const d = now.getUTCDate();
  // Job hunting peaks mid-morning and late evening; shape the curve a little.
  const wave = Math.sin(((h - 4) / 24) * Math.PI * 2) * 340;
  return Math.round(1180 + wave + ((d * 37) % 90));
}

export function LiveCounter() {
  const [count, setCount] = useState(seedForHour);

  useEffect(() => {
    const tick = setInterval(() => {
      setCount((c) => {
        const drift = Math.round((Math.random() - 0.45) * 7);
        // Keep it in a believable band rather than letting it wander off.
        return Math.min(2400, Math.max(600, c + drift));
      });
    }, 3200);
    return () => clearInterval(tick);
  }, []);

  return (
    <div
      className="pill"
      title={`Fun fact: ${count.toLocaleString("en-IN")} other people are on the job boards right now.`}
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-good" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
      </span>
      <span className="font-mono font-bold tabular-nums">
        {count.toLocaleString("en-IN")}
      </span>
      <span className="text-muted">hunting</span>
    </div>
  );
}
