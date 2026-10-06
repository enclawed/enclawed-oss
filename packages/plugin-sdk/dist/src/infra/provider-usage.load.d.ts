import { type EnclawedConfig } from "../config/config.js";
import { type ProviderAuth } from "./provider-usage.auth.js";
import type { UsageProviderId, UsageSummary } from "./provider-usage.types.js";
type UsageSummaryOptions = {
    now?: number;
    timeoutMs?: number;
    providers?: UsageProviderId[];
    auth?: ProviderAuth[];
    agentDir?: string;
    workspaceDir?: string;
    config?: EnclawedConfig;
    env?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
};
export declare function loadProviderUsageSummary(opts?: UsageSummaryOptions): Promise<UsageSummary>;
export {};
