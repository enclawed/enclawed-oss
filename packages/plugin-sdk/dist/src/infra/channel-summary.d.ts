import { type EnclawedConfig } from "../config/config.js";
export type ChannelSummaryOptions = {
    colorize?: boolean;
    includeAllowFrom?: boolean;
    sourceConfig?: EnclawedConfig;
};
export declare function buildChannelSummary(cfg?: EnclawedConfig, options?: ChannelSummaryOptions): Promise<string[]>;
