// Seccomp filter for strict-exec containment (MCP servers).
//
// In strict mode the view holds exactly the declared programs, their
// libraries and the server's package; every writable mount is noexec. The
// one remaining way to run a program that is not in the view is anonymous
// executable memory: memfd_create(2) and an execve of /proc/self/fd/N
// (the vm.memfd_noexec sysctl cannot be set from an unprivileged
// namespace). This filter refuses memfd_create with EPERM, and refuses
// every syscall made through a foreign ABI (x32, i386 on x86_64), whose
// numbers would otherwise not match the native check.
//
// Every contained run (containedSeccompFilter) also refuses, with EPERM, the
// syscalls that reach another process's memory or a process's own code pages
// past their protection: ptrace, process_vm_readv/process_vm_writev and
// pidfd_getfd. (A process's own /proc/self/mem, which writes through page
// protection, is closed by mounting /proc read-only: ./contain-init.ts.)
//
// Format: a raw `struct sock_filter` array, as bubblewrap's --seccomp reads it.

const BPF_LD_W_ABS = 0x20;
const BPF_JEQ_K = 0x15;
const BPF_JGE_K = 0x35;
const BPF_RET_K = 0x06;

const SECCOMP_RET_ALLOW = 0x7fff0000;
const SECCOMP_RET_ERRNO = 0x00050000;
const EPERM = 1;
const ENOSYS = 38;

const ARCH = {
  x64: {
    audit: 0xc000003e,
    memfdCreate: 319,
    x32Bit: 0x40000000,
    // ptrace, process_vm_readv, process_vm_writev, pidfd_getfd
    memoryReach: [101, 310, 311, 438],
  },
  arm64: { audit: 0xc00000b7, memfdCreate: 279, x32Bit: null, memoryReach: [117, 270, 271, 438] },
} as const;

type Insn = [code: number, jt: number, jf: number, k: number];

/** The filter for this machine's architecture, or null when it has none (strict mode then refuses). */
export function strictExecSeccompFilter(arch: string = process.arch): Buffer | null {
  return containedSeccompFilter(arch, true);
}

/**
 * The filter every contained run gets: no foreign ABI, no syscall that reaches
 * process memory past its protection, and in strict mode no memfd_create.
 * null: this architecture has none (containment is then refused).
 */
export function containedSeccompFilter(arch: string = process.arch, strict = false): Buffer | null {
  const a = ARCH[arch as keyof typeof ARCH];
  if (!a) {
    return null;
  }
  const prog: Insn[] = [];
  prog.push([BPF_LD_W_ABS, 0, 0, 4]); // seccomp_data.arch
  prog.push([BPF_JEQ_K, 1, 0, a.audit]);
  prog.push([BPF_RET_K, 0, 0, SECCOMP_RET_ERRNO | ENOSYS]); // foreign ABI
  prog.push([BPF_LD_W_ABS, 0, 0, 0]); // seccomp_data.nr
  if (a.x32Bit !== null) {
    prog.push([BPF_JGE_K, 0, 1, a.x32Bit]);
    prog.push([BPF_RET_K, 0, 0, SECCOMP_RET_ERRNO | ENOSYS]); // x32 ABI
  }
  const refused = [...a.memoryReach, ...(strict ? [a.memfdCreate] : [])];
  for (const nr of refused) {
    prog.push([BPF_JEQ_K, 0, 1, nr]);
    prog.push([BPF_RET_K, 0, 0, SECCOMP_RET_ERRNO | EPERM]);
  }
  prog.push([BPF_RET_K, 0, 0, SECCOMP_RET_ALLOW]);
  const out = Buffer.alloc(prog.length * 8);
  prog.forEach(([code, jt, jf, k], i) => {
    out.writeUInt16LE(code, i * 8);
    out.writeUInt8(jt, i * 8 + 2);
    out.writeUInt8(jf, i * 8 + 3);
    out.writeUInt32LE(k >>> 0, i * 8 + 4);
  });
  return out;
}
