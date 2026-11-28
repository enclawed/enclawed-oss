import { type LookupFn } from "../../infra/net/ssrf.js";
type ToolRequestCheck = {
    ok: true;
} | {
    ok: false;
    reason: string;
};
type ToolRequestClient = {
    check(url: string): Promise<ToolRequestCheck>;
    send(url: string): Promise<void>;
};
/** The headers every web_fetch request carries (real fetches and padding alike). */
export declare function webFetchRequestHeaders(userAgent: string): Record<string, string>;
export type WebFetchRequestSettings = {
    userAgent: string;
    maxRedirects: number;
    timeoutSeconds: number;
    allowRfc2544BenchmarkRange: boolean;
    lookupFn?: LookupFn;
};
/**
 * A real web_fetch request for `url` is about to leave: wait for its slot.
 * Resolves at once unless the egress action batcher holds this request for a
 * lockstep window; rejects when the slot expired (a substitute was already
 * sent in its place), in which case the request must not be sent.
 */
export declare function awaitWebFetchIssueSlot(url: string, callId?: string): Promise<void>;
/** Report that web_fetch is issuing a real request for `url` (no slot wait). */
export declare function notifyWebFetchIssued(url: string, callId?: string): void;
/**
 * Build web_fetch's request client. `send` must be web_fetch's own complete
 * request path for a URL (the tool passes it in), so a dummy reads, cancels
 * and falls back exactly as a real fetch does.
 */
export declare function createWebFetchRequestClient(settings: WebFetchRequestSettings, send: (url: string) => Promise<void>): ToolRequestClient;
/** Publish web_fetch's request client (each web_fetch tool build does this). */
export declare function publishWebFetchRequestClient(settings: WebFetchRequestSettings, send: (url: string) => Promise<void>): void;
export {};
