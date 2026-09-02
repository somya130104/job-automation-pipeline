import { createHash } from "node:crypto";

/**
 * Sentence embeddings via the Gemini embedding API (gemini-embedding-001).
 *
 * This used to run all-MiniLM-L6-v2 locally through @xenova/transformers, but
 * that pulls ~180MB of onnxruntime native binaries which blows Vercel's
 * serverless function size limit. Gemini embeddings are one HTTP call, no
 * native deps, and the key is already configured.
 *
 * SQLite/Postgres both store the vector as a JSON float array on
 * Job.embedding / Resume.embedding; cosine similarity is computed in JS. The
 * pgvector path is a drop-in swap when it's worth it (change storage + the
 * query, not the scoring math).
 *
 * Requesting a reduced 768-dim vector (Matryoshka) keeps rows small. Truncated
 * Gemini embeddings are NOT unit-norm, so we renormalise here.
 */

const MODEL = "gemini-embedding-001";
const DIM = 768;
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Model tag folded into the cache key so a model change invalidates vectors. */
const EMBED_TAG = `${MODEL}@${DIM}`;

export function embeddingsEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function embedHash(text: string): string {
  return createHash("sha256").update(`${EMBED_TAG}\n${text}`).digest("hex").slice(0, 20);
}

function normalise(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n);
  return n === 0 ? v : v.map((x) => x / n);
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 8000) || "empty";
}

class EmbedError extends Error {}

/** Embed one string -> 768-d unit vector. */
export async function embed(text: string): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new EmbedError("GEMINI_API_KEY not set");

  const res = await fetch(`${BASE}/${MODEL}:embedContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text: clean(text) }] },
      outputDimensionality: DIM,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new EmbedError(`Gemini embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { embedding?: { values?: number[] } };
  const values = data.embedding?.values;
  if (!values?.length) throw new EmbedError("Gemini embed returned no vector");
  return normalise(values);
}

/**
 * Embed many strings via batchEmbedContents. Chunked at 100 (API cap) with a
 * small delay between chunks to stay well under the free-tier rate limit.
 */
export async function embedMany(texts: string[], chunk = 100): Promise<number[][]> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new EmbedError("GEMINI_API_KEY not set");

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += chunk) {
    const slice = texts.slice(i, i + chunk);
    const res = await fetch(`${BASE}/${MODEL}:batchEmbedContents?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requests: slice.map((t) => ({
          model: `models/${MODEL}`,
          content: { parts: [{ text: clean(t) }] },
          outputDimensionality: DIM,
        })),
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      throw new EmbedError(`Gemini batch embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as { embeddings?: Array<{ values?: number[] }> };
    for (const e of data.embeddings ?? []) {
      out.push(normalise(e.values ?? []));
    }
    if (i + chunk < texts.length) await new Promise((r) => setTimeout(r, 300));
  }
  return out;
}

/** Cosine similarity. Inputs from `embed`/`embedMany` are unit vectors. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function parseEmbedding(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length ? (arr as number[]) : null;
  } catch {
    return null;
  }
}
