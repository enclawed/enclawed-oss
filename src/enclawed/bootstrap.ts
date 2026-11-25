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
import { resolveDefaultConfigPath, resolveWorkspaceDirInfo } from "../infra/workspace-dir.js";
import {
  type AdminPolicyLoad,
  describeAdminSource,
  getActiveAdminPolicyLoad,
  loadAdminPolicy,
  setActiveAdminPolicy,
} from "./admin-policy.js";
import { AuditLogger } from "./audit-log.js";
import {
  enclavedPostureWarnings,
  findRefusedEnvKnobs,
  formatRefusal,
  type Refusal,
  resolveAuditPathInputs,
  resolveBootPolicy,
  resolveFipsRequirement,
} from "./boot-posture.js";
import {
  type ClassificationScheme,
  loadSchemeByName,
  setActiveScheme,
} from "./classification-scheme.js";
import { assertFipsMode, isFipsEnabled } from "./crypto-fips.js";
import { installEgressGuard, installRawSocketGuard } from "./egress-guard.js";
import { type Flavor, resolveFlavor } from "./flavor.js";
import {
  bootHardwareRoot,
  hardwareRootInfo,
  setForensicAuditSink,
  setForensicContext,
} from "./hardware-root/index.js";
import {
  configureHpcGate,
  extractHpcBlock,
  parseHpcPolicy,
  resolveHpcGatePolicy,
  type HpcPolicy,
} from "./hpc/index.js";
import { type ModuleVerificationMap, preloadModuleDecisions } from "./integration/preload.js";
import { extractPolicyBlock } from "./policy-loader.js";
import type { Policy } from "./policy.js";
import { type EnclawedRuntime, setRuntime } from "./runtime.js";
import { publishToolCapabilityClassifier } from "./tool-capability-map.js";
import { applyPersistedTrustOverlay } from "./trust-root-store.js";
import { lockTrustRoot } from "./trust-root.js";

export type BootstrapOptions = {
  flavor?: Flavor;
  policy?: Policy;
  auditPath?: string;
  fipsRequired?: boolean;
  env?: NodeJS.ProcessEnv;
  modulesRoot?: string; // path to the modules dir; defaults to "extensions"
  preloadModules?: boolean; // default true; set false in tests
  classificationScheme?: ClassificationScheme; // overrides any env-driven loader
  hpcPolicy?: HpcPolicy | null; // overrides `enclawed.hpc`; null turns the gate off
  /**
   * The admin policy to use instead of loading /etc/enclawed (tests and
   * embedding apps). Programmatic only: never derived from the environment.
   */
  adminPolicy?: AdminPolicyLoad;
  /** false skips the raw-socket egress guard (tests that must not freeze net.Socket). */
  rawSocketGuard?: false;
  /**
   * false skips binding the Enclaweder (tests on hosts with a device attached).
   * Programmatic only, like every option here; recorded in the boot record.
   */
  hardwareRoot?: false;
};

/** Loopback is always reachable by the raw-socket guard: the gateway's own clients and local models. */
const LOOPBACK_HOSTS = ["127.0.0.1", "::1", "localhost"] as const;
const LOOPBACK_CIDRS = ["127.0.0.0/8"] as const;

function safeStateDir(env: NodeJS.ProcessEnv): string | undefined {
  try {
    return resolveWorkspaceDirInfo({ env }).path;
  } catch {
    return undefined;
  }
}

/** Audit-append failure handler for fire-and-forget records: never silent. */
function reportAuditFailure(type: string): (err: unknown) => void {
  return (err) => {
    process.stderr.write(
      `enclawed: ERROR: could not write the "${type}" audit record: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  };
}

// Default audit-log path is flavor-dependent so that a casual install
// (`npm install -g enclawed && enclawed`) in open flavor lands in a
// user-writable location, while strict enclaved deployments keep the
// canonical /var/log path (run as a service user with the right perms).
// The operator can override either default via ENCLAWED_AUDIT_PATH or
// the `auditPath` option.
const DEFAULT_AUDIT_PATH_ENCLAVED = "/var/log/enclawed/audit.jsonl";

function defaultAuditPathForFlavor(flavor: Flavor): string {
  if (flavor === "enclaved") {
    return DEFAULT_AUDIT_PATH_ENCLAVED;
  }
  return resolvePath(homedir(), ".enclawed", "audit.jsonl");
}

/**
 * Read and JSON-parse the resolved enclawed config file. Returns `undefined`
 * if the file does not exist, is not readable, or is not valid JSON. Errors
 * are intentionally swallowed at bootstrap because the loader is consulted
 * before logger initialization; downstream code reads the same document
 * later for individual extension blocks and can surface richer errors there.
 */
async function tryReadEnclawedConfigDocument(env: NodeJS.ProcessEnv): Promise<unknown> {
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
  // Loosening comes only from the admin policy (root-owned file or org-signed
  // document; see ./admin-policy.ts). User-writable sources only tighten. A
  // custom `env` (tests, embedding apps) gets its own load and does not
  // replace the process-wide admin policy.
  const usesProcessEnv = opts.env === undefined || opts.env === process.env;
  const adminLoad =
    opts.adminPolicy ??
    (usesProcessEnv
      ? getActiveAdminPolicyLoad()
      : loadAdminPolicy({ stateDir: safeStateDir(env) }));
  if (opts.adminPolicy || usesProcessEnv) {
    setActiveAdminPolicy(adminLoad);
  }
  const admin = adminLoad.admin;
  const refusals: Refusal[] = [];
  // Every refused loosening attempt is printed when it happens (a later
  // startup refusal must not hide it) and recorded once the audit log opens.
  // The flavor refusal has its own warning line.
  const refuse = (r: Refusal): void => {
    refusals.push(r);
    if (r.source !== "ENCLAWED_FLAVOR") {
      process.stderr.write(`${formatRefusal(r)}\n`);
    }
  };
  const resolvedFlavor = resolveFlavor(env, { adminFlavor: admin?.doc.flavor ?? null });
  const flavor = opts.flavor ?? resolvedFlavor.flavor;
  if (!opts.flavor && resolvedFlavor.refusedEnvValue !== null) {
    process.stderr.write(
      `enclawed: REFUSED: ENCLAWED_FLAVOR=${JSON.stringify(resolvedFlavor.refusedEnvValue)} would downgrade ` +
        'the "enclaved" flavor set by the admin policy; staying "enclaved".\n',
    );
    refusals.push({
      source: "ENCLAWED_FLAVOR",
      setting: `ENCLAWED_FLAVOR=${resolvedFlavor.refusedEnvValue}`,
    });
  }
  for (const line of adminLoad.ignored) {
    process.stderr.write(`enclawed: WARNING: ${line}\n`);
  }
  if (adminLoad.invalid !== null) {
    if (flavor === "enclaved") {
      throw new Error(`enclawed: the admin policy is invalid: ${adminLoad.invalid}`);
    }
    process.stderr.write(`enclawed: ignoring invalid admin policy (${adminLoad.invalid}).\n`);
  }

  // Environment knobs (settings audit #7, #9-#13): ENCLAWEDER_ROOT must parse
  // strictly in every flavor; in the enclaved flavor the variables that move
  // or switch off hardware-root evidence, latches, the broker or the bundled
  // plugin tree refuse startup. Both the given env and the process env are
  // checked, because the hardware root and the plugin loader read the latter.
  const knobRefusals = findRefusedEnvKnobs({ flavor, env, admin });
  if (env !== process.env) {
    const seen = new Set(knobRefusals.map((r) => r.setting));
    for (const r of findRefusedEnvKnobs({ flavor, env: process.env, admin })) {
      if (!seen.has(r.setting)) {
        knobRefusals.push(r);
      }
    }
  }
  if (knobRefusals.length > 0) {
    for (const r of knobRefusals) {
      process.stderr.write(`${formatRefusal(r)}\n`);
    }
    throw new Error(
      `enclawed: refusing to start: ${knobRefusals.map((r) => r.setting).join("; ")}. ` +
        "Unset the variable(s); they are not user settings" +
        (flavor === "enclaved"
          ? ' (retiring an Enclaweder: the admin policy sets "allow": { "hardwareRootOptional": true })'
          : "") +
        ".",
    );
  }

  // Classification scheme: explicit opts > ENCLAWED_CLASSIFICATION_SCHEME
  // (built-in id OR file path to a custom scheme JSON) > the default scheme.
  // The choice is applied to the global active-scheme registry before any
  // module manifests are parsed, so manifest clearance validation uses the
  // chosen vocabulary.
  let activeSchemeId = "enclawed-default";
  if (opts.classificationScheme) {
    setActiveScheme(opts.classificationScheme);
    activeSchemeId = opts.classificationScheme.id;
  } else if (admin?.doc.classificationScheme) {
    const scheme = await loadSchemeByName(admin.doc.classificationScheme);
    setActiveScheme(scheme);
    activeSchemeId = scheme.id;
  } else if (env.ENCLAWED_CLASSIFICATION_SCHEME) {
    // A scheme redefines the levels clearance checks compare against, and the
    // env var can name an arbitrary file: in the enclaved flavor (or under an
    // admin policy) it is the admin's choice only.
    if (flavor === "enclaved" || admin) {
      refuse({
        source: "ENCLAWED_CLASSIFICATION_SCHEME",
        setting: `ENCLAWED_CLASSIFICATION_SCHEME=${env.ENCLAWED_CLASSIFICATION_SCHEME}`,
      });
    } else {
      const scheme = await loadSchemeByName(env.ENCLAWED_CLASSIFICATION_SCHEME);
      setActiveScheme(scheme);
      activeSchemeId = scheme.id;
    }
  }

  // FIPS is required by default in the enclaved flavor. In the open flavor
  // the default is OFF (community deployments rarely have a FIPS-validated
  // OpenSSL build). Explicit ENCLAWED_FIPS_REQUIRED overrides either way.
  // Only the admin policy can turn the requirement off; ENCLAWED_FIPS_REQUIRED=1
  // can turn it on, and ENCLAWED_FIPS_REQUIRED=0 over a requirement is refused.
  const fips = resolveFipsRequirement({ flavor, env, optionValue: opts.fipsRequired, admin });
  if (fips.refused) {
    refuse(fips.refused);
  }
  const fipsRequired = fips.required;
  const fipsEnabled = isFipsEnabled();
  if (fipsRequired) {
    assertFipsMode();
  }
  // Running the enclaved flavor without the FIPS requirement is never silent:
  // warned at every start and recorded in the boot record (fipsDowngrade).
  const fipsDowngrade = flavor === "enclaved" && !fipsRequired;
  if (fipsDowngrade) {
    process.stderr.write(
      "enclawed: WARNING: the enclaved flavor is running without the FIPS requirement " +
        `(set by ${fips.source === "option" ? "the embedding app" : "the admin policy"}; ` +
        `FIPS mode is ${fipsEnabled ? "on" : "off"}). ` +
        "This is an evaluation-only downgrade and is recorded in the audit log.\n",
    );
  }

  // Policy: option > admin `policy` block > flavor default, with the user
  // config's enclawed.policy layered on top tighten-only (see
  // ./boot-posture.ts; open flavor without an admin policy keeps the user
  // block authoritative). An invalid block refuses to start in enclaved.
  let policy: Policy;
  {
    let userBlock: unknown;
    if (!opts.policy) {
      userBlock = extractPolicyBlock(await tryReadEnclawedConfigDocument(env));
    }
    try {
      const decision = resolveBootPolicy({ flavor, admin, userBlock, optionPolicy: opts.policy });
      policy = decision.policy;
      decision.refused.forEach(refuse);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (flavor === "enclaved") {
        throw new Error(`enclawed.policy is invalid: ${message}`, { cause: err });
      }
      process.stderr.write(
        `enclawed: ignoring invalid enclawed.policy in config (${message}); using flavor default.\n`,
      );
      policy = resolveBootPolicy({ flavor, admin: null, userBlock: undefined }).policy;
    }
  }

  // HPC launch gate (`enclawed.hpc`). An absent block turns the gate off in the
  // open flavor and installs the refuse-all gate in the enclaved flavor, so
  // removing the block never disables it there. A block that does not parse
  // never leaves the gate open: enclaved refuses to start, and open flavor
  // runs with every launch refused until it is fixed.
  if (opts.hpcPolicy !== undefined) {
    configureHpcGate(opts.hpcPolicy);
  } else {
    const hpcBlock = extractHpcBlock(await tryReadEnclawedConfigDocument(env));
    try {
      configureHpcGate(resolveHpcGatePolicy(hpcBlock, flavor));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (flavor === "enclaved") {
        throw new Error(`enclawed.hpc in config is invalid: ${message}`, { cause: err });
      }
      process.stderr.write(
        `enclawed: enclawed.hpc in config is invalid (${message}); refusing every HPC launch.\n`,
      );
      configureHpcGate(parseHpcPolicy({ enforce: true, schedulers: [] }));
    }
  }

  // Trust root: shipped signers plus admin-policy signers (additions only).
  // The user-writable ~/.enclawed/trust-root.json is ignored in the enclaved
  // flavor (and whenever an admin policy is present); in open flavor it may
  // add signers but never replace a shipped one. See ./trust-root-store.ts.
  try {
    const overlay = await applyPersistedTrustOverlay({
      env,
      flavor,
      adminSigners: admin?.doc.trustRoot?.signers ?? null,
    });
    for (const line of overlay.refused) {
      refuse({ source: "the trust-root overlay", setting: line });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (flavor === "enclaved") {
      throw new Error(`enclawed: invalid trust root: ${message}`, { cause: err });
    }
    process.stderr.write(`enclawed: ignoring persisted trust root (${message}).\n`);
  }

  // Audit path: in the enclaved flavor (or under an admin audit.path) the
  // user-writable ENCLAWED_AUDIT_PATH is refused; see ./boot-posture.ts.
  const auditInputs = resolveAuditPathInputs({
    flavor,
    admin,
    optionPath: opts.auditPath,
    envPath: env.ENCLAWED_AUDIT_PATH,
  });
  auditInputs.refused.forEach(refuse);
  let auditPath =
    auditInputs.optionPath ??
    auditInputs.adminPath ??
    auditInputs.envPath ??
    defaultAuditPathForFlavor(flavor);
  try {
    await mkdir(dirname(auditPath), { recursive: true });
  } catch (err) {
    // mkdir failed (typically EACCES under /var/log for a non-root user).
    // In the open flavor, fall back to the user-home default rather than
    // crashing the next file open. In the enclaved flavor we surface the
    // error because a misconfigured audit path is a deployment bug.
    const code = (err as NodeJS.ErrnoException).code;
    const isPermission = code === "EACCES" || code === "EPERM" || code === "EROFS";
    if (flavor === "enclaved" || !isPermission || !auditInputs.allowUserFallback) {
      throw err;
    }
    const fallback = resolvePath(homedir(), ".enclawed", "audit.jsonl");
    if (fallback === auditPath) {
      throw err;
    }
    process.stderr.write(
      `enclawed: audit-log dir ${dirname(auditPath)} not writable (${code}); ` +
        `falling back to ${fallback}. Override with ENCLAWED_AUDIT_PATH.\n`,
    );
    auditPath = fallback;
    await mkdir(dirname(auditPath), { recursive: true });
  }
  const audit = new AuditLogger({ filePath: auditPath });

  // Plugins classify tools through the open core's capability map.
  publishToolCapabilityClassifier();

  const restoreFetch = installEgressGuard({
    allowedHosts: policy.allowedHosts,
    // In the enclaved flavor we permanently bind globalThis.fetch to the
    // guard so module code cannot reassign it to bypass egress control.
    freeze: flavor === "enclaved",
    onDeny: ({ host }) => {
      audit
        .append({ type: "egress.deny", actor: "process", level: null, payload: { host } })
        .catch(reportAuditFailure("egress.deny"));
    },
  });

  // Raw-socket guard: the fetch guard alone leaves node:http/https, undici
  // dispatchers, WebSocket clients and IMAP/SMTP libraries (anything that
  // opens a net.Socket) outside the host allowlist. Installed whenever the
  // allowlists are enforced, frozen in the enclaved flavor. Loopback stays
  // reachable for the gateway's own clients and local model servers; unix
  // domain sockets (IPC) are local and allowed.
  let rawSocketGuardInstalled = false;
  if (policy.enforceAllowlists && opts.rawSocketGuard !== false) {
    installRawSocketGuard({
      allowedHosts: [...policy.allowedHosts, ...LOOPBACK_HOSTS],
      allowedCidrs: LOOPBACK_CIDRS,
      freeze: flavor === "enclaved",
      onDeny: ({ host, port, kind }) => {
        audit
          .append({
            type: "egress.deny",
            actor: "process",
            level: null,
            payload: { host, port: port ?? null, kind },
          })
          .catch(reportAuditFailure("egress.deny"));
      },
    });
    rawSocketGuardInstalled = true;
  }

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
      moduleDecisions = await preloadModuleDecisions(opts.modulesRoot, { flavor });
    } catch (e) {
      // Preload failure in enclaved mode is fatal (we cannot vouch for any
      // module if we cannot read the manifest tree). In open mode it falls
      // back to permissive — log only.
      if (flavor === "enclaved") {
        throw e;
      }
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

  // Detect + bind the enclaweder hardware root of trust at bootstrap. If a genuine device is on the
  // bus it is mandatory (every gated skill call is checked against it, and unplug/zeroize latches a
  // persistent DIRTY halt); if configured-required (ENCLAWEDER_ROOT) and absent, this throws and
  // refuses to boot. Software-only otherwise. See ./hardware-root/index.ts.
  if (opts.hardwareRoot !== false) {
    // Every forensic tamper snapshot's hash goes into this (device-anchored) audit chain, so a
    // snapshot cannot be removed from the forensic log without it showing (finding H13).
    setForensicAuditSink((rec) => audit.append(rec));
    setForensicContext({ auditPath });
    await bootHardwareRoot();
  }

  // The tool allowlist is deny-by-default like channels and providers. Say so
  // at boot, so an operator upgrading from a release that did not enforce it
  // knows why agents have no tools.
  if (policy.enforceAllowlists && policy.allowedTools.size === 0) {
    process.stderr.write(
      "enclawed: enclawed.policy.allowedTools is empty, so agents get no tools. " +
        "List the tool ids to allow (see `enclawed policy`).\n",
    );
  }

  for (const line of enclavedPostureWarnings(flavor, policy)) {
    process.stderr.write(`${line}\n`);
  }
  // Every refused loosening attempt (already printed above) is recorded.
  if (refusals.length > 0) {
    await audit.append({
      type: "enclawed.policy.refused",
      actor: "process",
      level: null,
      payload: { flavor, refusals: refusals.map((r) => ({ ...r })) },
    });
  }

  await audit.append({
    type: "enclawed.boot",
    actor: "process",
    level: null,
    payload: {
      pid: process.pid,
      flavor,
      flavorSource: opts.flavor ? "option" : resolvedFlavor.source,
      refusedFlavorEnv: resolvedFlavor.refusedEnvValue,
      adminPolicy: describeAdminSource(admin),
      adminPolicyIgnored: [...adminLoad.ignored],
      policyRefusals: refusals.map((r) => `${r.source}: ${r.setting}`),
      rawSocketGuard: rawSocketGuardInstalled,
      commandNetwork: policy.commandNetwork,
      hardwareRoot: hardwareRootInfo(),
      hardwareRootSkippedByOption: opts.hardwareRoot === false,
      classificationScheme: activeSchemeId,
      enforceAllowlists: policy.enforceAllowlists,
      allowedChannels: [...policy.allowedChannels],
      allowedProviders: [...policy.allowedProviders],
      allowedTools: [...policy.allowedTools],
      allowedHosts: [...policy.allowedHosts],
      preApprovedIrreversibleTools: [...policy.preApprovedIrreversibleTools],
      scratchPaths: [...policy.scratchPaths],
      history: {
        maxFileBytes: policy.history.maxFileBytes,
        maxTotalBytes: policy.history.maxTotalBytes,
        maxAgeDays: policy.history.maxAgeDays,
        noHistoryPaths: [...policy.history.noHistoryPaths],
        noHistoryTools: [...policy.history.noHistoryTools],
      },
      fipsRequired,
      fipsSource: fips.source,
      fipsEnabled,
      fipsDowngrade,
      auditPath,
    },
  });

  return runtime;
}
