// Requests to one device must not overlap on the wire. The receive buffer is
// shared and each request clears it, so before the request lane two requests
// in flight at once (the guard's heartbeat and a signature, or two ranks'
// signatures through the device broker) dropped each other's responses, and a
// dropped challenge response latched a genuine device DIRTY.

import { describe, expect, it } from "vitest";
import { Enclaweder } from "./enclaweder-hid.ts";
import type { HidTransport } from "./hid-transport.ts";

function crc16(buf: Buffer): number {
  let crc = 0xffff;
  for (const b of buf) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function frame(type: number, id: number, payload: Buffer): Buffer {
  const b = Buffer.concat([
    Buffer.from([0x01, type, id & 0xff, id >> 8, payload.length & 0xff, payload.length >> 8]),
    payload,
  ]);
  const c = crc16(b);
  return Buffer.concat([Buffer.from([0xe2]), b, Buffer.from([c & 0xff, c >> 8])]);
}

const UID = Buffer.from("0102030405060708090a0b0c", "hex");

/**
 * A device that answers every request, but only after `delayMs`, as a real
 * one does over USB: the window in which a second request can overlap. A
 * challenge is answered with the nonce itself as the "signature", so each
 * caller can tell its own response from another's.
 */
function slowDevice(delayMs: number): HidTransport & { requests: number } {
  const queue: Buffer[] = [];
  const t = {
    requests: 0,
    writeReport(report: Buffer) {
      const f = report.subarray(1);
      const type = f[2];
      const id = f[3] | (f[4] << 8);
      const len = f[5] | (f[6] << 8);
      const payload = f.subarray(7, 7 + len);
      t.requests++;
      const sig = Buffer.concat([payload, payload]);
      const resp = frame(type | 0x80, id, Buffer.concat([Buffer.from([0]), UID, sig]));
      setTimeout(() => {
        for (let i = 0; i < resp.length; i += 64) {
          queue.push(resp.subarray(i, i + 64));
        }
      }, delayMs);
    },
    readReport(into: Buffer) {
      const next = queue.shift();
      if (!next) {
        return 0;
      }
      next.copy(into);
      return next.length;
    },
    close() {},
  };
  return t;
}

describe("enclaweder request lane", () => {
  it("answers concurrent challenges each with its own response", async () => {
    const t = slowDevice(15);
    const dev = new Enclaweder("ignored", t);
    const nonces = Array.from({ length: 8 }, (_, i) => Buffer.alloc(32, i + 1));
    const answers = await Promise.all(nonces.map((n) => dev.challenge(n)));
    expect(t.requests).toBe(8);
    answers.forEach((a, i) => {
      expect(a.sig.subarray(0, 32).equals(nonces[i])).toBe(true);
      expect(a.uid.equals(UID)).toBe(true);
    });
  }, 30_000);

  it("keeps serving after a request that got no response", async () => {
    // A device that never answers the first request, then answers normally.
    const t = slowDevice(5);
    let first = true;
    const write = t.writeReport.bind(t);
    t.writeReport = (r: Buffer) => {
      if (first) {
        first = false;
        return;
      }
      write(r);
    };
    const dev = new Enclaweder("ignored", t);
    const lost = dev.request(0x05, 0, Buffer.alloc(32, 9), 50);
    const ok = dev.challenge(Buffer.alloc(32, 7));
    expect(await lost).toBeNull();
    expect((await ok).sig.subarray(0, 32).equals(Buffer.alloc(32, 7))).toBe(true);
  }, 30_000);
});
