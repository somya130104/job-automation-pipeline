import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, ok, readJson, route } from "@/lib/api";

export const runtime = "nodejs";

/**
 * Outreach drafts. The app never sends anything — `sentByUser` is a flag the
 * user sets themselves after they've sent the message from their own account,
 * so the tracker can show which roles have had outreach.
 *
 * GET  ?jobId=  -> the saved draft for this (user, job), or null
 * POST { jobId, kind, subject, body, sentByUser } -> upsert
 */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) return fail("jobId required.");

  const draft = await db.outreachDraft.findFirst({
    where: { userId: user.id, jobId },
    orderBy: { updatedAt: "desc" },
  });
  return ok({ draft });
});

interface Body {
  jobId: string;
  kind: "email" | "connection_note";
  subject: string;
  body: string;
  sentByUser: boolean;
}

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const b = await readJson<Body>(req);
  if (!b.jobId || !b.body?.trim()) return fail("jobId and body are required.");

  const existing = await db.outreachDraft.findFirst({
    where: { userId: user.id, jobId: b.jobId },
  });

  const data = {
    kind: b.kind === "connection_note" ? "connection_note" : "email",
    subject: String(b.subject ?? "").slice(0, 300),
    body: String(b.body).slice(0, 8000),
    sentByUser: Boolean(b.sentByUser),
  };

  const draft = existing
    ? await db.outreachDraft.update({ where: { id: existing.id }, data })
    : await db.outreachDraft.create({
        data: { userId: user.id, jobId: b.jobId, ...data },
      });

  return ok({ draft });
});
