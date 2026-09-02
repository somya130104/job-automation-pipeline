import {
  fetchJson,
  htmlToText,
  inferEmploymentType,
  inferRemoteType,
  parseDate,
  slugToName,
  type JobSource,
  type NormalizedJob,
} from "./types";

/**
 * Greenhouse public job board API — no auth, no key, intended for syndication.
 * https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 *
 * Quirks handled here:
 *  - `content` is HTML *and* HTML-entity-encoded a second time, so a raw
 *    `&lt;p&gt;` shows up. Decode entities before stripping tags.
 *  - `location` is a single free-text string, not a list.
 *  - `updated_at` is present but `first_published` is the real posted date;
 *    older boards omit it.
 */

interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  company_name?: string;
  content?: string;
  updated_at?: string;
  first_published?: string;
  location?: { name?: string } | null;
  offices?: Array<{ name?: string | null }> | null;
  departments?: Array<{ name?: string | null }> | null;
}

export const greenhouse: JobSource = {
  id: "greenhouse",
  label: "Greenhouse",

  async fetchJobs(token: string): Promise<NormalizedJob[]> {
    const data = await fetchJson<{ jobs?: GhJob[] }>(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
    );
    const jobs = data.jobs ?? [];

    return jobs.map((job) => {
      // Greenhouse returns the real display name per posting; the slug is only
      // a fallback for boards that omit it.
      const company = job.company_name?.trim() || slugToName(token);
      // Double-decode: the API returns entity-escaped HTML.
      const html = htmlToText(job.content ?? "");
      const descriptionText = html.includes("<") ? htmlToText(html) : html;

      const locations = [
        job.location?.name,
        ...(job.offices ?? []).map((o) => o?.name),
      ]
        .filter((v): v is string => Boolean(v && v !== "N/A"))
        .filter((v, i, arr) => arr.indexOf(v) === i);

      const department = job.departments?.[0]?.name ?? null;

      return {
        externalId: String(job.id),
        source: "greenhouse",
        sourceToken: token,
        title: job.title,
        company,
        locations,
        remoteType: inferRemoteType(locations.join(" "), job.title),
        employmentType: inferEmploymentType(job.title, department),
        department,
        descriptionText,
        descriptionHtml: job.content ?? null,
        applyUrl: job.absolute_url,
        postedAt: parseDate(job.first_published ?? job.updated_at),
      } satisfies NormalizedJob;
    });
  },
};
