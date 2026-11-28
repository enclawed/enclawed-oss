// Security stages in an enforcing profile (settings audit X2).
//
// A security stage is a plugin whose manifest declares `securityStage` (or
// that a security profile enables by default; see
// resolveManifestSecurityStage). Its enable flag and its mode are not user
// settings: they may only be tightened.
//
//   required   the stage is enabled by default in the active profile
//              (manifest `enabledByDefault`, or the active flavor listed in
//              `enabledByDefaultInFlavors`).
//   enforcing  the enclaved flavor, or any profile where the stage is
//              required.
//
// In an enforcing profile the gateway refuses to start (and a config reload
// is refused) when
//   - a required stage is switched off: `plugins.entries.<id>.enabled=false`,
//     `plugins.enabled=false`, `plugins.deny`, or a `plugins.allow` list that
//     leaves it out;
//   - an enabled stage's own config sets `enabled: false`, or a `mode` of
//     "audit" or "off" (the egress mode vocabulary; a stage that uses `mode`
//     for something else, such as the cover-traffic schedule, is unaffected);
//   - a stage the profile runs (required, or enabled in the enclaved flavor)
//     was refused by plugin admission (unsigned or tampered manifest): it
//     would otherwise vanish from the registry without a trace;
//   - a required stage is not loaded after plugin loading.
//
// A stage that is optional in the profile and left off is at its default, so
// it is never refused. The open flavor keeps every optional stage optional.

import type { EnclawedConfig } from "../config/types.enclawed.js";
import { getFlavor } from "../enclawed/flavor.js";
import { getRuntime } from "../enclawed/runtime.js";
import {
  createPluginActivationSource,
  normalizePluginsConfig,
  resolveEffectivePluginActivationState,
} from "./config-state.js";
import {
  loadPluginManifestRegistry,
  type PluginManifestRecord,
  type RefusedSecurityStage,
} from "./manifest-registry.js";
import type { PluginRegistry } from "./registry-types.js";

export type SecurityStageManifest = Pick<
  PluginManifestRecord,
  "id" | "origin" | "securityStage" | "enabledByDefault"
>;

export type SecurityStageWeakening = Readonly<{
  pluginId: string;
  /** What weakens the stage, as a config path and value or a short cause. */
  setting: string;
}>;

/** Modes below enforce, in the egress stage vocabulary. */
const NON_ENFORCING_MODES: ReadonlySet<string> = new Set(["audit", "off"]);

function activeFlavor(): "open" | "enclaved" {
  return getRuntime()?.flavor ?? getFlavor();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Why the activation state switched a plugin off, as the setting that did it. */
function describeDisable(pluginId: string, reason: string | undefined): string {
  switch (reason) {
    case "disabled in config":
      return `plugins.entries.${pluginId}.enabled=false`;
    case "plugins disabled":
      return "plugins.enabled=false";
    case "blocked by denylist":
      return `plugins.deny contains ${pluginId}`;
    case "not in allowlist":
      return `plugins.allow leaves out ${pluginId}`;
    default:
      return `switched off (${reason ?? "unknown reason"})`;
  }
}

export type SecurityStageProfile = Readonly<{
  flavor: "open" | "enclaved";
  /** Stages the active profile enables by default (they must load). */
  requiredIds: ReadonlyArray<string>;
  weakenings: ReadonlyArray<SecurityStageWeakening>;
}>;

/**
 * Evaluate the security stages in `manifests` against `config`. Pure apart
 * from the flavor lookup (pass `flavor` to pin it).
 */
export function evaluateSecurityStages(params: {
  config: EnclawedConfig;
  manifests: ReadonlyArray<SecurityStageManifest>;
  /** Security stages plugin admission refused (see PluginManifestRegistry). */
  refused?: ReadonlyArray<RefusedSecurityStage>;
  activationSourceConfig?: EnclawedConfig;
  flavor?: "open" | "enclaved";
}): SecurityStageProfile {
  const flavor = params.flavor ?? activeFlavor();
  const plugins = normalizePluginsConfig(params.config.plugins);
  const activationSource = createPluginActivationSource({
    config: params.activationSourceConfig ?? params.config,
  });
  const requiredIds: string[] = [];
  const weakenings: SecurityStageWeakening[] = [];
  for (const manifest of params.manifests) {
    if (manifest.securityStage !== true) {
      continue;
    }
    const required = manifest.enabledByDefault === true;
    if (flavor !== "enclaved" && !required) {
      continue;
    }
    const activation = resolveEffectivePluginActivationState({
      id: manifest.id,
      origin: manifest.origin,
      config: plugins,
      rootConfig: params.config,
      enabledByDefault: manifest.enabledByDefault,
      activationSource,
    });
    if (!activation.enabled) {
      if (required) {
        weakenings.push({
          pluginId: manifest.id,
          setting: describeDisable(manifest.id, activation.reason),
        });
      }
      continue;
    }
    if (required) {
      requiredIds.push(manifest.id);
    }
    const stageConfig = plugins.entries[manifest.id]?.config;
    if (!isRecord(stageConfig)) {
      continue;
    }
    if (stageConfig.enabled === false) {
      weakenings.push({
        pluginId: manifest.id,
        setting: `plugins.entries.${manifest.id}.config.enabled=false`,
      });
    }
    const mode = stageConfig.mode;
    if (typeof mode === "string" && NON_ENFORCING_MODES.has(mode.trim().toLowerCase())) {
      weakenings.push({
        pluginId: manifest.id,
        setting: `plugins.entries.${manifest.id}.config.mode=${mode}`,
      });
    }
  }
  for (const stage of params.refused ?? []) {
    const required = stage.enabledByDefault === true;
    if (flavor !== "enclaved" && !required) {
      continue;
    }
    const activation = resolveEffectivePluginActivationState({
      id: stage.id,
      origin: stage.origin,
      config: plugins,
      rootConfig: params.config,
      enabledByDefault: stage.enabledByDefault,
      activationSource,
    });
    // Switched off: a required one is already reported above (its manifest
    // is not in `manifests`, so report it here), an optional one is at its
    // default.
    if (!activation.enabled && !required) {
      continue;
    }
    weakenings.push({
      pluginId: stage.id,
      setting: activation.enabled
        ? `${stage.id} refused by plugin admission (${stage.reason})`
        : describeDisable(stage.id, activation.reason),
    });
  }
  return { flavor, requiredIds, weakenings };
}

/** A security stage is switched off or weakened in an enforcing profile. */
export class SecurityStageWeakenedError extends Error {
  override name = "SecurityStageWeakenedError";
  readonly weakenings: ReadonlyArray<SecurityStageWeakening>;

  constructor(weakenings: ReadonlyArray<SecurityStageWeakening>, context: string) {
    super(
      `refusing ${context}: security stage(s) switched off or weakened: ` +
        weakenings.map((w) => w.setting).join("; ") +
        ". A security stage is not a user setting: its enable flag and mode can only be " +
        "tightened in this profile. Remove the setting(s).",
    );
    this.weakenings = weakenings;
  }
}

/**
 * Throw SecurityStageWeakenedError when a security stage is switched off or
 * weakened in an enforcing profile. Returns the profile so the caller can
 * check that every required stage loaded.
 */
export function assertSecurityStagesEnforced(params: {
  config: EnclawedConfig;
  activationSourceConfig?: EnclawedConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  context?: string;
  manifests?: ReadonlyArray<SecurityStageManifest>;
  refused?: ReadonlyArray<RefusedSecurityStage>;
  flavor?: "open" | "enclaved";
}): SecurityStageProfile {
  const registry = params.manifests
    ? { plugins: params.manifests, refusedSecurityStages: params.refused }
    : loadPluginManifestRegistry({
        config: params.config,
        workspaceDir: params.workspaceDir,
        env: params.env ?? process.env,
      });
  const profile = evaluateSecurityStages({
    config: params.config,
    activationSourceConfig: params.activationSourceConfig,
    manifests: registry.plugins,
    refused: registry.refusedSecurityStages,
    flavor: params.flavor,
  });
  if (profile.weakenings.length > 0) {
    throw new SecurityStageWeakenedError(profile.weakenings, params.context ?? "gateway start");
  }
  return profile;
}

/**
 * Throw SecurityStageWeakenedError when a stage the profile requires is not
 * among `pluginIds` (the ids about to load) or did not load.
 */
export function assertRequiredSecurityStagesLoaded(
  requiredIds: ReadonlyArray<string>,
  loaded: { pluginIds: ReadonlyArray<string> } | { registry: PluginRegistry },
): void {
  const missing: SecurityStageWeakening[] = [];
  for (const id of requiredIds) {
    if ("pluginIds" in loaded) {
      if (!loaded.pluginIds.includes(id)) {
        missing.push({ pluginId: id, setting: `${id} is not in the gateway startup plugin set` });
      }
      continue;
    }
    const record = loaded.registry.plugins.find((entry) => entry.id === id);
    if (!record || record.status !== "loaded") {
      missing.push({
        pluginId: id,
        setting: `${id} did not load (${record ? record.status : "absent"})`,
      });
    }
  }
  if (missing.length > 0) {
    throw new SecurityStageWeakenedError(missing, "gateway start");
  }
}
