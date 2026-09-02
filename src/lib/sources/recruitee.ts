import {
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
 * Recruitee public offers API — no auth.
 * https://{token}.recruitee.com/api/offers/
 *
 * Quirks:
 *  - The list endpoint already carries the full `description` + `requirements`
 *    HTML, so unlike SmartRecruiters this is a single call.
 *  - `remote` / `hybrid` / `on_site` are separate booleans; trust them over
 *    string-sniffing the location.
 *  - `careers_apply_url` is the candidate-facing apply link; `careers_url` is
 *    the public detail page. Prefer the detail page as the canonical URL.
 *  - Dates are "2026-08-28 11:47:47 UTC" — not ISO, but `new Date()` parses it.
 */
interface RtOffer {
  id: number | string;
  title?: string;
  slug?: string;
  company_name?: string;
  description?: string;
  requirements?: string;
  employment_type_code?: string;
  department?: string | null;
  city?: string | null;
  country?: string | null;
  location?: string | null;
  locations?: Array<{ city?: string; country?: string; is_remote?: boolean }>;
  remote?: boolean;
  hybrid?: boolean;
  on_site?: boolean;
  careers_url?: string;
  careers_apply_url?: string;
  published_at?: string;
  created_at?: string;
  close_at?: string | null;
}

function remoteOf(o: RtOffer): RemoteType {
  if (o.remote) return "remote";
  if (o.hybrid) return "hybrid";
  if (o.on_site) return "onsite";
  return inferRemoteType(o.location, o.title);
}

export const recruitee: JobSource = {
  id: "recruitee",
  label: "Recruitee",

  async fetchJobs(token: string): Promise<NormalizedJob[]> {
    const res = await fetch(`https://${encodeURIComponent(token)}.recruitee.com/api/offers/`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for recruitee:${token}`);
    const data = (await res.json()) as { offers?: RtOffer[] };
    const offers = data.offers ?? [];

    return offers.map((o) => {
      const locations = o.location
        ? [o.location]
        : [o.city, o.country].filter(Boolean).map(String);
      const body = [htmlToText(o.description ?? ""), htmlToText(o.requirements ?? "")]
        .filter(Boolean)
        .join("\n\n");

      return {
        externalId: String(o.id),
        source: "recruitee",
        sourceToken: token,
        title: o.title ?? "Untitled role",
        company: o.company_name?.trim() || slugToName(token),
        locations,
        remoteType: remoteOf(o),
        employmentType: inferEmploymentType(o.employment_type_code, o.title),
        department: o.department ?? null,
        descriptionText: body,
        descriptionHtml: o.description ?? null,
        applyUrl: o.careers_url || o.careers_apply_url || "",
        applicationDeadline: o.close_at ? new Date(o.close_at) : null,
        postedAt: parseDate(o.published_at ?? o.created_at),
      } satisfies NormalizedJob;
    });
  },
};
