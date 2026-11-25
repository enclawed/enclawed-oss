/**
 * The longest Unix socket path every platform accepts (macOS: 104 bytes with the NUL), with a
 * margin; and the longest session root that leaves room under it for a session directory
 * (`s-XXXXXX`, `a-XXXXXX`) and a socket name (`ctl.sock`, `relay.sock`).
 */
export declare const UNIX_SOCKET_PATH_MAX_BYTES = 100;
export declare const SESSION_ROOT_MAX_BYTES: number;
/**
 * A fresh private (0700) directory for Unix sockets whose names are at most `maxName` bytes:
 * the first of XDG_RUNTIME_DIR, the system temp directory and /tmp where `<dir>/<name>` fits
 * UNIX_SOCKET_PATH_MAX_BYTES. Throws, saying so, when none does.
 */
export declare function privateSocketDir(prefix: string, o?: Readonly<{
    env?: Readonly<Record<string, string | undefined>>;
    maxName?: number;
}>): string;
