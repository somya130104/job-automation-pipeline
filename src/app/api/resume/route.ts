import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, ok, route } from "@/lib/api";
import { writeList } from "@/lib/json-list";
import { checkAts } from "@/lib/resume/ats-check";
import { extractText, UnsupportedResumeError } from "@/lib/resume/extract-text";
import { extractResumeFields } from "@/lib/resume/parse-llm";

// pdf-parse and mammoth are Node-only; the edge runtime cannot load them.
export const runtime = "nodejs";

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
  const ats = checkAts(extracted.text, parsed, extracted.likelyImageOnly);

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
