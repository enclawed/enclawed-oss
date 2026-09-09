import type { EnclawedConfig } from "../config/types.enclawed.js";
import { type ResolverContext, type SecretDefaults } from "./runtime-shared.js";
export declare function collectCoreConfigAssignments(params: {
    config: EnclawedConfig;
    defaults: SecretDefaults | undefined;
    context: ResolverContext;
}): void;
