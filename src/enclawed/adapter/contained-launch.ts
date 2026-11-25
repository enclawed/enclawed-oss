// enclawed adapter kit: what a session launches runs contained (M1/M3), on
// the framework's containment (../containment).
//
//   MCP servers       started only through launchMcpServer, with the
//                     containment part of their SIGNED admission record
//                     (folders, programs, package tree, env, secrets,
//                     destinations). No containment part: refused
//                     (mcp-server-not-contained). A machine that cannot
//                     contain: refused (containment-unavailable). Never
//                     started bare.
//   tools/call        every call to a contained server is bracketed
//                     (bracketMcpCall): the relay lets a request out only
//                     while a call is in flight, and only with routing values
//                     that call supplied.
//   project scripts   `npm test`, `make t`, ... and package installs
//   and installs      (npm install, pip install, ...) the agent runs: the
//                     engine marks them (Decision.contain), and the session's
//                     ScriptContainer turns the command into one that runs
//                     inside a containment (the project read-write, the
//                     toolchain read-only, no inherited credentials, the
//                     network only through the relay to the declared hosts;
//                     an install reaches its package registry). With no
//                     container, they are refused.

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  containMcpServer,
  containPackageInstall,
  containProjectScript,
  containSkillRun,
  containmentSupport,
  type Containment,
  type ContainmentDestination,
  type ContainmentEvent,
  type McpContainmentRecord,
} from "../containment/index.js";
import { egressTargetDestination, parseEgressTarget } from "../egress-target.js";
import { programOf, segments } from "./exec-provenance.js";
import { isInside } from "./fs-probe.js";
import { containedCommandLine } from "./shell-definitions.js";
import { contentDigest } from "./skill-digest.js";
import type { SkillRun } from "./skill-types.js";
import type {
  ContainedCode,
  ContainedLaunch,
  ContainmentOutcome,
  LaunchContainment,
} from "./types.js";

export type ContainRefusalCode =
  | "mcp-server-not-contained"
  | "containment-unavailable"
  | "containment-setup-failed"
  | (string & {});

export type McpLaunch =
  | Readonly<{ ok: true; containment: Containment }>
  | Readonly<{ ok: false; code: ContainRefusalCode; message: string }>;

/** Start an admitted MCP server contained, or refuse. `record`: the verified record's containment part. */
export async function launchMcpServer(
  def: Readonly<{
    name: string;
    command: string;
    args: readonly string[];
    env?: Readonly<Record<string, string>>;
    /**
     * The definition's working directory, absolute (a server that starts in
     * its project: `python -m`, `uv run --directory`). The containment
     * refuses one outside the record's roots and package root
     * (containment-cwd-outside-roots).
     */
    cwd?: string | null;
  }>,
  record: McpContainmentRecord | null | undefined,
  o: { stateDir: string; onEvent?: (e: ContainmentEvent) => void },
): Promise<McpLaunch> {
  const r = await containMcpServer(
    {
      name: def.name,
      command: def.command,
      args: def.args,
      ...(def.env ? { env: def.env } : {}),
      ...(typeof def.cwd === "string" && def.cwd !== "" ? { cwd: def.cwd } : {}),
    },
    record,
    { stateDir: o.stateDir, onEvent: o.onEvent },
  );
  return r.ok
    ? { ok: true, containment: r.containment }
    : { ok: false, code: r.code, message: r.message };
}

/**
 * Run one tools/call to a contained server: the call is in flight (the relay
 * admits requests on its behalf, with the routing values its arguments
 * supply) only while `run` runs. The containment serializes calls per
 * server (runCall): two calls in flight at once could not be told apart, so
 * the relay would refuse their requests (call-ambiguous).
 */
export async function bracketMcpCall<T>(
  containment: Pick<Containment, "runCall">,
  call: Readonly<{ callId: string; tool: string; arguments: unknown }>,
  run: () => Promise<T>,
): Promise<T> {
  return containment.runCall(call, run);
}

// ─── Project scripts and package installs ───────────────────────────────

export type ScriptContainmentRequest = Readonly<{
  kind: "project-script" | "package-install" | "skill";
  /** What runs, for the record ("npm test", "pip install"). */
  label: string;
  command: string;
  dialect: "posix" | "powershell";
  cwd: string;
  projectDir: string;
  /** The install's package manager (npm, pip, ...), to reach its registry. */
  tool?: string | null;
  /** kind "skill": the conforming call the engine decided (./skill-conformance.ts). */
  skill?: SkillRun;
  /**
   * kind "project-script" offered containment because Enclawed read what it
   * runs: the code it read. The containment loads no other code from the
   * project or a writable place (code pins); one that cannot enforce them
   * does not start.
   */
  code?: ContainedCode;
}>;

export type ScriptContainment =
  | Readonly<{ ok: true; command: string }>
  | Readonly<{ ok: false; code: ContainRefusalCode; message: string }>;

/** Turns an agent's command into one that runs contained (the launcher implements it with scriptContainer). */
export type ScriptContainer = (req: ScriptContainmentRequest) => Promise<ScriptContainment>;

/** Shell builtins that are no program (the shell runs them itself; there is nothing to bind). */
const SHELL_ONLY_BUILTINS = new Set([
  "cd",
  "export",
  "unset",
  "set",
  "exit",
  "return",
  "shift",
  "source",
  ".",
  ":",
  "eval",
  "exec",
  "readonly",
  "local",
  "trap",
  "wait",
  "umask",
  "ulimit",
  "alias",
  "unalias",
  "type",
  "command",
  "hash",
  "getopts",
  "read",
  "times",
  "break",
  "continue",
]);

/** The programs a command line names (each simple command's program; shell builtins are the shell's). */
function programsOf(command: string): string[] {
  const out = new Set<string>(["sh"]);
  for (const seg of segments(command)) {
    const p = programOf(seg.words);
    if (p && /^[A-Za-z0-9._+-]+$/.test(p.prog) && !SHELL_ONLY_BUILTINS.has(p.prog)) {
      out.add(p.prog);
    }
  }
  return [...out];
}

/**
 * A private copy of a verified skill to run a call from, under Enclawed's
 * state directory (which the agent cannot write). The copy's content digest
 * is computed after the copy and must equal the admitted one: whatever the
 * skill's directory holds by now, what runs is exactly what was admitted
 * (no window between the check and the run). Null with a reason otherwise.
 */
export function snapshotSkill(
  run: Pick<SkillRun, "dir" | "contentDigest" | "name">,
  stateDir: string,
): { ok: true; dir: string; remove: () => void } | { ok: false; reason: string } {
  let base: string;
  try {
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    base = fs.mkdtempSync(path.join(stateDir, "skill-run-"));
  } catch (err) {
    return { ok: false, reason: `no place for the skill's copy: ${(err as Error).message}` };
  }
  const remove = () => fs.rmSync(base, { recursive: true, force: true });
  const dir = path.join(base, "skill");
  try {
    fs.cpSync(run.dir, dir, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
      errorOnExist: true,
      force: false,
    });
  } catch (err) {
    remove();
    return { ok: false, reason: `the skill could not be copied: ${(err as Error).message}` };
  }
  const d = contentDigest(dir);
  if (d.problems.length || d.digest !== run.contentDigest) {
    remove();
    return {
      ok: false,
      reason: `the files of the skill ${run.name} are not the ones admitted at launch (${d.problems[0] ?? "content digest differs"})`,
    };
  }
  return { ok: true, dir, remove };
}

/**
 * The launcher's ScriptContainer: each request opens a containment (kept
 * open until close(), so its relay serves the command) and answers with the
 * command line that runs inside it.
 */
export function scriptContainer(o: {
  stateDir: string;
  onEvent?: (e: ContainmentEvent) => void;
  /** Hosts the project policy declares for project scripts (never for installs: they reach only their registry). */
  destinations?: readonly ContainmentDestination[];
}): {
  contain: ScriptContainer;
  approveRepoConfigWrite(path: string): boolean;
  close(): Promise<void>;
} {
  const open: Containment[] = [];
  const snapshots: Array<() => void> = [];
  return {
    async contain(req) {
      if (req.dialect !== "posix") {
        return {
          ok: false,
          code: "containment-unavailable",
          message: `Enclawed: ${req.label} was not run: only POSIX shell commands can be contained here`,
        };
      }
      const opts = { stateDir: o.stateDir, onEvent: o.onEvent };
      let r: Awaited<ReturnType<typeof containProjectScript>>;
      if (req.kind === "skill") {
        // A call under a verified skill: from a digest-checked private copy,
        // with exactly the skill's admitted capabilities.
        const run = req.skill;
        if (!run) {
          return {
            ok: false,
            code: "containment-declaration-invalid",
            message: `Enclawed: ${req.label} was not run: the call names no verified skill`,
          };
        }
        let destinations;
        try {
          destinations = run.egress.map((t) => egressTargetDestination(parseEgressTarget(t)));
        } catch (err) {
          return {
            ok: false,
            code: "containment-declaration-invalid",
            message: `Enclawed: ${req.label} was not run: ${(err as Error).message}`,
          };
        }
        const snap = snapshotSkill(run, path.join(o.stateDir, "skill-runs"));
        if (!snap.ok) {
          return {
            ok: false,
            code: "skill-changed",
            message: `Enclawed: ${req.label} was not run: ${snap.reason}`,
          };
        }
        // A call made from inside the skill's directory runs from the same place in the copy.
        const cwd = isInside(run.dir, req.cwd)
          ? path.join(snap.dir, path.relative(run.dir, req.cwd))
          : req.cwd;
        r = await containSkillRun(
          {
            label: req.label,
            skillDir: snap.dir,
            projectDir: req.projectDir,
            cwd,
            interpreter: run.interpreter,
            file: path.join(snap.dir, ...run.file.split("/")),
            args: run.args,
            caps: run.caps,
            destinations,
          },
          opts,
        );
        if (!r.ok) {
          snap.remove();
          return { ok: false, code: r.code, message: r.message };
        }
        snapshots.push(() => snap.remove());
      } else if (req.kind === "package-install") {
        // Caged: the install's outputs, lockfiles and manifest dependency
        // fields only, the network only to its registry (never the project
        // policy's hosts). Exit 125 with a containment-install-cage event is
        // a refused install.
        if (!req.tool) {
          return {
            ok: false,
            code: "containment-declaration-invalid",
            message: `Enclawed: ${req.label} was not run: the install names no package manager`,
          };
        }
        r = await containPackageInstall(
          {
            label: req.label,
            tool: req.tool,
            projectDir: req.projectDir,
            cwd: req.cwd,
            command: "sh",
            args: ["-c", req.command],
            programs: programsOf(req.command),
          },
          opts,
        );
      } else {
        r = await containProjectScript(
          {
            label: req.label,
            kind: req.kind,
            projectDir: req.projectDir,
            cwd: req.cwd,
            command: "sh",
            args: ["-c", req.command],
            programs: programsOf(req.command),
            destinations: [...(o.destinations ?? [])],
            ...(req.code ? { codePins: req.code.files } : {}),
          },
          opts,
        );
      }
      if (!r.ok) {
        return { ok: false, code: r.code, message: r.message };
      }
      open.push(r.containment);
      return {
        ok: true,
        command: containedCommandLine(r.containment.env, r.containment.argv),
      };
    },
    /** Let the containment that reported `path` conflicted write it once (after a person approved). */
    approveRepoConfigWrite(p: string): boolean {
      for (const c of open) {
        try {
          c.approveRepoConfigWrite(p);
          return true;
        } catch {
          /* not this containment's conflicted file */
        }
      }
      return false;
    },
    async close() {
      await Promise.allSettled(open.splice(0).map((c) => c.close()));
      for (const remove of snapshots.splice(0)) {
        remove();
      }
    },
  };
}

/**
 * The kit's LaunchContainment (the seam launchContained uses) for project
 * scripts and installs the launcher itself starts. An MCP server is never
 * launched through it: it needs its signed containment record
 * (launchMcpServer).
 */
export function enclawedLaunchContainment(o: {
  stateDir: string;
  onEvent?: (e: ContainmentEvent) => void;
  stdio?: "inherit" | "pipe" | "ignore";
}): LaunchContainment & { children: ChildProcess[] } {
  const children: ChildProcess[] = [];
  return {
    children,
    available() {
      const s = containmentSupport();
      return s.ok ? { ok: true, reason: null } : { ok: false, reason: s.reason };
    },
    async launch(spec: ContainedLaunch): Promise<ContainmentOutcome> {
      if (spec.kind === "mcp-server") {
        return {
          ok: false,
          code: "mcp-server-not-contained",
          reason: `${spec.label} is not started: an MCP server starts only with the containment of its signed admission record`,
        };
      }
      const project = spec.roots.find((r) => r.mode === "rw")?.path ?? spec.cwd;
      const opts = { stateDir: o.stateDir, onEvent: o.onEvent };
      if (spec.kind === "package-install" && !spec.tool) {
        return {
          ok: false,
          code: "containment-declaration-invalid",
          reason: `${spec.label} is not started: the install names no package manager`,
        };
      }
      // An install is caged and reaches only its registry; spec.egress is for scripts.
      const r =
        spec.kind === "package-install"
          ? await containPackageInstall(
              {
                label: spec.label,
                tool: spec.tool ?? "",
                projectDir: project,
                cwd: spec.cwd,
                command: spec.argv[0] ?? "",
                args: spec.argv.slice(1),
                env: { ...spec.env },
              },
              opts,
            )
          : await containProjectScript(
              {
                label: spec.label,
                kind: spec.kind,
                projectDir: project,
                cwd: spec.cwd,
                command: spec.argv[0] ?? "",
                args: spec.argv.slice(1),
                destinations: spec.egress.map((host) => ({
                  host,
                  port: 443,
                  mode: "inspect" as const,
                })),
                env: { ...spec.env },
              },
              opts,
            );
      if (!r.ok) {
        return { ok: false, code: r.code, reason: r.message };
      }
      const [cmd, ...args] = r.containment.argv;
      const child = spawn(cmd, args, {
        env: { ...r.containment.env },
        stdio: o.stdio ?? "inherit",
      });
      children.push(child);
      child.on("exit", () => void r.containment.close());
      return {
        ok: true,
        pid: child.pid ?? -1,
        async stop() {
          child.kill("SIGKILL");
          await r.containment.close();
        },
      };
    },
  };
}

// ─── Containment events on the audit log ────────────────────────────────

/** The containment and relay codes an adapter's audit log records (closed set; anything else is "containment.event"). */
export const CONTAINMENT_AUDIT_CODES: ReadonlySet<string> = new Set([
  "containment-view-changed",
  "containment-original-restored",
  "containment-original-not-restored",
  "containment-install-cage",
  "containment-host-change",
  "containment-guard-stopped",
  "containment-repo-config-changed",
  "containment-repo-config-refused",
  "containment-repo-config-approved-write",
  "call-ambiguous",
  "no-call-in-flight",
  "upgrade-unsupported",
  "websocket-protocol-error",
  "websocket-extension-refused",
  "opaque-tls-name-mismatch",
  "opaque-tls-unreadable",
]);

const AUDIT_FIELDS = [
  "code",
  "message",
  "host",
  "port",
  "method",
  "path",
  "protocol",
  "status",
  "mode",
  "callIds",
  "frozen",
  "changed",
  "quarantined",
  "restore",
  "violations",
  "label",
  "paths",
  "added",
  "quarantined",
] as const;

/**
 * A containment event as an audit record: what the adapter appends to its
 * log for every onEvent (the relay's allowed and refused requests, a host-side
 * change frozen with its quarantine and restore, originals restored or not,
 * a refused install). Only known fields are kept; values are as emitted.
 */
export function containmentAuditOf(
  e: ContainmentEvent,
): Readonly<{ type: string; payload: Record<string, unknown> }> {
  const src = e as Readonly<Record<string, unknown>>;
  const payload: Record<string, unknown> = {};
  for (const k of AUDIT_FIELDS) {
    if (src[k] !== undefined) {
      payload[k] = src[k];
    }
  }
  const code = typeof src.code === "string" ? src.code : null;
  if (e.type === "egress-refused" || e.type === "egress-allowed") {
    return { type: `containment.${e.type}`, payload };
  }
  if (code && CONTAINMENT_AUDIT_CODES.has(code)) {
    return { type: `containment.${code.replace(/^containment-/, "")}`, payload };
  }
  return {
    type: `containment.${e.type === "refused" ? "refused" : "event"}`,
    payload: { kind: e.type, ...payload },
  };
}
