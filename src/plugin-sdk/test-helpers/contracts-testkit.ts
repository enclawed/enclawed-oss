import type { EnclawedPluginApi } from "../plugin-entry.js";
import { createPluginRecord } from "../../plugins/status.test-helpers.js";
import { createPluginRegistry } from "../../plugins/registry.js";
import {
  registerProviderPlugins as registerProviders,
  requireRegisteredProvider as requireProvider,
} from "../../test-utils/plugin-registration.js";
import type { EnclawedConfig } from "../config-types.js";
import type { PluginRecord } from "../../plugins/registry-types.js";
import type { PluginRuntime } from "../../plugins/runtime/types.js";
export { assertNoImportTimeSideEffects } from "./import-side-effects.js";
import { uniqueSortedStrings } from "./string-utils.js";

export { registerProviders, requireProvider, uniqueSortedStrings };

export function createPluginRegistryFixture(config = {} as EnclawedConfig) {
  return {
    config,
    registry: createPluginRegistry({
      logger: {
        info() {},
        warn() {},
        error() {},
        debug() {},
      },
      runtime: {} as PluginRuntime,
    }),
  };
}

export function registerTestPlugin(params: {
  registry: ReturnType<typeof createPluginRegistry>;
  config: EnclawedConfig;
  record: PluginRecord;
  register(api: EnclawedPluginApi): void;
}) {
  params.registry.registry.plugins.push(params.record);
  params.register(
    params.registry.createApi(params.record, {
      config: params.config,
    }),
  );
}

export function registerVirtualTestPlugin(params: {
  registry: ReturnType<typeof createPluginRegistry>;
  config: EnclawedConfig;
  id: string;
  name: string;
  source?: string;
  kind?: PluginRecord["kind"];
  contracts?: PluginRecord["contracts"];
  register(this: void, api: EnclawedPluginApi): void;
}) {
  registerTestPlugin({
    registry: params.registry,
    config: params.config,
    record: createPluginRecord({
      id: params.id,
      name: params.name,
      source: params.source ?? `/virtual/${params.id}/index.ts`,
      ...(params.kind ? { kind: params.kind } : {}),
      ...(params.contracts ? { contracts: params.contracts } : {}),
    }),
    register: params.register,
  });
}
