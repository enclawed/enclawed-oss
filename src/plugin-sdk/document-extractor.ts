// Public contract for document-extraction plugins (PDF/text/image fallback).
//
// Document extractors turn a binary document buffer into extracted text plus
// optional fallback page images for downstream agent consumption.

/** A single extracted fallback image (typically a rendered page). */
export type DocumentExtractedImage = {
  type: "image";
  /** Base64-encoded image bytes. */
  data: string;
  mimeType: string;
};

/** Request handed to a document extractor. */
export type DocumentExtractionRequest = {
  /** Raw document bytes. */
  buffer: ArrayBuffer | Uint8Array;
  /** Document MIME type (e.g. "application/pdf"). */
  mimeType?: string;
  /** Total document size in bytes (used for admission/size checks). */
  byteLength?: number;
  /** Optional source identifier (filesystem path, URI, scheme-qualified prefix). */
  source?: string;
  /** Optional explicit page numbers to extract (1-based). */
  pageNumbers?: number[];
  /** Maximum number of pages to process. */
  maxPages: number;
  /** Minimum extracted text length before falling back to image rendering. */
  minTextChars: number;
  /** Maximum total rendered-image pixel budget across fallback images. */
  maxPixels: number;
  /** Invoked when fallback image extraction fails (non-fatal). */
  onImageExtractionError?: (error: unknown) => void;
};

/** Result returned by a document extractor. */
export type DocumentExtractionResult = {
  text: string;
  images: DocumentExtractedImage[];
};

/** Document-extraction capability registered by a plugin. */
export type DocumentExtractorPlugin = {
  id: string;
  label: string;
  /** MIME types this extractor handles (e.g. "application/pdf"). */
  mimeTypes: string[];
  /** Lower numbers are tried first during auto-detection. */
  autoDetectOrder?: number;
  extract: (request: DocumentExtractionRequest) => Promise<DocumentExtractionResult>;
};
