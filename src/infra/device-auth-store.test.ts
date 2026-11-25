import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempDir } from "../test-utils/temp-dir.js";
import {
  clearDeviceAuthToken,
  loadDeviceAuthToken,
  storeDeviceAuthToken,
} from "./device-auth-store.js";

function createEnv(stateDir: string): NodeJS.ProcessEnv {
  return {
    ENCLAWED_STATE_DIR: stateDir,
    ENCLAWED_TEST_FAST: "1",
  };
}

const GW = "ws://127.0.0.1:18789";

function deviceAuthFile(stateDir: string): string {
  return path.join(stateDir, "identity", "device-auth.json");
}

describe("infra/device-auth-store", () => {
  it("stores and loads device auth tokens under the configured state dir", async () => {
    await withTempDir("enclawed-device-auth-", async (stateDir) => {
      vi.spyOn(Date, "now").mockReturnValue(1234);

      const entry = storeDeviceAuthToken({
        deviceId: "device-1",
        role: " operator ",
        gatewayUrl: GW,
        token: "secret",
        scopes: [" operator.write ", "operator.read", "operator.read"],
        env: createEnv(stateDir),
      });

      expect(entry).toEqual({
        token: "secret",
        role: "operator",
        scopes: ["operator.read", "operator.write"],
        updatedAtMs: 1234,
      });
      expect(
        loadDeviceAuthToken({
          deviceId: "device-1",
          role: "operator",
          gatewayUrl: GW,
          env: createEnv(stateDir),
        }),
      ).toEqual(entry);

      const raw = await fs.readFile(deviceAuthFile(stateDir), "utf8");
      expect(raw.endsWith("\n")).toBe(true);
      expect(JSON.parse(raw)).toEqual({
        version: 1,
        deviceId: "device-1",
        tokens: {},
        gateways: {
          [GW]: { operator: entry },
        },
      });
    });
  });

  it("binds tokens to the gateway origin and ignores legacy un-keyed tokens", async () => {
    await withTempDir("enclawed-device-auth-", async (stateDir) => {
      const env = createEnv(stateDir);
      // A file written by an older client: role-keyed, no gateway binding.
      await fs.mkdir(path.dirname(deviceAuthFile(stateDir)), { recursive: true });
      await fs.writeFile(
        deviceAuthFile(stateDir),
        '{"version":1,"deviceId":"device-1","tokens":{"operator":{"token":"legacy","role":"operator","scopes":["operator.read"],"updatedAtMs":1}}}\n',
        "utf8",
      );
      expect(
        loadDeviceAuthToken({ deviceId: "device-1", role: "operator", gatewayUrl: GW, env }),
      ).toBeNull();

      storeDeviceAuthToken({
        deviceId: "device-1",
        role: "operator",
        gatewayUrl: "ws://localhost:18789/",
        token: "token-local",
        env,
      });
      expect(
        loadDeviceAuthToken({
          deviceId: "device-1",
          role: "operator",
          gatewayUrl: "ws://LOCALHOST:18789/ws",
          env,
        })?.token,
      ).toBe("token-local");
      for (const other of ["wss://attacker.example", "ws://localhost:18790", "not a url"]) {
        expect(
          loadDeviceAuthToken({ deviceId: "device-1", role: "operator", gatewayUrl: other, env }),
        ).toBeNull();
      }
      // The legacy map stays for older clients sharing the file; it is never read.
      const raw = JSON.parse(await fs.readFile(deviceAuthFile(stateDir), "utf8"));
      expect(raw.tokens.operator.token).toBe("legacy");
    });
  });

  it("returns null for missing, invalid, or mismatched stores", async () => {
    await withTempDir("enclawed-device-auth-", async (stateDir) => {
      const env = createEnv(stateDir);

      expect(
        loadDeviceAuthToken({ deviceId: "device-1", role: "operator", gatewayUrl: GW, env }),
      ).toBeNull();

      await fs.mkdir(path.dirname(deviceAuthFile(stateDir)), { recursive: true });
      await fs.writeFile(deviceAuthFile(stateDir), '{"version":2,"deviceId":"device-1"}\n', "utf8");
      expect(
        loadDeviceAuthToken({ deviceId: "device-1", role: "operator", gatewayUrl: GW, env }),
      ).toBeNull();

      await fs.writeFile(
        deviceAuthFile(stateDir),
        '{"version":1,"deviceId":"device-2","tokens":{"operator":{"token":"x","role":"operator","scopes":[],"updatedAtMs":1}}}\n',
        "utf8",
      );
      expect(
        loadDeviceAuthToken({ deviceId: "device-1", role: "operator", gatewayUrl: GW, env }),
      ).toBeNull();
    });
  });

  it("clears only the requested role and leaves unrelated tokens intact", async () => {
    await withTempDir("enclawed-device-auth-", async (stateDir) => {
      const env = createEnv(stateDir);

      storeDeviceAuthToken({
        deviceId: "device-1",
        role: "operator",
        gatewayUrl: GW,
        token: "operator-token",
        env,
      });
      storeDeviceAuthToken({
        deviceId: "device-1",
        role: "node",
        gatewayUrl: GW,
        token: "node-token",
        env,
      });

      clearDeviceAuthToken({
        deviceId: "device-1",
        role: " operator ",
        gatewayUrl: GW,
        env,
      });

      expect(
        loadDeviceAuthToken({ deviceId: "device-1", role: "operator", gatewayUrl: GW, env }),
      ).toBeNull();
      expect(
        loadDeviceAuthToken({ deviceId: "device-1", role: "node", gatewayUrl: GW, env }),
      ).toMatchObject({
        token: "node-token",
      });
    });
  });
});
