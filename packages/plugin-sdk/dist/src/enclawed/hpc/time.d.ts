/** Slurm: M, M:S, H:M:S, D-H, D-H:M, D-H:M:S, or UNLIMITED/INFINITE. */
export declare function slurmMinutes(value: string): number | null;
/** Moab and PBS walltime: [[[DD:]HH:]MM:]SS. */
export declare function pbsMinutes(value: string): number | null;
/** Flux: a bare number is minutes; otherwise Flux standard duration (30s, 10m, 2h, 1d). */
export declare function fluxMinutes(value: string): number | null;
