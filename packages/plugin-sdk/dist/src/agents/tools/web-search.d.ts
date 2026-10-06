import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { RuntimeWebSearchMetadata } from "../../secrets/runtime-web-tools.types.js";
import { resolveWebSearchProviderId } from "../../web-search/runtime.js";
import type { AnyAgentTool } from "./common.js";
export declare function createWebSearchTool(options?: {
    config?: EnclawedConfig;
    sandboxed?: boolean;
    runtimeWebSearch?: RuntimeWebSearchMetadata;
}): AnyAgentTool | null;
export declare const __testing: {
    SEARCH_CACHE: Map<string, import("./web-shared.ts").CacheEntry<Record<string, unknown>>>;
    resolveSearchProvider: (search?: Parameters<typeof resolveWebSearchProviderId>[0]["search"]) => string;
};
