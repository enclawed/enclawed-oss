// What a launcher invocation asks for: MPI, Slurm, Moab and Flux.
//
// Each parser reads the options that decide cost and reach (ranks, nodes,
// walltime, partition or queue, account), the program it runs, and any
// command lines it will run later (sbatch --wrap, salloc's command, a batch
// script's body), which the gate checks the same way. An option the parser
// does not know is reported as a problem rather than guessed at: guessing
// whether it takes a value decides which word is the program.

import type { Word } from "./shell-words.js";
import { fluxMinutes, pbsMinutes, slurmMinutes } from "./time.js";

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

type Field = "ranks" | "nodes" | "time" | "partition" | "account" | "wrap" | "resources";

type OptSpec = {
  /** Options that take one value, with the field it fills, if any. */
  withArg: Record<string, Field | null>;
  /** Options that take two values (mpirun --mca key value). */
  withTwoArgs?: string[];
  flags: string[];
};

type ParsedOptions = {
  values: Partial<Record<Field, Word>>;
  rest: Word[];
  problems: string[];
};

function parseOptions(words: Word[], spec: OptSpec): ParsedOptions {
  const values: Partial<Record<Field, Word>> = {};
  const problems: string[] = [];
  const two = new Set(spec.withTwoArgs ?? []);
  const flags = new Set(spec.flags);
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    const t = w.text;
    if (t === "--") {
      i += 1;
      break;
    }
    if (!t.startsWith("-") || t === "-") {
      break;
    }
    if (w.dynamic) {
      problems.push(`option ${t} is computed at run time`);
    }
    const eq = t.indexOf("=");
    const name = eq > 0 && t.startsWith("--") ? t.slice(0, eq) : t;
    if (name in spec.withArg) {
      let value: Word | undefined;
      if (eq > 0 && t.startsWith("--")) {
        value = { text: t.slice(eq + 1), dynamic: w.dynamic };
      } else {
        value = words[i + 1];
        i += 1;
      }
      if (!value) {
        problems.push(`option ${name} needs a value`);
        break;
      }
      const field = spec.withArg[name];
      if (field) {
        values[field] = value;
      }
      i += 1;
      continue;
    }
    if (two.has(name)) {
      i += 3;
      continue;
    }
    if (flags.has(name)) {
      i += 1;
      continue;
    }
    // A short option with its value glued on: -n4, -N2, -t30.
    const short = /^(-[A-Za-z])(.+)$/.exec(t);
    if (short && short[1] in spec.withArg) {
      const field = spec.withArg[short[1]];
      if (field) {
        values[field] = { text: short[2], dynamic: w.dynamic };
      }
      i += 1;
      continue;
    }
    problems.push(`unrecognized option ${name}`);
    i += 1;
  }
  return { values, rest: words.slice(i), problems };
}

function intOf(w: Word | undefined, problems: string[], what: string): number | null {
  if (!w) {
    return null;
  }
  if (w.dynamic) {
    problems.push(`${what} is computed at run time`);
    return null;
  }
  // Slurm accepts a node range "2-4"; the upper bound is what it may take.
  const m = /^(\d+)(?:-(\d+))?$/.exec(w.text);
  if (!m) {
    problems.push(`${what} "${w.text}" is not a number`);
    return null;
  }
  return Number(m[2] ?? m[1]);
}

function textOf(w: Word | undefined, problems: string[], what: string): string | null {
  if (!w) {
    return null;
  }
  if (w.dynamic) {
    problems.push(`${what} is computed at run time`);
    return null;
  }
  return w.text;
}

function timeOf(
  w: Word | undefined,
  problems: string[],
  parse: (v: string) => number | null,
): number | null {
  if (!w) {
    return null;
  }
  if (w.dynamic) {
    problems.push("walltime is computed at run time");
    return null;
  }
  const m = parse(w.text);
  if (m === null) {
    problems.push(`walltime "${w.text}" does not parse`);
  }
  return m;
}

function program(words: Word[], offset: number): Program {
  return { argv: words.map((w) => w.text), dynamic: words.some((w) => w.dynamic), offset };
}

function blank(scheduler: Scheduler, verb: string, createsAllocation: boolean): LaunchRequest {
  return {
    kind: "launch",
    scheduler,
    verb,
    createsAllocation,
    ranks: null,
    nodes: null,
    walltimeMinutes: null,
    partition: null,
    account: null,
    programs: [],
    script: null,
    inner: [],
    problems: [],
  };
}

// ---- MPI (Open MPI, MPICH/Hydra, Intel MPI, MVAPICH) -------------------

const MPI_SPEC: OptSpec = {
  withArg: {
    "-n": "ranks",
    "-np": "ranks",
    "-c": "ranks",
    "--n": "ranks",
    "--np": "ranks",
    "-N": null,
    "-ppn": null,
    "-npernode": null,
    "--npernode": null,
    "-H": null,
    "--host": null,
    "-host": null,
    "-hosts": null,
    "--hostfile": null,
    "-hostfile": null,
    "-machinefile": null,
    "--machinefile": null,
    "-f": null,
    "--map-by": null,
    "--rank-by": null,
    "--bind-to": null,
    "-bind-to": null,
    "-map-by": null,
    "-x": null,
    "-wdir": null,
    "--wdir": null,
    "-launcher": null,
    "-bootstrap": null,
    "-iface": null,
    "--prefix": null,
    "--output-filename": null,
    "-output-filename": null,
    "-genvlist": null,
  },
  withTwoArgs: ["--mca", "-mca", "-genv", "-env", "--gmca", "-gmca"],
  flags: [
    "--oversubscribe",
    "--allow-run-as-root",
    "--report-bindings",
    "--display-map",
    "--tag-output",
    "--timestamp-output",
    "-tag-output",
    "-genvall",
    "-genvnone",
    "-l",
    "-prepend-rank",
    "-v",
    "-q",
    "--quiet",
    "--verbose",
    // MPICH (Hydra): keep the other ranks running when one exits.
    "-disable-auto-cleanup",
    "--disable-auto-cleanup",
  ],
};

const MPI_VERBS = new Set([
  "mpirun",
  "mpiexec",
  "mpiexec.hydra",
  "orterun",
  "mpirun_rsh",
  "prterun",
]);

function parseMpi(verb: string, words: Word[]): LaunchRequest {
  const req = blank("mpi", verb, false);
  // MPMD: mpirun -n 2 a : -n 4 b
  const segments: Word[][] = [[]];
  const starts = [0];
  words.forEach((w, i) => {
    if (w.text === ":" && !w.dynamic) {
      segments.push([]);
      starts.push(i + 1);
    } else {
      segments[segments.length - 1].push(w);
    }
  });
  let total = 0;
  let known = true;
  for (const [k, seg] of segments.entries()) {
    const opts = parseOptions(seg, MPI_SPEC);
    req.problems.push(...opts.problems);
    const n = intOf(opts.values.ranks, req.problems, "rank count");
    if (n === null) {
      known = false;
    } else {
      total += n;
    }
    if (opts.rest.length === 0) {
      req.problems.push("no program to run");
    } else {
      req.programs.push(program(opts.rest, starts[k] + seg.length - opts.rest.length));
    }
  }
  req.ranks = known ? total : null;
  return req;
}

// ---- Slurm --------------------------------------------------------------

const SLURM_ARGS: Record<string, Field | null> = {
  "-A": "account",
  "--account": "account",
  "-n": "ranks",
  "--ntasks": "ranks",
  "-N": "nodes",
  "--nodes": "nodes",
  "-t": "time",
  "--time": "time",
  "-p": "partition",
  "--partition": "partition",
  "--wrap": "wrap",
};
for (const o of [
  "-b",
  "--begin",
  "-c",
  "--cpus-per-task",
  "-C",
  "--constraint",
  "-d",
  "--dependency",
  "-D",
  "--chdir",
  "-e",
  "--error",
  "-G",
  "--gpus",
  "--gres",
  "--gpus-per-node",
  "--gpus-per-task",
  "--gpus-per-socket",
  "-i",
  "--input",
  "-J",
  "--job-name",
  "-L",
  "--licenses",
  "-m",
  "--distribution",
  "--mem",
  "--mem-per-cpu",
  "--mem-per-gpu",
  "--ntasks-per-node",
  "--ntasks-per-socket",
  "--ntasks-per-core",
  "-o",
  "--output",
  "-q",
  "--qos",
  "-w",
  "--nodelist",
  "-x",
  "--exclude",
  "--mpi",
  "--export",
  "--cpu-bind",
  "--mem-bind",
  "--hint",
  "--signal",
  "-a",
  "--array",
  "--reservation",
  "--comment",
  "--mail-type",
  "--mail-user",
  "--wckey",
  "-M",
  "--clusters",
  "--het-group",
  "--container",
  "--time-min",
  "--deadline",
  "--tmp",
  "--network",
  "--switches",
  "--threads-per-core",
  "--cores-per-socket",
  "--sockets-per-node",
  "-B",
  "--extra-node-info",
  "--gpu-bind",
  "--cpus-per-gpu",
  "--nice",
  "--priority",
  "--profile",
  "--open-mode",
  "--uid",
  "--gid",
  "--export-file",
  "--prolog",
  "--epilog",
  "--task-prolog",
  "--task-epilog",
  "--acctg-freq",
  "--bcast",
  "--cpu-freq",
  "--jobid",
]) {
  SLURM_ARGS[o] = null;
}

const SLURM_FLAGS = [
  "--exclusive",
  "-l",
  "--label",
  "-u",
  "--unbuffered",
  "-v",
  "--verbose",
  "-Q",
  "--quiet",
  "--pty",
  "-K",
  "--kill-on-bad-exit",
  "-H",
  "--hold",
  "-W",
  "--wait",
  "--overlap",
  "--exact",
  "-s",
  "--oversubscribe",
  "-k",
  "--no-kill",
  "--propagate",
  "--requeue",
  "--no-requeue",
  "-I",
  "--immediate",
  "-O",
  "--overcommit",
  "-X",
  "--disable-status",
  "--test-only",
  "--parsable",
  "--contiguous",
  "--spread-job",
  "--use-min-nodes",
  "-Z",
  "--no-allocate",
  "--multi-prog",
  "--get-user-env",
  "--ignore-pbs",
  "-h",
  "--help",
  "--usage",
];

const SLURM_SPEC: OptSpec = { withArg: SLURM_ARGS, flags: SLURM_FLAGS };

function applySlurm(req: LaunchRequest, values: Partial<Record<Field, Word>>): void {
  const p = req.problems;
  if (values.ranks) {
    req.ranks = intOf(values.ranks, p, "task count");
  }
  if (values.nodes) {
    req.nodes = intOf(values.nodes, p, "node count");
  }
  if (values.time) {
    req.walltimeMinutes = timeOf(values.time, p, slurmMinutes);
  }
  if (values.partition) {
    req.partition = textOf(values.partition, p, "partition");
  }
  if (values.account) {
    req.account = textOf(values.account, p, "account");
  }
}

/**
 * `#SBATCH`, `#MSUB`/`#PBS` and `#FLUX:` lines in a batch script. Options on
 * the command line override them, so callers apply these first.
 */
export function scriptDirectives(body: string, prefix: RegExp): Word[] {
  const out: Word[] = [];
  for (const line of body.split("\n")) {
    const m = prefix.exec(line.trim());
    if (m) {
      for (const tok of m[1].trim().split(/\s+/).filter(Boolean)) {
        out.push({ text: tok, dynamic: false });
      }
    }
  }
  return out;
}

/** Strips directive and comment lines so the body can be checked as commands. */
export function scriptBody(body: string): string {
  return body
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
}

function parseSlurm(
  verb: "srun" | "sbatch" | "salloc",
  words: Word[],
  env: { inAllocation: boolean; readScript: (path: string) => string | null },
): LaunchRequest {
  const req = blank("slurm", verb, verb !== "srun" || !env.inAllocation);
  const opts = parseOptions(words, SLURM_SPEC);
  req.problems.push(...opts.problems);
  if (verb === "sbatch") {
    if (opts.values.wrap) {
      if (opts.values.wrap.dynamic) {
        req.problems.push("--wrap command is computed at run time");
      }
      req.inner.push(opts.values.wrap.text);
    } else {
      const scriptWord = opts.rest[0];
      req.script = scriptWord ? scriptWord.text : "-";
      if (scriptWord?.dynamic) {
        req.problems.push("batch script path is computed at run time");
      }
      const body = scriptWord && !scriptWord.dynamic ? env.readScript(scriptWord.text) : null;
      if (body === null) {
        req.problems.push(`cannot read batch script ${req.script}`);
      } else {
        const directives = parseOptions(scriptDirectives(body, /^#SBATCH\s+(.*)$/), SLURM_SPEC);
        req.problems.push(...directives.problems);
        applySlurm(req, directives.values);
        req.inner.push(scriptBody(body));
      }
    }
  } else if (verb === "salloc") {
    if (opts.rest.length > 0) {
      req.inner.push(opts.rest.map((w) => w.text).join(" "));
      if (opts.rest.some((w) => w.dynamic)) {
        req.problems.push("salloc command is computed at run time");
      }
    }
  } else if (opts.rest.length === 0) {
    req.problems.push("no program to run");
  } else {
    req.programs.push(program(opts.rest, words.length - opts.rest.length));
  }
  applySlurm(req, opts.values);
  return req;
}

// ---- Moab ---------------------------------------------------------------

const MOAB_SPEC: OptSpec = {
  withArg: {
    "-A": "account",
    "-q": "partition",
    "-l": "resources",
    "-a": null,
    "-c": null,
    "-C": null,
    "-d": null,
    "-e": null,
    "-j": null,
    "-k": null,
    "-m": null,
    "-M": null,
    "-N": null,
    "-o": null,
    "-p": null,
    "-r": null,
    "-S": null,
    "-t": null,
    "-u": null,
    "-v": null,
    "-W": null,
    "-F": null,
  },
  flags: ["-E", "-h", "-I", "-K", "-V", "-x", "-z"],
};

/** Moab/PBS resource lists, possibly given several times: nodes=2:ppn=36,walltime=01:00:00 */
function applyMoabResources(req: LaunchRequest, lists: Word[]): void {
  for (const w of lists) {
    if (w.dynamic) {
      req.problems.push("resource list is computed at run time");
      continue;
    }
    for (const item of w.text.split(",")) {
      // Not split("=", 2): JavaScript's limit drops the rest ("nodes=2:ppn=32" would lose ppn).
      const eq = item.indexOf("=");
      const key = eq < 0 ? item : item.slice(0, eq);
      const value = eq < 0 ? "" : item.slice(eq + 1);
      if (key === "walltime") {
        req.walltimeMinutes = timeOf({ text: value, dynamic: false }, req.problems, pbsMinutes);
      } else if (key === "nodes") {
        // nodes=N[:ppn=P][+M[:ppn=Q]...]
        let nodes = 0;
        let ranks = 0;
        for (const chunk of value.split("+")) {
          const m = /^(\d+)(?::ppn=(\d+))?/.exec(chunk);
          if (!m) {
            req.problems.push(`node spec "${chunk}" is not a count`);
            continue;
          }
          nodes += Number(m[1]);
          ranks += Number(m[1]) * Number(m[2] ?? 1);
        }
        req.nodes = nodes;
        req.ranks = ranks;
      } else if (key === "procs") {
        req.ranks = Number(value) || null;
      }
    }
  }
}

function collectAll(words: Word[], option: string): Word[] {
  const out: Word[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i].text === option) {
      out.push(words[i + 1]);
    }
  }
  return out;
}

function parseMoab(words: Word[], readScript: (path: string) => string | null): LaunchRequest {
  const req = blank("moab", "msub", true);
  const opts = parseOptions(words, MOAB_SPEC);
  req.problems.push(...opts.problems);
  const scriptWord = opts.rest[0];
  req.script = scriptWord ? scriptWord.text : "-";
  const body = scriptWord && !scriptWord.dynamic ? readScript(scriptWord.text) : null;
  if (body === null) {
    req.problems.push(`cannot read batch script ${req.script}`);
  } else {
    const directiveWords = scriptDirectives(body, /^#(?:MSUB|PBS)\s+(.*)$/);
    const directives = parseOptions(directiveWords, MOAB_SPEC);
    req.problems.push(...directives.problems);
    applyMoabResources(req, collectAll(directiveWords, "-l"));
    req.partition = textOf(directives.values.partition, req.problems, "queue") ?? req.partition;
    req.account = textOf(directives.values.account, req.problems, "account") ?? req.account;
    req.inner.push(scriptBody(body));
  }
  applyMoabResources(req, collectAll(words.slice(0, words.length - opts.rest.length), "-l"));
  req.partition = textOf(opts.values.partition, req.problems, "queue") ?? req.partition;
  req.account = textOf(opts.values.account, req.problems, "account") ?? req.account;
  return req;
}

// ---- Flux ---------------------------------------------------------------

const FLUX_ARGS: Record<string, Field | null> = {
  "-n": "ranks",
  "--ntasks": "ranks",
  "--nslots": "ranks",
  "-N": "nodes",
  "--nodes": "nodes",
  "-t": "time",
  "--time-limit": "time",
  "-q": "partition",
  "--queue": "partition",
  "-B": "account",
  "--bank": "account",
};
for (const o of [
  "-c",
  "--cores-per-task",
  "-g",
  "--gpus-per-task",
  "--gpus-per-node",
  "--tasks-per-node",
  "--tasks-per-core",
  "--cores",
  "--cores-per-slot",
  "--gpus-per-slot",
  "-o",
  "--setopt",
  "-S",
  "--setattr",
  "--output",
  "--error",
  "--input",
  "--job-name",
  "--cwd",
  "--env",
  "--env-remove",
  "--env-file",
  "--urgency",
  "--dependency",
  "--begin-time",
  "--signal",
  "--taskmap",
  "--requires",
  "--conf",
  "--flags",
  "--add-file",
  "--log",
  "--log-stderr",
  "--progress",
  "--cc",
  "--bcc",
  "--quiet-exit",
  "--broker-opts",
]) {
  FLUX_ARGS[o] = null;
}

const FLUX_SPEC: OptSpec = {
  withArg: FLUX_ARGS,
  flags: [
    "-u",
    "--unbuffered",
    "-v",
    "--verbose",
    "-x",
    "--exclusive",
    "--wait",
    "--wait-event",
    "--watch",
    "--dry-run",
    "--quiet",
    "-l",
    "--label-io",
    "--debug",
    "--group",
  ],
};

const FLUX_LAUNCH = new Set(["run", "submit", "batch", "alloc", "bulksubmit"]);
const FLUX_CONTROL = new Set(["cancel", "job", "jobs", "resource", "queue", "pgrep", "pkill"]);

function parseFlux(
  words: Word[],
  env: { inFluxJob: boolean; readScript: (path: string) => string | null },
): HpcRequest | null {
  let i = 0;
  // flux's own options come before the subcommand.
  while (i < words.length && words[i].text.startsWith("-")) {
    i += 1;
  }
  let sub = words[i]?.text;
  if (sub === "mini") {
    i += 1;
    sub = words[i]?.text;
  }
  if (!sub) {
    return null;
  }
  if (!FLUX_LAUNCH.has(sub)) {
    return FLUX_CONTROL.has(sub)
      ? {
          kind: "control",
          scheduler: "flux",
          verb: `flux ${sub}`,
          mutates: sub === "cancel" || sub === "pkill",
        }
      : null;
  }
  const req = blank("flux", `flux ${sub}`, sub === "batch" || sub === "alloc" || !env.inFluxJob);
  const opts = parseOptions(words.slice(i + 1), FLUX_SPEC);
  req.problems.push(...opts.problems);
  const apply = (values: Partial<Record<Field, Word>>) => {
    const p = req.problems;
    if (values.ranks) {
      req.ranks = intOf(values.ranks, p, "task count");
    }
    if (values.nodes) {
      req.nodes = intOf(values.nodes, p, "node count");
    }
    if (values.time) {
      req.walltimeMinutes = timeOf(values.time, p, fluxMinutes);
    }
    if (values.partition) {
      req.partition = textOf(values.partition, p, "queue");
    }
    if (values.account) {
      req.account = textOf(values.account, p, "bank");
    }
  };
  if (sub === "batch") {
    const scriptWord = opts.rest[0];
    req.script = scriptWord ? scriptWord.text : "-";
    const body = scriptWord && !scriptWord.dynamic ? env.readScript(scriptWord.text) : null;
    if (body === null) {
      req.problems.push(`cannot read batch script ${req.script}`);
    } else {
      const d = parseOptions(scriptDirectives(body, /^#\s*flux:\s*(.*)$/i), FLUX_SPEC);
      req.problems.push(...d.problems);
      apply(d.values);
      req.inner.push(scriptBody(body));
    }
  } else if (sub === "alloc") {
    if (opts.rest.length > 0) {
      req.inner.push(opts.rest.map((w) => w.text).join(" "));
    }
  } else if (sub === "bulksubmit") {
    req.problems.push("flux bulksubmit builds its commands from input at run time");
  } else if (opts.rest.length === 0) {
    req.problems.push("no program to run");
  } else {
    req.programs.push(program(opts.rest, words.length - opts.rest.length));
  }
  apply(opts.values);
  return req;
}

// ---- dispatch -------------------------------------------------------------

const CONTROL_VERBS: Record<string, { scheduler: Scheduler; mutates: boolean }> = {
  scancel: { scheduler: "slurm", mutates: true },
  scontrol: { scheduler: "slurm", mutates: true },
  squeue: { scheduler: "slurm", mutates: false },
  sinfo: { scheduler: "slurm", mutates: false },
  sacct: { scheduler: "slurm", mutates: false },
  sstat: { scheduler: "slurm", mutates: false },
  canceljob: { scheduler: "moab", mutates: true },
  mjobctl: { scheduler: "moab", mutates: true },
  checkjob: { scheduler: "moab", mutates: false },
  showq: { scheduler: "moab", mutates: false },
  showstart: { scheduler: "moab", mutates: false },
};

export type LauncherEnv = {
  /** Inside a Slurm allocation, srun starts a step instead of a new job. */
  inAllocation: boolean;
  /** Inside a Flux job, flux run/submit use the enclosing instance's resources. */
  inFluxJob: boolean;
  readScript: (path: string) => string | null;
};

/** Classifies a command whose first word is `verb` (already stripped of wrappers). */
export function parseLauncher(verb: string, args: Word[], env: LauncherEnv): HpcRequest | null {
  if (MPI_VERBS.has(verb)) {
    return parseMpi(verb, args);
  }
  if (verb === "srun" || verb === "sbatch" || verb === "salloc") {
    return parseSlurm(verb, args, env);
  }
  if (verb === "msub") {
    return parseMoab(args, env.readScript);
  }
  if (verb === "flux") {
    return parseFlux(args, env);
  }
  const control = CONTROL_VERBS[verb];
  return control ? { kind: "control", verb, ...control } : null;
}

export function isLauncherVerb(verb: string): boolean {
  return (
    MPI_VERBS.has(verb) ||
    verb === "srun" ||
    verb === "sbatch" ||
    verb === "salloc" ||
    verb === "msub" ||
    verb === "flux" ||
    verb in CONTROL_VERBS
  );
}
