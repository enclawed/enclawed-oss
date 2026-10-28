// The `enclawed.hpc` config block: which schedulers agents may use, what they
// may run, and how much of the machine they may ask for.
//
//   "enclawed": {
//     "hpc": {
//       "enforce": true,
//       "schedulers": ["slurm", "flux", "mpi", "moab"],
//       "executables": ["/p/lustre1/myteam/bin/", "module:mypkg.train"],
//       "maxRanks": 4096,
//       "maxNodes": 64,
//       "maxWalltimeMinutes": 720,
//       "partitions": ["pbatch", "pdebug"],
//       "accounts": ["myproject"],
//       "nodeHourBudget": 500,
//       "allowJobControl": true,
//       "launcherPaths": ["/opt/enclawed/shims/mpiexec", "/opt/enclawed/shims/srun"],
//       "clusterHosts": ["login1.example.gov", "bastion.example.gov"],
//       "staging": { "local": "/home/me/cluster-stage", "remote": "/p/lustre1/me/stage" },
//       "allowDownload": false
//     }
//   }
//
// Executable entries: a path ending in "/" allows everything under that
// directory; any other path containing "/" allows that exact file; a bare
// name ("python3") allows that program wherever PATH finds it; "module:X"
// allows `python -m X`. Lists that are absent impose no limit; a list that is
// present but empty allows nothing.
//
// launcherPaths: when set, a launcher named with a path (/usr/bin/mpiexec,
// ./srun) must be one of these exact files. Bare names resolve through PATH,
// which the gate also protects (see gate.ts), so this pins agents to the
// site's shims, which wrap every rank in `enclawed swarm rank`.
//
// clusterHosts: the SSH login and jump hosts an agent may reach (see
// remote.ts), and from the login node, compute nodes by pattern
// (node*.lab.gov). When set, ssh/scp/rsync to any other host is refused. staging:
// the only place files may be copied to on the cluster, and its local mirror;
// a remote batch script is checked by reading its local copy. allowDownload:
// whether files may be copied back off the cluster (off by default).

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
  /** Allow cancelling or altering jobs (scancel, canceljob, mjobctl, flux cancel). */
  allowJobControl: boolean;
  launcherPaths: readonly string[] | null;
  clusterHosts: ReadonlySet<string> | null;
  staging: Readonly<{ local: string; remote: string }> | null;
  allowDownload: boolean;
}>;

const SCHEDULERS: readonly HpcScheduler[] = ["mpi", "slurm", "moab", "flux"];

function stringList(v: unknown, key: string): string[] | null {
  if (v === undefined) {
    return null;
  }
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
    throw new TypeError(`enclawed.hpc.${key} must be a string array`);
  }
  return v;
}

function positive(v: unknown, key: string): number | null {
  if (v === undefined) {
    return null;
  }
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
    throw new TypeError(`enclawed.hpc.${key} must be a positive number`);
  }
  return v;
}

/** Parses the `enclawed.hpc` block. Returns null when the block is absent (gate off). */
export function parseHpcPolicy(raw: unknown): HpcPolicy | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("enclawed.hpc must be an object");
  }
  const cfg = raw as Record<string, unknown>;
  if (cfg.enforce !== undefined && typeof cfg.enforce !== "boolean") {
    throw new TypeError("enclawed.hpc.enforce must be a boolean");
  }
  if (cfg.allowJobControl !== undefined && typeof cfg.allowJobControl !== "boolean") {
    throw new TypeError("enclawed.hpc.allowJobControl must be a boolean");
  }
  const schedulers = stringList(cfg.schedulers, "schedulers") ?? [...SCHEDULERS];
  for (const s of schedulers) {
    if (!SCHEDULERS.includes(s as HpcScheduler)) {
      throw new TypeError(`enclawed.hpc.schedulers: unknown scheduler "${s}"`);
    }
  }
  if (cfg.allowDownload !== undefined && typeof cfg.allowDownload !== "boolean") {
    throw new TypeError("enclawed.hpc.allowDownload must be a boolean");
  }
  let staging: { local: string; remote: string } | null = null;
  if (cfg.staging !== undefined) {
    const st = cfg.staging as Record<string, unknown> | null;
    if (
      !st ||
      typeof st.local !== "string" ||
      typeof st.remote !== "string" ||
      !st.local.startsWith("/") ||
      !st.remote.startsWith("/")
    ) {
      throw new TypeError("enclawed.hpc.staging needs absolute local and remote paths");
    }
    staging = { local: st.local, remote: st.remote };
  }
  const clusterHosts = stringList(cfg.clusterHosts, "clusterHosts");
  for (const h of clusterHosts ?? []) {
    // Names and patterns like node*.lab.gov; a pattern must name a domain.
    if (!/^[A-Za-z0-9*.-]+$/.test(h) || (h.includes("*") && !/\.[A-Za-z0-9-]+$/.test(h))) {
      throw new TypeError(
        `enclawed.hpc.clusterHosts: "${h}" must be a host name or a pattern such as node*.lab.gov`,
      );
    }
  }
  const partitions = stringList(cfg.partitions, "partitions");
  const accounts = stringList(cfg.accounts, "accounts");
  return Object.freeze({
    enforce: cfg.enforce ?? true,
    schedulers: new Set(schedulers as HpcScheduler[]),
    executables: stringList(cfg.executables, "executables"),
    maxRanks: positive(cfg.maxRanks, "maxRanks"),
    maxNodes: positive(cfg.maxNodes, "maxNodes"),
    maxWalltimeMinutes: positive(cfg.maxWalltimeMinutes, "maxWalltimeMinutes"),
    partitions: partitions ? new Set(partitions) : null,
    accounts: accounts ? new Set(accounts) : null,
    nodeHourBudget: positive(cfg.nodeHourBudget, "nodeHourBudget"),
    allowJobControl: cfg.allowJobControl !== false,
    launcherPaths: stringList(cfg.launcherPaths, "launcherPaths"),
    clusterHosts: clusterHosts ? new Set(clusterHosts.map((h) => h.toLowerCase())) : null,
    staging,
    allowDownload: cfg.allowDownload === true,
  });
}

export function extractHpcBlock(rawDocument: unknown): unknown {
  if (!rawDocument || typeof rawDocument !== "object" || Array.isArray(rawDocument)) {
    return undefined;
  }
  const enclawed = (rawDocument as Record<string, unknown>).enclawed;
  if (!enclawed || typeof enclawed !== "object" || Array.isArray(enclawed)) {
    return undefined;
  }
  return (enclawed as Record<string, unknown>).hpc;
}
