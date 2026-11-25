// The launch's sealed boxes (./sealed-box.ts, ./credential-keys.ts boxes), the login sealed to
// its box (./login-seal.ts record v2) and the refresh vault (./auth-relay.ts boxRefreshVault).
// Attack side: a closed box opens nothing (what root reads from the launcher's memory after the
// start); a record of another box, purpose or label, or an altered one, does not open; the boxes
// of a launch without a device-verified activation do not exist; a replaced login record leaves
// none of its bytes in its file; with a vault, a refresh without a new activation sends nothing
// to the token endpoint. False-positive side: the same device gives the same boxes at every
// launch, a login sealed by a closed box opens at the next launch, a refresh with an activation
// works and the rotated refresh token stays sealed.

import { createHash } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { tempTree } from "../containment/test-helpers.js";
import { createContainerCa } from "../containment/x509.js";
import { boxRefreshVault, oauthRelayCredential } from "./auth-relay.js";
import {
  credentialStoreKeys,
  forgetLaunchCredentialKeys,
  type CredentialKeyDevice,
} from "./credential-keys.js";
import { sealLoginBytes, unsealLoginToMemory } from "./login-seal.js";
import { sealBoxFromSeed, sealOnlyBox, sealToBox } from "./sealed-box.js";

/**
 * A command set 0.5 stand-in at the host-protocol level: KEY_DERIVE answers a per-device key for a
 * label, once per activation the test grants (as the device does), and refuses without one.
 */
export function kdStandIn(secret: string, uid = "dev-uid-kd") {
  let activations = 0;
  const derived: string[] = [];
  const device: CredentialKeyDevice = {
    uid,
    sign: async () => {
      throw new Error("CHALLENGE is never used on command set 0.5");
    },
    keyDerivation: {
      pubkey: createHash("sha256").update(`pub:${secret}`).digest("hex"),
      commandSet: async () => ({ status: "proven", commandSet: "0.5" }),
      derive: async (label) => {
        if (activations === 0) {
          return { ok: false, code: "no-activation" };
        }
        activations--;
        derived.push(label.toString("hex"));
        return {
          ok: true,
          key: createHash("sha3-256").update(secret).update(label).digest(),
          binding: Buffer.alloc(32),
          facts: { kind: "totp", step: 1, counter: 1n },
        };
      },
    },
  };
  return { device, activate: () => void activations++, derived };
}

let root: string;
let n = 0;
const fresh = () => {
  const d = path.join(root, `case-${++n}`);
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
};
const launchKeys = (dev: CredentialKeyDevice, dir: string) =>
  credentialStoreKeys({
    keyFile: path.join(dir, "k.key"),
    device: dev,
    keyring: null,
    rootRequired: true,
  });

beforeAll(() => {
  root = tempTree("enclawed-sealed-box");
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
beforeEach(() => forgetLaunchCredentialKeys());

describe("sealed box", () => {
  const seed = createHash("sha256").update("seed").digest();
  const aad = Buffer.from("aad");
  it("opens what was sealed to it while it holds its private key, and nothing once closed", () => {
    const box = sealBoxFromSeed(Buffer.from(seed), "device:u:box:test");
    const rec = sealToBox(box, Buffer.from("secret"), aad);
    expect(rec.data).not.toContain("secret");
    expect(box.open(rec, aad)?.toString()).toBe("secret");
    box.close();
    expect(box.canOpen()).toBe(false);
    expect(box.open(rec, aad)).toBeNull();
    // The same seed gives the same box (the next launch opens it).
    expect(sealBoxFromSeed(Buffer.from(seed), "device:u:box:test").open(rec, aad)?.toString()).toBe(
      "secret",
    );
  });
  it("refuses another associated data, another box, and an altered record", () => {
    const box = sealBoxFromSeed(Buffer.from(seed), "device:u:box:test");
    const rec = sealToBox(box, Buffer.from("secret"), aad);
    expect(box.open(rec, Buffer.from("other"))).toBeNull();
    const other = sealBoxFromSeed(createHash("sha256").update("x").digest(), "device:u:box:test");
    expect(other.open({ ...rec, key: other.id }, aad)).toBeNull();
    const data = Buffer.from(rec.data, "base64");
    data[0] ^= 1;
    expect(box.open({ ...rec, data: data.toString("base64") }, aad)).toBeNull();
  });
  it("a seal-only box seals for its owner and refuses an id that does not name its key", () => {
    const box = sealBoxFromSeed(Buffer.from(seed), "device:u:box:test");
    const only = sealOnlyBox(box.id, box.publicKey);
    expect(box.open(sealToBox(only, Buffer.from("x"), aad), aad)?.toString()).toBe("x");
    expect(() => sealOnlyBox("device:u:box:test:0000000000000000", box.publicKey)).toThrow();
  });
});

describe("the launch's boxes (command set 0.5)", () => {
  it("exist only after KEY_DERIVE on an activation, one per purpose, the same at every launch", async () => {
    const s = kdStandIn("dev-secret-1");
    const dir = fresh();
    const none = await launchKeys(s.device, dir);
    expect(none.device?.boxes ?? null).toBeNull();
    expect(none.device?.problem).toMatch(/no-activation/);
    s.activate();
    const a = await launchKeys(s.device, dir);
    const boxes = a.device?.boxes;
    expect(boxes?.login.canOpen()).toBe(true);
    expect(boxes?.login.id).toMatch(/^device:dev-uid-kd:box:login:[0-9a-f]{16}$/);
    expect(boxes?.context.id).toMatch(/^device:dev-uid-kd:box:context:[0-9a-f]{16}$/);
    expect(boxes?.login.publicKey.equals(boxes.context.publicKey)).toBe(false);
    const loginId = boxes!.login.id;
    forgetLaunchCredentialKeys();
    expect(boxes?.login.canOpen()).toBe(false);
    expect(boxes?.context.canOpen()).toBe(false);
    expect(boxes?.tools.canOpen()).toBe(false);
    // The next launch: a new activation, the same boxes.
    s.activate();
    const b = await launchKeys(s.device, dir);
    expect(b.device?.boxes?.login.id).toBe(loginId);
    // Another device: other boxes.
    const t = kdStandIn("dev-secret-2");
    t.activate();
    forgetLaunchCredentialKeys();
    const c = await launchKeys(t.device, fresh());
    expect(c.device?.boxes?.login.publicKey.equals(b.device!.boxes!.login.publicKey)).toBe(false);
  });
});

describe("the login sealed to its box (record v2)", () => {
  const LOGIN = Buffer.from(
    JSON.stringify({ oauth: { accessToken: "AT-SECRET", refreshToken: "RT-SECRET" } }),
  );
  it("opens at the start of a launch, not after the launch closed its box, and again at the next launch", async () => {
    const s = kdStandIn("dev-secret-3");
    const dir = fresh();
    const sealedFile = path.join(dir, "state", "login.sealed.json");
    s.activate();
    const keys = await launchKeys(s.device, dir);
    const box = keys.device!.boxes!.login;
    expect(
      sealLoginBytes({ plain: LOGIN, sealedFile, keys, deviceBound: true, label: "l", box }).ok,
    ).toBe(true);
    const text = fs.readFileSync(sealedFile, "utf8");
    expect(text).not.toMatch(/SECRET/);
    expect(JSON.parse(text).v).toBe(2);
    const opened = unsealLoginToMemory({ sealedFile, keys, deviceBound: true, label: "l", box });
    expect(opened.ok && opened.plain.equals(LOGIN)).toBe(true);
    // The launch closes its keys: what is left in memory seals a rotated login and opens nothing.
    forgetLaunchCredentialKeys();
    const rotated = Buffer.from(
      JSON.stringify({ oauth: { accessToken: "AT2-SECRET", refreshToken: "RT2-SECRET" } }),
    );
    // A hard link keeps the replaced record's file: its bytes must be overwritten.
    fs.linkSync(sealedFile, path.join(dir, "old-record"));
    expect(
      sealLoginBytes({ plain: rotated, sealedFile, keys, deviceBound: true, label: "l", box }).ok,
    ).toBe(true);
    expect(fs.readFileSync(path.join(dir, "old-record"), "utf8")).not.toBe(text);
    expect(fs.readFileSync(path.join(dir, "old-record")).includes(Buffer.from('"kind"'))).toBe(
      false,
    );
    const closed = unsealLoginToMemory({ sealedFile, keys, deviceBound: true, label: "l", box });
    expect(closed.ok).toBe(false);
    expect(!closed.ok && closed.code).toBe("key-unavailable");
    // A launch without a device-verified activation has no box: nothing opens.
    const noAct = await launchKeys(s.device, dir);
    expect(
      unsealLoginToMemory({
        sealedFile,
        keys: noAct,
        deviceBound: true,
        label: "l",
        box: noAct.device?.boxes?.login ?? null,
      }).ok,
    ).toBe(false);
    // The next launch opens the rotated login.
    s.activate();
    forgetLaunchCredentialKeys();
    const next = await launchKeys(s.device, dir);
    const again = unsealLoginToMemory({
      sealedFile,
      keys: next,
      deviceBound: true,
      label: "l",
      box: next.device!.boxes!.login,
    });
    expect(again.ok && again.plain.equals(rotated)).toBe(true);
    // Another label does not open it.
    expect(
      unsealLoginToMemory({
        sealedFile,
        keys: next,
        deviceBound: true,
        label: "other",
        box: next.device!.boxes!.login,
      }).ok,
    ).toBe(false);
  });
});

describe("the refresh vault", () => {
  const ca = createContainerCa("stand-in token endpoint", ["auth.provider.test"]);
  let server: https.Server;
  let port = 0;
  const calls: Record<string, unknown>[] = [];
  beforeAll(async () => {
    const leaf = ca.leafFor("auth.provider.test");
    server = https.createServer({ key: leaf.keyPem, cert: leaf.certPem }, (req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        const j = JSON.parse(body) as Record<string, unknown>;
        calls.push(j);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            access_token: `AT-${calls.length}`,
            refresh_token: `${String(j.refresh_token)}+`,
            expires_in: 3600,
          }),
        );
      });
    });
    port = await new Promise<number>((r) =>
      server.listen(0, "127.0.0.1", () => r((server.address() as AddressInfo).port)),
    );
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  it("refreshes only after a new activation, and keeps the rotated refresh token sealed", async () => {
    const s = kdStandIn("dev-secret-4");
    const dir = fresh();
    s.activate();
    const keys = await launchKeys(s.device, dir);
    const box = keys.device!.boxes!.login;
    forgetLaunchCredentialKeys();
    let reopened = 0;
    const vault = boxRefreshVault({
      box,
      reopen: async () => {
        reopened++;
        const k = await launchKeys(s.device, dir);
        return k.device?.boxes?.login ?? null;
      },
    });
    const rotated: string[] = [];
    const cred = oauthRelayCredential({
      login: {
        accessToken: "AT-0",
        refreshToken: "RT-SECRET",
        expiresAt: Date.now() + 3600_000,
        scopes: [],
      },
      tokenUrl: "https://auth.provider.test/v1/oauth/token",
      clientId: "client-1",
      onRotate: (l) => rotated.push(String(l.refreshToken)),
      refreshVault: vault,
      trustForTest: ca.certPem,
      addressForTest: { host: "127.0.0.1", port },
    });
    // No activation: the box does not reopen, nothing reaches the token endpoint.
    expect(await cred.refresh("expiry")).toBe(false);
    expect(calls).toHaveLength(0);
    expect(reopened).toBe(1);
    // With one: the sealed refresh token is opened for this refresh alone.
    s.activate();
    forgetLaunchCredentialKeys();
    expect(await cred.refresh("expiry")).toBe(true);
    expect(calls[0]?.refresh_token).toBe("RT-SECRET");
    expect(cred.current()).toBe("AT-1");
    expect(rotated).toEqual(["RT-SECRET+"]);
    forgetLaunchCredentialKeys();
    // The rotated token is sealed again: the next refresh needs another activation.
    expect(await cred.refresh("expiry")).toBe(false);
    expect(calls).toHaveLength(1);
    s.activate();
    forgetLaunchCredentialKeys();
    expect(await cred.refresh("rejected")).toBe(true);
    expect(calls[1]?.refresh_token).toBe("RT-SECRET+");
  });
});

describe("a forgotten launch key", () => {
  it("never seals a login (it is all zeros after forgetLaunchCredentialKeys)", async () => {
    const s = kdStandIn("dev-secret-5");
    const dir = fresh();
    s.activate();
    const keys = await launchKeys(s.device, dir);
    forgetLaunchCredentialKeys();
    expect(keys.write.key.every((b) => b === 0)).toBe(true);
    const r = sealLoginBytes({
      plain: Buffer.from("{}"),
      sealedFile: path.join(dir, "l.json"),
      keys,
      deviceBound: true,
      label: "l",
    });
    expect(r.ok).toBe(false);
    expect(fs.existsSync(path.join(dir, "l.json"))).toBe(false);
  });
});

describe("core dumps of the process that holds a login", () => {
  it("are turned off on Linux, and a limit that did not take is reported", async () => {
    const { processCoreDumpsOff } = await import("./auth-relay.js");
    if (process.platform === "linux") {
      expect(processCoreDumpsOff()).toEqual({ off: true, reason: "RLIMIT_CORE is 0" });
    }
    const failed = processCoreDumpsOff(
      () => ({ status: 1 }),
      () => "Max core file size        unlimited            unlimited            bytes\n",
      "linux",
    );
    expect(failed.off).toBe(false);
    expect(processCoreDumpsOff(undefined, undefined, "darwin").off).toBe(false);
  });
});
