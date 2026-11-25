// enclawed adapter kit: the engine's options, the decision helpers and the
// resolved call context, shared by the rule modules (./path-rules.ts,
// ./engine.ts). Not an adapter-facing surface beyond the exported types.

import path from "node:path";
import type { HardwareGateDecision } from "../agent-tool-guard.js";
import type { FsHistoryOutcome, PrepareFsHistoryParams } from "../fs-reversibility.js";
import type { Policy } from "../policy.js";
import type { ApprovalLedger } from "./approval.js";
import type { CallCommitter } from "./call-commitment.js";
import type { ScriptContainer } from "./contained-launch.js";
import type { ShellClassifier } from "./contracts.js";
import type { TaintStore } from "./exec-taint.js";
import type { FileIntegrityLedger } from "./file-integrity.js";
import { nodeFsProbe, type FsProbe, type ProtectedSet } from "./fs-probe.js";
import type { BoundCredential } from "./host-env.js";
import type { HostPromptGuard } from "./host-prompt.js";
import type { McpSession } from "./mcp.js";
import type { ConflictGrants, HoldStore } from "./repo-config-hold.js";
import {
  isExecConfigPath,
  isExecConfigDir,
  allow,
  deny,
  upperFirst,
  irreversible,
  personOnly,
  type ExecConfigOption,
} from "./rule-decisions.js";
import type { ShellDefinitions } from "./shell-definitions.js";
import type { SkillSet } from "./skill-types.js";
import type { ActorRef, AuditSink, CleanerMode, PreActionEvent } from "./types.js";
import type { WorkflowProfile } from "./workflow.js";

// ─── Inputs the engine decides with ─────────────────────────────────────

export type { ShellClassifier, ShellVerdict } from "./contracts.js";

export const conservativeShellClassifier: ShellClassifier = {
  classify: () => ({ readOnly: false, code: "not-classified" }),
};

export type { SkillSet } from "./skill-types.js";

export type HistoryAccess = Readonly<{
  store: NonNullable<PrepareFsHistoryParams["store"]>;
  /** Default: the framework's prepareFsWriteHistory. */
  prepare?: (p: PrepareFsHistoryParams) => Promise<FsHistoryOutcome>;
}>;

export type EngineOptions = Readonly<{
  /**
   * The command a person runs to restore a kept snapshot, as this host names it (shown in
   * reasons as "undo with: ..."); default "enclawed history restore".
   */
  historyRestoreCommand?: string;
  /** The adapter's host id (host data): prefixes audit record types and agent ids. */
  host: string;
  policy: Policy;
  projectDir: string;
  home?: string | null;
  history: HistoryAccess;
  /** Default: the framework's checkHardwareRootForToolCall (cached state, never the device). */
  hardware?: (tool: string, actor: string) => HardwareGateDecision | Promise<HardwareGateDecision>;
  /** Enclawed's own state, policy, audit log, history and code. */
  protected?: ProtectedSet | null;
  /** Files no read and no command of the agent may reach (session secrets, the host's login, signer keys). */
  secretPaths?: readonly string[];
  /** Operator-declared paths whose untracked files the agent may overwrite without a person. */
  overwritablePaths?: readonly string[];
  /** Extra file names / directory segments that configure what runs later on this host. */
  execConfig?: ExecConfigOption;
  /** A settings file sets a variable that changes what shell commands run (env-trust changesShellCommands), described; or null. */
  shellEnvRisk?: string | null;
  /**
   * The variables the repository's own settings set that change what
   * commands run (env-trust changesShellCommands), even when the host pins
   * them for this session. While any is set, a command that runs code is
   * not offered containment unless it sets or clears each itself.
   */
  repositoryEnv?: readonly string[] | null;
  /**
   * The URLs the person named in this session's task (./person-urls.ts
   * personUrlsOf over the person's own text: the host's prompt argument or
   * its user-prompt event, never a file, a tool result or model output).
   * A plain GET of exactly one of them (WebFetch, or curl with only quiet,
   * fail, follow and timeout options into read-only commands) needs no person.
   */
  personUrls?: readonly string[] | null;
  /**
   * The complete environment the agent's shell commands run with. The
   * adapter passes it only when it knows that environment exactly: a host
   * whose shell also takes what the login shell's startup files export (a
   * shell snapshot) runs with variables the hook process never sees, and
   * then the adapter passes null. With it, an environment print filtered to
   * lines that hold no credential needs no person (./env-filter.ts), and
   * $NAME, gh and inline-code rules may read it. Absent: they all ask.
   */
  environment?: Readonly<Record<string, string>> | null;
  /**
   * The aliases and functions defined in the shell the agent's commands run
   * in (./shell-definitions.ts): what the host's shell sources before the
   * command (a snapshot of the person's login shell, startup files). The
   * functions `environment` exports (BASH_FUNC_NAME%%) are added by the kit.
   * A command word that is an alias or a function is never decided as the
   * program of its name. Absent, null or "unknown" (the adapter cannot
   * establish them): no command word is, so no shell command is read-only
   * and nothing is offered containment; pass NO_SHELL_DEFINITIONS for a
   * shell known to define nothing.
   */
  shellDefinitions?: ShellDefinitions | "unknown" | null;
  /** Default: strictShellClassifier (./shell-readonly.ts). */
  shell?: ShellClassifier;
  mcp?: McpSession | null;
  skills?: SkillSet | null;
  /** The session's workflow profile (./workflow.ts): anything it does not list is denied. */
  workflow?: WorkflowProfile | null;
  fs?: FsProbe;
  audit?: AuditSink | null;
  cleanerMode?: CleanerMode;
  /** Remembers what was decided per call, to tell whether what ran is what was checked. Default: in memory. */
  decided?: DecidedStore;
  approvals?: ApprovalLedger;
  /** The credential handles the host was started with (./host-env.ts): bound to their destinations. */
  credentials?: readonly BoundCredential[];
  /** Network-origin files of this session (./exec-taint.ts). The engine keeps one in memory when none is given. */
  taint?: TaintStore;
  /** The session's repository-configuration hold (./repo-config-hold.ts): while held, every call is denied. */
  repoConfigHold?: HoldStore | null;
  /**
   * No launcher prompt (the host's own prompt only): the write that resolves
   * a held conflict is asked there, with a grant in this file-backed ledger
   * (./repo-config-hold.ts askConflictResolution / completeConflictResolution).
   */
  conflictGrants?: ConflictGrants | null;
  /**
   * No prompt of Enclawed's own: an "ask" goes to the host's prompt, which
   * may approve a pending call by itself (./host-prompt.ts). Asked there only
   * when the host cannot, or when the write can be put back; checked on the
   * host's post-tool event.
   */
  hostPrompt?: HostPromptGuard | null;
  /** Runs project scripts and package installs contained (./contained-launch.ts scriptContainer); without one they are refused. */
  containScripts?: ScriptContainer | null;
  /**
   * With a hardware root held: has the device holder sign a commitment to each
   * decision (./call-commitment.ts) before it is recorded and answered. A call
   * that cannot be committed is denied.
   */
  commit?: CallCommitter | null;
  /** The project's record of files at the last audited state (./file-integrity.ts): a changed file's use is denied or asked. */
  fileIntegrity?: FileIntegrityLedger | null;
}>;

export interface DecidedStore {
  remember(callId: string, digest: string): void | Promise<void>;
  recall(callId: string): string | null | Promise<string | null>;
}

export function memoryDecidedStore(): DecidedStore {
  const m = new Map<string, string>();
  return {
    remember: (id, d) => {
      m.set(id, d);
      if (m.size > 4096) {
        m.delete(m.keys().next().value as string);
      }
    },
    recall: (id) => m.get(id) ?? null,
  };
}

// The decision helpers and the exec-config path rules live in ./rule-decisions.ts.
export {
  isExecConfigPath,
  isExecConfigDir,
  allow,
  deny,
  upperFirst,
  irreversible,
  personOnly,
  type ExecConfigOption,
} from "./rule-decisions.js";

export function hostOf(url: unknown): string | null {
  try {
    return new URL(String(url)).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** The agent id kept in history entries and audit records: host, session and subagent. */
export function historyAgentId(host: string, actor: ActorRef): string {
  if (!actor.sessionId) {
    return actor.subagentId ? `${host}:${actor.subagentId}` : host;
  }
  return actor.subagentId
    ? `${host}:${actor.sessionId}/${actor.subagentId}`
    : `${host}:${actor.sessionId}`;
}

export function actorOf(host: string, actor: ActorRef): string {
  if (actor.subagentId) {
    return `${host}:${actor.subagentId}`;
  }
  return actor.sessionId ? `${host}:${actor.sessionId}` : host;
}

// ─── Resolved context ───────────────────────────────────────────────────

export type Ctx = Readonly<{
  event: PreActionEvent;
  opts: EngineOptions;
  fs: FsProbe;
  home: string | null;
  cwd: string;
}>;

export function contextOf(event: PreActionEvent, opts: EngineOptions): Ctx {
  return {
    event,
    opts,
    fs: opts.fs ?? nodeFsProbe(),
    home: opts.home ?? null,
    cwd: path.isAbsolute(event.cwd) ? event.cwd : opts.projectDir,
  };
}
