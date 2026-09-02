/**
 * Minimal Gemini REST client. No SDK — one fetch, JSON in, JSON out.
 *
 * Every feature that calls this MUST have a deterministic fallback for when
 * GEMINI_API_KEY is absent (Phase 1 ran with zero keys and that must keep
 * working). `geminiEnabled()` is the gate; callers branch on it.
 *
 * Free tier: generous daily quota on the -flash models. We only ever use
 * the current flash alias here — cheap, fast, more than good enough for extraction.
 */

const MODEL = "gemini-flash-latest";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export function geminiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

interface GeminiOpts {
  /** Lower = more deterministic. Extraction wants ~0.1. */
  temperature?: number;
  /** A JSON schema object; when set, the model is forced to emit matching JSON. */
  schema?: Record<string, unknown>;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export class GeminiError extends Error {}

/** Raw text completion. Throws GeminiError on any failure. */
export async function geminiText(
  prompt: string,
  opts: GeminiOpts = {},
): Promise<string> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new GeminiError("GEMINI_API_KEY not set");

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? 30_000,
  );

  try {
    const res = await fetch(`${ENDPOINT}?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.2,
          maxOutputTokens: opts.maxOutputTokens ?? 2048,
          ...(opts.schema
            ? {
                responseMimeType: "application/json",
                responseSchema: opts.schema,
              }
            : {}),
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new GeminiError(`Gemini ${res.status}: ${detail.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new GeminiError("Gemini returned no text");
    return text;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new GeminiError("Gemini request timed out");
    }
    throw err instanceof GeminiError
      ? err
      : new GeminiError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * JSON completion with a schema. Returns the parsed object, or throws
 * GeminiError. The model is instructed via responseSchema, but we still
 * defensively parse — Gemini occasionally wraps JSON in prose despite the
 * mime type.
 */
export async function geminiJson<T>(
  prompt: string,
  schema: Record<string, unknown>,
  opts: Omit<GeminiOpts, "schema"> = {},
): Promise<T> {
  const raw = await geminiText(prompt, { ...opts, schema, temperature: opts.temperature ?? 0.1 });
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    }
    throw new GeminiError(`Could not parse JSON from Gemini: ${trimmed.slice(0, 200)}`);
  }
}
