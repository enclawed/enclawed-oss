// Security-stage plugins: a plugin whose manifest declares `securityStage`
// (or that a security profile enables by default) is never skipped on error.
import type { PluginRegistry } from "./registry-types.js";

/**
 * A security-stage plugin (manifest `securityStage`, or one a security profile
 * enables by default) failed validation, load or registration. Skipping it
 * would leave the gateway running without that defense, so start is refused.
 */
export class PluginSecurityStageError extends Error {
  readonly pluginIds: string[];

  constructor(failed: ReadonlyArray<{ id: string; error?: string }>) {
    const summary = failed
      .map((entry) => `${entry.id}: ${entry.error ?? "unknown plugin load error"}`)
      .join("; ");
    super(
      `refusing to start: security plugin(s) failed to load (${summary}). ` +
        "Fix plugins.entries.<id>.config (see `enclawed config validate`) or the plugin install; " +
        "a security stage is never skipped.",
    );
    this.name = "PluginSecurityStageError";
    this.pluginIds = failed.map((entry) => entry.id);
  }
}

/** Throws {@link PluginSecurityStageError} when any security-stage plugin is in error. */
export function assertSecurityStagePluginsLoaded(registry: PluginRegistry): void {
  const failed = registry.plugins.filter(
    (entry) => entry.securityStage === true && entry.status === "error",
  );
  if (failed.length > 0) {
    throw new PluginSecurityStageError(failed);
  }
}
