import { SearchX } from "lucide-react";

export function EmptyState({
  title,
  body,
  quip,
  action,
}: {
  title: string;
  body: string;
  /** A small italic aside above the title — used for the "The one where…" bits. */
  quip?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel mt-6 flex flex-col items-center gap-3 p-14 text-center">
      <SearchX className="h-9 w-9 text-muted" aria-hidden />
      {quip && (
        <p className="font-mono text-xs italic text-muted/70">{quip}</p>
      )}
      <h3 className="display text-xl">{title}</h3>
      <p className="max-w-[46ch] text-sm leading-relaxed text-paper/60">{body}</p>
      {action}
    </div>
  );
}
