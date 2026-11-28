export type CageInitConfig = {
    command: string;
    args: string[];
    cwd?: string;
    /** Ports the command serves inside the cage, relayed to `${sockDir}/<port>.sock`. */
    expose: number[];
    sockDir: string;
    /** The host's event socket (inside sockDir). */
    eventSock: string;
};
export declare const SINKHOLE_IPV4 = "198.18.0.1";
export declare const TRAPPED_ADDRESSES: string[];
export declare const CAGE_EPHEMERAL: readonly [61000, 61999];
export declare const inflight: Set<() => void>;
export declare function trapPortList(exclude: Iterable<number>): number[];
export declare function scrubCageEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export type Emit = (event: Record<string, unknown>) => void;
export type Emitter = {
    emit: Emit;
    close: () => Promise<void>;
};
export declare function connectEmitter(sockPath: string): Promise<Emitter>;
/** Nameserver addresses from resolv.conf text. */
export declare function parseNameservers(resolvConf: string): string[];
export declare function setUpNetwork(emit: Emit): {
    watching: boolean;
    local: Set<string>;
};
/** Transmitted-packet count of an interface, from /proc/net/dev text. */
export declare function txPackets(procNetDev: string, dev: string): number | null;
/**
 * Remote endpoints of sockets that are connecting or connected to an
 * address off the machine, from /proc/net/{tcp,tcp6,udp,udp6} text. A socket
 * whose peer is local (loopback, or an address the cage made local) is not
 * an attempt to leave and is skipped by the caller's `isLocal`.
 */
export declare function remoteEndpoints(procNetText: string, isLocal: (ip: string) => boolean): {
    dst: string;
    port: number;
    inode: string;
}[];
export declare function watchSink(emit: Emit, local: Set<string>): () => void;
/**
 * The argv that runs the command under the Unix-socket filter: bubblewrap in
 * its own PID namespace with a fresh /proc (the command cannot see or trace
 * this process, which holds the cage's own sockets), reading the filter from
 * fd 3. Throws when this architecture has no filter: the command is not run.
 */
export declare function filteredCommand(cfg: Pick<CageInitConfig, "command" | "args" | "cwd">): string[];
export declare function startTraps(ports: number[], emit: Emit, dnsAnswer?: (name: string) => string): Promise<void>;
export declare function cageInit(cfg: CageInitConfig): Promise<{
    code: number;
    emitter: Emitter;
}>;
