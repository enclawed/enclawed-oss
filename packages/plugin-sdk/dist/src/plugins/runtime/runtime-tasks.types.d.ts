import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { TaskDeliveryState } from "../../tasks/task-registry.types.js";
import type { EnclawedPluginToolContext } from "../tool-types.js";
import type { PluginRuntimeTaskFlow } from "./runtime-taskflow.types.js";
import type { TaskFlowDetail, TaskFlowView, TaskRunAggregateSummary, TaskRunCancelResult, TaskRunDetail, TaskRunView } from "./task-domain-types.js";
export type { TaskFlowDetail, TaskFlowView, TaskRunAggregateSummary, TaskRunCancelResult, TaskRunDetail, TaskRunView, } from "./task-domain-types.js";
export type BoundTaskRunsRuntime = {
    readonly sessionKey: string;
    readonly requesterOrigin?: TaskDeliveryState["requesterOrigin"];
    get: (taskId: string) => TaskRunDetail | undefined;
    list: () => TaskRunView[];
    findLatest: () => TaskRunDetail | undefined;
    resolve: (token: string) => TaskRunDetail | undefined;
    cancel: (params: {
        taskId: string;
        cfg: EnclawedConfig;
    }) => Promise<TaskRunCancelResult>;
};
export type PluginRuntimeTaskRuns = {
    bindSession: (params: {
        sessionKey: string;
        requesterOrigin?: TaskDeliveryState["requesterOrigin"];
    }) => BoundTaskRunsRuntime;
    fromToolContext: (ctx: Pick<EnclawedPluginToolContext, "sessionKey" | "deliveryContext">) => BoundTaskRunsRuntime;
};
export type BoundTaskFlowsRuntime = {
    readonly sessionKey: string;
    readonly requesterOrigin?: TaskDeliveryState["requesterOrigin"];
    get: (flowId: string) => TaskFlowDetail | undefined;
    list: () => TaskFlowView[];
    findLatest: () => TaskFlowDetail | undefined;
    resolve: (token: string) => TaskFlowDetail | undefined;
    getTaskSummary: (flowId: string) => TaskRunAggregateSummary | undefined;
};
export type PluginRuntimeTaskFlows = {
    bindSession: (params: {
        sessionKey: string;
        requesterOrigin?: TaskDeliveryState["requesterOrigin"];
    }) => BoundTaskFlowsRuntime;
    fromToolContext: (ctx: Pick<EnclawedPluginToolContext, "sessionKey" | "deliveryContext">) => BoundTaskFlowsRuntime;
};
export type PluginRuntimeTasks = {
    runs: PluginRuntimeTaskRuns;
    flows: PluginRuntimeTaskFlows;
    /** @deprecated Use runtime.tasks.flows for DTO-based TaskFlow access. */
    flow: PluginRuntimeTaskFlow;
    /**
     * Session-bound managed TaskFlow access used by plugins that bind a flow to
     * a host session (for example webhook-triggered flows).
     */
    managedFlows: PluginRuntimeTaskFlow;
};
