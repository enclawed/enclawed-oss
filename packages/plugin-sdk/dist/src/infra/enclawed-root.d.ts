export declare function resolveEnclawedPackageRoot(opts: {
    cwd?: string;
    argv1?: string;
    moduleUrl?: string;
}): Promise<string | null>;
export declare function resolveEnclawedPackageRootSync(opts: {
    cwd?: string;
    argv1?: string;
    moduleUrl?: string;
}): string | null;
