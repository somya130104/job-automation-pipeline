import { getCurrentUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";
import { syncYc } from "@/lib/sources/yc";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/sources/yc — pull the YC directory, track recent-batch companies,
 * run ATS discovery on a bounded number of them per call.
 * CRON_SECRET bearer OR a signed-in user.
 */
export const POST = route(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const viaCron = Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);

  const user = viaCron ? null : await getCurrentUser();
  if (!viaCron && !user) return fail("Sign in or send CRON_SECRET.", 401);

  const url = new URL(req.url);
  const recentBatches = Number(url.searchParams.get("batches")) || 8;
  const discoverLimit = Number(url.searchParams.get("limit")) || 12;

  // Cron path: sync for every onboarded user is overkill; sync for the first
  // user (single-tenant deploys) and let per-user calls handle the rest.
  const targetUserId =
    user?.id ??
    (await import("@/lib/db").then((m) =>
      m.db.user.findFirst({ where: { onboarded: true }, select: { id: true } }),
    ).then((u) => u?.id));

  if (!targetUserId) return fail("No onboarded user to attach companies to.");

  const summary = await syncYc(targetUserId, { recentBatches, discoverLimit });
  return ok(summary);
});
