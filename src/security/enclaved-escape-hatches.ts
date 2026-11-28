// Escape hatches in the enclaved flavor.
//
// Upstream config carries opt-outs that downgrade an auth, origin, sandbox or
// content boundary: `dangerously*` / `allowInsecure*` / `allowUnsafe*` flags,
// `tools.exec.applyPatch.workspaceOnly=false`, plugin-declared dangerous
// flags, `gateway.auth.mode: "none"`, and the weakening settings listed in
// WEAKENING_KEYS / WEAKENING_PATH_SUFFIXES / WEAKENING_EXACT_PATHS (TLS
// verification off, private-network SSRF, SSH host keys, exec security/ask,
// elevated exec, fs outside the workspace, log redaction off, unsigned
// webhooks, the HPC gate in observe mode, ...). They live in the user-writable
// config, so under the compromised-host premise each one is a one-line
// downgrade an attacker at the runtime uid can make.
//
// In the enclaved flavor the gateway refuses to start (and a config reload is
// refused) while any of them is set, unless the admin policy (root-owned
// /etc/enclawed/policy.json or an org-signed document, see
// src/enclawed/admin-policy.ts) allows that exact flag:
//
//   "allow": {
//     "dangerousConfigFlags": ["gateway.controlUi.allowInsecureAuth"],
//     "gatewayAuthNone": true
//   }
//
// Every refusal is written to stderr and, when the runtime is bootstrapped,
// to the audit log. The open flavor keeps upstream behavior (the flags are
// listed by the startup log and `enclawed security audit`).

import type { EnclawedConfig } from "../config/types.enclawed.js";
import { adminAllowsDangerousFlag, adminAllowsGatewayAuthNone } from "../enclawed/admin-policy.js";
import { getFlavor } from "../enclawed/flavor.js";
import { getRuntime } from "../enclawed/runtime.js";
import { collectEnabledInsecureOrDangerousFlags } from "./dangerous-config-flags.js";

// Generic key shapes for boolean escape hatches anywhere in the config tree
// (sandbox docker, browser SSRF, channel name matching, ...).
const ESCAPE_HATCH_KEY = /^(dangerously[A-Z]\w*|allowInsecure\w*|allowUnsafe\w*)$/;

type WeakeningValue = string | boolean;

/**
 * Weakening settings whose key name does not match ESCAPE_HATCH_KEY (settings
 * audit X3). Matched by key name anywhere in the tree, with the exact
 * weakening value; the safe value and an absent key are never refused.
 */
const WEAKENING_KEYS: ReadonlyMap<string, WeakeningValue> = new Map<string, WeakeningValue>([
  // TLS certificate verification off (models.providers.*, tools.media.*, proxies).
  ["insecureSkipVerify", true],
  // SSRF to RFC 1918 / CGNAT / benchmark ranges (providers, plugins, web fetch).
  ["allowPrivateNetwork", true],
  ["allowRfc2544BenchmarkRange", true],
  // Any SSH host key accepted for the sandbox (MITM).
  ["strictHostKeyChecking", false],
  // Unsigned webhooks accepted (voice-call and any plugin using the same name).
  ["skipSignatureVerification", true],
  ["allowNgrokFreeTierLoopbackBypass", true],
  ["trustForwardingHeaders", true],
  // Client IP from x-real-ip (spoofing past rate limits and allowlists).
  ["allowRealIpFallback", true],
  // memory-wiki reading memory-core private paths; diffs remote viewer.
  ["allowPrivateMemoryCoreAccess", true],
  ["allowRemoteViewer", true],
]);

/**
 * Weakening settings matched by the end of their path, so the per-agent
 * copies (`agents.list[i].tools.exec.security`, ...) are refused as well.
 */
const WEAKENING_PATH_SUFFIXES: ReadonlyArray<readonly [string, WeakeningValue]> = [
  ["tools.exec.security", "full"],
  ["tools.exec.ask", "off"],
  ["tools.exec.askFallback", "full"],
  ["tools.exec.strictInlineEval", false],
  ["tools.elevated.enabled", true],
  ["tools.fs.workspaceOnly", false],
];

/** Weakening settings at one exact path from the config root. */
const WEAKENING_EXACT_PATHS: ReadonlyArray<readonly [string, WeakeningValue]> = [
  ["logging.redactSensitive", "off"],
  ["enclawed.hpc.enforce", false],
  // Unlimited password guesses from every local user (settings audit #22).
  ["gateway.auth.rateLimit.exemptLoopback", true],
];

/** Drop array indices so `agents.list[3].tools.exec.ask` ends in `tools.exec.ask`. */
function pathWithoutIndices(path: string): string {
  return path.replace(/\[\d+\]/g, "");
}

function isWeakeningSetting(key: string, path: string, value: unknown): boolean {
  if (WEAKENING_KEYS.has(key) && Object.is(WEAKENING_KEYS.get(key), value)) {
    return true;
  }
  const bare = pathWithoutIndices(path);
  for (const [suffix, bad] of WEAKENING_PATH_SUFFIXES) {
    if ((bare === suffix || bare.endsWith(`.${suffix}`)) && Object.is(bad, value)) {
      return true;
    }
  }
  for (const [exact, bad] of WEAKENING_EXACT_PATHS) {
    if (bare === exact && Object.is(bad, value)) {
      return true;
    }
  }
  return false;
}

function renderValue(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

function walkEscapeHatches(node: unknown, path: string, out: Set<string>, depth: number): void {
  if (depth > 32 || node === null || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, index) => walkEscapeHatches(child, `${path}[${index}]`, out, depth + 1));
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    if (value === true && ESCAPE_HATCH_KEY.test(key)) {
      out.add(`${childPath}=true`);
      continue;
    }
    if (isWeakeningSetting(key, childPath, value)) {
      out.add(`${childPath}=${renderValue(value)}`);
      continue;
    }
    walkEscapeHatches(value, childPath, out, depth + 1);
  }
}

/**
 * Every escape hatch set in `cfg`, rendered as `path=value` (sorted). Combines
 * the curated list (including plugin-declared dangerous flags) with a generic
 * walk for `dangerously*` / `allowInsecure*` / `allowUnsafe*` keys set to true.
 */
export function collectConfigEscapeHatches(cfg: EnclawedConfig): string[] {
  const out = new Set<string>(collectEnabledInsecureOrDangerousFlags(cfg));
  walkEscapeHatches(cfg, "", out, 0);
  return [...out].toSorted();
}

/** The admin allow-list key for a rendered flag: its path without `=value`. */
export function escapeHatchKey(rendered: string): string {
  const eq = rendered.indexOf("=");
  return eq === -1 ? rendered : rendered.slice(0, eq);
}

export type EscapeHatchRefusal = Readonly<{ flag: string; reason: string }>;

/**
 * Escape hatches the enclaved flavor refuses for this config (empty in the
 * open flavor, or when the admin policy allows each one).
 */
export function findRefusedEscapeHatches(
  cfg: EnclawedConfig,
  opts: { authMode?: string; flavor?: "open" | "enclaved" } = {},
): EscapeHatchRefusal[] {
  const flavor = opts.flavor ?? getRuntime()?.flavor ?? getFlavor();
  if (flavor !== "enclaved") {
    return [];
  }
  const refused: EscapeHatchRefusal[] = [];
  for (const flag of collectConfigEscapeHatches(cfg)) {
    if (!adminAllowsDangerousFlag(escapeHatchKey(flag))) {
      refused.push({
        flag,
        reason: "escape-hatch flags are admin-only in the enclaved flavor",
      });
    }
  }
  const authMode = opts.authMode ?? cfg.gateway?.auth?.mode;
  if (authMode === "none" && !adminAllowsGatewayAuthNone()) {
    refused.push({
      flag: "gateway.auth.mode=none",
      reason: "an unauthenticated gateway is admin-only in the enclaved flavor",
    });
  }
  return refused;
}

export class EnclavedEscapeHatchError extends Error {
  override name = "EnclavedEscapeHatchError";
  readonly refused: ReadonlyArray<EscapeHatchRefusal>;
  constructor(refused: ReadonlyArray<EscapeHatchRefusal>, context: string) {
    super(
      `enclaved flavor: refusing ${context}: ${refused.map((r) => r.flag).join(", ")} ` +
        "(remove the setting, or allow it in the admin policy /etc/enclawed/policy.json " +
        'under "allow.dangerousConfigFlags" / "allow.gatewayAuthNone")',
    );
    this.refused = refused;
  }
}

/**
 * Throw EnclavedEscapeHatchError when the enclaved flavor refuses any escape
 * hatch in `cfg`. Each refusal goes to stderr and to the audit log.
 */
export function assertEnclavedEscapeHatchesAllowed(
  cfg: EnclawedConfig,
  opts: { authMode?: string; context?: string; flavor?: "open" | "enclaved" } = {},
): void {
  const refused = findRefusedEscapeHatches(cfg, opts);
  if (refused.length === 0) {
    return;
  }
  const context = opts.context ?? "gateway start";
  for (const r of refused) {
    process.stderr.write(`enclawed: refused ${r.flag} (${context}): ${r.reason}\n`);
  }
  const audit = getRuntime()?.audit;
  if (audit) {
    void audit
      .append({
        type: "enclawed.escape-hatch.refused",
        actor: "process",
        level: null,
        payload: { context, refused: refused.map((r) => r.flag) },
      })
      .catch(() => {});
  }
  throw new EnclavedEscapeHatchError(refused, context);
}
