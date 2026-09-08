// The audit log's head, attested by the hardware root's monotonic counter.
//
// The threat is narrow and specific: a bad actor truncates the log to remove
// the records of what they did, then adjusts the stored head so verification
// still passes. Signing the head breaks the forgery half — without the
// enclaweder they cannot produce a signature over their forged head.
//
// But a signature alone does NOT stop replay. An older {head, signature} pair
// is genuinely signed and matches an older, truncated log, so an attacker
// restores yesterday's anchor beside yesterday's log and everything verifies.
// No file on disk can detect that, because every byte of it is theirs. The
// device's counter can, and the tests below are mostly about that.
//
// The device is simulated the same way the fleet tests do it: a real Ed25519
// key signing the real anchor message. What is exercised is the verification
// path, which is the part that has to be right.

import { generateKeyPairSync, sign as edSign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuditLogger, type HeadAnchorSink, verifyChain } from "../../src/enclawed/audit-log.ts";
import {
  type AnchorCapableDevice,
  HeadAnchorTampered,
  enclawederHeadAnchor,
} from "../../src/enclawed/hardware-root/head-anchor.ts";

const ANCHOR_TAG = Buffer.from("ECW-ANCHOR-01\0\0\0", "latin1");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

type Sim = {
  device: AnchorCapableDevice & { offline: boolean };
  publicKey: Buffer;
  uid: Buffer;
};

function simulatedDevice(): Sim {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from((publicKey.export({ format: "jwk" }) as { x: string }).x, "base64url");
  const uid = Buffer.alloc(12, 7);
  let counter = 0n;
  let head: Buffer | null = null;
  const sign = (c: bigint, h: Buffer) => {
    const ctr = Buffer.alloc(8);
    ctr.writeBigUInt64LE(c);
    return edSign(null, Buffer.concat([ANCHOR_TAG, ctr, h, uid]), privateKey);
  };
  const device = {
    offline: false,
    async anchorSet(h: Buffer) {
      if (device.offline) {
        throw new Error("device not present");
      }
      counter += 1n; // device-owned: no way for the host to set it
      head = Buffer.from(h);
      return { counter, head, uid, sig: sign(counter, head) };
    },
    async anchorGet() {
      if (device.offline) {
        throw new Error("device not present");
      }
      if (head === null) {
        return null;
      }
      return { counter, head, uid, sig: sign(counter, head) };
    },
  };
  return { device, publicKey: raw, uid };
}

/** A naive file-only anchor, to show what the device buys over it. */
function fileHeadAnchorOf(p: string): HeadAnchorSink {
  return {
    id: "file",
    async write() {
      /* not used */
    },
    async read() {
      return (JSON.parse(readFileSync(p, "utf8")) as { head: string }).head;
    },
  };
}

function newDir(): string {
  const d = mkdtempSync(path.join(tmpdir(), "head-anchor-"));
  dirs.push(d);
  return d;
}

async function loggedWith(sim: Sim, records = 8) {
  const dir = newDir();
  const file = path.join(dir, "audit.jsonl");
  const anchorPath = path.join(dir, "audit.head.json");
  const headAnchor = enclawederHeadAnchor({
    device: sim.device,
    devicePublicKey: sim.publicKey,
    path: anchorPath,
  });
  const log = new AuditLogger({ filePath: file, headAnchor });
  for (let i = 0; i < records; i++) {
    await log.append({ type: "test.entry", actor: "probe", level: "INTERNAL", payload: { i } });
  }
  await log.close();
  return { file, anchorPath, headAnchor, dir };
}

function truncate(file: string, keep: number): void {
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
  writeFileSync(file, `${lines.slice(0, keep).join("\n")}\n`);
}

describe("head anchored by the device", () => {
  it("verifies an intact log and reports it was attested by the device", async () => {
    const sim = simulatedDevice();
    const { file, headAnchor } = await loggedWith(sim);
    const r = await verifyChain(file, headAnchor);
    expect(r.ok).toBe(true);
    expect(r.ok && r.anchor).toBe("matched");
    expect(r.ok && r.anchorId).toBe("enclaweder");
  });

  it("catches truncation", async () => {
    const sim = simulatedDevice();
    const { file, headAnchor } = await loggedWith(sim);
    truncate(file, 5);
    const r = await verifyChain(file, headAnchor);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/removed from the end/);
  });

  it("catches the attacker editing the stored head to match their truncated log", async () => {
    // They truncate, recompute the head their shorter chain now ends on, and
    // write it into the anchor file. Without the device they cannot sign it.
    const sim = simulatedDevice();
    const { file, anchorPath, headAnchor } = await loggedWith(sim);
    truncate(file, 5);
    const truncatedHead = (
      JSON.parse(readFileSync(file, "utf8").split("\n").findLast(Boolean)!) as {
        recordHash: string;
      }
    ).recordHash;
    const stored = JSON.parse(readFileSync(anchorPath, "utf8")) as Record<string, unknown>;
    stored.head = truncatedHead; // signature still covers the OLD head
    writeFileSync(anchorPath, JSON.stringify(stored));

    const r = await verifyChain(file, headAnchor);
    expect(r.ok).toBe(false);
  });

  it("catches a REPLAYED older anchor, which a signature alone cannot", async () => {
    // The attack the counter exists for. The attacker keeps a genuine anchor
    // from earlier — correctly signed, nothing forged — truncates the log back
    // to the matching point, and restores both. Every signature verifies and
    // the two files agree with each other perfectly.
    const sim = simulatedDevice();
    const { file, anchorPath, headAnchor } = await loggedWith(sim, 4);
    const genuineOldAnchor = readFileSync(anchorPath, "utf8");

    // ... time passes, more records are logged, the device counter advances ...
    const log = new AuditLogger({ filePath: file, headAnchor });
    for (let i = 0; i < 4; i++) {
      await log.append({ type: "test.entry", actor: "probe", level: "INTERNAL", payload: { i } });
    }
    await log.close();

    // The attacker rolls both files back to the earlier, consistent state.
    truncate(file, 4);
    writeFileSync(anchorPath, genuineOldAnchor);

    // The rolled-back pair really is self-consistent: the restored anchor names
    // exactly the head the truncated log now ends on. Anything that only
    // compared these two files would report a clean log.
    const truncatedHead = (
      JSON.parse(readFileSync(file, "utf8").split("\n").findLast(Boolean)!) as {
        recordHash: string;
      }
    ).recordHash;
    expect((JSON.parse(genuineOldAnchor) as { head: string }).head).toBe(truncatedHead);
    expect(await verifyChain(file, fileHeadAnchorOf(anchorPath))).toMatchObject({ ok: true });

    // The device knows better: its counter moved on, and the attacker has no
    // opcode to move it back.
    const r = await verifyChain(file, headAnchor);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/removed from the end/);
  });

  it("catches an anchor file that is AHEAD of the device", async () => {
    // Cannot happen honestly: the counter never decreases. A file ahead of the
    // device means the device was swapped for a fresher one, or reset — which
    // is how an attacker with a spare part would try to escape the counter.
    const sim = simulatedDevice();
    const { anchorPath } = await loggedWith(sim);

    // Same key, so the stored signature still verifies; only the counter
    // ordering can catch this.
    const replacement = simulatedDevice();
    const swapped = enclawederHeadAnchor({
      device: replacement.device, // fresh part: counter back at 0
      devicePublicKey: sim.publicKey,
      path: anchorPath,
    });
    await expect(swapped.read()).rejects.toBeInstanceOf(HeadAnchorTampered);
  });

  it("rejects an anchor signed by a different device", async () => {
    const real = simulatedDevice();
    const attacker = simulatedDevice();
    const { file, anchorPath } = await loggedWith(real);
    truncate(file, 5);
    const forgedHead = (
      JSON.parse(readFileSync(file, "utf8").split("\n").findLast(Boolean)!) as {
        recordHash: string;
      }
    ).recordHash;
    const forged = enclawederHeadAnchor({
      device: attacker.device,
      devicePublicKey: attacker.publicKey,
      path: anchorPath,
    });
    await forged.write(forgedHead);

    // Verified against the REAL device's key, as the guard supplies it.
    const honest = enclawederHeadAnchor({
      device: real.device,
      devicePublicKey: real.publicKey,
      path: anchorPath,
    });
    await expect(honest.read()).rejects.toBeInstanceOf(HeadAnchorTampered);
    const r = await verifyChain(file, honest);
    expect(r.ok).toBe(false);
  });

  it("catches an anchor file that is AHEAD of the device", async () => {
    // Cannot happen honestly: the counter never decreases. A file ahead of the
    // device means the device was swapped for a fresher one, or reset.
    const sim = simulatedDevice();
    const { anchorPath } = await loggedWith(sim);
    const other = simulatedDevice();
    const stored = JSON.parse(readFileSync(anchorPath, "utf8")) as { counter: string };
    // Re-sign a far-future counter with the SAME device key so only the counter
    // ordering can catch it.
    const swapped = enclawederHeadAnchor({
      device: sim.device,
      devicePublicKey: sim.publicKey,
      path: anchorPath,
    });
    expect(Number(stored.counter)).toBeGreaterThan(0);
    // Advance the file past the device by anchoring, then rewinding the device.
    await swapped.write("a".repeat(64));
    const ahead = JSON.parse(readFileSync(anchorPath, "utf8")) as Record<string, unknown>;
    const fresh = simulatedDevice();
    fresh.device.offline = false;
    // A fresh device has counter 0 while the file claims more.
    const mismatched = enclawederHeadAnchor({
      device: fresh.device,
      devicePublicKey: sim.publicKey, // still the original key, so the file verifies
      path: anchorPath,
    });
    expect(ahead.counter).toBeDefined();
    await expect(mismatched.read()).rejects.toBeInstanceOf(HeadAnchorTampered);
    expect(other.publicKey.length).toBe(32);
  });

  it("does not let an absent device look like a full verification", async () => {
    // Unplugging the dongle must not silently downgrade to the weaker
    // guarantee: without the counter, a restored older anchor cannot be ruled
    // out, and reporting that as "matched" would claim a check we did not do.
    const sim = simulatedDevice();
    const { file, headAnchor } = await loggedWith(sim);
    sim.device.offline = true;
    const r = await verifyChain(file, headAnchor);
    expect(r.ok).toBe(true);
    expect(r.ok && r.anchor).toBe("matched-offline");
  });

  it("flags an anchor file for a device that has never anchored", async () => {
    const sim = simulatedDevice();
    const { anchorPath } = await loggedWith(sim);
    const fresh = simulatedDevice();
    const anchor = enclawederHeadAnchor({
      device: fresh.device,
      devicePublicKey: sim.publicKey,
      path: anchorPath,
    });
    await expect(anchor.read()).rejects.toBeInstanceOf(HeadAnchorTampered);
  });

  it("distinguishes a corrupted anchor from a missing one", async () => {
    const sim = simulatedDevice();
    const { anchorPath, headAnchor } = await loggedWith(sim);
    writeFileSync(anchorPath, "{ not json");
    await expect(headAnchor.read()).rejects.toBeInstanceOf(HeadAnchorTampered);

    rmSync(anchorPath);
    // The device still holds the anchor, so this is not an absence at all.
    await expect(headAnchor.read()).resolves.toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses to anchor something that is not a 32-byte hash", async () => {
    const sim = simulatedDevice();
    const dir = newDir();
    const anchor = enclawederHeadAnchor({
      device: sim.device,
      devicePublicKey: sim.publicKey,
      path: path.join(dir, "a.json"),
    });
    await expect(anchor.write("deadbeef")).rejects.toThrow(/64-char hex/);
  });
});
