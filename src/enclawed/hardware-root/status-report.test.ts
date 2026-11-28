// The status diagnosis, decided and rendered from plain fixtures (what hardwareRootStatusStandalone
// returns after it has read and verified the devices).
import { describe, expect, it } from "vitest";
import type { DeviceLatchState } from "./device-latch.js";
import {
  diagnoseHardwareRoot,
  renderHardwareRootDiagnosis,
  type StatusDeviceInput,
  type StatusInput,
} from "./status-report.js";

const UID = "a0a1a2a3a4a5a6a7a8a9aaab";
const OTHER = "b0b1b2b3b4b5b6b7b8b9babb";
const PUB = "11".repeat(32);

function latch(over: Partial<DeviceLatchState> = {}): DeviceLatchState {
  return {
    state: "CLEAR",
    reason: 0,
    reasonText: "none",
    hostCode: 0,
    flags: 0x02,
    operatorAuthority: false,
    factorsValid: true,
    twoFactorLocked: false,
    armed: false,
    sessionLive: false,
    custodyHandedOver: false,
    codesLeft: 8,
    failedAttempts: 0,
    lastEvent: 0,
    seq: 4n,
    setSeq: 0n,
    sid: 0n,
    sinceMs: null,
    codeEpoch: 1,
    custody: 0,
    codeWaitMs: 0,
    factorKind: "authenticator-app",
    uid: Buffer.from(UID, "hex"),
    ...over,
  };
}

function device(over: Partial<StatusDeviceInput> = {}): StatusDeviceInput {
  return {
    path: "/dev/hidraw3",
    serial: `ENCLW-${UID.toUpperCase()}`,
    uid: UID,
    pubkey: PUB,
    state: 3,
    cert: "valid",
    sku: "base",
    keyProof: true,
    latch: latch(),
    latchError: null,
    latchErrorCode: null,
    failures: { total: 0n, pending: 0, entries: [] },
    custody: null,
    ...over,
  };
}

const input = (devices: StatusDeviceInput[], over: Partial<StatusInput> = {}): StatusInput => ({
  hostLatches: [],
  owner: null,
  devices,
  ...over,
});

const boundTo = (uid: string, pubkey = PUB, status = "CLEAN") => ({
  path: "/tmp/x.state",
  status,
  bound: { uid, pubkey, serial: `ENCLW-${uid.toUpperCase()}` },
  dirty: status === "DIRTY" ? { reason: "device disconnected" } : null,
});

/** Nothing a user reads may name a device command, opcode, status code or protocol tag. */
const PROTOCOL =
  /LATCH_|TOTP_VERIFY|SIGN_ATTESTED|ANCHOR_|ERR_|GET_|CHALLENGE|0x[0-9a-f]{2}|command set|ECW-|status \d/i;

function check(i: StatusInput) {
  const dx = diagnoseHardwareRoot(i);
  const text = renderHardwareRootDiagnosis(dx);
  expect(text).not.toMatch(PROTOCOL);
  expect(JSON.stringify(dx)).not.toMatch(PROTOCOL);
  expect(text).toContain(`(exit ${dx.exitCode})`);
  return { dx, text, dev: dx.devices[0] };
}

describe("hardware-root status diagnosis", () => {
  it("no device: exit 3, plug it in (or attach it on WSL)", () => {
    const { dx, text } = check(input([]));
    expect(dx).toMatchObject({ verdict: "no-device", exitCode: 3 });
    expect(text).toContain("No Enclaweder detected.");
    expect(text).toContain("usbipd attach");
  });

  it("a genuine, operational, CLEAN device: exit 0 and nothing to do", () => {
    const { dx, text, dev } = check(input([device()], { hostLatches: [boundTo(UID)] }));
    expect(dx).toMatchObject({ verdict: "ok", exitCode: 0 });
    expect(dev).toMatchObject({
      genuine: { status: "genuine" },
      operational: { status: "operational" },
      zeroization: { status: "not-zeroized" },
      halt: { status: "CLEAN", reason: null },
      recovery: { authenticator: "authenticator-app", codesLeft: 8, locked: false },
      todo: [],
    });
    expect(text).toContain(`Enclaweder ENCLW-${UID.toUpperCase()}`);
    expect(text).toContain("Genuine:      yes");
    expect(text).toContain("Halt state:   CLEAN");
    expect(text).not.toContain("What to do");
  });

  it("DIRTY after an unplug: exit 2, the reason in plain words, recover with both factors", () => {
    const l = latch({ state: "SET", reason: 6, reasonText: "x", sinceMs: 42_000 });
    const { dx, dev, text } = check(input([device({ latch: l })]));
    expect(dx.exitCode).toBe(2);
    expect(dev.halt).toEqual({
      status: "DIRTY",
      reason: "unplugged or lost power during a session, 42 s ago",
    });
    expect(dev.todo.join("\n")).toMatch(/enclawed hardware-root recover.*recovery code/);
    expect(text).toContain("What to do:");
  });

  it("DIRTY with the two-factor path locked: contact your operators, not recover", () => {
    const l = latch({ state: "SET", reason: 7, twoFactorLocked: true, failedAttempts: 5 });
    const { dev, text } = check(input([device({ latch: l })]));
    expect(dev.halt.reason).toMatch(/^tamper detected/);
    expect(dev.todo.join("\n")).toMatch(/locked .* contact your operators/);
    expect(dev.todo.join("\n")).not.toMatch(/run `enclawed hardware-root recover`/);
    expect(dev.todo.join("\n")).toMatch(/5 failed recovery attempts/);
    expect(text).toContain("LOCKED after repeated failures");
  });

  it("DIRTY with no authenticator set up: the operators recover it", () => {
    const l = latch({ state: "SET", reason: 4, factorsValid: false, factorKind: "none" });
    const { dev } = check(input([device({ latch: l })]));
    expect(dev.recovery?.authenticator).toBe("none");
    expect(dev.todo.join("\n")).toMatch(/not set up on this device: contact your operators/);
  });

  it("zeroized: exit 3, keys destroyed, do not use and re-provision", () => {
    const { dx, dev, text } = check(
      input([device({ state: 5, cert: "missing", keyProof: null, latch: null })]),
    );
    expect(dx.exitCode).toBe(3);
    expect(dev.zeroization.status).toBe("zeroized");
    expect(dev.genuine.status).toBe("unprovisioned");
    expect(dev.operational.status).toBe("not-operational");
    expect(dev.todo.join("\n")).toMatch(/Do not use this unit.*re-provision/);
    expect(text).toContain("Zeroization:  ZEROIZED");
  });

  it("not genuine: a certificate that does not verify, or no proof of the key, means stop", () => {
    for (const over of [{ cert: "invalid" as const }, { keyProof: false }]) {
      const { dx, dev } = check(input([device(over)]));
      expect(dx.exitCode).toBe(3);
      expect(dev.genuine.status).toBe("not-genuine");
      expect(dev.todo.join("\n")).toMatch(/may be counterfeit/);
    }
  });

  it("firmware too old: not operational, update the firmware", () => {
    const { dx, dev } = check(
      input([device({ latch: null, latchErrorCode: "unsupported", latchError: "too old" })]),
    );
    expect(dx.exitCode).toBe(3);
    expect(dev.operational.detail).toBe("its firmware is too old");
    expect(dev.todo).toContain("Update the Enclaweder firmware.");
  });

  it("a fault, a device still starting, and one that does not answer are not operational", () => {
    expect(check(input([device({ state: 6 })])).dev.todo.join("\n")).toMatch(/reports a fault/);
    expect(check(input([device({ state: 1 })])).dev.todo.join("\n")).toMatch(/starting up/);
    const silent = check(input([device({ state: null, keyProof: null, latch: null })]));
    expect(silent.dx.exitCode).toBe(3);
    expect(silent.dev.operational.detail).toBe("it does not answer");
  });

  it("a different unit than the one this computer is bound to: exit 3, plug the bound one in", () => {
    const { dx, dev } = check(input([device()], { hostLatches: [boundTo(OTHER)] }));
    expect(dx.exitCode).toBe(3);
    expect(dev.zeroization.status).toBe("different-unit");
    expect(dev.zeroization.detail).toContain(`ENCLW-${OTHER.toUpperCase()}`);
    expect(dev.todo.join("\n")).toMatch(/Plug in the unit this computer is bound to/);
  });

  it("the same serial with new keys is a re-provisioned unit, adopted through recovery", () => {
    const { dev } = check(input([device()], { hostLatches: [boundTo(UID, "22".repeat(32))] }));
    expect(dev.zeroization).toMatchObject({ status: "different-unit" });
    expect(dev.zeroization.detail).toMatch(/re-provisioned/);
    expect(dev.todo.join("\n")).toMatch(/re-provisioned .* recover/);
  });

  it("few recovery codes left: ask for a new set; a security key is named as such", () => {
    const l = latch({ codesLeft: 1, factorKind: "security-key" });
    const { dx, dev, text } = check(input([device({ latch: l })]));
    expect(dx.exitCode).toBe(0);
    expect(dev.todo.join("\n")).toMatch(/Only 1 recovery code\(s\) left.*reissue/);
    expect(text).toContain("security key enrolled");
  });

  it("this computer's DIRTY record for a unit that is not plugged in", () => {
    const { dx, text } = check(input([], { hostLatches: [boundTo(OTHER, PUB, "DIRTY")] }));
    expect(dx.exitCode).toBe(3);
    expect(dx.hostRecords).toEqual([
      { serial: `ENCLW-${OTHER.toUpperCase()}`, reason: "device disconnected" },
    ]);
    expect(text).toMatch(/plug that unit in and run `enclawed hardware-root recover`/);
  });

  it("a device owned by another Enclawed process: its health decides the exit code", () => {
    expect(check(input([], { owner: { status: "CLEAN" } })).dx.exitCode).toBe(0);
    const dirty = check(input([], { owner: { status: "DIRTY", reason: "tamper" } }));
    expect(dirty.dx.exitCode).toBe(2);
    expect(dirty.text).toMatch(/Stop the Enclawed processes/);
    expect(check(input([], { owner: { status: "UNAVAILABLE", reason: "gone" } })).dx.exitCode).toBe(
      3,
    );
  });
});
