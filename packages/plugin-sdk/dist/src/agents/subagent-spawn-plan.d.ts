import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function splitModelRef(ref?: string): {
    provider: undefined;
    model: undefined;
} | {
    provider: string;
    model: string;
} | {
    provider: undefined;
    model: string;
};
export declare function resolveConfiguredSubagentRunTimeoutSeconds(params: {
    cfg: EnclawedConfig;
    runTimeoutSeconds?: number;
}): number;
export declare function resolveSubagentModelAndThinkingPlan(params: {
    cfg: EnclawedConfig;
    targetAgentId: string;
    targetAgentConfig?: unknown;
    modelOverride?: string;
    thinkingOverrideRaw?: string;
}): {
    status: "error";
    resolvedModel: string;
    error: string;
    modelApplied?: undefined;
    thinkingOverride?: undefined;
    initialSessionPatch?: undefined;
} | {
    status: "ok";
    resolvedModel: string;
    modelApplied: boolean;
    thinkingOverride: import("../auto-reply/thinking.shared.ts").ThinkLevel | undefined;
    initialSessionPatch: {
        thinkingLevel?: undefined;
        model?: string | undefined;
    } | {
        thinkingLevel: "minimal" | "low" | "medium" | "high" | "xhigh" | "adaptive" | "max" | null;
        model?: string | undefined;
    };
    error?: undefined;
};
