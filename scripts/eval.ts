/**
 * Scorer eval harness.  npm run eval
 *
 * Loads the hand-labelled fixture (prisma/fixtures/eval-set.json), runs the
 * real scorer over it exactly as the feed would, ranks by score, and prints:
 *
 *   precision@10   of the top-10 ranked jobs, fraction labelled good
 *   recall@10      of all good jobs, fraction that landed in the top 10
 *   MRR            mean reciprocal rank of the first good job
 *   ROC-ish        precision/recall if score >= threshold is "predicted good"
 *   separation     mean(good score) - mean(bad score)
 *
 * Almost no portfolio project ships this. It is what lets you change a number
 * in weights.ts and see immediately whether ranking got better or worse
 * instead of eyeballing the feed. Wired into CI (.github/workflows/ci.yml) so
 * a regression shows up on the PR.
 *
 * Exit code is non-zero if precision@10 drops below MIN_PRECISION_AT_10 — that
 * is the guard rail CI enforces.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scoreJob } from "../src/lib/matching/score";
import { embed, cosine } from "../src/lib/matching/embed";

const MIN_PRECISION_AT_10 = 0.7;

interface Fixture {
  profile: {
    skills: string[];
    targetRoles: string[];
    targetLocations: string[];
    experienceYears: number;
    remoteOnly: boolean;
    roleType: "fulltime" | "internship";
  };
  jobs: Array<{
    label: "good" | "bad";
    title: string;
    remoteType: string;
    text: string;
  }>;
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

async function main() {
  const noEmbed = process.argv.includes("--no-embed");
  const fixture = JSON.parse(
    readFileSync(join(process.cwd(), "prisma/fixtures/eval-set.json"), "utf8"),
  ) as Fixture;

  const { profile, jobs } = fixture;
  const goodTotal = jobs.filter((j) => j.label === "good").length;

  // Precompute embeddings (profile once, each job once).
  let profileVec: number[] | null = null;
  const jobVecs = new Map<number, number[]>();
  if (!noEmbed) {
    process.stdout.write("Embedding fixture… ");
    profileVec = await embed(
      [profile.skills.join(", "), profile.targetRoles.join(", ")].join("\n"),
    );
    for (let i = 0; i < jobs.length; i++) {
      jobVecs.set(i, await embed(`${jobs[i].title}\n${jobs[i].text}`));
    }
    console.log("done");
  }

  const scored = jobs.map((job, i) => {
    const jv = jobVecs.get(i);
    const similarity =
      profileVec && jv ? cosine(profileVec, jv) : undefined;
    const result = scoreJob({
      job: {
        title: job.title,
        descriptionText: job.text,
        locations: profile.targetLocations,
        remoteType: job.remoteType,
        employmentType: "fulltime",
      },
      profile,
      semanticSimilarity: similarity,
    });
    return { ...job, score: result.score, breakdown: result };
  });

  scored.sort((a, b) => b.score - a.score);

  // precision@10 / recall@10
  const top10 = scored.slice(0, 10);
  const goodInTop10 = top10.filter((j) => j.label === "good").length;
  const precisionAt10 = goodInTop10 / Math.min(10, scored.length);
  const recallAt10 = goodInTop10 / goodTotal;

  // MRR
  const firstGoodRank = scored.findIndex((j) => j.label === "good") + 1;
  const mrr = firstGoodRank > 0 ? 1 / firstGoodRank : 0;

  // threshold-based precision/recall sweep
  const sweep = [40, 45, 50, 55, 60, 65, 70].map((t) => {
    const predicted = scored.filter((j) => j.score >= t);
    const tp = predicted.filter((j) => j.label === "good").length;
    const precision = predicted.length ? tp / predicted.length : 0;
    const recall = tp / goodTotal;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    return { t, precision, recall, f1, n: predicted.length };
  });

  const meanGood =
    scored.filter((j) => j.label === "good").reduce((s, j) => s + j.score, 0) /
    goodTotal;
  const meanBad =
    scored.filter((j) => j.label === "bad").reduce((s, j) => s + j.score, 0) /
    (jobs.length - goodTotal);

  console.log("\n─── ranking ───────────────────────────────────────────");
  scored.forEach((j, i) => {
    const mark = j.label === "good" ? "✓" : " ";
    const bar = "█".repeat(Math.round(j.score / 4)).padEnd(25);
    console.log(
      `${String(i + 1).padStart(2)}. ${mark} ${bar} ${String(j.score).padStart(3)}  ${j.title}`,
    );
  });

  console.log("\n─── metrics ───────────────────────────────────────────");
  console.log(`  fixture              ${jobs.length} jobs (${goodTotal} good, ${jobs.length - goodTotal} bad)`);
  console.log(`  embeddings           ${noEmbed ? "OFF (keyword-only path)" : "on (gemini-embedding-001, 768d)"}`);
  console.log(`  precision@10         ${pct(precisionAt10)}`);
  console.log(`  recall@10            ${pct(recallAt10)}`);
  console.log(`  MRR                  ${mrr.toFixed(3)} (first good at rank ${firstGoodRank})`);
  console.log(`  mean good score      ${meanGood.toFixed(1)}`);
  console.log(`  mean bad score       ${meanBad.toFixed(1)}`);
  console.log(`  separation           ${(meanGood - meanBad).toFixed(1)} points`);
  console.log("\n  threshold sweep");
  console.log("    score>=  n   precision  recall   F1");
  for (const s of sweep) {
    console.log(
      `    ${String(s.t).padStart(5)}  ${String(s.n).padStart(2)}   ${pct(s.precision).padStart(7)}  ${pct(s.recall).padStart(6)}  ${s.f1.toFixed(2)}`,
    );
  }

  console.log("\n───────────────────────────────────────────────────────");
  if (precisionAt10 < MIN_PRECISION_AT_10) {
    console.error(
      `FAIL: precision@10 ${pct(precisionAt10)} < required ${pct(MIN_PRECISION_AT_10)}`,
    );
    process.exitCode = 1;
  } else {
    console.log(`PASS: precision@10 ${pct(precisionAt10)} >= ${pct(MIN_PRECISION_AT_10)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
