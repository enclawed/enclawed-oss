import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { type LookupFn } from "../../infra/net/ssrf.js";
import type { RuntimeWebFetchMetadata } from "../../secrets/runtime-web-tools.types.js";
import type { AnyAgentTool } from "./common.js";
export { extractReadableContent } from "./web-fetch-utils.js";
export declare function createWebFetchTool(options?: {
    config?: EnclawedConfig;
    sandboxed?: boolean;
    runtimeWebFetch?: RuntimeWebFetchMetadata;
    lookupFn?: LookupFn;
}): AnyAgentTool | null;
