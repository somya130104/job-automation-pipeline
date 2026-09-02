import {
  htmlToText,
  inferEmploymentType,
  inferRemoteType,
  parseDate,
  slugToName,
  type JobSource,
  type NormalizedJob,
} from "./types";

/**
 * Workable public widget API — no auth.
 * https://apply.workable.com/api/v1/widget/accounts/{token}?details=true
 *
 * Quirks:
 *  - Coverage is thinner than the other ATSes: many accounts return an empty
 *    `jobs` array even when the company is hiring, because the widget only
 *    exposes roles the company opted to syndicate. A dead/empty board is not
 *    an error — it just yields nothing.
 *  - `description` + `requirements` + `benefits` are separate HTML fields.
 *  - `telecommuting` boolean is the remote signal.
 */
interface WkJob {
  id?: string | number;
  shortcode?: string;
  title: string;
  full_title?: string;
  department?: string;
  url?: string;
  application_url?: string;
  shortlink?: string;
  location?: { city?: string; country?: string; telecommuting?: boolean };
  telecommuting?: boolean;
  employment_type?: string;
  created_at?: string;
  published_on?: string;
  description?: string;
  requirements?: string;
  benefits?: string;
}

export const workable: JobSource = {
  id: "workable",
  label: "Workable",

  async fetchJobs(token: string): Promise<NormalizedJob[]> {
    const res = await fetch(
      `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(token)}?details=true`,
      { headers: { accept: "application/json" }, cache: "no-store" },
    );
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for workable:${token}`);
    const data = (await res.json()) as { name?: string; jobs?: WkJob[] };
    const jobs = data.jobs ?? [];

    return jobs.map((j) => {
      const loc = j.location ?? {};
      const locations = [loc.city, loc.country].filter(Boolean).map(String);
      const remote = j.telecommuting || loc.telecommuting;
      const body = [j.description, j.requirements, j.benefits]
        .map((h) => htmlToText(h ?? ""))
        .filter(Boolean)
        .join("\n\n");

      return {
        externalId: String(j.shortcode ?? j.id ?? j.title),
        source: "workable",
        sourceToken: token,
        title: j.full_title || j.title,
        company: data.name?.trim() || slugToName(token),
        locations,
        remoteType: remote ? "remote" : inferRemoteType(locations.join(" "), j.title),
        employmentType: inferEmploymentType(j.employment_type, j.title),
        department: j.department ?? null,
        descriptionText: body,
        descriptionHtml: j.description ?? null,
        applyUrl: j.shortlink || j.application_url || j.url || "",
        postedAt: parseDate(j.published_on ?? j.created_at),
      } satisfies NormalizedJob;
    });
  },
};
