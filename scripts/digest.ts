/**
 * Run the digest locally: npm run digest:run
 * Same code path the cron hits; prints the summary. Honours APP_ORIGIN.
 */
import { runDigest } from "../src/lib/digest/run";
import { db } from "../src/lib/db";

const origin = (process.env.APP_ORIGIN || "http://localhost:3000").replace(/\/$/, "");

runDigest(origin)
  .then((s) => console.log(JSON.stringify(s, null, 2)))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
