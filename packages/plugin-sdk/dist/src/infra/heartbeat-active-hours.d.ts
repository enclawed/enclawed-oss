import type { AgentDefaultsConfig } from "../config/types.agent-defaults.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
type HeartbeatConfig = AgentDefaultsConfig["heartbeat"];
export declare function isWithinActiveHours(cfg: EnclawedConfig, heartbeat?: HeartbeatConfig, nowMs?: number): boolean;
export {};
