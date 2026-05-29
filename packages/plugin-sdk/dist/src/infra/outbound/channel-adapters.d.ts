import type { ChannelId, ChannelStructuredComponents } from "../../channels/plugins/types.public.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
export type CrossContextComponentsBuilder = (message: string) => ChannelStructuredComponents;
export type CrossContextComponentsFactory = (params: {
    originLabel: string;
    message: string;
    cfg: EnclawedConfig;
    accountId?: string | null;
}) => ChannelStructuredComponents;
export type ChannelMessageAdapter = {
    supportsComponentsV2: boolean;
    buildCrossContextComponents?: CrossContextComponentsFactory;
};
export declare function getChannelMessageAdapter(channel: ChannelId): ChannelMessageAdapter;
