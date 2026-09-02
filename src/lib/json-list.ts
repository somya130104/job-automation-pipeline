/**
 * SQLite has no array columns, so list-shaped fields are stored as JSON text.
 * These helpers are the only place that encoding is allowed to leak.
 */

export function readList<T = string>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function writeList<T>(value: T[] | null | undefined): string {
  return JSON.stringify(value ?? []);
}
