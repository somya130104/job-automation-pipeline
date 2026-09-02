/**
 * Batch-embed every job via the Gemini batch embedding API, so the first
 * rescore after an ingest isn't paying the embedding cost inline.
 *
 *   npm run embed            embed jobs missing an up-to-date vector
 *   npm run embed -- --all   re-embed everything
 */
import { db } from "../src/lib/db";
import { embedHash, embedMany } from "../src/lib/matching/embed";

async function main() {
  const all = process.argv.includes("--all");

  const jobs = await db.job.findMany({
    select: { id: true, title: true, descriptionText: true, embeddingHash: true },
  });

  const pending = jobs
    .map((j) => ({
      id: j.id,
      text: `${j.title}\n${j.descriptionText.slice(0, 3500)}`,
      hash: "",
      current: j.embeddingHash,
    }))
    .map((j) => ({ ...j, hash: embedHash(j.text) }))
    .filter((j) => all || j.current !== j.hash);

  console.log(
    `${jobs.length} jobs, ${pending.length} need embedding${all ? " (--all)" : ""}.`,
  );
  if (pending.length === 0) return;

  const t0 = Date.now();
  const BATCH = 100;
  for (let i = 0; i < pending.length; i += BATCH) {
    const slice = pending.slice(i, i + BATCH);
    let vecs: number[][];
    try {
      vecs = await embedMany(slice.map((s) => s.text));
    } catch (err) {
      console.warn(`  ! batch ${i}-${i + slice.length} failed: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    await db.$transaction(
      slice.map((s, k) =>
        db.job.update({
          where: { id: s.id },
          data: { embedding: JSON.stringify(vecs[k]), embeddingHash: s.hash },
        }),
      ),
    );
    const done = Math.min(i + BATCH, pending.length);
    console.log(`  ${done}/${pending.length} (${((done / ((Date.now() - t0) / 1000)) || 0).toFixed(0)}/s)`);
  }

  console.log(`\nEmbedded ${pending.length} jobs in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
