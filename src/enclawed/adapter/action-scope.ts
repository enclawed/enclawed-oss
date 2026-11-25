// enclawed adapter kit: what a checked action may change and what it reads,
// as its decision decided (the file-integrity record's AuditedActionScope).
//
// Between the decision and the run, a process outside the agent can change
// what the call touches: replace a file the agent reads with a link to a
// credential store, put a secret where a missing path was. The record
// credits a checked action only with what its decision covers (its write
// scope) and withholds its output when a path it reads (its read set)
// changed outside the agent while it ran (./file-integrity.ts).
//
//   writes  "none"   a read-only command, a read, a fetch of a URL the person
//                    named, a write of new files in the system's temporary
//                    directory (outside every project): nothing in the
//                    project is the action's doing;
//           paths    a redirect or in-place edit decided as the equivalent
//                    Write: exactly its targets;
//           "any"    contained execution (the project read-write), a call a
//                    person approved at Enclawed's prompt, a pre-approved
//                    call, MCP tools, skills, unknown tools, and any other
//                    allowed command.
//   reads   path prefixes: every word of every simple command where it runs
//           (a glob as the directory before its first pattern character),
//           its input files, and the directory it runs in for a program that
//           reads a tree without naming it (git: the whole project); for a
//           read tool, the paths it names. "any" when the line is not read
//           exactly, and for MCP tools, skills and unknown tools.

import path from "node:path";
import type { AuditedActionScope } from "./file-integrity.js";
import { expandHome } from "./fs-probe.js";
import { parseCompound } from "./shell-compound.js";
import type { Decision, PreActionEvent, ReasonCode } from "./types.js";

const NO_WRITE_CODES: ReadonlySet<ReasonCode> = new Set<ReasonCode>([
  "read-only-command",
  "read",
  "read-only-retrieval",
  "person-named-url",
  "temp-new-file",
  "shell-syntax-error",
]);

const ANY_WRITE_CODES: ReadonlySet<ReasonCode> = new Set<ReasonCode>([
  "approved-by-person",
  "pre-approved",
  "contained-execution",
]);

/** Programs that read a directory tree without naming it (`grep -r x`, `git diff`, `ls`). */
const TREE_READERS = new Set([
  "git",
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "ag",
  "ack",
  "find",
  "fd",
  "tree",
  "du",
  "ls",
  "diff",
  "tar",
  "zip",
  "rsync",
  "xargs",
]);

const GLOB = /[*?[{]/;

/** A word as the path prefix it may read: a glob's directory before its first pattern character. */
function prefixOf(word: string, cwd: string, home: string | null): string {
  const w = expandHome(word, home);
  const g = w.search(GLOB);
  if (g < 0) {
    return path.resolve(cwd, w);
  }
  const head = w.slice(0, g);
  const dir = head.includes("/") ? head.slice(0, head.lastIndexOf("/") + 1) : "";
  return path.resolve(cwd, dir || ".");
}

function shellReads(
  event: PreActionEvent,
  o: Readonly<{
    projectDir: string;
    home: string | null;
    env?: Readonly<Record<string, string>> | null;
  }>,
): "any" | string[] {
  const cmd = event.command?.text ?? "";
  if ((event.command?.dialect ?? "posix") !== "posix") {
    return "any";
  }
  const parsed = parseCompound(
    cmd,
    { cwd: event.cwd, home: o.home, gitTop: () => null, env: o.env ?? null },
    { fileRedirects: true },
  );
  if (!parsed.ok) {
    return "any";
  }
  const out = new Set<string>();
  for (const c of parsed.commands) {
    const prog = path.basename(c.argv[0] ?? "");
    for (const d of c.cwds) {
      for (const a of c.argv) {
        const w = a.startsWith("-") ? (a.includes("=") ? a.slice(a.indexOf("=") + 1) : "") : a;
        if (w) {
          out.add(prefixOf(w, d, o.home));
        }
      }
      for (const r of c.reads ?? []) {
        out.add(prefixOf(r, d, o.home));
      }
      if (TREE_READERS.has(prog) || (c.filesets?.length ?? 0) > 0) {
        out.add(prog === "git" ? o.projectDir : d);
      }
    }
  }
  return [...out].toSorted();
}

/** The scope of an allowed call (see the header). `asked`: a person approved it at Enclawed's prompt. */
export function auditedActionScope(
  event: PreActionEvent,
  decision: Pick<Decision, "codes" | "targets" | "contain">,
  o: Readonly<{
    projectDir: string;
    home: string | null;
    asked?: boolean;
    env?: Readonly<Record<string, string>> | null;
  }>,
): AuditedActionScope {
  const kind = event.kind;
  if (kind === "read") {
    return {
      writes: "none",
      reads: (event.reads ?? []).map((r) => prefixOf(r.path, event.cwd, o.home)),
    };
  }
  if (kind !== "shell") {
    return { writes: "any", reads: "any" };
  }
  const reads = shellReads(event, o);
  const codes = decision.codes;
  if (o.asked || decision.contain || codes.some((c) => ANY_WRITE_CODES.has(c))) {
    return { writes: "any", reads };
  }
  if (codes.includes("redirect-write") || codes.includes("in-place-edit")) {
    const targets = decision.targets ?? [];
    return targets.length
      ? {
          writes: targets.flatMap((t) => [t.path, ...(t.realPath ? [t.realPath] : [])]),
          reads,
        }
      : { writes: "any", reads };
  }
  if (codes.length > 0 && codes.every((c) => NO_WRITE_CODES.has(c))) {
    return { writes: "none", reads };
  }
  return { writes: "any", reads };
}
