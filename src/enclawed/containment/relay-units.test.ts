// Unit tests of the relay's parsers: WebSocket client frames and the TLS
// ClientHello read for opaque destinations. Pure; no network.

import { randomBytes } from "node:crypto";
import { Duplex } from "node:stream";
import tls from "node:tls";
import { describe, expect, it } from "vitest";
import { readClientHello } from "./relay-opaque.js";
import { replaceBytes } from "./relay-types.js";
import { createClientFrameParser, encodeFrame } from "./relay-ws.js";

describe("WebSocket client frame parser", () => {
  it("reassembles fragmented messages across reads and passes control frames through", () => {
    const p = createClientFrameParser();
    const a = encodeFrame(0x1, Buffer.from("hel"), true);
    a[0] &= 0x7f; // not FIN
    const b = encodeFrame(0x0, Buffer.from("lo"), true);
    const ping = encodeFrame(0x9, Buffer.from("k"), true);
    const all = Buffer.concat([a, ping, b]);
    const out1 = p.push(all.subarray(0, 5));
    const out2 = p.push(all.subarray(5));
    expect(out1.error ?? out2.error).toBeNull();
    expect(
      [...out1.messages, ...out2.messages].map((m) => [m.opcode, m.payload.toString()]),
    ).toEqual([
      [0x9, "k"],
      [0x1, "hello"],
    ]);
  });

  it("fails closed on unmasked frames, extension bits, reserved opcodes and oversize messages", () => {
    expect(createClientFrameParser().push(encodeFrame(0x1, Buffer.from("x"), false)).error).toMatch(
      /unmasked/,
    );
    const rsv = encodeFrame(0x1, Buffer.from("x"), true);
    rsv[0] |= 0x40;
    expect(createClientFrameParser().push(rsv).error).toMatch(/reserved bits/);
    expect(createClientFrameParser().push(encodeFrame(0x3, Buffer.from("x"), true)).error).toMatch(
      /reserved data opcode/,
    );
    expect(createClientFrameParser(10).push(encodeFrame(0x2, randomBytes(11), true)).error).toMatch(
      /larger than/,
    );
    const bigPing = encodeFrame(0x9, Buffer.alloc(126), true);
    expect(createClientFrameParser().push(bigPing).error).toMatch(/control frame/);
  });

  it("replaces a handle byte for byte, so binary bodies are never re-encoded", () => {
    const body = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from("H"),
      Buffer.from([0x00, 0xc3]),
    ]);
    expect(replaceBytes(body, Buffer.from("H"), Buffer.from("value"))).toEqual(
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("value"), Buffer.from([0x00, 0xc3])]),
    );
  });
});

/** A real ClientHello from Node's TLS client, captured from its first write. */
function clientHello(servername: string | undefined): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const fake = new Duplex({
      read() {},
      write(chunk: Buffer, _enc, cb) {
        chunks.push(chunk);
        cb();
        resolve(Buffer.concat(chunks));
      },
    });
    const s = tls.connect({ socket: fake, servername, rejectUnauthorized: false });
    s.on("error", () => {});
    setTimeout(() => s.destroy(), 50);
  });
}

describe("ClientHello reader (opaque destinations)", () => {
  it("reads the server name of a real ClientHello, also when it arrives in pieces", async () => {
    const hello = await clientHello("db.opaque.test");
    expect(readClientHello(hello)).toMatchObject({
      state: "hello",
      serverName: "db.opaque.test",
      ech: false,
    });
    expect(readClientHello(hello.subarray(0, 20))).toEqual({ state: "need-more" });
    expect(readClientHello(await clientHello(undefined))).toMatchObject({
      state: "hello",
      serverName: null,
    });
  });

  it("tells non-TLS and malformed input apart", () => {
    expect(readClientHello(Buffer.from("GET / HTTP/1.1\r\n"))).toEqual({ state: "not-tls" });
    expect(
      readClientHello(Buffer.from([0x16, 0x03, 0x01, 0x00, 0x05, 0x02, 0, 0, 1, 0])).state,
    ).toBe("malformed");
  });
});
