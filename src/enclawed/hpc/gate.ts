// The HPC launch gate: every exec line an agent sends is checked for MPI,
// Slurm, Moab and Flux launches before it runs.
//
// The gate is deny-by-default once `enclawed.hpc` is configured with
// enforce=true: a launch must use an allowed scheduler, run allowlisted
// programs, stay inside the rank/node/walltime caps, name an allowed
// partition and account, and fit in the node-hour budget. Anything the gate
// cannot determine from the literal command line (a computed command name, a
// computed rank count, an unknown option) is refused with the reason, because
// a value the gate cannot see is a value it cannot check. Batch scripts and
// shell scripts the line runs are read and checked the same way, so a launch
// cannot hide one level down.
//
// This sees what the agent asks the shell to do. A program that calls a
// launcher itself is out of its sight; the launcher shims and site scheduler
// plugins close that gap.

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  isLauncherVerb,
  parseLauncher,
  type HpcRequest,
  type LaunchRequest,
  type LauncherEnv,
  type Program,
} from "./launchers.js";
import type { HpcPolicy } from "./policy.js";
import { parseCopy, parseSsh, within, type SshTarget } from "./remote.js";
import { parseCommandLine, type SimpleCommand, type Word } from "./shell-words.js";

export type HpcLaunchSummary = {
  scheduler: string;
  verb: string;
  ranks: number | null;
  nodes: number | null;
  walltimeMinutes: number | null;
  partition: string | null;
  account: string | null;
  programs: string[];
  script: string | null;
  scriptSha256: string | null;
  nodeHours: number;
};

export type HpcDecision = {
  allowed: boolean;
  /** Present when not allowed, and in observe mode when it would not have been. */
  reasons: string[];
  launches: HpcLaunchSummary[];
  /** Node-hours this command reserves from the budget (0 when not allowed). */
  nodeHours: number;
  /** True when the gate saw at least one scheduler command. */
  touchedHpc: boolean;
};

export type HpcCheckContext = {
  cwd: string;
  /** Environment overrides the agent asked for on this call. */
  callEnv?: Record<string, unknown>;
  /** The gateway's own environment; the agent's per-call env is never trusted for this. */
  env: NodeJS.ProcessEnv;
  /** Test seam: read a script file. */
  readFile?: (absPath: string) => string | null;
};

const MAX_DEPTH = 4;
const MAX_SCRIPT_BYTES = 512 * 1024;
const INTERPRETERS = new Set([
  "python",
  "python3",
  "julia",
  "Rscript",
  "R",
  "node",
  "perl",
  "ruby",
  "bash",
  "sh",
  "ksh",
  "zsh",
  "dash",
  "tclsh",
  "lua",
]);
const SHELLS = new Set(["bash", "sh", "ksh", "zsh", "dash"]);
const CONTAINERS = new Set([
  "apptainer",
  "singularity",
  "podman-hpc",
  "shifter",
  "charliecloud",
  "ch-run",
]);
/** Commands that run their arguments as a command. */
const WRAPPERS = new Set([
  "env",
  "time",
  "nohup",
  "nice",
  "stdbuf",
  "timeout",
  "command",
  "exec",
  "sudo",
  "ionice",
  "chrt",
]);

function defaultRead(absPath: string): string | null {
  try {
    if (statSync(absPath).size > MAX_SCRIPT_BYTES) {
      return null;
    }
    const text = readFileSync(absPath, "utf8");
    return text.includes("\u0000") ? null : text;
  } catch {
    return null;
  }
}

function basename(word: string): string {
  return word.includes("/") ? path.basename(word) : word;
}

/** Drops wrappers and their options; returns the words of the command that actually runs. */
/**
 * Variables that decide which binary a launcher name runs, or what it loads.
 * Changing them on the same line as a launch would route around the site's
 * shims, so the gate refuses it.
 */
const RESOLUTION_VARS =
  /^(PATH|LD_PRELOAD|LD_LIBRARY_PATH|LD_AUDIT|BASH_ENV|ENV|IFS|PYTHONPATH|PYTHONSTARTUP)=/;

function noteAssignment(w: Word, reasons: string[]): void {
  if (RESOLUTION_VARS.test(w.text)) {
    reasons.push(
      `setting ${w.text.split("=")[0]} on a line that the HPC gate checks is not allowed`,
    );
  }
}

function unwrap(words: Word[], reasons: string[]): Word[] {
  let i = 0;
  // Leading assignments: FOO=bar cmd
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i].text)) {
    noteAssignment(words[i], reasons);
    i += 1;
  }
  for (let guard = 0; guard < 16 && i < words.length; guard++) {
    const name = basename(words[i].text);
    if (!WRAPPERS.has(name) || words[i].dynamic) {
      break;
    }
    i += 1;
    // Options of the wrapper, and their values where they take one.
    const valued: Record<string, Set<string>> = {
      env: new Set(["-u", "--unset", "-C", "--chdir", "-S", "--split-string"]),
      nice: new Set(["-n", "--adjustment"]),
      timeout: new Set(["-s", "--signal", "-k", "--kill-after"]),
      sudo: new Set(["-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U"]),
      ionice: new Set(["-c", "-n", "-p"]),
      exec: new Set(["-a"]),
      stdbuf: new Set(["-i", "-o", "-e"]),
    };
    while (i < words.length && words[i].text.startsWith("-") && words[i].text !== "-") {
      if (words[i].text === "--") {
        i += 1;
        break;
      }
      if (
        name === "env" &&
        (words[i].text === "-S" || words[i].text.startsWith("--split-string"))
      ) {
        reasons.push("env -S splits a string into a command the gate cannot see");
      }
      i += valued[name]?.has(words[i].text) ? 2 : 1;
    }
    if (name === "env") {
      while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i].text)) {
        noteAssignment(words[i], reasons);
        i += 1;
      }
    }
    if (name === "timeout" && i < words.length) {
      i += 1; // the duration
    }
    if (name === "chrt" && i < words.length) {
      i += 1; // the priority
    }
  }
  return words.slice(i);
}

function matchesExecutable(entry: string, candidate: string, cwd: string): boolean {
  if (entry.startsWith("module:")) {
    return candidate === entry;
  }
  if (!entry.includes("/")) {
    return !candidate.includes("/") && candidate === entry;
  }
  if (!candidate.includes("/")) {
    return false;
  }
  const abs = path.resolve(cwd, candidate);
  const root = path.resolve(entry);
  return entry.endsWith("/") ? abs.startsWith(root + path.sep) : abs === root;
}

/** What a program on the ranks really is: the binary, and for interpreters, the script or module. */
function programTargets(p: Program, reasons: string[]): string[] {
  const argv = p.argv;
  if (argv.length === 0) {
    return [];
  }
  const head = argv[0];
  const name = basename(head);
  const targets = [head];
  const interpreter = INTERPRETERS.has(name) || /^python3\.\d+$/.test(name);
  if (interpreter) {
    for (let i = 1; i < argv.length; i++) {
      const a = argv[i];
      if (a === "-c" || a === "-e" || a === "--eval") {
        reasons.push(`${name} ${a} runs inline code the gate cannot check`);
        break;
      }
      if (a === "-m") {
        targets.push(`module:${argv[i + 1] ?? ""}`);
        break;
      }
      if (!a.startsWith("-")) {
        targets.push(a);
        break;
      }
    }
  } else if (CONTAINERS.has(name)) {
    // apptainer exec [opts] image.sif cmd...: the image is what runs.
    const rest = argv.slice(1).filter((a) => !a.startsWith("-"));
    if (rest[1]) {
      targets.push(rest[1]);
    }
  }
  return targets;
}

function nodeHoursOf(req: LaunchRequest): number {
  if (!req.createsAllocation || req.walltimeMinutes === null) {
    return 0;
  }
  return (req.nodes ?? 1) * (req.walltimeMinutes / 60);
}

function scriptHash(
  req: LaunchRequest,
  ctx: HpcCheckContext,
  read: (p: string) => string | null,
): string | null {
  if (!req.script || req.script === "-") {
    return null;
  }
  const body = read(path.resolve(ctx.cwd, req.script));
  return body === null ? null : createHash("sha256").update(body).digest("hex");
}

/** Checks one launch against the policy, adding every violation to `reasons`. */
function checkLaunch(req: LaunchRequest, policy: HpcPolicy, cwd: string, reasons: string[]): void {
  const what = req.verb;
  if (!policy.schedulers.has(req.scheduler)) {
    reasons.push(`${what}: scheduler "${req.scheduler}" is not allowed`);
  }
  for (const p of req.problems) {
    reasons.push(`${what}: ${p}`);
  }
  const executables = policy.executables;
  const checkTarget = (t: string, label: string) => {
    if (executables && !executables.some((e) => matchesExecutable(e, t, cwd))) {
      reasons.push(`${what}: ${label} "${t}" is not on enclawed.hpc.executables`);
    }
  };
  for (const prog of req.programs) {
    if (prog.dynamic) {
      reasons.push(`${what}: the program is computed at run time`);
    }
    for (const t of programTargets(prog, reasons)) {
      checkTarget(t, "program");
    }
  }
  if (req.script && req.script !== "-") {
    checkTarget(req.script, "batch script");
  }
  if (policy.maxRanks !== null && req.ranks !== null && req.ranks > policy.maxRanks) {
    reasons.push(`${what}: ${req.ranks} ranks exceeds maxRanks ${policy.maxRanks}`);
  }
  if (policy.maxNodes !== null && req.nodes !== null && req.nodes > policy.maxNodes) {
    reasons.push(`${what}: ${req.nodes} nodes exceeds maxNodes ${policy.maxNodes}`);
  }
  if (req.createsAllocation) {
    const needsTime = policy.maxWalltimeMinutes !== null || policy.nodeHourBudget !== null;
    if (needsTime && req.walltimeMinutes === null) {
      reasons.push(`${what}: set a time limit; the site default is not known to the gate`);
    }
    if (
      policy.maxWalltimeMinutes !== null &&
      req.walltimeMinutes !== null &&
      req.walltimeMinutes > policy.maxWalltimeMinutes
    ) {
      reasons.push(
        `${what}: walltime ${req.walltimeMinutes} min exceeds ${policy.maxWalltimeMinutes}`,
      );
    }
    if (policy.nodeHourBudget !== null && req.nodes === null) {
      reasons.push(`${what}: set a node count so the request can be charged`);
    }
    if (policy.partitions) {
      if (req.partition === null) {
        reasons.push(
          `${what}: name a partition or queue (allowed: ${[...policy.partitions].join(", ")})`,
        );
      } else if (!policy.partitions.has(req.partition)) {
        reasons.push(`${what}: partition "${req.partition}" is not allowed`);
      }
    }
    if (policy.accounts) {
      if (req.account === null) {
        reasons.push(
          `${what}: name an account or bank (allowed: ${[...policy.accounts].join(", ")})`,
        );
      } else if (!policy.accounts.has(req.account)) {
        reasons.push(`${what}: account "${req.account}" is not allowed`);
      }
    }
  }
}

type Walk = {
  launches: { req: LaunchRequest; summary: HpcLaunchSummary }[];
  reasons: string[];
  touched: boolean;
};

/** One shell's state that matters to the gate. */
type Shell = {
  /** After cd/pushd/popd a relative path no longer names the file the gate would read. */
  cwdMoved: boolean;
};

/** Reads a script named by `p`, or null if the gate cannot know which file it is. */
function readNamed(ctx: HpcCheckContext, shell: Shell, p: string): string | null {
  if (shell.cwdMoved && !p.startsWith("/")) {
    return null;
  }
  return (ctx.readFile ?? defaultRead)(path.resolve(ctx.cwd, p));
}

function walk(
  line: string,
  depth: number,
  policy: HpcPolicy,
  ctx: HpcCheckContext,
  out: Walk,
  insideJob = false,
  shell: Shell = { cwdMoved: false },
): void {
  if (depth > MAX_DEPTH) {
    out.reasons.push("scripts nest too deeply to check");
    return;
  }
  const parsed = parseCommandLine(line);
  if (!parsed.ok) {
    // Unparseable text only matters if it might hide a launch.
    if (/\b(mpirun|mpiexec|srun|sbatch|salloc|msub|flux)\b/.test(line)) {
      out.touched = true;
      out.reasons.push(`command line does not parse (${parsed.reason})`);
    }
    return;
  }
  // Launches inside a job script run in that job's allocation, already charged.
  const launcherEnv: LauncherEnv = {
    inAllocation: insideJob || Boolean(ctx.env.SLURM_JOB_ID),
    inFluxJob: insideJob || Boolean(ctx.env.FLUX_JOB_ID),
    readScript: (p) => readNamed(ctx, shell, p),
  };
  for (const cmd of parsed.commands) {
    walkCommand(cmd, depth, policy, ctx, launcherEnv, out, insideJob, shell);
  }
}

function walkCommand(
  cmd: SimpleCommand,
  depth: number,
  policy: HpcPolicy,
  ctx: HpcCheckContext,
  launcherEnv: LauncherEnv,
  out: Walk,
  insideJob: boolean,
  shell: Shell,
): void {
  const read = (p: string) => readNamed(ctx, shell, p);
  const words = unwrap(cmd.words, out.reasons);
  if (words.length === 0) {
    return;
  }
  const head = words[0];
  if (head.dynamic) {
    out.reasons.push(`command name "${head.text}" is computed at run time`);
    return;
  }
  const name = basename(head.text);
  // export PATH=..., alias mpirun=..., hash -p: all change what a launcher name runs.
  if (name === "export" || name === "declare" || name === "typeset" || name === "readonly") {
    for (const w of words.slice(1)) {
      noteAssignment(w, out.reasons);
    }
    return;
  }
  if (name === "alias" || name === "hash" || name === "enable" || name === "function") {
    out.reasons.push(`${name} can change what a command name runs`);
    return;
  }
  if (name === "eval") {
    out.reasons.push("eval runs text the gate cannot check");
    return;
  }
  if (name === "cd" || name === "pushd" || name === "popd") {
    shell.cwdMoved = true;
    return;
  }
  if (name === "ssh" || name === "slogin") {
    walkSsh(words.slice(1), depth, policy, ctx, out);
    return;
  }
  if (name === "scp" || name === "rsync") {
    checkCopy(name, words.slice(1), policy, ctx, out);
    return;
  }
  if (name === "sftp" && policy.clusterHosts) {
    out.touched = true;
    out.reasons.push("sftp is interactive; copy into the staging directory with scp");
    return;
  }
  // sh -c '...', bash script.sh, ./script.sh, source script.sh
  if (SHELLS.has(name)) {
    const c = words.findIndex((w) => w.text === "-c");
    if (c > 0) {
      const inner = words[c + 1];
      if (!inner || inner.dynamic) {
        out.reasons.push(`${name} -c runs a command computed at run time`);
      } else {
        // A child shell starts where this one is.
        walk(inner.text, depth + 1, policy, ctx, out, insideJob, { ...shell });
      }
      return;
    }
    const script = words.slice(1).find((w) => !w.text.startsWith("-"));
    if (script && !script.dynamic) {
      const body = read(script.text);
      if (body !== null) {
        walk(body, depth + 1, policy, ctx, out, insideJob, { ...shell });
      }
    }
    return;
  }
  if ((name === "source" || name === ".") && words[1] && !words[1].dynamic) {
    const body = read(words[1].text);
    if (body !== null) {
      // A sourced file runs in this shell: its cd moves us too.
      walk(body, depth + 1, policy, ctx, out, insideJob, shell);
    }
    return;
  }
  if (head.text.includes("/") && !isLauncherVerb(name)) {
    const body = read(head.text);
    if (body !== null && /^#!.*\b(ba|k|z|da)?sh\b/.test(body)) {
      walk(body, depth + 1, policy, ctx, out, insideJob, { ...shell });
    }
    return;
  }
  if (name === "xargs" && words.some((w) => isLauncherVerb(basename(w.text)))) {
    out.touched = true;
    out.reasons.push("xargs builds a launch from input at run time");
    return;
  }
  const req: HpcRequest | null = parseLauncher(name, words.slice(1), launcherEnv);
  if (!req) {
    return;
  }
  out.touched = true;
  if (head.text.includes("/")) {
    const abs = path.resolve(ctx.cwd, head.text);
    if (policy.launcherPaths && !policy.launcherPaths.includes(abs)) {
      out.reasons.push(
        `${name}: run it by name; "${head.text}" is not one of enclawed.hpc.launcherPaths`,
      );
    }
  }
  if (req.kind === "control") {
    if (req.mutates && !policy.allowJobControl) {
      out.reasons.push(`${req.verb}: changing or cancelling jobs is not allowed`);
    }
    return;
  }
  if (cmd.heredoc) {
    req.problems.push("a heredoc feeds the launcher; write the script to a file instead");
  }
  if (req.script === "-" && cmd.stdinFile) {
    req.script = cmd.stdinFile.dynamic ? null : cmd.stdinFile.text;
    const body = req.script ? read(req.script) : null;
    if (body !== null) {
      req.problems = req.problems.filter((p) => !p.startsWith("cannot read batch script"));
      req.inner.push(body);
    }
  }
  checkLaunch(req, policy, ctx.cwd, out.reasons);
  out.launches.push({
    req,
    summary: {
      scheduler: req.scheduler,
      verb: req.verb,
      ranks: req.ranks,
      nodes: req.nodes,
      walltimeMinutes: req.walltimeMinutes,
      partition: req.partition,
      account: req.account,
      programs: req.programs.map((p) => p.argv.join(" ")),
      script: req.script,
      scriptSha256: scriptHash(req, ctx, read),
      nodeHours: nodeHoursOf(req),
    },
  });
  for (const inner of req.inner) {
    walk(inner, depth + 1, policy, ctx, out, insideJob || req.createsAllocation);
  }
}

/**
 * Exact names, or patterns where `*` stands for hostname characters only
 * (`node*.lab.gov` for allocated compute nodes). A pattern never spans a
 * dot-free wildcard on its own; policy.ts refuses a bare `*`.
 */
function hostAllowed(policy: HpcPolicy, t: SshTarget | null): boolean {
  if (!t || !policy.clusterHosts) {
    return false;
  }
  const host = t.host.toLowerCase();
  for (const entry of policy.clusterHosts) {
    if (!entry.includes("*")) {
      if (entry === host) {
        return true;
      }
      continue;
    }
    const re = new RegExp(
      `^${entry
        .split("*")
        .map((part) => part.replace(/[.]/g, "\\."))
        .join("[a-z0-9-]*")}$`,
    );
    if (re.test(host)) {
      return true;
    }
  }
  return false;
}

/**
 * ssh [opts] host command: the connection must be one the policy allows, and
 * the command is checked as if typed on the login node. A remote batch script
 * is read from its local mirror in the staging directory; anywhere else the
 * gate cannot see it, and the launch is refused.
 */
function walkSsh(
  args: Word[],
  depth: number,
  policy: HpcPolicy,
  ctx: HpcCheckContext,
  out: Walk,
): void {
  const call = parseSsh(args);
  const touchedBefore = out.touched;
  const reasons: string[] = [...call.problems];
  if (!hostAllowed(policy, call.target)) {
    reasons.push(`ssh to ${call.target?.host ?? "?"}: not one of enclawed.hpc.clusterHosts`);
  }
  for (const hop of call.jumps) {
    if (!hostAllowed(policy, hop)) {
      reasons.push(`ssh -J ${hop.host}: not one of enclawed.hpc.clusterHosts`);
    }
  }
  if (call.command === null) {
    reasons.push("an interactive ssh session runs commands the gate cannot see");
  } else {
    const staging = policy.staging;
    const remoteCtx: HpcCheckContext = {
      cwd: "/",
      env: {},
      readFile: (abs) =>
        staging && within(staging.remote, abs)
          ? (ctx.readFile ?? defaultRead)(
              path.join(staging.local, path.posix.relative(staging.remote, abs)),
            )
          : null,
    };
    // The remote command runs in a fresh login shell, in a home directory the
    // gate does not know: only absolute paths name a file it can check. Two
    // guards say so independently: cwd "/" never lies inside the staging
    // directory, and the shell starts as if it had already moved.
    walk(call.command, depth + 1, policy, remoteCtx, out, false, { cwdMoved: true });
  }
  // With cluster hosts configured every ssh is the gate's business; without
  // them, only one that carries a launch is.
  if (policy.clusterHosts || out.touched !== touchedBefore) {
    out.touched = true;
    out.reasons.push(...reasons);
  }
}

/** scp/rsync: only into the staging directory on a listed host; downloads only if allowed. */
function checkCopy(
  tool: "scp" | "rsync",
  args: Word[],
  policy: HpcPolicy,
  ctx: HpcCheckContext,
  out: Walk,
): void {
  if (!policy.clusterHosts) {
    return;
  }
  const call = parseCopy(tool, args);
  if (call.localOnly) {
    return;
  }
  out.touched = true;
  out.reasons.push(...call.problems);
  const staging = policy.staging;
  for (const u of call.uploads) {
    if (!hostAllowed(policy, u.host)) {
      out.reasons.push(`${tool} to ${u.host.host}: not one of enclawed.hpc.clusterHosts`);
    }
    if (!staging) {
      out.reasons.push(`${tool}: no enclawed.hpc.staging directory is configured`);
      continue;
    }
    if (!within(staging.local, u.local, ctx.cwd)) {
      out.reasons.push(`${tool}: ${u.local} is not inside the local staging directory`);
    }
    if (!u.remote.startsWith("/") || !within(staging.remote, u.remote)) {
      out.reasons.push(`${tool}: ${u.remote} is not inside the remote staging directory`);
    }
  }
  for (const d of call.downloads) {
    if (!policy.allowDownload) {
      out.reasons.push(`${tool}: copying files off the cluster is not allowed`);
      continue;
    }
    if (!hostAllowed(policy, d.host)) {
      out.reasons.push(`${tool} from ${d.host.host}: not one of enclawed.hpc.clusterHosts`);
    }
    if (!staging || !within(staging.local, d.local, ctx.cwd)) {
      out.reasons.push(`${tool}: downloads land only in the local staging directory`);
    }
  }
}

/** Running total of node-hours granted by one gate. */
export class NodeHourLedger {
  private spent = 0;
  constructor(readonly budget: number | null) {}
  get used(): number {
    return this.spent;
  }
  fits(hours: number): boolean {
    return this.budget === null || this.spent + hours <= this.budget + 1e-9;
  }
  charge(hours: number): void {
    this.spent += hours;
  }
}

/** Pure decision for one command line; charges `ledger` only when allowed. */
export function checkHpcCommand(
  command: string,
  policy: HpcPolicy,
  ctx: HpcCheckContext,
  ledger: NodeHourLedger,
): HpcDecision {
  const out: Walk = { launches: [], reasons: [], touched: false };
  walk(command, 0, policy, ctx, out);
  for (const key of Object.keys(ctx.callEnv ?? {})) {
    noteAssignment({ text: `${key}=`, dynamic: false }, out.reasons);
  }
  const nodeHours = out.launches.reduce((sum, l) => sum + l.summary.nodeHours, 0);
  if (!ledger.fits(nodeHours)) {
    out.reasons.push(
      `request needs ${nodeHours.toFixed(2)} node-hours; ${Math.max(0, (ledger.budget ?? 0) - ledger.used).toFixed(2)} left of ${ledger.budget}`,
    );
  }
  // Every reason is either a launch problem or opacity (a command the gate
  // cannot see into, which might be a launch), so any reason makes it relevant.
  const relevant = out.touched || out.launches.length > 0 || out.reasons.length > 0;
  const violations = out.reasons;
  const allowed = violations.length === 0 || !policy.enforce;
  if (allowed && violations.length === 0) {
    ledger.charge(nodeHours);
  }
  return {
    allowed,
    reasons: violations,
    launches: out.launches.map((l) => l.summary),
    nodeHours: allowed && violations.length === 0 ? nodeHours : 0,
    touchedHpc: relevant,
  };
}
