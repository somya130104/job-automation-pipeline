import {
  htmlToText,
  inferEmploymentType,
  parseDate,
  type JobSource,
  type NormalizedJob,
} from "./types";

/**
 * Remotive public feed — no auth, whole-market remote board, so `token` is
 * ignored. https://remotive.com/api/remote-jobs
 *
 * Quirks:
 *  - The response object has "00-warning" / "0-legal-notice" keys alongside
 *    `jobs`; only `jobs` matters.
 *  - `job_type` is snake_case ("full_time", "contract", "internship").
 *  - `candidate_required_location` is a free-text region list, not a city.
 *  - `salary` is a free-text string ("$70k-$90k", often empty) — not parsed
 *    into numbers here; the salary panel uses Adzuna for real distributions.
 */
interface RmJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  company_logo_url?: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

export const remotive: JobSource = {
  id: "remotive",
  label: "Remotive",

  async fetchJobs(): Promise<NormalizedJob[]> {
    const res = await fetch("https://remotive.com/api/remote-jobs", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for remotive`);
    const data = (await res.json()) as { jobs?: RmJob[] };
    const jobs = data.jobs ?? [];

    return jobs.map((j) => ({
      externalId: String(j.id),
      source: "remotive",
      sourceToken: "",
      title: j.title,
      company: j.company_name || "Unknown company",
      companyLogo: j.company_logo_url ?? null,
      locations: j.candidate_required_location
        ? [j.candidate_required_location]
        : ["Remote"],
      remoteType: "remote",
      employmentType: inferEmploymentType(j.job_type, j.title, (j.tags ?? []).join(" ")),
      department: j.category ?? null,
      descriptionText: htmlToText(j.description ?? ""),
      descriptionHtml: j.description ?? null,
      applyUrl: j.url,
      postedAt: parseDate(j.publication_date),
    } satisfies NormalizedJob));
  },
};
