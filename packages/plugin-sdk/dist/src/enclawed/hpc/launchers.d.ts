import type { Word } from "./shell-words.js";
export type Scheduler = "mpi" | "slurm" | "moab" | "flux";
export type Program = {
    argv: string[];
    /** True if any program word is computed by the shell at run time. */
    dynamic: boolean;
    /** Index in the launcher's argument list where this program's argv starts. */
    offset: number;
};
export type LaunchRequest = {
    kind: "launch";
    scheduler: Scheduler;
    /** e.g. "mpirun", "srun", "sbatch", "msub", "flux run". */
    verb: string;
    /** True when the command asks the scheduler for new resources (and so spends allocation). */
    createsAllocation: boolean;
    ranks: number | null;
    nodes: number | null;
    walltimeMinutes: number | null;
    partition: string | null;
    account: string | null;
    /** What runs on the ranks. Batch submissions run a script instead (see script). */
    programs: Program[];
    /** The batch script path (sbatch, msub, flux batch), or "-" for stdin. */
    script: string | null;
    /** Command lines this launch will run later, to be checked like the outer one. */
    inner: string[];
    problems: string[];
};
export type ControlRequest = {
    kind: "control";
    scheduler: Scheduler;
    verb: string;
    /** Cancels or alters existing jobs (scancel, canceljob, mjobctl, flux cancel). */
    mutates: boolean;
};
export type HpcRequest = LaunchRequest | ControlRequest;
/**
 * `#SBATCH`, `#MSUB`/`#PBS` and `#FLUX:` lines in a batch script. Options on
 * the command line override them, so callers apply these first.
 */
export declare function scriptDirectives(body: string, prefix: RegExp): Word[];
/** Strips directive and comment lines so the body can be checked as commands. */
export declare function scriptBody(body: string): string;
export type LauncherEnv = {
    /** Inside a Slurm allocation, srun starts a step instead of a new job. */
    inAllocation: boolean;
    /** Inside a Flux job, flux run/submit use the enclosing instance's resources. */
    inFluxJob: boolean;
    readScript: (path: string) => string | null;
};
/** Classifies a command whose first word is `verb` (already stripped of wrappers). */
export declare function parseLauncher(verb: string, args: Word[], env: LauncherEnv): HpcRequest | null;
export declare function isLauncherVerb(verb: string): boolean;
