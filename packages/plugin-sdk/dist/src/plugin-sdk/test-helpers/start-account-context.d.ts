import type { ChannelGatewayContext } from "../../channels/plugins/types.adapters.js";
import type { ChannelAccountSnapshot } from "../../channels/plugins/types.core.js";
import type { RuntimeEnv } from "../../runtime.js";
import type { EnclawedConfig } from "../config-types.js";
export declare function createStartAccountContext<TAccount extends {
    accountId: string;
}>(params: {
    account: TAccount;
    abortSignal?: AbortSignal;
    cfg?: EnclawedConfig;
    runtime?: RuntimeEnv;
    statusPatchSink?: (next: ChannelAccountSnapshot) => void;
}): ChannelGatewayContext<TAccount>;
