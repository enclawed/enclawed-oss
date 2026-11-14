import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { AgentRuntimeAuthPlan } from "./types.js";
export declare function buildAgentRuntimeAuthPlan(params: {
    provider: string;
    authProfileProvider?: string;
    sessionAuthProfileId?: string;
    config?: EnclawedConfig;
    workspaceDir?: string;
    harnessId?: string;
    harnessRuntime?: string;
    allowHarnessAuthProfileForwarding?: boolean;
}): AgentRuntimeAuthPlan;
