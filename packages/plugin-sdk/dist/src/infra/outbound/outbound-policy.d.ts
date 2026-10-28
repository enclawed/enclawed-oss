import type { ChannelId, ChannelMessageActionName, ChannelThreadingToolContext } from "../../channels/plugins/types.public.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { type CrossContextComponentsBuilder } from "./channel-adapters.js";
export type CrossContextDecoration = {
    prefix: string;
    suffix: string;
    componentsBuilder?: CrossContextComponentsBuilder;
};
export declare function enforceCrossContextPolicy(params: {
    channel: ChannelId;
    action: ChannelMessageActionName;
    args: Record<string, unknown>;
    toolContext?: ChannelThreadingToolContext;
    cfg: EnclawedConfig;
}): void;
export declare function buildCrossContextDecoration(params: {
    cfg: EnclawedConfig;
    channel: ChannelId;
    target: string;
    toolContext?: ChannelThreadingToolContext;
    accountId?: string | null;
}): Promise<CrossContextDecoration | null>;
export declare function shouldApplyCrossContextMarker(action: ChannelMessageActionName): boolean;
export declare function applyCrossContextDecoration(params: {
    message: string;
    decoration: CrossContextDecoration;
    preferComponents: boolean;
}): {
    message: string;
    componentsBuilder?: CrossContextComponentsBuilder;
    usedComponents: boolean;
};
