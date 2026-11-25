// Where this process sits in a parallel job, read from what the launcher set.
//
// mpirun/mpiexec (MPICH Hydra, Open MPI, Intel MPI), srun (Slurm, with or
// without PMIx) and flux run each export the rank, the job size and a job id
// under their own names. Reading them means a rank needs no configuration of
// its own to find its place in the swarm.

export type LaunchContext = {
  rank: number;
  size: number;
  /** Stable per job; identical on every rank of the same launch. */
  jobId: string;
  /** Which launcher set the variables. */
  source: "pmix" | "pmi" | "openmpi" | "slurm" | "flux" | "none";
  localRank: number | null;
};

function int(v: string | undefined): number | null {
  if (v === undefined || !/^\d+$/.test(v)) {
    return null;
  }
  return Number(v);
}

export function launchContext(env: NodeJS.ProcessEnv = process.env): LaunchContext {
  const pick = (
    source: LaunchContext["source"],
    rank: string | undefined,
    size: string | undefined,
    jobId: string | undefined,
    localRank: string | undefined,
  ): LaunchContext | null => {
    const r = int(rank);
    const s = int(size);
    if (r === null || s === null || r >= s) {
      return null;
    }
    return { rank: r, size: s, jobId: jobId ?? "local", source, localRank: int(localRank) };
  };
  const jobFallback = env.SLURM_JOB_ID ?? env.FLUX_JOB_ID ?? env.PMIX_NAMESPACE;
  return (
    // Flux and Slurm first: under srun --mpi=pmix both PMIx and Slurm are set,
    // and the scheduler's job id is the one that names the allocation.
    pick("flux", env.FLUX_TASK_RANK, env.FLUX_JOB_SIZE, env.FLUX_JOB_ID, env.FLUX_TASK_LOCAL_ID) ??
    pick(
      "slurm",
      env.SLURM_PROCID,
      env.SLURM_NTASKS ?? env.SLURM_NPROCS,
      env.SLURM_JOB_ID && env.SLURM_STEP_ID
        ? `${env.SLURM_JOB_ID}.${env.SLURM_STEP_ID}`
        : env.SLURM_JOB_ID,
      env.SLURM_LOCALID,
    ) ??
    pick(
      "pmix",
      env.PMIX_RANK,
      env.PMIX_SIZE ?? env.OMPI_COMM_WORLD_SIZE,
      env.PMIX_NAMESPACE,
      env.OMPI_COMM_WORLD_LOCAL_RANK,
    ) ??
    pick(
      "openmpi",
      env.OMPI_COMM_WORLD_RANK,
      env.OMPI_COMM_WORLD_SIZE,
      env.OMPI_MCA_ess_base_jobid ?? jobFallback,
      env.OMPI_COMM_WORLD_LOCAL_RANK,
    ) ??
    pick("pmi", env.PMI_RANK, env.PMI_SIZE, env.PMI_JOBID ?? jobFallback, env.MPI_LOCALRANKID) ?? {
      rank: 0,
      size: 1,
      jobId: "local",
      source: "none",
      localRank: null,
    }
  );
}
