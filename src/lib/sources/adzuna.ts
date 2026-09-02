import {
  htmlToText,
  inferEmploymentType,
  inferRemoteType,
  parseDate,
  type JobSource,
  type NormalizedJob,
} from "./types";

/**
 * Adzuna Jobs API — official, free tier (~1,000 calls/mo, ~25/min).
 *
 * Per Addendum 2 §16(F): Adzuna is DEMOTED. It returns truncated `description`
 * excerpts and `redirect_url` links that bounce through adzuna.in, both of
 * which quietly degrade keyword-gap analysis. So:
 *   - the feed adapter here is kept deliberately small (a few broad India
 *     queries, capped) as supplementary volume, not the primary source;
 *   - `salaryHistogram()` is the real reason Adzuna stays wired — it powers
 *     the salary reality-check panel on the Insights page, and nothing else
 *     free gives real Indian salary distributions.
 *
 * `token` for this adapter is the search query ("what"). An empty token runs
 * a default set of broad role queries.
 */

const COUNTRY = "in";

function creds(): { id: string; key: string } | null {
  const id = process.env.ADZUNA_APP_ID?.trim();
  const key = process.env.ADZUNA_APP_KEY?.trim();
  return id && key ? { id, key } : null;
}

interface AdzunaJob {
  id: string;
  title: string;
  description?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  created?: string;
  redirect_url: string;
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string; // "1" | "0"
  contract_time?: string; // full_time | part_time
  contract_type?: string; // permanent | contract
  category?: { label?: string };
}

const DEFAULT_QUERIES = [
  "software engineer",
  "frontend developer",
  "backend developer",
  "data analyst",
  "product manager",
];

/** Max pages per query on the feed path — keep the monthly quota intact. */
const MAX_PAGES = 1;
const PER_PAGE = 50;

async function searchOnce(what: string, page: number): Promise<AdzunaJob[]> {
  const c = creds();
  if (!c) return [];
  const url =
    `https://api.adzuna.com/v1/api/jobs/${COUNTRY}/search/${page}` +
    `?app_id=${c.id}&app_key=${c.key}` +
    `&results_per_page=${PER_PAGE}&what=${encodeURIComponent(what)}` +
    `&max_days_old=30&content-type=application/json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for adzuna "${what}"`);
  const data = (await res.json()) as { results?: AdzunaJob[] };
  return data.results ?? [];
}

export const adzuna: JobSource = {
  id: "adzuna",
  label: "Adzuna",

  async fetchJobs(token: string): Promise<NormalizedJob[]> {
    if (!creds()) return []; // no keys -> silently contributes nothing

    const queries = token.trim() ? [token.trim()] : DEFAULT_QUERIES;
    const out: NormalizedJob[] = [];

    for (const what of queries) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const rows = await searchOnce(what, page);
        for (const j of rows) {
          const area = j.location?.area ?? [];
          const locations = j.location?.display_name
            ? [j.location.display_name]
            : area.slice(1);
          const desc = htmlToText(j.description ?? "");
          out.push({
            externalId: String(j.id),
            source: "adzuna",
            sourceToken: token,
            title: j.title,
            company: j.company?.display_name?.trim() || "Undisclosed company",
            locations,
            remoteType: inferRemoteType(locations.join(" "), j.title, desc),
            employmentType: inferEmploymentType(
              j.contract_time,
              j.contract_type,
              j.title,
            ),
            department: j.category?.label ?? null,
            descriptionText: desc,
            applyUrl: j.redirect_url,
            // Predicted salaries are model output, not employer-stated — do not
            // present them as real compensation.
            compensationMin: j.salary_is_predicted === "1" ? null : j.salary_min ?? null,
            compensationMax: j.salary_is_predicted === "1" ? null : j.salary_max ?? null,
            compensationCurrency:
              j.salary_is_predicted !== "1" && (j.salary_min || j.salary_max)
                ? "INR"
                : null,
            postedAt: parseDate(j.created),
          });
        }
        if (rows.length < PER_PAGE) break;
      }
    }
    return out;
  },
};

export interface SalaryHistogram {
  what: string;
  where: string | null;
  currency: string;
  mean: number | null;
  buckets: Array<{ floor: number; count: number }>;
}

/**
 * Real Indian salary distribution for a role, from Adzuna's histogram endpoint.
 * Used by the salary reality-check panel. Returns null if Adzuna isn't
 * configured so the panel can degrade gracefully.
 */
export async function salaryHistogram(
  what: string,
  where?: string,
): Promise<SalaryHistogram | null> {
  const c = creds();
  if (!c || !what.trim()) return null;

  const params = new URLSearchParams({
    app_id: c.id,
    app_key: c.key,
    what: what.trim(),
    "content-type": "application/json",
  });
  if (where?.trim()) params.set("where", where.trim());

  const res = await fetch(
    `https://api.adzuna.com/v1/api/jobs/${COUNTRY}/histogram?${params}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    histogram?: Record<string, number>;
    mean?: number;
  };
  const hist = data.histogram ?? {};
  const buckets = Object.entries(hist)
    .map(([floor, count]) => ({ floor: Number(floor), count }))
    .filter((b) => Number.isFinite(b.floor))
    .sort((a, b) => a.floor - b.floor);

  return {
    what: what.trim(),
    where: where?.trim() || null,
    currency: "INR",
    mean: typeof data.mean === "number" ? Math.round(data.mean) : null,
    buckets,
  };
}
