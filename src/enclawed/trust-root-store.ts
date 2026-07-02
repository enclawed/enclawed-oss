// Persistent trust-root overlay.
//
// Pillar 4 in the tutorial-honesty initiative: in the open flavor we let the
// operator add signers from the CLI (`enclawed trust add ...`) and have
// those persist across process restarts. The file lives at
// `<state-dir>/trust-root.json` (typically `~/.enclawed/trust-root.json`) and
// is read by bootstrap BEFORE `lockTrustRoot()` runs.
//
// File schema (forward-compatible — unknown keys ignored):
//
//   {
//     "v": 1,
//     "signers": [
//       {
//         "keyId": "ops-2026",
//         "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n",
//         "approvedClearance": ["public", "internal"],
//         "description": "Ops team — laptop-stored key, rotate before 2027.",
//         "notAfter": "2027-01-01T00:00:00Z"
//       }
//     ]
//   }
//
// SECURITY POSTURE
// ----------------
// In the **enclaved** flavor this file is still read, but the trust root is
// locked immediately after bootstrap, so a process started with a tampered
// overlay would fail-closed at the deploying-org `setTrustRoot(...)` shim
// (or, if no shim is installed, lock against the overlay itself). In
// **open** flavor the file is intentionally writable from the CLI — the
// operator is expected to protect the directory with filesystem permissions.

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  DEFAULT_TRUST_ROOT,
  type TrustedSigner,
  getTrustRoot,
  isTrustRootLocked,
  setTrustRoot,
} from "./trust-root.js";
import type { ClearanceLevel } from "./module-manifest.js";
import { resolveWorkspaceDirInfo } from "../infra/workspace-dir.js";

export const PERSISTED_TRUST_ROOT_FILENAME = "trust-root.json";

const VALID_CLEARANCES: ReadonlySet<string> = new Set([
  "public",
  "internal",
  "confidential",
  "restricted",
  "restricted-plus",
  // US-government aliases recognized by the manifest layer.
  "unclassified",
  "cui",
  "secret",
  "top-secret",
  "top-secret-sci",
  // Q-/L-clearance shorthands used by some deploying orgs.
  "q-cleared",
  "l-cleared",
]);

export type PersistedSignerInput = {
  keyId: string;
  publicKeyPem: string;
  approvedClearance: string[];
  description?: string;
  notAfter?: string;
};

export type PersistedTrustRoot = {
  v: 1;
  signers: PersistedSignerInput[];
};

function isPersistedShape(x: unknown): x is PersistedTrustRoot {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  if (o.v !== 1) return false;
  if (!Array.isArray(o.signers)) return false;
  for (const s of o.signers) {
    if (!s || typeof s !== "object") return false;
    const obj = s as Record<string, unknown>;
    if (typeof obj.keyId !== "string" || obj.keyId.length === 0) return false;
    if (typeof obj.publicKeyPem !== "string" || !obj.publicKeyPem.includes("BEGIN PUBLIC KEY")) {
      return false;
    }
    if (!Array.isArray(obj.approvedClearance)) return false;
    for (const c of obj.approvedClearance) {
      if (typeof c !== "string") return false;
      if (!VALID_CLEARANCES.has(c)) return false;
    }
    if (obj.description !== undefined && typeof obj.description !== "string") return false;
    if (obj.notAfter !== undefined && typeof obj.notAfter !== "string") return false;
  }
  return true;
}

function resolveStorePath(env: NodeJS.ProcessEnv): string {
  const ws = resolveWorkspaceDirInfo({ env });
  return join(ws.path, PERSISTED_TRUST_ROOT_FILENAME);
}

export type LoadOptions = {
  env?: NodeJS.ProcessEnv;
  /** Test seam — overrides the auto-resolved path. */
  filePath?: string;
};

export async function readPersistedTrustRoot(
  options: LoadOptions = {},
): Promise<PersistedTrustRoot | undefined> {
  const path = options.filePath ?? resolveStorePath(options.env ?? process.env);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `trust-root file at ${path} is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (!isPersistedShape(parsed)) {
    throw new Error(`trust-root file at ${path} does not match the expected schema`);
  }
  return parsed;
}

export async function writePersistedTrustRoot(
  doc: PersistedTrustRoot,
  options: LoadOptions = {},
): Promise<string> {
  const path = options.filePath ?? resolveStorePath(options.env ?? process.env);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, path);
  return path;
}

export function persistedSignersToRuntime(
  doc: PersistedTrustRoot,
): TrustedSigner[] {
  return doc.signers.map((s) =>
    Object.freeze({
      keyId: s.keyId,
      publicKeyPem: s.publicKeyPem,
      approvedClearance: Object.freeze(
        s.approvedClearance.map((c) => c as ClearanceLevel),
      ) as ReadonlyArray<ClearanceLevel>,
      description: s.description ?? "Persisted runtime signer.",
      ...(s.notAfter ? { notAfter: s.notAfter } : {}),
    }),
  );
}

/**
 * Layer persisted signers on top of `DEFAULT_TRUST_ROOT` and apply the result
 * via `setTrustRoot(...)`. Skipped if the trust root has already been locked
 * (idempotent in tests). Conflicts: persisted entries with a keyId that
 * already exists in the default root REPLACE the default entry — the
 * operator is explicitly asserting the new clearance set.
 */
export async function applyPersistedTrustOverlay(
  options: LoadOptions = {},
): Promise<{ applied: number } | { applied: 0; reason: string }> {
  if (isTrustRootLocked()) {
    return { applied: 0, reason: "trust root locked" };
  }
  const doc = await readPersistedTrustRoot(options);
  if (!doc) return { applied: 0, reason: "no persisted file" };

  const persisted = persistedSignersToRuntime(doc);
  const persistedIds = new Set(persisted.map((s) => s.keyId));
  const base = DEFAULT_TRUST_ROOT.filter((s) => !persistedIds.has(s.keyId));
  setTrustRoot([...base, ...persisted]);
  return { applied: persisted.length };
}

/**
 * Add (or replace) a single signer in the persisted overlay file. Returns
 * the file path written. Does NOT call `setTrustRoot` — bootstrap will pick
 * the overlay up on next process start. In the open flavor (where the trust
 * root is not locked) we ALSO apply it to the running process so the new
 * signer is visible to any code that re-reads the trust root.
 */
export async function addPersistedSigner(
  signer: PersistedSignerInput,
  options: LoadOptions = {},
): Promise<{ path: string; replaced: boolean }> {
  if (!signer.keyId || typeof signer.keyId !== "string") {
    throw new TypeError("addPersistedSigner: keyId is required");
  }
  if (!signer.publicKeyPem || !signer.publicKeyPem.includes("BEGIN PUBLIC KEY")) {
    throw new TypeError(
      "addPersistedSigner: publicKeyPem must be a PEM-encoded SPKI block",
    );
  }
  if (!Array.isArray(signer.approvedClearance) || signer.approvedClearance.length === 0) {
    throw new TypeError(
      "addPersistedSigner: approvedClearance must be a non-empty array",
    );
  }
  for (const c of signer.approvedClearance) {
    if (!VALID_CLEARANCES.has(c)) {
      throw new TypeError(`addPersistedSigner: unknown clearance "${c}"`);
    }
  }

  const existing = (await readPersistedTrustRoot(options)) ?? { v: 1 as const, signers: [] };
  const prior = existing.signers.findIndex((s) => s.keyId === signer.keyId);
  const replaced = prior >= 0;
  const next: PersistedTrustRoot = {
    v: 1,
    signers: replaced
      ? existing.signers.map((s, i) => (i === prior ? signer : s))
      : [...existing.signers, signer],
  };
  const path = await writePersistedTrustRoot(next, options);

  // Apply to the running process when possible (open flavor only — enclaved
  // locks after bootstrap, so this path no-ops there). This keeps `trust list`
  // and the live verifier consistent without forcing a process restart.
  if (!isTrustRootLocked()) {
    const persisted = persistedSignersToRuntime(next);
    const persistedIds = new Set(persisted.map((s) => s.keyId));
    // Keep any other live signers that aren't in the persisted file and
    // weren't in the original default (e.g. test seeds).
    const live = getTrustRoot().filter(
      (s) =>
        !persistedIds.has(s.keyId) &&
        !DEFAULT_TRUST_ROOT.some((d) => d.keyId === s.keyId),
    );
    const base = DEFAULT_TRUST_ROOT.filter((s) => !persistedIds.has(s.keyId));
    setTrustRoot([...base, ...live, ...persisted]);
  }
  return { path, replaced };
}
