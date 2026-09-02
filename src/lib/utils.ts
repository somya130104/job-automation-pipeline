import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "3 days ago", "just now" — compact enough for a dense card. */
export function timeAgo(date: Date | string): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - then.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const units: Array<[string, number]> = [
    ["y", 31_536_000],
    ["mo", 2_592_000],
    ["w", 604_800],
    ["d", 86_400],
    ["h", 3600],
    ["m", 60],
  ];
  for (const [label, secs] of units) {
    const value = Math.floor(seconds / secs);
    if (value >= 1) return `${value}${label} ago`;
  }
  return "just now";
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  INR: "₹",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "A$",
  SGD: "S$",
};

/** "$120K – $180K". Compact because it lives on a dense card. */
export function formatComp(
  min: number | null,
  max: number | null,
  currency: string | null,
): string | null {
  if (!min && !max) return null;
  const symbol = CURRENCY_SYMBOLS[currency ?? "USD"] ?? `${currency ?? ""} `;
  const short = (n: number) =>
    n >= 1_00_00_000
      ? `${(n / 1_00_00_000).toFixed(1).replace(/\.0$/, "")}Cr`
      : n >= 1_00_000 && currency === "INR"
        ? `${(n / 1_00_000).toFixed(1).replace(/\.0$/, "")}L`
        : n >= 1000
          ? `${Math.round(n / 1000)}K`
          : String(n);

  if (min && max) return `${symbol}${short(min)} – ${symbol}${short(max)}`;
  const single = (min ?? max) as number;
  return `${symbol}${short(single)}${min ? "+" : ""}`;
}

export const STATUS_ORDER = [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
] as const;

export type ApplicationStatus = (typeof STATUS_ORDER)[number] | "ghosted";

export const STATUS_META: Record<
  string,
  { label: string; stamp: string; tone: string }
> = {
  saved: { label: "Saved", stamp: "ON DECK", tone: "muted" },
  applied: { label: "Applied", stamp: "SENT", tone: "accent" },
  interviewing: { label: "Interviewing", stamp: "IN PLAY", tone: "good" },
  offer: { label: "Offer", stamp: "OFFER!", tone: "good" },
  rejected: { label: "Rejected / Ghosted", stamp: "CLOSED", tone: "bad" },
  ghosted: { label: "Ghosted", stamp: "GHOSTED", tone: "bad" },
};
