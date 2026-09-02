import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { readList } from "@/lib/json-list";
import { analyseJd } from "@/lib/matching/jd";
import { WEIGHT_PROFILES } from "@/lib/matching/weights";
import { salaryHistogram } from "@/lib/sources/adzuna";
import { draftOutreach, suggestBullets } from "@/lib/writing/drafts";
import { JobDetailShell } from "./JobDetailShell";

/**
 * Server-rendered detail view. Reading straight from the DB here (rather than
 * fetching an API route from the client) means the sheet arrives fully
 * populated on first paint, and deep links like /dashboard?job=<id> work.
 */
export async function JobDetailSheet({
  jobId,
  userId,
}: {
  jobId: string;
  userId: string;
}) {
  const [job, score, application, user] = await Promise.all([
    db.job.findUnique({ where: { id: jobId } }),
    db.matchScore.findUnique({
      where: { jobId_userId: { jobId, userId } },
    }),
    db.application.findUnique({
      where: { jobId_userId: { jobId, userId } },
    }),
    db.user.findUnique({ where: { id: userId } }),
  ]);

  const savedOutreachRow = await db.outreachDraft.findFirst({
    where: { userId, jobId },
    orderBy: { updatedAt: "desc" },
  });

  if (!job || !user) notFound();

  const matched = readList<string>(score?.matchedKeywords);
  const missing = readList<string>(score?.missingKeywords);
  const jd = analyseJd(job.title, job.descriptionText);
  const weights =
    WEIGHT_PROFILES[user.roleType === "internship" ? "internship" : "fulltime"];
  const scamReasons = readList<string>(job.scamReasons);

  // Real Indian salary distribution for the role family, when Adzuna is
  // configured — degrades to null (panel hidden) otherwise.
  const targetLocation = readList<string>(user.targetLocations)[0];
  const salary = await salaryHistogram(
    job.title.replace(/(senior|junior|staff|principal|lead|intern|ii+|\biii\b)/gi, "").trim() ||
      job.title,
    job.remoteType === "remote" ? undefined : targetLocation,
  );

  return (
    <JobDetailShell
      job={{
        id: job.id,
        title: job.title,
        company: job.company,
        locations: readList<string>(job.locations),
        remoteType: job.remoteType,
        employmentType: job.employmentType,
        department: job.department,
        source: job.source,
        applyUrl: job.applyUrl,
        postedAt: job.postedAt.toISOString(),
        descriptionText: job.descriptionText,
        compensationMin: job.compensationMin,
        compensationMax: job.compensationMax,
        compensationCurrency: job.compensationCurrency,
      }}
      score={
        score
          ? {
              total: score.score,
              semantic: score.semanticScore,
              keyword: score.keywordScore,
              title: score.titleScore,
              experience: score.experienceScore,
              location: score.locationScore,
              matched,
              missing,
            }
          : null
      }
      weights={weights}
      jd={{
        minYears: jd.minYears,
        seniority: jd.seniority,
        skillCount: jd.skills.length,
      }}
      scam={
        job.scamRisk >= 25
          ? { risk: job.scamRisk, reasons: scamReasons }
          : null
      }
      salary={
        salary
          ? {
              what: salary.what,
              where: salary.where,
              mean: salary.mean,
              buckets: salary.buckets,
            }
          : null
      }
      referralCompany={job.company}
      savedOutreach={
        savedOutreachRow
          ? { body: savedOutreachRow.body, sentByUser: savedOutreachRow.sentByUser }
          : null
      }
      application={
        application
          ? {
              id: application.id,
              status: application.status,
              notes: application.notes,
              prepNotes: application.prepNotes,
            }
          : null
      }
      bullets={suggestBullets(missing, job.title)}
      outreach={draftOutreach({
        jobTitle: job.title,
        company: job.company,
        matchedKeywords: matched,
        userName: user.name,
        experienceYears: user.experienceYears,
      })}
    />
  );
}
