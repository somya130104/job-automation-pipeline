import { scoreBand } from "@/lib/matching/weights";

/**
 * Circular score gauge. Pure SVG (no chart library) — it's one arc, and
 * inlining it keeps it crisp at every size and themeable via CSS vars.
 */
export function ScoreRing({
  score,
  size = 56,
  label,
  showBand = false,
}: {
  score: number;
  size?: number;
  label?: string;
  showBand?: boolean;
}) {
  const stroke = size >= 70 ? 6 : 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * circumference;

  const band = scoreBand(clamped);
  const color = `rgb(var(--c-${band.tone}))`;

  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          // Start the arc at 12 o'clock instead of 3 o'clock.
          className="-rotate-90"
          role="img"
          aria-label={`Match score ${clamped} out of 100`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgb(var(--c-hairline))"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            className="transition-[stroke-dasharray] duration-500"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span
            className="display leading-none"
            style={{ fontSize: size * 0.34, color }}
          >
            {clamped}
          </span>
        </div>
      </div>

      {(label || showBand) && (
        <div className="min-w-0">
          {label && <p className="label-mono !text-[10px]">{label}</p>}
          {showBand && (
            <p className="text-xs font-bold" style={{ color }}>
              {band.label}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Horizontal bar used for the individual sub-scores in the breakdown. */
export function ScoreBar({
  label,
  value,
  weight,
}: {
  label: string;
  value: number;
  weight?: number;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-paper/75">{label}</span>
        <span className="font-mono text-xs tabular-nums text-accent">
          {value}
          {weight !== undefined && (
            <span className="ml-1 text-muted">
              ×{weight.toFixed(2)}
            </span>
          )}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-hairline">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}
