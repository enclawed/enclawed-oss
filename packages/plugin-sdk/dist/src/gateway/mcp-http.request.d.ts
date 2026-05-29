import type { IncomingMessage, ServerResponse } from "node:http";
import type { EnclawedConfig } from "../config/types.enclawed.js";
export type McpRequestContext = {
    sessionKey: string;
    messageProvider: string | undefined;
    accountId: string | undefined;
    senderIsOwner: boolean | undefined;
};
export declare function validateMcpLoopbackRequest(params: {
    req: IncomingMessage;
    res: ServerResponse;
    token: string;
}): boolean;
export declare function readMcpHttpBody(req: IncomingMessage): Promise<string>;
export declare function resolveMcpRequestContext(req: IncomingMessage, cfg: EnclawedConfig): McpRequestContext;
