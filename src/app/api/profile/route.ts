import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clampNumber, cleanStringList, ok, readJson, route } from "@/lib/api";
import { readList, writeList } from "@/lib/json-list";
import { rescoreUser } from "@/lib/matching/rescore";

export const runtime = "nodejs";
// A full keyword rescore upserts one MatchScore row per job.
export const maxDuration = 60;

interface ProfileBody {
  targetRoles: string[];
  targetLocations: string[];
  experienceYears: number;
  roleType: "fulltime" | "internship";
  remoteOnly: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  digestFrequency: string;
  matchThreshold: number;
  onboarded: boolean;
}

export const GET = route(async () => {
  const user = await requireUser();
  return ok({
    ...user,
    targetRoles: readList<string>(user.targetRoles),
    targetLocations: readList<string>(user.targetLocations),
  });
});

export const PATCH = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<ProfileBody>(req);

  // Only assign fields the request actually sent, so a partial update from
  // Settings can't blank out everything onboarding collected.
  const data: Record<string, unknown> = {};

  if (body.targetRoles !== undefined) {
    data.targetRoles = writeList(cleanStringList(body.targetRoles));
  }
  if (body.targetLocations !== undefined) {
    data.targetLocations = writeList(cleanStringList(body.targetLocations));
  }
  if (body.experienceYears !== undefined) {
    data.experienceYears = clampNumber(body.experienceYears, 0, 50, 0);
  }
  if (body.roleType !== undefined) {
    data.roleType = body.roleType === "internship" ? "internship" : "fulltime";
  }
  if (body.remoteOnly !== undefined) data.remoteOnly = Boolean(body.remoteOnly);
  if (body.salaryMin !== undefined) {
    data.salaryMin = body.salaryMin === null ? null : clampNumber(body.salaryMin, 0, 1e9, 0);
  }
  if (body.salaryMax !== undefined) {
    data.salaryMax = body.salaryMax === null ? null : clampNumber(body.salaryMax, 0, 1e9, 0);
  }
  if (body.digestFrequency !== undefined) {
    data.digestFrequency = ["daily", "weekdays", "off"].includes(
      String(body.digestFrequency),
    )
      ? body.digestFrequency
      : "daily";
  }
  if (body.matchThreshold !== undefined) {
    data.matchThreshold = clampNumber(body.matchThreshold, 0, 100, 55);
  }
  if (body.onboarded !== undefined) data.onboarded = Boolean(body.onboarded);

  const updated = await db.user.update({ where: { id: user.id }, data });

  // Targeting changes invalidate every score, so recompute rather than let the
  // feed show numbers from the previous profile.
  const affectsScoring = [
    "targetRoles",
    "targetLocations",
    "experienceYears",
    "roleType",
    "remoteOnly",
  ].some((key) => key in data);

  if (affectsScoring) await rescoreUser(updated.id);

  return ok({
    ...updated,
    targetRoles: readList<string>(updated.targetRoles),
    targetLocations: readList<string>(updated.targetLocations),
    rescored: affectsScoring,
  });
});
