// Host-side regression tests for the hardware-root guard and driver (red team H4, H6, H7): latch
// files that cannot be read fail closed, the driver refuses malformed answers, and a guard that
// never opened a session does not close one. All keys are per-test values.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Enclaweder } from "./enclaweder-hid.js";
import { HardwareRootGuard } from "./guard.js";
import type { HidTransport } from "./hid-transport.js";
import { hostLatches } from "./latches.js";

const base = fs.mkdtempSync(path.join(os.tmpdir(), "hw-guard-latch-"));
// Never the real HOME's forensic log.
process.env.ENCLAWEDER_FORENSIC_LOG = path.join(base, "forensics.jsonl");
afterAll(() => fs.rmSync(base, { recursive: true, force: true }));
let n = 0;
const statePath = () => path.join(base, `s${++n}.state`);
const { publicKey } = crypto.generateKeyPairSync("ed25519");
const rootRaw = Buffer.from(publicKey.export({ format: "der", type: "spki" }).subarray(12));
const guardAt = (p: string) => new HardwareRootGuard({ statePath: p, rootPubkey: rootRaw });

describe("H7: latch I/O never fails open", () => {
  it("a truncated or corrupt latch reads as DIRTY", () => {
    for (const body of ["", '{"status":"CLE', "[]", '{"status":"WHATEVER"}']) {
      const p = statePath();
      fs.writeFileSync(p, body);
      expect(guardAt(p).status).toBe("DIRTY");
      expect(hostLatches(p)[0]?.status).toBe("DIRTY");
    }
  });
});

describe("H6: the driver validates identity and status", () => {
  it("the driver rejects an error status byte or a short GET_STATUS / GET_IDENTITY payload", async () => {
    // A fake hidraw transport answering every request with `answer`.
    const crc16 = (b: Buffer) => {
      let c = 0xffff;
      for (const x of b) {
        c ^= x << 8;
        for (let i = 0; i < 8; i++) {
          c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
        }
      }
      return c;
    };
    const fake = (answer: Buffer): HidTransport => {
      const q: Buffer[] = [];
      return {
        writeReport(rep: Buffer) {
          const f = rep.subarray(1);
          const type = f[2] | 0x80;
          const id = f.readUInt16LE(3);
          const body = Buffer.concat([
            Buffer.from([1, type, id & 0xff, id >> 8, answer.length & 0xff, answer.length >> 8]),
            answer,
          ]);
          const c = crc16(body);
          const frame = Buffer.concat([Buffer.from([0xe2]), body, Buffer.from([c & 0xff, c >> 8])]);
          for (let o = 0; o < frame.length; o += 64) {
            q.push(frame.subarray(o, o + 64));
          }
        },
        readReport(into: Buffer) {
          const r = q.shift();
          if (!r) {
            return 0;
          }
          r.copy(into);
          return r.length;
        },
        close() {},
      };
    };
    await expect(new Enclaweder("/x", fake(Buffer.from([2, 3]))).getStatus()).rejects.toThrow(
      /rejected/,
    );
    await expect(new Enclaweder("/x", fake(Buffer.from([0, 3, 0]))).getStatus()).rejects.toThrow(
      /rejected/,
    );
    await expect(new Enclaweder("/x", fake(Buffer.from([8]))).getIdentity()).rejects.toThrow(
      /rejected/,
    );
    await expect(new Enclaweder("/x", fake(Buffer.alloc(20))).getIdentity()).rejects.toThrow(
      /rejected/,
    );
  });
});

describe("H4: only a clean exit ends the accredited session", () => {
  it("a guard that never opened a session does not close one", () => {
    const p = statePath();
    fs.writeFileSync(
      p,
      JSON.stringify({
        status: "CLEAN",
        sessionOpen: true,
        bound: { serial: "ENCLW-X", pubkey: "00", uid: "00" },
      }),
    );
    guardAt(p).closeSession();
    expect(JSON.parse(fs.readFileSync(p, "utf8")).sessionOpen).toBe(true);
  });
});
