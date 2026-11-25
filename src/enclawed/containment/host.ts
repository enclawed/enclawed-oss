// Starting a contained process (M1 + M3), host side.
//
//   const plan = planContainment(declaration, ctx);          // ./plan.ts: decides
//   if (!plan.ok) refuse(plan.message);
//   const c = await openContainment(plan.plan, { ... });     // this file
//   const child = spawn(c.argv[0], c.argv.slice(1), { env: c.env, stdio });
//   c.beginCall({ callId, tool, arguments }) ... c.endCall(callId);
//   await c.close();
//
// The spawned argv is `unshare` (user + network + mount + PID namespaces,
// as the network cage uses) running ./contain-init.ts, which builds the
// view and starts the command under bubblewrap. The host side keeps the
// container's CA key, the secret values and every egress decision
// (./relay.ts); none of them is reachable from inside.
//
// Where containment is not available (not Linux, no unprivileged user
// namespaces, util-linux or bubblewrap missing) nothing is started:
// `openContainment` throws ContainmentUnavailableError and
// `uncontainedRefusal` gives the message to show. There is no fallback to
// running the process uncontained.

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EgressRunner } from "@enclawed/egress-core";
import { privateSocketDir } from "../unix-socket-dir.js";
import type { ContainInitConfig } from "./contain-init.js";
import { nameGuardConfig, nameGuardDigest } from "./name-guard.js";
import { CA_BUNDLE_PATHS, type ContainmentPlan, type MountOp, type Placeholder } from "./plan.js";
import {
  createEgressRelay,
  type InFlightCall,
  type RelayEvent,
  type UpstreamTarget,
} from "./relay.js";
import { createContainerCa } from "./x509.js";

export type ContainmentSupport =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; code: "containment-unavailable"; reason: string }>;

const SYSTEM_DIRS = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"];

function systemBinary(name: string): string | null {
  for (const d of SYSTEM_DIRS) {
    const p = path.join(d, name);
    try {
      if (fs.statSync(p).isFile()) {
        return p;
      }
    } catch {
      /* next */
    }
  }
  return null;
}

const OUTER_FLAGS = [
  "--user",
  "--map-root-user",
  "--net",
  "--mount",
  "--pid",
  "--fork",
  "--mount-proc",
  "--kill-child",
];

let support: ContainmentSupport | null = null;

/** Can this host contain a process? Probed once (cached): the same nesting the real start uses. */
export function containmentSupport(
  platform: NodeJS.Platform = process.platform,
): ContainmentSupport {
  if (platform !== process.platform) {
    return unavailable(platform);
  }
  if (support) {
    return support;
  }
  support = probe();
  return support;
}

function unavailable(platform: string): ContainmentSupport {
  const why =
    platform === "darwin"
      ? "macOS has no unprivileged mount and network namespaces; the containment backend for macOS does not exist yet"
      : platform === "win32"
        ? "Windows needs an AppContainer + WFP backend, which does not exist yet"
        : `containment needs Linux namespaces (platform ${platform})`;
  return { ok: false, code: "containment-unavailable", reason: why };
}

function probe(): ContainmentSupport {
  if (process.platform !== "linux") {
    return unavailable(process.platform);
  }
  const unshare = systemBinary("unshare");
  const bwrap = systemBinary("bwrap");
  const ip = systemBinary("ip");
  const mount = systemBinary("mount");
  if (!unshare || !mount) {
    return {
      ok: false,
      code: "containment-unavailable",
      reason: "util-linux (unshare, mount) is not installed",
    };
  }
  if (!bwrap) {
    return {
      ok: false,
      code: "containment-unavailable",
      reason: "bubblewrap (bwrap) is not installed",
    };
  }
  if (!ip) {
    return { ok: false, code: "containment-unavailable", reason: "iproute2 (ip) is not installed" };
  }
  const r = spawnSync(
    unshare,
    [
      ...OUTER_FLAGS,
      bwrap,
      "--unshare-user",
      "--disable-userns",
      "--unshare-pid",
      "--dev-bind",
      "/",
      "/",
      "--",
      "/bin/true",
    ],
    { stdio: "ignore", timeout: 15_000, env: { PATH: "/usr/bin:/bin" } },
  );
  return r.status === 0
    ? { ok: true }
    : {
        ok: false,
        code: "containment-unavailable",
        reason: "unprivileged (nested) user namespaces are disabled on this host",
      };
}

/** For tests: forget the cached probe. */
export function resetContainmentSupportForTest(): void {
  support = null;
}

export class ContainmentUnavailableError extends Error {
  override name = "ContainmentUnavailableError";
  readonly code = "containment-unavailable";
  constructor(readonly reason: string) {
    super(`enclawed containment: ${reason}`);
  }
}

/** The message shown when a process that must be contained is not started. */
export function uncontainedRefusal(
  label: string,
  kind: ContainmentPlan["kind"],
  reason: string,
): string {
  const what =
    kind === "mcp-server"
      ? `MCP server "${label}"`
      : kind === "package-install"
        ? `package install "${label}"`
        : `project script "${label}"`;
  return (
    `Enclawed: ${what} was not started: it may only run contained, and containment is not available here (${reason}). ` +
    "Nothing was run. On Linux, install util-linux, iproute2 and bubblewrap and enable unprivileged user namespaces."
  );
}

// How to run ./contain-init: the built file in an installed package, the
// TypeScript source (through tsx) in a checkout. Mirrors netcage's lookup.
function containInitCommand(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const roots = [here, path.join(here, ".."), path.join(here, "..", "..")];
  const relatives = ["contain-init.js", path.join("enclawed", "containment", "contain-init.js")];
  for (const root of roots) {
    for (const rel of relatives) {
      const c = path.join(root, rel);
      if (fs.existsSync(c)) {
        return [process.execPath, c];
      }
    }
  }
  const src = path.join(here, "contain-init.ts");
  if (fs.existsSync(src)) {
    return [process.execPath, "--import", fileURLToPath(import.meta.resolve("tsx")), src];
  }
  throw new Error("enclawed containment: contain-init is missing from this install");
}

// ─── Placeholders (missing exec-config paths, read-only inside) ─────────
//
// A placeholder is an empty directory, or a file whose content means
// "nothing configured", that this side creates on the host so it can be
// bound read-only inside the view: the name then exists, and the contained
// process can neither create it nor write into it. Several containments of
// the same project may share one, and removing a placeholder that is still
// bound in another living containment would detach that containment's
// read-only mount (Linux lazily unmounts a mount point unlinked in another
// mount namespace). So the journal records the owners of each placeholder,
// and a placeholder is removed only when no living owner is left and it is
// still the same, unchanged directory or file.
//
// A file placeholder inside a git work tree is also listed in the
// repository's info/exclude for the run (a block marked with its owner), so
// `git status` and `git add -A` on the host do not see it.

type JournalEntry = {
  path: string;
  dev: number;
  ino: number;
  owners: string[];
  /** "file": a file placeholder with this content; "exclude": a git exclude file we added lines to. */
  kind?: "dir" | "file" | "exclude";
  content?: string;
};

function journalPath(stateDir: string): string {
  return path.join(stateDir, "containment-placeholders.json");
}

function readJournal(stateDir: string): JournalEntry[] {
  try {
    const v = JSON.parse(fs.readFileSync(journalPath(stateDir), "utf8")) as unknown;
    return Array.isArray(v)
      ? (v as JournalEntry[]).filter((e) => e && typeof e.path === "string")
      : [];
  } catch {
    return [];
  }
}

function writeJournal(stateDir: string, entries: JournalEntry[]): void {
  const tmp = `${journalPath(stateDir)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entries), { mode: 0o600 });
  fs.renameSync(tmp, journalPath(stateDir));
}

function withJournal<T>(stateDir: string, fn: (entries: JournalEntry[]) => T): T {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const lock = `${journalPath(stateDir)}.lock`;
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      fs.closeSync(fs.openSync(lock, "wx", 0o600));
      break;
    } catch {
      // A lock left by a dead process is taken over after its holder is gone.
      try {
        const holder = Number(fs.readFileSync(lock, "utf8"));
        if (holder && !pidAlive(holder)) {
          fs.rmSync(lock, { force: true });
          continue;
        }
      } catch {
        /* empty lock file: being written */
      }
      if (Date.now() > deadline) {
        throw new Error("enclawed containment: placeholder journal is locked");
      }
      spinWait(20);
    }
  }
  try {
    fs.writeFileSync(lock, String(process.pid));
    const entries = readJournal(stateDir);
    const out = fn(entries);
    writeJournal(stateDir, entries);
    return out;
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

function spinWait(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

const ownerAlive = (owner: string) => pidAlive(Number(owner.split(":")[0]));

const BLOCK_START = "# >>> enclawed containment placeholder ";
const BLOCK_END = "# <<< enclawed containment placeholder ";

/** `text` without the exclude blocks of the owners `drop` selects. */
function stripBlocks(text: string, drop: (owner: string) => boolean): string {
  const out: string[] = [];
  let skipping: string | null = null;
  for (const line of text.split("\n")) {
    if (skipping === null && line.startsWith(BLOCK_START)) {
      const owner = line.slice(BLOCK_START.length).trim();
      if (drop(owner)) {
        skipping = owner;
        continue;
      }
    }
    if (skipping !== null) {
      if (line === `${BLOCK_END}${skipping}`) {
        skipping = null;
      }
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Remove `e` if it is still the placeholder recorded; true when it is gone (or no longer ours). */
function removeIfUnused(e: JournalEntry): boolean {
  try {
    if (e.kind === "exclude") {
      const text = fs.readFileSync(e.path, "utf8");
      const kept = stripBlocks(text, (o) => !e.owners.includes(o));
      if (kept !== text) {
        fs.writeFileSync(e.path, kept);
      }
      return e.owners.length === 0;
    }
    const st = fs.lstatSync(e.path);
    if (st.dev !== e.dev || st.ino !== e.ino) {
      return true; // replaced by something that is not ours: forget it
    }
    if (e.kind === "file") {
      if (!st.isFile() || fs.readFileSync(e.path, "utf8") !== (e.content ?? "")) {
        return true; // written by someone: it is theirs now
      }
      fs.unlinkSync(e.path);
      return true;
    }
    if (!st.isDirectory() || fs.readdirSync(e.path).length > 0) {
      return true; // someone put files in it: it is theirs now
    }
    fs.rmdirSync(e.path);
    return true;
  } catch {
    return true;
  }
}

function prune(entries: JournalEntry[]): void {
  for (const e of entries) {
    e.owners = e.owners.filter(ownerAlive);
  }
  // Deepest first, so ".github/workflows" goes before ".github".
  entries.sort((a, b) => b.path.length - a.path.length);
  const keep = entries.filter((e) => {
    if (e.kind === "exclude") {
      // Strip the blocks of owners that are gone; keep the entry while any lives.
      removeIfUnused(e);
      return e.owners.length > 0;
    }
    return e.owners.length > 0 || !removeIfUnused(e);
  });
  entries.splice(0, entries.length, ...keep);
}

/** Remove placeholders left by containments whose process is gone (crash). */
export function sweepPlaceholders(stateDir: string): void {
  withJournal(stateDir, prune);
}

/** The git work tree top and info/exclude file that `p` belongs to, or null. */
function gitExcludeOf(p: string): { top: string; exclude: string } | null {
  for (let d = path.dirname(p); ; d = path.dirname(d)) {
    const dotGit = path.join(d, ".git");
    try {
      const st = fs.lstatSync(dotGit);
      let gitDir = dotGit;
      if (st.isFile()) {
        const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotGit, "utf8"));
        if (!m) {
          return null;
        }
        gitDir = path.resolve(d, m[1].trim());
      } else if (!st.isDirectory()) {
        return null;
      }
      let common = gitDir;
      try {
        common = path.resolve(
          gitDir,
          fs.readFileSync(path.join(gitDir, "commondir"), "utf8").trim(),
        );
      } catch {
        /* not a linked worktree */
      }
      return { top: d, exclude: path.join(common, "info", "exclude") };
    } catch {
      /* no .git here */
    }
    if (d === path.dirname(d)) {
      return null;
    }
  }
}

function acquirePlaceholders(
  placeholders: readonly Placeholder[],
  stateDir: string,
  owner: string,
): void {
  withJournal(stateDir, (entries) => {
    prune(entries);
    const excludes = new Map<string, string[]>();
    for (const ph of placeholders) {
      const p = ph.path;
      const chain: string[] = [];
      let cur = path.dirname(p);
      while (!fs.existsSync(cur)) {
        chain.unshift(cur);
        cur = path.dirname(cur);
      }
      for (const dir of chain) {
        fs.mkdirSync(dir, { mode: 0o755 });
        const st = fs.statSync(dir);
        entries.push({ path: dir, dev: st.dev, ino: st.ino, owners: [owner], kind: "dir" });
      }
      let made = false;
      try {
        if (ph.kind === "dir") {
          fs.mkdirSync(p, { mode: 0o755 });
        } else {
          fs.writeFileSync(p, ph.content, { flag: "wx", mode: 0o644 });
        }
        made = true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
          throw err;
        }
      }
      const st = fs.lstatSync(p);
      if (made) {
        entries.push(
          ph.kind === "dir"
            ? { path: p, dev: st.dev, ino: st.ino, owners: [owner], kind: "dir" }
            : {
                path: p,
                dev: st.dev,
                ino: st.ino,
                owners: [owner],
                kind: "file",
                content: ph.content,
              },
        );
      } else {
        // Made by another living containment: share it. (Something else that
        // appeared since planning is bound read-only all the same.)
        const e = entries.find((x) => x.path === p && x.dev === st.dev && x.ino === st.ino);
        if (e && !e.owners.includes(owner)) {
          e.owners.push(owner);
        }
      }
      if (ph.kind === "file") {
        const g = gitExcludeOf(p);
        if (g) {
          const list = excludes.get(g.exclude) ?? [];
          list.push(`/${path.relative(g.top, p).split(path.sep).join("/")}`);
          excludes.set(g.exclude, list);
        }
      }
    }
    for (const [file, lines] of excludes) {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        let text = "";
        try {
          text = fs.readFileSync(file, "utf8");
        } catch {
          /* no exclude file yet */
        }
        const block = [`${BLOCK_START}${owner}`, ...lines, `${BLOCK_END}${owner}`].join("\n");
        fs.writeFileSync(
          file,
          `${text}${text === "" || text.endsWith("\n") ? "" : "\n"}${block}\n`,
        );
        const e = entries.find((x) => x.kind === "exclude" && x.path === file);
        if (e) {
          e.owners.push(owner);
        } else {
          entries.push({ path: file, dev: 0, ino: 0, owners: [owner], kind: "exclude" });
        }
      } catch {
        /* not fatal: the placeholder still protects; git merely shows it */
      }
    }
  });
}

function releasePlaceholders(stateDir: string, owner: string): void {
  withJournal(stateDir, (entries) => {
    for (const e of entries) {
      if (e.kind === "exclude" && e.owners.includes(owner)) {
        try {
          const text = fs.readFileSync(e.path, "utf8");
          fs.writeFileSync(
            e.path,
            stripBlocks(text, (o) => o === owner),
          );
        } catch {
          /* gone */
        }
      }
      e.owners = e.owners.filter((o) => o !== owner);
    }
    prune(entries);
  });
}

// ─── Protected-path snapshot ────────────────────────────────────────────

/** Largest exec-config file whose original bytes are kept for restoring. */
const MAX_RESTORE_BYTES = 1024 * 1024;

type Snapshot = {
  cfg: ContainInitConfig["protect"];
  anchors: ContainInitConfig["anchors"];
  originals: Map<string, Buffer>;
};

/** Identity (and, for original files, content digest) of everything the host watches. */
function snapshotProtected(plan: ContainmentPlan): Snapshot {
  const originals = new Map<string, Buffer>();
  const cfg: Array<ContainInitConfig["protect"][number]> = [];
  for (const pr of plan.protect) {
    const st = fs.lstatSync(pr.path); // missing: throws, nothing starts
    let digest: string | null = null;
    if (pr.file && st.isFile()) {
      const bytes = fs.readFileSync(pr.path);
      digest = createHash("sha256").update(bytes).digest("hex");
      if (pr.origin === "original" && bytes.length <= MAX_RESTORE_BYTES) {
        originals.set(pr.path, bytes);
      }
    }
    cfg.push({ path: pr.path, origin: pr.origin, file: pr.file, dev: st.dev, ino: st.ino, digest });
  }
  const anchors = plan.anchored.map((a) => {
    const st = fs.lstatSync(a);
    return { path: a, dev: st.dev, ino: st.ino };
  });
  return { cfg, anchors, originals };
}

/** After a view change: put back original exec-config files that ./contain-init.ts quarantined. */
function restoreOriginals(
  snap: Snapshot,
  paths: readonly string[],
  onEvent: (e: ContainmentEvent) => void,
): void {
  for (const p of paths) {
    const bytes = snap.originals.get(p);
    if (!bytes) {
      continue;
    }
    try {
      fs.writeFileSync(p, bytes, { flag: "wx" });
      onEvent({ type: "notice", code: "containment-original-restored", path: p });
    } catch (err) {
      onEvent({
        type: "notice",
        code: "containment-original-not-restored",
        path: p,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ─── Opening a containment ──────────────────────────────────────────────

export type ContainmentEvent =
  | RelayEvent
  | Readonly<{ type: "attempt" | "ready" | "notice" | "refused"; [k: string]: unknown }>;

export type OpenContainmentOptions = Readonly<{
  /** Secret id -> value (from the host's credential store); never enters the container. */
  secretValues?: ReadonlyMap<string, string>;
  /** Enclawed's egress pipeline for outbound request bodies. */
  egressRunner?: EgressRunner | null;
  /** Where to connect for a destination (tests: a local stand-in). */
  upstream?: (host: string, port: number) => UpstreamTarget;
  /** Directory for the placeholder journal (Enclawed's own state dir). */
  stateDir: string;
  onEvent?: (event: ContainmentEvent) => void;
}>;

export type Containment = {
  /** Spawn this; stdio is passed through to the contained command. */
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  /** The handle a secret's variable carries inside (for audit and tests). */
  readonly handles: ReadonlyMap<string, string>;
  /**
   * Run one tool call: waits until no other call to this process is in
   * flight, puts `call` in flight while `run` runs, then ends it. Every
   * outbound request is bound to exactly that call. The way to call a
   * contained server.
   */
  runCall<T>(call: InFlightCall, run: () => Promise<T>): Promise<T>;
  /** The same, in two halves: resolves (with the function that ends the call) when the call is in flight. */
  acquireCall(call: InFlightCall): Promise<() => void>;
  /**
   * Put a call in flight at once. With two calls in flight their requests
   * cannot be attributed and are refused (call-ambiguous): use runCall.
   */
  beginCall(call: InFlightCall): void;
  endCall(callId: string): void;
  /**
   * Let the contained process write `path`, a file the contained git left
   * conflicted (reported as containment-repo-config-changed, state
   * "conflicted"), once a person approved the resolution. The write is
   * reported again (state "resolved") for admission and the approval then
   * ends. Throws for any other path.
   */
  approveRepoConfigWrite(path: string): void;
  revokeRepoConfigWrite(path: string): void;
  close(): Promise<void>;
};

export async function openContainment(
  plan: ContainmentPlan,
  opts: OpenContainmentOptions,
): Promise<Containment> {
  const sup = containmentSupport();
  if (!sup.ok) {
    throw new ContainmentUnavailableError(sup.reason);
  }
  for (const s of plan.secrets) {
    if (!opts.secretValues?.has(s.id)) {
      throw new Error(
        `enclawed containment: secret ${s.id} is declared but its value was not provided`,
      );
    }
  }
  const onEvent = opts.onEvent ?? (() => {});
  sweepPlaceholders(opts.stateDir);
  // Short enough for its sockets under any TMPDIR (unix-socket-dir.ts).
  const sockDir = privateSocketDir("ecw-contain-", { maxName: 10 });
  const eventSock = path.join(sockDir, "events.sock");
  const relaySock = path.join(sockDir, "relay.sock");
  const emptyDir = path.join(sockDir, "empty");
  const emptyFile = path.join(sockDir, "empty-file");
  fs.mkdirSync(emptyDir, { mode: 0o555 });
  fs.writeFileSync(emptyFile, "", { mode: 0o444 });

  // The CA vouches only for the names the relay terminates TLS for.
  const ca = createContainerCa(
    plan.label,
    plan.destinations.filter((d) => d.mode === "inspect").map((d) => d.host),
  );
  const handles = new Map<string, string>();
  const env: Record<string, string> = { ...plan.env };
  for (const s of plan.secrets) {
    const h = `enclawed-handle-${randomBytes(16).toString("hex")}`;
    handles.set(s.id, h);
    env[s.variable] = h;
  }
  const caPath = CA_BUNDLE_PATHS[0];
  env.NODE_EXTRA_CA_CERTS = caPath;
  env.SSL_CERT_FILE = caPath;
  env.REQUESTS_CA_BUNDLE = caPath;
  env.CURL_CA_BUNDLE = caPath;
  env.GIT_SSL_CAINFO = caPath;
  const ops: MountOp[] = [...plan.ops];
  for (const p of CA_BUNDLE_PATHS) {
    // The container's only trust anchor: its own CA.
    ops.push({ op: "dir", path: path.dirname(p) });
    ops.push({ op: "file", path: p, content: ca.certPem });
  }

  const owner = `${process.pid}:${randomBytes(8).toString("hex")}`;
  acquirePlaceholders(plan.placeholders, opts.stateDir, owner);
  let snap: Snapshot;
  try {
    snap = snapshotProtected(plan);
  } catch (err) {
    releasePlaceholders(opts.stateDir, owner);
    fs.rmSync(sockDir, { recursive: true, force: true });
    throw new Error(
      `enclawed containment: a protected path changed before start: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  const quarantineDir = path.join(opts.stateDir, "containment-quarantine");
  if (!plan.nameGuard) {
    releasePlaceholders(opts.stateDir, owner);
    fs.rmSync(sockDir, { recursive: true, force: true });
    throw new ContainmentUnavailableError(
      "the plan has no name guard; nothing is started without it",
    );
  }
  const guardSha256 = nameGuardDigest(plan.nameGuard);
  if (guardSha256 === null) {
    releasePlaceholders(opts.stateDir, owner);
    fs.rmSync(sockDir, { recursive: true, force: true });
    throw new ContainmentUnavailableError(
      "the plan names a name guard this process did not verify",
    );
  }
  const guardConfig = path.join(sockDir, "guard.conf");
  const guardJournal = path.join(sockDir, "guard.journal");
  const guardApprovals = path.join(sockDir, "guard.approvals");
  const conflicted = new Set<string>();
  const approvals = new Set<string>();
  const writeApprovals = () => {
    const tmp = `${guardApprovals}.tmp`;
    fs.writeFileSync(tmp, [...approvals].map((a) => `${a}\n`).join(""), { mode: 0o600 });
    fs.renameSync(tmp, guardApprovals);
  };
  // The contained git (when it is an allowed program) may check tracked exec-config out.
  const gitExes = [
    ...new Set(
      [
        ...plan.programs.filter((p) => path.basename(p) === "git"),
        ...(plan.programs.some((p) => path.basename(p) === "git") ? ["/usr/lib/git-core/git"] : []),
      ]
        .filter((p) => fs.existsSync(p))
        .map((p) => fs.realpathSync(p)),
    ),
  ];
  fs.writeFileSync(guardApprovals, "", { mode: 0o600 });
  fs.writeFileSync(
    guardConfig,
    nameGuardConfig(plan.rwRoots, plan.execConfigWritable, gitExes, guardApprovals),
    {
      mode: 0o600,
    },
  );
  fs.writeFileSync(guardJournal, "", { mode: 0o600 });

  const relay = createEgressRelay({
    label: plan.label,
    destinations: plan.destinations,
    ca,
    secrets: plan.secrets,
    secretValues: opts.secretValues ?? new Map(),
    handles,
    egressRunner: opts.egressRunner ?? null,
    upstream: opts.upstream,
    onEvent,
  });

  const conns = new Set<net.Socket>();
  let closed = false;
  let eventServer: net.Server | null = null;
  let relayServer: net.Server | null = null;
  const shutdown = async () => {
    if (closed) {
      return;
    }
    closed = true;
    await new Promise((r) => setTimeout(r, 50));
    relay.close();
    for (const c of conns) {
      c.destroy();
    }
    await Promise.all(
      [eventServer, relayServer].map(
        (srv) =>
          new Promise<void>((r) => {
            if (!srv?.listening) {
              r();
              return;
            }
            srv.close(() => r());
          }),
      ),
    );
    releasePlaceholders(opts.stateDir, owner);
    fs.rmSync(sockDir, { recursive: true, force: true });
  };
  eventServer = net.createServer((sock) => {
    conns.add(sock);
    // The containment's own connection never holds the parent's event loop
    // open; the contained process's stdio (or the caller) does.
    sock.unref();
    let buf = "";
    sock.setEncoding("utf8");
    sock.on("data", (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        try {
          const ev = JSON.parse(line) as ContainmentEvent;
          if (
            ev.type === "notice" &&
            ev.code === "containment-repo-config-changed" &&
            Array.isArray(ev.paths)
          ) {
            for (const c of ev.paths as Array<{ path?: unknown; state?: unknown }>) {
              if (typeof c.path !== "string") {
                continue;
              }
              if (c.state === "conflicted") {
                conflicted.add(c.path);
              }
            }
          }
          if (ev.type === "notice" && ev.code === "containment-repo-config-approved-write") {
            if (typeof ev.path === "string" && approvals.delete(ev.path)) {
              writeApprovals(); // one approved write session per approval
            }
          }
          if (ev.type === "refused" && Array.isArray(ev.restore)) {
            restoreOriginals(
              snap,
              (ev.restore as unknown[]).filter((x): x is string => typeof x === "string"),
              onEvent,
            );
          }
          onEvent(ev);
        } catch {
          /* malformed or failing reporter: never stop the next report */
        }
      }
    });
    sock.on("error", () => {});
    sock.on("close", () => {
      conns.delete(sock);
      // contain-init is gone (the run ended, or it failed to set up): the
      // relay and event sockets, placeholders and the socket directory go too.
      void shutdown();
    });
  });
  relayServer = net.createServer((sock) => relay.handle(sock));
  try {
    await Promise.all(
      [
        [eventServer, eventSock],
        [relayServer, relaySock],
      ].map(
        ([srv, p]) =>
          new Promise<void>((resolve, reject) => {
            (srv as net.Server).once("error", reject);
            (srv as net.Server).listen(p as string, () => resolve());
          }),
      ),
    );
  } catch (err) {
    await shutdown();
    throw err;
  }
  eventServer.unref();
  relayServer.unref();

  const relayPorts = [...new Set(plan.destinations.map((d) => d.port))];
  const cfg: ContainInitConfig = {
    sockDir,
    eventSock,
    relaySock,
    relayPorts,
    viewRoot: path.join(sockDir, "root"),
    ops,
    emptyDir,
    emptyFile,
    bwrap: systemBinary("bwrap")!,
    mount: systemBinary("mount")!,
    uid: plan.uid,
    gid: plan.gid,
    command: plan.command,
    args: [...plan.args],
    cwd: plan.cwd,
    env,
    strictExec: plan.strictExec,
    protect: snap.cfg,
    anchors: snap.anchors,
    quarantineDir,
    installGuards: [...plan.installGuards],
    nameGuard: {
      binary: plan.nameGuard,
      sha256: guardSha256,
      socket: `enclawed-guard-${randomBytes(12).toString("hex")}`,
      config: guardConfig,
      journal: guardJournal,
    },
  };
  const argv = [systemBinary("unshare")!, ...OUTER_FLAGS, ...containInitCommand()];
  return {
    argv,
    env: { ENCLAWED_CONTAIN: JSON.stringify(cfg), PATH: "/usr/sbin:/usr/bin:/sbin:/bin" },
    handles,
    async runCall(call, run) {
      const end = await relay.acquireCall(call);
      try {
        return await run();
      } finally {
        end();
      }
    },
    acquireCall: (c) => relay.acquireCall(c),
    approveRepoConfigWrite(p) {
      if (!conflicted.has(p)) {
        throw new Error(
          `enclawed containment: ${p} is not a conflicted repository configuration file`,
        );
      }
      approvals.add(p);
      writeApprovals();
    },
    revokeRepoConfigWrite(p) {
      if (approvals.delete(p)) {
        writeApprovals();
      }
    },
    beginCall: (c) => relay.beginCall(c),
    endCall: (id) => relay.endCall(id),
    close: shutdown,
  };
}
