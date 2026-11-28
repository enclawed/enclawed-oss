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
// The file is writable by the uid that runs enclawed, so under the
// compromised-host premise it is attacker-controlled:
//   - **enclaved** flavor: the file is ignored entirely (and its presence is
//     reported). Extra signers come only from the admin policy
//     (`trustRoot.signers` in the root-owned /etc/enclawed/policy.json or an
//     org-signed policy; see ./admin-policy.ts), and they may only ADD keyIds.
//   - **open** flavor: the file may add signers, but never replace a shipped
//     signer (DEFAULT_TRUST_ROOT keyId); such entries are refused. When an
//     admin policy is present, the file is ignored in this flavor too.
// In every flavor a shipped keyId is never replaced.

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveWorkspaceDirInfo } from "../infra/workspace-dir.js";
import {
  DEFAULT_TRUST_ROOT,
  type TrustedSigner,
  getTrustRoot,
  isTrustRootLocked,
  setTrustRoot,
} from "./trust-root.js";

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
  if (!x || typeof x !== "object" || Array.isArray(x)) {
    return false;
  }
  const o = x as Record<string, unknown>;
  if (o.v !== 1) {
    return false;
  }
  if (!Array.isArray(o.signers)) {
    return false;
  }
  for (const s of o.signers) {
    if (!s || typeof s !== "object") {
      return false;
    }
    const obj = s as Record<string, unknown>;
    if (typeof obj.keyId !== "string" || obj.keyId.length === 0) {
      return false;
    }
    if (typeof obj.publicKeyPem !== "string" || !obj.publicKeyPem.includes("BEGIN PUBLIC KEY")) {
      return false;
    }
    if (!Array.isArray(obj.approvedClearance)) {
      return false;
    }
    for (const c of obj.approvedClearance) {
      if (typeof c !== "string") {
        return false;
      }
      if (!VALID_CLEARANCES.has(c)) {
        return false;
      }
    }
    if (obj.description !== undefined && typeof obj.description !== "string") {
      return false;
    }
    if (obj.notAfter !== undefined && typeof obj.notAfter !== "string") {
      return false;
    }
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
      { cause: err },
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

export function persistedSignersToRuntime(doc: PersistedTrustRoot): TrustedSigner[] {
  return doc.signers.map((s) =>
    Object.freeze({
      keyId: s.keyId,
      publicKeyPem: s.publicKeyPem,
      approvedClearance: Object.freeze(s.approvedClearance.map((c) => c)),
      description: s.description ?? "Persisted runtime signer.",
      ...(s.notAfter ? { notAfter: s.notAfter } : {}),
    }),
  );
}

export type TrustOverlayResult = Readonly<{
  applied: number;
  /** Signers or files refused, one human-readable line each. */
  refused: ReadonlyArray<string>;
  reason?: string;
}>;

export type ApplyOverlayOptions = LoadOptions & {
  /** Flavor being booted. Default "enclaved" (fail closed). */
  flavor?: "open" | "enclaved";
  /** Signers from the admin policy (root-owned or org-signed); null when there is none. */
  adminSigners?: ReadonlyArray<unknown> | null;
};

const SHIPPED_KEY_IDS: ReadonlySet<string> = new Set(DEFAULT_TRUST_ROOT.map((s) => s.keyId));

/**
 * Build the boot trust root: the live root plus admin-policy signers,
 * plus (open flavor without an admin policy only) the persisted user overlay.
 * Additions only: a keyId that is already present is never replaced. Skipped
 * if the trust root has already been locked (idempotent in tests).
 */
export async function applyPersistedTrustOverlay(
  options: ApplyOverlayOptions = {},
): Promise<TrustOverlayResult> {
  if (isTrustRootLocked()) {
    return { applied: 0, refused: [], reason: "trust root locked" };
  }
  const flavor = options.flavor ?? "enclaved";
  const refused: string[] = [];
  // Start from the live root: DEFAULT_TRUST_ROOT, or the signers an embedding
  // app installed programmatically with setTrustRoot() before bootstrap.
  const base = getTrustRoot();
  const signers: TrustedSigner[] = [...base];
  const present = new Set([...SHIPPED_KEY_IDS, ...base.map((s) => s.keyId)]);
  const addAll = (list: TrustedSigner[], from: string) => {
    for (const s of list) {
      if (present.has(s.keyId)) {
        refused.push(`${from}: signer "${s.keyId}" would replace an existing signer`);
        continue;
      }
      present.add(s.keyId);
      signers.push(s);
    }
  };

  if (options.adminSigners && options.adminSigners.length > 0) {
    const doc = { v: 1, signers: options.adminSigners };
    if (!isPersistedShape(doc)) {
      throw new Error("admin policy trustRoot.signers does not match the expected schema");
    }
    addAll(persistedSignersToRuntime(doc), "admin policy");
  }

  const userMayAdd = flavor === "open" && !options.adminSigners;
  let doc: PersistedTrustRoot | undefined;
  try {
    doc = await readPersistedTrustRoot(options);
  } catch (err) {
    if (userMayAdd) {
      throw err;
    }
    refused.push(`user trust-root overlay ignored (${(err as Error).message})`);
  }
  if (doc) {
    if (userMayAdd) {
      addAll(persistedSignersToRuntime(doc), "user trust-root overlay");
    } else {
      refused.push(
        `user trust-root overlay ignored (${doc.signers.length} signer(s): ` +
          `${doc.signers.map((s) => s.keyId).join(", ")}); ` +
          (flavor === "enclaved"
            ? "the enclaved flavor accepts signers only from the admin policy"
            : "an admin policy is present"),
      );
    }
  }
  if (signers.length > base.length) {
    setTrustRoot(signers);
  }
  return { applied: signers.length - base.length, refused };
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
  options: LoadOptions & { flavor?: "open" | "enclaved" } = {},
): Promise<{ path: string; replaced: boolean }> {
  if ((options.flavor ?? "enclaved") === "enclaved") {
    throw new Error(
      "the enclaved flavor does not accept signers from the user trust-root overlay; " +
        `add the signer to trustRoot.signers in the root-owned /etc/enclawed/policy.json ` +
        "(or an org-signed admin policy) instead",
    );
  }
  if (SHIPPED_KEY_IDS.has(signer.keyId)) {
    throw new Error(`signer "${signer.keyId}" is a shipped signer and cannot be replaced`);
  }
  if (!signer.keyId || typeof signer.keyId !== "string") {
    throw new TypeError("addPersistedSigner: keyId is required");
  }
  if (!signer.publicKeyPem || !signer.publicKeyPem.includes("BEGIN PUBLIC KEY")) {
    throw new TypeError("addPersistedSigner: publicKeyPem must be a PEM-encoded SPKI block");
  }
  if (!Array.isArray(signer.approvedClearance) || signer.approvedClearance.length === 0) {
    throw new TypeError("addPersistedSigner: approvedClearance must be a non-empty array");
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
    // weren't in the original default (e.g. test seeds). Shipped signers are
    // never replaced.
    const live = getTrustRoot().filter(
      (s) => !persistedIds.has(s.keyId) && !SHIPPED_KEY_IDS.has(s.keyId),
    );
    setTrustRoot([
      ...DEFAULT_TRUST_ROOT,
      ...live,
      ...persisted.filter((s) => !SHIPPED_KEY_IDS.has(s.keyId)),
    ]);
  }
  return { path, replaced };
}
