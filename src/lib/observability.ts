/**
 * Error capture. If SENTRY_DSN is set we forward to Sentry via its HTTP
 * ingestion API (no SDK, no build plugin — keeps the bundle lean); otherwise
 * we log to the server console. Wired into the API `route()` wrapper and the
 * ingestion loop.
 *
 * To use the full @sentry/nextjs SDK instead (source maps, tracing, session
 * replay), install it and replace `captureError` — every call site already
 * funnels through here.
 */

function parseDsn(dsn: string) {
  // https://<publicKey>@<host>/<projectId>
  const m = /^https:\/\/([^@]+)@([^/]+)\/(.+)$/.exec(dsn.trim());
  if (!m) return null;
  return { publicKey: m[1], host: m[2], projectId: m[3] };
}

export async function captureError(
  err: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  const dsn = process.env.SENTRY_DSN?.trim();
  const parsed = dsn ? parseDsn(dsn) : null;

  if (!parsed) {
    console.error("[capture]", message, context, stack ?? "");
    return;
  }

  try {
    await fetch(
      `https://${parsed.host}/api/${parsed.projectId}/store/?sentry_key=${parsed.publicKey}&sentry_version=7`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          level: "error",
          platform: "node",
          timestamp: Date.now() / 1000,
          environment: process.env.NODE_ENV,
          extra: context,
          exception: stack
            ? { values: [{ type: "Error", value: message, stacktrace: { frames: [] } }] }
            : undefined,
        }),
      },
    );
  } catch {
    console.error("[capture:fallback]", message, context);
  }
}
