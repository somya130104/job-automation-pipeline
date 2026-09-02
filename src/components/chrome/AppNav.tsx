"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, KanbanSquare, Sparkles, Settings, Share2 } from "lucide-react";
import { LiveCounter } from "./LiveCounter";
import { NavAuth } from "./NavAuth";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Feed", icon: LayoutGrid },
  { href: "/tracker", label: "Tracker", icon: KanbanSquare },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/recap", label: "Recap", icon: Share2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-hairline/60 bg-ink/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link href="/dashboard" className="group flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg border-2 border-ink bg-accent shadow-hard">
            <span className="display text-base leading-none text-ink">K</span>
          </span>
          <span className="display hidden text-lg tracking-tight sm:block">
            Kaam Se Kaam
          </span>
        </Link>

        <nav className="ml-2 flex items-center gap-1 overflow-x-auto no-scrollbar">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                  active
                    ? "bg-accent text-ink"
                    : "text-paper/70 hover:bg-white/5 hover:text-paper",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden lg:block">
            <LiveCounter />
          </div>
          <NavAuth />
        </div>
      </div>
    </header>
  );
}
