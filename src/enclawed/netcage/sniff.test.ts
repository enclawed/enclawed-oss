import http from "node:http";
import net from "node:net";
import tls from "node:tls";
import { describe, expect, it } from "vitest";
import {
  dnsSinkholeAnswer,
  parseDnsQuestion,
  parseHttpRequestHead,
  parseTlsSni,
  summarizeCapture,
} from "./sniff.js";

function dnsQuery(name: string, type = 1): Buffer {
  const parts = name.split(".").flatMap((l) => [Buffer.from([l.length]), Buffer.from(l)]);
  return Buffer.concat([
    Buffer.from([0x12, 0x34, 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0]),
    ...parts,
    Buffer.from([0, 0, type, 0, 1]),
  ]);
}

// The first bytes a real client sends to a raw listener.
async function firstBytes(send: (port: number) => void): Promise<Buffer> {
  return await new Promise((resolve) => {
    const server = net.createServer((sock) => {
      sock.once("data", (d: Buffer) => {
        sock.destroy();
        server.close();
        resolve(d);
      });
    });
    server.listen(0, "127.0.0.1", () => send((server.address() as net.AddressInfo).port));
  });
}

describe("parseDnsQuestion", () => {
  it("reads the name a DNS exfiltration query carries", () => {
    const name = "c2VjcmV0LWtleQ.x7.exfil.example";
    expect(parseDnsQuestion(dnsQuery(name))).toEqual({ name, type: 1 });
  });

  it("returns null for truncated, oversized and pointer-bearing input", () => {
    const q = dnsQuery("a.example");
    expect(parseDnsQuestion(q.subarray(0, 14))).toBeNull();
    expect(parseDnsQuestion(Buffer.alloc(5))).toBeNull();
    const pointer = Buffer.from(q);
    pointer[12] = 0xc0;
    expect(parseDnsQuestion(pointer)).toBeNull();
    const long = dnsQuery(Array.from({ length: 5 }, () => "a".repeat(60)).join("."));
    expect(parseDnsQuestion(long)).toBeNull();
    const noQuestion = Buffer.from(q);
    noQuestion[5] = 0;
    expect(parseDnsQuestion(noQuestion)).toBeNull();
  });
});

describe("dnsSinkholeAnswer", () => {
  it("answers an A question with the sinkhole address", () => {
    const q = dnsQuery("bucket.oss-cn-hangzhou.aliyuncs.com");
    const a = dnsSinkholeAnswer(q, "198.18.0.1")!;
    expect(a.readUInt16BE(0)).toBe(0x1234);
    expect(a.readUInt16BE(6)).toBe(1);
    expect([...a.subarray(a.length - 4)]).toEqual([198, 18, 0, 1]);
  });

  it("answers other types with no records, and refuses garbage", () => {
    const a = dnsSinkholeAnswer(dnsQuery("x.example", 28), "198.18.0.1")!;
    expect(a.readUInt16BE(6)).toBe(0);
    expect(dnsSinkholeAnswer(Buffer.from("hello"), "198.18.0.1")).toBeNull();
  });
});

describe("parseTlsSni", () => {
  it("reads the server name from a real Node ClientHello", async () => {
    const hello = await firstBytes((port) => {
      const s = tls.connect({
        port,
        host: "127.0.0.1",
        servername: "oss-cn-hangzhou.aliyuncs.com",
      });
      s.on("error", () => {});
    });
    expect(parseTlsSni(hello)).toBe("oss-cn-hangzhou.aliyuncs.com");
  });

  it("returns null for non-TLS and for a ClientHello cut short", async () => {
    expect(parseTlsSni(Buffer.from("GET / HTTP/1.1\r\n\r\n"))).toBeNull();
    const hello = await firstBytes((port) => {
      const s = tls.connect({ port, host: "127.0.0.1", servername: "a.example" });
      s.on("error", () => {});
    });
    for (const cut of [10, 50, 80]) {
      expect(parseTlsSni(hello.subarray(0, cut))).toBeNull();
    }
  });
});

describe("parseHttpRequestHead", () => {
  it("reads the method, target and host of a real upload request", async () => {
    const head = await firstBytes((port) => {
      const req = http.request({
        port,
        host: "127.0.0.1",
        method: "PUT",
        path: "/workspace.tar.enc",
        headers: { host: "bucket.oss-cn-hangzhou.aliyuncs.com" },
      });
      req.on("error", () => {});
      req.end("x");
    });
    expect(parseHttpRequestHead(head)).toEqual({
      method: "PUT",
      target: "/workspace.tar.enc",
      host: "bucket.oss-cn-hangzhou.aliyuncs.com",
    });
  });

  it("returns null for anything that is not an HTTP request line", () => {
    expect(parseHttpRequestHead(Buffer.from("SSH-2.0-OpenSSH_9.6\r\n"))).toBeNull();
    expect(parseHttpRequestHead(Buffer.alloc(0))).toBeNull();
  });
});

describe("summarizeCapture", () => {
  it("classifies DNS over UDP and TCP, TLS, HTTP and unknown bytes", () => {
    const q = dnsQuery("leak.example");
    expect(summarizeCapture(q, "udp", 53)).toEqual({
      protocol: "dns",
      name: "leak.example",
      request: null,
    });
    const tcp = Buffer.concat([Buffer.from([0, q.length]), q]);
    expect(summarizeCapture(tcp, "tcp", 53).name).toBe("leak.example");
    expect(summarizeCapture(q, "udp", 9999).protocol).toBe("dns");
    expect(
      summarizeCapture(Buffer.from("POST /up HTTP/1.1\r\nHost: h.example\r\n\r\n"), "tcp", 80),
    ).toEqual({
      protocol: "http",
      name: "h.example",
      request: "POST /up",
    });
    expect(summarizeCapture(Buffer.from([1, 2, 3]), "tcp", 4444).protocol).toBe("unknown");
  });

  it("never throws on random input", () => {
    for (let i = 0; i < 2000; i++) {
      const b = Buffer.from(
        Array.from({ length: (i % 97) + 1 }, () => Math.floor(Math.random() * 256)),
      );
      b[0] = [22, 0x12, 71][i % 3]!;
      b[5] = i % 2;
      expect(() => summarizeCapture(b, i % 2 ? "udp" : "tcp", [53, 443, 80][i % 3])).not.toThrow();
    }
  });
});
