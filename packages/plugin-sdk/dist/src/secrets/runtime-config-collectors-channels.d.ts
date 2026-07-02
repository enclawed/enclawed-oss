import type { EnclawedConfig } from "../config/types.enclawed.js";
import { type ResolverContext, type SecretDefaults } from "./runtime-shared.js";
export declare function collectChannelConfigAssignments(params: {
    config: EnclawedConfig;
    defaults: SecretDefaults | undefined;
    context: ResolverContext;
}): void;
