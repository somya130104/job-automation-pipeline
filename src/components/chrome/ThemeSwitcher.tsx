"use client";

import { useEffect, useState } from "react";
import { Palette } from "lucide-react";
import { THEMES, THEME_STORAGE_KEY, type ThemeId } from "./ThemeScript";

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemeId>("midnight-amber");
  const [open, setOpen] = useState(false);

  // Read the value ThemeScript already applied, rather than re-applying it —
  // this keeps the button label in sync without a second paint.
  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current && THEMES.some((t) => t.id === current)) {
      setTheme(current as ThemeId);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-theme-switcher]")) {
        setOpen(false);
      }
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  function pick(id: ThemeId) {
    setTheme(id);
    document.documentElement.setAttribute("data-theme", id);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      // Storage can be unavailable (private mode); the theme still applies
      // for this session, it just won't persist.
    }
    setOpen(false);
  }

  return (
    <div className="relative" data-theme-switcher>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pill"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Palette className="h-3.5 w-3.5" aria-hidden />
        {compact ? "Theme" : "Change Theme"}
      </button>

      {open && (
        <div
          role="listbox"
          className="panel panel-raised absolute right-0 top-[calc(100%+8px)] z-50 w-52 overflow-hidden p-1.5 shadow-glass"
        >
          {THEMES.map((t) => (
            <button
              key={t.id}
              role="option"
              aria-selected={theme === t.id}
              onClick={() => pick(t.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                theme === t.id
                  ? "bg-accent/15 text-accent"
                  : "text-paper/80 hover:bg-paper/5"
              }`}
            >
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/25"
                style={{ background: t.swatch }}
              />
              {t.label}
              {theme === t.id && <span className="ml-auto text-xs">●</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
