import {
  fetchJson,
  htmlToText,
  inferEmploymentType,
  inferRemoteType,
  parseDate,
  slugToName,
  type JobSource,
  type NormalizedJob,
  type RemoteType,
} from "./types";

/**
 * Ashby public job board API — no auth, and the best structured compensation
 * data of the three big ATSes.
 * https://api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true
 *
 * Quirks handled here:
 *  - Compensation is a nested `compensation.compensationTiers[].components[]`
 *    tree, not min/max fields. Only the Salary component is money; Equity
 *    components have values like "0.1%" that must not be read as salary.
 *  - `isRemote` is a trap. It is `true` for Hybrid roles too — it really means
 *    "not strictly in-office". Verified against Notion's board, where all 89
 *    postings are `workplaceType: "Hybrid"` with `isRemote: true`. Reading it
 *    as "remote" floods the remote filter with onsite-in-a-named-city roles,
 *    so `workplaceType` is the field to trust.
 *  - `publishedAt` is missing on some boards; fall back to `updatedAt`.
 */

interface AshbyComponent {
  compensationType?: string; // "Salary" | "EquityPercentage" | "EquityUnits" ...
  interval?: string;
  currencyCode?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
}

interface AshbyJob {
  id: string;
  title: string;
  location?: string | null;
  secondaryLocations?: Array<{ location?: string }> | null;
  department?: string | null;
  team?: string | null;
  employmentType?: string | null;
  isRemote?: boolean;
  workplaceType?: string | null; // "Remote" | "Hybrid" | "Onsite"
  descriptionHtml?: string | null;
  descriptionPlain?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  jobUrl?: string;
  applyUrl?: string;
  compensation?: {
    compensationTiers?: Array<{ components?: AshbyComponent[] }>;
  } | null;
}

function extractSalary(job: AshbyJob) {
  const components = (job.compensation?.compensationTiers ?? []).flatMap(
    (tier) => tier.components ?? [],
  );
  // Equity components carry percentages; treating them as salary produces
  // "₹0 – ₹1" cards. Only Salary components are money.
  const salary = components.find(
    (c) => c.compensationType === "Salary" && (c.minValue || c.maxValue),
  );
  if (!salary) return { min: null, max: null, currency: null };

  // Ashby writes the interval as "1 YEAR" / "1 HOUR" / "1 MONTH" (not the
  // PER_YEAR enum the docs imply), so match on the unit rather than the
  // whole string — that survives either spelling.
  const annualise = (v: number | null | undefined) => {
    if (v == null) return null;
    const interval = salary.interval ?? "";
    if (/hour/i.test(interval)) return Math.round(v * 2080);
    if (/month/i.test(interval)) return Math.round(v * 12);
    if (/week/i.test(interval)) return Math.round(v * 52);
    if (/day/i.test(interval)) return Math.round(v * 260);
    return Math.round(v);
  };

  return {
    min: annualise(salary.minValue),
    max: annualise(salary.maxValue),
    currency: salary.currencyCode ?? null,
  };
}

function mapWorkplaceType(job: AshbyJob, locations: string[]): RemoteType {
  switch (job.workplaceType?.toLowerCase()) {
    case "remote":
      return "remote";
    case "hybrid":
      return "hybrid";
    case "onsite":
    case "inoffice":
    case "in office":
      return "onsite";
    default:
      // No workplaceType on this board — fall back to sniffing, and only then
      // let isRemote act as a weak tiebreaker.
      return inferRemoteType(
        locations.join(" "),
        job.title,
        job.isRemote ? "remote" : null,
      );
  }
}

export const ashby: JobSource = {
  id: "ashby",
  label: "Ashby",

  async fetchJobs(token: string): Promise<NormalizedJob[]> {
    const data = await fetchJson<{ jobs?: AshbyJob[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`,
    );
    const jobs = data.jobs ?? [];
    const company = slugToName(token);

    return jobs.map((job) => {
      const locations = [
        job.location,
        ...(job.secondaryLocations ?? []).map((l) => l?.location),
      ].filter((v): v is string => Boolean(v));

      const salary = extractSalary(job);
      const descriptionText =
        job.descriptionPlain?.trim() || htmlToText(job.descriptionHtml ?? "");

      return {
        externalId: job.id,
        source: "ashby",
        sourceToken: token,
        title: job.title,
        company,
        locations: [...new Set(locations)],
        remoteType: mapWorkplaceType(job, locations),
        employmentType: inferEmploymentType(job.employmentType, job.title),
        department: job.department ?? job.team ?? null,
        descriptionText,
        descriptionHtml: job.descriptionHtml ?? null,
        applyUrl: job.applyUrl || job.jobUrl || "",
        compensationMin: salary.min,
        compensationMax: salary.max,
        compensationCurrency: salary.currency,
        postedAt: parseDate(job.publishedAt ?? job.updatedAt),
      } satisfies NormalizedJob;
    });
  },
};
