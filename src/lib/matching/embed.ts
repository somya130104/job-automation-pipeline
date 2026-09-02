import { createHash } from "node:crypto";

/**
 * Local sentence embeddings via @xenova/transformers (all-MiniLM-L6-v2, 384-d).
 * Runs fully on-device, zero API cost. The model (~90MB) downloads once on the
 * first call and is then cached under node_modules/@xenova/transformers/.cache.
 *
 * SQLite has no vector column, so embeddings are stored as JSON float arrays
 * on Job.embedding / Resume.embedding and cosine similarity is computed in JS.
 * With a few thousand jobs that is entirely fine; the pgvector path is a
 * drop-in swap when this moves to Supabase (change storage + the query, not
 * the scoring math).
 */

const MODEL = "Xenova/all-MiniLM-L6-v2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipePromise: Promise<any> | null = null;

async function getPipe() {
  if (!pipePromise) {
    pipePromise = import("@xenova/transformers").then(async (mod) => {
      // Quantised weights: ~1/4 the size, no measurable quality loss for
      // similarity ranking.
      mod.env.allowLocalModels = false;
      return mod.pipeline("feature-extraction", MODEL, { quantized: true });
    });
  }
  return pipePromise;
}

export function embedHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Embed one string -> 384-d unit vector (mean-pooled, normalised). */
export async function embed(text: string): Promise<number[]> {
  const pipe = await getPipe();
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 4000);
  const output = await pipe(clean || "empty", { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

/** Embed many strings with a small batch size to bound memory. */
export async function embedMany(texts: string[], batch = 16): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batch) {
    const slice = texts.slice(i, i + batch);
    out.push(...(await Promise.all(slice.map(embed))));
  }
  return out;
}

/** Cosine similarity of two equal-length vectors. Inputs are already unit
 * vectors from `embed`, so this is just the dot product — kept explicit for
 * when a caller passes non-normalised input. */
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
