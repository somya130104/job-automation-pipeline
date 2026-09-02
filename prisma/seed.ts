/**
 * Seeds a usable local database: `npm run db:seed`
 *
 * Creates the local-dev user, then pulls a real batch of postings from the
 * public ATS boards. There are no fixtures here on purpose — the whole point
 * of the source layer is that it works against live endpoints, and seeding
 * from fake data would hide adapter breakage.
 */
import { db } from "../src/lib/db";
import { LOCAL_AUTH_ID } from "../src/lib/auth";
import { ingestAll } from "../src/lib/sources/ingest";
import { rescoreUser } from "../src/lib/matching/rescore";

async function main() {
  const user = await db.user.upsert({
    where: { authId: LOCAL_AUTH_ID },
    update: {},
    create: { authId: LOCAL_AUTH_ID, name: "Local Dev" },
  });
  console.log(`User ready (${user.id}).`);

  const existing = await db.job.count();
  if (existing > 0) {
    console.log(`${existing} jobs already present — skipping ingestion.`);
  } else {
    console.log("Pulling postings from the public ATS boards…");
    const summary = await ingestAll();
    const failed = summary.targets.filter((t) => !t.ok);
    console.log(
      `Ingested ${summary.totalCreated} jobs from ${summary.totalFetched} fetched.`,
    );
    for (const f of failed) {
      console.warn(`  ! ${f.source}:${f.token} failed — ${f.error}`);
    }
  }

  if (user.onboarded) {
    const { scored } = await rescoreUser(user.id);
    console.log(`Scored ${scored} jobs.`);
  } else {
    console.log("Finish onboarding at http://localhost:3000/onboarding to score them.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
