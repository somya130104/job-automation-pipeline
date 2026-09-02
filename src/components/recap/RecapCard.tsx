"use client";

import type { WeeklyRecap } from "@/lib/recap";

/**
 * The shareable weekly-recap card. Deliberately self-contained styling (no
 * external chrome) so a screenshot crops clean. Amber-on-near-black, the
 * "stamped / approved" motif from the tracker cards.
 */
export function RecapCard({
  recap,
  userName,
}: {
  recap: WeeklyRecap;
  userName: string | null;
}) {
  const week = new Date(recap.weekStart).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });

  const tiles: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: "Applied", value: String(recap.applied), accent: true },
    { label: "Saved", value: String(recap.saved) },
    { label: "Interviews", value: String(recap.interviews) },
    {
      label: "Response rate",
      value: recap.responseRate === null ? "—" : `${recap.responseRate}%`,
    },
    {
      label: "Avg reply time",
      value: recap.avgResponseDays === null ? "—" : `${recap.avgResponseDays}d`,
    },
    { label: "Streak", value: `${recap.streak}🔥` },
  ];

  return (
    <div className="overflow-hidden rounded-3xl border-2 border-ink bg-ink shadow-hard">
      <div className="grain hero-wash p-7">
        <div className="flex items-center justify-between">
          <span className="display text-lg tracking-tight text-accent">
            Kaam Se Kaam
          </span>
          <span className="label-mono">week of {week}</span>
        </div>

        <p className="display mt-6 text-[clamp(2rem,7vw,3.25rem)] leading-[0.95]">
          {recap.applied > 0 ? (
            <>
              {recap.applied} application
              {recap.applied === 1 ? "" : "s"}
              <br />
              <span className="text-accent">sent this week.</span>
            </>
          ) : (
            <>
              Quiet week.
              <br />
              <span className="text-accent">Next one won&apos;t be.</span>
            </>
          )}
        </p>

        <div className="mt-7 grid grid-cols-3 gap-2.5">
          {tiles.map((t) => (
            <div
              key={t.label}
              className="rounded-xl border border-hairline bg-ink/60 p-3 backdrop-blur"
            >
              <p className="label-mono !text-[9px]">{t.label}</p>
              <p
                className={`display text-2xl ${t.accent ? "text-accent" : ""}`}
              >
                {t.value}
              </p>
            </div>
          ))}
        </div>

        {recap.topMissingKeyword && (
          <p className="mt-5 text-xs text-paper/70">
            Most-asked skill I&apos;m still missing:{" "}
            <span className="font-bold text-paper">
              {recap.topMissingKeyword}
            </span>
          </p>
        )}

        {recap.newBadges.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {recap.newBadges.map((b) => (
              <span
                key={b.slug}
                className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-bold text-accent"
              >
                {b.emoji} {b.label}
              </span>
            ))}
          </div>
        )}

        <p className="mt-6 font-mono text-[10px] text-muted">
          {userName ? `${userName} · ` : ""}
          {recap.appliedAllTime} applications all-time
        </p>
      </div>
    </div>
  );
}
