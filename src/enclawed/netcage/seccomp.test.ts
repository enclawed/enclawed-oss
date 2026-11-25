import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { seccompArch, unixSocketFilter, unixSocketFilterProgram } from "./seccomp.js";

// A small interpreter for the classic-BPF subset the filter uses, so the
// decisions are checked instruction by instruction on every architecture,
// not only on the one the suite runs on.
function run(arch: "x64" | "arm64", data: { nr: number; archId?: number; args?: number[] }) {
  const prog = unixSocketFilterProgram(arch);
  const archId = data.archId ?? (arch === "x64" ? 0xc000003e : 0xc00000b7);
  const word = (off: number) => {
    if (off === 0) {
      return data.nr >>> 0;
    }
    if (off === 4) {
      return archId >>> 0;
    }
    const i = (off - 16) / 8;
    return (data.args?.[i] ?? 0) >>> 0;
  };
  let a = 0;
  for (let pc = 0; pc < prog.length; pc++) {
    const { code, jt, jf, k } = prog[pc];
    switch (code) {
      case 0x20:
        a = word(k);
        break;
      case 0x54:
        a = (a & k) >>> 0;
        break;
      case 0x15:
        pc += a === k ? jt : jf;
        break;
      case 0x35:
        pc += a >= k ? jt : jf;
        break;
      case 0x06:
        return k >>> 0;
      default:
        throw new Error(`unknown opcode ${code}`);
    }
  }
  throw new Error("fell off the program");
}

const ALLOW = 0x7fff0000;
const EACCES = 0x0005000d;
const ENOSYS = 0x00050026;
const KILL = 0x80000000;
const NR = {
  x64: { socket: 41, socketpair: 53, io_uring_setup: 425, connect: 42 },
  arm64: { socket: 198, socketpair: 199, io_uring_setup: 425, connect: 203 },
};

describe("the network cage's Unix-socket filter", () => {
  it("is pinned byte for byte (review a change to it as a security change)", () => {
    const digest = (b: Buffer) => createHash("sha256").update(b).digest("hex");
    expect(digest(unixSocketFilter("x64"))).toBe(
      "9a0a69dd3440a0126af575e8fb94ebaea2bd5534856e882a7f3a360203397a14",
    );
    expect(digest(unixSocketFilter("arm64"))).toBe(
      "a5f511acd8a92e33bcfb92af122dae89801d1b7e0e1f1746a843e06d5dfa0d54",
    );
  });

  for (const arch of ["x64", "arm64"] as const) {
    const nr = NR[arch];
    it(`${arch}: refuses AF_UNIX sockets, datagram pairs and io_uring; allows the rest`, () => {
      expect(run(arch, { nr: nr.socket, args: [1, 1] })).toBe(EACCES);
      expect(run(arch, { nr: nr.socket, args: [1, 2] })).toBe(EACCES);
      expect(run(arch, { nr: nr.socket, args: [1, 0x80801] })).toBe(EACCES);
      expect(run(arch, { nr: nr.socketpair, args: [1, 2] })).toBe(EACCES);
      expect(run(arch, { nr: nr.socketpair, args: [1, 2 | 0x80000] })).toBe(EACCES);
      expect(run(arch, { nr: nr.io_uring_setup })).toBe(EACCES);
      expect(run(arch, { nr: nr.socket, args: [2, 1] })).toBe(ALLOW);
      expect(run(arch, { nr: nr.socket, args: [10, 2] })).toBe(ALLOW);
      expect(run(arch, { nr: nr.socketpair, args: [1, 1] })).toBe(ALLOW);
      expect(run(arch, { nr: nr.socketpair, args: [1, 5] })).toBe(ALLOW);
      expect(run(arch, { nr: nr.connect })).toBe(ALLOW);
      expect(run(arch, { nr: 0 })).toBe(ALLOW);
    });
    it(`${arch}: a system call under another architecture kills the process`, () => {
      expect(run(arch, { nr: 102, archId: 0x40000003 })).toBe(KILL);
    });
  }

  it("x64: every x32 system call is refused", () => {
    expect(run("x64", { nr: 0x40000000 + 41, args: [1, 1] })).toBe(ENOSYS);
    expect(run("x64", { nr: 0x40000000 })).toBe(ENOSYS);
  });

  it("covers x86_64 and aarch64 only", () => {
    expect(seccompArch("x64")).toBe("x64");
    expect(seccompArch("arm64")).toBe("arm64");
    expect(seccompArch("ia32")).toBeNull();
    expect(seccompArch("riscv64")).toBeNull();
  });

  const arch = seccompArch();
  const bwrap = spawnSync("bwrap", ["--version"], { stdio: "ignore" }).status === 0;
  it.skipIf(!arch || !bwrap)("installed by bubblewrap, a Unix socket is refused", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seccomp-test-"));
    try {
      const bpf = path.join(dir, "f.bpf");
      fs.writeFileSync(bpf, unixSocketFilter(arch!));
      const code =
        'const net=require("node:net");const out=[];' +
        'net.connect("/nonexistent/x.sock").on("error",(e)=>{out.push(e.code);' +
        'const s=net.connect(1,"127.0.0.1");s.on("error",(e2)=>{out.push(e2.code);console.log(out.join(","))})})';
      const r = spawnSync(
        "sh",
        [
          "-c",
          'exec bwrap --dev-bind / / --seccomp 3 -- "$1" -e "$2" 3<"$0"',
          bpf,
          process.execPath,
          code,
        ],
        { encoding: "utf8" },
      );
      expect(r.stdout.trim()).toBe("EACCES,ECONNREFUSED");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
