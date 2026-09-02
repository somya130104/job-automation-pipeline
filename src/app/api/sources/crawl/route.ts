import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, ok, route } from "@/lib/api";
import { crawlCareerPage } from "@/lib/sources/career-page";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/sources/crawl?id=<trackedCompanyId>
 * Crawl one followed company's careers page via Firecrawl (markdown only) and
 * extract postings with Gemini. Only for companies with no detectable ATS.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("id required.");

  const tc = await db.trackedCompany.findFirst({ where: { id, userId: user.id } });
  if (!tc) return fail("Not found.", 404);

  const result = await crawlCareerPage(id);
  return ok(result);
});
