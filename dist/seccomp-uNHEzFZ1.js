//#region src/enclawed/netcage/seccomp.ts
const AUDIT_ARCH = {
	x64: 3221225534,
	arm64: 3221225655
};
const NR = {
	x64: {
		socket: 41,
		socketpair: 53,
		io_uring_setup: 425
	},
	arm64: {
		socket: 198,
		socketpair: 199,
		io_uring_setup: 425
	}
};
const X32_SYSCALL_BIT = 1073741824;
const AF_UNIX = 1;
const SOCK_DGRAM = 2;
const SOCK_TYPE_MASK = 15;
const SECCOMP_RET_KILL_PROCESS = 2147483648;
const SECCOMP_RET_ERRNO = 327680;
const SECCOMP_RET_ALLOW = 2147418112;
const EACCES = 13;
const ENOSYS = 38;
const OFF_NR = 0;
const OFF_ARCH = 4;
const argLow = (i) => 16 + 8 * i;
const LD_W_ABS = 32;
const JEQ_K = 21;
const JGE_K = 53;
const AND_K = 84;
const RET_K = 6;
/** The filter's program for `arch`, as resolved instructions. */
function unixSocketFilterProgram(arch) {
	const nr = NR[arch];
	const lines = [
		{
			code: LD_W_ABS,
			jt: 0,
			jf: 0,
			k: OFF_ARCH
		},
		{
			code: JEQ_K,
			k: AUDIT_ARCH[arch],
			t: null,
			f: "kill"
		},
		{
			code: LD_W_ABS,
			jt: 0,
			jf: 0,
			k: OFF_NR
		},
		...arch === "x64" ? [{
			code: JGE_K,
			k: X32_SYSCALL_BIT,
			t: "enosys",
			f: null
		}] : [],
		{
			code: JEQ_K,
			k: nr.socket,
			t: "socket",
			f: null
		},
		{
			code: JEQ_K,
			k: nr.socketpair,
			t: "socketpair",
			f: null
		},
		{
			code: JEQ_K,
			k: nr.io_uring_setup,
			t: "eacces",
			f: "allow"
		},
		{ label: "socket" },
		{
			code: LD_W_ABS,
			jt: 0,
			jf: 0,
			k: argLow(0)
		},
		{
			code: JEQ_K,
			k: AF_UNIX,
			t: "eacces",
			f: "allow"
		},
		{ label: "socketpair" },
		{
			code: LD_W_ABS,
			jt: 0,
			jf: 0,
			k: argLow(0)
		},
		{
			code: JEQ_K,
			k: AF_UNIX,
			t: null,
			f: "allow"
		},
		{
			code: LD_W_ABS,
			jt: 0,
			jf: 0,
			k: argLow(1)
		},
		{
			code: AND_K,
			jt: 0,
			jf: 0,
			k: SOCK_TYPE_MASK
		},
		{
			code: JEQ_K,
			k: SOCK_DGRAM,
			t: "eacces",
			f: "allow"
		},
		{ label: "allow" },
		{
			code: RET_K,
			jt: 0,
			jf: 0,
			k: SECCOMP_RET_ALLOW
		},
		{ label: "eacces" },
		{
			code: RET_K,
			jt: 0,
			jf: 0,
			k: SECCOMP_RET_ERRNO | EACCES
		},
		{ label: "enosys" },
		{
			code: RET_K,
			jt: 0,
			jf: 0,
			k: SECCOMP_RET_ERRNO | ENOSYS
		},
		{ label: "kill" },
		{
			code: RET_K,
			jt: 0,
			jf: 0,
			k: SECCOMP_RET_KILL_PROCESS
		}
	];
	const at = /* @__PURE__ */ new Map();
	let pc = 0;
	for (const l of lines) if ("label" in l) at.set(l.label, pc);
	else pc++;
	const out = [];
	for (const l of lines) {
		if ("label" in l) continue;
		if ("t" in l) {
			const here = out.length;
			const rel = (target) => {
				if (target === null) return 0;
				const dest = at.get(target);
				if (dest === void 0 || dest <= here) throw new Error(`seccomp: bad jump target ${target}`);
				const off = dest - here - 1;
				if (off > 255) throw new Error("seccomp: jump too far");
				return off;
			};
			out.push({
				code: l.code,
				jt: rel(l.t),
				jf: rel(l.f),
				k: l.k >>> 0
			});
		} else out.push({
			...l,
			k: l.k >>> 0
		});
	}
	return out;
}
/** The filter as the bytes `bwrap --seccomp` reads (struct sock_filter[], little-endian). */
function unixSocketFilter(arch) {
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
function seccompArch(arch = process.arch) {
	return arch === "x64" || arch === "arm64" ? arch : null;
}
//#endregion
export { unixSocketFilter as n, seccompArch as t };
