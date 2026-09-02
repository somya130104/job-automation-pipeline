import { arbeitnow } from "./arbeitnow";
import { ashby } from "./ashby";
import { adzuna } from "./adzuna";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { recruitee } from "./recruitee";
import { remoteok } from "./remoteok";
import { remotive } from "./remotive";
import { smartrecruiters } from "./smartrecruiters";
import { workable } from "./workable";
import type { JobSource, SourceId } from "./types";

export const SOURCES: Record<string, JobSource> = {
  greenhouse,
  lever,
  ashby,
  smartrecruiters,
  recruitee,
  workable,
  remoteok,
  remotive,
  arbeitnow,
  adzuna,
};

export function getSource(id: string): JobSource | undefined {
  return SOURCES[id];
}

/** One unit of ingestion work: which adapter, against which company board. */
export interface SourceTarget {
  source: SourceId;
  token: string;
  /** Display name, since a slug like "0x" is a poor company label. */
  company?: string;
}

/**
 * Default boards polled on ingest. All public, no-auth, intended-use endpoints
 * — companies publish them precisely so postings get syndicated.
 *
 * Verified live at build time with `npm run ingest -- --probe`. Tokens rot as
 * companies migrate ATS, so a failing target is logged and skipped rather than
 * failing the whole run.
 */
export const DEFAULT_TARGETS: SourceTarget[] = [
  // --- Global tech, all hire heavily in India ---
  { source: "greenhouse", token: "stripe", company: "Stripe" },
  { source: "greenhouse", token: "figma", company: "Figma" },
  { source: "greenhouse", token: "databricks", company: "Databricks" },
  { source: "greenhouse", token: "gitlab", company: "GitLab" },
  { source: "greenhouse", token: "discord", company: "Discord" },
  { source: "greenhouse", token: "airtable", company: "Airtable" },
  { source: "greenhouse", token: "cloudflare", company: "Cloudflare" },
  { source: "greenhouse", token: "mongodb", company: "MongoDB" },
  { source: "greenhouse", token: "elastic", company: "Elastic" },
  { source: "greenhouse", token: "airbnb", company: "Airbnb" },
  { source: "greenhouse", token: "twilio", company: "Twilio" },
  { source: "greenhouse", token: "rubrik", company: "Rubrik" },
  { source: "greenhouse", token: "druva", company: "Druva" },
  { source: "greenhouse", token: "dropbox", company: "Dropbox" },
  { source: "lever", token: "palantir", company: "Palantir" },
  { source: "lever", token: "spotify", company: "Spotify" },
  { source: "ashby", token: "openai", company: "OpenAI" },
  { source: "ashby", token: "ramp", company: "Ramp" },
  { source: "ashby", token: "linear", company: "Linear" },
  { source: "ashby", token: "notion", company: "Notion" },
  { source: "ashby", token: "confluent", company: "Confluent" },

  // --- India-first companies (verified live) ---
  { source: "lever", token: "paytm", company: "Paytm" },
  { source: "lever", token: "meesho", company: "Meesho" },
  { source: "lever", token: "porter", company: "Porter" },
  { source: "lever", token: "zeta", company: "Zeta" },
  { source: "lever", token: "mindtickle", company: "Mindtickle" },
  { source: "lever", token: "cred", company: "CRED" },
  { source: "lever", token: "fampay", company: "FamPay" },
  { source: "greenhouse", token: "postman", company: "Postman" },
  { source: "greenhouse", token: "truecaller", company: "Truecaller" },
  { source: "greenhouse", token: "slice", company: "slice" },
  { source: "greenhouse", token: "groww", company: "Groww" },
  { source: "ashby", token: "navi", company: "Navi" },
  { source: "ashby", token: "atlan", company: "Atlan" },
  { source: "smartrecruiters", token: "Swiggy", company: "Swiggy" },

  // --- Whole-market remote feeds (token unused) ---
  { source: "remoteok", token: "", company: "" },
  { source: "remotive", token: "", company: "" },
  { source: "arbeitnow", token: "", company: "" },

  // --- Adzuna: broad India market coverage (demoted; also powers salary panel) ---
  { source: "adzuna", token: "", company: "" },
];

/**
 * Turn a user's resolved TrackedCompany rows (from YC sync or manual follow)
 * into ingest targets, so the same pipeline polls followed companies.
 */
export function trackedCompanyTargets(
  rows: Array<{ atsType: string | null; atsToken: string | null; name: string }>,
): SourceTarget[] {
  const out: SourceTarget[] = [];
  for (const r of rows) {
    if (!r.atsType || !r.atsToken) continue;
    if (!(r.atsType in SOURCES)) continue;
    out.push({ source: r.atsType as SourceId, token: r.atsToken, company: r.name });
  }
  return out;
}
