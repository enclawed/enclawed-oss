// Verifies the per-bridge tool-allowlist admission gate in QClearedMcpClient.invoke().
//
// The point of this test is the *closed list*: even though connect() admits
// the URL, invoke() must deny any tool name that isn't in the bridge's
// allowedTools array — without making a network call.

import { afterEach, describe, expect, it } from "vitest";
import { QClearedMcpClient } from "./client.js";
import { HttpJsonRpcTransport } from "./http-transport.js";
import {
  _resetServerRegistryForTest,
  registerServer,
} from "./server-registry.js";

describe("QClearedMcpClient admission gate", () => {
  afterEach(() => {
    _resetServerRegistryForTest();
  });

  it("denies a tool name outside the bridge's allowedTools", async () => {
    let networkCalls = 0;
    const transport = new HttpJsonRpcTransport({
      endpoint: "https://gmailmcp.googleapis.com/mcp/v1",
      fetchImpl: (async () => {
        networkCalls++;
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    });
    registerServer({
      id: "mcp.google.gmail",
      bridge: "mcp-google-workspace",
      endpoint: "https://gmailmcp.googleapis.com/mcp/v1",
      requiredClearance: "internal",
      allowedTools: ["list_labels"],
      transport,
    });
    const client = new QClearedMcpClient({
      requiredClearance: "internal",
      override: { ok: true },
    });
    const res = await client.invoke({
      serverUrl: "https://gmailmcp.googleapis.com/mcp/v1",
      toolName: "delete_everything", // not in allowedTools
      arguments: {},
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/not admitted/);
    expect(networkCalls).toBe(0);
  });

  it("admits a tool in the allowedTools list and returns the rpc result", async () => {
    const transport = new HttpJsonRpcTransport({
      endpoint: "https://gmailmcp.googleapis.com/mcp/v1",
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({ jsonrpc: "2.0", id: "x", result: { labels: ["INBOX"] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as unknown as typeof fetch,
    });
    registerServer({
      id: "mcp.google.gmail",
      bridge: "mcp-google-workspace",
      endpoint: "https://gmailmcp.googleapis.com/mcp/v1",
      requiredClearance: "internal",
      allowedTools: ["list_labels"],
      transport,
    });
    const client = new QClearedMcpClient({
      requiredClearance: "internal",
      override: { ok: true },
    });
    const res = await client.invoke({
      serverUrl: "https://gmailmcp.googleapis.com/mcp/v1",
      toolName: "list_labels",
      arguments: {},
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.output).toEqual({ labels: ["INBOX"] });
  });

  it("falls back to legacy 'no bridge registered' message when no bridge owns the endpoint", async () => {
    const client = new QClearedMcpClient({
      requiredClearance: "internal",
      override: { ok: true },
    });
    const res = await client.invoke({
      serverUrl: "https://something-not-registered.example/mcp",
      toolName: "anything",
      arguments: {},
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/no registered bridge/);
  });
});
