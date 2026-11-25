// CVE-2026-25253 class, server side: a device token that leaked (for example to
// a gateway the Control UI was tricked into connecting to) must be useless
// without the device's private key. The gateway accepts a device token only
// together with a fresh signature over its own connect challenge by the key the
// token was issued to.
import { describe, expect, test } from "vitest";
import type { WebSocket } from "ws";
import {
  loadOrCreateDeviceIdentity,
  publicKeyRawBase64UrlFromPem,
  signDevicePayload,
} from "../infra/device-identity.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../utils/message-channel.js";
import { buildDeviceAuthPayloadV3 } from "./device-auth.js";
import {
  issueOperatorToken,
  loadDeviceIdentity,
  openTrackedWs,
} from "./device-authz.test-helpers.js";
import {
  connectReq,
  installGatewayTestHooks,
  readConnectChallengeNonce,
  startServer,
} from "./test-helpers.js";

installGatewayTestHooks({ scope: "suite" });

const CLIENT = {
  id: GATEWAY_CLIENT_NAMES.TEST,
  version: "1.0.0",
  platform: "test",
  mode: GATEWAY_CLIENT_MODES.TEST,
};
const SCOPES = ["operator.admin"];

function signedDeviceBlock(params: {
  identityPath: string;
  deviceId?: string;
  publicKey?: string;
  token: string;
  nonce: string;
}) {
  const identity = loadOrCreateDeviceIdentity(params.identityPath);
  const deviceId = params.deviceId ?? identity.deviceId;
  const signedAt = Date.now();
  const payload = buildDeviceAuthPayloadV3({
    deviceId,
    clientId: CLIENT.id,
    clientMode: CLIENT.mode,
    role: "operator",
    scopes: SCOPES,
    signedAtMs: signedAt,
    token: params.token,
    nonce: params.nonce,
    platform: CLIENT.platform,
  });
  return {
    id: deviceId,
    publicKey: params.publicKey ?? publicKeyRawBase64UrlFromPem(identity.publicKeyPem),
    signature: signDevicePayload(identity.privateKeyPem, payload),
    signedAt,
    nonce: params.nonce,
  };
}

function detailCode(res: { error?: { details?: unknown } }): unknown {
  return (res.error?.details as { code?: unknown } | undefined)?.code;
}

async function withSocket<T>(port: number, fn: (ws: WebSocket) => Promise<T>): Promise<T> {
  const ws = await openTrackedWs(port);
  try {
    return await fn(ws);
  } finally {
    ws.close();
  }
}

describe("gateway refuses a replayed device token without proof of the device key", () => {
  test("legit device connects; every replay without its private key is refused", async () => {
    const started = await startServer("secret");
    try {
      const victim = await issueOperatorToken({
        name: "replay-victim",
        approvedScopes: SCOPES,
        clientId: CLIENT.id,
        clientMode: CLIENT.mode,
      });
      const victimPublicKey = loadDeviceIdentity("replay-victim").publicKey;
      // The attacker is itself a paired device of the same gateway, so a
      // refusal below is about the stolen token, not about pairing.
      const attackerPaired = await issueOperatorToken({
        name: "replay-attacker",
        approvedScopes: SCOPES,
        clientId: CLIENT.id,
        clientMode: CLIENT.mode,
      });
      const attacker = { identityPath: attackerPaired.identityPath };
      const base = { skipDefaultAuth: true, client: CLIENT, scopes: SCOPES } as const;

      // False-positive control: the device that owns the token reconnects.
      const legit = await withSocket(started.port, (ws) =>
        connectReq(ws, {
          ...base,
          deviceToken: victim.token,
          deviceIdentityPath: victim.identityPath,
        }),
      );
      expect(legit.ok, JSON.stringify(legit)).toBe(true);

      // 1. Token alone, no device identity at all.
      const tokenOnly = await withSocket(started.port, (ws) =>
        connectReq(ws, { ...base, deviceToken: victim.token, device: null }),
      );
      expect(tokenOnly.ok).toBe(false);
      expect(detailCode(tokenOnly)).toBe("DEVICE_IDENTITY_REQUIRED");

      // 2. Token presented as the shared gateway token, no device identity.
      const asShared = await withSocket(started.port, (ws) =>
        connectReq(ws, { ...base, token: victim.token, device: null }),
      );
      expect(asShared.ok).toBe(false);
      expect(detailCode(asShared)).toBe("AUTH_TOKEN_MISMATCH");

      // 3. Token with the attacker's own (paired, validly signed) device identity.
      const ownKey = await withSocket(started.port, (ws) =>
        connectReq(ws, {
          ...base,
          deviceToken: victim.token,
          deviceIdentityPath: attacker.identityPath,
        }),
      );
      expect(ownKey.ok).toBe(false);
      expect(detailCode(ownKey)).toBe("AUTH_DEVICE_TOKEN_MISMATCH");

      // 4. Token claiming the victim's device id and public key, signed by the attacker.
      const forged = await withSocket(started.port, async (ws) => {
        const nonce = await readConnectChallengeNonce(ws);
        expect(nonce).toBeTruthy();
        return connectReq(ws, {
          ...base,
          deviceToken: victim.token,
          device: signedDeviceBlock({
            identityPath: attacker.identityPath,
            deviceId: victim.deviceId,
            publicKey: victimPublicKey,
            token: victim.token,
            nonce: nonce ?? "",
          }),
        });
      });
      expect(forged.ok).toBe(false);
      expect(detailCode(forged)).toBe("DEVICE_AUTH_SIGNATURE_INVALID");

      // 5. A device block the victim really signed, captured and replayed on a
      //    new connection (its nonce is not this connection's challenge).
      const captured = await withSocket(started.port, async (ws) => {
        const nonce = await readConnectChallengeNonce(ws);
        return signedDeviceBlock({
          identityPath: victim.identityPath,
          token: victim.token,
          nonce: nonce ?? "",
        });
      });
      const replayed = await withSocket(started.port, async (ws) => {
        await readConnectChallengeNonce(ws);
        return connectReq(ws, { ...base, deviceToken: victim.token, device: captured });
      });
      expect(replayed.ok).toBe(false);
      expect(detailCode(replayed)).toBe("DEVICE_AUTH_NONCE_MISMATCH");
    } finally {
      await started.server.close();
      started.envSnapshot.restore();
    }
  });
});
