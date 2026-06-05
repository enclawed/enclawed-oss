// Extract human-readable text from an attachment payload. The
// dispatcher routes by MIME type: PDF goes through pdfjs-dist;
// text/* is decoded as UTF-8 (with a Latin-1 fallback for mis-
// labelled bytes); anything else returns a metadata-only summary
// so the LLM gets SOMETHING back instead of a silent failure.
//
// No OCR. Image bytes return their dimensions if we can read them
// cheaply, otherwise just the size. Adding tesseract.js for OCR
// would double the install footprint and pull a wasm runtime —
// out of scope until the operator asks for it.

import { Buffer } from "node:buffer";

export type ExtractInput = Readonly<{
  filename: string;
  contentType: string;
  bytes: Buffer;
  /**
   * Cap on the text returned to the LLM. PDF / text extraction may
   * produce arbitrarily long outputs; truncate to keep the Stage-1
   * prompt within Ollama's context window. Default 8000 chars
   * matches the bodyExcerpt cap and leaves room for the rest of the
   * prompt scaffold.
   */
  maxChars?: number;
}>;

export type ExtractResult = Readonly<{
  kind: "text" | "summary";
  /** The extracted text (kind=text) or a one-line metadata summary (kind=summary). */
  content: string;
  /** True if `content` was truncated to maxChars. */
  truncated: boolean;
}>;

const DEFAULT_MAX_CHARS = 8_000;

export async function extractAttachment(input: ExtractInput): Promise<ExtractResult> {
  const maxChars = input.maxChars ?? DEFAULT_MAX_CHARS;
  const ct = input.contentType.toLowerCase();
  if (ct.startsWith("application/pdf") || input.filename.toLowerCase().endsWith(".pdf")) {
    return await extractPdf(input.bytes, maxChars);
  }
  if (ct.startsWith("text/")) {
    return extractText(input.bytes, maxChars);
  }
  return {
    kind: "summary",
    content: `attachment "${input.filename}" (${input.contentType}, ${input.bytes.byteLength} bytes) — type not text/PDF; cannot extract text content`,
    truncated: false,
  };
}

function extractText(bytes: Buffer, maxChars: number): ExtractResult {
  // Try UTF-8 first. A successful decode that contains no replacement
  // characters means the labelled encoding was correct. If we see the
  // U+FFFD marker, fall back to Latin-1 (windows-1252 is the most
  // common mislabel target on legacy mail).
  const utf8 = bytes.toString("utf8");
  const text = utf8.includes("�") ? bytes.toString("latin1") : utf8;
  const truncated = text.length > maxChars;
  return {
    kind: "text",
    content: truncated ? text.slice(0, maxChars) : text,
    truncated,
  };
}

async function extractPdf(bytes: Buffer, maxChars: number): Promise<ExtractResult> {
  // pdfjs-dist ships an ESM legacy build for Node. The default
  // export is bundled for browser; the `/legacy/build/pdf.mjs` path
  // works in Node without polyfills.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Pass a Uint8Array view rather than a Buffer directly — pdfjs
  // 5.x is stricter about input type checking.
  const data = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const loadingTask = pdfjs.getDocument({
    data,
    // Suppress the worker (we run inline in the daily-loop process).
    disableWorker: true,
    // Don't fetch web fonts; the secretary only needs text, not glyphs.
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
  });
  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (err) {
    return {
      kind: "summary",
      content: `PDF parse failed: ${(err as Error).message}`,
      truncated: false,
    };
  }
  const chunks: string[] = [];
  let total = 0;
  let truncated = false;
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      const piece = typeof (item as { str?: unknown }).str === "string"
        ? (item as { str: string }).str
        : "";
      if (!piece) continue;
      if (total + piece.length + 1 > maxChars) {
        chunks.push(piece.slice(0, Math.max(0, maxChars - total)));
        total = maxChars;
        truncated = true;
        break;
      }
      chunks.push(piece);
      total += piece.length + 1; // +1 for the join space
    }
    if (truncated) break;
    chunks.push("\n");
    total += 1;
  }
  await doc.destroy();
  return {
    kind: "text",
    content: chunks.join(" ").replace(/\s+\n\s+/g, "\n").trim(),
    truncated,
  };
}
