// Boot-time posture decisions that may only be LOOSENED by the admin policy
// (see ./admin-policy.ts) and only TIGHTENED by user-writable sources
// (environment variables, the user config file). Pure functions, so each rule
// is testable without running bootstrap.

import path from "node:path";
import type { AdminPolicy } from "./admin-policy.js";
import type { Flavor } from "./flavor.js";
import { parseHardwareRootMode, type HardwareRootMode } from "./hardware-root/root-mode.js";
import { parsePolicyJson } from "./policy-loader.js";
import { tightenPolicy } from "./policy-tighten.js";
import { defaultEnclavedPolicy, defaultOpenPolicy, type Policy } from "./policy.js";

/** One refused loosening attempt: what was asked, and by which source. */
export type Refusal = Readonly<{ source: string; setting: string }>;

export function formatRefusal(r: Refusal): string {
  return `enclawed: REFUSED: ${r.setting} (from ${r.source}); it would loosen the deployment and only the admin policy (root-owned /etc/enclawed/policy.json or an org-signed policy) may do that. Recorded in the audit log.`;
}

// ---------------------------------------------------------------- FIPS

export type FipsDecision = Readonly<{
  required: boolean;
  source: "option" | "admin-policy" | "env" | "flavor-default";
  refused: Refusal | null;
}>;

/**
 * FIPS requirement: option > admin policy > flavor default (on in enclaved);
 * ENCLAWED_FIPS_REQUIRED may turn it on, never off.
 */
export function resolveFipsRequirement(p: {
  flavor: Flavor;
  env: NodeJS.ProcessEnv;
  optionValue?: boolean;
  admin: AdminPolicy | null;
}): FipsDecision {
  if (p.optionValue !== undefined) {
    return { required: p.optionValue, source: "option", refused: null };
  }
  const adminValue = p.admin?.doc.fipsRequired;
  const base = adminValue ?? p.flavor === "enclaved";
  const baseSource = adminValue !== undefined ? "admin-policy" : "flavor-default";
  const raw = p.env.ENCLAWED_FIPS_REQUIRED;
  if (raw === undefined || raw.trim() === "") {
    return { required: base, source: baseSource, refused: null };
  }
  const wantsOn = raw !== "0";
  if (wantsOn) {
    return { required: true, source: base ? baseSource : "env", refused: null };
  }
  if (base) {
    return {
      required: true,
      source: baseSource,
      refused: { source: "ENCLAWED_FIPS_REQUIRED", setting: "ENCLAWED_FIPS_REQUIRED=0" },
    };
  }
  return { required: false, source: baseSource, refused: null };
}

// ---------------------------------------------------------------- policy

export type PolicyDecision = Readonly<{
  policy: Policy;
  /** Where the authoritative part came from. */
  source: "option" | "admin-policy" | "user-config" | "flavor-default";
  refused: ReadonlyArray<Refusal>;
}>;

function flavorDefault(flavor: Flavor): Policy {
  return flavor === "enclaved" ? defaultEnclavedPolicy() : defaultOpenPolicy();
}

/**
 * Policy: option > admin `policy` block (over the flavor default) > flavor
 * default, with the user config's `enclawed.policy` block layered on top
 * tighten-only. Exception: the open flavor without an admin policy keeps the
 * historic behavior (the user block is authoritative) because the open flavor
 * is not a security boundary unless an admin policy says otherwise.
 *
 * Throws (TypeError) on an invalid admin or user block; the caller decides
 * whether that refuses startup.
 */
export function resolveBootPolicy(p: {
  flavor: Flavor;
  admin: AdminPolicy | null;
  userBlock: unknown;
  optionPolicy?: Policy;
}): PolicyDecision {
  if (p.optionPolicy) {
    return { policy: p.optionPolicy, source: "option", refused: [] };
  }
  const fallback = flavorDefault(p.flavor);
  const labels = {
    maxOutputClearance: fallback.maxOutputClearance,
    defaultDataLabel: fallback.defaultDataLabel,
    enforceAllowlists: fallback.enforceAllowlists,
  };
  if (!p.admin && p.flavor === "open") {
    if (p.userBlock === undefined) {
      return { policy: fallback, source: "flavor-default", refused: [] };
    }
    return { policy: parsePolicyJson(p.userBlock, labels), source: "user-config", refused: [] };
  }
  const adminBlock = p.admin?.doc.policy;
  const base = adminBlock !== undefined ? parsePolicyJson(adminBlock, labels) : fallback;
  const { policy, refused } = tightenPolicy(base, p.userBlock);
  return {
    policy,
    source: adminBlock !== undefined ? "admin-policy" : "flavor-default",
    refused: refused.map((setting) => ({ source: "the user config file", setting })),
  };
}

// ---------------------------------------------------------------- audit path

export type AuditPathInputs = Readonly<{
  optionPath?: string;
  envPath?: string;
  configPath?: string;
  /** Path chosen by the admin policy. */
  adminPath?: string;
  allowUserFallback: boolean;
  refused: ReadonlyArray<Refusal>;
}>;

/**
 * In the enclaved flavor (and whenever the admin policy names a path) the
 * audit log goes to the admin path or the system path: ENCLAWED_AUDIT_PATH and
 * enclawed.audit.path are user-writable and could point the evidence anywhere
 * (even /dev/null), so they are refused. A user-owned fallback is allowed only
 * when the admin policy says `audit.allowUserFallback: true`.
 */
export function resolveAuditPathInputs(p: {
  flavor: Flavor;
  admin: AdminPolicy | null;
  optionPath?: string;
  envPath?: string;
  configPath?: string;
}): AuditPathInputs {
  const adminPath = p.admin?.doc.audit?.path;
  const restricted = p.flavor === "enclaved" || adminPath !== undefined;
  const allowUserFallback = p.admin?.doc.audit?.allowUserFallback ?? p.flavor !== "enclaved";
  if (!restricted) {
    return {
      optionPath: p.optionPath,
      adminPath,
      envPath: p.envPath,
      configPath: p.configPath,
      allowUserFallback,
      refused: [],
    };
  }
  const refused: Refusal[] = [];
  const envPath = p.envPath?.trim() ? p.envPath : undefined;
  if (envPath) {
    refused.push({ source: "ENCLAWED_AUDIT_PATH", setting: `ENCLAWED_AUDIT_PATH=${envPath}` });
  }
  if (p.configPath) {
    refused.push({
      source: "the user config file",
      setting: `enclawed.audit.path=${p.configPath}`,
    });
  }
  return {
    optionPath: p.optionPath,
    adminPath,
    allowUserFallback,
    refused,
  };
}

// ---------------------------------------------------------------- warnings

/**
 * Loud, every-start warnings for an enclaved posture the admin chose to
 * weaken. They are legitimate (root-owned policy), but never silent.
 */
export function enclavedPostureWarnings(flavor: Flavor, policy: Policy): string[] {
  if (flavor !== "enclaved") {
    return [];
  }
  const out: string[] = [];
  if (!policy.enforceAllowlists) {
    out.push(
      "enclawed: WARNING: enclawed.policy.enforceAllowlists is false in the enclaved flavor: " +
        "channel, provider, tool and host allowlists are NOT enforced. Set by the admin policy; recorded in the audit log.",
    );
  }
  if (policy.commandNetwork === "host") {
    out.push(
      'enclawed: WARNING: enclawed.policy.commandNetwork is "host" in the enclaved flavor: ' +
        "commands the model runs share the host network (no network cage). Set by the admin policy; recorded in the audit log.",
    );
  }
  return out;
}

// ---------------------------------------------------------------- environment knobs

/**
 * Environment variables that relocate or switch off hardware-root evidence,
 * latches and the device broker, or remove the bundled (security) plugin
 * tree. They are user-writable, so in the enclaved flavor any value refuses
 * startup (settings audit #7, #10-#13).
 */
export const ENCLAVED_REFUSED_ENV_VARS = [
  "ENCLAWED_DISABLE_BUNDLED_PLUGINS",
  "ENCLAWEDER_STATE",
  "ENCLAWEDER_STATE_DIR",
  "ENCLAWEDER_FORENSIC_WEBHOOK",
  "ENCLAWEDER_FORENSIC_LOG",
  "ENCLAWEDER_AUDIT_PATH",
  "ENCLAWEDER_QUEUE_LOG",
] as const;

/**
 * Environment knobs refused at startup. In every flavor ENCLAWEDER_ROOT must
 * parse strictly (see ./hardware-root/root-mode.ts). In the enclaved flavor
 * the variables in ENCLAVED_REFUSED_ENV_VARS are refused whenever set,
 * ENCLAWEDER_BROKER=off is refused (the socket-path form stays, it is checked
 * for ownership), and ENCLAWEDER_ROOT=optional is refused unless the admin
 * policy sets `allow.hardwareRootOptional: true` (device retirement), and
 * ENCLAWED_BUNDLED_PLUGINS_DIR is refused unless it is the directory the
 * admin policy names in `allow.bundledPluginsDir`.
 * A non-empty result means bootstrap refuses to start.
 */
export function findRefusedEnvKnobs(p: {
  flavor: Flavor;
  env: NodeJS.ProcessEnv;
  admin: AdminPolicy | null;
}): Refusal[] {
  const refused: Refusal[] = [];
  let mode: HardwareRootMode | null = null;
  try {
    mode = parseHardwareRootMode(p.env.ENCLAWEDER_ROOT);
  } catch (err) {
    refused.push({
      source: "ENCLAWEDER_ROOT",
      setting: err instanceof Error ? err.message : String(err),
    });
  }
  if (p.flavor !== "enclaved") {
    return refused;
  }
  for (const name of ENCLAVED_REFUSED_ENV_VARS) {
    const value = p.env[name];
    if (value !== undefined && value !== "") {
      refused.push({ source: name, setting: `${name}=${value}` });
    }
  }
  const broker = (p.env.ENCLAWEDER_BROKER ?? "").trim().toLowerCase();
  if (broker === "off" || broker === "0" || broker === "false") {
    refused.push({
      source: "ENCLAWEDER_BROKER",
      setting: `ENCLAWEDER_BROKER=${p.env.ENCLAWEDER_BROKER}`,
    });
  }
  if (mode === "optional" && p.admin?.doc.allow?.hardwareRootOptional !== true) {
    refused.push({ source: "ENCLAWEDER_ROOT", setting: "ENCLAWEDER_ROOT=optional" });
  }
  // A relocated bundled plugin tree: module signatures cover the manifests,
  // not the plugin code, so a user-chosen directory could hold signed
  // manifests next to other code. Only the directory the admin policy names
  // is accepted.
  const bundledDir = p.env.ENCLAWED_BUNDLED_PLUGINS_DIR?.trim();
  if (bundledDir) {
    const allowed = p.admin?.doc.allow?.bundledPluginsDir;
    if (allowed === undefined || path.resolve(bundledDir) !== path.resolve(allowed)) {
      refused.push({
        source: "ENCLAWED_BUNDLED_PLUGINS_DIR",
        setting: `ENCLAWED_BUNDLED_PLUGINS_DIR=${bundledDir}`,
      });
    }
  }
  return refused;
}
