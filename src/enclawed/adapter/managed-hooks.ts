// enclawed adapter kit: are the managed (system policy) hooks installed, and
// unmodified?
//
// A host's system-wide managed settings can run the adapter's hooks for every
// session on a machine. Settings that merely MENTION the adapter's hook (a
// permission rule naming it, a comment, a hook on one tool only, a copy
// without the fail-closed flag) do not govern anything, so "installed" means:
//
//   - every managed document parses (one broken file and the host may ignore
//     the others);
//   - with the documents merged the way the host merges them (hook lists
//     concatenate per event, in file order), every event of the expected
//     block has an entry structurally equal to the expected one: same keys and
//     values (the order of keys does not matter), exactly one handler, its
//     command running an existing copy of the adapter's hook script with the
//     managed-mode arguments; the command itself is compared through a
//     placeholder;
//   - the lock that keeps non-managed hooks from being added is set.
//
// The adapter supplies its host's specifics as data: the expected block (with
// the placeholder for the command), the hook script's file names, the
// managed-mode arguments and the lock's key; readManagedDocs reads a main file
// plus a drop-in directory (sorted, `.json`, no dot files), whose names the
// adapter passes.
//
// Ported from codenclawed's managed.mjs (managedHooksStatus).

import fs from "node:fs";
import path from "node:path";

/** One managed settings document as read: `invalid` when it did not parse. */
export type ManagedDoc = Readonly<{ file: string; doc: unknown; invalid?: boolean }>;

export type ManagedHooksSpec = Readonly<{
  /** event -> the expected entries (the adapter's hook block with `placeholder` as the command). */
  expected: Readonly<Record<string, readonly unknown[]>>;
  /** The command placeholder used in `expected`. */
  placeholder: string;
  /** File names of the adapter's hook script (e.g. ["codenclawed-hook", "codenclawed-hook.mjs"]). */
  hookScriptNames: readonly string[];
  /** Arguments that must follow the script on the command line, in order (e.g. ["--origin", "managed"]). */
  managedArgs: readonly string[];
  /** The top-level key that must be `true` in some document (e.g. "allowManagedHooksOnly"). */
  lockKey: string;
  /** Does the script exist? Default: fs.existsSync (an FsProbe seam for tests). */
  exists?: (p: string) => boolean;
}>;

export type ManagedHooksStatus =
  | Readonly<{ installed: true; code: "installed"; reason: string; files: readonly string[] }>
  | Readonly<{
      installed: false;
      code: "no-managed-settings" | "invalid-document" | "hook-missing" | "lock-missing";
      reason: string;
      files: readonly string[];
      /** hook-missing: the first event without a genuine entry. invalid-document: the file. */
      event?: string;
      file?: string;
    }>;

/** The documents the host would read: `mainFile`, then the drop-ins in `dropInDir` alphabetically. */
export function readManagedDocs(o: { mainFile: string; dropInDir?: string | null }): ManagedDoc[] {
  const files = [o.mainFile];
  if (o.dropInDir) {
    try {
      for (const f of fs.readdirSync(o.dropInDir).toSorted()) {
        if (f.endsWith(".json") && !f.startsWith(".")) {
          files.push(path.join(o.dropInDir, f));
        }
      }
    } catch {
      /* no drop-in directory */
    }
  }
  const docs: ManagedDoc[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    try {
      docs.push({ file, doc: JSON.parse(text) as unknown });
    } catch {
      docs.push({ file, doc: null, invalid: true });
    }
  }
  return docs;
}

/** JSON with sorted keys, so key order does not matter. */
function canon(v: unknown): string {
  if (v === null || typeof v !== "object") {
    return JSON.stringify(v) ?? "null";
  }
  if (Array.isArray(v)) {
    return `[${v.map(canon).join(",")}]`;
  }
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .toSorted()
    .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
    .join(",")}}`;
}

// The words of a command line: '...' and "..." (quotes removed) or a run of
// non-space characters. No expansion: the managed command is compared, not run.
function commandWords(command: string): string[] {
  const out: string[] = [];
  for (const m of command.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out;
}

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;

/**
 * Does `command` run an existing copy of the hook script with the managed
 * arguments right after it? Exposed for the adapter's own diagnostics.
 */
export function runsManagedHook(
  command: string,
  spec: Pick<ManagedHooksSpec, "hookScriptNames" | "managedArgs" | "exists">,
): boolean {
  const words = commandWords(command);
  const at = words.findIndex((w) => spec.hookScriptNames.includes(fileName(w)));
  if (at < 0) {
    return false;
  }
  const script = words[at];
  // A bare name would be looked up relative to the host's working directory:
  // only an absolute path names one fixed file.
  if (!path.isAbsolute(script) && !path.win32.isAbsolute(script)) {
    return false;
  }
  if (!(spec.exists ?? fs.existsSync)(script)) {
    return false;
  }
  const after = words.slice(at + 1, at + 1 + spec.managedArgs.length);
  return spec.managedArgs.every((a, i) => after[i] === a);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** The managed-hooks decision over the documents the adapter read (readManagedDocs). */
export function managedHooksStatus(
  docs: readonly ManagedDoc[],
  spec: ManagedHooksSpec,
): ManagedHooksStatus {
  const files = docs.map((d) => d.file);
  if (docs.length === 0) {
    return { installed: false, code: "no-managed-settings", reason: "no managed settings", files };
  }
  const bad = docs.find((d) => d.invalid);
  if (bad) {
    return {
      installed: false,
      code: "invalid-document",
      reason: `${bad.file} is not valid JSON`,
      files,
      file: bad.file,
    };
  }
  const hooks: Record<string, unknown[]> = {};
  let locked = false;
  for (const { doc } of docs) {
    if (!isRecord(doc)) {
      continue;
    }
    if (doc[spec.lockKey] === true) {
      locked = true;
    }
    if (!isRecord(doc.hooks)) {
      continue;
    }
    for (const [event, list] of Object.entries(doc.hooks)) {
      hooks[event] = [...(hooks[event] ?? []), ...(Array.isArray(list) ? list : [])];
    }
  }
  for (const [event, wanted] of Object.entries(spec.expected)) {
    const want = wanted[0];
    const found = (hooks[event] ?? []).some((entry) => {
      if (!isRecord(entry) || !Array.isArray(entry.hooks) || entry.hooks.length !== 1) {
        return false;
      }
      const handler: unknown = entry.hooks[0];
      if (!isRecord(handler) || typeof handler.command !== "string") {
        return false;
      }
      if (!runsManagedHook(handler.command, spec)) {
        return false;
      }
      return (
        canon({ ...entry, hooks: [{ ...handler, command: spec.placeholder }] }) === canon(want)
      );
    });
    if (!found) {
      return {
        installed: false,
        code: "hook-missing",
        reason: `the managed settings do not run the adapter's hook (managed mode, matching the expected block) for ${event}`,
        files,
        event,
      };
    }
  }
  if (!locked) {
    return {
      installed: false,
      code: "lock-missing",
      reason: `the managed settings do not set ${spec.lockKey}`,
      files,
    };
  }
  return {
    installed: true,
    code: "installed",
    reason: "the managed settings run the adapter's hook on every event",
    files,
  };
}

// ─── Who can answer the host's permission prompt ────────────────────────
//
// An "ask" put to the host's own prompt is a person's question only when
// nothing else can answer it: no hook outside the managed settings (the lock),
// no answering hook in the managed settings themselves, no plugin the managed
// settings enable (its hooks run even under the lock), and the host settings
// that would let the host's own check allow calls by itself pinned off.

export type PromptAnswererSpec = Readonly<{
  /** The top-level key that limits hooks to the managed settings (e.g. "allowManagedHooksOnly"). */
  lockKey: string;
  /** Hook events whose hooks answer the host's prompt (e.g. ["PermissionRequest"]). */
  answerEvents: readonly string[];
  /** The key under which the managed settings enable plugins (e.g. "enabledPlugins"). */
  pluginsKey: string;
  /** Settings every managed document that names them must hold, and at least one must name. */
  pinned: readonly Readonly<{ path: readonly string[]; value: unknown }>[];
}>;

function valueAt(doc: unknown, p: readonly string[]): { found: boolean; value: unknown } {
  let cur: unknown = doc;
  for (const k of p) {
    if (!isRecord(cur) || !Object.hasOwn(cur, k)) {
      return { found: false, value: undefined };
    }
    cur = cur[k];
  }
  return { found: true, value: cur };
}

/**
 * Why something other than the person may answer the host's prompt, over the
 * managed documents the adapter read (readManagedDocs); null when only the
 * person can.
 */
export function hostPromptAnswerer(
  docs: readonly ManagedDoc[],
  spec: PromptAnswererSpec,
): string | null {
  if (docs.length === 0) {
    return `no managed settings set ${spec.lockKey}, so hooks from other settings files can answer it`;
  }
  const bad = docs.find((d) => d.invalid);
  if (bad) {
    return `${bad.file} is not valid JSON, so the host may not apply the managed settings`;
  }
  if (!docs.some((d) => isRecord(d.doc) && d.doc[spec.lockKey] === true)) {
    return `the managed settings do not set ${spec.lockKey}, so hooks from other settings files can answer it`;
  }
  for (const { file, doc } of docs) {
    if (!isRecord(doc)) {
      continue;
    }
    for (const ev of spec.answerEvents) {
      const list = isRecord(doc.hooks) ? doc.hooks[ev] : undefined;
      if (Array.isArray(list) && list.length > 0) {
        return `${file} sets ${ev} hooks, which answer it`;
      }
    }
    const plugins = doc[spec.pluginsKey];
    if (isRecord(plugins) && Object.values(plugins).some((v) => v !== false && v !== null)) {
      return `${file} enables plugins (${spec.pluginsKey}), whose hooks can answer it`;
    }
  }
  for (const pin of spec.pinned) {
    const named = docs.map((d) => valueAt(d.doc, pin.path)).filter((v) => v.found);
    if (named.length === 0 || named.some((v) => canon(v.value) !== canon(pin.value))) {
      return `the managed settings do not pin ${pin.path.join(".")} to ${JSON.stringify(pin.value)}, so the host may allow calls by itself`;
    }
  }
  return null;
}
