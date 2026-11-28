export type HpcScheduler = "mpi" | "slurm" | "moab" | "flux";
export type HpcPolicy = Readonly<{
    /** false: decide and audit, but never block (observe mode). */
    enforce: boolean;
    schedulers: ReadonlySet<HpcScheduler>;
    executables: readonly string[] | null;
    maxRanks: number | null;
    maxNodes: number | null;
    maxWalltimeMinutes: number | null;
    partitions: ReadonlySet<string> | null;
    accounts: ReadonlySet<string> | null;
    /** Node-hours this gateway may request over its lifetime. */
    nodeHourBudget: number | null;
    /** Allow cancelling or altering jobs (scancel, canceljob, mjobctl, flux cancel). Default false. */
    allowJobControl: boolean;
    launcherPaths: readonly string[] | null;
    clusterHosts: ReadonlySet<string> | null;
    staging: Readonly<{
        local: string;
        remote: string;
    }> | null;
    allowDownload: boolean;
}>;
/** Parses the `enclawed.hpc` block. Returns null when the block is absent (gate off). */
export declare function parseHpcPolicy(raw: unknown): HpcPolicy | null;
export declare function extractHpcBlock(rawDocument: unknown): unknown;
