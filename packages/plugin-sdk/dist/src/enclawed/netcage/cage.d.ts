export type NetCageAttempt = {
    type: "attempt";
    /** "ip" when only the dead-end interface's packet counter saw it. */
    transport: "tcp" | "udp" | "ip";
    /** Destination address, when the kernel kept it (TCP). */
    dst: string | null;
    port: number;
    bytes: number;
    /** Packets counted on the dead-end interface (transport "ip"). */
    packets?: number;
    protocol: "dns" | "tls" | "http" | "unknown";
    /** The name it tried to reach (DNS question, TLS server name, HTTP Host). */
    name: string | null;
    request: string | null;
    /** First bytes sent, base64. */
    sample: string;
    at: string;
};
export type NetCageEvent = NetCageAttempt | {
    type: "ready";
    at: string;
} | {
    type: "notice";
    message: string;
    at: string;
};
export type NetCageSupport = {
    ok: true;
} | {
    ok: false;
    reason: string;
};
/** Whether this host can cage a process (cached after the first probe). */
export declare function netCageSupport(): NetCageSupport;
/** For tests: forget the cached probe. */
export declare function resetNetCageSupportForTest(): void;
export type NetCage = {
    /** argv and env that run `command args` inside the cage. */
    wrap(command: string, args: string[], cwd?: string): {
        argv: string[];
        env: Record<string, string>;
    };
    /** The Unix socket the host connects to for a port the caged command serves. */
    exposedSocket(port: number): string;
    /** Stop listening for reports and remove the private directory. */
    close(): Promise<void>;
};
/**
 * Set up the host side of a cage: a private directory with the event socket
 * that cage-init reports to. One NetCage can wrap one command.
 */
export declare function openNetCage(opts: {
    expose?: number[];
    onEvent: (event: NetCageEvent) => void;
}): Promise<NetCage>;
/** Quote one argument for a POSIX shell. */
export declare function shellQuote(arg: string): string;
