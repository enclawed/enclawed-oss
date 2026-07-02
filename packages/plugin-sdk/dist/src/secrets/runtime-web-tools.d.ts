import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { ResolverContext } from "./runtime-shared.js";
import type { RuntimeWebDiagnostic, RuntimeWebDiagnosticCode, RuntimeWebFetchMetadata, RuntimeWebSearchMetadata, RuntimeWebToolsMetadata } from "./runtime-web-tools.types.js";
export type { RuntimeWebDiagnostic, RuntimeWebDiagnosticCode, RuntimeWebFetchMetadata, RuntimeWebSearchMetadata, RuntimeWebToolsMetadata, };
export declare function resolveRuntimeWebTools(params: {
    sourceConfig: EnclawedConfig;
    resolvedConfig: EnclawedConfig;
    context: ResolverContext;
}): Promise<RuntimeWebToolsMetadata>;
