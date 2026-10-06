// The enclaweder speaks one wire protocol; only the report I/O differs
// per platform. These tests pin that the protocol layer is genuinely
// transport-agnostic, so the macOS/Windows backend cannot drift from the
// Linux one without failing here.

import { describe, expect, it } from "vitest";
import { Enclaweder } from "./enclaweder-hid.ts";
import { ENCLAWEDER_PID, ENCLAWEDER_VID, type HidTransport } from "./hid-transport.ts";

/** Records writes and replays canned reports, standing in for either backend. */
function fakeTransport(): HidTransport & { written: Buffer[]; queue: Buffer[]; closed: boolean } {
  const t = {
    written: [] as Buffer[],
    queue: [] as Buffer[],
    closed: false,
    writeReport(report: Buffer) {
      t.written.push(Buffer.from(report));
    },
    readReport(into: Buffer) {
      const next = t.queue.shift();
      if (!next) {
        return 0;
      }
      const n = Math.min(next.length, into.length);
      next.copy(into, 0, 0, n);
      return n;
    },
    close() {
      t.closed = true;
    },
  };
  return t;
}

describe("enclaweder HID transport", () => {
  it("pins the USB identity the device is matched on", () => {
    // The hidraw scan matches these as zero-padded hex in the uevent and
    // node-hid matches them numerically; they must not drift apart.
    expect(ENCLAWEDER_VID).toBe(0x1209);
    expect(ENCLAWEDER_PID).toBe(0xe100);
    expect(ENCLAWEDER_VID.toString(16).padStart(8, "0")).toBe("00001209");
    expect(ENCLAWEDER_PID.toString(16).padStart(8, "0")).toBe("0000e100");
  });

  it("frames requests as 65-byte reports with a leading report id", async () => {
    const t = fakeTransport();
    const dev = new Enclaweder("ignored", t);
    // No response queued, so this times out — we only care what was written.
    await dev.request(0x01, 0, Buffer.alloc(0), 10);
    expect(t.written.length).toBeGreaterThan(0);
    for (const rep of t.written) {
      expect(rep.length, "node-hid and hidraw both expect report id + 64 bytes").toBe(65);
      expect(rep[0], "report id must be 0").toBe(0);
    }
    // The frame itself starts with the protocol SOF byte.
    expect(t.written[0][1]).toBe(0xe2);
  });

  it("treats an empty read as 'nothing pending' rather than an error", async () => {
    const t = fakeTransport(); // readReport always returns 0
    const dev = new Enclaweder("ignored", t);
    // The hidraw backend maps EAGAIN to 0 and node-hid returns an empty
    // poll; either way the request must time out cleanly, not throw.
    await expect(dev.request(0x01, 0, Buffer.alloc(0), 20)).resolves.toBeNull();
  });

  it("closes through the transport", () => {
    const t = fakeTransport();
    new Enclaweder("ignored", t).close();
    expect(t.closed).toBe(true);
  });
});
