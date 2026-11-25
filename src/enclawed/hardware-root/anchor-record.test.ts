// Anchor record v1/v2 parsing and verification: the record layouts the device returns and the
// signatures this host checks over them.
import { generateKeyPairSync, sign as edSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  Enclaweder,
  parseAnchor,
  verifyAnchor,
  verifyAnchorRecord,
  verifyAnchorV2,
} from "./enclaweder-hid.js";
import type { HidTransport } from "./hid-transport.js";

const le64 = (v: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
};

function keys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from((publicKey.export({ format: "jwk" }) as { x: string }).x, "base64url");
  return { raw, privateKey };
}

describe("anchor record parsing", () => {
  const head = Buffer.alloc(32, 0xab);
  const uid = Buffer.alloc(12, 3);

  it("parses and verifies a 117-byte v1 record", () => {
    const { raw, privateKey } = keys();
    const sig = edSign(
      null,
      Buffer.concat([Buffer.from("ECW-ANCHOR-01\0\0\0", "latin1"), le64(9n), head, uid]),
      privateKey,
    );
    const r = parseAnchor(Buffer.concat([Buffer.from([0]), le64(9n), head, uid, sig]));
    expect(r).toMatchObject({ version: 1, counter: 9n, sess: 0n, opens: 0n });
    expect(r.head.equals(head) && r.uid.equals(uid)).toBe(true);
    expect(verifyAnchorRecord(raw, r)).toBe(true);
    expect(verifyAnchor(raw, r.counter, r.head, r.uid, r.sig)).toBe(true);
  });

  it("parses and verifies a 134-byte v2 record, and the tags do not cross", () => {
    const { raw, privateKey } = keys();
    const body = Buffer.concat([le64(9n), head, uid, le64(4n), le64(5n)]);
    const sig = edSign(
      null,
      Buffer.concat([Buffer.from("ECW-ANCHOR-02\0\0\0", "latin1"), body]),
      privateKey,
    );
    const p = Buffer.concat([Buffer.from([0, 2]), body, sig]);
    expect(p.length).toBe(134);
    const r = parseAnchor(p);
    expect(r).toMatchObject({ version: 2, counter: 9n, sess: 4n, opens: 5n });
    expect(verifyAnchorRecord(raw, r)).toBe(true);
    expect(verifyAnchorV2(raw, 9n, head, uid, 4n, 5n, r.sig)).toBe(true);
    // A v2 signature never verifies as v1, and sess/opens are covered.
    expect(verifyAnchor(raw, r.counter, r.head, r.uid, r.sig)).toBe(false);
    expect(verifyAnchorRecord(raw, { ...r, version: 1 })).toBe(false);
    expect(verifyAnchorRecord(raw, { ...r, sess: 5n })).toBe(false);
    expect(verifyAnchorRecord(raw, { ...r, opens: 6n })).toBe(false);
  });

  it("refuses any other length", () => {
    expect(() => parseAnchor(Buffer.alloc(116))).toThrow(/unrecognized 116-byte/);
    expect(() => parseAnchor(Buffer.alloc(134))).toThrow(/unrecognized/); // version byte 0
    expect(() => parseAnchor(Buffer.alloc(135))).toThrow(/unrecognized/);
  });
});

describe("Enclaweder anchor API", () => {
  const idle: HidTransport = {
    writeReport() {},
    readReport() {
      return 0;
    },
    close() {},
  };

  it("refuses anchorSet without a session opened on this device", async () => {
    const dev = new Enclaweder("sim", idle);
    const bare = dev.anchorSet as unknown as (h: Buffer) => Promise<unknown>;
    await expect(bare.call(dev, Buffer.alloc(32))).rejects.toThrow(/requires an anchor session/);
  });
});
