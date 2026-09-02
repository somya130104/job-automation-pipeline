import { getCurrentUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";
import { parseHiringThread } from "@/lib/sources/hn";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/sources/hn — parse the current month's "Ask HN: Who is hiring?"
 * thread with Gemini, caching each comment by id. CRON_SECRET or signed-in.
 */
export const POST = route(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const viaCron = Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
  if (!viaCron) {
    const user = await getCurrentUser();
    if (!user) return fail("Sign in or send CRON_SECRET.", 401);
  }
  const limit = Number(new URL(req.url).searchParams.get("limit")) || 120;
  const summary = await parseHiringThread(limit);
  return ok(summary);
});
