import { NextResponse } from "next/server";
import { UnauthorizedError } from "./auth";
import { captureError } from "./observability";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, extra?: object) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * Wraps a route handler so thrown errors become clean JSON instead of Next's
 * HTML error page — an API client parsing that HTML as JSON is a confusing
 * failure to debug.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return fail("You need to be signed in.", 401);
      }
      const message = err instanceof Error ? err.message : "Unexpected error";
      void captureError(err, { scope: "api" });
      return fail(message, 500);
    }
  };
}

/** Reads a JSON body, tolerating an empty one. */
export async function readJson<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

/** Trim + drop empties from a user-supplied list of strings. */
export function cleanStringList(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, max);
}

export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
