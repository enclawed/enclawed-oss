// Wire-level proof that a Perplexity web search leaves without identifying
// headers: a real HTTP server on 127.0.0.1 records what the request carries.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executePerplexitySearch } from "./perplexity-web-search-provider.runtime.js";

let server: http.Server;
let requests: Array<{ path: string; headers: http.IncomingHttpHeaders }>;
let baseUrl: string;

beforeEach(async () => {
  requests = [];
  server = http.createServer((req, res) => {
    requests.push({ path: req.url ?? "", headers: req.headers });
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "ok" } }], citations: [] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("perplexity web search request headers", () => {
  it("sends no attribution, SDK telemetry, product name or host fingerprint", async () => {
    const result = await executePerplexitySearch(
      { query: "outbound header check" },
      { perplexity: { apiKey: "pplx-test", baseUrl } },
    );

    expect(result.error).toBeUndefined();
    expect(requests.map((request) => request.path)).toEqual(["/chat/completions"]);
    const headers = requests[0].headers;
    expect(headers.authorization).toBe("Bearer pplx-test");
    const names = Object.keys(headers);
    expect(names.filter((name) => name.startsWith("x-stainless-"))).toEqual([]);
    expect(
      names.filter(
        (name) => name === "http-referer" || name === "x-title" || name.startsWith("x-openrouter-"),
      ),
    ).toEqual([]);
    for (const [name, value] of Object.entries(headers)) {
      expect(`${name}: ${String(value)}`.toLowerCase(), name).not.toContain("enclawed");
    }
    const userAgent = headers["user-agent"] ?? "";
    for (const fingerprint of [process.platform, process.arch, process.version, "node/"]) {
      expect(userAgent.toLowerCase()).not.toContain(fingerprint.toLowerCase());
    }
    expect(userAgent).not.toMatch(/\d+\.\d+/);
  });
});
