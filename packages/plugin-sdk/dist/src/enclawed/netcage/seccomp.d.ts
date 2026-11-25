export type SeccompArch = "x64" | "arm64";
type Insn = {
    code: number;
    jt: number;
    jf: number;
    k: number;
};
/** The filter's program for `arch`, as resolved instructions. */
export declare function unixSocketFilterProgram(arch: SeccompArch): Insn[];
/** The filter as the bytes `bwrap --seccomp` reads (struct sock_filter[], little-endian). */
export declare function unixSocketFilter(arch: SeccompArch): Buffer;
/** This host's filter architecture, or null when the cage has no filter for it. */
export declare function seccompArch(arch?: string): SeccompArch | null;
export {};
