import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, ok, route } from "@/lib/api";
import { writeList } from "@/lib/json-list";
import { checkAts } from "@/lib/resume/ats-check";
import { checkAtsLlm, mergeAts } from "@/lib/resume/ats-llm";
import { extractText, UnsupportedResumeError } from "@/lib/resume/extract-text";
import { extractResumeFields } from "@/lib/resume/parse-llm";

// pdf-parse and mammoth are Node-only; the edge runtime cannot load them.
export const runtime = "nodejs";
// Resume parsing + two Gemini calls (field extraction, ATS review) with retries.
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

export const POST = route(async (req: Request) => {
  const user = await requireUser();

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return fail("No file uploaded. Attach the resume as `file`.");
  }
  if (file.size === 0) return fail("That file is empty.");
  if (file.size > MAX_BYTES) {
    return fail(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. Keep it under 8MB.`,
      413,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let extracted;
  try {
    extracted = await extractText(buffer, file.type, file.name);
  } catch (err) {
    if (err instanceof UnsupportedResumeError) return fail(err.message, 415);
    // A corrupt or password-protected PDF throws from deep inside pdf-parse
    // with an unhelpful message; translate it into something actionable.
    return fail(
      "Couldn't read that file. If it's password-protected or a scan, re-export it as a normal PDF.",
      422,
    );
  }

  const parsed = await extractResumeFields(extracted.text);
  // Deterministic rule engine + (when a Gemini key is set) a strict LLM review,
  // blended with the rules as the strictness anchor.
  const rulesAts = checkAts(extracted.text, parsed, extracted.likelyImageOnly);
  const ats = mergeAts(rulesAts, await checkAtsLlm(extracted.text));

  // First resume uploaded becomes the primary one used for scoring.
  const existing = await db.resume.count({ where: { userId: user.id } });

  const resume = await db.resume.create({
    data: {
      userId: user.id,
      label: form.get("label")?.toString().trim() || "Default",
      isPrimary: existing === 0,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      rawText: extracted.text,
      skills: writeList(parsed.skills),
      experience: writeList(parsed.experience),
      education: writeList(parsed.education),
      atsScore: ats.score,
      atsIssues: writeList(ats.issues),
    },
  });

  return ok({
    resumeId: resume.id,
    parsed,
    ats,
    // Onboarding pre-fills its form from these rather than making the user
    // retype what the resume already said.
    suggestions: {
      experienceYears: parsed.experienceYears,
      targetRoles: parsed.inferredRoles,
    },
  });
});

/**
 * Delete one resume by id (`?id=…`). Old uploads pile up in Settings otherwise.
 * OutreachDraft.resumeId is ON DELETE SET NULL, so drafts survive. If the
 * primary is removed, the newest remaining resume is promoted so scoring always
 * has one to use.
 */
export const DELETE = route(async (req: Request) => {
  const user = await requireUser();
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return fail("Pass the resume id as `?id=`.");

  const resume = await db.resume.findFirst({
    where: { id, userId: user.id },
    select: { id: true, isPrimary: true },
  });
  if (!resume) return fail("No such resume.", 404);

  await db.resume.delete({ where: { id: resume.id } });

  let promotedId: string | null = null;
  if (resume.isPrimary) {
    const next = await db.resume.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (next) {
      await db.resume.update({
        where: { id: next.id },
        data: { isPrimary: true },
      });
      promotedId = next.id;
    }
  }

  return ok({ deleted: resume.id, promotedId });
});
