// enclawed adapter kit: the path rules. Secrets no read or command may
// reach, Enclawed's protected files no write or command may change, and the
// file-write decision: hard links, symlinks, files that configure what runs
// later, the write history (the framework's prepareFsWriteHistory), and
// overwriting a file git does not keep.
//
// Ported from codenclawed's gate.mjs, secrets.mjs and links.mjs.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  implicitExecTarget,
  packageStateTarget,
  yarnPathTargets,
} from "../containment/exec-caches.js";
import { prepareFsWriteHistory } from "../fs-reversibility.js";
import type { HistoryEntry } from "../history-store.js";
import { CAPABILITY } from "../skill-capabilities.js";
import { linkedSecretBelow } from "./credential-links.js";
import { credentialPathOf } from "./credentials.js";
import {
  comparablePath,
  expandHome,
  isInside,
  isInsideExact,
  isProtectedPath,
  windowsSemanticsFs,
  type GitTracking,
  type ProtectedSet,
} from "./fs-probe.js";
import { pathWords } from "./fs-probe.js";
import {
  allow,
  deny,
  historyAgentId,
  irreversible,
  isExecConfigPath,
  isExecConfigTarget,
  upperFirst,
  type Ctx,
} from "./rule-kit.js";
import { REASON_PREFIX, type Decision, type ReasonCode } from "./types.js";
import { quoteUntrusted as q, showPath } from "./untrusted.js";

// ─── Secrets and protected paths in reads and commands ──────────────────

const hasGlob = (p: string) => /[*?[]/.test(p);

/** One UTF-16 code unit as a RegExp escape, valid inside and outside a class. */
const unitEscape = (c: string) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;

/** POSIX character classes of a bracket expression ([:alpha:]) as RegExp class members. */
const POSIX_CLASSES: Readonly<Record<string, string>> = {
  alpha: "a-zA-Z",
  digit: "0-9",
  alnum: "a-zA-Z0-9",
  upper: "A-Z",
  lower: "a-z",
  xdigit: "0-9A-Fa-f",
  space: "\\s",
  blank: " \\t",
  punct: "!-\\/:-@\\[-`{-~",
  cntrl: "\\u0000-\\u001f\\u007f",
  print: "\\u0020-\\u007e",
  graph: "\\u0021-\\u007e",
  word: "\\w",
};

/**
 * The shell bracket expression that opens at glob[start] ("["), as a RegExp
 * class and the index of its closing "]", or null when there is none (the "["
 * is then literal).
 *
 * The word may be text that was never a glob: pathWords drops quotes, so a
 * quoted regex (grep -P '[\x{200B}-\x{200D}]') arrives here as one. Every
 * member is therefore emitted escaped and every range checked, so the result
 * is always a valid RegExp (a throw here denied the whole call as
 * "engine-error"). Where the shell's reading is ambiguous the class matches
 * more, never less (a backslash is both an escape and itself; an unknown
 * [:name:] is any character but "/"): a secret a glob reaches is still found.
 */
function bracketClass(glob: string, start: number): { cls: string; end: number } | null {
  let i = start + 1;
  const negate = glob[i] === "!" || glob[i] === "^";
  if (negate) {
    i++;
  }
  const members: string[] = [];
  // The single character the last member stands for (a possible range start), or null.
  let last: string | null = null;
  let anyChar = false;
  let first = true;
  for (; i < glob.length; first = false) {
    const c = glob[i];
    if (c === "]" && !first) {
      // A pathname glob never matches "/" with a bracket expression.
      const body = members.join("");
      const cls = anyChar ? "[^/]" : negate ? `[^/${body}]` : body ? `[${body}]` : "(?!)";
      return { cls, end: i };
    }
    const kind = glob[i + 1];
    if (c === "[" && (kind === ":" || kind === "=" || kind === ".")) {
      const close = glob.indexOf(`${kind}]`, i + 2);
      if (close >= 0) {
        const name = glob.slice(i + 2, close);
        if (kind === ":" && POSIX_CLASSES[name]) {
          members.push(POSIX_CLASSES[name]);
          last = null;
        } else if (kind !== ":" && name.length === 1) {
          // [=c=] and [.c.]: the character itself.
          members.push(unitEscape(name));
          last = name;
        } else {
          anyChar = true;
          last = null;
        }
        i = close + 2;
        continue;
      }
    }
    if (c === "\\" && i + 1 < glob.length) {
      // The shell's escape, or a literal backslash of a quoted word: both.
      members.push(unitEscape("\\"), unitEscape(glob[i + 1]));
      last = glob[i + 1];
      i += 2;
      continue;
    }
    if (c === "-" && last !== null && i + 1 < glob.length && glob[i + 1] !== "]") {
      // A range from the last character; a backslash before its end is kept as itself too.
      let hi = glob[i + 1];
      let step = 2;
      if (hi === "\\" && i + 2 < glob.length) {
        members.push(unitEscape("\\"));
        hi = glob[i + 2];
        step = 3;
      }
      if (!(hi === "[" && /^[:=.]$/.test(glob[i + step] ?? ""))) {
        // An out-of-order range matches nothing in the shell; its two ends are kept as members.
        members.push(
          last.charCodeAt(0) <= hi.charCodeAt(0)
            ? `${unitEscape(last)}-${unitEscape(hi)}`
            : unitEscape(hi),
        );
        last = null;
        i += step;
        continue;
      }
    }
    members.push(unitEscape(c));
    last = c;
    i++;
  }
  return null;
}

/**
 * A shell glob as an anchored RegExp over absolute paths. It matches the word
 * literally as well: quotes are gone by now, and a pattern the shell cannot
 * expand is passed on as it is.
 */
function globRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    const b = c === "[" ? bracketClass(glob, i) : null;
    if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if (b) {
      re += b.cls;
      i = b.end;
    } else {
      re += unitEscape(c);
    }
  }
  const literal = Array.from({ length: glob.length }, (_, k) => unitEscape(glob[k])).join("");
  return new RegExp(`^(?:${re}|${literal})$`, "i");
}

function ancestors(p: string): string[] {
  const out: string[] = [];
  let d = path.dirname(p);
  while (d !== path.dirname(d)) {
    out.push(d);
    d = path.dirname(d);
  }
  return out;
}

type SecretHit = { secret: string; how: string };

export function meetsSecret(
  ctx: Ctx,
  abs: string,
  secrets: readonly string[],
  ancestorsToo: boolean,
): SecretHit | null {
  if (hasGlob(abs)) {
    const re = globRegExp(abs);
    for (const s of secrets) {
      if (re.test(s)) {
        return { secret: s, how: "matches" };
      }
      if (ancestorsToo && ancestors(s).some((a) => re.test(a))) {
        return { secret: s, how: "searches a directory that contains" };
      }
      if (ancestors(abs).some((a) => (hasGlob(a) ? globRegExp(a).test(s) : isInside(s, a)))) {
        return { secret: s, how: "is inside" };
      }
    }
    return null;
  }
  const real = ctx.fs.realpathNearest(abs);
  for (const s of secrets) {
    if (isInside(s, abs) || isInside(s, real)) {
      return { secret: s, how: "is inside" };
    }
    if (ancestorsToo && (isInside(abs, s) || isInside(real, s))) {
      return { secret: s, how: "searches a directory that contains" };
    }
  }
  const linked = ctx.fs.sameInodeAs(real, secrets);
  if (linked) {
    return { secret: linked, how: "is a hard link to" };
  }
  // A recursive read follows the links below it (./credential-links.ts).
  if (ancestorsToo) {
    const via = linkedSecretBelow(
      real,
      secrets.map((s) => ({ path: s, include: () => true })),
      (t) => {
        const s = secrets.find((x) => isInside(x, t) || isInside(t, x));
        return s ? { path: s, what: "a secret" } : null;
      },
      "a secret",
    );
    if (via) {
      return { secret: via.path, how: "searches a directory with a link to" };
    }
  }
  return null;
}

export { pathWords };

function literalForms(p: string, home: string | null, cwd: string): string[] {
  const forms = [p];
  if (home && isInside(home, p) && comparablePath(home) !== comparablePath(p)) {
    const rel = path.relative(home, p);
    forms.push(`~/${rel}`, `$home/${rel}`, `\${home}/${rel}`);
  }
  if (cwd && isInside(cwd, p) && comparablePath(cwd) !== comparablePath(p)) {
    forms.push(path.relative(cwd, p));
  }
  return forms;
}

const GREP_FAMILY = new Set(["grep", "egrep", "fgrep", "rg", "ag", "ack", "zgrep"]);

/** A secret a command names, literally (also through ~ / $HOME / a relative path) or by a word resolving onto it. */
export function commandNamesSecret(
  ctx: Ctx,
  command: string,
  secrets: readonly string[],
): string | null {
  if (!secrets.length) {
    return null;
  }
  const text = command.normalize("NFC").toLowerCase();
  for (const s of secrets) {
    if (
      literalForms(s, ctx.home, ctx.cwd).some(
        (f) => f && text.includes(f.normalize("NFC").toLowerCase()),
      )
    ) {
      return s;
    }
  }
  const words = pathWords(command);
  // A searcher reads below its operands: rg, ag and ack always; grep only
  // with -r/-R (without it a directory operand is skipped, its files unread).
  const prog = words.length > 0 ? path.basename(words[0]) : "";
  const searcher =
    GREP_FAMILY.has(prog) &&
    (!/^(?:grep|egrep|fgrep|zgrep)$/.test(prog) ||
      /(^|\s)-[a-zA-Z]*[rR]|--recursive|--dereference-recursive|--directories=recurse|-d\s*recurse/.test(
        command,
      ));
  for (const w of words.slice(1)) {
    const hit = meetsSecret(ctx, path.resolve(ctx.cwd, expandHome(w, ctx.home)), secrets, searcher);
    if (hit) {
      return hit.secret;
    }
  }
  if (searcher && words.length === 1) {
    return meetsSecret(ctx, ctx.cwd, secrets, true)?.secret ?? null;
  }
  return null;
}

/** A protected path a command names, literally or by a word that resolves (symlink, hard link) onto it. */
export function commandNamesProtected(
  ctx: Ctx,
  command: string,
  prot: ProtectedSet,
): string | null {
  const text = command.normalize("NFC").toLowerCase();
  for (const p of prot.paths) {
    if (prot.mentionExempt?.includes(p)) {
      continue;
    }
    if (
      literalForms(p, ctx.home, ctx.cwd).some(
        (f) => f && text.includes(f.normalize("NFC").toLowerCase()),
      )
    ) {
      return p;
    }
  }
  const latch = prot.prefixes.find((x) => text.includes(x.basename));
  if (latch) {
    return path.join(latch.dir, `${latch.basename}*`);
  }
  for (const w of pathWords(command)) {
    const abs = path.resolve(ctx.cwd, expandHome(w, ctx.home));
    const real = ctx.fs.realpathNearest(abs);
    if (isProtectedPath(prot, [abs, real])) {
      return real;
    }
    const link = ctx.fs.hardLink(real, prot);
    if (link?.kind === "protected") {
      return link.match;
    }
  }
  return null;
}

// ─── Untracked overwrite ────────────────────────────────────────────────

/** True when this session's history records that the file did not exist before an earlier write by this session. */
export async function createdThisSession(ctx: Ctx, realPath: string): Promise<boolean> {
  const sid = ctx.event.actor.sessionId;
  const store = ctx.opts.history.store;
  if (!sid || typeof store.list !== "function") {
    return false;
  }
  const own = `${ctx.opts.host}:${sid}`;
  let entries: HistoryEntry[];
  try {
    entries = await store.list(realPath);
  } catch {
    return false;
  }
  return entries.some(
    (e) =>
      e &&
      !e.copyPattern &&
      e.realPath === realPath &&
      e.hash === null &&
      (e.op === "write" || e.op === "edit") &&
      typeof e.agentId === "string" &&
      (e.agentId === own || e.agentId.startsWith(`${own}/`)),
  );
}

/**
 * Overwriting an existing file that git does not track: its only other copy
 * would be Enclawed's own snapshot, so the write is irreversible and waits
 * for a person. Allowed without one: a file git ignores (regenerable build
 * output; credential files excepted), a file under an operator's
 * overwritablePaths entry, a file this session itself created, a file outside
 * any git work tree. git missing or failing asks (fail closed).
 */
export async function untrackedOverwrite(
  ctx: Ctx,
  realPath: string | null,
): Promise<{ code: ReasonCode; what: string } | null> {
  if (typeof realPath !== "string" || !path.isAbsolute(realPath)) {
    return { code: "git-state-unknown", what: "could not be resolved" };
  }
  if ((ctx.opts.overwritablePaths ?? []).some((e) => isInsideExact(e, realPath))) {
    return null;
  }
  const state: GitTracking = ctx.fs.gitTracking(realPath);
  if (state === "tracked" || state === "no-repo") {
    return null;
  }
  if (await createdThisSession(ctx, realPath)) {
    return null;
  }
  if (state === "ignored") {
    // A file inside an ignored directory is regenerable output (dist/,
    // build/, a cache): overwritable, with the snapshot still kept. A file
    // ignored by its own name (config/local.json, a local settings file) is
    // the user's local data that exists nowhere else, and a credential file
    // is never regenerable: both still wait for a person.
    if (credentialPathOf(realPath, ctx.home)) {
      return { code: "git-ignored", what: "git ignores (.gitignore) and that holds credentials" };
    }
    return ctx.fs.gitTracking(path.dirname(realPath)) === "ignored"
      ? null
      : {
          code: "git-ignored",
          what: "git ignores (.gitignore) by its own name",
        };
  }
  if (state === "untracked") {
    return { code: "git-untracked", what: "git does not track" };
  }
  return {
    code: "git-state-unknown",
    what: "git could not classify (git is missing or failed; treated as untracked)",
  };
}

/** The system's temporary directories, as real paths. */
function tempRoots(): string[] {
  const out = new Set<string>();
  for (const d of [os.tmpdir(), "/tmp", "/var/tmp"]) {
    try {
      out.add(fs.realpathSync(d));
    } catch {
      /* not on this system */
    }
  }
  return [...out];
}

/**
 * A write that creates a file (nothing exists at the name, no link either)
 * inside the system's temporary directory, and not inside the home
 * directory, the project or a secret path (a home or project may live under
 * the temporary directory). Exec-config, protected and linked targets were
 * decided before this is asked.
 */
export function newTempFile(
  ctx: Ctx,
  abs: string | null,
  real: string | null,
  secrets: readonly string[],
): boolean {
  if (!abs || !real) {
    return false;
  }
  try {
    fs.lstatSync(abs);
    return false;
  } catch {
    /* nothing there: a new file */
  }
  const inside = (root: string) => isInside(root, abs) || isInside(root, real);
  if (!tempRoots().some((t) => isInside(t, real))) {
    return false;
  }
  const home = ctx.home ? [ctx.home, ctx.fs.realpathNearest(ctx.home)] : [];
  const project = [ctx.opts.projectDir, ctx.fs.realpathNearest(ctx.opts.projectDir)];
  // Enclawed's own state and files that configure what runs later are never scratch.
  if (
    (ctx.opts.protected && isProtectedPath(ctx.opts.protected, [abs, real])) ||
    isExecConfigTarget(abs, real, ctx.opts.execConfig, undefined, windowsSemanticsFs(real))
  ) {
    return false;
  }
  return ![...home, ...project, ...secrets].some(inside);
}

/**
 * A directory inside the system's temporary directory (existing or to be
 * made), not inside the home directory, the project or a secret path:
 * making it changes nothing that was there.
 */
export function tempScratchDir(ctx: Ctx, abs: string, secrets: readonly string[]): boolean {
  const real = ctx.fs.realpathNearest(abs);
  if (!tempRoots().some((t) => isInside(t, real) && real !== t)) {
    return false;
  }
  const inside = (root: string) => isInside(root, abs) || isInside(root, real);
  const home = ctx.home ? [ctx.home, ctx.fs.realpathNearest(ctx.home)] : [];
  const project = [ctx.opts.projectDir, ctx.fs.realpathNearest(ctx.opts.projectDir)];
  // Enclawed's own state and files that configure what runs later are never scratch.
  if (
    (ctx.opts.protected && isProtectedPath(ctx.opts.protected, [abs, real])) ||
    isExecConfigTarget(abs, real, ctx.opts.execConfig, undefined, windowsSemanticsFs(real))
  ) {
    return false;
  }
  return ![...home, ...project, ...secrets].some(inside);
}

// Files a direnv `.envrc` loads by convention (`dotenv`, `use nix`, `use
// flake`, `use devenv`, devbox's generated .envrc): direnv watches them and
// re-evaluates at the next prompt without asking again, so with an `.envrc`
// in their directory or one above it (inside the project) they configure
// what runs at the prompt (an exported PROMPT_COMMAND, a shellHook).
// Without one they are data, read only by a command Enclawed decides.
const ENVRC_LOADED =
  /^(\.env(\..+)?|shell\.nix|default\.nix|flake\.nix|flake\.lock|devenv\.nix|devenv\.yaml|devenv\.lock|devbox\.json|devbox\.lock)$/i;

/** A file an `.envrc` in its directory or above it (up to `root`) loads. */
export function loadedByEnvrc(root: string, abs: string): boolean {
  if (!ENVRC_LOADED.test(path.basename(abs)) || !isInside(root, abs)) {
    return false;
  }
  for (let d = path.dirname(abs); ; d = path.dirname(d)) {
    try {
      fs.lstatSync(path.join(d, ".envrc"));
      return true;
    } catch {
      /* none here */
    }
    if (comparablePath(d) === comparablePath(root) || path.dirname(d) === d) {
      return false;
    }
  }
}

/**
 * Is `abs` the file a yarn configuration of the project names to run in place
 * of yarn (yarnPath, yarn-path)? The configurations yarn reads from the
 * working directory and from the file's own directory, up to the project.
 */
export function namedByYarnrc(root: string, abs: string, cwd: string): boolean {
  const dirs: string[] = [root];
  for (const start of [path.dirname(abs), cwd]) {
    for (let d = start; isInside(root, d); d = path.dirname(d)) {
      dirs.push(d);
      if (comparablePath(d) === comparablePath(root) || path.dirname(d) === d) {
        break;
      }
    }
  }
  const read = (f: string) => {
    try {
      return fs.readFileSync(f, "utf8");
    } catch {
      return null;
    }
  };
  return yarnPathTargets(dirs, read).some((t) => comparablePath(t) === comparablePath(abs));
}

// ─── The file-write decision ────────────────────────────────────────────

export async function decideFsWrite(ctx: Ctx): Promise<Decision> {
  const { event, opts } = ctx;
  const policy = opts.policy;
  const writes = event.writes ?? [];
  if (writes.length === 0) {
    return irreversible(
      ["no-write-target"],
      "this write names no target path, so no history can be kept",
      CAPABILITY.FS_WRITE_IRREV,
      event,
      policy,
    );
  }
  const resolved = writes.map((w) => {
    const abs = w.path ? path.resolve(ctx.cwd, expandHome(w.path, ctx.home)) : null;
    return { w, abs, real: abs ? ctx.fs.realpathNearest(abs) : null };
  });
  const tgt = (r: (typeof resolved)[number]) =>
    r.w.path
      ? `Target (quoted as the agent gave it): ${q(r.w.path)}; resolves to: ${showPath(r.real)}`
      : "No target path was given";

  // Enclawed's own state, policy, audit log, history and code: never the agent's to change.
  for (const r of resolved) {
    if (r.abs && opts.protected && isProtectedPath(opts.protected, [r.abs, r.real])) {
      return deny(
        ["protected-path"],
        `blocked write to protected path. ${tgt(r)}. That path is part of Enclawed's own state, policy, audit log, history or code; the agent may not change it`,
        CAPABILITY.FS_WRITE_IRREV,
      );
    }
  }
  // A hard link is invisible to realpath: compare inodes with the protected files.
  const execScope = {
    projectDir: opts.projectDir,
    isExecConfig: (p: string) => isExecConfigPath(p, opts.execConfig),
  };
  const links = resolved.map((r) =>
    r.real ? ctx.fs.hardLink(r.real, opts.protected ?? null, execScope) : null,
  );
  for (let i = 0; i < resolved.length; i++) {
    const link = links[i];
    if (link?.kind === "protected") {
      return deny(
        ["protected-path", "hardlinked-path"],
        `blocked write to protected path. ${tgt(resolved[i])}. It is a hard link to ${showPath(link.match)}, which is part of Enclawed's own state, policy, audit log, history or code; the agent may not change it`,
        CAPABILITY.FS_WRITE_IRREV,
      );
    }
  }

  const historyTool =
    event.policyIds.find((id) => policy.history.noHistoryTools.has(id)) ??
    event.policyIds[event.policyIds.length - 1] ??
    event.tool;
  // History is kept first, even when the write then needs a person, so an
  // approved change is restorable.
  const outcome = await (opts.history.prepare ?? prepareFsWriteHistory)({
    tool: historyTool,
    targets: resolved.map((r) => ({ path: r.w.path ?? "", absPath: r.abs, op: r.w.op })),
    fsRoot: opts.projectDir,
    policy,
    toolCallId: event.callId ?? undefined,
    agentId: historyAgentId(opts.host, event.actor),
    store: opts.history.store,
    gatewayTmpDir: null,
  });
  const targets = outcome.targets.map((t, i) => {
    const mode = resolved[i]?.real ? ctx.fs.fileMode(resolved[i].real) : null;
    return mode !== null ? { ...t, mode } : t;
  });

  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i];
    const link = links[i];
    const t = targets[i];
    const kept =
      t?.reversible && t.basis === "snapshot" && t.snapshot
        ? ` (its current content is kept as snapshot ${t.snapshot.slice(0, 12)})`
        : "";
    const undecided = link?.kind === "protected-unknown";
    let symlinked = false;
    if (r.abs && isInside(opts.projectDir, r.abs)) {
      const projectReal = ctx.fs.realpathNearest(opts.projectDir);
      const expected = path.join(projectReal, path.relative(opts.projectDir, r.abs));
      symlinked = comparablePath(expected) !== comparablePath(r.real ?? "");
    }
    // A hard link to one of the project's exec-config files is that file (by inode).
    const linkedExec =
      link?.kind === "exec-config" || (link?.kind === "protected-unknown" && link.match !== null)
        ? link.match
        : null;
    const isComposerVendor = (d: string) => ctx.fs.fileMode(path.join(d, "autoload.php")) !== null;
    const isVenvDir = (d: string) =>
      ctx.fs.fileMode(path.join(d, "pyvenv.cfg")) !== null ||
      ctx.fs.fileMode(path.join(d, "conda-meta")) !== null;
    const execConfig =
      r.abs !== null &&
      (isExecConfigTarget(
        r.abs,
        r.real,
        opts.execConfig,
        undefined,
        windowsSemanticsFs(r.real ?? r.abs),
      ) ||
        loadedByEnvrc(opts.projectDir, r.abs) ||
        namedByYarnrc(opts.projectDir, r.abs, ctx.cwd) ||
        (r.real !== null && loadedByEnvrc(ctx.fs.realpathNearest(opts.projectDir), r.real)) ||
        linkedExec !== null ||
        // An implicit execution cache or a virtual environment's entry points or
        // packages (what a later tool runs, or a contained run trusts): written
        // only by a decided install or a person (../containment/exec-caches.ts,
        // the list the containment enforces). Deleting one plants nothing.
        (r.w.op !== "delete" &&
          (implicitExecTarget(r.abs, isVenvDir) ||
            (r.real !== null && implicitExecTarget(r.real, isVenvDir)) ||
            // Package-manager state (installed packages, lockfiles, yarn's
            // and pnpm's state): what an install writes, not the agent.
            packageStateTarget(r.abs, isComposerVendor) ||
            (r.real !== null && packageStateTarget(r.real, isComposerVendor)))));
    const multiLinked = link !== null;
    if (execConfig || symlinked || multiLinked) {
      const codes: ReasonCode[] = [
        ...(execConfig ? (["exec-config-path"] as const) : []),
        ...(symlinked ? (["symlinked-path"] as const) : []),
        ...(multiLinked ? (["hardlinked-path"] as const) : []),
        ...(undecided ? (["protection-undecided"] as const) : []),
      ];
      const linkedTo = linkedExec ? `; it is a hard link to ${showPath(linkedExec)}` : "";
      const why = execConfig
        ? `this write changes a file that configures what runs later (git, agent CLI, MCP, editor, package or build settings); undoing the file does not undo what it starts${kept}. ${tgt(r)}${linkedTo}`
        : symlinked
          ? `this write goes through a symbolic link to another location${kept}. ${tgt(r)}`
          : `the target has ${link?.nlink ?? 2} hard links, so this write also changes the file under its other names, which may be outside the project where no history is kept${kept}. ${tgt(r)}`;
      if (undecided) {
        // Never allowed by itself, never pre-approved: it may be Enclawed's own file.
        const full = `${why}. It has ${link.nlink} hard links, and Enclawed's protected files are too many to rule out that one of them is this file: approve only if you know where its other names are`;
        if (event.approvalRoute === "no-person") {
          return {
            ...deny(
              [...codes, `no-person:${event.hostMode ?? "headless"}`],
              `protection undecided, and this session cannot ask a person: ${full}`,
              CAPABILITY.FS_WRITE_IRREV,
            ),
            targets,
          };
        }
        return {
          outcome: "ask",
          reason: `${REASON_PREFIX}protection undecided, approve only if intended. ${upperFirst(full)}`,
          codes,
          capability: CAPABILITY.FS_WRITE_IRREV,
          reversible: false,
          targets,
        };
      }
      return { ...irreversible(codes, why, CAPABILITY.FS_WRITE_IRREV, event, policy), targets };
    }
  }

  // An existing file git does not keep exists nowhere but here: replacing it waits for a person.
  for (let i = 0; i < resolved.length; i++) {
    const t = targets[i];
    if (t?.reversible && t.basis === "snapshot" && t.prior === "content") {
      const u = await untrackedOverwrite(ctx, t.realPath ?? resolved[i].real);
      if (u) {
        return {
          ...irreversible(
            ["untracked-overwrite", u.code],
            `this write replaces the content of an existing file that ${u.what}, so no copy of it exists outside this machine. Its current content is kept as snapshot ${(t.snapshot ?? "").slice(0, 12)} (undo with: ${ctx.opts.historyRestoreCommand ?? "enclawed history restore"}). Approve only if you asked for this file to be changed. ${tgt(resolved[i])}`,
            CAPABILITY.FS_WRITE_IRREV,
            event,
            policy,
          ),
          targets,
        };
      }
    }
  }

  const first = targets[0];
  if (outcome.reversible && first?.reversible) {
    return {
      ...allow(
        [`history:${first.basis}`],
        first.basis === "snapshot"
          ? `previous content kept (${first.prior === "absent" ? "new file" : `snapshot ${(first.snapshot ?? "").slice(0, 12)}`}); undo with: ${ctx.opts.historyRestoreCommand ?? "enclawed history restore"}`
          : first.basis === "git-clean"
            ? "file is committed and unchanged in git"
            : "scratch location",
        CAPABILITY.FS_WRITE_REV,
      ),
      targets,
    };
  }
  // A new file in the system's temporary directory is scratch: nothing was
  // there to lose, and removing it undoes the write.
  if (
    resolved.every(
      (r, i) => targets[i]?.reversible || newTempFile(ctx, r.abs, r.real, opts.secretPaths ?? []),
    )
  ) {
    return {
      ...allow(
        ["temp-new-file"],
        "a new file in the system's temporary directory (nothing was there; removing it undoes the write)",
        CAPABILITY.FS_WRITE_REV,
      ),
      targets,
    };
  }
  const codes = targets.flatMap((t) => (t.reversible ? [] : [`fs:${t.code}` as const]));
  const irr = targets.findIndex((t) => !t.reversible);
  return {
    ...irreversible(
      codes.length ? codes : ["no-history"],
      `no history can be kept for this write (${codes.map((c) => c.slice(3)).join(", ") || "no-history"}). ${tgt(resolved[Math.max(0, irr)])}`,
      CAPABILITY.FS_WRITE_IRREV,
      event,
      policy,
    ),
    targets,
  };
}
