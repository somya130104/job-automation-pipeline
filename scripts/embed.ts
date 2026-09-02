/**
 * Batch-embed every job (and the primary resume per user), so the first
 * rescore after an ingest isn't paying the embedding cost inline.
 *
 *   npm run embed            embed jobs missing an up-to-date vector
 *   npm run embed -- --all   re-embed everything
 */
import { db } from "../src/lib/db";
import { embed, embedHash, writeVec } from "./_embed-helpers";

async function main() {
  const all = process.argv.includes("--all");

  const jobs = await db.job.findMany({
    select: { id: true, title: true, descriptionText: true, embeddingHash: true },
  });

  let done = 0;
  let skipped = 0;
  const t0 = Date.now();

  for (const job of jobs) {
    const text = `${job.title}\n${job.descriptionText.slice(0, 3500)}`;
    const hash = embedHash(text);
    if (!all && job.embeddingHash === hash) {
      skipped++;
      continue;
    }
    try {
      const vec = await embed(text);
      await db.job.update({
        where: { id: job.id },
        data: { embedding: writeVec(vec), embeddingHash: hash },
      });
      done++;
      if (done % 50 === 0) {
        const rate = (done / ((Date.now() - t0) / 1000)).toFixed(1);
        console.log(`  ${done}/${jobs.length - skipped} embedded (${rate}/s)`);
      }
    } catch (err) {
      console.warn(`  ! failed ${job.id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(
    `\nEmbedded ${done} jobs, skipped ${skipped} unchanged, in ${(
      (Date.now() - t0) / 1000
    ).toFixed(1)}s.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
