import { createRequire } from "node:module";
import path from "node:path";
import type {
  DocumentExtractedImage,
  DocumentExtractionRequest,
  DocumentExtractionResult,
  DocumentExtractorPlugin,
} from "@enclawed/plugin-sdk/document-extractor";
import type * as PdfJsLegacy from "pdfjs-dist/legacy/build/pdf.mjs";

type CanvasLike = {
  toBuffer(type: "image/png"): Buffer;
};

type CanvasModule = {
  createCanvas(width: number, height: number): CanvasLike;
};

type PdfTextItem = {
  str: string;
};

type PdfTextContent = {
  items: Array<PdfTextItem | object>;
};

type PdfViewport = {
  width: number;
  height: number;
};

type PdfPage = {
  getTextContent(): Promise<PdfTextContent>;
  getViewport(params: { scale: number }): PdfViewport;
  render(params: { canvas: unknown; viewport: PdfViewport }): { promise: Promise<void> };
};

type PdfDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
};

/** Subset of pdfjs `getDocument` init params this extractor relies on. */
type PdfGetDocumentParams = {
  data: Uint8Array;
  disableWorker?: boolean;
  standardFontDataUrl?: string;
};

/**
 * Narrow structural view of the pdfjs legacy module this extractor uses. The
 * legacy `.mjs` build ships no `.d.ts`, so TypeScript infers a too-narrow
 * `getDocument` overload; declaring the params we pass keeps the call typed
 * against the real (documented) pdfjs `DocumentInitParameters` surface.
 */
type PdfJsModule = Omit<typeof PdfJsLegacy, "getDocument"> & {
  getDocument(params: PdfGetDocumentParams): { promise: Promise<unknown> };
};

const CANVAS_MODULE = "@napi-rs/canvas";
const PDFJS_MODULE = "pdfjs-dist/legacy/build/pdf.mjs";
const MAX_EXTRACTED_TEXT_CHARS = 200_000;
const MAX_RENDER_DIMENSION = 10_000;
const require = createRequire(import.meta.url);

let canvasModulePromise: Promise<CanvasModule> | null = null;
let pdfJsModulePromise: Promise<PdfJsModule> | null = null;
let pdfJsStandardFontDataPath: string | null = null;

async function loadCanvasModule(): Promise<CanvasModule> {
  if (!canvasModulePromise) {
    canvasModulePromise = (import(CANVAS_MODULE) as Promise<CanvasModule>).catch((err) => {
      canvasModulePromise = null;
      throw new Error("Optional dependency @napi-rs/canvas is required for PDF image extraction", {
        cause: err,
      });
    });
  }
  return canvasModulePromise;
}

async function loadPdfJsModule(): Promise<PdfJsModule> {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = (import(PDFJS_MODULE) as Promise<PdfJsModule>).catch((err) => {
      pdfJsModulePromise = null;
      throw new Error("Optional dependency pdfjs-dist is required for PDF extraction", {
        cause: err,
      });
    });
  }
  return pdfJsModulePromise;
}

function resolvePdfJsStandardFontDataPath(): string {
  if (!pdfJsStandardFontDataPath) {
    const pdfJsPackageJsonPath = require.resolve("pdfjs-dist/package.json");
    pdfJsStandardFontDataPath =
      path.join(path.dirname(pdfJsPackageJsonPath), "standard_fonts") + "/";
  }
  return pdfJsStandardFontDataPath;
}

function appendTextWithinLimit(parts: string[], pageText: string, currentLength: number): number {
  if (!pageText) {
    return currentLength;
  }
  const remaining = MAX_EXTRACTED_TEXT_CHARS - currentLength;
  if (remaining <= 0) {
    return currentLength;
  }
  const nextText = pageText.length > remaining ? pageText.slice(0, remaining) : pageText;
  parts.push(nextText);
  return currentLength + nextText.length;
}

function resolveRenderPlan(
  viewport: PdfViewport,
  remainingPixels: number,
): { scale: number; width: number; height: number; pixels: number } | null {
  if (
    remainingPixels <= 0 ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return null;
  }

  const pagePixels = Math.max(1, viewport.width * viewport.height);
  const maxScale = Math.min(
    1,
    Math.sqrt(remainingPixels / pagePixels),
    MAX_RENDER_DIMENSION / viewport.width,
    MAX_RENDER_DIMENSION / viewport.height,
  );
  if (!Number.isFinite(maxScale) || maxScale <= 0) {
    return null;
  }

  let best: { scale: number; width: number; height: number; pixels: number } | null = null;
  let low = 0;
  let high = maxScale;
  for (let i = 0; i < 32; i += 1) {
    const scale = (low + high) / 2;
    const width = Math.max(1, Math.ceil(viewport.width * scale));
    const height = Math.max(1, Math.ceil(viewport.height * scale));
    const pixels = width * height;
    if (
      width <= MAX_RENDER_DIMENSION &&
      height <= MAX_RENDER_DIMENSION &&
      pixels <= remainingPixels
    ) {
      best = { scale, width, height, pixels };
      low = scale;
    } else {
      high = scale;
    }
  }
  return best;
}

async function extractPdfContent(
  request: DocumentExtractionRequest,
): Promise<DocumentExtractionResult> {
  const pdfJsModule = await loadPdfJsModule();
  const pdf = (await pdfJsModule.getDocument({
    data: new Uint8Array(request.buffer),
    disableWorker: true,
    standardFontDataUrl: resolvePdfJsStandardFontDataPath(),
  }).promise) as PdfDocument;

  const effectivePages: number[] = request.pageNumbers
    ? request.pageNumbers.filter((p) => p >= 1 && p <= pdf.numPages).slice(0, request.maxPages)
    : Array.from({ length: Math.min(pdf.numPages, request.maxPages) }, (_, i) => i + 1);

  const textParts: string[] = [];
  let extractedTextLength = 0;
  for (const pageNum of effectivePages) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ");
    if (pageText) {
      extractedTextLength = appendTextWithinLimit(textParts, pageText, extractedTextLength);
      if (extractedTextLength >= MAX_EXTRACTED_TEXT_CHARS) {
        break;
      }
    }
  }

  const text = textParts.join("\n\n");
  if (text.trim().length >= request.minTextChars) {
    return { text, images: [] };
  }

  let canvasModule: CanvasModule;
  try {
    canvasModule = await loadCanvasModule();
  } catch (err) {
    request.onImageExtractionError?.(err);
    return { text, images: [] };
  }

  const images: DocumentExtractedImage[] = [];
  let remainingPixels = Math.max(1, Math.floor(request.maxPixels));

  for (const pageNum of effectivePages) {
    if (remainingPixels <= 0) {
      break;
    }
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const plan = resolveRenderPlan(viewport, remainingPixels);
    if (!plan) {
      break;
    }
    const scaled = page.getViewport({ scale: plan.scale });
    const canvas = canvasModule.createCanvas(plan.width, plan.height);
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      viewport: scaled,
    }).promise;
    const png = canvas.toBuffer("image/png");
    images.push({ type: "image", data: png.toString("base64"), mimeType: "image/png" });
    remainingPixels -= plan.pixels;
  }

  return { text, images };
}

export function createPdfDocumentExtractor(): DocumentExtractorPlugin {
  return {
    id: "pdf",
    label: "PDF",
    mimeTypes: ["application/pdf"],
    autoDetectOrder: 10,
    extract: extractPdfContent,
  };
}

/**
 * Per-extension config knobs sourced from `extensions.document-extract` in
 * the host JSON config. `allowedSources` is a list of allowed source-path
 * prefixes (filesystem roots, or scheme-qualified prefixes like
 * `file:///srv/uploads`); `maxFileSizeMB` is an upper bound on the input
 * buffer size, in megabytes.
 *
 * Both keys are optional. When `allowedSources` is omitted or empty, every
 * source is accepted (back-compat). When `maxFileSizeMB` is omitted or 0,
 * the size check is skipped.
 */
export type DocumentExtractConfig = {
  allowedSources?: ReadonlyArray<string>;
  maxFileSizeMB?: number;
};

export class DocumentExtractConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentExtractConfigError";
  }
}

const VALID_DOCUMENT_EXTRACT_KEYS = new Set([
  "allowedSources",
  "maxFileSizeMB",
]);

export function parseDocumentExtractConfig(raw: unknown): DocumentExtractConfig {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new DocumentExtractConfigError(
      "extensions.document-extract config must be an object",
    );
  }
  const cfg = raw as Record<string, unknown>;
  for (const key of Object.keys(cfg)) {
    if (!VALID_DOCUMENT_EXTRACT_KEYS.has(key)) {
      throw new DocumentExtractConfigError(
        `extensions.document-extract: unknown key "${key}"`,
      );
    }
  }
  const out: DocumentExtractConfig = {};
  if (cfg.allowedSources !== undefined) {
    if (!Array.isArray(cfg.allowedSources)) {
      throw new DocumentExtractConfigError(
        "extensions.document-extract.allowedSources must be an array of strings",
      );
    }
    for (const s of cfg.allowedSources) {
      if (typeof s !== "string" || !s.length) {
        throw new DocumentExtractConfigError(
          "extensions.document-extract.allowedSources entries must be non-empty strings",
        );
      }
    }
    out.allowedSources = Object.freeze([...(cfg.allowedSources as string[])]);
  }
  if (cfg.maxFileSizeMB !== undefined) {
    const v = cfg.maxFileSizeMB;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      throw new DocumentExtractConfigError(
        "extensions.document-extract.maxFileSizeMB must be a non-negative number",
      );
    }
    out.maxFileSizeMB = v;
  }
  return out;
}

/**
 * Decide whether a source URI is admissible under `allowedSources`. When
 * the allowlist is empty/undefined every source is allowed (back-compat).
 * Matching is prefix-based on the normalized string (no globbing).
 */
export function isSourceAllowed(
  source: string | undefined,
  allowed: ReadonlyArray<string> | undefined,
): boolean {
  if (!allowed || allowed.length === 0) return true;
  if (!source) return false;
  for (const prefix of allowed) {
    if (source.startsWith(prefix)) return true;
  }
  return false;
}

export class DocumentExtractAdmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentExtractAdmissionError";
  }
}

/**
 * Run the configured admission checks against an extraction request before
 * delegating to the real extractor. Throws if the request violates either
 * `allowedSources` or `maxFileSizeMB`.
 *
 * The host passes the `source` it has (filesystem path, `mcp://` URI,
 * `data:` URI, etc.) along with the byte length of the buffer; this
 * function is intentionally pure so it can be unit-tested without loading
 * pdfjs/canvas.
 */
export function admitExtractionRequest(
  config: DocumentExtractConfig,
  request: { source?: string; byteLength: number },
): void {
  if (!isSourceAllowed(request.source, config.allowedSources)) {
    throw new DocumentExtractAdmissionError(
      `document-extract: source ${request.source ?? "(unknown)"} is not on allowedSources`,
    );
  }
  if (
    typeof config.maxFileSizeMB === "number" &&
    config.maxFileSizeMB > 0 &&
    request.byteLength > config.maxFileSizeMB * 1024 * 1024
  ) {
    throw new DocumentExtractAdmissionError(
      `document-extract: file size ${(request.byteLength / 1024 / 1024).toFixed(
        2,
      )} MB exceeds maxFileSizeMB=${config.maxFileSizeMB}`,
    );
  }
}

/**
 * Factory that wraps the default PDF extractor with the configured
 * admission checks. The host plugin entry calls this with the parsed
 * config block.
 */
export function createPdfDocumentExtractorWithConfig(
  config: DocumentExtractConfig,
): DocumentExtractorPlugin {
  return {
    id: "pdf",
    label: "PDF",
    mimeTypes: ["application/pdf"],
    autoDetectOrder: 10,
    extract: async (request) => {
      const buf = request.buffer;
      const byteLength =
        buf instanceof ArrayBuffer
          ? buf.byteLength
          : (buf as { byteLength?: number }).byteLength ?? 0;
      const source =
        (request as unknown as { source?: string; uri?: string; path?: string }).source
        ?? (request as unknown as { source?: string; uri?: string; path?: string }).uri
        ?? (request as unknown as { source?: string; uri?: string; path?: string }).path;
      admitExtractionRequest(config, { source, byteLength });
      return extractPdfContent(request);
    },
  };
}
