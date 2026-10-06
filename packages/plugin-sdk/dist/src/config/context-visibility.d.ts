import type { EnclawedConfig } from "./config.js";
import type { ContextVisibilityMode } from "./types.base.js";
export type ContextVisibilityDefaultsConfig = {
    channels?: {
        defaults?: {
            contextVisibility?: ContextVisibilityMode;
        };
    };
};
export declare function resolveDefaultContextVisibility(cfg: ContextVisibilityDefaultsConfig): ContextVisibilityMode | undefined;
export declare function resolveChannelContextVisibilityMode(params: {
    cfg: EnclawedConfig;
    channel: string;
    accountId?: string | null;
    configuredContextVisibility?: ContextVisibilityMode;
}): ContextVisibilityMode;
