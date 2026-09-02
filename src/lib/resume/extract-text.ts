/**
 * Raw text extraction from an uploaded resume.
 *
 * Both libraries are CommonJS and are `require`d lazily so they stay out of
 * the client bundle and out of any route that never touches a file.
 */

export interface ExtractedText {
  text: string;
  /** True when the file parsed but yielded almost nothing — usually a scan. */
  likelyImageOnly: boolean;
}

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<ExtractedText> {
  const kind = detectKind(mimeType, fileName);

  if (kind === "pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    const text = normalise(result.text ?? "");
    return { text, likelyImageOnly: text.length < 120 };
  }

  if (kind === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const text = normalise(result.value ?? "");
    return { text, likelyImageOnly: false };
  }

  if (kind === "text") {
    return { text: normalise(buffer.toString("utf8")), likelyImageOnly: false };
  }

  throw new UnsupportedResumeError(
    `Unsupported resume format "${mimeType || fileName}". Upload a PDF, DOCX, or TXT.`,
  );
}

export class UnsupportedResumeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedResumeError";
  }
}

function detectKind(
  mimeType: string,
  fileName: string,
): "pdf" | "docx" | "text" | "unknown" {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  // Browsers are inconsistent about resume MIME types (Safari sends
  // application/octet-stream for .docx), so the extension is the tiebreaker.
  if (mimeType.includes("pdf") || ext === "pdf") return "pdf";
  if (
    mimeType.includes("wordprocessingml") ||
    ext === "docx"
  ) {
    return "docx";
  }
  if (mimeType.startsWith("text/") || ext === "txt" || ext === "md") {
    return "text";
  }
  return "unknown";
}

/**
 * PDF extraction produces ragged whitespace and stray form-feeds; downstream
 * regexes assume normalised lines.
 */
function normalise(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
