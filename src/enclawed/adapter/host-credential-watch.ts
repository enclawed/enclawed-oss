// enclawed adapter kit: a credential file of the host product appeared in
// plaintext. Never left where the host can read it.
//
// With a device bound, the adapter keeps the host's login sealed under the
// device and opens it only inside its own sessions (login-seal.ts,
// auth-relay.ts). A person who signs in with the host directly (outside the
// adapter) leaves a plaintext login at rest, which the host itself would use
// until the adapter's next launch. This module closes that window:
//
//   - findHostCredentials: what is at the host's credential paths now (a
//     regular file with content, a link, or one of the host's own transient
//     write files, or a file this module moved aside and did not finish);
//   - secureHostCredential: the decision and the move. No device bound: left
//     alone (the person's ordinary login; nothing seals it). Device bound:
//     the file is first renamed aside in its own directory (atomic: the host
//     loses it at once, and a newer login the host writes later is a new
//     file, never overwritten), then sealed under the device into the
//     pending directory when the caller holds a device-verified activation
//     (`seal`), else quarantined there (its bytes moved, mode 0600 in a 0700
//     directory of the adapter's protected state, and the aside copy
//     overwritten and removed). A link is removed, never followed. Either way
//     the result is pending: the person resolves it at the next adapter
//     command (adopt it as the sealed login, or discard it);
//   - watchHostCredentials: a watcher (file-system events on the parent
//     directories, plus a poll at a fixed interval) that runs the decision
//     on every appearance, serialized, within CREDENTIAL_WATCH_BOUND_MS.
//
// Limits, said plainly: the watcher runs as the user, so a process of the
// same user can stop it, and it can read the plaintext in the instant before
// it is moved (or the quarantined copy: quarantine takes the login out of the
// host's reach, not out of the user's). Only an administrator-managed host
// policy (managed-login-policy.ts) makes the host unable to sign in or read a
// stored login at all. An overwrite is not guaranteed to reach old blocks on
// SSDs and copy-on-write filesystems, and moving a login does not revoke it at
// the provider: the person signs out of other sessions there.

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * How long after a plaintext login appears it is sealed or quarantined (the watcher's bound),
 * counted while the watcher runs: a directory event triggers a pass at once and a fixed poll
 * covers a missed event, so the bound holds within 1 s of the watcher being scheduled. A starved
 * process takes it when it next runs; an adapter's launch precheck takes or refuses a plaintext
 * login before any launch, so no session starts with one present.
 */
export const CREDENTIAL_WATCH_BOUND_MS = 1000;
/** The watcher's poll interval (beside file-system events). */
const POLL_MS = 250;
/** The largest credential file taken (a login is a few hundred bytes). */
const MAX_BYTES = 1024 * 1024;
/** The suffix of a file moved aside and not yet finished. */
export const HELD_MARK = ".enclawed-held.";

export type HostCredentialSpec = Readonly<{
  /** The files the host keeps a plaintext login in. */
  files: readonly string[];
  /** The host's own transient write files: in each file's directory, names starting with `<base><prefix>`. */
  transientSuffixes?: readonly string[];
}>;

export type FoundCredential = Readonly<{
  file: string;
  kind: "file" | "link" | "transient" | "held";
}>;

/** What is at the host's credential paths now (empty files are not a login). */
export function findHostCredentials(spec: HostCredentialSpec): FoundCredential[] {
  const out: FoundCredential[] = [];
  const seen = new Set<string>();
  const add = (file: string, kind: FoundCredential["kind"]) => {
    if (!seen.has(file)) {
      seen.add(file);
      out.push({ file, kind });
    }
  };
  for (const file of [...new Set(spec.files)].toSorted()) {
    let st: fs.Stats | null = null;
    try {
      st = fs.lstatSync(file);
    } catch {
      st = null;
    }
    if (st?.isSymbolicLink()) {
      add(file, "link");
    } else if (st?.isFile() && st.size > 0) {
      add(file, "file");
    }
    const dir = path.dirname(file);
    const base = path.basename(file);
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir).toSorted();
    } catch {
      names = [];
    }
    for (const n of names) {
      const kind = n.startsWith(`${base}${HELD_MARK}`)
        ? "held"
        : (spec.transientSuffixes ?? []).some((s) => n.startsWith(`${base}${s}`))
          ? "transient"
          : null;
      if (!kind) {
        continue;
      }
      const p = path.join(dir, n);
      try {
        const s = fs.lstatSync(p);
        if (s.isSymbolicLink() || (s.isFile() && s.size > 0)) {
          add(p, s.isSymbolicLink() ? "link" : kind);
        }
      } catch {
        /* gone */
      }
    }
  }
  return out;
}

/** The pending directory: made 0700, a real directory owned by this user. */
function pendingDirProblem(dir: string): string | null {
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const st = fs.lstatSync(dir);
    if (st.isSymbolicLink() || !st.isDirectory()) {
      return `${dir} is not a real directory`;
    }
    if (typeof process.getuid === "function" && st.uid !== process.getuid()) {
      return `${dir} is not owned by this user`;
    }
    if ((st.mode & 0o077) !== 0) {
      fs.chmodSync(dir, 0o700);
    }
    return null;
  } catch (err) {
    return `${dir}: ${(err as NodeJS.ErrnoException).code ?? "unusable"}`;
  }
}

/** Overwrite and remove; true when the path is gone. */
function eraseAside(file: string): boolean {
  try {
    const st = fs.lstatSync(file);
    if (st.isFile()) {
      const fd = fs.openSync(file, "r+");
      try {
        const n = Math.max(st.size, 1);
        fs.writeSync(fd, randomBytes(n), 0, n, 0);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    }
  } catch {
    /* removal below still matters */
  }
  fs.rmSync(file, { force: true });
  return !fs.existsSync(file);
}

const stamp = (now: number) =>
  `${new Date(now).toISOString().replace(/[:.]/g, "-")}.${randomBytes(4).toString("hex")}`;

export type SecureCredentialAction = "left" | "sealed" | "quarantined" | "link-removed";

export type SecureCredentialResult =
  | Readonly<{ ok: true; action: SecureCredentialAction; file: string; pendingFile: string | null }>
  | Readonly<{
      ok: false;
      code: "not-a-file" | "too-large" | "move-failed" | "pending-dir" | "plaintext-left";
      file: string;
      message: string;
    }>;

/**
 * Seal the bytes at `heldFile` into `sealedFile` under the device and erase
 * `heldFile` (the adapter passes the kit's sealLoginFile bound to the
 * activation's keys).
 */
export type SealHeld = (
  heldFile: string,
  sealedFile: string,
) => Readonly<{ ok: boolean; plaintextErased?: boolean }>;

/**
 * The decision and the move for one found credential. `sealBound`: a device
 * is bound to this installation (else the file is left: the person's ordinary
 * login). `seal`: given only while the caller holds a device-verified
 * activation; without it, the login is quarantined.
 */
export function secureHostCredential(
  o: Readonly<{
    found: FoundCredential;
    sealBound: boolean;
    pendingDir: string;
    label: string;
    seal?: SealHeld | null;
    now?: () => number;
  }>,
): SecureCredentialResult {
  const file = o.found.file;
  if (!o.sealBound) {
    return { ok: true, action: "left", file, pendingFile: null };
  }
  let st: fs.Stats;
  try {
    st = fs.lstatSync(file);
  } catch {
    return { ok: true, action: "left", file, pendingFile: null }; // gone meanwhile
  }
  if (st.isSymbolicLink()) {
    fs.rmSync(file, { force: true });
    return fs.existsSync(file)
      ? {
          ok: false,
          code: "plaintext-left",
          file,
          message: `the link ${file} could not be removed`,
        }
      : { ok: true, action: "link-removed", file, pendingFile: null };
  }
  if (!st.isFile()) {
    return { ok: false, code: "not-a-file", file, message: `${file} is not a regular file` };
  }
  if (st.size > MAX_BYTES) {
    return { ok: false, code: "too-large", file, message: `${file} is larger than a login` };
  }
  // Out of the host's reach first: renamed aside in its own directory (atomic, never followed).
  let held = file;
  if (o.found.kind !== "held") {
    held = `${file}${HELD_MARK}${randomBytes(6).toString("hex")}`;
    try {
      fs.renameSync(file, held);
    } catch (err) {
      return {
        ok: false,
        code: "move-failed",
        file,
        message: `${file} could not be moved (${(err as NodeJS.ErrnoException).code ?? "error"})`,
      };
    }
  }
  const dirProblem = pendingDirProblem(o.pendingDir);
  if (dirProblem) {
    // Never back where the host reads it: the aside copy is erased (the person signs in again).
    eraseAside(held);
    return {
      ok: false,
      code: "pending-dir",
      file,
      message: `${dirProblem}; the login was erased instead of kept`,
    };
  }
  const id = `${o.label}.${stamp((o.now ?? Date.now)())}`;
  if (o.seal) {
    const sealed = path.join(o.pendingDir, `${id}.sealed.json`);
    const r = o.seal(held, sealed);
    if (r.ok && r.plaintextErased) {
      return { ok: true, action: "sealed", file, pendingFile: sealed };
    }
    fs.rmSync(sealed, { force: true });
    if (!fs.existsSync(held)) {
      return {
        ok: false,
        code: "plaintext-left",
        file,
        message: "the login was neither sealed nor kept",
      };
    }
  }
  // Quarantine: the bytes into the pending directory (exclusive, 0600), the aside copy erased.
  const pending = path.join(o.pendingDir, `${id}.pending`);
  try {
    const bytes = fs.readFileSync(held);
    const fd = fs.openSync(
      pending,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        (fs.constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    try {
      fs.writeSync(fd, bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    bytes.fill(0);
  } catch (err) {
    eraseAside(held);
    fs.rmSync(pending, { force: true });
    return {
      ok: false,
      code: "pending-dir",
      file,
      message: `the login could not be kept (${(err as NodeJS.ErrnoException).code ?? "error"}); it was erased`,
    };
  }
  if (!eraseAside(held)) {
    return {
      ok: false,
      code: "plaintext-left",
      file,
      message: `${held} could not be erased; remove it by hand`,
    };
  }
  return { ok: true, action: "quarantined", file, pendingFile: pending };
}

export type PendingCredential = Readonly<{
  file: string;
  sealed: boolean;
  size: number;
  mtimeMs: number;
}>;

/** The pending logins, oldest first. */
export function pendingHostCredentials(pendingDir: string, label: string): PendingCredential[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(pendingDir);
  } catch {
    return [];
  }
  const out: PendingCredential[] = [];
  for (const n of names) {
    if (!n.startsWith(`${label}.`) || !(n.endsWith(".pending") || n.endsWith(".sealed.json"))) {
      continue;
    }
    const file = path.join(pendingDir, n);
    try {
      const st = fs.lstatSync(file);
      if (st.isFile()) {
        out.push({ file, sealed: n.endsWith(".sealed.json"), size: st.size, mtimeMs: st.mtimeMs });
      }
    } catch {
      /* gone */
    }
  }
  return out.toSorted((a, b) => a.mtimeMs - b.mtimeMs || (a.file < b.file ? -1 : 1));
}

/** Overwrite and remove a pending login (the person discarded it); true when gone. */
export function discardPendingCredential(file: string): boolean {
  return eraseAside(file);
}

export type WatchEvent = Readonly<{ found: FoundCredential; result: SecureCredentialResult }>;

export type HostCredentialWatch = Readonly<{
  /** One pass now (serialized with the watcher's own). */
  sweep(): Promise<WatchEvent[]>;
  close(): void;
}>;

/**
 * Watch the host's credential paths: every appearance is handed to `handle`
 * (the adapter's secureHostCredential call), serialized, within
 * CREDENTIAL_WATCH_BOUND_MS. Events on the parent directories trigger a pass
 * at once; a poll covers directories that do not exist yet and missed events.
 */
export function watchHostCredentials(
  o: Readonly<{
    spec: HostCredentialSpec;
    handle: (found: FoundCredential) => SecureCredentialResult | Promise<SecureCredentialResult>;
    onEvent?: (e: WatchEvent) => void;
    /** Keep the process alive while watching (a watcher process of its own); default: do not. */
    keepAlive?: boolean;
  }>,
): HostCredentialWatch {
  let closed = false;
  const isOpen = () => !closed;
  let running: Promise<WatchEvent[]> | null = null;
  let again = false;
  const pass = async (): Promise<WatchEvent[]> => {
    const events: WatchEvent[] = [];
    for (const found of findHostCredentials(o.spec)) {
      if (found.kind === "transient") {
        // The host's own write in progress: it becomes the file at once (or is left behind, taken next pass).
        try {
          if (Date.now() - fs.lstatSync(found.file).mtimeMs < POLL_MS * 2) {
            continue;
          }
        } catch {
          continue;
        }
      }
      let result: SecureCredentialResult;
      try {
        result = await o.handle(found);
      } catch (err) {
        result = {
          ok: false,
          code: "move-failed",
          file: found.file,
          message: err instanceof Error ? err.message : String(err),
        };
      }
      const e = { found, result };
      events.push(e);
      try {
        o.onEvent?.(e);
      } catch {
        /* a reporter's failure never stops the watcher */
      }
    }
    return events;
  };
  const sweep = (): Promise<WatchEvent[]> => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      const all: WatchEvent[] = [];
      do {
        again = false;
        all.push(...(await pass()));
      } while (again && isOpen());
      return all;
    })().finally(() => {
      running = null;
    });
    return running;
  };
  const watchers: fs.FSWatcher[] = [];
  for (const dir of [...new Set(o.spec.files.map((f) => path.dirname(f)))].toSorted()) {
    try {
      const w = fs.watch(dir, { persistent: true }, () => {
        if (!closed) {
          void sweep();
        }
      });
      w.on("error", () => {
        /* the poll still covers it */
      });
      watchers.push(w);
    } catch {
      /* not there yet: the poll covers it */
    }
  }
  const timer = setInterval(() => {
    if (!closed) {
      void sweep();
    }
  }, POLL_MS);
  if (!o.keepAlive) {
    timer.unref?.();
    for (const w of watchers) {
      w.unref?.();
    }
  }
  void sweep();
  return {
    sweep,
    close() {
      closed = true;
      clearInterval(timer);
      for (const w of watchers) {
        w.close();
      }
    },
  };
}
