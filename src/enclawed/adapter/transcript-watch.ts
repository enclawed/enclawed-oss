// enclawed adapter kit: watch the host's transcript for calls that ran
// without a decision (requirement R4).
//
// If the host drops the adapter's settings (a value it rejects, a flag, a
// crash in its loader), no hook runs at all, so nothing in the hook can
// notice. The launcher can: the host writes every tool call to its on-disk
// transcript, each with the id the pre-tool hook would have reported. The
// launcher stops the host when a call shows up
//   - before the session-start handshake, with no decision for it: the hooks
//     are not running ("call-before-handshake");
//   - after it, when no decision was reported for that call's id and the call
//     produced a result that is not an error ("ran-without-decision"). A call
//     the host refused before any hook ran (an input that fails its
//     validation) is an error result, not a bypass.
// A call that has a decision is handed back for the decision check
// (decisionViolation in ./approval.ts, CallLedger in ./transport.ts).
//
// The transcript is written after the call starts, so this detects the first
// unchecked call; it does not prevent it. Launch modes without a transcript
// are refused (decideTranscriptFlags in ./launch-refusals.ts).
//
// The adapter supplies its host's transcript layout (which directories to
// scan, how deep, the file extension) and line format (parseLine); the kit
// tails the files from where they were at launch and decides.
//
// Ported from codenclawed's transcript-watch.mjs and its use in launcher.mjs.

import fs from "node:fs";
import path from "node:path";

/** How often the transcripts are polled (internal constant). */
export const TRANSCRIPT_POLL_MS = 250;
/** At most this much of one file is read per poll; the rest is read on the next. */
const MAX_READ = 16 * 1024 * 1024;

export type TranscriptUse = Readonly<{
  id: string;
  name: string | null;
  input?: unknown;
  cwd?: string | null;
  sessionId?: string | null;
}>;
export type TranscriptResult = Readonly<{ id: string; isError: boolean }>;
export type TranscriptLine = Readonly<{
  uses: readonly TranscriptUse[];
  results: readonly TranscriptResult[];
}>;

export type TranscriptWatch = Readonly<{ poll: () => void; stop: () => void }>;

/** The subdirectories of `parent` whose names start with one of `prefixes` (a host's per-project directories). */
export function prefixedDirs(parent: string, prefixes: readonly string[]): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(parent);
  } catch {
    return [];
  }
  return names
    .filter((n) => prefixes.some((p) => p !== "" && n.startsWith(p)))
    .toSorted()
    .map((n) => path.join(parent, n));
}

function filesBelow(dir: string, depth: number, ext: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of entries) {
    const p = path.join(dir, d.name);
    if (d.isDirectory() && depth > 0) {
      filesBelow(p, depth - 1, ext, out);
    } else if (d.isFile() && d.name.endsWith(ext)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Tail the transcripts in `dirs()` (rescanned on every poll, so new session
 * and subagent files are picked up from their first byte). Lines already there
 * at launch are not this session's and are skipped. A file that shrinks is
 * followed from its new end. Only complete lines are parsed.
 */
export function watchTranscripts(o: {
  dirs: () => readonly string[];
  /** How many directory levels below each dir hold transcripts (subagents). */
  depth: number;
  extension: string;
  parseLine: (line: string) => TranscriptLine;
  onUse: (u: TranscriptUse & { file: string }) => void;
  onResult: (r: TranscriptResult & { file: string }) => void;
  /** false: no timer (the adapter calls poll()). */
  timer?: boolean;
}): TranscriptWatch {
  const offsets = new Map<string, number>();
  // Bytes after the last newline, kept as bytes so a UTF-8 character split
  // across two reads is decoded whole.
  const rest = new Map<string, Buffer>();
  const files = () => {
    const out: string[] = [];
    for (const d of o.dirs()) {
      filesBelow(d, o.depth, o.extension, out);
    }
    return out;
  };
  for (const f of files()) {
    try {
      offsets.set(f, fs.statSync(f).size);
    } catch {
      /* gone */
    }
  }
  const poll = () => {
    for (const f of files()) {
      let size: number;
      try {
        size = fs.statSync(f).size;
      } catch {
        continue;
      }
      const from = offsets.get(f) ?? 0;
      if (size <= from) {
        if (size < from) {
          offsets.set(f, size);
          rest.delete(f);
        }
        continue;
      }
      let chunk: Buffer;
      try {
        const fd = fs.openSync(f, "r");
        try {
          const buf = Buffer.alloc(Math.min(size - from, MAX_READ));
          const n = fs.readSync(fd, buf, 0, buf.length, from);
          chunk = buf.subarray(0, n);
        } finally {
          fs.closeSync(fd);
        }
      } catch {
        continue;
      }
      offsets.set(f, from + chunk.length);
      const prev = rest.get(f);
      let buf = prev ? Buffer.concat([prev, chunk]) : chunk;
      for (;;) {
        const nl = buf.indexOf(0x0a);
        if (nl < 0) {
          break;
        }
        const line = buf.subarray(0, nl).toString("utf8");
        buf = buf.subarray(nl + 1);
        if (line.trim() === "") {
          continue;
        }
        let parsed: TranscriptLine;
        try {
          parsed = o.parseLine(line);
        } catch {
          continue;
        }
        for (const u of parsed.uses) {
          o.onUse({ ...u, file: f });
        }
        for (const r of parsed.results) {
          o.onResult({ ...r, file: f });
        }
      }
      rest.set(f, Buffer.from(buf));
    }
  };
  if (o.timer === false) {
    return { poll, stop: () => {} };
  }
  const timer = setInterval(poll, TRANSCRIPT_POLL_MS);
  timer.unref?.();
  return { poll, stop: () => clearInterval(timer) };
}

export type TranscriptCallVerdict =
  | Readonly<{ verdict: "ok" }>
  | Readonly<{ verdict: "check-decision"; id: string }>
  | Readonly<{
      verdict: "unchecked";
      code: "call-before-handshake" | "ran-without-decision";
      id: string;
      reason: string;
    }>;

/**
 * The decision for one transcript event. `handshake`: the session-start
 * handshake is done. `decided(id)`: a verified hook reported a decision for
 * that call id. "unchecked" stops the host.
 */
export function transcriptCallVerdict(
  e:
    | Readonly<{ kind: "use"; id: string; name: string | null }>
    | Readonly<{ kind: "result"; id: string; isError: boolean }>,
  s: Readonly<{ handshake: boolean; decided: (id: string) => boolean }>,
): TranscriptCallVerdict {
  if (e.kind === "use") {
    if (!s.handshake && !s.decided(e.id)) {
      return {
        verdict: "unchecked",
        code: "call-before-handshake",
        id: e.id,
        reason: `a ${e.name ?? "tool"} call (${e.id}) started before Enclawed's hooks reported in`,
      };
    }
    return { verdict: "ok" };
  }
  if (e.isError) {
    return { verdict: "ok" };
  }
  if (!s.decided(e.id)) {
    return {
      verdict: "unchecked",
      code: "ran-without-decision",
      id: e.id,
      reason: `a tool call (${e.id}) ran without a decision from Enclawed's hook`,
    };
  }
  return { verdict: "check-decision", id: e.id };
}
