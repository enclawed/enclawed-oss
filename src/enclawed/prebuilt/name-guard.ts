// The prebuilt containment name guard (prebuilt/name-guard/linux-<arch>/name-guard,
// static, built by scripts/build-name-guard.mjs), verified against the SHA-256
// recorded at build time in ./name-guard.generated.ts, which the build bundles
// into the JS: a digest file next to the binary could be replaced with it.
//
// The containment (../containment/name-guard.ts) takes the guard from
// prebuiltNameGuard first and compiles from source only as a fallback; before
// every exec it calls nameGuardUnchanged, so what runs is what was verified.

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NAME_GUARD_PREBUILT } from "./name-guard.generated.js";

export type PrebuiltGuard =
  | Readonly<{ ok: true; binary: string; sha256: string }>
  | Readonly<{ ok: false; reason: string }>;

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Where the prebuilt guard for an arch may be, relative to this module (source tree, bundle, package). */
export function prebuiltCandidates(arch: string = process.arch): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const rel = path.join("prebuilt", "name-guard", `linux-${arch}`, "name-guard");
  return [0, 1, 2, 3, 4].map((up) => path.join(here, "../".repeat(up), rel));
}

/** The digest recorded at build time for an arch, or null when none was built. */
export function recordedGuardDigest(arch: string = process.arch): string | null {
  return (
    (NAME_GUARD_PREBUILT.binaries as Readonly<Record<string, string | null>>)[`linux-${arch}`] ??
    null
  );
}

/**
 * The prebuilt guard, checked byte for byte against the recorded digest and
 * written as a fresh read-only copy in `stateDir/bin`: the copy holds exactly
 * the verified bytes and is the file to execute. A binary that does not match
 * is never used (the caller may still build from source).
 */
export function prebuiltNameGuard(
  stateDir: string,
  o: Readonly<{ arch?: string; candidates?: readonly string[] }> = {},
): PrebuiltGuard {
  const arch = o.arch ?? process.arch;
  if (process.platform !== "linux" && !o.candidates) {
    return { ok: false, reason: `no prebuilt name guard for ${process.platform}` };
  }
  const want = recordedGuardDigest(arch);
  if (!want) {
    return { ok: false, reason: `no prebuilt name guard for linux-${arch}` };
  }
  for (const file of o.candidates ?? prebuiltCandidates(arch)) {
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(file);
    } catch {
      continue;
    }
    if (sha256(bytes) !== want) {
      return {
        ok: false,
        reason: `the prebuilt name guard ${file} does not match the digest recorded at build time`,
      };
    }
    const dir = path.join(stateDir, "bin");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const out = path.join(
      dir,
      `name-guard-${want.slice(0, 16)}-${process.pid}-${randomBytes(4).toString("hex")}`,
    );
    fs.writeFileSync(out, bytes, { mode: 0o500, flag: "wx" });
    fs.chmodSync(out, 0o555);
    return { ok: true, binary: out, sha256: want };
  }
  return {
    ok: false,
    reason: `the prebuilt name guard for linux-${arch} is missing from this install`,
  };
}

/** Before every exec: does the guard file still hold the verified bytes? null when it does, else why not. */
export function nameGuardUnchanged(binary: string, digest: string): string | null {
  try {
    return sha256(fs.readFileSync(binary)) === digest
      ? null
      : `the name guard ${binary} changed after it was verified`;
  } catch (err) {
    return `the name guard ${binary} cannot be read (${(err as Error).message})`;
  }
}
