import type { AgentAcpBinding, AgentBinding, AgentRouteBinding } from "./types.agents.js";
import type { EnclawedConfig } from "./types.enclawed.js";
export type ConfiguredBindingRule = AgentBinding;
export declare function isRouteBinding(binding: AgentBinding): binding is AgentRouteBinding;
export declare function isAcpBinding(binding: AgentBinding): binding is AgentAcpBinding;
export declare function listConfiguredBindings(cfg: EnclawedConfig): AgentBinding[];
export declare function listRouteBindings(cfg: EnclawedConfig): AgentRouteBinding[];
export declare function listAcpBindings(cfg: EnclawedConfig): AgentAcpBinding[];
