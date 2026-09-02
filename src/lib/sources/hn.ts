import { geminiEnabled, geminiJson } from "@/lib/llm/gemini";
import { db } from "@/lib/db";
import {
  inferEmploymentType,
  inferRemoteType,
  type NormalizedJob,
} from "./types";

/**
 * Hacker News "Ask HN: Who is hiring?" parser.
 *
 * Official HN Firebase API (no key, no auth). One thread per month, posted by
 * the `whoishiring` account. Each top-level comment is one unstructured job
 * post written by a human in free text — no schema, wildly inconsistent. That
 * is exactly why it is a differentiator: no commercial aggregator parses it
 * well, and turning it into structured rows is a real extraction problem.
 *
 * Parsed results are cached in HnParse by comment id, so re-runs cost nothing
 * (and cost no Gemini quota).
 *
 * Requires GEMINI_API_KEY. With no key this source yields nothing rather than
 * shipping garbage from a regex.
 */

const HN = "https://hacker-news.firebaseio.com/v0";

interface HnItem {
  id: number;
  by?: string;
  time?: number;
  title?: string;
  text?: string;
  kids?: number[];
  type?: string;
  dead?: boolean;
  deleted?: boolean;
}

async function hnItem(id: number): Promise<HnItem | null> {
  try {
    return (await fetch(`${HN}/item/${id}.json`, { cache: "no-store" }).then((r) =>
      r.json(),
    )) as HnItem;
  } catch {
    return null;
  }
}

/** Most recent "Who is hiring?" thread id (not "wants to be hired"). */
export async function currentHiringThread(): Promise<HnItem | null> {
  const user = (await fetch(`${HN}/user/whoishiring.json`, {
    cache: "no-store",
  }).then((r) => r.json())) as { submitted?: number[] };
  const submitted = user.submitted ?? [];

  for (const id of submitted.slice(0, 12)) {
    const item = await hnItem(id);
    if (item?.title && /who is hiring/i.test(item.title)) return item;
  }
  return null;
}

interface ParsedComment {
  isJob: boolean;
  company: string | null;
  role: string | null;
  location: string | null;
  remote: "remote" | "hybrid" | "onsite" | "unknown";
  salary: string | null;
  techStack: string[];
  applyContact: string | null;
}

const SCHEMA = {
  type: "object",
  properties: {
    isJob: { type: "boolean" },
    company: { type: "string", nullable: true },
    role: { type: "string", nullable: true },
    location: { type: "string", nullable: true },
    remote: { type: "string", enum: ["remote", "hybrid", "onsite", "unknown"] },
    salary: { type: "string", nullable: true },
    techStack: { type: "array", items: { type: "string" } },
    applyContact: { type: "string", nullable: true },
  },
  required: ["isJob", "remote", "techStack"],
} as const;

function stripHtml(html: string): string {
  return html
    .replace(/<a[^>]*href="([^"]+)"[^>]*>.*?<\/a>/gi, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function confidenceOf(p: ParsedComment): number {
  if (!p.isJob) return 0;
  let score = 0.4;
  if (p.company) score += 0.2;
  if (p.role) score += 0.2;
  if (p.location || p.remote !== "unknown") score += 0.1;
  if (p.techStack.length) score += 0.1;
  return Math.min(1, score);
}

export interface HnParseSummary {
  threadId: string | null;
  comments: number;
  parsedNow: number;
  fromCache: number;
  jobs: number;
  skipped: number;
}

/**
 * Parse (or re-serve from cache) the current thread's comments. Does NOT write
 * Job rows itself — it fills HnParse; `hnNormalizedJobs()` promotes the
 * confident ones. Split so a low-confidence parse can be reviewed in the UI
 * before it pollutes the feed.
 */
export async function parseHiringThread(
  limit = 120,
): Promise<HnParseSummary> {
  const empty: HnParseSummary = {
    threadId: null,
    comments: 0,
    parsedNow: 0,
    fromCache: 0,
    jobs: 0,
    skipped: 0,
  };
  if (!geminiEnabled()) return empty;

  const thread = await currentHiringThread();
  if (!thread) return empty;

  const kids = (thread.kids ?? []).slice(0, limit);
  let parsedNow = 0;
  let fromCache = 0;
  let jobs = 0;
  let skipped = 0;

  for (const id of kids) {
    const cached = await db.hnParse.findUnique({ where: { id: String(id) } });
    if (cached) {
      fromCache++;
      if ((JSON.parse(cached.parsed) as ParsedComment).isJob) jobs++;
      continue;
    }

    const comment = await hnItem(id);
    if (!comment?.text || comment.dead || comment.deleted) {
      skipped++;
      continue;
    }
    const text = stripHtml(comment.text);
    if (text.length < 60) {
      skipped++;
      continue;
    }

    let parsed: ParsedComment;
    try {
      parsed = await geminiJson<ParsedComment>(
        `You are parsing ONE comment from a Hacker News "Who is hiring?" thread. ` +
          `Each such comment is a single job posting written informally. Extract the fields. ` +
          `If the comment is not actually a job posting (e.g. a meta comment, a joke), set isJob=false. ` +
          `techStack: concrete languages/frameworks/tools only, max 12. ` +
          `salary: copy the stated range verbatim or null. ` +
          `applyContact: the email or URL to apply, or null.\n\nCOMMENT:\n${text.slice(0, 4000)}`,
        SCHEMA as unknown as Record<string, unknown>,
      );
    } catch {
      skipped++;
      continue;
    }

    parsedNow++;
    if (parsed.isJob) jobs++;

    await db.hnParse.create({
      data: {
        id: String(id),
        threadId: String(thread.id),
        raw: text.slice(0, 8000),
        parsed: JSON.stringify(parsed),
        confidence: confidenceOf(parsed),
      },
    });
  }

  return {
    threadId: String(thread.id),
    comments: kids.length,
    parsedNow,
    fromCache,
    jobs,
    skipped,
  };
}

/**
 * Promote cached HN parses above a confidence floor into NormalizedJob shape
 * for the ingest pipeline. Low-confidence rows are held back for UI review.
 */
export async function hnNormalizedJobs(minConfidence = 0.7): Promise<NormalizedJob[]> {
  const rows = await db.hnParse.findMany({
    where: { confidence: { gte: minConfidence } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const out: NormalizedJob[] = [];
  for (const row of rows) {
    const p = JSON.parse(row.parsed) as ParsedComment;
    if (!p.isJob || !p.company || !p.role) continue;

    const blob = `${p.role} ${p.location ?? ""} ${row.raw}`;
    out.push({
      externalId: row.id,
      source: "hn",
      sourceToken: row.threadId,
      title: p.role,
      company: p.company,
      locations: p.location ? [p.location] : [],
      remoteType:
        p.remote !== "unknown" ? p.remote : inferRemoteType(blob),
      employmentType: inferEmploymentType(blob),
      department: null,
      descriptionText: row.raw,
      applyUrl: p.applyContact?.startsWith("http")
        ? p.applyContact
        : `https://news.ycombinator.com/item?id=${row.id}`,
      compensationCurrency: null,
      postedAt: row.createdAt,
    });
  }
  return out;
}
