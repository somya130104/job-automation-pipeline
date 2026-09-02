import type { Config } from "tailwindcss";

/**
 * Every colour resolves through a CSS variable so the theme switcher can swap
 * whole skins by flipping `data-theme` on <html> (see globals.css).
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        chrome: "rgb(var(--c-chrome) / <alpha-value>)",
        raised: "rgb(var(--c-raised) / <alpha-value>)",
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        "accent-deep": "rgb(var(--c-accent-deep) / <alpha-value>)",
        paper: "rgb(var(--c-paper) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        hairline: "rgb(var(--c-hairline) / <alpha-value>)",
        good: "rgb(var(--c-good) / <alpha-value>)",
        warn: "rgb(var(--c-warn) / <alpha-value>)",
        bad: "rgb(var(--c-bad) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Impact", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        // Hard offset shadows — the retro/print motif, no blur.
        hard: "4px 4px 0 0 rgb(var(--c-ink))",
        "hard-lg": "7px 7px 0 0 rgb(var(--c-ink))",
        "hard-accent": "4px 4px 0 0 rgb(var(--c-accent))",
        glass: "0 8px 32px -8px rgb(0 0 0 / 0.6)",
      },
      keyframes: {
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.82)" },
        },
        "stamp-in": {
          "0%": { opacity: "0", transform: "scale(1.6) rotate(-18deg)" },
          "60%": { opacity: "1", transform: "scale(0.94) rotate(-11deg)" },
          "100%": { opacity: "1", transform: "scale(1) rotate(-11deg)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        ticker: "ticker var(--ticker-duration, 40s) linear infinite",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        "stamp-in": "stamp-in 420ms cubic-bezier(.2,.9,.3,1.4) both",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
