// Fetch + extract the readable text of an arbitrary URL through the
// r.jina.ai reverse-proxy reader service. Free, no key, no signup —
// the "normal folks" path. The reader returns clean markdown stripped
// of nav / chrome / scripts, which is exactly what an LLM needs to
// summarize a page. The egress guard only needs to allow r.jina.ai,
// not the entire web, so the security profile stays narrow.
//
// All output is run through the framework's DLP redactor on the
// "critical" cluster (same prompt-injection patterns as web_search)
// before the LLM ever sees the page content.

import {
  CAPABILITY,
  dlpRedact,
  makeCall,
  type GateOutcome,
  type SkillGate,
} from "enclawed/framework";

const SECRETARY_SKILL_ID = "enclawed-app-secretary";
const READER_ENDPOINT_PREFIX = "https://r.jina.ai/";
const DEFAULT_MAX_CHARS = 12_000;
const HARD_MAX_CHARS = 32_000;
const REQUEST_TIMEOUT_MS = 15_000;

export const READ_URL_EGRESS_HOST = "r.jina.ai";

export type ReadUrlResult = Readonly<{
  url: string;
  /** Reader-extracted text (markdown-ish), DLP-redacted. */
  content: string;
  /** True if the content was truncated to maxChars. */
  truncated: boolean;
}>;

export class ReadUrlToolError extends Error {
  constructor(public readonly outcome: GateOutcome) {
    super(`read-url dispatch ${outcome.kind}`);
    this.name = "ReadUrlToolError";
  }
}

export class ReadUrlTool {
  private readonly gate: SkillGate;
  private readonly log: (level: "info" | "warn" | "error", msg: string) => void;

  constructor(opts: {
    gate: SkillGate;
    log?: (level: "info" | "warn" | "error", msg: string) => void;
  }) {
    this.gate = opts.gate;
    this.log =
      opts.log ??
      ((level, msg) => {
        const stream = level === "info" ? process.stdout : process.stderr;
        stream.write(`[read-url ${level}] ${msg}\n`);
      });
  }

  async read(url: string, maxChars: number = DEFAULT_MAX_CHARS): Promise<ReadUrlResult> {
    const trimmedUrl = url.trim();
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      throw new Error("read-url: url must start with http:// or https://");
    }
    const cap = Math.max(500, Math.min(HARD_MAX_CHARS, Math.floor(maxChars)));
    const target = `read-url:${cap}?u=${encodeURIComponent(trimmedUrl.slice(0, 200))}`;
    const call = makeCall({
      cap: CAPABILITY.FS_READ,
      target,
      args: { url: trimmedUrl, maxChars: cap },
    });

    let captured: ReadUrlResult = { url: trimmedUrl, content: "", truncated: false };
    const outcome = await this.gate.dispatch({
      skillId: SECRETARY_SKILL_ID,
      call,
      execute: async () => {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
        let resp: Response;
        try {
          // r.jina.ai accepts any URL appended after the slash. It
          // returns the page's readable text as markdown with a small
          // metadata header. No key, no signup.
          resp = await fetch(READER_ENDPOINT_PREFIX + trimmedUrl, {
            method: "GET",
            headers: {
              Accept: "text/plain, text/markdown, */*",
              "User-Agent": "enclawed-secretary/1.0 (+https://www.enclawed.com)",
            },
            signal: ctrl.signal,
          });
        } catch (err) {
          return {
            ok: false as const,
            reason: `read-url: ${(err as Error).message ?? "fetch failed"}`,
          };
        } finally {
          clearTimeout(timeout);
        }
        if (!resp.ok) {
          return { ok: false as const, reason: `read-url HTTP ${resp.status}` };
        }
        let raw = await resp.text().catch(() => "");
        if (raw.length > cap) raw = raw.slice(0, cap);
        // DLP-redact (same critical-cluster patterns the broker uses
        // on outbound) so a malicious page can't inject prompt
        // primitives into the LLM context.
        const cleaned = dlpRedact(raw, {
          minSeverity: "critical",
          placeholder: "[REDACTED]",
        });
        captured = {
          url: trimmedUrl,
          content: cleaned,
          truncated: raw.length >= cap,
        };
        return { ok: true as const };
      },
    });
    if (outcome.kind !== "executed") {
      throw new ReadUrlToolError(outcome);
    }
    this.log(
      "info",
      `read-url: u=${trimmedUrl.slice(0, 80)} → ${captured.content.length} chars` +
        (captured.truncated ? " (truncated)" : ""),
    );
    return captured;
  }
}
