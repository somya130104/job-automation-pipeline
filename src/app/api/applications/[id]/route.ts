import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, ok, readJson, route } from "@/lib/api";
import { refreshBadges } from "@/lib/gamification";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await readJson<{
    status: string;
    notes: string;
    prepNotes: string;
    followUpDate: string | null;
    boardOrder: number;
  }>(req);

  // Scope the lookup to the user — an id alone must never be enough to read
  // or edit somebody else's application.
  const existing = await db.application.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) return fail("Application not found.", 404);

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.notes !== undefined) data.notes = String(body.notes).slice(0, 8000);
  if (body.prepNotes !== undefined) {
    data.prepNotes = String(body.prepNotes).slice(0, 8000);
  }
  if (body.boardOrder !== undefined) data.boardOrder = Number(body.boardOrder) || 0;
  if (body.followUpDate !== undefined) {
    data.followUpDate = body.followUpDate ? new Date(body.followUpDate) : null;
  }

  if (body.status === "applied" && existing.status !== "applied") {
    data.appliedAt = new Date();
    const job = await db.job.findUnique({ where: { id: existing.jobId } });
    if (job) data.jdSnapshot = job.descriptionText;
  }

  const application = await db.application.update({ where: { id }, data });
  await refreshBadges(user.id);
  return ok({ application });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const existing = await db.application.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) return fail("Application not found.", 404);

  await db.application.delete({ where: { id } });
  return ok({ deleted: id });
});
