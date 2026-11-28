// enclawed adapter kit: launch-time refusals and the hook-handshake timing.
//
// Three decisions a launcher makes before (or just after) it starts the host:
//
//   Project overlap. The adapter's installation and Enclawed's state directory
//   (audit log, policy, history, signed records) must not overlap the project
//   the agent edits. Writes there are denied call by call anyway (protected
//   paths); refusing the launch up front keeps the overlap from going
//   unnoticed. Refused in every direction: the project contains a protected
//   root, is one, or is inside one. Compared after resolving symlinks (the
//   nearest existing prefix), case-insensitively after NFC.
//
//   Transcript-disabling flags (requirement R4). Without the host's on-disk
//   transcript the launcher cannot see a call that ran without a decision, so
//   a host flag that turns the transcript off refuses the launch. The adapter
//   supplies its host's flag names (data); only the host's own options are
//   looked at (everything after the `--` that ends them is the prompt).
//
//   Handshake timing. The hooks must report in (HookHandshake in
//   ./transport.ts) within HANDSHAKE_TIMEOUT_S, an internal constant, never a
//   setting. With no person at the terminal (headless) the host is stopped at
//   the deadline; interactively the person is warned (every call already
//   waits for the hooks and is refused without them). At the end of the
//   session a missing handshake fails the session unless the host itself
//   failed first.
//
// Ported from codenclawed's launcher.mjs (prepareLaunch, the handshake timer
// and the end-of-session verdict) and authority.mjs (HANDSHAKE_TIMEOUT_S).

import path from "node:path";
import { isInside, realpathNearestSync } from "./fs-probe.js";

// ─── Project overlap ────────────────────────────────────────────────────

/** A directory the project must not overlap, with the words that name it in a message. */
export type ProtectedRoot = Readonly<{ label: string; path: string }>;

export type ProjectOverlapRefusal = Readonly<{
  code: "project-is-protected" | "project-contains-protected" | "project-inside-protected";
  label: string;
  /** Both resolved (realpath of the nearest existing prefix). */
  project: string;
  protectedPath: string;
  message: string;
}>;

/**
 * Does the project directory overlap one of the protected roots? null: the
 * launch may go on. `realpath` resolves a path (default: the nearest existing
 * prefix's realpath); it is a seam for tests only.
 */
export function decideProjectOverlap(o: {
  projectDir: string;
  roots: readonly ProtectedRoot[];
  realpath?: (p: string) => string;
}): ProjectOverlapRefusal | null {
  const real = o.realpath ?? realpathNearestSync;
  const project = real(path.resolve(o.projectDir));
  for (const r of o.roots) {
    if (typeof r.path !== "string" || r.path === "") {
      continue;
    }
    const prot = real(path.resolve(r.path));
    const contains = isInside(project, prot);
    const inside = isInside(prot, project);
    if (!contains && !inside) {
      continue;
    }
    const code =
      contains && inside
        ? "project-is-protected"
        : contains
          ? "project-contains-protected"
          : "project-inside-protected";
    const relation =
      code === "project-is-protected"
        ? `is ${r.label}`
        : code === "project-contains-protected"
          ? `contains ${r.label} (${prot})`
          : `is inside ${r.label} (${prot})`;
    return {
      code,
      label: r.label,
      project,
      protectedPath: prot,
      message: `the project directory ${project} ${relation}; run it in a project directory`,
    };
  }
  return null;
}

// ─── Transcript-disabling flags (R4) ────────────────────────────────────

export type TranscriptFlagRefusal = Readonly<{
  code: "transcript-disabled";
  flag: string;
  message: string;
}>;

/**
 * The first host option in `args` that turns the on-disk transcript off, or
 * null. `flags` are the host's flag names (adapter data); `--flag=value` counts
 * too. Arguments after `--` are the prompt, not options.
 */
export function transcriptDisablingFlag(
  args: readonly string[],
  flags: readonly string[],
): string | null {
  const end = args.indexOf("--");
  for (const a of end < 0 ? args : args.slice(0, end)) {
    if (typeof a !== "string") {
      continue;
    }
    const name = a.startsWith("--") && a.includes("=") ? a.slice(0, a.indexOf("=")) : a;
    if (flags.includes(name)) {
      return a;
    }
  }
  return null;
}

/** The launch decision for R4: null, or the refusal (with `host` naming the plain command to run instead). */
export function decideTranscriptFlags(
  args: readonly string[],
  flags: readonly string[],
  host: string,
): TranscriptFlagRefusal | null {
  const flag = transcriptDisablingFlag(args, flags);
  if (flag === null) {
    return null;
  }
  return {
    code: "transcript-disabled",
    flag,
    message: `${flag} stops ${host} from writing the transcript Enclawed watches to detect a tool call that ran without Enclawed's hook; run plain \`${host} ${flag}\` if you mean to work without it`,
  };
}

/** A host flag that turns its settings hooks off (R1): the launch is refused. */
export type HookFlagRefusal = Readonly<{ code: "hooks-disabled"; flag: string; message: string }>;

/**
 * The launch decision for R1: a flag among the host's options (before `--`)
 * that turns off the settings hooks would switch Enclawed off for the whole
 * session, so the launch is refused. `flags` is the host's list (data).
 */
export function decideHookFlags(
  args: readonly string[],
  flags: readonly string[],
  host: string,
): HookFlagRefusal | null {
  const flag = transcriptDisablingFlag(args, flags);
  if (flag === null) {
    return null;
  }
  return {
    code: "hooks-disabled",
    flag,
    message: `${flag} turns off settings hooks, which would switch Enclawed off; run plain \`${host} ${flag}\` if you mean to work without it`,
  };
}

// ─── Handshake timing ───────────────────────────────────────────────────

/** How long the hooks have to report in (the session-start handshake). An internal constant, never a setting. */
export const HANDSHAKE_TIMEOUT_S = 30;

export type HandshakeTimeoutAction =
  | Readonly<{ action: "stop-host"; code: "no-handshake-headless"; reason: string }>
  | Readonly<{ action: "warn"; code: "no-handshake-interactive"; reason: string }>;

/**
 * What to do when the deadline passes without a handshake. Headless (no
 * person watching): stop the host. Interactive: warn; every call waits for
 * the hooks and is refused without them, and a call that runs anyway stops
 * the session (transcript watch).
 */
export function handshakeTimeoutAction(o: {
  headless: boolean;
  refused?: string | null;
}): HandshakeTimeoutAction {
  const refused = o.refused ? ` (refused: ${o.refused})` : "";
  return o.headless
    ? {
        action: "stop-host",
        code: "no-handshake-headless",
        reason: `Enclawed's hooks did not start within ${HANDSHAKE_TIMEOUT_S} s (no verified session-start handshake${refused}); stopping the host`,
      }
    : {
        action: "warn",
        code: "no-handshake-interactive",
        reason: `Enclawed's hooks have not started after ${HANDSHAKE_TIMEOUT_S} s${refused}; every tool call waits for them and is refused without them, and a call that runs anyway stops the session`,
      };
}

export type NoHandshakeVerdict = Readonly<{
  code: "no-handshake";
  /** true: the session fails (the adapter's no-handshake exit); false: the host's own failure stands. */
  failSession: boolean;
  reason: string;
}>;

/**
 * The end-of-session verdict. null: a handshake was expected and done, or none
 * was expected (no session channel). Otherwise the session fails when the
 * launcher stopped the host for the timeout or the host exited 0 (it worked
 * unchecked); a host that failed by itself keeps its own exit, still recorded.
 */
export function noHandshakeVerdict(o: {
  expected: boolean;
  done: boolean;
  stoppedForTimeout: boolean;
  hostExitCode: number | null;
}): NoHandshakeVerdict | null {
  if (!o.expected || o.done) {
    return null;
  }
  return {
    code: "no-handshake",
    failSession: o.stoppedForTimeout || o.hostExitCode === 0,
    reason:
      "Enclawed's hooks never reported in this session; treat anything it did as unchecked (reconcile the audit log)",
  };
}
