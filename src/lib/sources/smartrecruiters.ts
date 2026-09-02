import {
  fetchJson,
  htmlToText,
  inferEmploymentType,
  parseDate,
  slugToName,
  type JobSource,
  type NormalizedJob,
  type RemoteType,
} from "./types";

/**
 * SmartRecruiters public postings API — no auth.
 * https://api.smartrecruiters.com/v1/companies/{token}/postings
 *
 * The awkward one of the set, and the reason it needed its own handling:
 *
 *  - The list endpoint returns NO job description at all. The JD lives on a
 *    per-posting detail call, so this adapter is inherently N+1. Everything
 *    downstream (scoring, keyword gaps) needs the description, so there is no
 *    shortcut — we just have to throttle the detail fetches politely.
 *  - The description is split across jobAd.sections.{companyDescription,
 *    jobDescription,qualifications,additionalInformation}, several of which are
 *    routinely empty strings. `qualifications` is the section the keyword-gap
 *    feature cares about most, so all of them get stitched together.
 *  - Pagination is offset/limit with a `totalFound` count, capped at 100/page.
 *  - `location` carries real `remote`/`hybrid` booleans — more reliable than
 *    sniffing strings, and unlike Ashby's isRemote they mean what they say.
 */

interface SrLocation {
  city?: string;
  region?: string;
  country?: string;
  fullLocation?: string;
  remote?: boolean;
  hybrid?: boolean;
}

interface SrPosting {
  id: string;
  name: string;
  releasedDate?: string;
  location?: SrLocation;
  department?: { label?: string };
  function?: { label?: string };
  typeOfEmployment?: { label?: string };
  experienceLevel?: { label?: string };
  company?: { name?: string };
}

interface SrDetail {
  applyUrl?: string;
  postingUrl?: string;
  jobAd?: {
    sections?: Record<string, { title?: string; text?: string } | undefined>;
  };
}

const DETAIL_CONCURRENCY = 4;
/** Guard against pulling thousands of detail pages off one huge board. */
const MAX_POSTINGS = 120;

function locationOf(loc: SrLocation | undefined): string[] {
  if (!loc) return [];
  if (loc.fullLocation) return [loc.fullLocation];
  const parts = [loc.city, loc.region, loc.country?.toUpperCase()].filter(
    Boolean,
  );
  return parts.length ? [parts.join(", ")] : [];
}

function remoteOf(loc: SrLocation | undefined): RemoteType {
  if (!loc) return "unknown";
  if (loc.remote) return "remote";
  if (loc.hybrid) return "hybrid";
  return "onsite";
}

/** Stitch the JD back together from sections, several of which are empty. */
function descriptionOf(detail: SrDetail): string {
  const sections = detail.jobAd?.sections ?? {};
  // Order matters: role first, then requirements. companyDescription is
  // boilerplate and goes last so it doesn't dominate the excerpt.
  const order = [
    "jobDescription",
    "qualifications",
    "additionalInformation",
    "companyDescription",
  ];
  return order
    .map((key) => htmlToText(sections[key]?.text ?? ""))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export const smartrecruiters: JobSource = {
  id: "smartrecruiters",
  label: "SmartRecruiters",

  async fetchJobs(token: string): Promise<NormalizedJob[]> {
    const postings: SrPosting[] = [];
    let offset = 0;

    // Page through the list endpoint first — cheap, one call per 100.
    while (postings.length < MAX_POSTINGS) {
      const page = await fetchJson<{
        content?: SrPosting[];
        totalFound?: number;
      }>(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=100&offset=${offset}`,
      );
      const batch = page.content ?? [];
      postings.push(...batch);
      offset += batch.length;
      if (batch.length === 0 || offset >= (page.totalFound ?? 0)) break;
    }

    const slice = postings.slice(0, MAX_POSTINGS);
    const results: NormalizedJob[] = [];
    const queue = [...slice];

    // Bounded concurrency over the detail calls. A failed detail fetch drops
    // that one posting rather than failing the whole board.
    async function worker() {
      while (queue.length) {
        const post = queue.shift();
        if (!post) return;

        let detail: SrDetail;
        try {
          detail = await fetchJson<SrDetail>(
            `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings/${post.id}`,
          );
        } catch {
          continue;
        }

        const applyUrl = detail.applyUrl || detail.postingUrl || "";
        if (!applyUrl) continue;

        results.push({
          externalId: String(post.id),
          source: "smartrecruiters",
          sourceToken: token,
          title: post.name,
          company: post.company?.name
            ? // SmartRecruiters shouts the company name ("SWIGGY").
              slugToName(post.company.name.toLowerCase())
            : slugToName(token),
          locations: locationOf(post.location),
          remoteType: remoteOf(post.location),
          employmentType: inferEmploymentType(
            post.typeOfEmployment?.label,
            post.experienceLevel?.label,
            post.name,
          ),
          department: post.department?.label ?? post.function?.label ?? null,
          descriptionText: descriptionOf(detail),
          applyUrl,
          postedAt: parseDate(post.releasedDate),
        });
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(DETAIL_CONCURRENCY, queue.length) }, worker),
    );

    return results;
  },
};
