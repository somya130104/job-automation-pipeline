import { SearchX } from "lucide-react";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel mt-6 flex flex-col items-center gap-3 p-14 text-center">
      <SearchX className="h-9 w-9 text-muted" aria-hidden />
      <h3 className="display text-xl">{title}</h3>
      <p className="max-w-[42ch] text-sm leading-relaxed text-paper/60">{body}</p>
      {action}
    </div>
  );
}
