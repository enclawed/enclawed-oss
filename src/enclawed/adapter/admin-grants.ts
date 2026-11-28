// enclawed adapter kit: the administrator's grants, read only from
// root-owned files.
//
// Premise: the host is compromised at the uid that runs the agent. Anything
// that uid can set (its shell, its home directory) is an attacker-reachable
// knob, so the few decisions that loosen a default are read only from a grant
// file that uid cannot write. Each file passes the framework's admin-file check
// (checkRootOwnedFile in ../admin-policy.ts: owned by root, mode no wider than
// 0644, not a symlink, every ancestor root-owned and not writable by group or
// other, and never trusted inside a non-initial user namespace, where a bind
// mount can look root-owned).
//
//   {
//     "v": 2,
//     "projectHooks":    [{ "repo": "/abs/project", "digest": "<sha256 hex>" }],
//     "projectCommands": [{ "repo": "/abs/project", "digest": "<sha256 hex>" }],
//     "hooks":           [{ "digest": "<sha256 hex>" }],
//     "reducedContainment": true,
//     "hardwareRoot": "optional",
//     "forensicWebhook": "https://forensics.example.com/enclaweder",
//     "loaderEnv": ["LD_PRELOAD"]
//   }
//
// Every key is validated; a file with an unknown key, a wrong type or another
// version grants nothing (it is reported, and the launch goes on with the
// defaults). The adapter names where its files live (the directories and file
// names are host data); what a file may grant, and whether it is trusted, is
// decided here.
//
// Ported from codenclawed's opt-outs.mjs.

import fs from "node:fs";
import path from "node:path";
import { checkRootOwnedFile, SYSTEM_POLICY_DIR, type SecureFileCheck } from "../admin-policy.js";
import { LOADER_INJECTION_ENV, type HookGrant } from "./env-trust.js";
import { realpathNearestSync } from "./fs-probe.js";

export { SYSTEM_POLICY_DIR };

export const ADMIN_GRANT_VERSION = 2;

const GRANT_KEYS: ReadonlySet<string> = new Set([
  "v",
  "projectHooks",
  "projectCommands",
  "hooks",
  "reducedContainment",
  "hardwareRoot",
  "forensicWebhook",
  "loaderEnv",
]);

const HEX64 = /^[0-9a-f]{64}$/;

/** One repository entry granted for one repository (its real path). */
export type RepoGrant = Readonly<{ repo: string; digest: string }>;

export type AdminGrants = Readonly<{
  projectHooks: readonly RepoGrant[];
  projectCommands: readonly RepoGrant[];
  /** Hooks outside a repository (user, plugin, a settings flag), by digest. */
  hooks: readonly Readonly<{ digest: string }>[];
  /** Start a hardware-root session without the full containment nets. */
  reducedContainment: boolean;
  /** Retire a device: run software-only after a session the device accredited. */
  hardwareRoot: "optional" | null;
  /** Where the framework posts the forensic snapshot on a halt (https only). */
  forensicWebhook: string | null;
  /** Loader-injection variables that may reach the host from the user's shell. */
  loaderEnv: readonly string[];
}>;

export const NO_GRANTS: AdminGrants = Object.freeze({
  projectHooks: [],
  projectCommands: [],
  hooks: [],
  reducedContainment: false,
  hardwareRoot: null,
  forensicWebhook: null,
  loaderEnv: [],
});

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseRepoGrants(name: string, v: unknown): RepoGrant[] {
  if (!Array.isArray(v)) {
    throw new Error(`${name} must be a list of { "repo": "/abs/path", "digest": "<sha256 hex>" }`);
  }
  return v.map((g: unknown, i) => {
    if (!isObject(g) || Object.keys(g).some((k) => !["repo", "digest", "note"].includes(k))) {
      throw new Error(`${name}[${i}] must be { "repo", "digest" } (and an optional "note")`);
    }
    if (typeof g.repo !== "string" || !path.isAbsolute(g.repo) || g.repo.includes("\0")) {
      throw new Error(`${name}[${i}].repo must be an absolute path`);
    }
    if (typeof g.digest !== "string" || !HEX64.test(g.digest)) {
      throw new Error(`${name}[${i}].digest must be 64 lowercase hex characters`);
    }
    if (g.note !== undefined && typeof g.note !== "string") {
      throw new Error(`${name}[${i}].note must be a string`);
    }
    return { repo: realpathNearestSync(path.resolve(g.repo)), digest: g.digest };
  });
}

/** A forensic webhook URL: https, a host, no credentials. Throws otherwise. */
export function parseForensicWebhook(v: unknown): string {
  if (typeof v !== "string" || v.length > 2048) {
    throw new Error("forensicWebhook must be an https URL");
  }
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new Error("forensicWebhook must be an https URL");
  }
  if (u.protocol !== "https:" || !u.hostname || u.username || u.password) {
    throw new Error("forensicWebhook must be an https URL with a host and no credentials");
  }
  return u.href;
}

/** Parse one grant document; throws on anything not exactly as documented. */
export function parseAdminGrantDoc(doc: unknown): AdminGrants {
  if (!isObject(doc)) {
    throw new Error(`expected { "v": ${ADMIN_GRANT_VERSION}, ... }`);
  }
  if (doc.v !== ADMIN_GRANT_VERSION) {
    throw new Error(
      doc.v === 1
        ? `version 1 grant files (environment-variable opt-outs) are retired; write { "v": ${ADMIN_GRANT_VERSION}, ... } with per-repository projectHooks/projectCommands grants`
        : `expected "v": ${ADMIN_GRANT_VERSION}`,
    );
  }
  for (const k of Object.keys(doc)) {
    if (!GRANT_KEYS.has(k)) {
      throw new Error(`unknown key ${k}`);
    }
  }
  let hooks: { digest: string }[] = [];
  if (doc.hooks !== undefined) {
    const list = doc.hooks;
    if (
      !Array.isArray(list) ||
      list.some(
        (g: unknown) =>
          !isObject(g) ||
          Object.keys(g).some((k) => !["digest", "note"].includes(k)) ||
          typeof g.digest !== "string" ||
          !HEX64.test(g.digest) ||
          (g.note !== undefined && typeof g.note !== "string"),
      )
    ) {
      throw new Error(
        'hooks must be a list of { "digest": "<sha256 hex>" } (and an optional "note")',
      );
    }
    hooks = (list as { digest: string }[]).map((g) => ({ digest: g.digest }));
  }
  let loaderEnv: string[] = [];
  if (doc.loaderEnv !== undefined) {
    const l = doc.loaderEnv;
    if (
      !Array.isArray(l) ||
      l.some((n: unknown) => typeof n !== "string" || !LOADER_INJECTION_ENV.includes(n))
    ) {
      throw new Error(`loaderEnv must be a list of ${LOADER_INJECTION_ENV.join(", ")}`);
    }
    loaderEnv = [...new Set(l as string[])].toSorted();
  }
  let reducedContainment = false;
  if (doc.reducedContainment !== undefined) {
    if (typeof doc.reducedContainment !== "boolean") {
      throw new Error("reducedContainment must be true or false");
    }
    reducedContainment = doc.reducedContainment;
  }
  let hardwareRoot: "optional" | null = null;
  if (doc.hardwareRoot !== undefined) {
    if (doc.hardwareRoot !== "optional") {
      throw new Error('hardwareRoot takes exactly "optional"');
    }
    hardwareRoot = "optional";
  }
  return {
    projectHooks:
      doc.projectHooks === undefined ? [] : parseRepoGrants("projectHooks", doc.projectHooks),
    projectCommands:
      doc.projectCommands === undefined
        ? []
        : parseRepoGrants("projectCommands", doc.projectCommands),
    hooks,
    reducedContainment,
    hardwareRoot,
    forensicWebhook:
      doc.forensicWebhook === undefined ? null : parseForensicWebhook(doc.forensicWebhook),
    loaderEnv,
  };
}

/** Whether an administrator's file may be trusted. */
export type AdminFileCheck = (file: string) => SecureFileCheck;

/**
 * A test suite's stand-in for root (a suite cannot create root-owned files):
 * the uids that count as root, and whether a non-initial user namespace is
 * accepted (a suite isolated with `unshare -r`). An adapter passes it only
 * from its in-process test seam (a function call), never from a setting, a
 * file or the environment. The rules applied stay the framework's.
 */
export type TestOwnership = Readonly<{
  trustedUids?: readonly number[];
  ignoreUserNamespace?: boolean;
}>;

/**
 * The admin-file check: the framework's root-ownership check (which refuses
 * inside a non-initial user namespace). Windows has no such check, so no file
 * is trusted there. `test`: a suite's stand-in for root (TestOwnership).
 */
export function rootOwnedFileCheck(
  platform: NodeJS.Platform = process.platform,
  test: TestOwnership | null = null,
): AdminFileCheck {
  return (file) => {
    if (platform === "win32") {
      return { ok: false, reason: "no root-ownership check on Windows" };
    }
    if (!test) {
      return checkRootOwnedFile(file);
    }
    const uids = test.trustedUids?.length ? test.trustedUids : [0];
    // uidMap null skips the namespace check; otherwise the framework reads it.
    return checkRootOwnedFile(file, uids, test.ignoreUserNamespace ? { uidMap: null } : {});
  };
}

export type ResolvedGrants = Readonly<{
  grants: AdminGrants;
  /** The files whose grants are in effect. */
  files: readonly string[];
  /** Variables the user's shell sets that earlier releases read and that change nothing now. */
  retired: readonly Readonly<{ name: string; value: string }>[];
  /** Files present but not trusted or not valid: reported, nothing in them granted. */
  notes: readonly string[];
  /** Which file granted each switch and each loader variable (the first file that did). */
  sources: Readonly<Record<string, string>>;
  /** Which file granted each hook or command grant, by "<projectHooks|projectCommands|hooks>:<digest>". */
  grantFiles: Readonly<Record<string, string>>;
}>;

/**
 * The administrator's grants: every trusted, valid file in `dirs` x
 * `fileNames`, merged (lists united; a switch granted by any file is granted;
 * the first webhook wins and a second, different one is reported).
 */
export function resolveAdminGrants(o: {
  dirs: readonly string[];
  fileNames: readonly string[];
  check?: AdminFileCheck;
  env?: Readonly<Record<string, string | undefined>>;
  /** The host's retired variable names, with what replaced each (warned on, never read). */
  retiredEnv?: Readonly<Record<string, string>>;
}): ResolvedGrants {
  const check = o.check ?? rootOwnedFileCheck();
  const env = o.env ?? {};
  const retired: { name: string; value: string }[] = [];
  for (const name of Object.keys(o.retiredEnv ?? {})) {
    const value = env[name];
    if (typeof value === "string") {
      retired.push({ name, value });
    }
  }
  const notes: string[] = [];
  const files: string[] = [];
  const projectHooks: RepoGrant[] = [];
  const projectCommands: RepoGrant[] = [];
  const hooks: { digest: string }[] = [];
  const loader = new Set<string>();
  let reducedContainment = false;
  let hardwareRoot: "optional" | null = null;
  let forensicWebhook: string | null = null;
  const sources: Record<string, string> = {};
  const grantFiles: Record<string, string> = {};
  const from = (key: string, file: string) => {
    sources[key] ??= file;
  };
  for (const dir of o.dirs) {
    for (const name of o.fileNames) {
      const file = path.join(dir, name);
      const c = check(file);
      if (!c.ok) {
        if (c.reason !== "ENOENT") {
          notes.push(`${file} ignored: ${c.reason}`);
        }
        continue;
      }
      let g: AdminGrants;
      try {
        g = parseAdminGrantDoc(JSON.parse(fs.readFileSync(file, "utf8")));
      } catch (err) {
        notes.push(`${file} ignored, nothing in it is granted: ${(err as Error).message}`);
        continue;
      }
      files.push(file);
      for (const [kind, list] of [
        ["projectHooks", g.projectHooks],
        ["projectCommands", g.projectCommands],
        ["hooks", g.hooks],
      ] as const) {
        for (const x of list) {
          grantFiles[`${kind}:${x.digest}`] ??= file;
        }
      }
      projectHooks.push(...g.projectHooks);
      projectCommands.push(...g.projectCommands);
      hooks.push(...g.hooks);
      for (const n of g.loaderEnv) {
        loader.add(n);
        from(`loaderEnv=${n}`, file);
      }
      if (g.reducedContainment) {
        reducedContainment = true;
        from("reducedContainment", file);
      }
      if (g.hardwareRoot) {
        hardwareRoot ??= g.hardwareRoot;
        from(`hardwareRoot=${g.hardwareRoot}`, file);
      }
      if (g.forensicWebhook) {
        if (forensicWebhook && forensicWebhook !== g.forensicWebhook) {
          notes.push(
            `${file}: a second forensicWebhook is ignored; the one from an earlier file is used`,
          );
        } else {
          forensicWebhook = g.forensicWebhook;
          from("forensicWebhook", file);
        }
      }
    }
  }
  return {
    grants: {
      projectHooks,
      projectCommands,
      hooks,
      reducedContainment,
      hardwareRoot,
      forensicWebhook,
      loaderEnv: [...loader].toSorted(),
    },
    files,
    retired,
    notes,
    sources,
    grantFiles,
  };
}

/** The hook grants decideHooks takes: repository hooks for their repository, the rest by digest. */
export function hookGrantsOf(g: AdminGrants): HookGrant[] {
  return [
    ...g.projectHooks.map((x) => ({ repo: x.repo, digest: x.digest })),
    ...g.hooks.map((x) => ({ digest: x.digest })),
  ];
}

/** One-line warnings: retired variables, grants in use, files not trusted. */
export function adminGrantWarnings(
  r: ResolvedGrants,
  retiredEnv: Readonly<Record<string, string>> = {},
): string[] {
  const w: string[] = [];
  for (const i of r.retired) {
    w.push(
      `ignoring ${i.name}=${JSON.stringify(i.value)} from your shell: it is no longer read (${retiredEnv[i.name] ?? "fixed behavior"}). This is recorded in the audit log`,
    );
  }
  // Each grant names the file it actually came from (an Enclawed policy
  // directory or the host's managed-settings directory).
  const byFile = new Map<string, string[]>();
  for (const [key, file] of Object.entries(r.sources)) {
    byFile.set(file, [...(byFile.get(file) ?? []), key]);
  }
  for (const [file, keys] of byFile) {
    w.push(`${keys.join(", ")} granted by ${file}; recorded in the audit log`);
  }
  w.push(...r.notes);
  return w;
}
