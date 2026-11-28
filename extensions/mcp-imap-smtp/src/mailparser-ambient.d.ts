// Ambient type surface for `mailparser`, which ships JS-only and has no
// community @types package. We declare the narrow subset consumed by
// imap-smtp-transport.ts so the workspace type-checks without adding a
// dependency. If a consumer ever needs more fields, widen this here.
declare module "mailparser" {
  export interface ParsedAttachment {
    /** Original filename from the MIME Content-Disposition / Content-Type. */
    filename?: string;
    /** MIME type. */
    contentType?: string;
    /** "attachment" | "inline" | undefined. */
    contentDisposition?: string;
    /** Reported byte size. */
    size?: number;
    /** Decoded bytes (Buffer in Node). */
    content: Buffer | Uint8Array;
    /** Content-ID, when present (used for inline images). */
    cid?: string;
  }

  export interface ParsedMail {
    text?: string;
    html?: string | false;
    attachments?: ReadonlyArray<ParsedAttachment>;
  }

  export function simpleParser(
    source: Buffer | string | NodeJS.ReadableStream,
  ): Promise<ParsedMail>;
}
