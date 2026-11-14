import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAGE_EPHEMERAL,
  findSocketFiles,
  parseNameservers,
  remoteEndpoints,
  scrubCageEnv,
  trapPortList,
  txPackets,
} from "./cage-init.js";

describe("trapPortList", () => {
  it("covers every privileged port and common high ports, minus served and ephemeral ones", () => {
    const ports = trapPortList([80, 11434]);
    expect(ports).toContain(443);
    expect(ports).toContain(53);
    expect(ports).toContain(8443);
    expect(ports).not.toContain(80);
    expect(ports.some((p) => p >= CAGE_EPHEMERAL[0] && p <= CAGE_EPHEMERAL[1])).toBe(false);
    expect(new Set(ports).size).toBe(ports.length);
  });
});

describe("scrubCageEnv", () => {
  it("removes every variable that points at a way out, and the cage config", () => {
    const env = scrubCageEnv({
      PATH: "/bin",
      SSH_AUTH_SOCK: "/run/user/1/ssh",
      WSL_INTEROP: "/run/WSL/1_interop",
      DOCKER_HOST: "unix:///run/docker.sock",
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1/bus",
      HTTPS_PROXY: "http://127.0.0.1:3128",
      https_proxy: "http://127.0.0.1:3128",
      TMUX: "/tmp/tmux-1/default,1,0",
      ENCLAWED_NETCAGE: "{}",
    });
    expect(env).toEqual({ PATH: "/bin" });
  });
});

describe("parseNameservers", () => {
  it("reads IPv4 and IPv6 nameservers and ignores everything else", () => {
    const text = [
      "# comment",
      "nameserver 10.255.255.254",
      "nameserver fe80::1%eth0",
      "nameserver not-an-ip",
      "search example.com",
      "  nameserver 127.0.0.53  ",
    ].join("\n");
    expect(parseNameservers(text)).toEqual(["10.255.255.254", "fe80::1", "127.0.0.53"]);
  });
});

describe("txPackets", () => {
  it("reads the transmitted-packet column of /proc/net/dev", () => {
    const row = (dev: string, txp: number) => `${dev}: 0 0 0 0 0 0 0 0 0 ${txp} 0 0 0 0 0 0`;
    const text = ["Inter-| header", " face | header", row("lo", 2), row("enclawed-sink", 7)].join(
      "\n",
    );
    expect(txPackets(text, "enclawed-sink")).toBe(7);
    expect(txPackets(text, "lo")).toBe(2);
    expect(txPackets(text, "eth0")).toBeNull();
    expect(txPackets("garbage", "lo")).toBeNull();
  });
});

// Encode an address the way /proc/net/tcp{,6} prints it.
function procAddr(ip: string, port: number): string {
  const p = port.toString(16).toUpperCase().padStart(4, "0");
  if (net.isIPv4(ip)) {
    const b = ip.split(".").map(Number).toReversed();
    return `${Buffer.from(b).toString("hex").toUpperCase()}:${p}`;
  }
  // Expand (an IPv4 tail becomes two groups), then write four little-endian
  // 32-bit words.
  const dotted = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (dotted) {
    const o = dotted[2].split(".").map(Number);
    const hex4 = (a: number, b: number) => ((a << 8) | b).toString(16);
    ip = `${dotted[1]}${hex4(o[0], o[1])}:${hex4(o[2], o[3])}`;
  }
  const [head, tail = ""] = ip.split("::");
  const hs = head ? head.split(":") : [];
  const ts = tail ? tail.split(":") : [];
  const groups = [...hs, ...Array(8 - hs.length - ts.length).fill("0"), ...ts];
  const bytes = Buffer.from(groups.map((g) => g.padStart(4, "0")).join(""), "hex");
  const words: string[] = [];
  for (let i = 0; i < 16; i += 4) {
    words.push(
      Buffer.from(Buffer.from(bytes.subarray(i, i + 4)).toReversed())
        .toString("hex")
        .toUpperCase(),
    );
  }
  return `${words.join("")}:${p}`;
}

function procLine(i: number, local: string, remote: string, inode: number): string {
  return `${i}: ${local} ${remote} 02 00000000:00000000 00:00000000 00000000 0 0 ${inode} 1`;
}

describe("remoteEndpoints", () => {
  const isLocal = (ip: string) =>
    ip.startsWith("127.") || ip === "::1" || ip === "0.0.0.0" || ip === "::";

  it("decodes IPv4 peers and skips local and unconnected sockets", () => {
    const text = [
      "sl local rem st ...",
      procLine(0, procAddr("10.199.0.1", 61000), procAddr("8.8.8.8", 47001), 111),
      procLine(1, procAddr("127.0.0.1", 61001), procAddr("127.0.0.1", 11434), 112),
      procLine(2, procAddr("0.0.0.0", 443), procAddr("0.0.0.0", 0), 113),
    ].join("\n");
    expect(remoteEndpoints(text, isLocal)).toEqual([{ dst: "8.8.8.8", port: 47001, inode: "111" }]);
  });

  it("decodes IPv6 peers, including IPv4-mapped ones", () => {
    const text = [
      "sl local rem st ...",
      procLine(0, procAddr("fd99::1", 61000), procAddr("2001:4860:4860::8888", 443), 7),
      procLine(1, procAddr("::", 61002), procAddr("::ffff:203.0.113.9", 4444), 8),
      procLine(2, procAddr("::1", 61003), procAddr("::1", 8080), 9),
    ].join("\n");
    const got = remoteEndpoints(text, isLocal);
    expect(got.map((e) => [e.port, e.inode])).toEqual([
      [443, "7"],
      [4444, "8"],
    ]);
    expect(got[0].dst).toBe("2001:4860:4860::8888");
    expect(got[1].dst).toBe("203.0.113.9");
  });

  it("ignores short and malformed lines", () => {
    expect(remoteEndpoints("header\n0: a b\n\n", isLocal)).toEqual([]);
  });
});

describe("findSocketFiles", () => {
  it("finds socket files below a root, skipping node_modules and .git", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-sockscan-"));
    const servers: net.Server[] = [];
    const listen = (p: string) =>
      new Promise<void>((r) => {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        const s = net.createServer();
        servers.push(s);
        s.listen(p, () => r());
      });
    try {
      await listen(path.join(root, "a", "agent.sock"));
      await listen(path.join(root, "node_modules", "x.sock"));
      await listen(path.join(root, ".git", "y.sock"));
      fs.writeFileSync(path.join(root, "a", "file.txt"), "not a socket");
      expect(findSocketFiles([root])).toEqual([path.join(root, "a", "agent.sock")]);
      expect(findSocketFiles([path.join(root, "missing")])).toEqual([]);
    } finally {
      for (const s of servers) {
        s.close();
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
