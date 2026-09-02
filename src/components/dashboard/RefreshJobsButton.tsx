"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

export function RefreshJobsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/ingest", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ingest failed");

      const failed = (data.targets ?? []).filter(
        (t: { ok: boolean }) => !t.ok,
      ).length;
      setResult(
        `${data.created} new` + (failed ? ` · ${failed} board(s) failed` : ""),
      );
      router.refresh();
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2.5">
      {result && <span className="label-mono !text-accent">{result}</span>}
      <button onClick={run} disabled={busy} className="btn btn-ghost">
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {busy ? "Polling boards…" : "Refresh jobs"}
      </button>
    </div>
  );
}
