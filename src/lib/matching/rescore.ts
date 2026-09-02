import { db } from "@/lib/db";
import { readList, writeList } from "@/lib/json-list";
import { cosine, embed, embedHash, parseEmbedding } from "./embed";
import { scoreJob } from "./score";

/**
 * Recompute MatchScore rows for a user.
 *
 * Called after onboarding, resume upload, profile edits and ingestion, all of
 * which are request-scoped — so this MUST stay fast and MUST NOT block on the
 * embedding API.
 *
 * Rules:
 *   - The résumé is embedded once per rescore (one API call, cached by hash).
 *   - Jobs are NEVER embedded here. We only read a job's pre-computed
 *     `Job.embedding` (filled by `scripts/embed.ts` / the ingest backfill).
 *     A job without an embedding is simply scored keyword-only — the scorer
 *     redistributes the semantic weight so the number stays sensible.
 *   - If the résumé embed fails (e.g. quota) we drop straight to keyword-only
 *     for the whole run rather than retrying per job.
 *
 * `skipEmbeddings` forces the keyword-only path outright.
 */
export async function rescoreUser(
  userId: string,
  opts: { onlyMissing?: boolean; skipEmbeddings?: boolean } = {},
): Promise<{ scored: number; embedded: number }> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { scored: 0, embedded: 0 };

  const resume = await db.resume.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
  });

  const profile = {
    skills: readList<string>(resume?.skills),
    targetRoles: readList<string>(user.targetRoles),
    targetLocations: readList<string>(user.targetLocations),
    experienceYears: user.experienceYears,
    remoteOnly: user.remoteOnly,
    roleType: (user.roleType === "internship" ? "internship" : "fulltime") as
      | "fulltime"
      | "internship",
  };

  const useEmbeddings = !opts.skipEmbeddings;

  // --- resume embedding (cached by hash of the text we embed) ---
  let resumeVec: number[] | null = null;
  if (useEmbeddings && resume) {
    const resumeText = [
      profile.skills.join(", "),
      readList<{ title: string; bullets: string[] }>(resume.experience)
        .map((e) => `${e.title}. ${e.bullets.join(" ")}`)
        .join("\n"),
      resume.rawText.slice(0, 2000),
    ]
      .filter(Boolean)
      .join("\n");
    const hash = embedHash(resumeText);
    if (resume.embedding && resume.embeddingHash === hash) {
      resumeVec = parseEmbedding(resume.embedding);
    } else {
      try {
        // One call, minimal retry — a request handler is waiting on this.
        resumeVec = await embed(resumeText, 1);
        await db.resume.update({
          where: { id: resume.id },
          data: { embedding: writeList(resumeVec), embeddingHash: hash },
        });
      } catch {
        resumeVec = null; // embedding API unavailable -> keyword-only run
      }
    }
  }

  const jobs = await db.job.findMany({
    where: opts.onlyMissing ? { matchScores: { none: { userId } } } : undefined,
    select: {
      id: true,
      title: true,
      descriptionText: true,
      locations: true,
      remoteType: true,
      employmentType: true,
      embedding: true,
    },
  });

  const embedded = 0;

  for (const job of jobs) {
    // Use the job's pre-computed embedding if it has one; never generate here.
    let similarity: number | undefined;
    if (useEmbeddings && resumeVec) {
      const jobVec = parseEmbedding(job.embedding);
      if (jobVec && jobVec.length === resumeVec.length) {
        similarity = cosine(resumeVec, jobVec);
      }
    }

    const result = scoreJob({
      job: {
        title: job.title,
        descriptionText: job.descriptionText,
        locations: readList<string>(job.locations),
        remoteType: job.remoteType,
        employmentType: job.employmentType,
      },
      profile,
      semanticSimilarity: similarity,
    });

    const payload = {
      score: result.score,
      semanticScore: result.semanticScore,
      keywordScore: result.keywordScore,
      titleScore: result.titleScore,
      experienceScore: result.experienceScore,
      locationScore: result.locationScore,
      matchedKeywords: writeList(result.matchedKeywords),
      missingKeywords: writeList(result.missingKeywords),
      computedAt: new Date(),
    };

    await db.matchScore.upsert({
      where: { jobId_userId: { jobId: job.id, userId } },
      create: { jobId: job.id, userId, ...payload },
      update: payload,
    });
  }

  return { scored: jobs.length, embedded };
}
