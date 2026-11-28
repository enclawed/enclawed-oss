// Device-approved digests: measurement, policy, credential approvals (a
// stand-in Enclaweder signing real verdict records) and the launch gate.

import { generateKeyPairSync, sign as edSign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TAG_TOTP_VERDICT, TOTP_PURPOSE } from "../hardware-root/totp-verify.js";
import {
  approvalNonce,
  approveDigest,
  checkDigestApproval,
  decideApprovalGate,
  measureFiles,
  measurementChanged,
  storeApproval,
} from "./digest-approval.js";
import { type DeviceTotpSeam, frameworkDeviceTotp } from "./session.js";

/** A stand-in Enclaweder: checks the code "123456" and signs a verdict body as the real one does. */
function fakeDevice() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = Buffer.from(publicKey.export({ format: "der", type: "spki" }).subarray(12));
  const uid = Buffer.alloc(12, 9);
  const seam: DeviceTotpSeam = {
    ...frameworkDeviceTotp,
    access: () =>
      ({
        pubkeyRaw: pub,
        uid,
        cert: Buffer.alloc(0),
        run: async () => Promise.reject(new Error("unused")),
      }) as never,
    enrolled: async () => true,
    verdict: async (_a, p) => {
      const purpose = TOTP_PURPOSE[p.purpose as keyof typeof TOTP_PURPOSE];
      const body = Buffer.alloc(32);
      body[0] = 1;
      body[1] = purpose;
      body[2] = p.code === "123456" ? 1 : 0;
      body.writeUInt32LE(Math.floor(Date.now() / 30000), 4);
      uid.copy(body, 20);
      const nonce = Buffer.from(p.nonce);
      const sig = edSign(null, Buffer.concat([TAG_TOTP_VERDICT, nonce, body]), privateKey);
      const record = {
        v: 1 as const,
        purpose,
        uid: uid.toString("hex"),
        pubkey: pub.toString("hex"),
        nonce: nonce.toString("hex"),
        body: body.toString("hex"),
        sig: sig.toString("hex"),
      };
      return p.code === "123456"
        ? { ok: true, record, step: 1, stepTimeS: 30, counter: 1n }
        : { ok: false, code: "rejected", record };
    },
  };
  return { seam, device: { pub: pub.toString("hex"), uid: uid.toString("hex") } };
}

let dir: string;
beforeAll(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-digest-approval-")));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const D1 = "a1".repeat(32);
const D2 = "b2".repeat(32);

describe("approvals", () => {
  it("a code the device accepts approves exactly that digest of that kind", async () => {
    const d = fakeDevice();
    const r = await approveDigest({ kind: "policy", digest: D1, code: "123456", device: d.seam });
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(
      checkDigestApproval(r.approval, { kind: "policy", digest: D1, devices: [d.device] }),
    ).toBeNull();
    expect(
      checkDigestApproval(r.approval, { kind: "policy", digest: D2, devices: [d.device] }),
    ).toMatch(/another digest/);
    expect(
      checkDigestApproval(r.approval, { kind: "measurement", digest: D1, devices: [d.device] }),
    ).toMatch(/another kind/);
    // An approval relabeled to another kind or digest does not verify.
    expect(
      checkDigestApproval(
        { ...r.approval, kind: "measurement" },
        { kind: "measurement", digest: D1, devices: [d.device] },
      ),
    ).toMatch(/does not verify/);
    expect(
      checkDigestApproval(
        { ...r.approval, digest: D2 },
        { kind: "policy", digest: D2, devices: [d.device] },
      ),
    ).toMatch(/does not verify/);
    // Another device's approval does not count.
    expect(
      checkDigestApproval(r.approval, {
        kind: "policy",
        digest: D1,
        devices: [fakeDevice().device],
      }),
    ).toMatch(/does not verify/);
  });

  it("a wrong code, or no device, approves nothing", async () => {
    const d = fakeDevice();
    const r = await approveDigest({
      kind: "measurement",
      digest: D1,
      code: "000000",
      device: d.seam,
    });
    expect(!r.ok && r.code).toBe("rejected");
    const none = await approveDigest({
      kind: "measurement",
      digest: D1,
      code: "123456",
      device: { ...d.seam, access: () => null },
    });
    expect(!none.ok && none.code).toBe("no-device");
  });

  it("the kinds' nonces are domain-separated", () => {
    expect(approvalNonce("policy", D1).equals(approvalNonce("measurement", D1))).toBe(false);
    expect(approvalNonce("policy", D1).equals(approvalNonce("credential", D1))).toBe(false);
    expect(() => approvalNonce("policy", "xyz")).toThrow();
  });
});

describe("measured launch", () => {
  it("measures files to one digest and notices any write, even a restore", () => {
    const f = path.join(dir, "hook.mjs");
    fs.writeFileSync(f, "a");
    const m = measureFiles([{ name: "hook", path: f }]);
    expect(measureFiles([{ name: "hook", path: f }]).digest).toBe(m.digest);
    expect(measurementChanged(m.stamps)).toBeNull();
    fs.writeFileSync(f, "b");
    fs.writeFileSync(f, "a");
    expect(measurementChanged(m.stamps)).toBe(f);
    expect(measureFiles([{ name: "hook", path: f }]).digest).toBe(m.digest);
    fs.writeFileSync(f, "evil");
    expect(measureFiles([{ name: "hook", path: f }]).digest).not.toBe(m.digest);
    expect(() => measureFiles([{ name: "x", path: path.join(dir, "missing") }])).toThrow();
  });
});

describe("decideApprovalGate", () => {
  it("with the root required: refuses an unapproved measurement or policy, admits approved ones", async () => {
    const d = fakeDevice();
    const file = path.join(dir, "approvals.json");
    const base = {
      rootRequired: true,
      approvalsFile: file,
      devices: [d.device],
      measurementDigest: D1,
      policyDigest: D2,
      policyNeedsApproval: true,
    };
    const g0 = decideApprovalGate(base);
    expect(!g0.ok && g0.code).toBe("measurement-not-approved");
    const m = await approveDigest({
      kind: "measurement",
      digest: D1,
      code: "123456",
      device: d.seam,
    });
    storeApproval(file, m.ok ? m.approval : (null as never));
    const g1 = decideApprovalGate(base);
    expect(!g1.ok && g1.code).toBe("policy-not-approved");
    expect(decideApprovalGate({ ...base, policyNeedsApproval: false }).ok).toBe(true);
    // The attacker's own policy (another digest) is not covered by the person's approval.
    const p = await approveDigest({ kind: "policy", digest: D2, code: "123456", device: d.seam });
    storeApproval(file, p.ok ? p.approval : (null as never));
    expect(decideApprovalGate(base).ok).toBe(true);
    const evil = decideApprovalGate({ ...base, policyDigest: "c3".repeat(32) });
    expect(!evil.ok && evil.code).toBe("policy-not-approved");
    // A forged approval written into the file does not count.
    const forged = { ...(p.ok ? p.approval : {}), digest: "c3".repeat(32) };
    storeApproval(file, forged as never);
    expect(decideApprovalGate({ ...base, policyDigest: "c3".repeat(32) }).ok).toBe(false);
    // An upgrade changes the measurement: refused until approved again.
    expect(decideApprovalGate({ ...base, measurementDigest: "d4".repeat(32) }).ok).toBe(false);
  });

  it("without the root required nothing is asked", () => {
    expect(
      decideApprovalGate({
        rootRequired: false,
        approvalsFile: path.join(dir, "none.json"),
        devices: [],
        measurementDigest: D1,
        policyDigest: D2,
        policyNeedsApproval: true,
      }).ok,
    ).toBe(true);
  });
});

describe("policyNeedsApproval", () => {
  it("a user policy file read into the effective policy needs one; managed, default or unread do not", async () => {
    const { policyNeedsApproval } = await import("./digest-approval.js");
    expect(policyNeedsApproval({ kind: "user", note: null })).toBe(true);
    expect(policyNeedsApproval({ kind: "managed", note: null })).toBe(false);
    expect(policyNeedsApproval({ kind: null, note: null })).toBe(false);
    expect(policyNeedsApproval({ kind: "gateway", note: "not read" })).toBe(false);
  });
});
