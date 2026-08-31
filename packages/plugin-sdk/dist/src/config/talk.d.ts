import type { EnclawedConfig } from "./types.enclawed.js";
import type { ResolvedTalkConfig, TalkConfig, TalkConfigResponse } from "./types.gateway.js";
export declare function normalizeTalkSection(value: TalkConfig | undefined): TalkConfig | undefined;
export declare function normalizeTalkConfig(config: EnclawedConfig): EnclawedConfig;
export declare function resolveActiveTalkProviderConfig(talk: TalkConfig | undefined): ResolvedTalkConfig | undefined;
export declare function buildTalkConfigResponse(value: unknown): TalkConfigResponse | undefined;
