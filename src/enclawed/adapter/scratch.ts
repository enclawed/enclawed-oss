// enclawed adapter kit: where an adapter's session lives on disk, and which
// directories may be treated as scratch (no history).
//
//   scratch          A scratch directory keeps no restore points, so it must
//                    never cover files the person would want back: it must be
//                    absolute, not a filesystem root, not inside (or an
//                    ancestor of) the home directory, and neither inside nor
//                    containing the project or any protected path. The host
//                    names the candidates (its own session scratchpad); the
//                    kit drops every unsafe one (red-team F4: a scratchpad
//                    equal to the project made every in-project overwrite
//                    "scratch", with nothing to restore).
//   session root     The private directory the adapter's session files, its
//                    control socket and its relay live in: the first of
//                    XDG_RUNTIME_DIR, TMPDIR, the system temp directory and the
//                    adapter's state directory that is not inside the project
//                    (red-team I14), as a 0700 directory of this user's own.
//
// Ported from codenclawed's policy.mjs (isSafeScratchDir, withScratch) and
// session.mjs (sessionRoot).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPolicy, type Policy } from "../policy.js";
import { SESSION_ROOT_MAX_BYTES } from "../unix-socket-dir.js";
import { isInside, realpathNearestSync } from "./fs-probe.js";
import { ownedPrivateDir } from "./transport.js";

/** May `dir` be treated as scratch (no history)? See the header. */
export function isSafeScratchDir(
  dir: unknown,
  o: Readonly<{ home: string; projectDir?: string | null; protectedPaths?: readonly string[] }>,
): dir is string {
  if (typeof dir !== "string" || !path.isAbsolute(dir)) {
    return false;
  }
  const norm = path.resolve(dir);
  if (norm === path.parse(norm).root) {
    return false;
  }
  // The home directory or any ancestor of it (every user file lies below).
  if (isInside(norm, path.resolve(o.home))) {
    return false;
  }
  for (const p of [o.projectDir ?? null, ...(o.protectedPaths ?? [])]) {
    if (p && (isInside(norm, p) || isInside(p, norm))) {
      return false;
    }
  }
  return true;
}

/** The policy with the host's scratch candidates that are safe added to its scratch paths. */
export function withScratchPaths(
  policy: Policy,
  candidates: readonly unknown[],
  o: Readonly<{ home: string; projectDir?: string | null; protectedPaths?: readonly string[] }>,
): Policy {
  const add = candidates.filter((d) => isSafeScratchDir(d, o)).map((d) => path.resolve(d));
  if (add.length === 0) {
    return policy;
  }
  return createPolicy({
    enforceAllowlists: policy.enforceAllowlists,
    allowedChannels: policy.allowedChannels,
    allowedProviders: policy.allowedProviders,
    allowedTools: policy.allowedTools,
    allowedHosts: policy.allowedHosts,
    commandNetwork: policy.commandNetwork,
    preApprovedIrreversibleTools: policy.preApprovedIrreversibleTools,
    scratchPaths: [...policy.scratchPaths, ...add],
    history: {
      maxFileBytes: policy.history.maxFileBytes,
      maxTotalBytes: policy.history.maxTotalBytes,
      maxAgeDays: policy.history.maxAgeDays,
      noHistoryPaths: policy.history.noHistoryPaths,
      noHistoryTools: policy.history.noHistoryTools,
    },
    maxOutputClearance: policy.maxOutputClearance,
    defaultDataLabel: policy.defaultDataLabel,
  });
}

export {
  privateSocketDir,
  SESSION_ROOT_MAX_BYTES,
  UNIX_SOCKET_PATH_MAX_BYTES,
} from "../unix-socket-dir.js";

/**
 * The adapter's private session root (see the header), created if needed.
 * `name`: the adapter's directory name (`<name>-<uid>` under the base);
 * `stateDir`: its state directory, the last resort. Throws when every base is
 * inside the project or unusable.
 *
 * The adapter's Unix sockets (its control, relay and auth-relay sockets) live
 * in directories under this root, and a Unix socket path is limited (108 bytes
 * on Linux, 104 on macOS, counting the terminating NUL). A base whose root
 * leaves too little room (a long TMPDIR) is skipped for the next one (the
 * system's /tmp), so a socket never fails to start for its length.
 */
export function privateSessionRoot(
  o: Readonly<{
    env: Readonly<Record<string, string | undefined>>;
    projectDir: string;
    name: string;
    stateDir: string;
  }>,
): string {
  if (!/^[A-Za-z0-9._-]+$/.test(o.name)) {
    throw new Error(`privateSessionRoot: ${JSON.stringify(o.name)} is not a directory name`);
  }
  const uid = process.getuid?.() ?? "u";
  const project = realpathNearestSync(path.resolve(o.projectDir));
  const bases = [
    o.env.XDG_RUNTIME_DIR,
    o.env.TMPDIR,
    process.platform === "win32" ? os.tmpdir() : "/tmp",
    o.stateDir,
  ].filter((b): b is string => typeof b === "string" && b.trim() !== "");
  for (const base of bases) {
    const realBase = realpathNearestSync(path.resolve(base));
    const root = path.join(realBase, `${o.name}-${uid}`);
    if (isInside(project, realBase) || isInside(project, root)) {
      continue;
    }
    if (Buffer.byteLength(root) > SESSION_ROOT_MAX_BYTES) {
      continue;
    }
    try {
      fs.mkdirSync(root, { recursive: true, mode: 0o700 });
      ownedPrivateDir(root);
      return root;
    } catch {
      /* the next base */
    }
  }
  throw new Error(
    `found no private directory outside the project for ${o.name}'s session files ` +
      "(XDG_RUNTIME_DIR, TMPDIR, the system temp directory and the state directory are all inside it, unusable, " +
      `or longer than ${SESSION_ROOT_MAX_BYTES} bytes, too long for the Unix sockets the session creates under it)`,
  );
}
