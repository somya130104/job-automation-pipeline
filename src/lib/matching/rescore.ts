import { db } from "@/lib/db";
import { readList, writeList } from "@/lib/json-list";
import { cosine, embed, embedHash, parseEmbedding } from "./embed";
import { scoreJob } from "./score";

/**
 * Recompute MatchScore rows for a user.
 *
 * Called after onboarding, resume upload, profile edits and ingestion.
 * Keyword/title/experience/location scoring is pure and cheap. The semantic
 * term needs embeddings:
 *   - the resume is embedded once per rescore (cached by content hash);
 *   - each job is embedded once ever (cached on Job.embedding by content hash),
 *     so the cost is paid on first sight and never again.
 *
 * `skipEmbeddings` runs the fast keyword-only path (used when the model isn't
 * wanted in a given environment); the scorer redistributes the semantic weight
 * so scores stay sensible.
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
        resumeVec = await embed(resumeText);
        await db.resume.update({
          where: { id: resume.id },
          data: { embedding: writeList(resumeVec), embeddingHash: hash },
        });
      } catch {
        resumeVec = null; // model unavailable -> fall back to keyword-only
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
      embeddingHash: true,
    },
  });

  let embedded = 0;

  for (const job of jobs) {
    // --- job embedding (cached forever on the row) ---
    let similarity: number | undefined;
    if (useEmbeddings && resumeVec) {
      const jobText = `${job.title}\n${job.descriptionText.slice(0, 3500)}`;
      const hash = embedHash(jobText);
      let jobVec = job.embeddingHash === hash ? parseEmbedding(job.embedding) : null;
      if (!jobVec) {
        try {
          jobVec = await embed(jobText);
          await db.job.update({
            where: { id: job.id },
            data: { embedding: writeList(jobVec), embeddingHash: hash },
          });
          embedded++;
        } catch {
          jobVec = null;
        }
      }
      if (jobVec) similarity = cosine(resumeVec, jobVec);
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
