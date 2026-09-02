/**
 * CLI ingestion runner: `npm run ingest`
 *
 * Flags:
 *   --source=greenhouse   only run targets for one source
 *   --token=stripe        only run one board
 *   --probe               check every target responds, write nothing
 */
import { db } from "../src/lib/db";
import { rescoreUser } from "../src/lib/matching/rescore";
import { DEFAULT_TARGETS, getSource } from "../src/lib/sources/registry";
import { allIngestTargets } from "../src/lib/sources/all-targets";
import { ingestAll } from "../src/lib/sources/ingest";

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

async function probe() {
  console.log("Probing all default targets…\n");
  for (const target of DEFAULT_TARGETS) {
    const adapter = getSource(target.source);
    const label = `${target.source}${target.token ? `:${target.token}` : ""}`;
    if (!adapter) {
      console.log(`  ✗ ${label.padEnd(26)} no adapter registered`);
      continue;
    }
    try {
      const jobs = await adapter.fetchJobs(target.token);
      console.log(`  ✓ ${label.padEnd(26)} ${jobs.length} postings`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ ${label.padEnd(26)} ${msg}`);
    }
  }
}

async function main() {
  if (process.argv.includes("--probe")) {
    await probe();
    return;
  }

  const source = flag("source");
  const token = flag("token");
  const targets = (await allIngestTargets()).filter(
    (t) => (!source || t.source === source) && (!token || t.token === token),
  );

  if (targets.length === 0) {
    console.error("No targets matched those filters.");
    process.exitCode = 1;
    return;
  }

  console.log(`Ingesting ${targets.length} target(s)…\n`);
  const summary = await ingestAll(targets);

  for (const r of summary.targets) {
    const label = `${r.source}${r.token ? `:${r.token}` : ""}`;
    if (r.ok) {
      console.log(
        `  ✓ ${label.padEnd(26)} fetched ${String(r.fetched).padStart(4)}  new ${String(r.created).padStart(4)}  dupes ${r.duplicates}`,
      );
    } else {
      console.log(`  ✗ ${label.padEnd(26)} ${r.error}`);
    }
  }

  const seconds = (
    (summary.finishedAt.getTime() - summary.startedAt.getTime()) / 1000
  ).toFixed(1);
  console.log(
    `\nDone in ${seconds}s — ${summary.totalCreated} new jobs from ${summary.totalFetched} fetched.`,
  );

  // Newly ingested jobs have no MatchScore rows yet; score them for everyone
  // who has finished onboarding so the feed is ready immediately.
  const users = await db.user.findMany({
    where: { onboarded: true },
    select: { id: true },
  });
  for (const user of users) {
    const { scored } = await rescoreUser(user.id, { onlyMissing: true });
    if (scored) console.log(`Scored ${scored} new jobs for user ${user.id}.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
