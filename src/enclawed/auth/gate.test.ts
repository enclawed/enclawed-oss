import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gatedPurposeForCommand, invocationStartsSession } from "./command-table.js";
import { AuthConfigError, parseAuthConfig } from "./config.js";
import { type DoubleOptions, FLAGS, TransportDouble } from "./fixtures.test-support.js";
import {
  type AuthAuditEvent,
  type AuthContext,
  type DeviceSecondFactor,
  SecondFactorError,
  assertSecondFactor,
  enrollSecurityKey,
  removeSecurityKey,
  secondFactorStatus,
  unlockForHeadlessStart,
} from "./gate.js";
import { deviceRefusal, parseDeviceInfo, parseDeviceList } from "./libfido2.js";
import { readAuthStore } from "./store.js";
import { consumeTicket, currentBinding, readTicket, ticketFile } from "./ticket.js";
import { TEST_AAGUID, TEST_CA_PEM, testPackedTrust } from "./vectors.test-support.js";

let stateDir: string;
let events: AuthAuditEvent[];
let transport: TransportDouble;

function ctx(extra: Partial<AuthContext> = {}): AuthContext {
  return {
    stateDir,
    transport,
    audit: async (e) => {
      events.push(e);
    },
    interactive: true,
    config: parseAuthConfig(undefined),
    say: () => {},
    deviceFactor: null,
    packedTrust: testPackedTrust(),
    ...extra,
  };
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof SecondFactorError) {
      return err.code;
    }
    throw err;
  }
  return "no-error";
}

const authDir = () => path.join(stateDir, "auth");

beforeEach(() => {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-auth-test-"));
  events = [];
  transport = new TransportDouble();
});

afterEach(() => {
  fs.rmSync(stateDir, { recursive: true, force: true });
});

describe("gate: nothing enrolled", () => {
  it("refuses every purpose with enrollment instructions, and audits the refusal", async () => {
    for (const purpose of [
      "session-start",
      "policy-change",
      "recovery",
      "history-restore",
      "admin",
    ] as const) {
      await expect(assertSecondFactor(ctx(), { purpose })).rejects.toThrow(/enclawed auth enroll/);
    }
    expect(events).toHaveLength(5);
    expect(
      events.every((e) => e.payload.outcome === "refused" && e.payload.code === "not-enrolled"),
    ).toBe(true);
  });

  it("refuses when the audit log cannot be written", async () => {
    const c = ctx({
      audit: async () => {
        throw new Error("disk full");
      },
    });
    expect(await codeOf(assertSecondFactor(c, { purpose: "session-start" }))).toBe(
      "audit-unavailable",
    );
  });

  it("refuses an invalid enclawed.auth block (never fails open)", async () => {
    const c = ctx({
      config: undefined,
      env: { ...process.env, ENCLAWED_CONFIG_PATH: path.join(stateDir, "enclawed.json") },
    });
    fs.writeFileSync(
      path.join(stateDir, "enclawed.json"),
      JSON.stringify({ enclawed: { auth: { skip: true } } }),
    );
    expect(await codeOf(assertSecondFactor(c, { purpose: "session-start" }))).toBe(
      "config-invalid",
    );
  });
});

describe("enrollment", () => {
  it("enrolls a key with basic attestation, stores only public material, and audits it", async () => {
    const r = await enrollSecurityKey(ctx(), { label: "primary" });
    expect(r.total).toBe(1);
    const store = readAuthStore(authDir(), "enclawed.local");
    expect(store.credentials[0].aaguid).toBe(TEST_AAGUID);
    expect(JSON.stringify(store)).not.toMatch(/PRIVATE|"d"/);
    expect(fs.statSync(path.join(authDir(), "factors.json")).mode & 0o077).toBe(0);
    expect(events.at(-1)?.payload).toMatchObject({
      outcome: "enrolled",
      firstFactor: true,
      total: 1,
    });
  });

  it("refuses headless enrollment", async () => {
    expect(await codeOf(enrollSecurityKey(ctx({ interactive: false }), { label: "x" }))).toBe(
      "headless",
    );
  });

  it("refuses an authenticator that did not verify the user (UV=0)", async () => {
    transport = new TransportDouble({ flags: FLAGS.UP });
    expect(await codeOf(enrollSecurityKey(ctx(), { label: "x" }))).toBe("verification-failed");
    expect(events.at(-1)?.payload).toMatchObject({
      outcome: "refused",
      code: "no-user-verification",
    });
  });

  it("refuses platform authenticators, U2F-only keys and keys without a PIN before any ceremony", async () => {
    const cases: DoubleOptions[] = [
      { path: "windows://hello" },
      { options: { plat: true, clientPin: true } },
      { options: { clientPin: false } },
      { versions: ["U2F_V2"] },
    ];
    for (const opts of cases) {
      transport = new TransportDouble(opts);
      expect(await codeOf(enrollSecurityKey(ctx(), { label: "x" }))).toBe("no-device");
      expect(transport.calls).not.toContain("make");
    }
  });

  it("enforces the administrator's authenticator allowlist", async () => {
    const config = parseAuthConfig({
      allowedAuthenticators: [
        { aaguid: "6d44ba9b-f6ec-2e49-b930-0c8fe920cb73", attestationCas: [TEST_CA_PEM] },
      ],
    });
    expect(await codeOf(enrollSecurityKey(ctx({ config }), { label: "x" }))).toBe(
      "verification-failed",
    );
    expect(events.at(-1)?.payload).toMatchObject({ code: "attestation-not-allowed" });
    const ok = parseAuthConfig({
      allowedAuthenticators: [
        { aaguid: TEST_AAGUID, description: "test model", attestationCas: [TEST_CA_PEM] },
      ],
    });
    const r = await enrollSecurityKey(ctx({ config: ok }), { label: "y" });
    expect(r.credential.attestation.allowedAs).toBe("test model");
  });

  it("a second key needs a touch of the first, and is not the same key", async () => {
    await enrollSecurityKey(ctx(), { label: "primary" });
    // The same (only) key is plugged in: it already holds an enrolled credential.
    expect(await codeOf(enrollSecurityKey(ctx(), { label: "backup" }))).toBe("no-device");
    expect(
      events.some((e) => e.payload.purpose === "auth-change" && e.payload.outcome === "verified"),
    ).toBe(true);
  });
});

describe("a packed enrollment that no longer verifies is not a second factor", () => {
  const strip = () => {
    const file = path.join(authDir(), "factors.json");
    const store = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const c of store.credentials) {
      delete c.packedEvidence;
    }
    fs.writeFileSync(file, JSON.stringify(store));
  };

  it("enrollment keeps the packed registration, and the gate verifies it again at use", async () => {
    await enrollSecurityKey(ctx(), { label: "primary" });
    const c = readAuthStore(authDir(), "enclawed.local").credentials[0];
    expect(c.attestation.fmt).toBe("packed");
    expect(c.packedEvidence?.x5c.length).toBe(1);
    expect((await assertSecondFactor(ctx(), { purpose: "admin" })).via).toBe("fido2");
    // The same registration under the pinned trust (a software CA): refused at use.
    const pinned = ctx({ packedTrust: undefined });
    await expect(assertSecondFactor(pinned, { purpose: "admin" })).rejects.toThrow(
      /does not chain to a recognized hardware security key/,
    );
  });

  it("an enrollment from before 2.0.3 (no evidence) is refused at use and reported with how to re-enroll", async () => {
    await enrollSecurityKey(ctx(), { label: "old" });
    const oldId = readAuthStore(authDir(), "enclawed.local").credentials[0].id;
    strip();
    let msg = "";
    try {
      await assertSecondFactor(ctx(), { purpose: "admin" });
    } catch (err) {
      msg = (err as Error).message;
      expect((err as SecondFactorError).code).toBe("not-enrolled");
    }
    expect(msg).toMatch(/before Enclawed 2\.0\.3/);
    expect(msg).toContain(`enclawed auth remove ${oldId}`);
    const status = await secondFactorStatus(ctx());
    expect(status.warnings.join("\n")).toMatch(/is not a second factor/);
    expect(status.warnings.join("\n")).toMatch(/no second factor is enrolled/);
  });

  it("the legacy key authorizes the enrollment of a valid replacement (itself included), audited with which legacy credential", async () => {
    await enrollSecurityKey(ctx(), { label: "old" });
    const oldId = readAuthStore(authDir(), "enclawed.local").credentials[0].id;
    strip();
    events = [];
    await enrollSecurityKey(ctx(), { label: "new" });
    const authorize = events.find((e) => e.payload.purpose === "auth-change");
    expect(authorize?.payload).toMatchObject({
      outcome: "verified",
      legacyAuthorization: true,
      credential: oldId,
    });
    expect(events.at(-1)?.payload).toMatchObject({
      outcome: "enrolled",
      authorizedByLegacyCredential: oldId,
    });
    // The replacement counts; the legacy one still does not, and is removed with the replacement.
    expect((await assertSecondFactor(ctx(), { purpose: "admin" })).via).toBe("fido2");
    expect((await removeSecurityKey(ctx(), { id: oldId })).remaining).toBe(1);
    expect((await secondFactorStatus(ctx())).warnings.join("\n")).not.toMatch(
      /is not a second factor/,
    );
  });

  it("the legacy key cannot authorize a replacement that fails the attestation rule (a software or unknown CA)", async () => {
    await enrollSecurityKey(ctx(), { label: "old" });
    strip();
    // A trust that recognizes nothing: the replacement's packed attestation is from an unknown CA.
    const untrusted = ctx({ packedTrust: { models: new Map() } });
    expect(await codeOf(enrollSecurityKey(untrusted, { label: "new" }))).not.toBe("no-error");
    expect(readAuthStore(authDir(), "enclawed.local").credentials).toHaveLength(1);
    expect(events.at(-1)?.payload).toMatchObject({ outcome: "refused" });
  });

  it("the legacy key authorizes nothing else: no session start, unlock, policy change or removal", async () => {
    await enrollSecurityKey(ctx(), { label: "old" });
    const oldId = readAuthStore(authDir(), "enclawed.local").credentials[0].id;
    strip();
    for (const purpose of [
      "session-start",
      "policy-change",
      "admin",
      "recovery",
      "auth-change",
    ] as const) {
      expect(await codeOf(assertSecondFactor(ctx(), { purpose })), purpose).toBe("not-enrolled");
    }
    expect(await codeOf(unlockForHeadlessStart(ctx(), { minutes: 10 }))).toBe("not-enrolled");
    expect(await codeOf(removeSecurityKey(ctx(), { id: oldId }))).not.toBe("no-error");
    expect(readAuthStore(authDir(), "enclawed.local").credentials).toHaveLength(1);
  });

  it("without the legacy key, no enrollment while a legacy credential exists", async () => {
    await enrollSecurityKey(ctx(), { label: "old" });
    strip();
    // Another key is plugged in, holding none of this install's credentials.
    transport = new TransportDouble();
    expect(await codeOf(enrollSecurityKey(ctx(), { label: "attacker" }))).toBe("unknown-key");
    transport.plugged = false;
    expect(await codeOf(enrollSecurityKey(ctx(), { label: "attacker" }))).toBe("no-device");
    expect(readAuthStore(authDir(), "enclawed.local").credentials).toHaveLength(1);
  });
});

describe("gate: interactive FIDO2", () => {
  beforeEach(async () => {
    await enrollSecurityKey(ctx(), { label: "primary" });
    events = [];
  });

  it("verifies, advances the stored counter and audits the success", async () => {
    const r = await assertSecondFactor(ctx(), { purpose: "policy-change", detail: "config set" });
    expect(r.via).toBe("fido2");
    expect(readAuthStore(authDir(), "enclawed.local").credentials[0].signCount).toBe(1);
    await assertSecondFactor(ctx(), { purpose: "admin" });
    expect(readAuthStore(authDir(), "enclawed.local").credentials[0].signCount).toBe(2);
    expect(events.map((e) => e.payload.outcome)).toEqual(["verified", "verified"]);
    expect(JSON.stringify(events)).not.toMatch(/challenge|PIN/i);
  });

  it("refuses a bad signature, a repeated counter and a key that never counts; audits each", async () => {
    transport.corruptNext = true;
    expect(await codeOf(assertSecondFactor(ctx(), { purpose: "admin" }))).toBe(
      "verification-failed",
    );
    await assertSecondFactor(ctx(), { purpose: "admin" });
    const stored = readAuthStore(authDir(), "enclawed.local").credentials[0].signCount;
    transport.forceCounter = stored;
    expect(await codeOf(assertSecondFactor(ctx(), { purpose: "admin" }))).toBe(
      "verification-failed",
    );
    expect(
      events.filter((e) => e.payload.outcome === "refused").map((e) => e.payload.code),
    ).toEqual(["bad-signature", "counter-regressed"]);
  });

  it("locks out after repeated failures", async () => {
    for (let i = 0; i < 5; i++) {
      transport.corruptNext = true;
      await codeOf(assertSecondFactor(ctx(), { purpose: "admin" }));
    }
    expect(await codeOf(assertSecondFactor(ctx(), { purpose: "admin" }))).toBe("backoff");
  });

  it("refuses when the key plugged in is not the enrolled one, or none is plugged in", async () => {
    transport.held.length = 0;
    expect(await codeOf(assertSecondFactor(ctx(), { purpose: "admin" }))).toBe("unknown-key");
    transport.plugged = false;
    expect(await codeOf(assertSecondFactor(ctx(), { purpose: "admin" }))).toBe("no-device");
  });

  it("refuses removing the last factor", async () => {
    const id = readAuthStore(authDir(), "enclawed.local").credentials[0].id;
    expect(await codeOf(removeSecurityKey(ctx(), { id }))).toBe("last-factor");
  });
});

describe("headless: unlock tickets", () => {
  beforeEach(async () => {
    await enrollSecurityKey(ctx(), { label: "primary" });
    events = [];
  });

  it("only a session start may use a ticket; everything else needs a person", async () => {
    await unlockForHeadlessStart(ctx(), { minutes: 10 });
    for (const purpose of [
      "policy-change",
      "recovery",
      "history-restore",
      "admin",
      "disable-protection",
    ] as const) {
      expect(await codeOf(assertSecondFactor(ctx({ interactive: false }), { purpose }))).toBe(
        "headless",
      );
    }
    const r = await assertSecondFactor(ctx({ interactive: false }), { purpose: "session-start" });
    expect(r.via).toBe("ticket");
  });

  it("a ticket is spent after its uses and never renews", async () => {
    await unlockForHeadlessStart(ctx(), { minutes: 10, uses: 1 });
    await assertSecondFactor(ctx({ interactive: false }), { purpose: "session-start" });
    expect(
      await codeOf(assertSecondFactor(ctx({ interactive: false }), { purpose: "session-start" })),
    ).toBe("no-ticket");
  });

  it("a ticket expires", async () => {
    const t0 = Date.now();
    await unlockForHeadlessStart(ctx({ now: () => t0 }), { minutes: 10 });
    expect(
      await codeOf(
        assertSecondFactor(ctx({ interactive: false, now: () => t0 + 10 * 60_000 }), {
          purpose: "session-start",
        }),
      ),
    ).toBe("no-ticket");
    expect(events.at(-1)?.payload).toMatchObject({ outcome: "refused", ticket: "expired" });
  });

  it("unlock refuses lifetimes above the configured maximum (default 36 h, admin may only lower it)", async () => {
    expect(await codeOf(unlockForHeadlessStart(ctx(), { minutes: 36 * 60 + 1 }))).toBe(
      "config-invalid",
    );
    const config = parseAuthConfig({ maxUnlockMinutes: 30 });
    expect(await codeOf(unlockForHeadlessStart(ctx({ config }), { minutes: 31 }))).toBe(
      "config-invalid",
    );
    expect(() => parseAuthConfig({ maxUnlockMinutes: 36 * 60 + 1 })).toThrow(AuthConfigError);
    expect(() => parseAuthConfig({ unlockMinutes: 60, maxUnlockMinutes: 30 })).toThrow(
      AuthConfigError,
    );
  });

  it("a ticket is bound to uid, host and boot", async () => {
    const binding = currentBinding();
    if (!binding) {
      return; // no boot id on this platform: tickets are refused there (unbindable-platform)
    }
    const store = () => readAuthStore(authDir(), "enclawed.local").credentials;
    const check = (b: typeof binding) =>
      consumeTicket({
        dir: authDir(),
        binding: b,
        now: Date.now(),
        rpId: "enclawed.local",
        origin: "enclawed-cli://enclawed.local",
        credentials: store(),
      });
    for (const [field, value, reason] of [
      ["uid", 99999, "wrong-uid"],
      ["hostname", "other-host", "wrong-host"],
      ["bootId", "other-boot", "wrong-boot"],
    ] as const) {
      await unlockForHeadlessStart(ctx(), { minutes: 10 });
      expect(check({ ...binding, [field]: value })).toEqual({ ok: false, reason });
    }
  });

  // Regression (codenclawed audit row 17): tickets were unsigned JSON that any
  // process of this user could write. A ticket is now signed by the security key.
  it("refuses a forged or altered ticket: the security key signs the body", async () => {
    await unlockForHeadlessStart(ctx(), { minutes: 10, uses: 1 });
    const file = ticketFile(authDir());
    const genuine = JSON.parse(fs.readFileSync(file, "utf8"));
    // Lengthen the life, add uses, or rebind: each breaks the signature.
    for (const change of [
      { expiresAt: genuine.body.expiresAt + 3_600_000 },
      { uses: 20 },
      { bootId: "x" },
      { scope: "policy-change" },
    ]) {
      fs.writeFileSync(file, JSON.stringify({ ...genuine, body: { ...genuine.body, ...change } }));
      expect(
        await codeOf(assertSecondFactor(ctx({ interactive: false }), { purpose: "session-start" })),
      ).toBe("no-ticket");
      expect(fs.existsSync(file)).toBe(false);
    }
    // A ticket written from scratch, without the key.
    fs.writeFileSync(
      file,
      JSON.stringify({
        body: genuine.body,
        clientDataJSON: genuine.clientDataJSON,
        authenticatorData: genuine.authenticatorData,
        signature: "AAAA",
      }),
    );
    expect(
      await codeOf(assertSecondFactor(ctx({ interactive: false }), { purpose: "session-start" })),
    ).toBe("no-ticket");
    // The old unsigned v1 format is refused too.
    fs.writeFileSync(
      file,
      JSON.stringify({ v: 1, scope: "session-start", expiresAt: Date.now() + 60_000, usesLeft: 5 }),
    );
    expect(
      await codeOf(assertSecondFactor(ctx({ interactive: false }), { purpose: "session-start" })),
    ).toBe("no-ticket");
    expect(events.filter((e) => e.payload.ticket === "bad-signature").length).toBe(6);
  });

  it("a removed key's tickets no longer verify", async () => {
    await unlockForHeadlessStart(ctx(), { minutes: 10 });
    const file = ticketFile(authDir());
    const saved = fs.readFileSync(file, "utf8");
    const s = readAuthStore(authDir(), "enclawed.local");
    fs.writeFileSync(
      path.join(authDir(), "factors.json"),
      JSON.stringify({ ...s, credentials: [] }),
    );
    fs.writeFileSync(file, saved);
    void readTicket;
    expect(
      consumeTicket({
        dir: authDir(),
        binding: currentBinding(),
        now: Date.now(),
        rpId: "enclawed.local",
        origin: "enclawed-cli://enclawed.local",
        credentials: [],
      }),
    ).toEqual({ ok: false, reason: "unknown-key" });
  });
});

describe("device-verified factor (enclawed-enclaved seam)", () => {
  it("is used only when supplied, and its refusals are audited and counted", async () => {
    let accept = false;
    const deviceFactor: DeviceSecondFactor = {
      kind: "device-totp",
      label: "Enclaweder TOTP code",
      enrolled: async () => true,
      verify: async () => (accept ? { ok: true } : { ok: false, code: "bad-code" }),
    };
    transport.plugged = false;
    const c = ctx({ deviceFactor, readCode: async () => "123456" });
    expect(await codeOf(assertSecondFactor(c, { purpose: "admin" }))).toBe("verification-failed");
    accept = true;
    expect((await assertSecondFactor(c, { purpose: "admin" })).via).toBe("device-totp");
    expect(events.map((e) => [e.payload.via, e.payload.outcome])).toEqual([
      ["device-totp", "refused"],
      ["device-totp", "verified"],
    ]);
  });
});

describe("status", () => {
  it("warns until a backup key is enrolled", async () => {
    expect((await secondFactorStatus(ctx())).warnings[0]).toMatch(/no second factor/);
    await enrollSecurityKey(ctx(), { label: "primary" });
    expect((await secondFactorStatus(ctx())).warnings[0]).toMatch(/backup/);
  });
});

describe("libfido2 output parsing", () => {
  it("parses fido2-token -L including paths with colons", () => {
    expect(
      parseDeviceList(
        "/dev/hidraw4: vendor=0x1050, product=0x0407 (Yubico YubiKey OTP+FIDO+CCID)\nwindows://hello: vendor=0x0000, product=0x0000 (Windows Hello)\n",
      ),
    ).toEqual([
      {
        path: "/dev/hidraw4",
        description: "vendor=0x1050, product=0x0407 (Yubico YubiKey OTP+FIDO+CCID)",
      },
      { path: "windows://hello", description: "vendor=0x0000, product=0x0000 (Windows Hello)" },
    ]);
  });

  it("parses fido2-token -I options and refuses what cannot verify a user", () => {
    const info = parseDeviceInfo(
      [
        "proto: 0x02",
        "version strings: U2F_V2, FIDO_2_0, FIDO_2_1",
        "aaguid: ee882879721c491397753dfcce97072a",
        "options: rk, up, noplat, alwaysUv, credMgmt, authnrCfg, noclientPin, largeBlobs, pinUvAuthToken",
        "algorithms: es256 (public-key), eddsa (public-key)",
      ].join("\n"),
    );
    expect(info.options.get("plat")).toBe(false);
    expect(info.options.get("clientPin")).toBe(false);
    expect(info.algorithms).toEqual(["es256", "eddsa"]);
    const dev = { path: "/dev/hidraw4", description: "", ...info };
    expect(deviceRefusal(dev)?.code).toBe("no-user-verification");
    dev.options.set("clientPin", true);
    expect(deviceRefusal(dev)).toBeNull();
  });
});

describe("gated command table", () => {
  it("gates session starts, policy, recovery, restores and admin; not read-only commands", () => {
    expect(gatedPurposeForCommand(["gateway", "run"])).toBe("session-start");
    expect(gatedPurposeForCommand(["agent"])).toBe("session-start");
    expect(gatedPurposeForCommand(["config", "set"])).toBe("policy-change");
    expect(gatedPurposeForCommand(["history", "restore"])).toBe("history-restore");
    expect(gatedPurposeForCommand(["devices", "approve"])).toBe("admin");
    expect(gatedPurposeForCommand(["uninstall"])).toBe("disable-protection");
    expect(gatedPurposeForCommand(["doctor"], ["node", "enclawed", "doctor", "--fix"])).toBe(
      "policy-change",
    );
    expect(gatedPurposeForCommand(["doctor"], ["node", "enclawed", "doctor"])).toBeNull();
    expect(gatedPurposeForCommand(["gateway", "status"])).toBeNull();
    expect(gatedPurposeForCommand(["history", "list"])).toBeNull();
    expect(gatedPurposeForCommand(["auth", "enroll"])).toBeNull();
    // An embedded agent turn from `infer model run` starts a session like `agent` does;
    // through the gateway it is the gateway's session (gated when the gateway started).
    for (const root of ["infer", "capability"]) {
      expect(
        gatedPurposeForCommand([root, "model", "run"], ["node", "enclawed", root, "model", "run"]),
      ).toBe("session-start");
      expect(
        gatedPurposeForCommand(
          [root, "model", "run"],
          ["node", "enclawed", root, "model", "run", "--local"],
        ),
      ).toBe("session-start");
      expect(
        gatedPurposeForCommand(
          [root, "model", "run"],
          ["node", "enclawed", root, "model", "run", "--gateway"],
        ),
      ).toBeNull();
      expect(gatedPurposeForCommand([root, "model", "list"])).toBeNull();
    }
    // The models commands that write the config need the factor; reading does not.
    for (const p of [
      ["models", "set"],
      ["models", "scan"],
      ["models", "fallbacks", "add"],
      ["models", "auth", "paste-token"],
      ["models", "auth", "order", "set"],
    ]) {
      expect(gatedPurposeForCommand(p)).toBe("policy-change");
    }
    for (const p of [
      ["models", "list"],
      ["models", "status"],
      ["models", "fallbacks", "list"],
      ["models", "auth", "order", "get"],
    ]) {
      expect(gatedPurposeForCommand(p)).toBeNull();
    }
  });
});

describe("every failed attempt is audited and refuses (regressions)", () => {
  const deviceFactor = (verify: DeviceSecondFactor["verify"]): DeviceSecondFactor => ({
    kind: "device-totp",
    label: "code",
    enrolled: async () => true,
    verify,
  });

  it("a cancelled code prompt (Ctrl-C) is a refused, audited attempt", async () => {
    transport.plugged = false;
    const c = ctx({
      deviceFactor: deviceFactor(async () => ({ ok: true })),
      readCode: async () => {
        throw new Error("cancelled");
      },
    });
    expect(await codeOf(assertSecondFactor(c, { purpose: "admin" }))).toBe("verification-failed");
    expect(events.at(-1)?.payload).toMatchObject({
      outcome: "refused",
      via: "device-totp",
      code: "cancelled",
    });
  });

  it("a device verifier that throws is a refused, audited attempt", async () => {
    transport.plugged = false;
    const c = ctx({
      deviceFactor: deviceFactor(async () => {
        throw new Error("device unplugged");
      }),
      readCode: async () => "123456",
    });
    expect(await codeOf(assertSecondFactor(c, { purpose: "admin" }))).toBe("verification-failed");
    expect(events.at(-1)?.payload).toMatchObject({ outcome: "refused", code: "device-error" });
  });

  it("lock contention is a refused, audited attempt (every operation)", async () => {
    await enrollSecurityKey(ctx(), { label: "primary" });
    events = [];
    fs.writeFileSync(path.join(authDir(), "factors.lock"), `${process.pid}\n`);
    const c = ctx({ lockWaitMs: 50 });
    expect(await codeOf(assertSecondFactor(c, { purpose: "session-start" }))).toBe("busy");
    expect(await codeOf(unlockForHeadlessStart(c, { minutes: 5 }))).toBe("busy");
    expect(await codeOf(enrollSecurityKey(c, { label: "b" }))).toBe("busy");
    expect(events.map((e) => [e.type, e.payload.outcome, e.payload.code])).toEqual([
      ["auth.second-factor", "refused", "busy"],
      ["auth.second-factor", "refused", "busy"],
      ["auth.second-factor", "refused", "busy"],
    ]);
    fs.rmSync(path.join(authDir(), "factors.lock"));
  });

  it("a store that breaks during a failed check still leaves an audit record and refuses", async () => {
    await enrollSecurityKey(ctx(), { label: "primary" });
    events = [];
    const factors = path.join(authDir(), "factors.json");
    const orig = transport.getAssertion.bind(transport);
    transport.getAssertion = (p) => {
      const got = orig(p);
      fs.writeFileSync(factors, "{ not json");
      got.sig[got.sig.length - 1] ^= 0xff;
      return got;
    };
    expect(await codeOf(assertSecondFactor(ctx(), { purpose: "admin" }))).toBe(
      "verification-failed",
    );
    expect(events.at(-1)?.payload).toMatchObject({
      outcome: "refused",
      via: "fido2",
      code: "bad-signature",
      failures: null,
    });
  });

  it("an unexpected exception inside an operation is audited as internal-error", async () => {
    await enrollSecurityKey(ctx(), { label: "primary" });
    events = [];
    transport.listDevices = () => {
      throw new TypeError("boom");
    };
    const r = await codeOf(enrollSecurityKey(ctx(), { label: "second" }));
    expect(["internal-error", "no-device", "tools-missing", "verification-failed"]).toContain(r);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.payload.outcome === "refused")).toBe(true);
  });
});

describe("unlock tickets and a wall clock that steps (regression: WSL2 clock stepping ±13 s)", () => {
  beforeEach(async () => {
    await enrollSecurityKey(ctx(), { label: "primary" });
  });
  const consume = (now: number, mono?: bigint) =>
    consumeTicket({
      dir: authDir(),
      binding: currentBinding(),
      now,
      mono,
      rpId: "enclawed.local",
      origin: "enclawed-cli://enclawed.local",
      credentials: readAuthStore(authDir(), "enclawed.local").credentials,
    });

  it("a wall clock stepped back after issuing does not invalidate a ticket", async () => {
    if (!currentBinding()) {
      return;
    }
    const t0 = Date.now();
    await unlockForHeadlessStart(ctx({ now: () => t0 }), { minutes: 10 });
    expect(consume(t0 - 13_000).ok).toBe(true);
  });

  it("setting the wall clock back never lengthens a ticket: the monotonic window still ends it", async () => {
    if (!currentBinding()) {
      return;
    }
    await unlockForHeadlessStart(ctx(), { minutes: 10 });
    const t = readTicket(authDir())!;
    const pastMono = BigInt(t.expiresAtMono) + 1n;
    expect(consume(t.issuedAt, pastMono)).toEqual({ ok: false, reason: "expired" });
  });

  it("a ticket from the future (wall clock far behind, or monotonic before issue) is refused", async () => {
    if (!currentBinding()) {
      return;
    }
    await unlockForHeadlessStart(ctx(), { minutes: 10 });
    const t = readTicket(authDir())!;
    expect(consume(t.issuedAt - 3_600_000)).toEqual({ ok: false, reason: "not-yet-valid" });
    await unlockForHeadlessStart(ctx(), { minutes: 10 });
    const t2 = readTicket(authDir())!;
    expect(consume(t2.issuedAt, BigInt(t2.issuedAtMono) - 1n)).toEqual({
      ok: false,
      reason: "not-yet-valid",
    });
  });
});

// Only a session-start command binds the hardware root: help, version and read-only commands
// once bound the real device and wrote its latch (`enclawed auth --help`).
describe("which invocations bind the hardware root", () => {
  const argv = (...a: string[]) => ["node", "enclawed", ...a];
  it("binds for session-start commands only", () => {
    expect(invocationStartsSession(argv("gateway", "run"), ["gateway", "run"])).toBe(true);
    expect(invocationStartsSession(argv("agent"), ["agent"])).toBe(true);
    expect(invocationStartsSession(argv("auth"), ["auth"])).toBe(false);
    expect(invocationStartsSession(argv("status"), ["status"])).toBe(false);
    expect(invocationStartsSession(argv("config", "set", "a", "b"), ["config", "set"])).toBe(false);
    expect(invocationStartsSession(argv(), [])).toBe(false);
  });
  it("never binds for help or version", () => {
    expect(invocationStartsSession(argv("auth", "--help"), ["auth"])).toBe(false);
    expect(invocationStartsSession(argv("gateway", "run", "--help"), ["gateway", "run"])).toBe(
      false,
    );
    expect(invocationStartsSession(argv("agent", "-h"), ["agent"])).toBe(false);
    expect(invocationStartsSession(argv("--version"), [])).toBe(false);
    expect(invocationStartsSession(argv("help", "gateway"), ["help", "gateway"])).toBe(false);
  });
});
