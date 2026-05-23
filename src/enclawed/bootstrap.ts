// One-call activation. Called from src/entry.ts at the top of the main-module
// branch, before any plugin or transit module has been imported. Always on.
// Behavior:
//   1. Optionally asserts that Node is in FIPS mode (config-controlled).
//   2. Installs the egress-guard fetch wrapper.
//   3. Opens the hash-chained audit log.
//   4. Registers the runtime on a globalThis symbol so other patches see it.
//   5. Appends a single "enclawed.boot" record.

import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve as resolvePath } from "node:path";

import { resolveDefaultConfigPath } from "../infra/workspace-dir.js";
import { AuditLogger } from "./audit-log.js";
import {
  type ClassificationScheme,
  loadSchemeByName,
  setActiveScheme,
} from "./classification-scheme.js";
import { assertFipsMode } from "./crypto-fips.js";
import { installEgressGuard } from "./egress-guard.js";
import { type Flavor, getFlavor } from "./flavor.js";
import { type ModuleVerificationMap, preloadModuleDecisions } from "./integration/preload.js";
import { defaultEnclavedPolicy, defaultOpenPolicy, type Policy } from "./policy.js";
import { loadPolicyFromJson } from "./policy-loader.js";
import { applyPersistedTrustOverlay } from "./trust-root-store.js";
import { type EnclawedRuntime, setRuntime } from "./runtime.js";
import { lockTrustRoot } from "./trust-root.js";

export type BootstrapOptions = {
  flavor?: Flavor;
  policy?: Policy;
  auditPath?: string;
  fipsRequired?: boolean;
  env?: NodeJS.ProcessEnv;
  modulesRoot?: string;        // path to the modules dir; defaults to "extensions"
  preloadModules?: boolean;    // default true; set false in tests
  classificationScheme?: ClassificationScheme;  // overrides any env-driven loader
};

// Default audit-log path is flavor-dependent so that a casual install
// (`npm install -g enclawed && enclawed`) in open flavor lands in a
// user-writable location, while strict enclaved deployments keep the
// canonical /var/log path (run as a service user with the right perms).
// The operator can override either default via ENCLAWED_AUDIT_PATH or
// the `auditPath` option.
const DEFAULT_AUDIT_PATH_ENCLAVED = "/var/log/enclawed/audit.jsonl";

function defaultAuditPathForFlavor(flavor: Flavor): string {
  if (flavor === "enclaved") return DEFAULT_AUDIT_PATH_ENCLAVED;
  return resolvePath(homedir(), ".enclawed", "audit.jsonl");
}

/**
 * Read and JSON-parse the resolved enclawed config file. Returns `undefined`
 * if the file does not exist, is not readable, or is not valid JSON. Errors
 * are intentionally swallowed at bootstrap because the loader is consulted
 * before logger initialization; downstream code reads the same document
 * later for individual extension blocks and can surface richer errors there.
 */
async function tryReadEnclawedConfigDocument(
  env: NodeJS.ProcessEnv,
): Promise<unknown> {
  try {
    const { path: configPath } = resolveDefaultConfigPath({ env });
    let raw: string;
    try {
      raw = await readFile(configPath, "utf8");
    } catch {
      return undefined;
    }
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function bootstrapEnclawed(opts: BootstrapOptions = {}): Promise<EnclawedRuntime> {
  const env = opts.env ?? process.env;
  const flavor = opts.flavor ?? getFlavor(env);

  // Classification scheme: explicit opts > ENCLAWED_CLASSIFICATION_SCHEME
  // (built-in id OR file path to a custom scheme JSON) > the default scheme.
  // The choice is applied to the global active-scheme registry before any
  // module manifests are parsed, so manifest clearance validation uses the
  // chosen vocabulary.
  let activeSchemeId = "enclawed-default";
  if (opts.classificationScheme) {
    setActiveScheme(opts.classificationScheme);
    activeSchemeId = opts.classificationScheme.id;
  } else if (env.ENCLAWED_CLASSIFICATION_SCHEME) {
    const scheme = await loadSchemeByName(env.ENCLAWED_CLASSIFICATION_SCHEME);
    setActiveScheme(scheme);
    activeSchemeId = scheme.id;
  }

  // FIPS is required by default in the enclaved flavor. In the open flavor
  // the default is OFF (community deployments rarely have a FIPS-validated
  // OpenSSL build). Explicit ENCLAWED_FIPS_REQUIRED overrides either way.
  const fipsDefault = flavor === "enclaved";
  const fipsEnv = env.ENCLAWED_FIPS_REQUIRED;
  const fipsRequired =
    opts.fipsRequired ?? (fipsEnv === undefined ? fipsDefault : fipsEnv !== "0");
  if (fipsRequired) {
    assertFipsMode();
  }

  // Policy precedence:
  //   1. Explicit `opts.policy` (programmatic bootstrap shim wins).
  //   2. `enclawed.policy.*` block in the resolved config file, layered on
  //      top of the flavor default so missing keys fall through.
  //   3. The flavor default (defaultEnclavedPolicy / defaultOpenPolicy).
  let policy: Policy;
  if (opts.policy) {
    policy = opts.policy;
  } else {
    const fallback = flavor === "enclaved" ? defaultEnclavedPolicy() : defaultOpenPolicy();
    const jsonDoc = await tryReadEnclawedConfigDocument(env);
    if (jsonDoc !== undefined) {
      try {
        policy = loadPolicyFromJson(jsonDoc, {
          maxOutputClearance: fallback.maxOutputClearance,
          defaultDataLabel: fallback.defaultDataLabel,
          enforceAllowlists: fallback.enforceAllowlists,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Bad policy block is a deployment bug — surface it loudly. In open
        // flavor we still fall back to the default so the CLI is usable.
        if (flavor === "enclaved") {
          throw new Error(`enclawed.policy in config is invalid: ${message}`);
        }
        process.stderr.write(
          `enclawed: ignoring invalid enclawed.policy in config (${message}); using flavor default.\n`,
        );
        policy = fallback;
      }
    } else {
      policy = fallback;
    }
  }

  // Trust-root overlay: in both flavors the persisted ~/.enclawed/trust-root.json
  // (if present) is layered on top of DEFAULT_TRUST_ROOT before bootstrap locks
  // the root in enclaved mode. In open flavor it stays mutable; in enclaved
  // flavor lockTrustRoot() below freezes whatever was loaded.
  try {
    await applyPersistedTrustOverlay({ env });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (flavor === "enclaved") {
      throw new Error(`enclawed: invalid persisted trust root: ${message}`);
    }
    process.stderr.write(`enclawed: ignoring persisted trust root (${message}).\n`);
  }

  let auditPath = opts.auditPath ?? env.ENCLAWED_AUDIT_PATH ?? defaultAuditPathForFlavor(flavor);
  try {
    await mkdir(dirname(auditPath), { recursive: true });
  } catch (err) {
    // mkdir failed (typically EACCES under /var/log for a non-root user).
    // In the open flavor, fall back to the user-home default rather than
    // crashing the next file open. In the enclaved flavor we surface the
    // error because a misconfigured audit path is a deployment bug.
    const code = (err as NodeJS.ErrnoException).code;
    const isPermission = code === "EACCES" || code === "EPERM" || code === "EROFS";
    if (flavor === "enclaved" || !isPermission) {
      throw err;
    }
    const fallback = resolvePath(homedir(), ".enclawed", "audit.jsonl");
    if (fallback === auditPath) throw err;
    process.stderr.write(
      `enclawed: audit-log dir ${dirname(auditPath)} not writable (${code}); ` +
        `falling back to ${fallback}. Override with ENCLAWED_AUDIT_PATH.\n`,
    );
    auditPath = fallback;
    await mkdir(dirname(auditPath), { recursive: true });
  }
  const audit = new AuditLogger({ filePath: auditPath });

  const restoreFetch = installEgressGuard({
    allowedHosts: policy.allowedHosts,
    // In the enclaved flavor we permanently bind globalThis.fetch to the
    // guard so module code cannot reassign it to bypass egress control.
    freeze: flavor === "enclaved",
    onDeny: ({ host }) => {
      audit
        .append({ type: "egress.deny", actor: "process", level: null, payload: { host } })
        .catch(() => {});
    },
  });

  // In the enclaved flavor, lock the trust root after this point. Any module
  // code attempting setTrustRoot() / resetTrustRoot() after bootstrap will
  // throw TrustRootLockedError. The deploying organization should call
  // setTrustRoot(orgOwnedSigners) BEFORE invoking bootstrapEnclawed().
  if (flavor === "enclaved") {
    lockTrustRoot();
  }

  let moduleDecisions: ModuleVerificationMap | null = null;
  if (opts.preloadModules !== false) {
    try {
      moduleDecisions = await preloadModuleDecisions(opts.modulesRoot);
    } catch (e) {
      // Preload failure in enclaved mode is fatal (we cannot vouch for any
      // module if we cannot read the manifest tree). In open mode it falls
      // back to permissive — log only.
      if (flavor === "enclaved") throw e;
      moduleDecisions = new Map();
    }
  }

  const runtime: EnclawedRuntime = Object.freeze({
    flavor,
    policy,
    audit,
    restoreFetch,
    fipsRequired,
    moduleDecisions,
  });
  setRuntime(runtime);

  await audit.append({
    type: "enclawed.boot",
    actor: "process",
    level: null,
    payload: {
      pid: process.pid,
      flavor,
      classificationScheme: activeSchemeId,
      enforceAllowlists: policy.enforceAllowlists,
      allowedChannels: [...policy.allowedChannels],
      allowedProviders: [...policy.allowedProviders],
      allowedHosts: [...policy.allowedHosts],
      fipsRequired,
    },
  });

  return runtime;
}
