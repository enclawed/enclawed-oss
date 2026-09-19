import { afterEach, describe, expect, it } from "vitest";
import { HttpJsonRpcTransport } from "./http-transport.js";
import {
  _resetServerRegistryForTest,
  getServerByEndpoint,
  getServerById,
  isToolAdmitted,
  listServers,
  registerServer,
  ServerRegistrationError,
  unregisterServer,
} from "./server-registry.js";

function makeTransport(endpoint: string): HttpJsonRpcTransport {
  return new HttpJsonRpcTransport({
    endpoint,
    fetchImpl: (async () =>
      new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch,
  });
}

describe("server registry", () => {
  afterEach(() => {
    _resetServerRegistryForTest();
  });

  it("registers entries and looks them up by id and endpoint", () => {
    const endpoint = "https://gmailmcp.googleapis.com/mcp/v1";
    const transport = makeTransport(endpoint);
    registerServer({
      id: "mcp.google.gmail",
      bridge: "mcp-google-workspace",
      endpoint,
      requiredClearance: "internal",
      allowedTools: ["list_labels"],
      transport,
    });
    expect(getServerById("mcp.google.gmail")?.endpoint).toBe(endpoint);
    expect(getServerByEndpoint(endpoint)?.id).toBe("mcp.google.gmail");
    expect(listServers()).toHaveLength(1);
  });

  it("rejects duplicate id registration", () => {
    const transport = makeTransport("http://a/");
    registerServer({
      id: "dup",
      bridge: "x",
      endpoint: "http://a/",
      requiredClearance: "internal",
      allowedTools: ["t"],
      transport,
    });
    expect(() =>
      registerServer({
        id: "dup",
        bridge: "x",
        endpoint: "http://b/",
        requiredClearance: "internal",
        allowedTools: ["t"],
        transport,
      }),
    ).toThrow(ServerRegistrationError);
  });

  it("rejects empty allowedTools", () => {
    const transport = makeTransport("http://a/");
    expect(() =>
      registerServer({
        id: "x",
        bridge: "x",
        endpoint: "http://a/",
        requiredClearance: "internal",
        allowedTools: [],
        transport,
      }),
    ).toThrow(/allowedTools/);
  });

  it("isToolAdmitted returns true for listed tools, false otherwise", () => {
    const transport = makeTransport("http://a/");
    registerServer({
      id: "x",
      bridge: "x",
      endpoint: "http://a/",
      requiredClearance: "internal",
      allowedTools: ["safe", "ok"],
      transport,
    });
    const entry = getServerById("x")!;
    expect(isToolAdmitted(entry, "safe")).toBe(true);
    expect(isToolAdmitted(entry, "danger")).toBe(false);
  });

  it("unregisterServer removes the entry", () => {
    const transport = makeTransport("http://a/");
    registerServer({
      id: "tmp",
      bridge: "x",
      endpoint: "http://a/",
      requiredClearance: "internal",
      allowedTools: ["a"],
      transport,
    });
    expect(unregisterServer("tmp")).toBe(true);
    expect(getServerById("tmp")).toBeUndefined();
    expect(unregisterServer("tmp")).toBe(false);
  });
});
