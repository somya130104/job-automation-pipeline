"use client";

import { useEffect } from "react";
import Link from "next/link";
import { captureError } from "@/lib/observability";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void captureError(error, { scope: "app-error-boundary", digest: error.digest });
  }, [error]);

  return (
    <main className="grain hero-wash relative flex min-h-[100svh] flex-col items-center justify-center px-4 text-center">
      <div className="relative z-10">
        <p className="label-mono mb-4 !text-accent">Something broke</p>
        <h1 className="display display-outlined text-[clamp(2.5rem,9vw,6rem)]">
          Utha le re baba.
        </h1>
        <p className="mx-auto mt-6 max-w-[44ch] text-sm leading-relaxed text-paper/70">
          An unexpected error hit this page. It&apos;s been logged. Try again, or
          head back to the feed.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button onClick={reset} className="btn btn-primary">
            Try again
          </button>
          <Link href="/dashboard" className="btn btn-ghost">
            Back to the feed
          </Link>
        </div>
      </div>
    </main>
  );
}
