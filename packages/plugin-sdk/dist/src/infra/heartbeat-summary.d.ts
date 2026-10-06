import type { AgentDefaultsConfig } from "../config/types.agent-defaults.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
type HeartbeatConfig = AgentDefaultsConfig["heartbeat"];
export type HeartbeatSummary = {
    enabled: boolean;
    every: string;
    everyMs: number | null;
    prompt: string;
    target: string;
    model?: string;
    ackMaxChars: number;
};
export declare function isHeartbeatEnabledForAgent(cfg: EnclawedConfig, agentId?: string): boolean;
export declare function resolveHeartbeatIntervalMs(cfg: EnclawedConfig, overrideEvery?: string, heartbeat?: HeartbeatConfig): number | null;
export declare function resolveHeartbeatSummaryForAgent(cfg: EnclawedConfig, agentId?: string): HeartbeatSummary;
export {};
