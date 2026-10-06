import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function resolveInboundSessionEnvelopeContext(params: {
    cfg: EnclawedConfig;
    agentId: string;
    sessionKey: string;
}): {
    storePath: string;
    envelopeOptions: import("../auto-reply/envelope.js").EnvelopeFormatOptions;
    previousTimestamp: number | undefined;
};
