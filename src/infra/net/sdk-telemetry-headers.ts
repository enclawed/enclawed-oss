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

const SDK_TELEMETRY_HEADER_PREFIX = "x-stainless-";
// Stainless clients send `${clientClassName}/JS ${VERSION}`.
const STAINLESS_SDK_USER_AGENT = /^([A-Za-z_$][\w$]*\/JS) +\d\S*$/;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Whether a header name is SDK telemetry Enclawed never sends. */
export function isSdkTelemetryHeaderName(name: string): boolean {
  return name.trim().toLowerCase().startsWith(SDK_TELEMETRY_HEADER_PREFIX);
}

/**
 * The User-Agent to send instead of `value`: a Stainless SDK User-Agent
 * without its version (`OpenAI/JS 6.35.0` -> `OpenAI/JS`); any other value
 * unchanged.
 */
export function neutralizeSdkUserAgent(value: string): string {
  const match = STAINLESS_SDK_USER_AGENT.exec(value.trim());
  return match ? match[1] : value;
}

function isUserAgentHeaderName(name: string): boolean {
  return name.trim().toLowerCase() === "user-agent";
}

function needsRewrite(name: string, value: string): boolean {
  return (
    isSdkTelemetryHeaderName(name) ||
    (isUserAgentHeaderName(name) && neutralizeSdkUserAgent(value) !== value)
  );
}

function rewriteHeadersObject(headers: Headers): Headers | undefined {
  let changed = false;
  for (const [name, value] of headers) {
    if (needsRewrite(name, value)) {
      changed = true;
      break;
    }
  }
  if (!changed) {
    return undefined;
  }
  const next = new Headers();
  for (const [name, value] of headers) {
    if (isSdkTelemetryHeaderName(name)) {
      continue;
    }
    next.append(name, isUserAgentHeaderName(name) ? neutralizeSdkUserAgent(value) : value);
  }
  return next;
}

/**
 * `headers` without SDK telemetry, in the same form it was given (Headers,
 * array of pairs or record). Returns the input itself when there is nothing
 * to remove.
 */
export function stripSdkTelemetryHeaders(headers: HeadersInit): HeadersInit;
export function stripSdkTelemetryHeaders(headers: HeadersInit | undefined): HeadersInit | undefined;
export function stripSdkTelemetryHeaders(
  headers: HeadersInit | undefined,
): HeadersInit | undefined {
  if (headers === undefined || headers === null) {
    return headers;
  }
  if (headers instanceof Headers) {
    return rewriteHeadersObject(headers) ?? headers;
  }
  if (Array.isArray(headers)) {
    if (!headers.some(([name, value]) => needsRewrite(name, value))) {
      return headers;
    }
    return headers
      .filter(([name]) => !isSdkTelemetryHeaderName(name))
      .map(([name, value]): [string, string] => [
        name,
        isUserAgentHeaderName(name) ? neutralizeSdkUserAgent(value) : value,
      ]);
  }
  const record = headers;
  if (!Object.entries(record).some(([name, value]) => needsRewrite(name, value))) {
    return headers;
  }
  const next: Record<string, string> = {};
  for (const [name, value] of Object.entries(record)) {
    if (isSdkTelemetryHeaderName(name)) {
      continue;
    }
    next[name] =
      isUserAgentHeaderName(name) && typeof value === "string"
        ? neutralizeSdkUserAgent(value)
        : value;
  }
  return next;
}

/** `init` with SDK telemetry removed from its headers (the same object when unchanged). */
export function stripSdkTelemetryFromRequestInit<T extends RequestInit>(init: T): T;
export function stripSdkTelemetryFromRequestInit<T extends RequestInit>(
  init: T | undefined,
): T | undefined;
export function stripSdkTelemetryFromRequestInit<T extends RequestInit>(
  init: T | undefined,
): T | undefined {
  if (!init?.headers) {
    return init;
  }
  const headers = stripSdkTelemetryHeaders(init.headers);
  return headers === init.headers ? init : { ...init, headers };
}

const filteredFetches = new WeakSet<FetchLike>();

/**
 * A fetch that removes SDK telemetry from every request before handing it to
 * `fetchImpl` (or, when omitted, to `globalThis.fetch` as it is at call
 * time). Idempotent: wrapping an already-filtered fetch returns it.
 */
export function withoutSdkTelemetryHeaders(fetchImpl?: FetchLike): typeof fetch {
  if (fetchImpl && filteredFetches.has(fetchImpl)) {
    return fetchImpl as typeof fetch;
  }
  const filtered: FetchLike = (input, init) => {
    const target: FetchLike = fetchImpl ?? globalThis.fetch;
    // Headers given in `init` replace a Request's own headers entirely.
    if (init?.headers !== undefined) {
      return target(input, stripSdkTelemetryFromRequestInit(init));
    }
    if (input instanceof Request) {
      const headers = rewriteHeadersObject(input.headers);
      if (headers) {
        return target(new Request(input, { headers }), init);
      }
    }
    return target(input, init);
  };
  filteredFetches.add(filtered);
  return filtered as typeof fetch;
}
