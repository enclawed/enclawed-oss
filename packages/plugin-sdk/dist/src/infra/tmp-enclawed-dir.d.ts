export declare const POSIX_ENCLAWED_TMP_DIR = "/tmp/enclawed";
type ResolvePreferredEnclawedTmpDirOptions = {
    accessSync?: (path: string, mode?: number) => void;
    chmodSync?: (path: string, mode: number) => void;
    lstatSync?: (path: string) => {
        isDirectory(): boolean;
        isSymbolicLink(): boolean;
        mode?: number;
        uid?: number;
    };
    mkdirSync?: (path: string, opts: {
        recursive: boolean;
        mode?: number;
    }) => void;
    getuid?: () => number | undefined;
    tmpdir?: () => string;
    warn?: (message: string) => void;
};
export declare function resolvePreferredEnclawedTmpDir(options?: ResolvePreferredEnclawedTmpDirOptions): string;
export {};
