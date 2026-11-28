// Wire-level proof that the memory plugin's embedding requests (openai 6.x
// SDK) leave without SDK telemetry: a real HTTP server on 127.0.0.1 records
// the headers each request carries.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Embeddings } from "./index.js";

const EMBEDDING_BASE64 = Buffer.from(new Float32Array([0.25, 0.5]).buffer).toString("base64");

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
      res.end(
        JSON.stringify({
          object: "list",
          model: "m",
          // The SDK asks for base64 float32 embeddings and decodes them.
          data: [{ object: "embedding", index: 0, embedding: EMBEDDING_BASE64 }],
          usage: { prompt_tokens: 1, total_tokens: 1 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("memory-lancedb embedding request headers", () => {
  it("sends no x-stainless-* telemetry and no SDK version in the User-Agent", async () => {
    const embeddings = new Embeddings("test-key", "text-embedding-3-small", baseUrl);

    await expect(embeddings.embed("hello")).resolves.toEqual([0.25, 0.5]);

    expect(requests.map((request) => request.path)).toEqual(["/v1/embeddings"]);
    const headers = requests[0].headers;
    expect(headers.authorization).toBe("Bearer test-key");
    expect(Object.keys(headers).filter((name) => name.startsWith("x-stainless-"))).toEqual([]);
    for (const [name, value] of Object.entries(headers)) {
      expect(`${name}: ${String(value)}`.toLowerCase(), name).not.toContain("enclawed");
    }
    expect(headers["user-agent"]).toBe("OpenAI/JS");
  });
});
