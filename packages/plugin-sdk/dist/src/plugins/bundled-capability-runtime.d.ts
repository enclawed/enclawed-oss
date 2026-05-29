import type { PluginLoadOptions } from "./loader.js";
import type { PluginRegistry } from "./registry.js";
import { type PluginSdkResolutionPreference } from "./sdk-alias.js";
/**
 * Vitest capability-runtime shim catalogue.
 *
 * Each entry redirects one `@enclawed/plugin-sdk/<subpath>` import to a
 * tiny shim file used by the capability contract tests, so Vitest does
 * not pull the full dist chunk bundle while exercising a narrow
 * surface. The catalogue is the source of truth for which subpaths get
 * shimmed under Vitest.
 *
 * G4 — runtime-parity test:
 *   The accompanying unit test (bundled-capability-runtime.shim-parity.test.ts)
 *   parses `package.json` `exports` + each `src/plugin-sdk/<subpath>.ts`
 *   file to verify every catalogue entry references a real, declared
 *   subpath. A shim that fulfilled any import name would mask runtime
 *   regressions — by validating against real exports at test-setup time,
 *   a unit test importing a now-missing symbol fails for the same
 *   reason runtime fails.
 *
 * Adding a new shim → add an entry here AND ensure the underlying
 * subpath is declared in `package.json` exports + `src/plugin-sdk/`
 * source. The parity test catches mismatches both ways.
 */
export declare const CAPABILITY_VITEST_SHIM_ALIASES: readonly [{
    readonly subpath: "llm-task";
    readonly target: URL;
}, {
    readonly subpath: "config-runtime";
    readonly target: URL;
}, {
    readonly subpath: "media-runtime";
    readonly target: URL;
}, {
    readonly subpath: "provider-onboard";
    readonly target: URL;
}, {
    readonly subpath: "speech-core";
    readonly target: URL;
}];
export declare function buildVitestCapabilityShimAliasMap(): Record<string, string>;
export declare function buildBundledCapabilityRuntimeConfig(pluginIds: readonly string[], env?: PluginLoadOptions["env"]): PluginLoadOptions["config"];
export declare function loadBundledCapabilityRuntimeRegistry(params: {
    pluginIds: readonly string[];
    env?: PluginLoadOptions["env"];
    pluginSdkResolution?: PluginSdkResolutionPreference;
}): PluginRegistry;
