import { describe, expect, it, vi } from "vitest";
import {
  clearDeviceAuthTokenFromStore,
  loadDeviceAuthTokenFromStore,
  storeDeviceAuthTokenInStore,
  type DeviceAuthStoreAdapter,
} from "./device-auth-store.js";
import { normalizeGatewayOrigin } from "./device-auth.js";

const GW_A = "wss://gateway-a.example:443";
const GW_B = "wss://gateway-b.example:443";

function createAdapter(initialStore: ReturnType<DeviceAuthStoreAdapter["readStore"]> = null) {
  let store = initialStore;
  const writes: unknown[] = [];
  const adapter: DeviceAuthStoreAdapter = {
    readStore: () => store,
    writeStore: (next) => {
      store = next;
      writes.push(next);
    },
  };
  return { adapter, writes, readStore: () => store };
}

function entry(token: string, role = "operator", scopes: string[] = ["operator.read"]) {
  return { token, role, scopes, updatedAtMs: 1 };
}

describe("normalizeGatewayOrigin", () => {
  it("normalizes scheme, host and port and drops userinfo, path, query and fragment", () => {
    expect(normalizeGatewayOrigin("WSS://Gateway-A.Example/ui?x=1#f")).toBe(GW_A);
    expect(normalizeGatewayOrigin("wss://gateway-a.example:443/")).toBe(GW_A);
    expect(normalizeGatewayOrigin("wss://user:pw@gateway-a.example")).toBe(GW_A);
    expect(normalizeGatewayOrigin("ws://127.0.0.1:18789")).toBe("ws://127.0.0.1:18789");
    expect(normalizeGatewayOrigin("ws://[::1]:18789")).toBe("ws://[::1]:18789");
    expect(normalizeGatewayOrigin("ws://host")).toBe("ws://host:80");
  });

  it("separates origins that differ in scheme or port", () => {
    expect(normalizeGatewayOrigin("ws://gateway-a.example:443")).not.toBe(GW_A);
    expect(normalizeGatewayOrigin("wss://gateway-a.example:8443")).not.toBe(GW_A);
  });

  it("resolves relative URLs against a base and refuses non-websocket or unparsable URLs", () => {
    expect(normalizeGatewayOrigin("/ws", "wss://gateway-a.example/ui/")).toBe(GW_A);
    expect(normalizeGatewayOrigin("https://gateway-a.example")).toBe(GW_A);
    expect(normalizeGatewayOrigin("http://127.0.0.1:18789")).toBe("ws://127.0.0.1:18789");
    expect(normalizeGatewayOrigin("file:///etc/passwd")).toBeNull();
    expect(normalizeGatewayOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeGatewayOrigin("not a url")).toBeNull();
    expect(normalizeGatewayOrigin("")).toBeNull();
  });
});

describe("device-auth-store (origin-keyed)", () => {
  it("never returns a token minted by one gateway origin for another", () => {
    const { adapter } = createAdapter({
      version: 1,
      deviceId: "device-1",
      tokens: {},
      gateways: { [GW_A]: { operator: entry("token-a") } },
    });
    expect(
      loadDeviceAuthTokenFromStore({
        adapter,
        deviceId: "device-1",
        role: "  operator  ",
        gatewayOrigin: GW_A,
      }),
    ).toMatchObject({ token: "token-a" });
    expect(
      loadDeviceAuthTokenFromStore({
        adapter,
        deviceId: "device-1",
        role: "operator",
        gatewayOrigin: GW_B,
      }),
    ).toBeNull();
    expect(
      loadDeviceAuthTokenFromStore({
        adapter,
        deviceId: "device-1",
        role: "operator",
        gatewayOrigin: null,
      }),
    ).toBeNull();
    expect(
      loadDeviceAuthTokenFromStore({
        adapter,
        deviceId: "device-2",
        role: "operator",
        gatewayOrigin: GW_A,
      }),
    ).toBeNull();
  });

  it("never reads legacy un-keyed tokens (migration: re-pair)", () => {
    const { adapter } = createAdapter({
      version: 1,
      deviceId: "device-1",
      tokens: { operator: entry("legacy-token") },
    });
    for (const gatewayOrigin of [GW_A, GW_B]) {
      expect(
        loadDeviceAuthTokenFromStore({
          adapter,
          deviceId: "device-1",
          role: "operator",
          gatewayOrigin,
        }),
      ).toBeNull();
    }
  });

  it("returns null for missing stores and malformed token entries", () => {
    expect(
      loadDeviceAuthTokenFromStore({
        adapter: createAdapter().adapter,
        deviceId: "device-1",
        role: "operator",
        gatewayOrigin: GW_A,
      }),
    ).toBeNull();
    const { adapter } = createAdapter({
      version: 1,
      deviceId: "device-1",
      tokens: {},
      gateways: { [GW_A]: { operator: entry(123 as unknown as string) } },
    });
    expect(
      loadDeviceAuthTokenFromStore({
        adapter,
        deviceId: "device-1",
        role: "operator",
        gatewayOrigin: GW_A,
      }),
    ).toBeNull();
  });

  it("keeps a separate pairing per gateway origin and per role", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    const { adapter, writes, readStore } = createAdapter({
      version: 1,
      deviceId: "device-1",
      tokens: { node: entry("legacy-node", "node", ["node.invoke"]) },
      gateways: { [GW_A]: { node: entry("node-a", "node", ["node.invoke"]) } },
    });

    const a = storeDeviceAuthTokenInStore({
      adapter,
      deviceId: "device-1",
      role: "  operator ",
      gatewayOrigin: GW_A,
      token: "operator-a",
      scopes: [" operator.write ", "operator.read", "operator.read", ""],
    });
    const b = storeDeviceAuthTokenInStore({
      adapter,
      deviceId: "device-1",
      role: "operator",
      gatewayOrigin: GW_B,
      token: "operator-b",
    });

    expect(a).toEqual({
      token: "operator-a",
      role: "operator",
      scopes: ["operator.read", "operator.write"],
      updatedAtMs: 1234,
    });
    expect(writes).toHaveLength(2);
    expect(readStore()).toEqual({
      version: 1,
      deviceId: "device-1",
      // Legacy map is left as found (older clients sharing the file), never read.
      tokens: { node: entry("legacy-node", "node", ["node.invoke"]) },
      gateways: {
        [GW_A]: { node: entry("node-a", "node", ["node.invoke"]), operator: a },
        [GW_B]: { operator: b },
      },
    });
  });

  it("does not persist a token without a gateway origin", () => {
    const { adapter, writes } = createAdapter();
    storeDeviceAuthTokenInStore({
      adapter,
      deviceId: "device-1",
      role: "operator",
      gatewayOrigin: null,
      token: "t",
    });
    expect(writes).toHaveLength(0);
  });

  it("replaces stale stores from other devices instead of merging them", () => {
    const { adapter, readStore } = createAdapter({
      version: 1,
      deviceId: "device-2",
      tokens: { operator: entry("old-token") },
      gateways: { [GW_A]: { operator: entry("old-a") } },
    });
    storeDeviceAuthTokenInStore({
      adapter,
      deviceId: "device-1",
      role: "node",
      gatewayOrigin: GW_A,
      token: "node-token",
    });
    expect(readStore()).toEqual({
      version: 1,
      deviceId: "device-1",
      tokens: {},
      gateways: {
        [GW_A]: {
          node: { token: "node-token", role: "node", scopes: [], updatedAtMs: expect.any(Number) },
        },
      },
    });
  });

  it("clears only the named role at the named origin", () => {
    const { adapter, writes, readStore } = createAdapter({
      version: 1,
      deviceId: "device-1",
      tokens: {},
      gateways: {
        [GW_A]: { operator: entry("op-a"), node: entry("node-a", "node", []) },
        [GW_B]: { operator: entry("op-b") },
      },
    });
    clearDeviceAuthTokenFromStore({
      adapter,
      deviceId: "device-1",
      role: " operator ",
      gatewayOrigin: GW_A,
    });
    clearDeviceAuthTokenFromStore({
      adapter,
      deviceId: "device-1",
      role: "operator",
      gatewayOrigin: GW_B,
    });
    expect(writes).toHaveLength(2);
    expect(readStore()).toEqual({
      version: 1,
      deviceId: "device-1",
      tokens: {},
      gateways: { [GW_A]: { node: entry("node-a", "node", []) } },
    });
  });

  it("avoids writes when clearing missing roles, other origins or mismatched devices", () => {
    const store = {
      version: 1 as const,
      deviceId: "device-1",
      tokens: {},
      gateways: { [GW_A]: { operator: entry("op-a") } },
    };
    const cases = [
      { deviceId: "device-1", role: "node", gatewayOrigin: GW_A },
      { deviceId: "device-1", role: "operator", gatewayOrigin: GW_B },
      { deviceId: "device-1", role: "operator", gatewayOrigin: null },
      { deviceId: "device-2", role: "operator", gatewayOrigin: GW_A },
    ];
    for (const c of cases) {
      const { adapter, writes } = createAdapter(structuredClone(store));
      clearDeviceAuthTokenFromStore({ adapter, ...c });
      expect(writes).toHaveLength(0);
    }
  });
});
