import {
  fetchJson,
  htmlToText,
  inferEmploymentType,
  parseDate,
  type JobSource,
  type NormalizedJob,
} from "./types";

/**
 * RemoteOK public JSON feed — no auth, whole-market feed rather than
 * per-company, so `token` is ignored.
 *
 * Quirks handled here:
 *  - Element 0 of the array is a legal/attribution notice, NOT a job. Dropping
 *    it by index is the documented contract.
 *  - Salary arrives as `salary_min`/`salary_max` numbers in USD, sometimes 0
 *    (meaning "unspecified", not "unpaid").
 *  - `date` is ISO, `epoch` is seconds — prefer epoch, it's always present.
 */

interface RokJob {
  slug?: string;
  id?: string | number;
  epoch?: number;
  date?: string;
  company?: string;
  company_logo?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  url?: string;
  apply_url?: string;
}

export const remoteok: JobSource = {
  id: "remoteok",
  label: "RemoteOK",

  async fetchJobs(): Promise<NormalizedJob[]> {
    const raw = await fetchJson<Array<RokJob & { legal?: string }>>(
      "https://remoteok.com/api",
    );
    if (!Array.isArray(raw)) return [];

    // First entry is the attribution notice, not a posting.
    const rows = raw.filter((row) => !("legal" in row) && row.position);

    return rows.map((job) => {
      const externalId = String(job.id ?? job.slug ?? job.url ?? "");
      const tags = job.tags ?? [];

      return {
        externalId,
        source: "remoteok",
        sourceToken: "",
        title: job.position ?? "Untitled role",
        company: job.company ?? "Unknown company",
        companyLogo: job.company_logo ?? null,
        // RemoteOK's `location` is often "Worldwide" or an empty string.
        locations: job.location ? [job.location] : ["Remote"],
        remoteType: "remote", // the entire board is remote by definition
        employmentType: inferEmploymentType(
          job.position,
          tags.join(" "),
        ),
        department: tags[0] ?? null,
        descriptionText: htmlToText(job.description ?? ""),
        descriptionHtml: job.description ?? null,
        applyUrl: job.apply_url || job.url || "",
        // 0 means "not stated" on this feed, not "zero salary".
        compensationMin: job.salary_min || null,
        compensationMax: job.salary_max || null,
        compensationCurrency: job.salary_min || job.salary_max ? "USD" : null,
        postedAt: parseDate(job.epoch ?? job.date),
      } satisfies NormalizedJob;
    });
  },
};
