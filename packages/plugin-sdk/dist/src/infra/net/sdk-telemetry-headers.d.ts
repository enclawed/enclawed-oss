/**
 * Outbound request hygiene for provider SDK telemetry.
 *
 * Stainless-generated SDKs (`openai`, `@anthropic-ai/sdk`, and the SDKs pi-ai
 * bundles) add `X-Stainless-*` headers to every request: OS, CPU
 * architecture, runtime and runtime version, SDK language and package
 * version, retry count, timeout, and helper method. They also send a
 * `User-Agent: <Client>/JS <sdk-version>`. None of this is needed for a
 * request to succeed; it fingerprints the host and the client stack to every
 * provider. Enclawed removes the `X-Stainless-*` headers and drops the SDK
 * version from that User-Agent before a request leaves the process.
 *
 * Everything else is left exactly as the caller built it (a provider that
 * requires a specific User-Agent, such as GitHub Copilot or Anthropic OAuth,
 * keeps it).
 */
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
/** Whether a header name is SDK telemetry Enclawed never sends. */
export declare function isSdkTelemetryHeaderName(name: string): boolean;
/**
 * The User-Agent to send instead of `value`: a Stainless SDK User-Agent
 * without its version (`OpenAI/JS 6.35.0` -> `OpenAI/JS`); any other value
 * unchanged.
 */
export declare function neutralizeSdkUserAgent(value: string): string;
/**
 * `headers` without SDK telemetry, in the same form it was given (Headers,
 * array of pairs or record). Returns the input itself when there is nothing
 * to remove.
 */
export declare function stripSdkTelemetryHeaders(headers: HeadersInit): HeadersInit;
export declare function stripSdkTelemetryHeaders(headers: HeadersInit | undefined): HeadersInit | undefined;
/** `init` with SDK telemetry removed from its headers (the same object when unchanged). */
export declare function stripSdkTelemetryFromRequestInit<T extends RequestInit>(init: T): T;
export declare function stripSdkTelemetryFromRequestInit<T extends RequestInit>(init: T | undefined): T | undefined;
/**
 * A fetch that removes SDK telemetry from every request before handing it to
 * `fetchImpl` (or, when omitted, to `globalThis.fetch` as it is at call
 * time). Idempotent: wrapping an already-filtered fetch returns it.
 */
export declare function withoutSdkTelemetryHeaders(fetchImpl?: FetchLike): typeof fetch;
export {};
