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
 * Lever postings API — no auth.
 * https://api.lever.co/v0/postings/{token}?mode=json
 *
 * Quirks handled here:
 *  - `createdAt` is epoch *milliseconds* (Greenhouse gives ISO strings).
 *  - The description is split across `descriptionPlain` and a `lists` array of
 *    {text, content} blocks; using only `description` silently drops the
 *    requirements bullets, which is exactly the text the keyword-gap feature
 *    needs most.
 *  - `categories.commitment` carries "Intern"/"Full-time".
 */

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  description?: string;
  descriptionPlain?: string;
  additional?: string;
  additionalPlain?: string;
  lists?: Array<{ text?: string; content?: string }>;
  categories?: {
    location?: string | null;
    allLocations?: string[] | null;
    team?: string | null;
    commitment?: string | null;
    department?: string | null;
  } | null;
  workplaceType?: string | null;
}

export const lever: JobSource = {
  id: "lever",
  label: "Lever",

  async fetchJobs(token: string): Promise<NormalizedJob[]> {
    const postings = await fetchJson<LeverPosting[]>(
      `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`,
    );
    const company = slugToName(token);

    return (postings ?? []).map((post) => {
      // Stitch the intro back together with the bulleted lists and the
      // trailing `additional` block — the requirements bullets live in
      // `lists`, and using `description` alone drops exactly the text the
      // keyword-gap feature depends on.
      const listText = (post.lists ?? [])
        .map((l) => `${l.text ?? ""}\n${htmlToText(l.content ?? "")}`)
        .join("\n\n");
      const descriptionText = [
        post.descriptionPlain ?? htmlToText(post.description ?? ""),
        listText,
        post.additionalPlain ?? htmlToText(post.additional ?? ""),
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim();

      const locations = [
        post.categories?.location,
        ...(post.categories?.allLocations ?? []),
      ].filter((v): v is string => Boolean(v));

      const commitment = post.categories?.commitment ?? null;

      return {
        externalId: post.id,
        source: "lever",
        sourceToken: token,
        title: post.text,
        company,
        locations: [...new Set(locations)],
        remoteType: inferRemoteType(
          post.workplaceType,
          locations.join(" "),
          post.text,
        ),
        employmentType: inferEmploymentType(commitment, post.text),
        department: post.categories?.team ?? post.categories?.department ?? null,
        descriptionText,
        descriptionHtml: post.description ?? null,
        applyUrl: post.applyUrl || post.hostedUrl,
        postedAt: parseDate(post.createdAt),
      } satisfies NormalizedJob;
    });
  },
};
