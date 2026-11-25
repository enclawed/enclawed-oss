// The network cage's syscall filter: the caged command cannot create a Unix
// socket, so no host Unix socket (Docker, D-Bus, SSH agent, WSL interop, an
// Enclawed broker, anything a host process listens on) is reachable from it,
// wherever the socket file lives, however many files surround it and whenever
// it appears. Abstract-namespace sockets belong to the cage's own network
// namespace already.
//
// The filter is classic BPF over seccomp_data, assembled here from reviewed
// source (no binary artifact); seccomp.test.ts pins the bytes per architecture.
// It refuses, with EACCES:
//   - socket(AF_UNIX, ...)                        (any type)
//   - socketpair(AF_UNIX, SOCK_DGRAM, ...)        (a datagram socket can sendto() a path;
//                                                  stream and seqpacket pairs stay allowed:
//                                                  they are connected and cannot re-connect)
//   - io_uring_setup                              (IORING_OP_SOCKET bypasses the socket syscall)
// and on x86_64 every x32 system call (ENOSYS). A system call made under any
// other architecture than the filter's own (i386 through int 0x80) kills the
// process. Architectures covered: x86_64 and aarch64; any other refuses the cage.
//
// bubblewrap installs the filter (`--seccomp <fd>`) right before it executes
// the command, with no_new_privs set; see cage-init.ts.

export type SeccompArch = "x64" | "arm64";

const AUDIT_ARCH = { x64: 0xc000003e, arm64: 0xc00000b7 } as const;
// System call numbers (asm/unistd_64.h for x86_64; the generic table for aarch64).
const NR = {
  x64: { socket: 41, socketpair: 53, io_uring_setup: 425 },
  arm64: { socket: 198, socketpair: 199, io_uring_setup: 425 },
} as const;
const X32_SYSCALL_BIT = 0x40000000;
const AF_UNIX = 1;
const SOCK_DGRAM = 2;
const SOCK_TYPE_MASK = 0xf;

const SECCOMP_RET_KILL_PROCESS = 0x80000000;
const SECCOMP_RET_ERRNO = 0x00050000;
const SECCOMP_RET_ALLOW = 0x7fff0000;
const EACCES = 13;
const ENOSYS = 38;

// struct seccomp_data: int nr; u32 arch; u64 instruction_pointer; u64 args[6].
// Both architectures are little-endian, so an argument's low 32 bits are at
// 16 + 8 * i. The kernel reads these arguments as int, so the low word decides.
const OFF_NR = 0;
const OFF_ARCH = 4;
const argLow = (i: number) => 16 + 8 * i;

// BPF opcodes.
const LD_W_ABS = 0x20;
const JEQ_K = 0x15;
const JGE_K = 0x35;
const AND_K = 0x54;
const RET_K = 0x06;

type Insn = { code: number; jt: number; jf: number; k: number };
type Jump = { code: number; k: number; t: string | null; f: string | null };
type Line = Insn | Jump | { label: string };

/** The filter's program for `arch`, as resolved instructions. */
export function unixSocketFilterProgram(arch: SeccompArch): Insn[] {
  const nr = NR[arch];
  const lines: Line[] = [
    { code: LD_W_ABS, jt: 0, jf: 0, k: OFF_ARCH },
    { code: JEQ_K, k: AUDIT_ARCH[arch], t: null, f: "kill" },
    { code: LD_W_ABS, jt: 0, jf: 0, k: OFF_NR },
    ...(arch === "x64" ? [{ code: JGE_K, k: X32_SYSCALL_BIT, t: "enosys", f: null }] : []),
    { code: JEQ_K, k: nr.socket, t: "socket", f: null },
    { code: JEQ_K, k: nr.socketpair, t: "socketpair", f: null },
    { code: JEQ_K, k: nr.io_uring_setup, t: "eacces", f: "allow" },
    { label: "socket" },
    { code: LD_W_ABS, jt: 0, jf: 0, k: argLow(0) },
    { code: JEQ_K, k: AF_UNIX, t: "eacces", f: "allow" },
    { label: "socketpair" },
    { code: LD_W_ABS, jt: 0, jf: 0, k: argLow(0) },
    { code: JEQ_K, k: AF_UNIX, t: null, f: "allow" },
    { code: LD_W_ABS, jt: 0, jf: 0, k: argLow(1) },
    { code: AND_K, jt: 0, jf: 0, k: SOCK_TYPE_MASK },
    { code: JEQ_K, k: SOCK_DGRAM, t: "eacces", f: "allow" },
    { label: "allow" },
    { code: RET_K, jt: 0, jf: 0, k: SECCOMP_RET_ALLOW },
    { label: "eacces" },
    { code: RET_K, jt: 0, jf: 0, k: SECCOMP_RET_ERRNO | EACCES },
    { label: "enosys" },
    { code: RET_K, jt: 0, jf: 0, k: SECCOMP_RET_ERRNO | ENOSYS },
    { label: "kill" },
    { code: RET_K, jt: 0, jf: 0, k: SECCOMP_RET_KILL_PROCESS },
  ];
  const at = new Map<string, number>();
  let pc = 0;
  for (const l of lines) {
    if ("label" in l) {
      at.set(l.label, pc);
    } else {
      pc++;
    }
  }
  const out: Insn[] = [];
  for (const l of lines) {
    if ("label" in l) {
      continue;
    }
    if ("t" in l) {
      const here = out.length;
      // A jump offset counts from the next instruction; null falls through.
      const rel = (target: string | null) => {
        if (target === null) {
          return 0;
        }
        const dest = at.get(target);
        if (dest === undefined || dest <= here) {
          throw new Error(`seccomp: bad jump target ${target}`);
        }
        const off = dest - here - 1;
        if (off > 255) {
          throw new Error("seccomp: jump too far");
        }
        return off;
      };
      out.push({ code: l.code, jt: rel(l.t), jf: rel(l.f), k: l.k >>> 0 });
    } else {
      out.push({ ...l, k: l.k >>> 0 });
    }
  }
  return out;
}

/** The filter as the bytes `bwrap --seccomp` reads (struct sock_filter[], little-endian). */
export function unixSocketFilter(arch: SeccompArch): Buffer {
  const prog = unixSocketFilterProgram(arch);
  const buf = Buffer.alloc(prog.length * 8);
  prog.forEach((i, n) => {
    buf.writeUInt16LE(i.code, n * 8);
    buf.writeUInt8(i.jt, n * 8 + 2);
    buf.writeUInt8(i.jf, n * 8 + 3);
    buf.writeUInt32LE(i.k, n * 8 + 4);
  });
  return buf;
}

/** This host's filter architecture, or null when the cage has no filter for it. */
export function seccompArch(arch: string = process.arch): SeccompArch | null {
  return arch === "x64" || arch === "arm64" ? arch : null;
}
