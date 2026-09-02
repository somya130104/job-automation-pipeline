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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Embed one string -> 768-d unit vector.
 *
 * Retries 429s (the free tier caps embedding calls per minute) with
 * exponential backoff. Other errors fail fast so the caller can fall back to
 * keyword-only scoring.
 */
export async function embed(text: string, retries = 4): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new EmbedError("GEMINI_API_KEY not set");

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}/${MODEL}:embedContent?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text: clean(text) }] },
        outputDimensionality: DIM,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (res.status === 429 && attempt < retries) {
      await sleep(2_000 * 2 ** attempt); // 2s, 4s, 8s, 16s
      continue;
    }
    if (!res.ok) {
      throw new EmbedError(`Gemini embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as { embedding?: { values?: number[] } };
    const values = data.embedding?.values;
    if (!values?.length) throw new EmbedError("Gemini embed returned no vector");
    return normalise(values);
  }
}

/**
 * Embed many strings. The free-tier batchEmbedContents endpoint counts each
 * item against a low per-minute quota and 429s almost immediately, so this
 * fans out single `embed()` calls at a bounded concurrency instead — each with
 * its own 429 backoff. Slower but it actually completes on the free tier.
 */
export async function embedMany(texts: string[], concurrency = 4): Promise<number[][]> {
  const out: number[][] = new Array(texts.length);
  let next = 0;

  async function worker() {
    while (next < texts.length) {
      const i = next++;
      out[i] = await embed(texts[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, texts.length) }, worker),
  );
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
