import { db } from "@/lib/db";
import { DEFAULT_TARGETS, trackedCompanyTargets, type SourceTarget } from "./registry";

/**
 * Everything worth polling in one run: the built-in boards plus every
 * TrackedCompany whose ATS token has been resolved (from YC sync or a manual
 * follow). De-duplicated on source+token so a YC company that's also a
 * default target isn't fetched twice.
 */
export async function allIngestTargets(): Promise<SourceTarget[]> {
  const resolved = await db.trackedCompany.findMany({
    where: { discoveryStatus: "resolved", atsType: { not: null }, atsToken: { not: null } },
    select: { atsType: true, atsToken: true, name: true },
  });

  const merged = [...DEFAULT_TARGETS, ...trackedCompanyTargets(resolved)];
  const seen = new Set<string>();
  return merged.filter((t) => {
    const key = `${t.source}:${t.token}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
