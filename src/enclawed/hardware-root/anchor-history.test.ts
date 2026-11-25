// The audit anchor's history (records v1, v2 and v3) and the device comparison of a log as found.
//
// Evidence: the firmware's own record v3 (its command set 0.5 test vectors, emulator keys)
// read as a history line here, and the command set 0.5 stand-in
// device (cs05-standin.test-support.ts) driving the real head-anchor sink, history writer and
// comparison. No real device.
import { generateKeyPairSync, randomBytes, sign as edSign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clearActivations, deviceFactorActivations } from "./activation.js";
import {
  anchorFilePath,
  anchorHistoryLine,
  anchorHistoryPath,
  appendAnchorHistory,
  compareAnchoredLog,
  parseAnchorHistory,
  readAnchorHistory,
  verifySignedAnchorRecord,
} from "./anchor-history.js";
import { decideAuditAnchorVerdict } from "./audit-anchor-verdict.js";
import { activate, direct, StandIn, unlockRecord } from "./cs05-standin.test-support.js";
import { AnchorSession, parseAnchor } from "./enclaweder-hid.js";
import { closeHeadAnchorSessions, enclawederHeadAnchor } from "./head-anchor.js";

const H = (s: string) => Buffer.from(s, "hex");
const le64 = (v: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anchor-history-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => clearActivations());

// The firmware's own answers (its command set 0.5 test vectors).
const FW = {
  devicePub: H("8f5afc0046ac44844e4dff950c473910e689fbf7acc76cefb06f0d1c5d4b5ac6"),
  recordV3: H(
    "00030100000000000000fbd943e1138ac25e2368cdb71c4d4c7d7f16fbe089c5e8883f2e81e82142421cd3c226e2e4b0354c72ead9e9010000000000000001000000000000000200000002879303000000000000000001000000000000000300000000000000f80a9cc3e8fe3f1aaf0b875043315ee4410a8196313b51999bd67e3ed23d2d72519b9050cd4c0a08e80a4486c6eb42bfdfe3ec78d2f2d366c9adacf35e20f40d",
  ),
};

/** A history line for the firmware's record v3, exactly as the writer records it. */
function fwLine(): Record<string, unknown> {
  const a = parseAnchor(FW.recordV3);
  return {
    version: 3,
    head: a.head.toString("hex"),
    counter: a.counter.toString(),
    uid: a.uid.toString("hex"),
    sig: a.sig.toString("base64"),
    sess: a.sess.toString(),
    opens: a.opens.toString(),
    bind: a.bind!.toString("hex"),
    ts: 1,
  };
}

describe("history lines: exact field binding per record version", () => {
  it("the firmware's record v3 verifies as a v3 line, with its binding", () => {
    const r = verifySignedAnchorRecord(fwLine(), FW.devicePub);
    expect(r).toMatchObject({ version: 3, counter: 1n, sess: 1n, opens: 1n });
    expect(r?.bind).toBe(parseAnchor(FW.recordV3).bind!.toString("hex"));
    // The writer's own line for it reads back identically.
    expect(verifySignedAnchorRecord(JSON.parse(anchorHistoryLine(r!, 5)), FW.devicePub)).toEqual(r);
  });

  it("a v3 signature is never accepted as a lower version, and a v3 line missing a signed field fails", () => {
    const l = fwLine();
    const { version: _v, sess: _s, opens: _o, bind: _b, ...v1Shape } = l;
    expect(verifySignedAnchorRecord(v1Shape, FW.devicePub)).toBeNull(); // the defect's line: v3 read as v1
    expect(verifySignedAnchorRecord({ ...v1Shape, version: 1 }, FW.devicePub)).toBeNull();
    const { bind: _b2, ...noBind } = l;
    expect(verifySignedAnchorRecord(noBind, FW.devicePub)).toBeNull(); // v3 without its binding
    expect(verifySignedAnchorRecord({ ...noBind, version: 2 }, FW.devicePub)).toBeNull(); // read as v2
    for (const k of ["head", "counter", "uid", "sig", "sess", "opens"]) {
      const { [k]: _x, ...rest } = l;
      expect(verifySignedAnchorRecord(rest, FW.devicePub), k).toBeNull();
    }
  });

  it("an altered binding, session, open count, an unknown version or an unsigned extra field fails", () => {
    const l = fwLine();
    const flip = (hex: string) => (hex[0] === "0" ? "1" : "0") + hex.slice(1);
    expect(
      verifySignedAnchorRecord({ ...l, bind: flip(l.bind as string) }, FW.devicePub),
    ).toBeNull();
    expect(verifySignedAnchorRecord({ ...l, sess: "2" }, FW.devicePub)).toBeNull();
    expect(verifySignedAnchorRecord({ ...l, opens: "2" }, FW.devicePub)).toBeNull();
    expect(verifySignedAnchorRecord({ ...l, version: 4 }, FW.devicePub)).toBeNull();
    expect(verifySignedAnchorRecord({ ...l, version: "3" }, FW.devicePub)).toBeNull();
    expect(verifySignedAnchorRecord({ ...l, note: "x" }, FW.devicePub)).toBeNull();
    expect(
      verifySignedAnchorRecord({ ...l, head: (l.head as string).toUpperCase() }, FW.devicePub),
    ).toBeNull();
    expect(verifySignedAnchorRecord(l, randomBytes(32))).toBeNull(); // another device
  });

  it("v1 and v2 lines verify under their own domains only", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const raw = Buffer.from((publicKey.export({ format: "jwk" }) as { x: string }).x, "base64url");
    const head = Buffer.alloc(32, 0xab);
    const uid = Buffer.alloc(12, 3);
    const v1sig = edSign(
      null,
      Buffer.concat([Buffer.from("ECW-ANCHOR-01\0\0\0", "latin1"), le64(9n), head, uid]),
      privateKey,
    );
    const v1 = {
      head: head.toString("hex"),
      counter: "9",
      uid: uid.toString("hex"),
      sig: v1sig.toString("base64"),
    };
    expect(verifySignedAnchorRecord(v1, raw)).toMatchObject({ version: 1, sess: null, bind: null });
    expect(verifySignedAnchorRecord({ ...v1, version: 1 }, raw)).toMatchObject({ version: 1 });
    expect(verifySignedAnchorRecord({ ...v1, version: 2, sess: "0", opens: "0" }, raw)).toBeNull();
    expect(verifySignedAnchorRecord({ ...v1, sess: "1" }, raw)).toBeNull(); // unsigned decoration
    const v2sig = edSign(
      null,
      Buffer.concat([
        Buffer.from("ECW-ANCHOR-02\0\0\0", "latin1"),
        le64(9n),
        head,
        uid,
        le64(4n),
        le64(5n),
      ]),
      privateKey,
    );
    const v2 = {
      version: 2,
      head: v1.head,
      counter: "9",
      uid: v1.uid,
      sig: v2sig.toString("base64"),
      sess: "4",
      opens: "5",
    };
    expect(verifySignedAnchorRecord(v2, raw)).toMatchObject({
      version: 2,
      sess: 4n,
      opens: 5n,
      bind: null,
    });
    expect(verifySignedAnchorRecord({ ...v2, version: 3, bind: "00".repeat(32) }, raw)).toBeNull();
    expect(verifySignedAnchorRecord({ ...v2, bind: "00".repeat(32) }, raw)).toBeNull();
    const { version: _v, sess: _s, opens: _o, ...asV1 } = v2;
    expect(verifySignedAnchorRecord(asV1, raw)).toBeNull();
    // A history with one good and one stripped line: the stripped one is counted bad.
    const text = `${JSON.stringify(v2)}\n${JSON.stringify(asV1)}\nnot json\n`;
    const h = parseAnchorHistory(text, raw);
    expect(h.entries.length).toBe(1);
    expect(h.bad).toBe(2);
  });
});

/** One codenclawed-style session on `dev`: its own process (device object), activation, anchors. */
async function session(
  dev: StandIn,
  log: string,
  heads: string[],
  o: { activateFirst?: boolean } = {},
) {
  const device = direct(dev); // a new process: its own session slot
  const sink = enclawederHeadAnchor({
    device,
    devicePublicKey: dev.raw,
    path: anchorFilePath(log),
  });
  const write = async (h: string) => {
    await sink.write(h);
    appendAnchorHistory({
      anchorPath: anchorFilePath(log),
      historyPath: anchorHistoryPath(log),
      devicePublicKey: dev.raw,
    });
  };
  let act: Awaited<ReturnType<typeof activate>> | null = null;
  if (o.activateFirst !== false) {
    act = await activate(dev);
  }
  for (const [i, h] of heads.entries()) {
    if (!act && i === 1) {
      act = await activate(dev); // the logger anchored plainly first, then the launch was activated
    }
    await write(h);
  }
  await closeHeadAnchorSessions(); // the launcher closes its anchor session at the end
  return { device, act: act! };
}

const hx = (n: number) => Buffer.alloc(32, n).toString("hex");

describe("compareAnchoredLog on command set 0.5 (record v3 history)", () => {
  it("a held session's log verifies matched with a fresh bound read, and the next launch on the continuing log passes", async () => {
    const dev = new StandIn();
    const log = path.join(dir, "held.jsonl");
    const s1 = await session(dev, log, [hx(1), hx(2), hx(3)]);
    const hist = readAnchorHistory(anchorHistoryPath(log), dev.raw);
    expect(hist.bad).toBe(0);
    expect(hist.entries.map((e) => e.version)).toEqual([3, 3, 3]);
    for (const line of fs.readFileSync(anchorHistoryPath(log), "utf8").trim().split("\n")) {
      expect(Object.keys(JSON.parse(line)).toSorted()).toEqual([
        "bind",
        "counter",
        "head",
        "opens",
        "sess",
        "sig",
        "ts",
        "uid",
        "version",
      ]);
    }
    let records = [unlockRecord(7n, s1.act.receipt.useIndex)];
    let hashes = [hx(1), hx(2), hx(3), hx(4)];
    // `audit verify` (a new process).
    const v = await compareAnchoredLog({
      device: direct(dev),
      devicePublicKey: dev.raw,
      auditLog: log,
      recordHashes: hashes,
      activations: deviceFactorActivations(records),
    });
    expect(v).toMatchObject({ status: "matched", unanchoredTail: 1, deviceHasAnchors: true });
    expect(v.attestation).toMatchObject({ fresh: true, version: 3 });
    expect(
      decideAuditAnchorVerdict({
        claims: [{ line: 1, type: "x.launch", hardware: "held" }],
        device: v.status,
        attestation: v.attestation,
        activations: deviceFactorActivations(records),
      }),
    ).toEqual({ ok: true, rootClaimed: true });
    // The next launch's gate on the continuing log (before its activation): matched.
    const gate = await compareAnchoredLog({
      device: direct(dev),
      devicePublicKey: dev.raw,
      auditLog: log,
      recordHashes: hashes,
      activations: deviceFactorActivations(records),
    });
    expect(gate.status).toBe("matched");
    // That launch runs and anchors under its own activation; the whole log still verifies.
    const s2 = await session(dev, log, [hx(5), hx(6)]);
    records = [...records, unlockRecord(7n, s2.act.receipt.useIndex)];
    hashes = [...hashes, hx(5), hx(6)];
    const v2 = await compareAnchoredLog({
      device: direct(dev),
      devicePublicKey: dev.raw,
      auditLog: log,
      recordHashes: hashes,
      activations: deviceFactorActivations(records),
    });
    expect(v2.status).toBe("matched");
    expect(v2.unanchoredTail).toBe(0);
    // Without the second launch's own record, its bound lines name no launch of the log.
    const v3 = await compareAnchoredLog({
      device: direct(dev),
      devicePublicKey: dev.raw,
      auditLog: log,
      recordHashes: hashes,
      activations: deviceFactorActivations(records.slice(0, 1)),
    });
    expect(v3).toMatchObject({ status: "MISMATCH", code: "history-unbound" });
  });

  it("a plain open before the activation leaves v2 then v3 lines; both verify", async () => {
    const dev = new StandIn();
    const log = path.join(dir, "late.jsonl");
    const s = await session(dev, log, [hx(1), hx(2)], { activateFirst: false });
    expect(
      readAnchorHistory(anchorHistoryPath(log), dev.raw).entries.map((e) => e.version),
    ).toEqual([2, 3]);
    const v = await compareAnchoredLog({
      device: direct(dev),
      devicePublicKey: dev.raw,
      auditLog: log,
      recordHashes: [hx(1), hx(2)],
      activations: deviceFactorActivations([unlockRecord(7n, s.act.receipt.useIndex)]),
    });
    expect(v.status).toBe("matched");
  });

  it("the defect's history (v3 records written without their version, session, open count and binding) is a MISMATCH", async () => {
    const dev = new StandIn();
    const log = path.join(dir, "stripped.jsonl");
    const s = await session(dev, log, [hx(1), hx(2)]);
    const p = anchorHistoryPath(log);
    const stripped = fs
      .readFileSync(p, "utf8")
      .trim()
      .split("\n")
      .map((l) => {
        const { head, counter, uid, sig, ts } = JSON.parse(l);
        return JSON.stringify({ head, counter, uid, sig, ts });
      });
    fs.writeFileSync(p, `${stripped.join("\n")}\n`);
    const v = await compareAnchoredLog({
      device: direct(dev),
      devicePublicKey: dev.raw,
      auditLog: log,
      recordHashes: [hx(1), hx(2)],
      activations: deviceFactorActivations([unlockRecord(7n, s.act.receipt.useIndex)]),
    });
    expect(v).toMatchObject({ status: "MISMATCH", code: "history-invalid" });
  });

  it("a forger that spends its own use and anchors a bound history is refused: its binding is not the log's launch", async () => {
    const dev = new StandIn();
    const log = path.join(dir, "forged.jsonl");
    const s = await session(dev, log, [hx(1)]);
    // Same user, between sessions: a fabricated log, anchored under a session bound to a use it spent.
    fs.rmSync(anchorFilePath(log));
    fs.rmSync(anchorHistoryPath(log));
    await session(dev, log, [hx(9)]);
    const v = await compareAnchoredLog({
      device: direct(dev),
      devicePublicKey: dev.raw,
      auditLog: log,
      recordHashes: [hx(9)],
      activations: deviceFactorActivations([unlockRecord(7n, s.act.receipt.useIndex)]),
    });
    expect(v).toMatchObject({ status: "MISMATCH", code: "history-unbound" });
  });

  it("a squatter's plain open after the session is a foreign open on a v3 history", async () => {
    const dev = new StandIn();
    const log = path.join(dir, "squat.jsonl");
    const s = await session(dev, log, [hx(1)]);
    const sq = await AnchorSession.open(dev.frames(), dev.raw);
    await sq.close();
    const v = await compareAnchoredLog({
      device: direct(dev),
      devicePublicKey: dev.raw,
      auditLog: log,
      recordHashes: [hx(1)],
      activations: deviceFactorActivations([unlockRecord(7n, s.act.receipt.useIndex)]),
    });
    expect(v).toMatchObject({ status: "MISMATCH", code: "foreign-open" });
  });

  it("the writer refuses an anchor file that is not a record of this device", async () => {
    const dev = new StandIn();
    const log = path.join(dir, "badfile.jsonl");
    await session(dev, log, [hx(1)]);
    const f = JSON.parse(fs.readFileSync(anchorFilePath(log), "utf8"));
    fs.writeFileSync(anchorFilePath(log), JSON.stringify({ ...f, bind: "00".repeat(32) }));
    expect(() =>
      appendAnchorHistory({
        anchorPath: anchorFilePath(log),
        historyPath: anchorHistoryPath(log),
        devicePublicKey: dev.raw,
      }),
    ).toThrow(/not a record signed by this device/);
  });
});
