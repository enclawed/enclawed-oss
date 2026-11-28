// enclawed adapter kit: a host's administrator-managed login policy, under
// which the host product cannot sign in or use a login stored on the machine,
// while the adapter's own sessions still reach the provider through the kit's
// auth relay (auth-relay.ts).
//
// A host that keeps its login as a plaintext file in the user's home leaves
// that file readable, and usable by the host itself, between the moment the
// person signs in and the moment the adapter seals it. On a machine whose
// administrator manages the host's settings (a root-owned policy the user
// cannot override), the adapter closes that gap with three pins the host
// itself enforces:
//
//   - an organization pin that admits no organization: the host refuses every
//     sign-in and every session with a login of its own (stored, typed in the
//     environment, or an API key), while a session that reaches the provider
//     through a relay socket is not judged by it;
//   - the directory the host keeps its login in, pinned (in the managed
//     environment block, whose values replace the user's) to an empty
//     directory only an administrator can write: the host neither reads a
//     login from the user's home nor writes one there;
//   - any further environment pins the adapter names (for example the host's
//     switch that hides its login command).
//
// What the pins are called, their values and the files are the host's (the
// adapter passes them as data, read from the host's own code). This module
// decides whether the documents the host reads put them in force, builds the
// document an administrator installs, and plans the install idempotently.
//
// Decision rules (conservative, independent of how the host merges documents
// with each other): installed only when every managed document parses; some
// document sets the organization pin to an empty list and NO document sets it
// to anything else; for every environment pin some document sets it to the
// required value and NO document sets it to another value; the policy file
// itself passes the administrator-file check; and the pinned directory is a
// real directory (not a link), owned by an administrator uid, writable by no
// group or other user, empty, with every ancestor an administrator-owned real
// directory writable by no group or other user.

import fs from "node:fs";
import path from "node:path";
import type { AdminFileCheck } from "./admin-grants.js";
import type { ManagedDoc } from "./managed-hooks.js";

export type ManagedLoginPolicySpec = Readonly<{
  /** The host's organization pin key (a list; empty admits no organization). */
  orgPinKey: string;
  /** The managed environment block's key (its values replace the user's). */
  envKey: string;
  /** The variable naming the directory the host keeps its login in. */
  storageDirVar: string;
  /** The administrator-only empty directory that variable is pinned to. */
  storageDir: string;
  /** Further environment pins: name -> required value. */
  envPins?: Readonly<Record<string, string>>;
}>;

export type ManagedLoginPolicyCode =
  | "installed"
  | "no-managed-settings"
  | "invalid-document"
  | "org-pin-missing"
  | "org-pin-widened"
  | "env-pin-missing"
  | "env-pin-overridden"
  | "policy-file-untrusted"
  | "storage-dir-unsafe";

export type ManagedLoginPolicyStatus = Readonly<{
  installed: boolean;
  code: ManagedLoginPolicyCode;
  reason: string;
  /** The managed documents read, in order. */
  files: readonly string[];
  /** The file at fault, when one is. */
  file?: string;
}>;

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** The document an administrator installs: exactly the pins, nothing else. */
export function managedLoginPolicyDocument(spec: ManagedLoginPolicySpec): Record<string, unknown> {
  const env: Record<string, string> = { [spec.storageDirVar]: spec.storageDir };
  for (const [k, v] of Object.entries(spec.envPins ?? {}).toSorted(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    env[k] = v;
  }
  return { [spec.orgPinKey]: [], [spec.envKey]: env };
}

/** The bytes written for the document (stable: the same spec gives the same bytes). */
export function managedLoginPolicyText(spec: ManagedLoginPolicySpec): string {
  return `${JSON.stringify(managedLoginPolicyDocument(spec), null, 2)}\n`;
}

/** Owner and mode rules for the pinned directory and each ancestor. */
export function adminOnlyEmptyDirProblem(
  dir: string,
  trustedUids: readonly number[] = [0],
): string | null {
  const abs = path.resolve(dir);
  let st: fs.Stats;
  try {
    st = fs.lstatSync(abs);
  } catch (err) {
    return `${abs}: ${(err as NodeJS.ErrnoException).code ?? "unreadable"}`;
  }
  if (st.isSymbolicLink()) {
    return `${abs} is a symlink`;
  }
  if (!st.isDirectory()) {
    return `${abs} is not a directory`;
  }
  if (!trustedUids.includes(st.uid)) {
    return `${abs} is owned by uid ${st.uid}, not an administrator`;
  }
  if ((st.mode & 0o022) !== 0) {
    return `${abs} is writable by group or other users (mode ${(st.mode & 0o7777).toString(8)})`;
  }
  let entries: string[];
  try {
    entries = fs.readdirSync(abs);
  } catch (err) {
    return `${abs}: ${(err as NodeJS.ErrnoException).code ?? "unreadable"}`;
  }
  if (entries.length > 0) {
    return `${abs} is not empty (${entries.toSorted().slice(0, 3).join(", ")})`;
  }
  for (let d = path.dirname(abs); ; d = path.dirname(d)) {
    let ds: fs.Stats;
    try {
      ds = fs.lstatSync(d);
    } catch (err) {
      return `${d}: ${(err as NodeJS.ErrnoException).code ?? "unreadable"}`;
    }
    if (ds.isSymbolicLink() || !ds.isDirectory()) {
      return `${d} is not a real directory`;
    }
    if (!trustedUids.includes(ds.uid) && ds.uid !== 0) {
      return `${d} is owned by uid ${ds.uid}, not an administrator`;
    }
    if ((ds.mode & 0o022) !== 0 && (ds.mode & 0o1000) === 0) {
      return `${d} is writable by group or other users`;
    }
    if (d === path.dirname(d)) {
      return null;
    }
  }
}

/**
 * Are the pins in force in the documents the host reads? `policyFile`: the
 * file the adapter installs (checked with `fileCheck`, the administrator-file
 * rule); `dirProblem`: the pinned directory's check (default
 * adminOnlyEmptyDirProblem with uid 0; a test passes its stand-in for root).
 */
export function managedLoginPolicyStatus(
  docs: readonly ManagedDoc[],
  spec: ManagedLoginPolicySpec,
  o: Readonly<{
    policyFile: string;
    fileCheck: AdminFileCheck;
    dirProblem?: (dir: string) => string | null;
  }>,
): ManagedLoginPolicyStatus {
  const files = docs.map((d) => d.file);
  const no = (
    code: ManagedLoginPolicyCode,
    reason: string,
    file?: string,
  ): ManagedLoginPolicyStatus => ({
    installed: false,
    code,
    reason,
    files,
    ...(file ? { file } : {}),
  });
  if (docs.length === 0) {
    return no("no-managed-settings", "no managed settings document");
  }
  const bad = docs.find((d) => d.invalid || !isObj(d.doc));
  if (bad) {
    return no("invalid-document", `${bad.file} is not a JSON object`, bad.file);
  }
  // The organization pin: an empty list somewhere, and nothing that admits an organization anywhere.
  let emptyPin: string | null = null;
  for (const d of docs) {
    const doc = d.doc as Record<string, unknown>;
    if (!(spec.orgPinKey in doc)) {
      continue;
    }
    const v = doc[spec.orgPinKey];
    if (Array.isArray(v) && v.length === 0) {
      emptyPin ??= d.file;
      continue;
    }
    return no(
      "org-pin-widened",
      `${d.file} sets ${spec.orgPinKey} to ${JSON.stringify(v)}, which admits sign-ins`,
      d.file,
    );
  }
  if (!emptyPin) {
    return no("org-pin-missing", `no managed document sets ${spec.orgPinKey} to []`);
  }
  // Every environment pin: the required value somewhere, and no other value anywhere.
  const pins: Record<string, string> = { [spec.storageDirVar]: spec.storageDir, ...spec.envPins };
  for (const [name, want] of Object.entries(pins).toSorted(([a], [b]) => (a < b ? -1 : 1))) {
    let found = false;
    for (const d of docs) {
      const env = (d.doc as Record<string, unknown>)[spec.envKey];
      if (env === undefined) {
        continue;
      }
      if (!isObj(env)) {
        return no("invalid-document", `${d.file}: ${spec.envKey} is not an object`, d.file);
      }
      if (!(name in env)) {
        continue;
      }
      if (env[name] !== want) {
        return no(
          "env-pin-overridden",
          `${d.file} sets ${spec.envKey}.${name} to ${JSON.stringify(env[name])}, not ${JSON.stringify(want)}`,
          d.file,
        );
      }
      found = true;
    }
    if (!found) {
      return no(
        "env-pin-missing",
        `no managed document sets ${spec.envKey}.${name} to ${JSON.stringify(want)}`,
      );
    }
  }
  if (!files.includes(o.policyFile)) {
    return no(
      "policy-file-untrusted",
      `${o.policyFile} is not among the documents the host reads`,
      o.policyFile,
    );
  }
  const fc = o.fileCheck(o.policyFile);
  if (!fc.ok) {
    return no("policy-file-untrusted", `${o.policyFile}: ${fc.reason}`, o.policyFile);
  }
  const dp = (o.dirProblem ?? ((d: string) => adminOnlyEmptyDirProblem(d)))(spec.storageDir);
  if (dp) {
    return no("storage-dir-unsafe", dp);
  }
  return {
    installed: true,
    code: "installed",
    reason: `${spec.orgPinKey} admits no organization and the host's login directory is pinned to ${spec.storageDir}`,
    files,
  };
}

export type ManagedLoginPolicyPlan = Readonly<{
  /** What install does: "none" when the file and directory are already exactly right. */
  file: "write" | "none";
  dir: "create" | "none";
  text: string;
}>;

/** Install, planned: write only what differs (idempotent). */
export function planManagedLoginPolicy(
  spec: ManagedLoginPolicySpec,
  o: Readonly<{ policyFile: string }>,
): ManagedLoginPolicyPlan {
  const text = managedLoginPolicyText(spec);
  let current: string | null = null;
  try {
    current = fs.readFileSync(o.policyFile, "utf8");
  } catch {
    current = null;
  }
  return {
    file: current === text ? "none" : "write",
    dir: fs.existsSync(spec.storageDir) ? "none" : "create",
    text,
  };
}
