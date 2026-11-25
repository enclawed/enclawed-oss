import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSdkTelemetryHeaderName,
  neutralizeSdkUserAgent,
  stripSdkTelemetryFromRequestInit,
  stripSdkTelemetryHeaders,
  withoutSdkTelemetryHeaders,
} from "./sdk-telemetry-headers.js";

const TELEMETRY = {
  "X-Stainless-OS": "Linux",
  "X-Stainless-Arch": "x64",
  "X-Stainless-Runtime": "node",
  "X-Stainless-Runtime-Version": "v22.22.1",
  "X-Stainless-Lang": "js",
  "X-Stainless-Package-Version": "6.35.0",
  "X-Stainless-Retry-Count": "0",
  "X-Stainless-Timeout": "600",
  "x-stainless-helper-method": "stream",
};

function namesOf(headers: HeadersInit | undefined): string[] {
  return [...new Headers(headers).keys()].toSorted();
}

describe("sdk telemetry headers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recognizes every x-stainless-* header and nothing else", () => {
    for (const name of Object.keys(TELEMETRY)) {
      expect(isSdkTelemetryHeaderName(name)).toBe(true);
    }
    expect(isSdkTelemetryHeaderName("X-Stainless-Anything-New")).toBe(true);
    expect(isSdkTelemetryHeaderName("authorization")).toBe(false);
    expect(isSdkTelemetryHeaderName("x-stainless")).toBe(false);
  });

  it("drops only the version from a Stainless SDK User-Agent", () => {
    expect(neutralizeSdkUserAgent("OpenAI/JS 6.35.0")).toBe("OpenAI/JS");
    expect(neutralizeSdkUserAgent("Anthropic/JS 0.92.0")).toBe("Anthropic/JS");
    expect(neutralizeSdkUserAgent("PiAnthropic/JS 0.129.0")).toBe("PiAnthropic/JS");
    // Values a provider requires, or the caller chose, are kept.
    expect(neutralizeSdkUserAgent("GitHubCopilotChat/0.26.7")).toBe("GitHubCopilotChat/0.26.7");
    expect(neutralizeSdkUserAgent("claude-cli/2.1.0")).toBe("claude-cli/2.1.0");
    expect(neutralizeSdkUserAgent("pi")).toBe("pi");
  });

  it("strips telemetry from records, arrays and Headers, keeping their form", () => {
    const base = { Authorization: "Bearer k", "User-Agent": "OpenAI/JS 6.35.0" };

    const record = stripSdkTelemetryHeaders({ ...base, ...TELEMETRY });
    expect(record).toEqual({ Authorization: "Bearer k", "User-Agent": "OpenAI/JS" });

    const array = stripSdkTelemetryHeaders(Object.entries({ ...base, ...TELEMETRY }));
    expect(array).toEqual([
      ["Authorization", "Bearer k"],
      ["User-Agent", "OpenAI/JS"],
    ]);

    const headers = stripSdkTelemetryHeaders(new Headers({ ...base, ...TELEMETRY }));
    expect(headers).toBeInstanceOf(Headers);
    expect(namesOf(headers)).toEqual(["authorization", "user-agent"]);
    expect(new Headers(headers).get("user-agent")).toBe("OpenAI/JS");
  });

  it("returns the input itself when there is nothing to strip", () => {
    const record = { Authorization: "Bearer k", "User-Agent": "custom/1.0" };
    expect(stripSdkTelemetryHeaders(record)).toBe(record);
    const init = { method: "POST", headers: record };
    expect(stripSdkTelemetryFromRequestInit(init)).toBe(init);
    expect(stripSdkTelemetryFromRequestInit(undefined)).toBeUndefined();
  });

  it("filters init headers and Request headers before the wrapped fetch sees them", async () => {
    const seen: Headers[] = [];
    const inner = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(
        init?.headers !== undefined
          ? new Headers(init.headers)
          : new Headers((input as Request).headers),
      );
      return new Response("ok");
    });
    const filtered = withoutSdkTelemetryHeaders(inner);

    await filtered("https://example.test/v1", { method: "POST", headers: { ...TELEMETRY } });
    await filtered(
      new Request("https://example.test/v1", {
        method: "POST",
        headers: { ...TELEMETRY, "User-Agent": "OpenAI/JS 6.35.0", "X-Keep": "1" },
        body: "{}",
      }),
    );

    expect(inner).toHaveBeenCalledTimes(2);
    expect(namesOf(seen[0])).toEqual([]);
    expect(namesOf(seen[1])).toEqual(["content-type", "user-agent", "x-keep"]);
    expect(seen[1].get("user-agent")).toBe("OpenAI/JS");
  });

  it("is idempotent and resolves globalThis.fetch at call time", async () => {
    const filtered = withoutSdkTelemetryHeaders();
    expect(withoutSdkTelemetryHeaders(filtered)).toBe(filtered);

    const globalFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(namesOf(init?.headers)).toEqual(["authorization"]);
      return new Response("ok");
    });
    vi.stubGlobal("fetch", globalFetch);

    await filtered("https://example.test", { headers: { ...TELEMETRY, Authorization: "k" } });
    expect(globalFetch).toHaveBeenCalledTimes(1);
  });
});
