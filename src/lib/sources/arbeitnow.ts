import {
  htmlToText,
  inferEmploymentType,
  inferRemoteType,
  parseDate,
  type JobSource,
  type NormalizedJob,
} from "./types";

/**
 * Arbeitnow public job-board feed — no auth.
 * https://www.arbeitnow.com/api/job-board-api
 *
 * Quirks:
 *  - `description` is double HTML-entity-encoded (`&lt;p&gt;`), same as
 *    Greenhouse — decode, then strip.
 *  - `remote` is a boolean; `job_types` is a string[] ("full_time").
 *  - `created_at` is epoch seconds.
 *  - EU-heavy board; kept as remote-volume filler, not a primary India source.
 */
interface AnJob {
  slug: string;
  company_name: string;
  title: string;
  description?: string;
  remote?: boolean;
  url: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number;
}

export const arbeitnow: JobSource = {
  id: "arbeitnow",
  label: "Arbeitnow",

  async fetchJobs(): Promise<NormalizedJob[]> {
    const res = await fetch("https://www.arbeitnow.com/api/job-board-api", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for arbeitnow`);
    const data = (await res.json()) as { data?: AnJob[] };

    return (data.data ?? []).map((j) => {
      const decoded = htmlToText(j.description ?? "");
      const text = decoded.includes("<") ? htmlToText(decoded) : decoded;
      return {
        externalId: j.slug,
        source: "arbeitnow",
        sourceToken: "",
        title: j.title,
        company: j.company_name || "Unknown company",
        locations: j.location ? [j.location] : [],
        remoteType: j.remote ? "remote" : inferRemoteType(j.location, j.title),
        employmentType: inferEmploymentType(
          (j.job_types ?? []).join(" "),
          (j.tags ?? []).join(" "),
          j.title,
        ),
        department: j.tags?.[0] ?? null,
        descriptionText: text,
        descriptionHtml: j.description ?? null,
        applyUrl: j.url,
        postedAt: parseDate(j.created_at),
      } satisfies NormalizedJob;
    });
  },
};
