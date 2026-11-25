export declare const DEFAULT_TOOL_CALL_APPROVAL_TIMEOUT_MS = 120000;
export type ToolCallApprovalRequest = {
    pluginId?: string;
    title: string;
    description: string;
    severity?: "info" | "warning" | "critical";
    timeoutMs?: number;
    toolName: string;
    toolCallId?: string;
    agentId?: string;
    sessionKey?: string;
    signal?: AbortSignal;
};
export type ToolCallApprovalWait = {
    kind: "decision";
    decision: "allow-once" | "allow-always" | "deny" | "timeout";
}
/** The gateway accepted no request (no id came back). */
 | {
    kind: "request-failed";
}
/** No approval client can answer (the gateway returned a null decision). */
 | {
    kind: "no-route";
}
/** The agent run was aborted while waiting. */
 | {
    kind: "aborted";
    error: unknown;
}
/** The gateway could not be reached or failed. */
 | {
    kind: "error";
    error: unknown;
};
export type ToolCallApprover = (req: ToolCallApprovalRequest) => Promise<ToolCallApprovalWait>;
export declare function runWithToolCallApprover<T>(approver: ToolCallApprover, run: () => T): T;
export declare function requestToolCallApproval(req: ToolCallApprovalRequest): Promise<ToolCallApprovalWait>;
