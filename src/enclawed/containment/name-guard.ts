// The name guard (./name-guard.c), host side: build it, describe the policy
// it enforces, and read the journal of inodes the contained process wrote.
//
// Why a seccomp user-notification supervisor: the names to refuse
// (sub/.envrc, packages/x/.mcp.json, a/.vscode/tasks.json, ...) may appear
// in any directory, including directories created during the run, so no
// mount can pre-empt them; Landlock rules are per file hierarchy, not per
// name; LD_PRELOAD is bypassed by any static binary or direct system call;
// fanotify permission events need CAP_SYS_ADMIN in the initial namespace.
// A seccomp filter cannot read a path itself, but it can hand the call to a
// supervisor, and a supervisor that PERFORMS the call on its own copy of the
// path (never continuing the caller's) has no time-of-check/time-of-use
// gap. Where the kernel lacks it (user notification with killable waits and
// atomic descriptor injection: Linux 5.19), or no C compiler is available
// to build the guard, containment is refused: nothing runs unguarded.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NAME_GUARD_PREBUILT } from "../prebuilt/name-guard.generated.js";
import { prebuiltNameGuard } from "../prebuilt/name-guard.js";
import { EXEC_CONFIG_DIRS, EXEC_CONFIG_FILES, EXEC_CONFIG_PAIRS } from "./plan.js";

/** Dependency trees nobody reads as configuration: names inside them are not refused. */
export const NAME_GUARD_EXEMPT = ["node_modules", ".venv", "venv", "__pypackages__"];

export type NameGuardAvailability =
  | Readonly<{ ok: true; binary: string; sha256: string }>
  | Readonly<{ ok: false; reason: string }>;

let built: NameGuardAvailability | null = null;
// Every guard this process made ready, with the digest it must still have at each exec.
const digests = new Map<string, string>();

/** The digest a guard binary had when this process made it ready (null: not one of ours). */
export function nameGuardDigest(binary: string): string | null {
  return digests.get(binary) ?? null;
}

function kernelSupports(): boolean {
  const m = /^(\d+)\.(\d+)/.exec(os.release());
  if (!m) {
    return false;
  }
  const [major, minor] = [Number(m[1]), Number(m[2])];
  return major > 5 || (major === 5 && minor >= 19);
}

function sourcePath(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const p of [
    path.join(here, "name-guard.c"),
    path.join(here, "enclawed", "containment", "name-guard.c"),
    path.join(here, "..", "src", "enclawed", "containment", "name-guard.c"),
  ]) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * The guard binary: the prebuilt static one (../prebuilt/name-guard.ts,
 * checked against the digest recorded at build time) when it was built from
 * this very source; else built once per process from the shipped source
 * into Enclawed's state directory (a fresh name each time, so nothing
 * another process left there is ever run). Before every exec the caller
 * checks the file still has the digest returned here (nameGuardUnchanged).
 */
export function ensureNameGuard(stateDir: string): NameGuardAvailability {
  if (built?.ok && fs.existsSync(built.binary)) {
    return built;
  }
  if (process.platform !== "linux" || !["x64", "arm64"].includes(process.arch)) {
    return {
      ok: false,
      reason: `the name guard needs Linux on x64 or arm64 (${process.platform}/${process.arch})`,
    };
  }
  if (!kernelSupports()) {
    return {
      ok: false,
      reason: `the name guard needs seccomp user notification with killable waits (Linux 5.19); this kernel is ${os.release()}`,
    };
  }
  const src = sourcePath();
  const sourceDigest = src ? createHash("sha256").update(fs.readFileSync(src)).digest("hex") : null;
  if (sourceDigest === null || sourceDigest === NAME_GUARD_PREBUILT.sourceSha256) {
    const pre = prebuiltNameGuard(stateDir);
    if (pre.ok) {
      digests.set(pre.binary, pre.sha256);
      built = { ok: true, binary: pre.binary, sha256: pre.sha256 };
      return built;
    }
  }
  if (!src) {
    return { ok: false, reason: "the name guard source is missing from this install" };
  }
  const cc = ["/usr/bin/cc", "/usr/bin/gcc", "/usr/bin/clang"].find((p) => fs.existsSync(p));
  if (!cc) {
    return { ok: false, reason: "building the name guard needs a C compiler (cc, gcc or clang)" };
  }
  const digest = createHash("sha256").update(fs.readFileSync(src)).digest("hex").slice(0, 16);
  const dir = path.join(stateDir, "bin");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const out = path.join(
    dir,
    `name-guard-${digest}-${process.pid}-${randomBytes(4).toString("hex")}`,
  );
  try {
    execFileSync(cc, ["-O2", "-Wall", "-o", out, src], {
      stdio: ["ignore", "ignore", "pipe"],
      env: { PATH: "/usr/bin:/bin", LC_ALL: "C" },
      timeout: 60_000,
    });
    fs.chmodSync(out, 0o555);
  } catch (err) {
    const e = err as { stderr?: Buffer };
    return {
      ok: false,
      reason: `the name guard did not build: ${(e.stderr?.toString() ?? String(err)).slice(0, 300)}`,
    };
  }
  const sha256 = createHash("sha256").update(fs.readFileSync(out)).digest("hex");
  digests.set(out, sha256);
  built = { ok: true, binary: out, sha256 };
  return built;
}

/** The supervisor's policy file: read-write roots, operator exceptions and the names refused. */
export function nameGuardConfig(
  rwRoots: readonly string[],
  writable: readonly string[],
  gitExes: readonly string[] = [],
  approvals: string | null = null,
): string {
  return [
    ...(approvals ? [`approvals ${approvals}`] : []),
    ...gitExes.map((g) => `gitexe ${g}`),
    ...rwRoots.map((r) => `root ${r}`),
    ...writable.map((w) => `allow ${w}`),
    ...EXEC_CONFIG_DIRS.map((d) => `dir ${d}`),
    ...EXEC_CONFIG_FILES.map((f) => `file ${f}`),
    ...EXEC_CONFIG_PAIRS.map(([a, b]) => `pair ${a} ${b}`),
    ...NAME_GUARD_EXEMPT.map((x) => `exempt ${x}`),
    "",
  ].join("\n");
}

/** Identity of an inode as the journal records it. */
export function inodeKey(st: fs.BigIntStats): string {
  return `${st.dev}:${st.ino}:${st.birthtimeNs}`;
}

/**
 * Every inode the contained process created or opened for writing, from the
 * journal (written by the supervisor before each call returns, so after the
 * sandbox is frozen it is complete).
 */
export function readJournal(file: string): Set<string> {
  const out = new Set<string>();
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const line of text.split("\n")) {
    if (/^[GCAV] /.test(line)) {
      continue; // an exception the guard made (./repo-config.ts)
    }
    const [dev, ino, sec, nsec] = line.split(" ");
    if (dev && ino && sec !== undefined && nsec !== undefined) {
      out.add(`${dev}:${ino}:${BigInt(sec) * 1_000_000_000n + BigInt(nsec)}`);
    }
  }
  return out;
}
