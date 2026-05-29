import type { EnclawedConfig } from "../../config/types.enclawed.js";
type CommandSurfaceParams = {
    ctx: {
        OriginatingChannel?: string;
        Surface?: string;
        Provider?: string;
        AccountId?: string;
    };
    command: {
        channel?: string;
    };
};
type ChannelAccountParams = {
    cfg: EnclawedConfig;
    ctx: {
        OriginatingChannel?: string;
        Surface?: string;
        Provider?: string;
        AccountId?: string;
    };
    command: {
        channel?: string;
    };
};
export declare function resolveCommandSurfaceChannel(params: CommandSurfaceParams): string;
export declare function resolveChannelAccountId(params: ChannelAccountParams): string;
export {};
