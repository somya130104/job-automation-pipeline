import { getCurrentUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";
import { runDigest } from "@/lib/digest/run";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/digest/run
 *
 * Two callers:
 *   - the GitHub Actions cron, carrying `Authorization: Bearer $CRON_SECRET`
 *   - a signed-in user hitting "Send me a test digest" in Settings
 *
 * Origin for the deep links in the email: the forwarded host in production,
 * or APP_ORIGIN, or the request origin.
 */
export const POST = route(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const viaCron = Boolean(secret && authHeader === `Bearer ${secret}`);

  if (!viaCron) {
    const user = await getCurrentUser();
    if (!user) {
      return fail("Sign in, or send the CRON_SECRET bearer token.", 401);
    }
  }

  const origin =
    process.env.APP_ORIGIN?.replace(/\/$/, "") ||
    (() => {
      const proto = req.headers.get("x-forwarded-proto") ?? "http";
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      return host ? `${proto}://${host}` : new URL(req.url).origin;
    })();

  const summary = await runDigest(origin);
  return ok(summary);
});
