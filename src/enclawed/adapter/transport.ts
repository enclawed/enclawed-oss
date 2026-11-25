// enclawed adapter kit: hook transport security, the host-neutral parts.
//
// A host runs the adapter's hook as a separate program for every event. Any
// process of the same user can also run that program, on any input, so the
// launcher must know that a decision came from the REAL hook, for the REAL
// call, in the REAL context. The kit owns those decisions:
//
//   session file     what the hook is configured with, written by the launcher
//                    into a private directory; its SHA-256 is on the hook's
//                    command line, so a changed file is refused (readSessionFile)
//   environment      the hook runs with an emptied environment (`env -i`
//                    semantics): only the session file's environment reaches
//                    it (hookEnvironment, replaceProcessEnv, emptyEnvCommand);
//                    a peer carrying a code-loading variable was started some
//                    other way (envCodeLoadingRisk)
//   peer check       the kernel's answer to "who is on the other end of the
//                    control socket": a descendant of the host the launcher
//                    started, running this Node, with exactly the hook command
//                    line, with no code-loading variable (verifyHookPeer); and
//                    on the hook side, the launcher itself (verifyLauncherPeer)
//   handshake        the verified hook gets a challenge (an HMAC under a key
//                    kept in the launcher's memory), writes its session-start
//                    record carrying it into the hash-chained audit log, and
//                    returns the record's hash; only a genuine chained record
//                    with this launch's nonce and challenge counts (HookHandshake)
//   call binding     a decision counts only for a call the host's transcript
//                    shows, with the same tool, input and context
//                    (CallLedger, contextMatches); the first decision for a
//                    call is final; only a call decided "ask" may be put to
//                    the person, once
//   reconcile        the audit log against itself and against the host's
//                    transcripts (reconcile)
//
// What stays in the adapter: the socket itself, the host's hook input and
// output, the host's transcript format (it hands the kit parsed calls), the
// host's permission modes and scratchpad layout (it hands the kit data).
//
// Ported from codenclawed's session.mjs (readSession, hookEnvironment),
// peer.mjs, control.mjs, call-binding.mjs (contextMatches) and reconcile.mjs.

import { spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildRecord, type AuditRecord } from "../audit-log.js";
import { bindingMatches, type CallBinding } from "./approval.js";
import { isInside, realpathNearestSync, trustedBinary } from "./fs-probe.js";
import { compareHostMode, type HostModeOrder } from "./host-modes.js";
import {
  HANDSHAKE_TIMEOUT_S,
  handshakeTimeoutAction,
  type HandshakeTimeoutAction,
} from "./launch-refusals.js";
import { FRAMEWORK_ENV_ALLOW } from "./session.js";
import { textOf } from "./untrusted.js";

const sha256 = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");

// ─── Session file ───────────────────────────────────────────────────────

export const SESSION_FILE_VERSION = 1;

export class SessionFileError extends Error {
  override name = "SessionFileError";
}

const myUid = () => (typeof process.getuid === "function" ? process.getuid() : null);

/** A directory of this user's own that no other user may enter. Throws otherwise. */
export function ownedPrivateDir(dir: string): void {
  const st = fs.lstatSync(dir);
  if (!st.isDirectory()) {
    throw new Error(`${dir} is not a directory`);
  }
  const uid = myUid();
  if (uid !== null && st.uid !== uid) {
    throw new Error(`${dir} belongs to another user`);
  }
  if (process.platform !== "win32" && (st.mode & 0o077) !== 0) {
    throw new Error(`${dir} is open to other users (mode ${(st.mode & 0o777).toString(8)})`);
  }
}

/** Launcher side: write the session file (0600, never over an existing file) and return its digest. */
export function writeSessionFile(
  dir: string,
  session: Readonly<Record<string, unknown>>,
): { file: string; digest: string } {
  ownedPrivateDir(dir);
  const file = path.join(dir, "session.json");
  const text = `${JSON.stringify({ ...session, v: SESSION_FILE_VERSION }, null, 2)}\n`;
  fs.writeFileSync(file, text, { mode: 0o600, flag: "wx" });
  return { file, digest: sha256(text) };
}

/** Launcher side: replace the session file atomically; the new digest goes on the next hook command line. */
export function rewriteSessionFile(
  file: string,
  session: Readonly<Record<string, unknown>>,
): string {
  const text = `${JSON.stringify({ ...session, v: SESSION_FILE_VERSION }, null, 2)}\n`;
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, text, { mode: 0o600, flag: "wx" });
  fs.renameSync(tmp, file);
  return sha256(text);
}

/**
 * Hook side: read the session file named on the command line, and accept it
 * only when it is a regular file (no symlink), this user's, not open to other
 * users, in a private directory, with exactly the digest the launcher recorded.
 */
export function readSessionFile(file: unknown, digest: unknown): Record<string, unknown> {
  if (typeof file !== "string" || !path.isAbsolute(file)) {
    throw new SessionFileError("no session file on the hook command line");
  }
  if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) {
    throw new SessionFileError("no session digest on the hook command line");
  }
  let fd: number;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  } catch (err) {
    throw new SessionFileError(`cannot open the session file ${file}: ${(err as Error).message}`);
  }
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) {
      throw new SessionFileError(`${file} is not a regular file`);
    }
    const uid = myUid();
    if (uid !== null && st.uid !== uid) {
      throw new SessionFileError(`${file} belongs to another user`);
    }
    if (process.platform !== "win32" && (st.mode & 0o077) !== 0) {
      throw new SessionFileError(`${file} is readable or writable by other users`);
    }
    try {
      ownedPrivateDir(path.dirname(file));
    } catch (err) {
      throw new SessionFileError(`session directory: ${(err as Error).message}`);
    }
    const buf = fs.readFileSync(fd);
    if (sha256(buf) !== digest) {
      throw new SessionFileError(
        `${file} does not match the digest recorded at launch; it was changed`,
      );
    }
    let s: Record<string, unknown>;
    try {
      s = JSON.parse(buf.toString("utf8")) as Record<string, unknown>;
    } catch {
      throw new SessionFileError(`${file} is not valid JSON`);
    }
    if (s?.v !== SESSION_FILE_VERSION) {
      throw new SessionFileError(`${file} has an unsupported version`);
    }
    return s;
  } finally {
    fs.closeSync(fd);
  }
}

// ─── Environment (`env -i` semantics) ───────────────────────────────────

/**
 * Variables that make node (or the dynamic loader) run other code: every
 * NODE_*, the loader's LD_PRELOAD / LD_AUDIT / LD_LIBRARY_PATH, and macOS
 * DYLD_*. The genuine hook starts with an emptied environment, so its
 * environment has none of them.
 */
export const CODE_LOADING_ENV =
  /^(NODE_[A-Z0-9_]*|LD_PRELOAD|LD_AUDIT|LD_LIBRARY_PATH|DYLD_[A-Z_]*)$/;

/**
 * The first code-loading variable in a process's initial environment (the
 * NUL-separated /proc/<pid>/environ bytes, or a record), or null. An
 * environment that could not be read (null) counts as a risk: fail closed.
 */
export function envCodeLoadingRisk(
  environ: Buffer | string | Readonly<Record<string, unknown>> | null,
): string | null {
  if (environ === null) {
    return "an unreadable environment";
  }
  const names =
    typeof environ === "string" || Buffer.isBuffer(environ)
      ? Buffer.from(environ)
          .toString("latin1")
          .split("\0")
          .map((e) => (e.indexOf("=") < 0 ? e : e.slice(0, e.indexOf("="))))
      : Object.keys(environ);
  return names.find((n) => CODE_LOADING_ENV.test(n)) ?? null;
}

/** The variables a hook needs from the launcher's environment, on every host. */
export const HOOK_PASS_ENV: readonly string[] = [
  "HOME",
  "USERPROFILE",
  "PATH",
  "LANG",
  "LC_ALL",
  "XDG_RUNTIME_DIR",
  "SYSTEMROOT",
  "COMSPEC",
  "PATHEXT",
  "WINDIR",
];

// Allowlisted framework variables that are still not passed to a hook.
const FRAMEWORK_ENV_DROP = new Set(["ENCLAWED_CONFIG_PATH", "ENCLAWED_TEST_FAST"]);

/**
 * The environment the hook (and so the framework) runs with: only what the
 * launcher resolved. The pass list (HOOK_PASS_ENV plus the host's own, such
 * as its config directory), the allowlisted framework variables, then the
 * launcher's fixed values. A temporary directory inside the project would be
 * agent-writable scratch, so TMPDIR falls back to the session directory.
 */
export function hookEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  o: {
    projectDir: string;
    sessionDir: string;
    pass?: readonly string[];
    fixed?: Readonly<Record<string, string>>;
  },
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of [...HOOK_PASS_ENV, ...(o.pass ?? [])]) {
    const v = env[k];
    if (typeof v === "string" && v !== "" && !CODE_LOADING_ENV.test(k)) {
      out[k] = v;
    }
  }
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string" && FRAMEWORK_ENV_ALLOW.has(k) && !FRAMEWORK_ENV_DROP.has(k)) {
      out[k] = v;
    }
  }
  Object.assign(out, o.fixed ?? {});
  const tmp = env.TMPDIR;
  out.TMPDIR =
    tmp && !isInside(o.projectDir, realpathNearestSync(path.resolve(tmp))) ? tmp : o.sessionDir;
  return out;
}

/** Replace this process's environment wholesale (before the framework is loaded). */
export function replaceProcessEnv(
  next: Readonly<Record<string, string>>,
  target: NodeJS.ProcessEnv = process.env,
): void {
  for (const k of Object.keys(target)) {
    delete target[k];
  }
  Object.assign(target, next);
}

const quotePosix = (s: string) =>
  /^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;

/**
 * The shell command line that starts the hook with an emptied environment:
 * `env -i NAME="$NAME"... <node> <hook> <args...>`, keeping only the named
 * host variables (for example the host's project directory). `envProgram`
 * should be a trusted system binary (trustedBinary("env")). With no `env`
 * program the environment cannot be emptied, and null is returned: the
 * adapter must say so and must not fall back silently.
 */
export function emptyEnvCommand(
  argv: readonly string[],
  o: { keep?: readonly string[]; envProgram?: string | null } = {},
): string | null {
  const envBin = o.envProgram !== undefined ? o.envProgram : trustedBinary("env");
  if (!envBin) {
    return null;
  }
  const keep = (o.keep ?? []).filter((k) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k));
  return [
    quotePosix(envBin),
    "-i",
    ...keep.map((k) => `${k}="$${k}"`),
    ...argv.map(quotePosix),
  ].join(" ");
}

// ─── Peer verification ──────────────────────────────────────────────────

/** Who holds the other end of a control socket connection, as the kernel says. */
export type PeerLookup =
  | Readonly<{ available: false; reason: string }>
  | Readonly<{ available: true; pid: number | null; reason: string | null }>;

/** Facts about a process, read from the kernel. */
export interface ProcessProbe {
  exe(pid: number): string | null;
  argv(pid: number): string[] | null;
  /** The process's initial environment, or null when unreadable. */
  environ(pid: number): Buffer | null;
  /** Parent pid of every process. */
  parents(): Map<number, number>;
}

export function isDescendant(pid: number, ancestor: number, parents: Map<number, number>): boolean {
  let p: number | undefined = pid;
  for (let i = 0; i < 256 && p !== undefined && p > 1; i++) {
    p = parents.get(p);
    if (p === ancestor) {
      return true;
    }
  }
  return false;
}

export type PeerVerdict =
  | Readonly<{ ok: true; verified: true; pid: number }>
  | Readonly<{ ok: true; verified: false; reason: string }>
  | Readonly<{ ok: false; reason: string }>;

/**
 * Launcher side: may this connection speak for the hook? The peer must be a
 * descendant of the host process the launcher started, run `exe` (this Node,
 * real path), have exactly the hook command line, and carry no code-loading
 * variable. Where the platform cannot tell who the peer is, the connection is
 * accepted UNVERIFIED (`verified: false`): the adapter must record that and
 * say it to the person; it never counts as verified.
 */
export function verifyHookPeer(
  peer: PeerLookup,
  expect: { hostPid: number | null; exe: string; argv: readonly string[] },
  probe: ProcessProbe,
): PeerVerdict {
  if (!peer.available) {
    return { ok: true, verified: false, reason: peer.reason };
  }
  if (expect.hostPid === null) {
    return { ok: false, reason: "the agent CLI has not started" };
  }
  if (peer.pid === null) {
    return { ok: false, reason: peer.reason ?? "unknown peer" };
  }
  if (!isDescendant(peer.pid, expect.hostPid, probe.parents())) {
    return { ok: false, reason: `peer ${peer.pid} is not a process of this session's agent CLI` };
  }
  const exe = probe.exe(peer.pid);
  if (exe !== expect.exe) {
    return { ok: false, reason: `peer ${peer.pid} runs ${exe ?? "(unknown)"}, not this Node` };
  }
  const argv = probe.argv(peer.pid);
  if (!argv || argv.length !== expect.argv.length || argv.some((a, i) => a !== expect.argv[i])) {
    return {
      ok: false,
      reason: `peer ${peer.pid} is not running Enclawed's hook command for this session`,
    };
  }
  const risk = envCodeLoadingRisk(probe.environ(peer.pid));
  if (risk) {
    return {
      ok: false,
      reason: `peer ${peer.pid} carries ${risk} in its environment, which can load other code into node`,
    };
  }
  return { ok: true, verified: true, pid: peer.pid };
}

/** Hook side: is the control socket served by the launcher named in the session file? */
export function verifyLauncherPeer(
  peer: PeerLookup,
  launcherPid: number,
): Readonly<{ ok: boolean; verified: boolean; reason: string | null }> {
  if (!peer.available) {
    return { ok: true, verified: false, reason: peer.reason };
  }
  return peer.pid === launcherPid
    ? { ok: true, verified: true, reason: null }
    : {
        ok: false,
        verified: true,
        reason: `the control socket is not served by the launcher (pid ${launcherPid})`,
      };
}

/** The Linux process probe (/proc). */
export function linuxProcessProbe(): ProcessProbe {
  return {
    exe(pid) {
      try {
        return fs.readlinkSync(`/proc/${pid}/exe`);
      } catch {
        return null;
      }
    },
    argv(pid) {
      try {
        return fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").slice(0, -1);
      } catch {
        return null;
      }
    },
    environ(pid) {
      try {
        return fs.readFileSync(`/proc/${pid}/environ`);
      } catch {
        return null;
      }
    },
    parents() {
      const map = new Map<number, number>();
      let names: string[] = [];
      try {
        names = fs.readdirSync("/proc");
      } catch {
        return map;
      }
      for (const n of names) {
        if (!/^\d+$/.test(n)) {
          continue;
        }
        try {
          const stat = fs.readFileSync(`/proc/${n}/stat`, "utf8");
          // comm may hold spaces and parens: the fields after the last ")".
          const rest = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
          map.set(Number(n), Number(rest[1]));
        } catch {
          /* gone */
        }
      }
      return map;
    },
  };
}

/**
 * Linux: the process holding the other end of a unix socket with local inode
 * `localInode`, from the kernel's sock_diag answer (`ss -xnH`, a trusted
 * system binary) and /proc/<pid>/fd. Elsewhere: unavailable.
 */
export function linuxPeerLookup(
  localInode: string | null,
  o: { candidates?: readonly number[]; socketPath?: string | null; probe?: ProcessProbe } = {},
): PeerLookup {
  const ss = process.platform === "linux" ? trustedBinary("ss") : null;
  if (!ss || !fs.existsSync("/proc/self/fd")) {
    return {
      available: false,
      reason:
        process.platform === "linux"
          ? "ss (iproute2) is not installed"
          : `no peer-credential lookup on ${process.platform}`,
    };
  }
  if (!localInode) {
    return { available: true, pid: null, reason: "cannot read this end's socket inode" };
  }
  const r = spawnSync(ss, o.socketPath ? ["-xnH", "src", o.socketPath] : ["-xnH"], {
    encoding: "utf8",
    timeout: 3000,
    maxBuffer: 32 * 1024 * 1024,
  });
  let peerIno: string | null = null;
  if (r.status === 0 && typeof r.stdout === "string") {
    for (const line of r.stdout.split("\n")) {
      // ... <local addr> <local inode> <peer addr> <peer inode>; read from the end.
      const t = line.trim().split(/\s+/);
      if (t.length >= 4 && t[t.length - 3] === localInode) {
        peerIno = t[t.length - 1];
        break;
      }
    }
  }
  if (!peerIno) {
    return { available: true, pid: null, reason: "the kernel reports no peer for this connection" };
  }
  const want = `socket:[${peerIno}]`;
  const holds = (pid: number) => {
    try {
      return fs.readdirSync(`/proc/${pid}/fd`).some((fd) => {
        try {
          return fs.readlinkSync(`/proc/${pid}/fd/${fd}`) === want;
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  };
  const pids = o.candidates ?? [...(o.probe ?? linuxProcessProbe()).parents().keys()];
  const pid = pids.find(holds) ?? null;
  return {
    available: true,
    pid,
    reason: pid === null ? "no expected process holds the other end" : null,
  };
}

// ─── The session-start handshake ────────────────────────────────────────

/** Recompute an audit record's hash (the framework's buildRecord). */
export function recordHashOf(rec: AuditRecord): string {
  return buildRecord({
    prevHash: rec.prevHash,
    type: rec.type,
    actor: rec.actor,
    level: rec.level,
    payload: rec.payload,
    ts: rec.ts,
  }).recordHash;
}

/**
 * Find the record with `hash` among the audit log's lines and check it is a
 * genuine link of the chain: its own hash recomputes, it links to the record
 * before it, and every record from `fromHash` (when present) to it links.
 */
export function verifyChainedRecord(
  lines: readonly string[],
  hash: string,
  o: { fromHash?: string | null } = {},
): Readonly<{ ok: true; record: AuditRecord }> | Readonly<{ ok: false; reason: string }> {
  const recs: (AuditRecord | null)[] = lines
    .filter((l) => l.trim() !== "")
    .map((l) => {
      try {
        return JSON.parse(l) as AuditRecord;
      } catch {
        return null;
      }
    });
  const at = recs.findLastIndex((r) => r?.recordHash === hash);
  if (at < 0) {
    return { ok: false, reason: "the record is not in the audit log" };
  }
  let start = at;
  if (o.fromHash) {
    const f = recs.findIndex((r) => r?.recordHash === o.fromHash);
    if (f >= 0 && f < at) {
      start = f;
    }
  }
  for (let i = start; i <= at; i++) {
    const r = recs[i];
    if (!r || recordHashOf(r) !== r.recordHash) {
      return { ok: false, reason: `audit record ${i + 1} does not hash to its recordHash` };
    }
    if (i > 0 && recs[i - 1]?.recordHash !== r.prevHash) {
      return { ok: false, reason: `audit record ${i + 1} does not link to the record before it` };
    }
  }
  return { ok: true, record: recs[at] as AuditRecord };
}

/**
 * The launcher's half of the handshake. The key lives only in this object
 * (the launcher's memory); nothing the session's processes can read holds it.
 * A raw line with the nonce counts for nothing: only a chained record of
 * `recordType` carrying this launch's nonce and an issued, unused challenge.
 */
export class HookHandshake {
  private readonly key = randomBytes(32);
  private counter = 0;
  private readonly issued = new Set<string>();
  private doneRecord: string | null = null;
  private readonly waiters = new Set<(v: boolean) => void>();

  constructor(
    readonly o: {
      nonce: string;
      /** The session-start record type the engine writes (`<host>.session.start`). */
      recordType: string;
      /** This launch's own record, to chain from. */
      launchHash?: () => string | null;
    },
  ) {}

  get done(): boolean {
    return this.doneRecord !== null;
  }

  get record(): string | null {
    return this.doneRecord;
  }

  /** A challenge for a VERIFIED hook connection (verifyHookPeer). */
  challenge(): string {
    const c = createHmac("sha256", this.key)
      .update(`challenge|${this.o.nonce}|${this.counter++}`)
      .digest("hex");
    this.issued.add(c);
    return c;
  }

  /** The hook says it wrote its record (with `challenge`) and gives its hash. */
  accept(
    challenge: string,
    recordHash: string,
    auditLines: readonly string[],
  ): Readonly<{ ok: true }> | Readonly<{ ok: false; reason: string }> {
    if (!this.issued.has(challenge)) {
      return { ok: false, reason: "no such challenge was issued, or it was already used" };
    }
    const v = verifyChainedRecord(auditLines, recordHash, { fromHash: this.o.launchHash?.() });
    if (!v.ok) {
      return v;
    }
    const p = (v.record.payload ?? {}) as Record<string, unknown>;
    if (
      v.record.type !== this.o.recordType ||
      p.launcherNonce !== this.o.nonce ||
      p.handshake !== challenge
    ) {
      return {
        ok: false,
        reason: "the session-start record does not carry this launch's nonce and challenge",
      };
    }
    this.issued.delete(challenge);
    this.doneRecord = recordHash;
    for (const w of this.waiters) {
      w(true);
    }
    return { ok: true };
  }

  /** Resolves true once the handshake is done, false after `ms` (default: the kit's HANDSHAKE_TIMEOUT_S). */
  wait(ms: number = HANDSHAKE_TIMEOUT_S * 1000): Promise<boolean> {
    if (this.done) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const w = (v: boolean) => {
        clearTimeout(t);
        this.waiters.delete(w);
        resolve(v);
      };
      const t = setTimeout(() => w(false), ms);
      this.waiters.add(w);
    });
  }

  /**
   * The launch-time deadline: when the handshake is not done HANDSHAKE_TIMEOUT_S
   * after this call, `onTimeout` gets the kit's decision (headless: stop the
   * host; interactive: warn). Returns a cancel function. `setTimer` is a seam
   * for tests (it gets the constant's milliseconds); it is not a way to change
   * the timeout.
   */
  watchDeadline(o: {
    headless: boolean;
    onTimeout: (a: HandshakeTimeoutAction) => void;
    refused?: () => string | null;
    setTimer?: (fn: () => void, ms: number) => () => void;
  }): () => void {
    if (this.done) {
      return () => {};
    }
    let cancelled = false;
    const fire = () => {
      if (cancelled || this.done) {
        return;
      }
      cancelled = true;
      o.onTimeout(handshakeTimeoutAction({ headless: o.headless, refused: o.refused?.() ?? null }));
    };
    const set =
      o.setTimer ??
      ((fn: () => void, ms: number) => {
        const t = setTimeout(fn, ms);
        t.unref?.();
        return () => clearTimeout(t);
      });
    const cancelTimer = set(fire, HANDSHAKE_TIMEOUT_S * 1000);
    return () => {
      cancelled = true;
      cancelTimer();
    };
  }

  /** Stop waiting (the session ends): every waiter gets false. */
  close(): void {
    for (const w of this.waiters) {
      w(false);
    }
  }
}

// ─── Call binding and context ───────────────────────────────────────────

/** What the hook reports about the context it decided in, besides the input. */
export type ReportedContext = Readonly<{
  cwd: string | null;
  mode: string | null;
  scratchpadDir: string | null;
  sessionId: string | null;
}>;

/** A tool call as the host's transcript shows it (the adapter parses the transcript). */
export type TranscriptCall = Readonly<{
  id: string;
  name: string | null;
  input: unknown;
  /** The working directory the host recorded on that line, if any. */
  cwd?: string | null;
  sessionId?: string | null;
  /** A non-error result for it is in the transcript. */
  ran?: boolean;
}>;

/** What the launcher knows about the session (host data, decided on by the kit). */
export type LaunchContext = Readonly<{
  cwd: string;
  realpath?: (p: string) => string;
  /** The host's permission modes. */
  modes: readonly string[];
  /** The host's mode that skips its own prompts, and whether the launch made it available. */
  bypassMode?: string | null;
  bypassAvailable: boolean;
  /**
   * Headless: the mode the host was started in; it cannot change (a plan mode
   * may leave plan, not into bypass), except to a narrower mode the host fell
   * back to by itself (modeOrder).
   */
  launchedMode?: string | null;
  planMode?: string | null;
  /** The order of the host's modes (host data): a narrower reported mode is a downgrade, not a mismatch. */
  modeOrder?: HostModeOrder | null;
  headless: boolean;
  /** The host's scratchpad for a session id (its layout is host specific), or null when it has none. */
  scratchpadFor?: (sessionId: string) => readonly string[] | null;
}>;

/** The host runs in a narrower mode than it was launched in (it fell back by itself). */
export type ModeDowngrade = Readonly<{ launched: string; reported: string }>;

export type ContextCheck =
  | Readonly<{ ok: true; downgraded?: ModeDowngrade }>
  | Readonly<{ ok: false; code: "context-mismatch"; reason: string }>;

/**
 * Does the reported context match what the launcher knows? The decision
 * depends on all of it (a relative path resolves against cwd; a bypass mode
 * turns an ask into a deny; a write in the scratchpad is a scratch write), so
 * a forged context must not change what a decision means.
 */
export function contextMatches(
  reported: ReportedContext | null | undefined,
  seen: Pick<TranscriptCall, "cwd" | "sessionId"> | null | undefined,
  launch: LaunchContext,
): ContextCheck {
  const bad = (reason: string) => ({ ok: false, code: "context-mismatch", reason }) as const;
  const r = reported ?? { cwd: null, mode: null, scratchpadDir: null, sessionId: null };
  const real = launch.realpath ?? realpathNearestSync;
  if (typeof r.cwd !== "string" || !path.isAbsolute(r.cwd)) {
    return bad("the hook reported no absolute working directory");
  }
  const want = typeof seen?.cwd === "string" && path.isAbsolute(seen.cwd) ? seen.cwd : launch.cwd;
  if (real(path.normalize(r.cwd)) !== real(path.normalize(want))) {
    return bad(
      `the hook decided in working directory ${JSON.stringify(r.cwd.slice(0, 200))}, but the call runs in ${JSON.stringify(want.slice(0, 200))}`,
    );
  }
  if (seen?.sessionId && r.sessionId !== seen.sessionId) {
    return bad("the hook's session id differs from the transcript's");
  }
  const mode = r.mode;
  if (typeof mode !== "string" || !launch.modes.includes(mode)) {
    return bad(
      `the hook reported an unknown permission mode ${JSON.stringify(String(mode).slice(0, 40))}`,
    );
  }
  if (launch.bypassMode && mode === launch.bypassMode && !launch.bypassAvailable) {
    return bad(`the hook reported ${mode}, which this session was not started with`);
  }
  let downgraded: ModeDowngrade | null = null;
  if (
    launch.headless &&
    launch.launchedMode &&
    mode !== launch.launchedMode &&
    !(launch.planMode && launch.launchedMode === launch.planMode && mode !== launch.bypassMode)
  ) {
    // A stricter mode than launched (the host fell back by itself) runs no
    // more than the launch allowed: accepted, and reported for the record. A
    // wider or incomparable mode would run more than was launched.
    const narrower =
      launch.modeOrder &&
      compareHostMode(
        mode,
        launch.launchedMode,
        {
          ...launch.modeOrder,
          planMode: launch.modeOrder.planMode ?? launch.planMode ?? null,
          bypassMode: launch.modeOrder.bypassMode ?? launch.bypassMode ?? null,
        },
        { bypassAvailable: launch.bypassAvailable },
      ) === "narrower";
    if (!narrower) {
      return bad(
        `the hook reported permission mode ${JSON.stringify(mode)}, but this headless session runs in ${JSON.stringify(launch.launchedMode)}`,
      );
    }
    downgraded = { launched: launch.launchedMode, reported: mode };
  }
  if (r.scratchpadDir !== null && r.scratchpadDir !== undefined) {
    const sid = seen?.sessionId ?? r.sessionId;
    const allowed = typeof sid === "string" ? (launch.scratchpadFor?.(sid) ?? null) : null;
    if (
      !allowed ||
      !allowed.some((p) => path.normalize(p) === path.normalize(r.scratchpadDir as string))
    ) {
      return bad(
        `the hook reported scratchpad ${JSON.stringify(r.scratchpadDir.slice(0, 200))}, which is not this session's scratchpad`,
      );
    }
  }
  return downgraded ? { ok: true, downgraded } : { ok: true };
}

export type CallReport = Readonly<{
  tool: string | null;
  binding: CallBinding | null;
  context?: ReportedContext | null;
}>;

export type Mismatch = Readonly<{ id: string; code: string; reason: string }>;

export type PreVerdict =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: "deferred" }>
  | Readonly<{ ok: false; reason: string; mismatch?: Mismatch }>;

/**
 * The launcher's ledger of calls: which tool calls the transcript showed,
 * which the verified hook decided, what it decided (first report only),
 * which ran, which were put to the person and approved there.
 */
export class CallLedger {
  readonly seen = new Map<string, TranscriptCall>();
  readonly decisions = new Map<string, "pending" | "allow" | "ask" | "deny">();
  readonly posts = new Set<string>();
  readonly prompted = new Set<string>();
  readonly approved = new Set<string>();
  readonly mismatches: Mismatch[] = [];
  /** Calls decided in a narrower mode than launched (the host fell back by itself), for the record. */
  readonly downgrades: (ModeDowngrade & Readonly<{ id: string }>)[] = [];
  private readonly deferred = new Map<string, CallReport>();
  private firstMode: string | null = null;

  constructor(
    private readonly o: {
      cwd: string | null;
      home: string | null;
      context?: () => LaunchContext;
    },
  ) {}

  private check(id: string, report: CallReport, call: TranscriptCall): Mismatch | null {
    const m = bindingMatches({ tool: report.tool, binding: report.binding }, call, {
      cwd: this.o.cwd,
      home: this.o.home,
    });
    let bad: Mismatch | null = m.ok ? null : { id, code: m.code, reason: m.reason };
    if (!bad && this.o.context) {
      const launch = this.o.context();
      const c = contextMatches(report.context, call, {
        ...launch,
        launchedMode: launch.launchedMode ?? (launch.headless ? this.firstMode : null),
      });
      if (!c.ok) {
        bad = { id, code: c.code, reason: c.reason };
      } else {
        // A headless mode cannot change: the first one reported is the session's.
        this.firstMode ??= report.context?.mode ?? null;
        if (c.downgraded) {
          this.downgrades.push({ id, ...c.downgraded });
        }
      }
    }
    if (bad) {
      this.mismatches.push(bad);
    }
    return bad;
  }

  /** A call the transcript showed. Returns the mismatch of a deferred report for it, if any. */
  noteUse(call: TranscriptCall): Mismatch | null {
    if (typeof call?.id !== "string" || this.seen.has(call.id)) {
      return null;
    }
    this.seen.set(call.id, call);
    const pending = this.deferred.get(call.id);
    if (!pending) {
      return null;
    }
    this.deferred.delete(call.id);
    return this.check(call.id, pending, call);
  }

  /**
   * The verified hook is deciding call `id`. Accepted only for a call the
   * transcript shows with the same tool, input and context. With `defer`
   * (a host that writes the call to its transcript only after the hook
   * answered), an unseen call is kept and checked as soon as it appears.
   */
  pre(id: string | null, report: CallReport, o: { defer?: boolean } = {}): PreVerdict {
    if (!id) {
      return { ok: false, reason: "the hook reported no call id" };
    }
    const call = this.seen.get(id);
    if (!call) {
      if (!o.defer) {
        return {
          ok: false,
          reason: `the transcript shows no tool call ${id}; a decision is accepted only for a call the agent CLI wrote there`,
        };
      }
      if (!this.deferred.has(id)) {
        this.deferred.set(id, report);
      }
      this.decisions.set(id, this.decisions.get(id) ?? "pending");
      return { ok: "deferred" };
    }
    const bad = this.check(id, report, call);
    if (bad) {
      return {
        ok: false,
        reason: `${bad.reason}; this decision is not for that call`,
        mismatch: bad,
      };
    }
    if (!this.decisions.has(id)) {
      this.decisions.set(id, "pending");
    }
    return { ok: true };
  }

  /** The hook's decision for a call that passed `pre`. Only the first one counts. */
  decision(id: string | null, d: unknown): Readonly<{ ok: boolean; reason: string | null }> {
    if (
      !id ||
      this.decisions.get(id) !== "pending" ||
      !["allow", "ask", "deny"].includes(String(d))
    ) {
      return {
        ok: false,
        reason:
          id && this.decisions.has(id) && this.decisions.get(id) !== "pending"
            ? `a decision for ${id} was already reported`
            : "no pending call for this decision",
      };
    }
    this.decisions.set(id, d as "allow" | "ask" | "deny");
    return { ok: true, reason: null };
  }

  /** May call `id` be put to the person? Only a call decided "ask", once. */
  mayPrompt(id: string | null): Readonly<{ ok: boolean; reason: string | null }> {
    if (!id || this.decisions.get(id) !== "ask") {
      return { ok: false, reason: "no call decided ask matches this request" };
    }
    if (this.prompted.has(id)) {
      return { ok: false, reason: `call ${id} was already put to the person` };
    }
    this.prompted.add(id);
    return { ok: true, reason: null };
  }

  /** The person approved call `id` at the launcher's own prompt. */
  approve(id: string): void {
    if (this.prompted.has(id)) {
      this.approved.add(id);
    }
  }

  /** A tool result for a decided call the transcript shows, with the same input. */
  post(id: string | null, report: CallReport): boolean {
    const call = id ? this.seen.get(id) : undefined;
    if (!id || !call || !this.decisions.has(id)) {
      return false;
    }
    const m = bindingMatches({ tool: report.tool, binding: report.binding }, call, {
      cwd: this.o.cwd,
      home: this.o.home,
    });
    if (m.ok) {
      this.posts.add(id);
    }
    return m.ok;
  }
}

// ─── Reconcile ──────────────────────────────────────────────────────────

export type ReconcileFinding = Readonly<{
  session: string;
  severity: "error" | "warn" | "info";
  code: string;
  detail: string;
}>;

type Pre = {
  decision: unknown;
  tool: unknown;
  inputDigest: string | null;
  binding: CallBinding | null;
  projectDir: string | null;
};

/**
 * Reconcile the audit log against itself and against the host's transcripts:
 * sessions without a start or end, calls that ran without a recorded
 * decision or despite a deny, inputs changed after the decision, launches
 * whose hooks never reported in, and transcript calls the log never saw or
 * that do not match the recorded decision. Record types are the engine's,
 * prefixed with the host id (`<host>.tool.pre`, ...). `readTranscript`
 * parses the host's transcript (null when it is missing); `transcriptsOf`
 * adds the host's subagent transcripts.
 */
export async function reconcile(
  records: Iterable<unknown> | AsyncIterable<unknown>,
  o: {
    host: string;
    readTranscript?: (file: string) => Promise<readonly TranscriptCall[] | null>;
    transcriptsOf?: (files: readonly string[]) => readonly string[];
    home?: string | null;
  },
): Promise<{ sessions: number; launches: number; findings: ReconcileFinding[] }> {
  const pre = `${o.host}.`;
  type S = {
    id: string;
    start: number | null;
    end: boolean;
    transcripts: Set<string>;
    pre: Map<string, Pre>;
    post: Set<string>;
    postDigest: Map<string, string>;
  };
  const sessions = new Map<string, S>();
  const get = (id: unknown): S => {
    const key = typeof id === "string" && id ? id : "(none)";
    let s = sessions.get(key);
    if (!s) {
      s = {
        id: key,
        start: null,
        end: false,
        transcripts: new Set(),
        pre: new Map(),
        post: new Set(),
        postDigest: new Map(),
      };
      sessions.set(key, s);
    }
    return s;
  };
  const launches = new Map<string, { ts: number; cwd: unknown }>();
  const nonces = new Set<string>();
  const findings: ReconcileFinding[] = [];
  const iso = (ts: unknown) =>
    typeof ts === "number" ? new Date(ts).toISOString() : "(unknown time)";
  for await (const raw of records as AsyncIterable<unknown>) {
    const r = raw as { type?: unknown; ts?: unknown; payload?: Record<string, unknown> };
    if (typeof r?.type !== "string" || !r.type.startsWith(pre)) {
      continue;
    }
    const t = r.type.slice(pre.length);
    const p = r.payload ?? {};
    const callId = (p.callId ?? p.toolUseId) as string | undefined;
    switch (t) {
      case "launch":
        if (typeof p.nonce === "string" && !p.managed && !p.background) {
          launches.set(p.nonce, { ts: r.ts as number, cwd: p.cwd });
        }
        continue;
      case "audit.gap":
        findings.push({
          session: "(log)",
          severity: "error",
          code: "audit-gap",
          detail: `${String(p.reason)} at ${iso(r.ts)}`,
        });
        continue;
      case "launch.decision-violated":
        findings.push({
          session: "(launch)",
          severity: "error",
          code: "decision-violated",
          detail: `${String(p.callId ?? p.toolUseId)} ran although Enclawed decided ${String(p.decision)}`,
        });
        continue;
      case "launch.anchor-tamper":
        findings.push({
          session: "(launch)",
          severity: "error",
          code: "anchor-tamper",
          detail: textOf(p.reason ?? "the audit log or its anchor changed during a session"),
        });
        continue;
      case "launch.settings-dropped":
        findings.push({
          session: "(launch)",
          severity: "error",
          code: "settings-dropped",
          detail: textOf(p.detail ?? "the agent CLI did not load Enclawed's settings"),
        });
        continue;
      default:
        break;
    }
    if (/^(launch|auth|policy|history|hardware)\./.test(t)) {
      continue;
    }
    const s = get(p.sessionId);
    switch (t) {
      case "session.start":
        s.start ??= typeof r.ts === "number" ? r.ts : 0;
        if (typeof p.transcriptPath === "string") {
          s.transcripts.add(p.transcriptPath);
        }
        if (typeof p.launcherNonce === "string") {
          nonces.add(p.launcherNonce);
        }
        break;
      case "subagent.stop":
        if (typeof p.agentTranscriptPath === "string") {
          s.transcripts.add(p.agentTranscriptPath);
        }
        break;
      case "session.end":
        s.end = true;
        break;
      case "tool.pre":
      case "hook.error":
        if (typeof callId === "string") {
          s.pre.set(callId, {
            decision: p.answered ?? p.decision,
            tool: p.tool,
            inputDigest: typeof p.inputDigest === "string" ? p.inputDigest : null,
            binding: (p.binding as CallBinding | null) ?? null,
            projectDir: typeof p.projectDir === "string" ? p.projectDir : null,
          });
        }
        break;
      case "tool.post":
      case "tool.failure":
        if (typeof callId === "string") {
          s.post.add(callId);
          if (typeof p.inputDigest === "string") {
            s.postDigest.set(callId, p.inputDigest);
          }
        }
        break;
      default:
        break;
    }
  }
  for (const [nonce, l] of launches) {
    if (!nonces.has(nonce)) {
      findings.push({
        session: "(launch)",
        severity: "error",
        code: "launch-without-hooks",
        detail: `the agent CLI was launched in ${String(l.cwd)} at ${iso(l.ts)} but its hooks never reported in`,
      });
    }
  }
  for (const s of sessions.values()) {
    if (s.start === null) {
      findings.push({
        session: s.id,
        severity: "warn",
        code: "no-session-start",
        detail: "tool calls recorded without a session start",
      });
    }
    if (!s.end) {
      findings.push({
        session: s.id,
        severity: "info",
        code: "no-session-end",
        detail: "still running, or ended without its end hook",
      });
    }
    for (const id of s.post) {
      const d = s.pre.get(id);
      if (!d) {
        findings.push({
          session: s.id,
          severity: "error",
          code: "ran-without-decision",
          detail: id,
        });
      } else if (d.decision === "deny") {
        findings.push({ session: s.id, severity: "error", code: "ran-despite-deny", detail: id });
      } else if (d.inputDigest && s.postDigest.has(id) && s.postDigest.get(id) !== d.inputDigest) {
        findings.push({
          session: s.id,
          severity: "error",
          code: "input-changed-after-decision",
          detail: `${id} (${String(d.tool)})`,
        });
      }
    }
    for (const [id, d] of s.pre) {
      if (d.decision === "allow" && !s.post.has(id)) {
        findings.push({
          session: s.id,
          severity: "info",
          code: "allowed-no-result",
          detail: `${id} (${String(d.tool)})`,
        });
      }
    }
    if (!o.readTranscript) {
      continue;
    }
    const files = o.transcriptsOf ? o.transcriptsOf([...s.transcripts]) : [...s.transcripts];
    for (const f of files) {
      const calls = await o.readTranscript(f);
      if (calls === null) {
        findings.push({ session: s.id, severity: "warn", code: "transcript-missing", detail: f });
        continue;
      }
      for (const call of calls) {
        const d = s.pre.get(call.id);
        if (!d) {
          findings.push({
            session: s.id,
            severity: "error",
            code: "transcript-call-without-decision",
            detail: call.id,
          });
          continue;
        }
        if (call.ran && (d.decision === "deny" || (d.decision === "ask" && !s.post.has(call.id)))) {
          findings.push({
            session: s.id,
            severity: "error",
            code: "ran-despite-decision",
            detail: `${call.id} (${String(call.name)}) ran although Enclawed decided ${d.decision}`,
          });
        }
        if (d.tool !== call.name) {
          findings.push({
            session: s.id,
            severity: "error",
            code: "tool-name-mismatch",
            detail: `${call.id}: the log records ${String(d.tool)}, the transcript ${String(call.name)}`,
          });
        } else if (d.binding) {
          const m = bindingMatches({ tool: d.tool as string, binding: d.binding }, call, {
            cwd: d.projectDir,
            home: o.home ?? null,
          });
          if (!m.ok) {
            findings.push({
              session: s.id,
              severity: "error",
              code: "tool-input-mismatch",
              detail: `${call.id} (${String(call.name)}): ${m.reason}`,
            });
          }
        }
      }
    }
  }
  return { sessions: sessions.size, launches: launches.size, findings };
}
