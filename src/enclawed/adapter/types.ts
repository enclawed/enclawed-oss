// enclawed adapter kit: the normalized contract between a host agent CLI
// and Enclawed.
//
// The rule the kit exists for: every security decision lives in Enclawed. An
// adapter only maps its host's specifics onto these types: how the host's
// hook delivers a call (hook wiring), how the host's settings are written,
// how a person is asked (approval UI), and how the host process is started.
// It never decides whether a call may run.
//
//   host hook input ──adapter──▶ PreActionEvent ──engine──▶ Decision ──adapter──▶ host hook output
//   host tool result ──adapter──▶ PostActionEvent ──engine──▶ CleanOutcome ──adapter──▶ host rewrite
//
// Everything here is data: no host names in the logic, no I/O.

import type { PlanRefusalCode, RelayRefusalCode } from "../containment/index.js";
import type { FsTargetResult, FsWriteOp } from "../fs-reversibility.js";
import type { CapabilityToken } from "../skill-capabilities.js";
import type { SkillRun } from "./skill-types.js";

// ─── Agent events ───────────────────────────────────────────────────────

/**
 * What a call does, as the adapter maps the host's tool onto it. The adapter
 * owns this table (a host's tool names are host specifics); the engine
 * decides per kind. A tool the adapter does not know is "unknown", which the
 * engine treats as irreversible.
 */
export type ActionKind =
  /** Reads local files or lists them (no change anywhere). */
  | "read"
  /** Retrieves a URL the agent chose: data can leave in the request. */
  | "fetch"
  /** A search run by the host's own provider, not at a host the agent picks. */
  | "search"
  /** Bookkeeping inside the host session (todo lists, plan mode, questions). */
  | "session"
  /** Starts a subagent whose own calls come through the same hook. */
  | "agent"
  /** Creates, edits or deletes files. */
  | "fs-write"
  /** Runs a shell command. */
  | "shell"
  /** Calls a tool of an MCP server. */
  | "mcp"
  /** Loads a skill (packaged instructions and scripts). */
  | "skill"
  | "unknown";

export type ShellDialect = "posix" | "powershell";

/**
 * Who can answer an "ask" for this call: "person" when the host (or the
 * adapter's own prompt) reaches a person, "no-person" when it cannot (a
 * headless run, a bypass mode). The engine turns an ask into a deny when no
 * person can answer.
 */
export type ApprovalRoute = "person" | "no-person";

/** Who made the call: the host session and, for a subagent, its id. */
export type ActorRef = Readonly<{
  sessionId: string | null;
  subagentId: string | null;
}>;

/** A file the call names, as the agent gave it (the engine resolves it). */
export type ActionPath = Readonly<{
  /** The path string from the call (relative, absolute or starting with ~). */
  path: string;
  /** For a read: whether the tool also reaches below this path (a recursive search). */
  recursive?: boolean;
  /** For a read: the tool lists names that match (a glob tool) and reads no content. */
  listOnly?: boolean;
}>;

export type WriteTarget = ActionPath & Readonly<{ op: FsWriteOp }>;

export type SessionStartEvent = Readonly<{
  type: "session-start";
  actor: ActorRef;
  /** The host's own word for why it started (new, resume, ...), for the audit only. */
  source?: string | null;
  /** Facts about the launch the adapter wants on the record (policy source, admitted servers, ...). */
  details?: Readonly<Record<string, unknown>>;
}>;

export type SessionEndEvent = Readonly<{
  type: "session-end";
  actor: ActorRef;
  reason?: string | null;
}>;

/** One tool call before it runs. */
export type PreActionEvent = Readonly<{
  type: "pre-action";
  actor: ActorRef;
  /** The host's stable id for this call, when it has one (binding, audit). */
  callId: string | null;
  /** The host's tool name, as the host shows it. */
  tool: string;
  /**
   * The ids an Enclawed policy list may use for this tool: the host name
   * lowercased, plus the gateway's canonical id when there is one ("exec",
   * "write", "edit", "web_fetch", ...). Allowlists and pre-approvals match on
   * any of them.
   */
  policyIds: readonly string[];
  kind: ActionKind;
  /** The host's tool input, unchanged (digested for binding and audit). */
  params: Readonly<Record<string, unknown>>;
  /** Absolute working directory the call runs in. */
  cwd: string;
  /** fs-write: every file the call changes. */
  writes?: readonly WriteTarget[];
  /** read: every file or directory the call reads. */
  reads?: readonly ActionPath[];
  /**
   * read: the input keys the host passes to its search program as data
   * (after `--` or `-e`), never as an option. Every other string argument of a
   * read tool that is shaped like an option is refused (argument injection).
   */
  literalParams?: readonly string[];
  /** shell: the command line. */
  command?: Readonly<{ text: string; dialect: ShellDialect }>;
  /** fetch: the URL. */
  url?: string;
  /** mcp: the server and tool, in the host's normalized spelling. */
  mcp?: Readonly<{ server: string; tool: string }>;
  /** skill: the skill's name. */
  skill?: string;
  approvalRoute: ApprovalRoute;
  /** The host's own mode word (for the audit and the refusal text only). */
  hostMode?: string | null;
}>;

/** One tool result before the model reads it. */
export type PostActionEvent = Readonly<{
  type: "post-action";
  actor: ActorRef;
  callId: string | null;
  tool: string;
  kind: ActionKind;
  params: Readonly<Record<string, unknown>>;
  /** The tool's result, in the host's own shape (the cleaner keeps the shape). */
  result: unknown;
  /**
   * Whether this result reaches the model as text the cleaner should read:
   * the adapter says so per tool (file reads, fetches, searches, shell output
   * and MCP results do; bookkeeping tools do not).
   */
  modelReads: boolean;
  /** The call failed (the result is the error). */
  failed?: boolean;
  /** The host's own mode word when it ran the call (./host-prompt.ts). */
  hostMode?: string | null;
}>;

/** An MCP server's tool definitions as the session sees them (a tools/list answer). */
export type McpDefinitionsEvent = Readonly<{
  type: "mcp-definitions";
  server: string;
  tools: readonly unknown[];
}>;

/** The adapter asks a person to approve a call the engine decided "ask". */
/** What an approval acts on (./approval-effect.ts). */
export type ApprovalTarget = Readonly<{
  kind: "path" | "host" | "program" | "tool";
  /** The target as shown (a path, a host, a program, a tool name). */
  name: string;
}>;

/** The effect of a call put to a person, in plain words (./approval-effect.ts). */
export type ApprovalEffect = Readonly<{
  /** One line: what the call does, whether it can be taken back, and to what. */
  summary: string;
  /** true: it cannot be taken back; false: it can; null: not known. */
  irreversible: boolean | null;
  /** What it acts on (the confirmation word is taken from it). */
  target: ApprovalTarget | null;
}>;

export type ApprovalRequest = Readonly<{
  type: "approval-request";
  id: string;
  callId: string | null;
  tool: string;
  /** Enclawed's reason, already safe to show (untrusted values quoted). */
  reason: string;
  /** The call's effect, to show first on the prompt. */
  effect: ApprovalEffect;
  /** The prompt's instruction line: what to type (the effect's word, then the code). */
  confirm: string;
  /**
   * What the person must type to approve (separators and case ignored): the
   * word taken from the effect's target, then a random code. Shown only on the prompt.
   */
  code: string;
  /** Digest of the call the approval is for (tool + every input key). */
  bindingDigest: string;
  issuedAt: number;
  expiresAt: number;
}>;

/** What the person typed, and the call it is presented for. */
export type ApprovalAnswer = Readonly<{
  type: "approval-answer";
  requestId: string;
  typed: string | null;
  callId: string | null;
  tool: string;
  params: Readonly<Record<string, unknown>>;
}>;

export type AgentEvent =
  | SessionStartEvent
  | SessionEndEvent
  | PreActionEvent
  | PostActionEvent
  | McpDefinitionsEvent
  | ApprovalRequest
  | ApprovalAnswer;

// ─── Decision outcomes ──────────────────────────────────────────────────

export type Outcome = "allow" | "ask" | "deny";

/**
 * Why. Closed codes; three families carry a suffix: the shell classifier's
 * own code, the history basis, and the host mode that had no person.
 */
export type ReasonCode =
  | "hardware-dirty"
  | "hardware-unavailable"
  | "hardware-required-missing"
  | "device-commit-failed"
  | "file-changed-outside-agent"
  | "file-changed-outside-agent-exec"
  | "mcp-server-not-admitted"
  | "mcp-tool-not-pinned"
  | "mcp-tool-revoked"
  | "mcp-connector-not-allowed"
  | "repo-config-held"
  | "repo-config-conflict-resolution"
  | "skill-not-verified"
  | "tool-not-allowlisted"
  | "secret-path"
  | "protected-path"
  | "hardlinked-path"
  | "symlinked-path"
  | "exec-config-path"
  | "protection-undecided"
  | "untracked-overwrite"
  | "git-untracked"
  | "git-ignored"
  | "git-state-unknown"
  | "no-history"
  | "no-write-target"
  | "read"
  | "read-only-retrieval"
  | "person-named-url"
  | "temp-new-file"
  | "host-not-allowlisted"
  | "egress-host-not-allowlisted"
  | "session-internal"
  | "subagent"
  | "read-only-command"
  | "settings-env-overrides"
  | "git-config-runs-programs"
  | "mcp-tool"
  | "unknown-tool"
  | "pre-approved"
  | "malformed-event"
  | "engine-error"
  | "audit-unavailable"
  | "approved-by-person"
  | "not-approved"
  | "credential-path"
  | "environment-dump"
  | "secret-in-arguments"
  | "credential-handle"
  | "credential-destination"
  | "mcp-server-not-contained"
  | "containment-unavailable"
  | "containment-setup-failed"
  | "shell-definition-shadow"
  | PlanRefusalCode
  | RelayRefusalCode
  | "download-and-execute"
  | "nested-agent"
  | "package-install"
  | "project-script"
  | "mcp-argument-role"
  | "mcp-argument-unchecked"
  | "read-argument-injection"
  | "host-self-approval"
  | "host-prompt-answerable"
  | "approval-not-from-person"
  | "contained-execution"
  | "mcp-contained-read-only"
  | "mcp-verified-effect-free"
  | "in-place-edit"
  | "redirect-write"
  | "shell-syntax-error"
  | "skill-conformant"
  | "skill-nonconformant"
  | "executed-under-skill"
  | "skill-changed"
  | `shell:${string}`
  | `history:${string}`
  | `no-person:${string}`
  | `fs:${string}`
  | `workflow:${string}`;

/** Every reason Enclawed writes starts with this, so a person can tell its prompts and refusals apart. */
export const REASON_PREFIX = "Enclawed: ";

export type Decision = Readonly<{
  outcome: Outcome;
  /** Plain words for the person and the agent, starting with REASON_PREFIX. */
  reason: string;
  codes: readonly ReasonCode[];
  /** Enclawed's capability for the call, when it has one. */
  capability: CapabilityToken | null;
  /** true: history kept or irrelevant; false: cannot be taken back; null: not decided on reversibility. */
  reversible: boolean | null;
  /** fs-write: what the history did per target (snapshot kept, git-clean, scratch, or why not). */
  targets?: readonly FsTargetResult[];
  /**
   * shell: a project script, a package install, or a call made under a
   * verified skill (./skill-conformance.ts), which runs only inside a
   * containment (./contained-launch.ts).
   */
  contain?: Readonly<{
    kind: "project-script" | "package-install" | "skill";
    label: string;
    tool: string | null;
    /** kind "skill": what runs, with the skill's admitted capabilities. */
    skill?: SkillRun;
    /**
     * A run offered containment because Enclawed read what it runs
     * (contained-execution): the code it read, by real path and SHA-256. The
     * containment enforces it: inside, no other file from the project or a
     * writable place is loaded or executed as code (../containment
     * code pins), so the run does not depend on the reading being complete.
     */
    code?: ContainedCode;
  }>;
  /** The call as it must run (the contained command line); the adapter replaces the host's input with `params`. */
  rewrite?: Readonly<{ command: string; params: Readonly<Record<string, unknown>> }>;
}>;

/** The code a contained run may load from the project: what Enclawed read. */
export type ContainedCode = Readonly<{
  files: readonly Readonly<{ path: string; sha256: string; exec: boolean }>[];
}>;

/** What the cleaner did to one result. */
export type CleanerAudit = Readonly<{
  mode: CleanerMode;
  removed: number;
  kinds: readonly string[];
  hiddenHtml?: readonly string[];
  withheld?: number;
  applied: boolean;
}>;

export type CleanerMode = "on" | "off" | "audit";

export type CleanOutcome = Readonly<{
  /** true when `output` replaces the result. */
  changed: boolean;
  /** The replacement, in the result's own shape (only string values differ). */
  output?: unknown;
  /**
   * Enclawed's note to the model, to be delivered OUT OF BAND (the host's
   * hook context channel), never inside the tool output.
   */
  note?: string;
  audit: CleanerAudit | null;
}>;

/** An audit record the engine wants appended (the framework's AuditLogger shape). */
export type AuditInput = Readonly<{
  type: string;
  actor: string;
  level: string | null;
  payload: unknown;
}>;

/** Where the engine writes its records. The framework's AuditLogger satisfies it. */
export type AuditSink = Readonly<{
  append(input: AuditInput): Promise<unknown>;
}>;

/** A Decision plus the record that was written for it (or that failed). */
export type HandledDecision = Decision &
  Readonly<{
    /** What the host should be told; differs from outcome only after an approval or an audit failure. */
    answer: Outcome;
    answerReason: string;
    audited: boolean;
  }>;

// ─── Host capabilities (portability requirements R1–R4) ─────────────────

export type Documented<T extends string> = T | "not-documented";

/**
 * What the host CLI provides, as the codenclawed paper's portability section
 * lists it. R1 is necessary (without it there is no reference monitor); R2 is
 * needed only for the cleaner; R3 and R4 make the monitor reliable against a
 * hostile repository and hostile processes in the session.
 */
export type HostCapabilities = Readonly<{
  host: string;
  /** R1: a blocking pre-tool hook. */
  preToolHook: Readonly<{
    /** It can deny a call before it runs. */
    canDeny: boolean;
    /** It sees built-in, shell, file and MCP calls. */
    coversAllTools: boolean;
    coversSubagents: Documented<"yes" | "implied" | "no">;
    /** What a crashed or timed-out hook does: block, block when configured, or let the call run. */
    onFailure: Documented<"blocks" | "blocks-when-configured" | "continues">;
    /** An external program (preferred) or a plugin inside the host process. */
    delivery: "external-program" | "in-process-plugin";
  }>;
  /** R2: replacing a tool's output before the model reads it. */
  outputRewrite: Documented<"full" | "partial" | "append-only" | "none">;
  /** R3: adding hooks for one session above what a repository can supply. */
  settingsInjection: Readonly<{
    channel: Documented<"flag" | "environment" | "none">;
    ranksAboveRepository: Documented<"yes" | "no">;
    /** The launcher can see (and refuse) hooks and command settings a project adds. */
    projectHooksVisible: Documented<"yes" | "no">;
  }>;
  /** R4: an on-disk transcript of every call with a stable call id. */
  transcript: Readonly<{
    onDisk: Documented<"yes" | "no">;
    stableCallIds: Documented<"yes" | "no">;
    formatStable: Documented<"yes" | "no">;
  }>;
}>;

export type PortabilityRequirement = "R1" | "R2" | "R3" | "R4";

export type PortabilityAssessment = Readonly<{
  /** false: the host cannot be wrapped (no blocking pre-tool hook). */
  supported: boolean;
  met: readonly PortabilityRequirement[];
  /** Plain sentences: what is missing and what the adapter must do about it. */
  gaps: readonly string[];
  /** The input cleaner can rewrite results (R2 full). */
  cleanerApplies: boolean;
}>;

// ─── Containment of what a session launches (MCP servers, project scripts) ──

/** What is launched outside the host's own tool loop. */
export type ContainedLaunch = Readonly<{
  kind: "mcp-server" | "project-script" | "package-install";
  /** The program and arguments exactly as they would run. */
  argv: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
  /** Filesystem roots the launch may see, each read-only or read-write. */
  roots: readonly Readonly<{ path: string; mode: "ro" | "rw" }>[];
  /** Hosts it may reach (through the containment's relay); empty: no network. */
  egress: readonly string[];
  /** Why it runs (the server's name, the script's name), for the record. */
  label: string;
  /** package-install: the package manager (npm, pnpm, yarn, bun, pip, pip3, uv, poetry); required. */
  tool?: string;
}>;

/** A launch that runs contained, or why it cannot. */
export type ContainmentOutcome =
  | Readonly<{ ok: true; pid: number; stop(): Promise<void> }>
  | Readonly<{ ok: false; code: string; reason: string }>;

/**
 * SEAM: the containment that every MCP server and project script a session
 * launches goes through (src/enclawed/containment provides it). An adapter
 * never spawns them itself. With no containment available, a launch is
 * refused (launchContained).
 */
export interface LaunchContainment {
  /** Whether this machine can contain launches (namespaces, a sandbox backend). */
  available(): Readonly<{ ok: boolean; reason: string | null }>;
  launch(spec: ContainedLaunch): Promise<ContainmentOutcome>;
}
