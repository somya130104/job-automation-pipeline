import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, ok, readJson, route } from "@/lib/api";
import { discoverAts } from "@/lib/sources/discovery";

export const runtime = "nodejs";
export const maxDuration = 120;

/** GET -> the user's tracked companies. */
export const GET = route(async () => {
  const user = await requireUser();
  const companies = await db.trackedCompany.findMany({
    where: { userId: user.id },
    orderBy: [{ discoveryStatus: "asc" }, { name: "asc" }],
  });
  return ok({ companies });
});

interface Body {
  name: string;
  website: string;
  careersUrl?: string;
}

/**
 * POST -> follow a company. Immediately runs ATS-token discovery (plain fetch
 * first, one Firecrawl markdown scrape as fallback) so a resolved company
 * starts getting polled on the next ingest with zero further scraping.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const b = await readJson<Body>(req);
  const name = b.name?.trim();
  const website = b.website?.trim();
  if (!name || !website) return fail("name and website are required.");

  const existing = await db.trackedCompany.findUnique({
    where: { userId_name: { userId: user.id, name } },
  });
  if (existing) return fail("You already follow that company.", 409);

  const created = await db.trackedCompany.create({
    data: {
      userId: user.id,
      name,
      website,
      careersUrl: b.careersUrl?.trim() || null,
      discoveryStatus: "pending",
    },
  });

  const outcome = await discoverAts(b.careersUrl?.trim() || website);
  const updated = await db.trackedCompany.update({
    where: { id: created.id },
    data:
      outcome.status === "resolved" && outcome.match
        ? {
            atsType: outcome.match.atsType,
            atsToken: outcome.match.atsToken,
            discoveryStatus: "resolved",
          }
        : { discoveryStatus: outcome.status, discoveryError: outcome.error ?? null },
  });

  return ok({ company: updated, discovery: outcome });
});

export const DELETE = route(async (req: Request) => {
  const user = await requireUser();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("id required.");
  const existing = await db.trackedCompany.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) return fail("Not found.", 404);
  await db.trackedCompany.delete({ where: { id } });
  return ok({ deleted: id });
});
