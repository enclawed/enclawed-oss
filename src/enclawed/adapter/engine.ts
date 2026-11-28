// enclawed adapter kit: the host-agnostic decision engine.
//
// Every security decision an adapter needs, behind the normalized contract
// (./types.ts), on top of the framework's own modules:
//
//   hardware halt         ../agent-tool-guard.ts checkHardwareRootForToolCall
//   write history         ../fs-reversibility.ts prepareFsWriteHistory, ../history-store.ts
//   policy                ../policy.ts (allowlists, pre-approvals, history opt-outs)
//   MCP drift             ../mcp-tool-pins.ts (via ./mcp.ts)
//   audit                 ../audit-log.ts AuditLogger (any AuditSink)
//   DLP in audit records  ../dlp-scanner.ts redact
//
// and the rules codenclawed proved in its red-team rounds, ported here:
// protected and secret paths, hard links, symlinks, files that configure what
// runs later, overwriting a file git does not keep, egress to hosts off the
// allowlist, settings that change what shell commands run, irreversible
// actions with no person to ask, the input cleaner, approval binding.
//
// The reversibility rule: a call is reversible when the data it affects has a
// history, or when its history is irrelevant. Reversible calls run;
// irreversible calls wait for a person unless the operator pre-approved the
// tool, and are refused where no person can be asked.
//
// Decisions are pure given the event, the policy and the injected probes
// (filesystem facts, hardware state, history store). The order of the rules
// below is the order codenclawed's gate applies them.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { checkHardwareRootForToolCall } from "../agent-tool-guard.js";
import { redact as dlpRedact } from "../dlp-scanner.js";
import { prepareFsWriteHistory } from "../fs-reversibility.js";
import { canonicalJson } from "../mcp-tool-pins.js";
import { CAPABILITY, isCapabilityToken, isIrreversible } from "../skill-capabilities.js";
import { auditedActionScope } from "./action-scope.js";
import { approvalEffect } from "./approval-effect.js";
import { ApprovalLedger, bindingOf, type ApprovalVerdict } from "./approval.js";
import { type CallCommitmentCall, evidenceCovers } from "./call-commitment.js";
import { projectSecretMasks } from "./contained-build.js";
import {
  containedExecution,
  expandGlob,
  gitBlobId,
  projectSnapshotPlan,
  versionProbe,
} from "./contained-exec.js";
import {
  commandReachesCredential,
  credentialFindings,
  dumpsEnvironment,
  printsNamesOnly,
  readReachesCredential,
  redactCredentialsIn,
  stringsOf,
} from "./credentials.js";
import { envPrintsNoCredential } from "./env-filter.js";
import { codeLoadingEnvOf, type CodeRuntime } from "./env-trust.js";
import { execProvenance } from "./exec-provenance.js";
import {
  memoryTaintStore,
  settleTaint,
  taintEffects,
  taintViewOf,
  type TaintStore,
} from "./exec-taint.js";
import {
  bracketsAuditedAction,
  FILE_CHANGED_CODE,
  fileIntegrityAskRule,
  fileIntegrityDenyRule,
} from "./file-integrity.js";
import { findMayPrint } from "./find-expr.js";
import { expandHome, isInside } from "./fs-probe.js";
import { ghInert } from "./gh-cli.js";
import { gitCommandStarts } from "./git-programs.js";
import { gitFetchRefusal } from "./git-writes.js";
import { commandNamesHandle, destinationAllowed, handlesIn, redactHandles } from "./host-env.js";
import {
  askAtHostPrompt,
  completeHostPromptAsk,
  hostPromptHold,
  type HostPromptCompletion,
} from "./host-prompt.js";
import { mcpEffectVerdict } from "./mcp-effects.js";
import { checkArgumentRoles } from "./mcp-roles.js";
import { describeMcpToolDrift, type McpAdmissionRecord, type McpAdmitted } from "./mcp.js";
import { NOTICE_CONTEXT, cleanToolResult } from "./output-cleaner.js";
import {
  commandNamesProtected,
  commandNamesSecret,
  createdThisSession,
  decideFsWrite,
  meetsSecret,
  newTempFile,
  pathWords,
  tempScratchDir,
} from "./path-rules.js";
import { isPersonNamedDevTcpGet, isPersonNamedUrl, personNamedGet } from "./person-urls.js";
import { escalationIn } from "./privilege.js";
import {
  programWords,
  runtimesOf,
  unverifiedProgramIn,
  unverifiedProgramOf,
} from "./program-path.js";
import { projectSecretValues, redactProjectSecretsIn } from "./project-secrets.js";
import {
  isNodeGetOf,
  isPurePythonFilter,
  isPureSedFilter,
  isTrFilter,
  pythonCodeIsGetOf,
  pythonIsPureReader,
} from "./pure-code.js";
import { importsOnlyStdlib, pythonRunOf } from "./python-run.js";
import { askConflictResolution, repoConfigHoldReason } from "./repo-config-hold.js";
import {
  actorOf,
  allow,
  contextOf,
  deny,
  historyAgentId,
  hostOf,
  irreversible,
  memoryDecidedStore,
  personOnly,
  type Ctx,
  type DecidedStore,
  type EngineOptions,
} from "./rule-kit.js";
import { redactSecretAssignments } from "./secret-content.js";
import {
  OPAQUE,
  OPAQUE_HEX,
  parseCompound,
  type Fileset,
  type SimpleCommand,
} from "./shell-compound.js";
import {
  aliasesLexNeutral,
  containedCommandLine,
  isContainedLaunchLine,
  NO_SHELL_DEFINITIONS,
  definesNothing,
  lineMayInvokeDefinition,
  resolveShellDefinitions,
  shadowedCommandIn,
  shadowOf,
  type ResolvedDefinitions,
} from "./shell-definitions.js";
import { classifyArgv, strictShellClassifier } from "./shell-readonly.js";
import { attributeSkillCall, type SkillRun } from "./skill-conformance.js";
import {
  REASON_PREFIX,
  type ActorRef,
  type ApprovalRequest,
  type CleanOutcome,
  type ContainedCode,
  type Decision,
  type ReasonCode,
  type HandledDecision,
  type McpDefinitionsEvent,
  type Outcome,
  type PostActionEvent,
  type PreActionEvent,
  type SessionEndEvent,
  type SessionStartEvent,
} from "./types.js";
import { quoteUntrusted as q, sanitizeText, showPath } from "./untrusted.js";
import { workflowVerdict } from "./workflow.js";

export {
  conservativeShellClassifier,
  isExecConfigPath,
  historyAgentId,
  type DecidedStore,
  type EngineOptions,
  type HistoryAccess,
  type ShellClassifier,
  type ShellVerdict,
  type SkillSet,
} from "./rule-kit.js";
export { pathWords, untrackedOverwrite } from "./path-rules.js";

// ─── The pre-action rules, in order ─────────────────────────────────────

const fileIntegrityDeny = (ctx: Ctx) => fileIntegrityDenyRule(ctx.event, ctx.opts);
const fileIntegrityAsk = (ctx: Ctx, decided: Decision) =>
  fileIntegrityAskRule(ctx.event, ctx.opts, decided);

async function hardwareRule(ctx: Ctx): Promise<Decision | null> {
  const check =
    ctx.opts.hardware ??
    ((tool: string, actor: string) => checkHardwareRootForToolCall(tool, { agentId: actor }));
  const hw = await check(ctx.event.tool, actorOf(ctx.opts.host, ctx.event.actor));
  return hw.allowed
    ? null
    : deny([hw.code], `hardware root halt: ${q(hw.reason, { max: 300 })}`, null);
}

// Repository configuration a contained git checked out, not admitted yet:
// every call waits (./repo-config-hold.ts).
// With no launcher prompt (conflictGrants), the one write that resolves a
// conflict is asked at the host's prompt instead (askConflictResolution).
async function repoConfigHoldRule(ctx: Ctx): Promise<Decision | null> {
  const why = await repoConfigHoldReason(ctx.opts.repoConfigHold).catch(
    () => "the session's hold could not be checked",
  );
  if (!why) {
    return null;
  }
  const { event, opts } = ctx;
  if (opts.conflictGrants && opts.repoConfigHold && event.kind === "fs-write") {
    const writes = (event.writes ?? []).map((w) =>
      w.path ? path.resolve(ctx.cwd, expandHome(w.path, ctx.home)) : "",
    );
    const r = writes.includes("")
      ? null
      : await askConflictResolution(opts.repoConfigHold, opts.conflictGrants, {
          callId: event.callId,
          writes,
          person: event.approvalRoute === "person",
          hostMode: event.hostMode ?? null,
        }).catch(() => null);
    if (r?.ask) {
      return {
        outcome: "ask",
        reason: `${REASON_PREFIX}${r.question}`,
        codes: ["repo-config-conflict-resolution"],
        capability: CAPABILITY.FS_WRITE_IRREV,
        reversible: false,
      };
    }
    if (r) {
      return deny(["repo-config-held"], `${why}; ${r.reason}`, null);
    }
  }
  return deny(["repo-config-held"], why, null);
}

// A call that needed a person's answer ran without one at the host's own
// prompt (./host-prompt.ts): the host session is held, every call is denied.
function hostPromptHoldRule(ctx: Ctx): Decision | null {
  const g = ctx.opts.hostPrompt;
  const why = g ? hostPromptHold(g) : null;
  return why
    ? deny(
        ["approval-not-from-person"],
        `this session is held: a call that needed a person's answer ran without one (${q(why, { max: 300 })}). Every tool call is refused; start a new session after checking what changed`,
        null,
      )
    : null;
}

function mcpRule(ctx: Ctx): Decision | null {
  const { event, opts } = ctx;
  if (event.kind !== "mcp" || !opts.mcp) {
    return null;
  }
  if (!event.mcp) {
    return deny(
      ["mcp-server-not-admitted"],
      `the MCP call names no server. Tool (name as given): ${q(event.tool, { max: 120 })}`,
      CAPABILITY.TOOL_INVOKE,
    );
  }
  const v = opts.mcp.verdict(event.mcp.server, event.mcp.tool);
  // A tool whose listed definition drifted is revoked; its server's code is
  // the one that started, so a call that code shows to be effect-free can do
  // nothing the new description asks for (it carries no argument out).
  const admitted = v?.code === "mcp-tool-revoked" ? opts.mcp.server(event.mcp.server) : null;
  if (v && !(admitted?.program && mcpByEffects(ctx, admitted, event.mcp.tool).decision)) {
    return deny(
      [v.code],
      `${v.reason}. Tool (name as given): ${q(event.tool, { max: 120 })}`,
      CAPABILITY.TOOL_INVOKE,
    );
  }
  // The argument roles the admission record declared (a role check that throws denies).
  let roles: ReturnType<typeof checkArgumentRoles>;
  try {
    roles = checkArgumentRoles(opts.mcp.roles(event.mcp.server, event.mcp.tool), event.params, ctx);
  } catch (err) {
    roles = {
      ok: false,
      arg: "?",
      reason: `could not be checked (${sanitizeText((err as Error)?.message ?? err, { max: 120 })})`,
    };
  }
  return roles.ok
    ? null
    : deny(
        ["mcp-argument-role"],
        `${roles.reason}. Tool (name as given): ${q(event.tool, { max: 120 })}`,
        CAPABILITY.TOOL_INVOKE,
      );
}

function skillRule(ctx: Ctx): Decision | null {
  const { event, opts } = ctx;
  const skills = opts.skills;
  if (!skills) {
    return null;
  }
  if (event.kind === "skill") {
    const bare = (event.skill ?? "").replace(/^\//, "");
    if (!skills.verified.some((s) => s.name === bare)) {
      return deny(
        ["skill-not-verified"],
        `the skill ${q(event.skill ?? "", { max: 120 })} is not in this session's verified set (only skills whose signed bundle verified at launch may load: ${skills.verified.map((s) => s.name).join(", ") || "none"})`,
        CAPABILITY.SPAWN_PROC,
      );
    }
    return null;
  }
  if (event.kind !== "shell") {
    return null;
  }
  // A command that only reads (the kit's own strict read-only classifier, never
  // a host-supplied one) runs nothing of an unverified skill: reading its files
  // is a read like any other, and the secret, credential and git-program rules
  // still decide it.
  const cmd = event.command?.text ?? "";
  if (
    strictShellClassifier.classify(cmd, event.command?.dialect ?? "posix", {
      cwd: ctx.cwd,
      home: ctx.home,
      gitTop: (d: string) => ctx.fs.committedTree?.(d)?.top ?? null,
    }).readOnly
  ) {
    return null;
  }
  const verifiedDirs = skills.verified.map((s) => s.dir);
  // A skill excluded at launch is a skill directory even outside the known roots.
  const roots = [...skills.roots, ...(skills.excluded ?? []).map((s) => s.dir)];
  const outside = (p: string) =>
    roots.some((r) => isInside(r, p)) && !verifiedDirs.some((d) => isInside(d, p));
  const cwdReal = ctx.fs.realpathNearest(ctx.cwd);
  if (outside(cwdReal)) {
    return deny(
      ["skill-not-verified"],
      `this command runs in ${showPath(cwdReal)}, a skill directory that is not in the verified set`,
      CAPABILITY.SPAWN_PROC,
    );
  }
  // Each pipeline where it runs: one whose every command only reads names a
  // skill's files to read them; any other is checked word by word, with the
  // files it writes. A line the kit cannot read exactly: as a whole.
  const parsed =
    (event.command?.dialect ?? "posix") === "posix"
      ? parseCompound(
          cmd,
          {
            cwd: ctx.cwd,
            home: ctx.home,
            gitTop: (d: string) => ctx.fs.committedTree?.(d)?.top ?? null,
          },
          { fileRedirects: true },
        )
      : null;
  const checks: { words: string[]; cwds: readonly string[] }[] = [];
  if (parsed?.ok) {
    let pipe: SimpleCommand[] = [];
    const flush = () => {
      const reads = pipe.every(
        // A read-only git included: what its repository makes it start is decided later.
        (c) => !c.writes?.length && (classifyArgv(c.argv).readOnly || c.argv[0] === "cd"),
      );
      if (!reads) {
        for (const c of pipe) {
          checks.push({
            words: [
              ...c.argv,
              ...(c.writes ?? []).map((w) => w.path),
              // Names it is given from a listing: the listing's roots.
              ...(c.filesets ?? []).flatMap((f) => f.roots),
              // A word whose value is unknown: the whole line's words.
              ...(c.unknownArgs ? pathWords(cmd) : []),
            ],
            cwds: c.cwds,
          });
        }
      }
      pipe = [];
    };
    for (const c of parsed.commands) {
      pipe.push(c);
      if (c.next !== "|") {
        flush();
      }
    }
    flush();
  } else {
    checks.push({ words: pathWords(cmd), cwds: [ctx.cwd] });
  }
  for (const { words, cwds } of checks) {
    for (const d of cwds) {
      const dReal = ctx.fs.realpathNearest(d);
      if (outside(dReal)) {
        return deny(
          ["skill-not-verified"],
          `this command runs in ${showPath(dReal)}, a skill directory that is not in the verified set`,
          CAPABILITY.SPAWN_PROC,
        );
      }
      for (const w of words.flatMap((x) => pathWords(x))) {
        const abs = ctx.fs.realpathNearest(path.resolve(d, expandHome(w, ctx.home)));
        if (outside(abs)) {
          return deny(
            ["skill-not-verified"],
            `this command names ${showPath(abs)}, under a skill directory that is not in the verified set (word, untrusted: ${q(w, { max: 200 })})`,
            CAPABILITY.SPAWN_PROC,
          );
        }
      }
    }
  }
  return null;
}

// The workflow profile (./workflow.ts): deny-by-default for anything it does
// not list. It only ever narrows: a call it admits still goes through every
// rule after it.
function workflowRule(ctx: Ctx): Decision | null {
  const { event, opts } = ctx;
  const v = workflowVerdict(opts.workflow ?? null, event, {
    cwd: ctx.cwd,
    projectDir: opts.projectDir,
    home: ctx.home,
    fs: ctx.fs,
    shell: opts.shell,
  });
  return v ? deny([v.code], v.reason, null) : null;
}

function allowlistRule(ctx: Ctx): Decision | null {
  const { event, opts } = ctx;
  if (
    opts.policy.enforceAllowlists &&
    !event.policyIds.some((id) => opts.policy.allowedTools.has(id))
  ) {
    return deny(
      ["tool-not-allowlisted"],
      `tool ${q(event.tool, { max: 120 })} is not on enclawed.policy.allowedTools`,
      null,
    );
  }
  return null;
}

function secretReadRule(ctx: Ctx): Decision | null {
  const { event, opts } = ctx;
  const secrets = opts.secretPaths ?? [];
  if (event.kind !== "read" && event.kind !== "fetch" && event.kind !== "search") {
    return null;
  }
  for (const r of event.reads ?? []) {
    const abs = path.resolve(ctx.cwd, expandHome(r.path, ctx.home));
    const hit = secrets.length ? meetsSecret(ctx, abs, secrets, r.recursive === true) : null;
    if (hit) {
      return deny(
        ["secret-path"],
        `the target (quoted as the agent gave it) ${q(r.path)} ${hit.how} ${showPath(hit.secret)}, which holds secrets of Enclawed or of the agent CLI`,
        CAPABILITY.FS_READ,
      );
    }
  }
  // The user's own credential stores: a person decides, each time.
  for (const r of event.reads ?? []) {
    const abs = path.resolve(ctx.cwd, expandHome(r.path, ctx.home));
    const cred = readReachesCredential(
      ctx.fs,
      abs,
      ctx.home,
      r.recursive === true,
      r.listOnly === true,
    );
    if (cred) {
      return personOnly(
        ["credential-path"],
        `this read reaches ${cred.what} (${showPath(cred.path)}); its content would reach the model. Target (quoted as the agent gave it): ${q(r.path)}`,
        CAPABILITY.FS_READ,
        event,
      );
    }
  }
  return null;
}

// The arguments of a local read or search tool (Glob, Grep, find_by_name and
// their equivalents): the host runs a program with them, so a value shaped
// like an option could make it run or write something (row 60). Plain
// searches are unaffected: patterns that do not begin with an option shape,
// globs, paths, booleans and numbers. Path-named arguments are checked like
// read targets, because a host may not list them in `reads`.
const PATH_PARAM =
  /^(path|paths|file|files|file_path|filepath|dir|dirs|directory|directory_path|target_directory|search_path|search_directory|root|cwd|notebook_path|include|exclude)$/i;
const OPTION_SHAPE = /^--?[A-Za-z]/;
// ripgrep/fd flags that start programs or read archives through one (--pre, --search-zip, -z, -X, --exec).
const EXEC_FLAG =
  /(^|\s)--?(pre|pre-glob|search-zip|hostname-bin|exec|exec-batch)(=|\s|$)|(^|\s)-[a-zA-Z]*[zX](\s|$)/;

function readArgumentRule(ctx: Ctx): Decision | null {
  const { event, opts } = ctx;
  if (event.kind !== "read") {
    return null;
  }
  const literal = new Set(event.literalParams ?? []);
  for (const [k, raw] of Object.entries(event.params)) {
    const values = (Array.isArray(raw) ? raw : [raw]).filter(
      (v): v is string => typeof v === "string",
    );
    for (const v of values) {
      // A control character never belongs in a search or path argument (a
      // host that joins arguments into a line would split it there).
      if (v.includes("\u0000") || v.includes("\r") || v.includes("\n")) {
        return deny(
          ["read-argument-injection"],
          `the argument ${q(k, { max: 60 })} of this search or read holds a control character (value as given: ${q(v, { max: 200 })})`,
          CAPABILITY.FS_READ,
        );
      }
      // A search-program flag that runs programs, anywhere in a non-literal argument.
      if (!literal.has(k) && EXEC_FLAG.test(v)) {
        return deny(
          ["read-argument-injection"],
          `the argument ${q(k, { max: 60 })} of this search or read names a flag that runs programs (value as given: ${q(v, { max: 200 })})`,
          CAPABILITY.FS_READ,
        );
      }
      if (!literal.has(k) && OPTION_SHAPE.test(v)) {
        return deny(
          ["read-argument-injection"],
          `the argument ${q(k, { max: 60 })} of this search or read (value as given: ${q(v, { max: 200 })}) begins like an option, so the program the agent CLI runs could read it as one (some options run programs or write files). Name a file that begins with "-" as ./-name`,
          CAPABILITY.FS_READ,
        );
      }
      if (!PATH_PARAM.test(k) || v === "") {
        continue;
      }
      const abs = path.resolve(ctx.cwd, expandHome(v, ctx.home));
      // Whether the tool descends below this path: as the host listed it among the
      // call's reads (Read of a directory does not; Grep and Glob do), and when the
      // host did not list it, it may (the wider set).
      const listed = (event.reads ?? []).filter(
        (r) => path.resolve(ctx.cwd, expandHome(r.path, ctx.home)) === abs,
      );
      const descends = listed.length === 0 || listed.some((r) => r.recursive === true);
      const secret = opts.secretPaths?.length
        ? meetsSecret(ctx, abs, opts.secretPaths, descends)
        : null;
      if (secret) {
        return deny(
          ["secret-path"],
          `the argument ${q(k, { max: 60 })} (value as given: ${q(v)}) ${secret.how} ${showPath(secret.secret)}, which holds secrets of Enclawed or of the agent CLI`,
          CAPABILITY.FS_READ,
        );
      }
      const cred = readReachesCredential(ctx.fs, abs, ctx.home, descends);
      if (cred) {
        return personOnly(
          ["credential-path"],
          `this search reaches ${cred.what} (${showPath(cred.path)}); what it finds would reach the model. Argument ${q(k, { max: 60 })} (value as given): ${q(v)}`,
          CAPABILITY.FS_READ,
          event,
        );
      }
    }
  }
  return null;
}

// Data leaving through a call (MCP, fetch, search): a credential format in
// its arguments is refused.
function outboundDlpRule(ctx: Ctx): Decision | null {
  const { event } = ctx;
  if (event.kind !== "mcp" && event.kind !== "fetch" && event.kind !== "search") {
    return null;
  }
  let kinds: string[];
  try {
    kinds = [
      ...new Set(
        [...stringsOf(event.params), event.url ?? ""].flatMap((t) =>
          credentialFindings(t).map((f) => f.id),
        ),
      ),
    ].toSorted();
  } catch {
    kinds = ["unscannable"];
  }
  return kinds.length
    ? deny(
        ["secret-in-arguments"],
        `the call's arguments carry a credential (${kinds.join(", ")}), which would leave this machine. Tool (name as given): ${q(event.tool, { max: 120 })}`,
        CAPABILITY.NET_EGRESS,
      )
    : null;
}

// A credential handle (the host's own key, bound to its destinations): sent
// anywhere else it is refused; a command that names its variable asks.
function credentialHandleRule(ctx: Ctx): Decision | null {
  const { event, opts } = ctx;
  const handles = opts.credentials ?? [];
  if (!handles.length) {
    return null;
  }
  if (event.kind === "shell") {
    const cmd = event.command?.text ?? "";
    const h = commandNamesHandle(cmd, handles);
    return h
      ? personOnly(
          ["credential-handle"],
          `this command uses the credential ${q(h.name, { max: 80 })}, which is bound to ${h.destinations.join(", ")}; what the command does with it is not checked. Command (quoted as the agent gave it): ${q(cmd, { max: 400 })}`,
          CAPABILITY.SPAWN_PROC,
          event,
        )
      : null;
  }
  if (event.kind === "read" || event.kind === "session" || event.kind === "skill") {
    return null;
  }
  const texts = [...stringsOf(event.params), event.url ?? ""];
  const carried = handles.filter((h) => texts.some((t) => handlesIn(t, [h]).length > 0));
  const host = event.kind === "fetch" ? hostOf(event.url) : null;
  const stray = carried.find((h) => !destinationAllowed(h, host));
  return stray
    ? deny(
        ["credential-destination"],
        `the call carries the credential ${q(stray.name, { max: 80 })}, which may go only to ${stray.destinations.join(", ")}. Tool (name as given): ${q(event.tool, { max: 120 })}`,
        CAPABILITY.NET_EGRESS,
      )
    : null;
}

/** The session's taint with what is measurable now settled (digests of downloads on disk, unpacked members). */
async function settledTaintView(store: TaintStore) {
  let entries = await store.list();
  const more = settleTaint(entries);
  if (more.length) {
    try {
      await store.add(more);
    } catch {
      /* decided on what is known now; the next decision settles again */
    }
    entries = [...entries, ...more];
  }
  return taintViewOf(entries);
}

// A file (or the bytes of a file) an earlier command downloaded, run now:
// download-and-execute (./exec-taint.ts follows unpacking, copies and digests).
async function taintRule(ctx: Ctx): Promise<Decision | null> {
  const { event, opts } = ctx;
  if (event.kind !== "shell" || !opts.taint) {
    return null;
  }
  const cmd = event.command?.text ?? "";
  const effects = taintEffects(
    cmd,
    event.command?.dialect ?? "posix",
    ctx.cwd,
    await settledTaintView(opts.taint),
  );
  const hit = effects.runs;
  if (hit) {
    return deny(
      ["download-and-execute"],
      `this command runs ${showPath(hit)}, which an earlier command of this session downloaded from the network: code from the network would run unreviewed. A person who wants it runs it. Command (quoted as the agent gave it): ${q(cmd, { max: 400 })}`,
      CAPABILITY.SPAWN_PROC,
    );
  }
  // Inline interpreter code that names a downloaded file may run it or only read it: asked.
  return effects.mayRun
    ? personOnly(
        ["download-and-execute"],
        `this command's inline code names ${showPath(effects.mayRun)}, which an earlier command of this session downloaded from the network, and could run it. Command (quoted as the agent gave it): ${q(cmd, { max: 400 })}`,
        CAPABILITY.SPAWN_PROC,
        event,
      )
    : null;
}

function decideRetrieval(ctx: Ctx): Decision {
  const { event, opts } = ctx;
  const policy = opts.policy;
  if (event.kind === "search") {
    // The query goes to the host's own search provider, not a host the agent chooses.
    return allow(["read-only-retrieval"], "read-only retrieval", CAPABILITY.NET_EGRESS);
  }
  const host = hostOf(event.url);
  if (host !== null && policy.allowedHosts.has(host)) {
    return allow(
      ["read-only-retrieval"],
      "read-only retrieval from an allowlisted host",
      CAPABILITY.NET_EGRESS,
    );
  }
  const shown = host === null ? "(unparseable URL)" : q(host, { max: 120 });
  if (policy.enforceAllowlists || policy.allowedHosts.size > 0) {
    return deny(
      ["host-not-allowlisted"],
      `host ${shown} is not on enclawed.policy.allowedHosts`,
      CAPABILITY.NET_EGRESS,
    );
  }
  // Exactly a URL the person named in the task: the URL is the person's, so
  // the request carries nothing of the session out (./person-urls.ts). An
  // operator's enforced allowlist (above) is never widened by it.
  if (isPersonNamedUrl(event.url, opts.personUrls)) {
    return allow(
      ["read-only-retrieval", "person-named-url"],
      "read-only retrieval of a URL the person named in the task",
      CAPABILITY.NET_EGRESS,
    );
  }
  // Open flavor, no allowlist: a fetch can carry data out in its URL, and that cannot be taken back.
  return irreversible(
    ["egress-host-not-allowlisted"],
    `the request goes to host ${shown}, which is not on enclawed.policy.allowedHosts; anything in the URL leaves this machine. URL (quoted as the agent gave it): ${q(event.url, { max: 300 })}`,
    CAPABILITY.NET_EGRESS,
    event,
    policy,
  );
}

/** How much of the project one contained run may snapshot (internal bounds, not settings). */
const SNAPSHOT_MAX_FILES = 2000;
const SNAPSHOT_MAX_BYTES = 64 * 1024 * 1024;

/**
 * A byte-identical copy of `file` that this session made (its history
 * records the copy as new), that exists in the project now as its own regular
 * file (a symbolic link is not a copy) and that the same line does not
 * delete: what the deletion removes is still there. That this session made
 * it is required: identical content that was already in the project (empty
 * files, duplicated fixtures, a planted twin) is no backup anyone took, and
 * would let a planted deletion pass. Bounded walk.
 */
async function sessionCopyOf(
  ctx: Ctx,
  file: string,
  deleted: readonly string[],
): Promise<string | null> {
  let content: Buffer;
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile() || st.size > 4 * 1024 * 1024) {
      return null;
    }
    content = fs.readFileSync(file);
  } catch {
    return null;
  }
  const gone = new Set(deleted.map((d) => path.resolve(d)));
  const same: string[] = [];
  let left = 5000;
  const walk = (d: string, depth: number) => {
    let ents: fs.Dirent[] = [];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (--left < 0) {
        return;
      }
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (depth < 12 && e.name !== ".git" && e.name !== "node_modules") {
          walk(p, depth + 1);
        }
      } else if (e.isFile() && !gone.has(p) && p !== path.resolve(file)) {
        try {
          if (fs.statSync(p).size === content.length && fs.readFileSync(p).equals(content)) {
            same.push(p);
          }
        } catch {
          /* unreadable: not a copy */
        }
      }
    }
  };
  walk(ctx.opts.projectDir, 0);
  for (const p of same) {
    if (await createdThisSession(ctx, ctx.fs.realpathNearest(p))) {
      return p;
    }
  }
  // A copy this session made to a path with a part unknown at the time: its
  // record names the source, the content then and the paths it may be; the
  // copy must match all three and be a file git does not hold (one git holds
  // was there before, when nothing matched the pattern).
  const sid = ctx.event.actor.sessionId;
  if (!sid || same.length === 0) {
    return null;
  }
  const own = `${ctx.opts.host}:${sid}`;
  let entries: Awaited<ReturnType<typeof ctx.opts.history.store.list>> = [];
  try {
    entries = await ctx.opts.history.store.list();
  } catch {
    return null;
  }
  const source = ctx.fs.realpathNearest(file);
  const hash = createHash("sha256").update(content).digest("hex");
  for (const e of entries) {
    const cp = e?.copyPattern;
    if (
      !cp ||
      typeof e.agentId !== "string" ||
      !(e.agentId === own || e.agentId.startsWith(`${own}/`)) ||
      cp.source !== source ||
      cp.contentHash !== hash
    ) {
      continue;
    }
    let re: RegExp;
    try {
      re = new RegExp(cp.pattern);
    } catch {
      continue;
    }
    for (const p of same) {
      const real = ctx.fs.realpathNearest(p);
      if (re.test(real) && ctx.fs.gitTracking(real) !== "tracked") {
        return p;
      }
    }
  }
  return null;
}

/**
 * The code pins of a contained run: each file Enclawed read, with the SHA-256
 * of its content as the run will load it (the line's own earlier edit when
 * it makes one). A file that does not exist yet is not pinned: if the run
 * creates it, it does not load.
 */
export function codePinsOf(
  files: readonly string[],
  executed: readonly string[],
  overlay: ReadonlyMap<string, string> | null,
  shell: readonly string[] = [],
): ContainedCode {
  const out: {
    path: string;
    sha256: string;
    exec: boolean;
    shell?: true;
    contentBase64?: string;
  }[] = [];
  for (const f of files) {
    let content: Buffer;
    const later = overlay?.get(f);
    if (later !== undefined) {
      content = Buffer.from(later, "utf8");
    } else {
      try {
        content = fs.readFileSync(f);
      } catch {
        continue;
      }
    }
    out.push({
      path: f,
      sha256: createHash("sha256").update(content).digest("hex"),
      exec: executed.includes(f),
      // A shell script: the contained shell runs this copy, never the file as it is then.
      ...(shell.includes(f)
        ? { shell: true as const, contentBase64: content.toString("base64") }
        : {}),
    });
  }
  return { files: out };
}

/**
 * The aliases and functions of the shell the agent's commands run in
 * (EngineOptions.shellDefinitions), with the functions its environment
 * exports (the session's, else the hook's own, which the host's shell starts from).
 */
function shellDefsOf(opts: EngineOptions): ResolvedDefinitions {
  return resolveShellDefinitions(opts.shellDefinitions, opts.environment ?? process.env);
}

/** Why a line the host's shell runs may run an alias or function of that shell, or null. */
function lineShadow(text: string, d: ResolvedDefinitions, cwd: string): string | null {
  if (!d.known) {
    return d.why;
  }
  if (definesNothing(d)) {
    return null;
  }
  const p = parseCompound(text, { cwd, home: null });
  if (!p.ok) {
    return lineMayInvokeDefinition(text, d)
      ? "a word of the line may be an alias or function of the shell"
      : null;
  }
  return shadowedCommandIn(p.commands, d);
}

/**
 * Why the contained command line `text` may not reach its containment in the
 * host's shell (an alias or function in place of `exec`), or null. In bash a
 * line made by containedCommandLine goes through none of them
 * (CONTAINED_LAUNCH_PREFIX), whatever the shell defines.
 */
function launchShadow(text: string, opts: EngineOptions, cwd: string): string | null {
  if (opts.hostShell === "bash" && isContainedLaunchLine(text)) {
    return null;
  }
  return lineShadow(text, shellDefsOf(opts), cwd);
}

/**
 * A contained command reaches its containment through the host's shell
 * (CONTAINED_LAUNCH_PREFIX ...): when `exec` may be an alias or function
 * there, what runs is not the containment. Why, or null.
 */
function containmentShadow(ctx: Ctx): string | null {
  const why = launchShadow(
    containedCommandLine({ ENCLAWED_CONTAIN: "1" }, ["/bin/true"]),
    ctx.opts,
    ctx.cwd,
  );
  return why
    ? `the contained command itself would go through the shell's definitions: ${why}`
    : null;
}

/**
 * A command line that may run contained with no person: its runners read and
 * clean (./contained-exec.ts), and every project file git does not hold as
 * it is now kept in history first. Otherwise why not (for the question).
 */
async function containedDecision(
  ctx: Ctx,
  commands: readonly SimpleCommand[],
  cmd: string,
  overlay: ReadonlyMap<string, string> | null = null,
): Promise<{ decision: Decision | null; why: string | null }> {
  const { event, opts } = ctx;
  // The contained line runs under sh (dash), which reads some words differently
  // from bash (braces stay literal): read as dash, a line it reads differently is not contained.
  const asRun = parseCompound(
    cmd,
    {
      cwd: ctx.cwd,
      home: ctx.home,
      gitTop: (d: string) => ctx.fs.committedTree?.(d)?.top ?? null,
      env: opts.environment ?? null,
      readOnlyArgv: opts.hostReadOnlyCommands ?? null,
    },
    { fileRedirects: true, shell: "dash" },
  );
  if (!asRun.ok) {
    return {
      decision: null,
      why: `the contained shell (sh) reads the line differently (${asRun.code})`,
    };
  }
  const shadowed = containmentShadow(ctx);
  if (shadowed) {
    return { decision: null, why: shadowed };
  }
  const tree = ctx.fs.committedTree?.(opts.projectDir) ?? null;
  const relOf = (file: string) =>
    tree ? path.relative(tree.top, ctx.fs.realpathNearest(file)).split(path.sep).join("/") : null;
  const equalsCommitted = (file: string) => {
    // A file the line rewrites first is not what git holds.
    if (overlay?.has(ctx.fs.realpathNearest(file))) {
      return false;
    }
    const rel = relOf(file);
    if (!tree || !rel || rel.startsWith("..")) {
      return false;
    }
    try {
      return tree.blobs.get(rel) === gitBlobId(fs.readFileSync(file));
    } catch {
      return false;
    }
  };
  const v = containedExecution(
    {
      projectDir: opts.projectDir,
      home: ctx.home,
      fs: ctx.fs,
      repositoryEnv: opts.repositoryEnv ?? [],
      equalsCommitted,
      ...(overlay ? { overlay } : {}),
      environment: opts.environment ?? null,
      venvTrust: opts.venvTrust ?? null,
      // An environment not trusted (yet): trusted as it is now when a person
      // approves this call at Enclawed's prompt (preAction).
      onUntrustedVenv: (dir, fingerprint) => noteVenvToTrust(event.callId, dir, fingerprint),
    },
    commands,
  );
  if (!v.ok) {
    return { decision: null, why: v.why };
  }
  // A contained build runs code Enclawed did not read: its containment keeps
  // the protections (../containment/build-mode.ts), and Enclawed's own files
  // and the project's secrets must lie outside what it can reach.
  let buildMasks: readonly string[] = [];
  if (v.build) {
    const projectReal = ctx.fs.realpathNearest(opts.projectDir);
    const inProject = (p: string) => isInside(projectReal, ctx.fs.realpathNearest(p));
    const own =
      [...(opts.protected?.paths ?? []), ...(opts.secretPaths ?? [])].find(
        (p) => inProject(p) || isInside(ctx.fs.realpathNearest(p), projectReal),
      ) ?? (opts.protected?.prefixes ?? []).map((x) => x.dir).find(inProject);
    if (own) {
      return {
        decision: null,
        why: `Enclawed's own state or the agent CLI's secrets (${showPath(own)}) lie in the project, where a build's unread code could reach them`,
      };
    }
    const masks = projectSecretMasks(projectReal, ctx.home, ctx.fs);
    if (!masks.ok) {
      return { decision: null, why: masks.why };
    }
    buildMasks = masks.masks;
  }
  // chmod of a file that was there before the line: no history keeps a mode, so
  // only a file this session created (undoing it removes the file, mode and all).
  const modeChanges: string[] = [];
  for (const f of v.modeChanges) {
    const real = ctx.fs.realpathNearest(f);
    if (!(await createdThisSession(ctx, real))) {
      return {
        decision: null,
        why: `it changes the mode of ${showPath(f)}, which this session did not create (no history keeps a mode)`,
      };
    }
    modeChanges.push(real);
  }
  // rm: only files this session created (its history records each as new
  // when the agent wrote it), files git tracks (git keeps their committed
  // content; a changed one is in the snapshot below), and files whose content
  // the line keeps elsewhere (mv, a compressor). Anything else it deletes was
  // there before the agent, exists nowhere else, and a person decides.
  if (v.deletes.length) {
    for (const f of v.deletes) {
      if (
        !v.backedUp.includes(f) &&
        ctx.fs.gitTracking(ctx.fs.realpathNearest(f)) !== "tracked" &&
        !(await createdThisSession(ctx, ctx.fs.realpathNearest(f))) &&
        !(await sessionCopyOf(ctx, f, v.deletes))
      ) {
        return {
          decision: null,
          why: `it deletes ${showPath(f)}, which this session did not create`,
        };
      }
    }
    const del = await decideFsWrite({
      ...ctx,
      event: {
        ...event,
        kind: "fs-write",
        writes: v.deletes.map((w) => ({ path: w, op: "delete" as const })),
      },
    });
    // Each file was shown above to be this session's own or to have this
    // session's copy, so "no copy of it exists elsewhere" (untracked-overwrite)
    // does not hold; every other reason (protected, linked, execution
    // configuration, no history) still stops it. Its snapshot was kept first.
    const onlyUntracked =
      del.outcome !== "allow" &&
      (del.targets ?? []).every((t) => t.reversible) &&
      del.codes.every(
        (c) => c === "untracked-overwrite" || c.startsWith("git-") || c.startsWith("no-person:"),
      );
    if (del.outcome !== "allow" && !onlyUntracked) {
      return { decision: del, why: null };
    }
  }
  // `sed -i` is an edit of its files: decided exactly as the equivalent Edit
  // (protected, linked and exec-config files, history, untracked files).
  // A target under a component whose value is unknown (`$(date +%F)`) is
  // decided as the stand-in name nothing has, but no history names the
  // stand-in (it will never exist): what such a copy is, is recorded below.
  const patterns = opaqueOf.get(event) ?? [];
  const isOpaque = (p: string) => patterns.some((o) => p === o.standin || isInside(o.standin, p));
  if (v.writes.length) {
    const realPrepare = opts.history.prepare ?? prepareFsWriteHistory;
    const prepare: typeof realPrepare = async (params) => {
      const rest = params.targets.filter((t) => !(t.absPath && isOpaque(t.absPath)));
      const real = rest.length ? await realPrepare({ ...params, targets: rest }) : null;
      type Result = Awaited<ReturnType<typeof realPrepare>>["targets"][number];
      const targets: Result[] = [];
      for (const t of params.targets) {
        if (t.absPath && isOpaque(t.absPath)) {
          // Nothing has this name (opaqueResolved checked): a new file, no history under the stand-in.
          targets.push({
            path: t.path,
            realPath: t.absPath,
            op: t.op,
            reversible: true,
            basis: "snapshot",
            snapshot: null,
            prior: "absent",
          });
        } else {
          targets.push(
            real?.targets[rest.indexOf(t)] ?? {
              path: t.path,
              realPath: null,
              op: t.op,
              reversible: false,
              code: "unresolvable-path",
            },
          );
        }
      }
      return { reversible: targets.every((t) => t.reversible), targets };
    };
    const edit = await decideFsWrite({
      ...ctx,
      opts: { ...opts, history: { ...opts.history, prepare } },
      event: {
        ...event,
        kind: "fs-write",
        writes: v.writes.map((w) => ({ path: w, op: "edit" as const })),
      },
    });
    if (edit.outcome !== "allow") {
      return { decision: edit, why: null };
    }
    if (!v.runs) {
      return { decision: { ...edit, codes: [...edit.codes, "in-place-edit"] }, why: null };
    }
  }
  // HEAD's blobs by path relative to the project (the project may be a subdirectory).
  const projectReal = ctx.fs.realpathNearest(opts.projectDir);
  const committed = tree
    ? new Map(
        [...tree.blobs].flatMap(([rel, id]) => {
          const r = path.relative(projectReal, path.join(tree.top, rel));
          return r.startsWith("..") || path.isAbsolute(r)
            ? []
            : [[r.split(path.sep).join("/"), id]];
        }),
      )
    : null;
  const plan = projectSnapshotPlan(projectReal, committed, {
    maxFiles: SNAPSHOT_MAX_FILES,
    maxBytes: SNAPSHOT_MAX_BYTES,
    maxFileBytes: opts.policy.history.maxFileBytes,
    // A build's own output trees (a CMake build directory, cargo's target)
    // that git ignores: what git does not track in them is regenerated by
    // the build. Any other directory is snapshotted as usual.
    ...(v.build
      ? {
          regenerable: v.build.outputs
            .map((o) => ({ ...o, dir: ctx.fs.realpathNearest(o.dir) }))
            .filter((o) => ctx.fs.gitTracking(o.dir) === "ignored"),
        }
      : {}),
  });
  if (!plan.ok) {
    return { decision: null, why: `the project could not be snapshotted first: ${plan.why}` };
  }
  const outcome = await (opts.history.prepare ?? prepareFsWriteHistory)({
    tool: event.policyIds[event.policyIds.length - 1] ?? event.tool,
    targets: plan.files.map((f) => ({ path: f, absPath: f, op: "write" as const })),
    fsRoot: projectReal,
    policy: opts.policy,
    toolCallId: event.callId ?? undefined,
    agentId: historyAgentId(opts.host, event.actor),
    store: opts.history.store,
    gatewayTmpDir: null,
  });
  const lost = outcome.targets.find((t) => !t.reversible);
  if (lost) {
    return {
      decision: null,
      why: `${showPath(lost.path)} could not be snapshotted first (${"code" in lost ? lost.code : "no history"})`,
    };
  }
  // Symbolic links git does not keep: history keeps each link's own text, so a
  // run that replaces one can be undone (restore makes the link again).
  for (const l of plan.links) {
    const put = await opts.history.store.put(Buffer.from(l.target, "utf8"));
    if (!put.ok || typeof opts.history.store.record !== "function") {
      return { decision: null, why: `${showPath(l.path)} (a link) could not be snapshotted first` };
    }
    await opts.history.store.record({
      path: l.path,
      realPath: l.path,
      op: "write",
      hash: put.hash,
      size: Buffer.byteLength(l.target),
      tool: event.policyIds[event.policyIds.length - 1] ?? event.tool,
      toolCallId: event.callId ?? null,
      agentId: historyAgentId(opts.host, event.actor),
      kind: "symlink",
    });
  }
  // Each copy to a path with an unknown part: recorded as what it is (the
  // source, its content now, every real path the copy may land at), so a
  // later deletion of the source can find the copy (sessionCopyOf).
  for (const c of v.copies) {
    const o = patterns.find((x) => c.dest === x.standin || isInside(x.standin, c.dest));
    if (!o || typeof opts.history.store.record !== "function") {
      continue;
    }
    const source = ctx.fs.realpathNearest(c.source);
    let content: Buffer;
    try {
      content = fs.readFileSync(source);
    } catch {
      continue; // nothing to copy: cp fails
    }
    const rest = path.relative(o.standin, c.dest);
    const pattern = `^${o.re}${
      rest
        ? `/${rest
            .split(path.sep)
            .map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join("/")}`
        : ""
    }$`;
    await opts.history.store.record({
      path: `copy-pattern:${pattern}`,
      realPath: `copy-pattern:${pattern}`,
      op: "write",
      hash: null,
      size: content.length,
      tool: event.policyIds[event.policyIds.length - 1] ?? event.tool,
      toolCallId: event.callId ?? null,
      agentId: historyAgentId(opts.host, event.actor),
      copyPattern: {
        pattern,
        source,
        contentHash: createHash("sha256").update(content).digest("hex"),
      },
    });
  }
  if (v.build) {
    const tools = v.build.tools.join(", ");
    return {
      decision: {
        outcome: "allow",
        reason: `${REASON_PREFIX}reversible (runs as a contained build: ${tools} and the project's build scripts, which Enclawed does not read, run with the project read-write and nothing else of this machine, no network, no credentials, the project's ${buildMasks.length} secret file(s) hidden, git's files and the files that configure what runs later refused, and every process stopped when it ends; ${plan.files.length} project file(s) git does not keep were snapshotted first, build outputs are regenerated). Command (quoted as the agent gave it): ${q(cmd, { max: 300 })}`,
        codes: ["contained-build"],
        capability: CAPABILITY.SPAWN_PROC,
        reversible: true,
        contain: {
          kind: "project-script",
          label: `contained build: ${cmd.slice(0, 80)}`,
          tool: null,
          build: {
            tools: v.build.tools,
            masks: buildMasks,
            ...(modeChanges.length ? { modeChanges } : {}),
          },
        },
      },
      why: null,
    };
  }
  // The code it runs, pinned: inside the containment only these files (with
  // this content: as the line leaves them when it edits them first) load or
  // run from the project or any writable place.
  const code: ContainedCode = {
    ...codePinsOf(v.files, v.executed, overlay, v.shell),
    ...(v.stdin.length ? { stdin: v.stdin } : {}),
    ...(v.shellText.length ? { shellText: v.shellText } : {}),
    ...(v.reads.length ? { reads: v.reads } : {}),
    ...(v.gitRefWrites ? { gitRefsWritable: true as const } : {}),
    ...(modeChanges.length ? { modeChanges } : {}),
    ...(v.pythonVenv ? { pythonVenv: v.pythonVenv } : {}),
  };
  return {
    decision: {
      outcome: "allow",
      reason: `${REASON_PREFIX}reversible (runs contained: the project read-write and nothing else of this machine, no credentials, no network but declared destinations, files that configure what runs later refused, and no code from the project but the ${code.files.length} file(s) Enclawed read; ${plan.files.length} project file(s) git does not keep were snapshotted first). Command (quoted as the agent gave it): ${q(cmd, { max: 300 })}`,
      codes: ["contained-execution"],
      capability: CAPABILITY.SPAWN_PROC,
      reversible: true,
      contain: {
        kind: "project-script",
        label: `contained: ${cmd.slice(0, 80)}`,
        tool: null,
        code,
      },
    },
    why: null,
  };
}

/**
 * A line of file programs only (mkdir, touch, cp, mv, rm, chmod, ln -s,
 * truncate, sed -i, dos2unix, compressors in place, and read-only commands)
 * that reaches one of the session's scratch directories: the containment
 * cannot show those (its /tmp is its own), so it runs on the host, as it is,
 * when every effect is one Enclawed reads exactly and takes back. A file in
 * scratch keeps no history and needs none (scratch); a project file is
 * decided as the equivalent Write or deletion, exactly as a contained run
 * decides it (deleted only when git tracks it, this session made it, or the
 * line keeps its content elsewhere). Null: not such a line.
 */
async function scratchFileOps(
  ctx: Ctx,
  commands: readonly SimpleCommand[],
  cmd: string,
): Promise<Decision | null> {
  const { event, opts } = ctx;
  const scratch = opts.policy.scratchPaths;
  if (!scratch.length) {
    return null;
  }
  const v = containedExecution(
    {
      projectDir: opts.projectDir,
      home: ctx.home,
      fs: ctx.fs,
      repositoryEnv: opts.repositoryEnv ?? [],
      equalsCommitted: () => false,
      hostScratch: scratch,
    },
    commands,
  );
  if (!v.ok || !v.scratch || v.runsCode || v.files.length || v.shellText.length) {
    return null;
  }
  for (const f of v.modeChanges) {
    if (!(await createdThisSession(ctx, ctx.fs.realpathNearest(f)))) {
      return null;
    }
  }
  const inScratch = (f: string) => {
    const real = ctx.fs.realpathNearest(f);
    return scratch.some((d) => isInside(ctx.fs.realpathNearest(d), real));
  };
  for (const f of v.deletes) {
    if (
      !inScratch(f) &&
      !v.backedUp.includes(f) &&
      ctx.fs.gitTracking(ctx.fs.realpathNearest(f)) !== "tracked" &&
      !(await createdThisSession(ctx, ctx.fs.realpathNearest(f))) &&
      !(await sessionCopyOf(ctx, f, v.deletes))
    ) {
      return null;
    }
  }
  if (v.writes.length) {
    const w = await decideFsWrite({
      ...ctx,
      event: {
        ...event,
        kind: "fs-write",
        writes: v.writes.map((x) => ({ path: x, op: "edit" as const })),
      },
    });
    if (w.outcome !== "allow") {
      return w;
    }
  }
  if (v.deletes.length) {
    const del = await decideFsWrite({
      ...ctx,
      event: {
        ...event,
        kind: "fs-write",
        writes: v.deletes.map((x) => ({ path: x, op: "delete" as const })),
      },
    });
    // Each deleted project file was shown above to be git's, this session's, or
    // kept by the line: "no copy of it exists elsewhere" does not hold for it.
    const onlyUntracked =
      del.outcome !== "allow" &&
      (del.targets ?? []).every((t) => t.reversible) &&
      del.codes.every(
        (c) => c === "untracked-overwrite" || c.startsWith("git-") || c.startsWith("no-person:"),
      );
    if (del.outcome !== "allow" && !onlyUntracked) {
      return del;
    }
  }
  return allow(
    ["scratch-file-operations"],
    `file operations on the project and the session's scratch directory only, each one taken back: files in scratch keep no history and need none, project files are kept by history or git. Command (quoted as the agent gave it): ${q(cmd, { max: 300 })}`,
    CAPABILITY.FS_WRITE_REV,
  );
}

/**
 * The concrete effects a person approves, in plain words: each file a
 * command deletes, with whether anything can restore it (git keeps it,
 * or nothing does), and a git clean that deletes what git does not keep.
 */
function effectsOf(ctx: Ctx, commands: readonly SimpleCommand[]): string {
  const out: string[] = [];
  for (const c of commands) {
    const [prog, ...args] = c.argv;
    if (prog === "rm" || prog === "unlink" || prog === "rmdir") {
      const targets = args.filter((a) => !a.startsWith("-") || a === "-");
      for (const t of targets.slice(0, 6)) {
        const abs = path.resolve(c.cwd, t);
        let state: string;
        if (/[*?[]/.test(t)) {
          state = "every file the pattern matches";
        } else {
          const g = ctx.fs.gitTracking(ctx.fs.realpathNearest(abs));
          state =
            g === "tracked"
              ? "tracked: git can restore its committed content"
              : g === "ignored"
                ? "ignored by git: no history holds it, it cannot be restored"
                : g === "untracked"
                  ? "untracked: no history holds it, it cannot be restored"
                  : "not in a git repository: it cannot be restored";
        }
        out.push(`deletes ${showPath(abs)} (${state})`);
      }
    } else if (
      prog === "git" &&
      args.includes("clean") &&
      !args.some((a) => /^-[a-zA-Z]*n|^--dry-run$/.test(a))
    ) {
      out.push(
        `deletes every file git does not track${args.some((a) => /^-[a-zA-Z]*[xX]/.test(a)) ? ", ignored files included" : ""} in ${showPath(c.cwd)} (no history holds them)`,
      );
    }
  }
  return out.length ? ` Effect: ${out.join("; ")}.` : "";
}

/** The text of one simple command, for the path rules that read a command's words (files it reads or writes by redirection included). */
const commandText = (c: SimpleCommand) =>
  [...c.argv, ...(c.reads ?? []), ...(c.writes ?? []).map((w) => w.path)].join(" ");

// What `find -exec` may run and still show no file's content.
const NAMES_ONLY = new Set(["ls", "stat", "du", "wc", "file"]);

/**
 * A simple command that shows no file's content: it lists names (ls, stat, a
 * read-only find) or counts (wc prints numbers only, unless it reads names from a file).
 */
function listsNamesOnly(c: SimpleCommand): boolean {
  const prog = c.argv[0];
  if (c.reads?.length || c.stdin) {
    return false;
  }
  // find -exec CMD: names only when CMD shows no content (grep -l/-L prints only names).
  const execs = c.argv.flatMap((a, k) => {
    if (prog !== "find" || (a !== "-exec" && a !== "-execdir")) {
      return [];
    }
    const end = c.argv.findIndex((x, j) => j > k && (x === ";" || x === "+"));
    const sub = c.argv.slice(k + 1, end < 0 ? undefined : end);
    return [grepListsNames(sub) ? "ls" : (sub[0] ?? "")];
  });
  return (
    prog === "ls" ||
    prog === "stat" ||
    // Names, paths and file-system sizes: no file's content (realpath, readlink,
    // basename, dirname print path strings; df prints a file system's usage).
    (["realpath", "readlink", "basename", "dirname", "df", "pwd"].includes(prog ?? "") &&
      classifyArgv(c.argv).readOnly) ||
    // tree lists names (--fromfile reads names from a file's content: not here).
    (prog === "tree" &&
      classifyArgv(c.argv).readOnly &&
      !c.argv.some((a) => a.startsWith("--fr") || a === "--fromfile")) ||
    // du prints sizes and names (--files0-from reads names from a file's content).
    (prog === "du" &&
      classifyArgv(c.argv).readOnly &&
      !c.argv.some((a) => a.startsWith("--files0") || a.startsWith("--f"))) ||
    // test and [ only report whether a file exists or what kind it is.
    prog === "test" ||
    prog === "[" ||
    (prog === "find" && classifyArgv(c.argv).readOnly && execs.every((x) => NAMES_ONLY.has(x))) ||
    // --files0-from reads a file's content as names, and an error message would print them.
    (prog === "wc" &&
      classifyArgv(c.argv).readOnly &&
      !c.argv.some((a) => a.startsWith("--files0") || a.startsWith("--f")))
  );
}

/**
 * `grep` that prints only the names of the files it reads (-l / -L, or
 * --files-with-matches / --files-without-match), never a line of them.
 */
function grepListsNames(argv: readonly string[]): boolean {
  if (argv[0] !== "grep") {
    return false;
  }
  let lists = false;
  for (const a of argv.slice(1)) {
    if (a === "--") {
      break;
    }
    if (a === "--files-with-matches" || a === "--files-without-match") {
      lists = true;
    } else if (/^-[A-Za-z]/.test(a) && !a.startsWith("--")) {
      // Letters up to one that takes a value (the rest of the word is that value).
      for (const ch of a.slice(1)) {
        if ("efmABCdD".includes(ch)) {
          break;
        }
        if (ch === "l" || ch === "L") {
          lists = true;
        }
      }
    }
  }
  return lists;
}

// File tests of test / [ (existence, type, size, permissions): metadata only.
const FILE_TEST_OP = /^-[bcdefgGhkLNOprsSuwx]$/;

/**
 * A simple command that shows no file's content although its words may name
 * one: echo and printf print their own words (a printf format is a word, not
 * a file), du prints sizes, test / [ with file tests only report metadata, and a names-only
 * view of an environment file (./credentials.ts printsNamesOnly).
 */
function showsNoContent(c: SimpleCommand, cwd: string): boolean {
  const [prog, ...args] = c.argv;
  if (prog === "echo" || prog === "printf" || prog === "true") {
    return true;
  }
  // du prints sizes and names; --files0-from reads names from a file (an error would print them).
  if (prog === "du") {
    return !args.some((a) => a.startsWith("--files0") || a.startsWith("--f"));
  }
  if (prog === "test" || prog === "[") {
    const ops = prog === "[" ? args.slice(0, -1) : args;
    if (prog === "[" && args[args.length - 1] !== "]") {
      return false;
    }
    // Only unary file tests, combined with ! -a -o: no operator that reads content.
    for (let i = 0; i < ops.length; i++) {
      const a = ops[i];
      if (a === "!" || a === "-a" || a === "-o") {
        continue;
      }
      if (FILE_TEST_OP.test(a) && i + 1 < ops.length) {
        i++;
        continue;
      }
      return false;
    }
    return true;
  }
  return printsNamesOnly(c.argv, cwd);
}

const FILESET_MAX = 4000;

/** A shell glob (*, ?, [...]) against one name. */
function globMatch(glob: string, name: string): boolean {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      re += ".*";
    } else if (c === "?") {
      re += ".";
    } else if (c === "[") {
      const end = glob.indexOf("]", i + 2);
      if (end < 0) {
        re += "\\[";
        continue;
      }
      re += `[${glob
        .slice(i + 1, end)
        .replace(/^!/, "^")
        .replace(/\\/g, "\\\\")}]`;
      i = end;
    } else {
      re += c.replace(/[.+^${}()|\\]/g, "\\$&");
    }
  }
  try {
    return new RegExp(`^${re}$`, "s").test(name);
  } catch {
    // A class the engine cannot compile: counted as a match (the file is checked).
    return true;
  }
}

/** Every entry below the roots (links to folders not followed), or null past the bound or at a folder it cannot read. */
function filesetEntries(roots: readonly string[]): string[] | null {
  const out: string[] = [];
  const stack = [...roots];
  while (stack.length) {
    const p = stack.pop() as string;
    let st: fs.Stats;
    try {
      st = fs.lstatSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      try {
        for (const n of fs.readdirSync(p)) {
          stack.push(path.join(p, n));
        }
      } catch {
        return null;
      }
    } else {
      out.push(p);
    }
    if (out.length + stack.length > FILESET_MAX) {
      return null;
    }
  }
  return out;
}

/**
 * The files a listing may give a command (shell-compound Fileset): each is
 * checked as if named (a credential by name or content, Enclawed's or the
 * agent CLI's secrets, a file changed outside the agent). A hit, or why they
 * could not all be checked; null when every one is clear.
 */
/** May the find of this fileset print `file` (as find prints it: a start word joined with the path below it)? */
function findListsFile(f: Fileset, file: string): boolean {
  const spec = f.find;
  if (!spec) {
    return true;
  }
  let type: "f" | "d" | "l" = "f";
  try {
    const st = fs.lstatSync(file);
    type = st.isSymbolicLink() ? "l" : st.isDirectory() ? "d" : "f";
  } catch {
    return true;
  }
  let matched = false;
  for (const b of f.bases) {
    for (const s of spec.starts) {
      const root = path.resolve(b, s);
      if (!(file === root || isInside(root, file))) {
        continue;
      }
      matched = true;
      const rel = path.relative(root, file).split(path.sep).join("/");
      const printed = rel ? `${s.replace(/\/+$/, "")}/${rel}` : s;
      if (findMayPrint(spec.expr, { printed, base: path.basename(file), type })) {
        return true;
      }
    }
  }
  return !matched;
}

function filesetCheck(
  ctx: Ctx,
  c: SimpleCommand,
): { cred: Readonly<{ path: string; what: string }> | null; why: string } | null {
  const ledger = ctx.opts.fileIntegrity ?? null;
  const changed = ledger ? ledger.changes() : null;
  for (const f of c.filesets ?? []) {
    // The names are relative to where the listing ran; read where it may have run, they stay under its roots.
    if (!c.cwds.every((d) => f.bases.includes(d))) {
      return { cred: null, why: "it reads names listed in another directory" };
    }
    const files = filesetEntries(f.roots);
    if (!files) {
      return { cred: null, why: `${f.source} may list more files than Enclawed checks` };
    }
    for (const file of files) {
      const root = f.roots.find((r) => isInside(r, file)) ?? f.roots[0];
      const rel = path.relative(root, file);
      // grep --include: a file found below a root whose name matches none is not listed.
      if (f.include && file !== root && !f.include.some((g) => globMatch(g, path.basename(file)))) {
        continue;
      }
      // find: a file its expression can never print is not listed (./find-expr.ts).
      if (f.find && !findListsFile(f, file)) {
        continue;
      }
      // git ls-files lists the index: never .git itself, never an untracked or ignored file.
      if (f.source === "git ls-files") {
        if (rel.split(path.sep).includes(".git")) {
          continue;
        }
        const t = ctx.fs.gitTracking(file);
        if (t === "untracked" || t === "ignored") {
          continue;
        }
      }
      // A name the shell would split or expand is not the file listed.
      if (/[\s*?[\]\\]/.test(rel)) {
        return { cred: null, why: `a name the shell would split or expand (${rel})` };
      }
      const hit = readReachesCredential(ctx.fs, file, ctx.home, false);
      if (hit) {
        return { cred: hit, why: "" };
      }
      const real = ctx.fs.realpathNearest(file);
      if ((ctx.opts.secretPaths ?? []).some((x) => isInside(x, file) || isInside(x, real))) {
        return { cred: { path: file, what: "secrets of Enclawed or of the agent CLI" }, why: "" };
      }
      const r = ledger ? (ledger.relOf(file) ?? ledger.relOf(real)) : null;
      if (changed && r !== null && changed[r]) {
        return { cred: null, why: `${rel} changed outside the agent` };
      }
    }
  }
  return null;
}

/**
 * A path component with an unknown value, as the line was decided: the stand-in
 * path it was decided as (`standin`, absolute) and every real path it may be
 * (`re`, a regular expression source over the real path up to that component).
 */
type OpaquePattern = Readonly<{ standin: string; re: string }>;

/** The opaque components of the line an event's shell command was decided with (decideShell). */
const opaqueOf = new WeakMap<PreActionEvent, readonly OpaquePattern[]>();

/**
 * Commands that name a path component with an unknown value from a fixed alphabet
 * (shell-compound OPAQUE: digits and . _ : -), resolved to one concrete name.
 * Exact when no entry of that component's directory could be the component: the
 * unknown name is then, like the stand-in, a name nothing has, so every rule
 * (new file, history, what a write may overwrite, what a read shows) decides
 * the same. Null: no such component; not ok: an existing entry could be it.
 */
function opaqueResolved(
  commands: readonly SimpleCommand[],
):
  | { ok: true; commands: SimpleCommand[]; patterns: OpaquePattern[] }
  | { ok: false; why: string }
  | null {
  const has = (x: string) => x.includes(OPAQUE) || x.includes(OPAQUE_HEX);
  const strings = (c: SimpleCommand) => [
    ...c.argv,
    ...(c.reads ?? []),
    ...(c.writes ?? []).map((w) => w.path),
    ...c.assigns.map((a) => a.value),
    c.cwd,
    ...c.cwds,
    ...(c.filesets ?? []).flatMap((f) => [...f.roots, ...f.bases]),
  ];
  if (!commands.some((c) => strings(c).some(has))) {
    return null;
  }
  const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns: OpaquePattern[] = [];
  for (const c of commands) {
    for (const x of strings(c)) {
      if (!has(x)) {
        continue;
      }
      const parts = x.split("/");
      const at = parts.findIndex(has);
      const name = parts[at];
      // The component: its literal text around the unknown runs, as a pattern of every name it may be.
      const re = new RegExp(
        `^${name
          .split(OPAQUE)
          .map((piece) => piece.split(OPAQUE_HEX).map(escape).join("[0-9a-f]+"))
          .join("[0-9._:-]+")}$`,
      );
      const dirs = path.isAbsolute(x)
        ? [parts.slice(0, at).join("/") || "/"]
        : c.cwds.map((d) => path.resolve(d, parts.slice(0, at).join("/") || "."));
      for (const dir of dirs) {
        const standin = path.join(dir, name.split(OPAQUE).join("0").split(OPAQUE_HEX).join("0"));
        patterns.push({ standin, re: `${escape(dir)}/${re.source.slice(1, -1)}` });
      }
      for (const dir of dirs) {
        let entries: string[] = [];
        try {
          entries = fs.readdirSync(dir);
        } catch {
          continue; // no such directory (or not one): nothing there could be it
        }
        const hit = entries.find((e) => re.test(e));
        if (hit) {
          return { ok: false, why: `${path.join(dir, hit)} could be it` };
        }
      }
    }
  }
  const sub = (x: string) => x.split(OPAQUE).join("0").split(OPAQUE_HEX).join("0");
  return {
    ok: true,
    patterns,
    commands: commands.map((c) => ({
      ...c,
      argv: c.argv.map(sub),
      assigns: c.assigns.map((a) => ({ ...a, value: sub(a.value) })),
      cwd: sub(c.cwd),
      cwds: c.cwds.map(sub),
      ...(c.reads ? { reads: c.reads.map(sub) } : {}),
      ...(c.writes ? { writes: c.writes.map((w) => ({ ...w, path: sub(w.path) })) } : {}),
      ...(c.filesets
        ? {
            filesets: c.filesets.map((f) => ({
              ...f,
              roots: f.roots.map(sub),
              bases: f.bases.map(sub),
            })),
          }
        : {}),
    })),
  };
}

/** Whether a command reads or writes a file by redirection, or reads a here-document. */
/**
 * A line whose gh commands are inert (./gh-cli.ts: no credentials, a read
 * verb) and whose other commands are on the strict read-only allowlist, with
 * no assignment, no redirection and every git command starting no program the
 * repository configures: read-only. Null otherwise.
 */
function ghInertLine(ctx: Ctx, commands: readonly SimpleCommand[]): Decision | null {
  if (!commands.some((c) => c.argv[0] === "gh")) {
    return null;
  }
  for (const c of commands) {
    if (c.assigns.length || hasFileRedirect(c)) {
      return null;
    }
    if (c.argv[0] === "gh") {
      const v = ghInert(c.argv, {
        environment: ctx.opts.environment,
        projectDir: ctx.opts.projectDir,
        home: ctx.home,
      });
      if (!v.ok) {
        return null;
      }
      continue;
    }
    if (c.argv[0] === "cd") {
      continue;
    }
    const v = classifyArgv(c.argv);
    if (!v.readOnly) {
      return null;
    }
    if (c.argv[0] === "git") {
      if (
        c.argv.includes("-C") ||
        c.argv.some((a) => a.startsWith("--git-dir") || a.startsWith("--work-tree"))
      ) {
        return null;
      }
      let at = 1;
      while (at < c.argv.length && c.argv[at].startsWith("-")) {
        at += c.argv[at] === "-C" ? 2 : 1;
      }
      for (const d of c.cwds) {
        const programs = ctx.fs.gitPrograms?.(d, ctx.opts.environment) ?? null;
        if (
          !programs ||
          gitCommandStarts(
            { sub: c.argv[at] ?? "", args: c.argv.slice(at + 1), global: c.argv.slice(1, at) },
            programs,
          )
        ) {
          return null;
        }
      }
    }
  }
  return allow(
    ["read-only-command"],
    "read-only command: gh holds no credentials in this session (no token variable, no config directory), so it stops before any request; nothing is read from GitHub or sent",
    CAPABILITY.FS_READ,
  );
}

/**
 * A line of `git fetch` commands (each from a configured https remote that
 * starts nothing: gitFetchRefusal) and read-only commands (git ones checked
 * against what the repository makes them start), or null.
 */
function gitFetchLine(ctx: Ctx, commands: readonly SimpleCommand[]): Decision | null {
  const { opts } = ctx;
  const isFetch = (c: SimpleCommand) => {
    if (c.argv[0] !== "git") {
      return false;
    }
    let at = 1;
    while (at < c.argv.length && c.argv[at].startsWith("-")) {
      at += c.argv[at] === "-C" ? 2 : 1;
    }
    return c.argv[at] === "fetch";
  };
  if (!commands.some(isFetch)) {
    return null;
  }
  const policy = opts.policy;
  const allowedHosts =
    policy.enforceAllowlists || policy.allowedHosts.size > 0 ? policy.allowedHosts : null;
  const fsp = ctx.fs;
  const env = opts.environment ?? null;
  for (const c of commands) {
    if (c.assigns.length || hasFileRedirect(c)) {
      return null;
    }
    if (c.argv[0] === "cd") {
      continue;
    }
    if (isFetch(c)) {
      for (const d of c.cwds) {
        const why = gitFetchRefusal(c.argv.slice(1), d, {
          projectDir: opts.projectDir,
          realpathNearest: (p) => fsp.realpathNearest(p),
          environment: env,
          configOf:
            fsp.gitConfigEntries && env ? (g) => fsp.gitConfigEntries?.(g, env) ?? null : null,
          allowedHosts,
        });
        if (why) {
          return null;
        }
      }
      continue;
    }
    const v = classifyArgv(c.argv);
    if (!v.readOnly) {
      return null;
    }
    if (v.git || v.gitImplicit) {
      const g = v.git;
      let at = 1;
      while (at < c.argv.length && c.argv[at].startsWith("-")) {
        at += c.argv[at] === "-C" ? 2 : 1;
      }
      const call = g
        ? { sub: g.sub, args: c.argv.slice(at + 1), global: c.argv.slice(1, at) }
        : (v.gitImplicit as { sub: string; args: readonly string[]; global: readonly string[] });
      for (const d of c.cwds) {
        const programs =
          ctx.fs.gitPrograms?.(
            (g?.cdirs ?? []).reduce((acc, x) => path.resolve(acc, x), d),
            opts.environment,
          ) ?? null;
        if (!programs || gitCommandStarts(call, programs)) {
          return null;
        }
      }
    }
  }
  return allow(
    ["git-fetch-configured-remote"],
    "git fetch from the repository's configured https remote: it adds objects and updates remote-tracking refs (kept in their reflog), and nothing in the session's environment or git configuration makes it start a program or reach another host",
    CAPABILITY.NET_EGRESS,
  );
}

function hasFileRedirect(c: SimpleCommand): boolean {
  return Boolean(c.writes?.length || c.reads?.length || (c.stdin ?? null) !== null);
}

/**
 * A runner whose program comes from its standard input (`python3 <<'EOF'`,
 * `python3 -I - ARGS <<'PY'`, `node <<EOF`, `bash < run.sh`), as the same run
 * with the program named (`python3 -I -c CODE ARGS`, `node -e CODE`, `bash
 * run.sh`), so containment reads the code that runs. A runner whose program is
 * named already reads its input as data: unchanged, input dropped. Any other
 * program fed a file keeps it (containment checks it); fed a here-document: null.
 */
function codeFromInput(c: SimpleCommand): SimpleCommand | null {
  const stdin = c.stdin ?? null;
  const file = c.reads?.length === 1 ? c.reads[0] : null;
  if (stdin === null && (c.reads?.length ?? 0) === 0) {
    return c;
  }
  if ((c.reads?.length ?? 0) > 1 || (stdin !== null && file !== null)) {
    return null;
  }
  const prog = path.basename(c.argv[0] ?? "");
  const named = (argv: readonly string[]): SimpleCommand => ({
    ...c,
    argv,
    reads: [],
    stdin: null,
  });
  if (/^python(?:3(?:\.\d+)?)?$/.test(prog)) {
    let i = 1;
    while (i < c.argv.length && /^-[IuBEsSqOb]+$/.test(c.argv[i])) {
      i++;
    }
    const at = c.argv[i];
    if (at !== undefined && at !== "-") {
      // A script, -c or -m: the program is named; the input is data.
      return named(c.argv);
    }
    // A here-document stays the program on standard input: containment reads it
    // there and pins its digest (the python guard runs only that text). A file fed
    // as input (`python3 < script.py`) is not decided here: the line asks.
    return stdin !== null ? { ...c, reads: [] } : null;
  }
  if (prog === "node") {
    if (c.argv.length > 1 && c.argv[1] !== "-") {
      return c.argv[1].startsWith("-") && c.argv[1] !== "-e" && c.argv[1] !== "-p"
        ? null
        : named(c.argv);
    }
    if (c.argv.length > 2) {
      return null;
    }
    return stdin !== null ? named(["node", "-e", stdin]) : named(["node", file as string]);
  }
  if (prog === "sh" || prog === "bash" || prog === "dash") {
    if (c.argv.length > 2 || (c.argv.length === 2 && c.argv[1] !== "-s")) {
      return c.argv.length >= 2 && !c.argv[1].startsWith("-") ? named(c.argv) : null;
    }
    return stdin !== null ? named([c.argv[0], "-c", stdin]) : named([c.argv[0], file as string]);
  }
  // Any other program fed a file (`zlib-flate -uncompress < OBJ`): kept, with the file it
  // reads; containment reads that file as any read, and refuses a program that would take
  // it as code (./contained-exec.ts). A here-document fed to it: not decided here.
  return stdin === null ? c : null;
}

/** The here-document a python run reads its program from (`python3 - <<'EOF'`), or null. */
function pythonHereDoc(c: SimpleCommand): string | null {
  if (
    typeof c.stdin !== "string" ||
    !/^python(?:3(?:\.\d+)?)?$/.test(path.basename(c.argv[0] ?? ""))
  ) {
    return null;
  }
  let i = 1;
  while (i < c.argv.length && /^-[IuBEsSqOb]+$/.test(c.argv[i])) {
    i++;
  }
  return c.argv[i] === undefined || c.argv[i] === "-" ? c.stdin : null;
}

/** What a command writes to its output, when the line itself says it (echo, printf without conversions, cat of a here-document). */
function knownOutput(c: SimpleCommand): string | null {
  if (c.unknownArgs || c.reads?.length) {
    return null;
  }
  const [prog, ...args] = c.argv;
  if (prog === "echo") {
    const n = args[0] === "-n";
    const words = n ? args.slice(1) : args;
    // A backslash: zsh's echo turns escapes into other characters, bash's does not.
    if (words.some((w) => /^-[neE]+$/.test(w) || w.includes("\\"))) {
      return null;
    }
    return words.join(" ") + (n ? "" : "\n");
  }
  // printf with no conversion and only the escapes \n, \t and \\ (any other one: not computed here).
  if (
    prog === "printf" &&
    args.length === 1 &&
    !/%(?!%)/.test(args[0].replace(/%%/g, "")) &&
    !/\\[^nt\\]/.test(args[0].replace(/\\\\/g, ""))
  ) {
    return args[0]
      .replace(/\\(.)/g, (_m, ch: string) =>
        ch === "n" ? "\n" : ch === "t" ? "\t" : ch === "\\" ? "\\" : `\\${ch}`,
      )
      .replace(/%%/g, "%");
  }
  if (prog === "cat" && args.length === 0 && typeof c.stdin === "string") {
    return c.stdin;
  }
  return null;
}

/**
 * The content each existing file holds once the line's writes ran (real path
 * -> content), in order; null when a write's content is unknown or it creates
 * a file (a new file could be imported or found where containment does not look).
 */
function writtenContent(ctx: Ctx, commands: readonly SimpleCommand[]): Map<string, string> | null {
  const out = new Map<string, string>();
  const project = ctx.fs.realpathNearest(ctx.opts.projectDir);
  for (const c of commands) {
    if (!c.writes?.length) {
      continue;
    }
    const text = knownOutput(c);
    for (const w of c.writes) {
      for (const d of c.cwds) {
        for (const f of expandGlob(d, expandHome(w.path, ctx.home))) {
          const real = ctx.fs.realpathNearest(path.resolve(d, f));
          // Outside the project containment reads no code (it refuses to run a file
          // there): what the line leaves there is never read as a program.
          if (!isInside(project, real)) {
            continue;
          }
          // What a command writes to standard error is not its known output.
          if (text === null || w.stream === "err" || c.cwds.length !== 1) {
            return null;
          }
          let before: string;
          try {
            before = out.get(real) ?? fs.readFileSync(real, "utf8");
          } catch {
            return null;
          }
          out.set(real, w.append ? before + text : text);
        }
      }
    }
  }
  return out;
}

/**
 * A line with redirections to or from files or here-documents. Every file it
 * writes, in each directory its command may run in, is decided exactly as the
 * equivalent Write (protected, linked and exec-config files, history,
 * untracked files). What a read-only command reads by redirection is data;
 * what a runner reads is its program (codeFromInput). Then the rest of the
 * line must be read-only, or run contained. Null: the ordinary rule decides.
 */
async function decideRedirects(
  ctx: Ctx,
  commands: readonly SimpleCommand[],
  cmd: string,
): Promise<Decision | null> {
  const { event, opts } = ctx;
  const targets: { path: string; op: "write" | "edit" }[] = [];
  const prepared: SimpleCommand[] = [];
  let runs = false;
  for (const c of commands) {
    // `tee [-a] FILE...`: copies its input to the files and prints it, a write of each file.
    const teeFiles = c.assigns.length === 0 ? teeTargets(c.argv) : null;
    if (teeFiles) {
      for (const d of c.cwds) {
        for (const f of teeFiles.files) {
          targets.push({
            path: path.resolve(d, expandHome(f, ctx.home)),
            op: teeFiles.append ? "edit" : "write",
          });
        }
      }
    }
    const ro =
      c.argv[0] === "cd" ||
      Boolean(teeFiles) ||
      (c.assigns.length === 0 && classifyArgv(c.argv).readOnly);
    if (teeFiles && (c.writes?.length || c.reads?.length)) {
      return null;
    }
    let x: SimpleCommand | null = c;
    if (!ro) {
      // Its input could be the code it runs: run with that code named, or not decided here.
      x = codeFromInput(c);
      if (!x) {
        return null;
      }
      runs = true;
    } else if (c.argv[0] === "git") {
      // A git command's repository may start programs: the line then runs
      // contained, where ./contained-exec.ts checks what git would start.
      runs = true;
    }
    for (const w of c.writes ?? []) {
      for (const d of c.cwds) {
        // A loop over a pattern binds its variable to the pattern: every file it matches is written.
        for (const f of expandGlob(d, expandHome(w.path, ctx.home))) {
          targets.push({ path: path.resolve(d, f), op: w.append ? "edit" : "write" });
        }
      }
    }
    prepared.push({
      ...x,
      writes: [],
      reads: ro ? [] : (x.reads ?? []),
      stdin: ro ? null : pythonHereDoc(x),
    });
  }
  let edit: Decision | null = null;
  if (targets.length) {
    edit = await decideFsWrite({
      ...ctx,
      event: { ...event, kind: "fs-write", writes: targets },
    });
    if (edit.outcome !== "allow") {
      return edit;
    }
  }
  if (!runs) {
    if (!edit) {
      return null;
    }
    // Every target new when decided, each by a plain `>`/`>>` (tee opens its files
    // itself, `>|` overrides noclobber): the host's shell creates them exclusively.
    const allNew =
      // (A redirection to the console is left out: noclobber refuses `>` to an output
      // the host captured into a regular file.)
      commands.every(
        (c) =>
          !teeTargets(c.argv) &&
          !c.redirects.some((r) => /^(?:\d|&)?>\||\/dev\/(?:stdout|stderr|fd\/)/.test(r.text)),
      ) && (edit.targets ?? []).every((t) => t.reversible && "prior" in t && t.prior === "absent");
    return {
      ...edit,
      codes: [...edit.codes, "redirect-write"],
      ...(allNew ? { exclusiveCreate: true as const } : {}),
    };
  }
  // tee is not a program the containment reads: a line that also runs something is not decided here.
  if (!opts.containScripts || commands.some((c) => teeTargets(c.argv))) {
    return null;
  }
  // Files the line writes and then runs or imports: containment reads them as
  // the line leaves them (their written content known: echo, printf, a
  // here-document; existing files only), else not decided here.
  const overlay = targets.length ? writtenContent(ctx, commands) : new Map<string, string>();
  if (!overlay) {
    return null;
  }
  // What else runs: contained.
  const c = await containedDecision(ctx, prepared, cmd, overlay);
  return c.decision?.outcome === "allow"
    ? {
        ...c.decision,
        codes: [...c.decision.codes, ...(edit ? (["redirect-write"] as const) : [])],
      }
    : null;
}

/** Poppler/mutool word options: flags, and options that take the next word. */
function wordOptions(
  args: readonly string[],
  flags: string,
  vals: string,
): { pos: string[]; opts: Map<string, string | true> } | null {
  const f = new Set(flags.split(" "));
  const v = new Set(vals.split(" "));
  const pos: string[] = [];
  const opts = new Map<string, string | true>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("-") && a !== "-") {
      if (f.has(a)) {
        opts.set(a, true);
      } else if (v.has(a) && i + 1 < args.length) {
        opts.set(a, args[++i]);
      } else {
        return null;
      }
    } else {
      pos.push(a);
    }
  }
  return { pos, opts };
}

/**
 * Programs that read their input files and write named output files, nothing
 * else (no program started, no code run): the files they write, decided as the
 * equivalent Write. pdftotext IN [OUT] (OUT defaults to IN with .txt; `-` is
 * standard output, no write); pdftoppm -singlefile IN PREFIX (PREFIX.EXT; without
 * -singlefile it numbers pages: not decided here); mutool draw|convert -o OUT
 * (one file: an OUT with %d numbers pages, not here). Any other option asks.
 */
function documentOutputs(argv: readonly string[]): { files: string[]; append: boolean } | null {
  const [prog, ...args] = argv;
  if (prog === "pdftotext") {
    const r = wordOptions(
      args,
      "-layout -raw -nodiag -htmlmeta -tsv -nopgbrk -bbox -bbox-layout -cropbox -q",
      "-f -l -r -x -y -W -H -fixed -enc -eol -colspacing -opw -upw",
    );
    if (!r || r.pos.length < 1 || r.pos.length > 2 || r.pos[0] === "-") {
      return null;
    }
    const out =
      r.pos[1] ??
      `${r.pos[0].replace(/\.pdf$/i, "")}.${r.opts.has("-htmlmeta") || r.opts.has("-bbox") || r.opts.has("-bbox-layout") ? "html" : r.opts.has("-tsv") ? "tsv" : "txt"}`;
    return out === "-" ? { files: [], append: false } : { files: [out], append: false };
  }
  if (prog === "pdftoppm") {
    const r = wordOptions(
      args,
      "-singlefile -cropbox -hide-annotations -mono -gray -png -jpeg -tiff -q",
      "-f -l -r -rx -ry -scale-to -scale-to-x -scale-to-y -x -y -W -H -aa -aaVector -opw -upw",
    );
    if (!r || !r.opts.has("-singlefile") || r.pos.length !== 2 || r.pos.includes("-")) {
      return null;
    }
    const ext = r.opts.has("-png")
      ? "png"
      : r.opts.has("-jpeg")
        ? "jpg"
        : r.opts.has("-tiff")
          ? "tif"
          : r.opts.has("-mono")
            ? "pbm"
            : r.opts.has("-gray")
              ? "pgm"
              : "ppm";
    return { files: [`${r.pos[1]}.${ext}`], append: false };
  }
  if (prog === "mutool" && (args[0] === "draw" || args[0] === "convert")) {
    const r = wordOptions(args.slice(1), "-q -A", "-o -F -r -w -h -p -c -R");
    const out = r?.opts.get("-o");
    if (!r || typeof out !== "string" || /%/.test(out) || out === "-" || r.pos.length < 1) {
      return null;
    }
    return { files: [out], append: false };
  }
  return null;
}

/**
 * The files `tee` writes, when its words are only -a/--append and file names
 * (no `-`, which GNU tee reads as standard output, no other option), or null;
 * and the files a document converter writes (documentOutputs).
 */
function teeTargets(argv: readonly string[]): { files: string[]; append: boolean } | null {
  if (argv[0] !== "tee") {
    return documentOutputs(argv);
  }
  let append = false;
  const files: string[] = [];
  let opts = true;
  for (const a of argv.slice(1)) {
    if (opts && a === "--") {
      opts = false;
    } else if (opts && (a === "-a" || a === "--append")) {
      append = true;
    } else if (a === "-" || (opts && a.startsWith("-")) || a === "" || /[*?[]/.test(a)) {
      return null;
    } else {
      files.push(a);
    }
  }
  return files.length ? { files, append } : null;
}

/**
 * Nothing on the line before `c` can create a file: every earlier simple
 * command is read-only by the strict allowlist (git excluded: a repository
 * can make it run programs) and writes no file by redirection. A credential
 * path `c` names that does not exist then shows nothing when `c` runs.
 */
function createsNoFileBefore(
  ctx: Ctx,
  commands: readonly SimpleCommand[],
  c: SimpleCommand,
): boolean {
  for (const x of commands) {
    if (x === c) {
      return !(c.writes?.length ?? 0) && !c.filesets?.length;
    }
    if (
      x.writes?.length ||
      !classifyArgv(x.argv).readOnly ||
      shadowOf(x, shellDefsOf(ctx.opts)) !== null
    ) {
      return false;
    }
    // A read-only git command creates nothing unless the repository makes it start a program.
    if (x.argv[0] === "git") {
      const v = strictShellClassifier.classify(commandText(x), "posix", {
        cwd: x.cwd,
        home: ctx.home,
      });
      const probe = ctx.fs;
      const programsOf = probe.gitPrograms
        ? (d: string) => probe.gitPrograms?.(d, ctx.opts.environment) ?? null
        : null;
      if (
        !v.readOnly ||
        !programsOf ||
        x.cwds.length !== 1 ||
        (v.gits ?? []).some((g) => {
          const programs = programsOf(g.cwd);
          return !programs || gitCommandStarts(g, programs) !== null;
        })
      ) {
        return false;
      }
    }
  }
  return false;
}

/** The first hit of `check` over every simple command, in every directory it may run in. */
function perCommand<T>(
  commands: readonly SimpleCommand[],
  check: (c: SimpleCommand, cwd: string) => T | null,
): T | null {
  for (const c of commands) {
    for (const d of c.cwds) {
      const hit = check(c, d);
      if (hit) {
        return hit;
      }
    }
  }
  return null;
}

// A redirection that writes no file: a descriptor duplicated, or /dev/null.
const NO_FILE_REDIRECT =
  /^(?:\d*|&)>>?(?:&\d+|\/dev\/(?:null|stdout|stderr|fd\/[12]))$|^\d*<\/dev\/null$/;

/**
 * A command line that is a plain GET of a URL the person named in the task
 * (./person-urls.ts personNamedGet: curl, or wget with -O; or python -I -c
 * code whose one reach is urlopen of that literal URL, ./pure-code.ts) and otherwise
 * only commands that change nothing that was there:
 *   - read-only commands (the strict allowlist; git, whose repository may
 *     start programs, excluded), and filters that only read their input and
 *     print (tr; sed substituting or printing; python -c code that is a pure
 *     filter, ./pure-code.ts);
 *   - `mkdir` of directories in the system's temporary directory;
 * with no assignment, no input redirected from a file or a here-document, and
 * every file written (the GET's output file, a `>` redirection) a new file in
 * the system's temporary directory outside the home, the project and the
 * secrets. Only echo and printf may take an unknown value ($?). Also allowed:
 * `cat` of a here-document into such a new file, and python whose code is a
 * pure filter that opens for reading only files this line wrote before it
 * (./pure-code.ts pythonIsPureReader). "get": the line has a GET (open flavor
 * only: an operator's enforced allowlist is never widened); "scratch": no GET,
 * and it writes at least one new temp file; null: the ordinary rules decide.
 */
function personNamedFetchLine(
  ctx: Ctx,
  commands: readonly SimpleCommand[],
): "get" | "scratch" | null {
  const { opts } = ctx;
  const secrets = opts.secretPaths ?? [];
  const newFile = (file: string, cwd: string) => {
    const abs = path.resolve(cwd, expandHome(file, ctx.home));
    return newTempFile(ctx, abs, ctx.fs.realpathNearest(abs), secrets);
  };
  // Files this line writes: each must be new, and written once.
  const written = new Set<string>();
  const writeOnce = (file: string, cwd: string) => {
    const abs = path.resolve(cwd, expandHome(file, ctx.home));
    if (written.has(abs) || !newFile(file, cwd)) {
      return null;
    }
    written.add(abs);
    return true;
  };
  let fetches = 0;
  for (const c of commands) {
    const prog = c.argv[0] ?? "";
    // A python run whose code (inline, a here-document or a script) is a GET of the
    // person's URL, importing only the standard library (./python-run.ts).
    const py = pythonRunOf(c);
    const pyStd = Boolean(py && importsOnlyStdlib(py, opts.environment, ctx.home));
    const pyGet = Boolean(
      py && pyStd && pythonCodeIsGetOf(py.code, (u) => isPersonNamedUrl(u, opts.personUrls)),
    );
    // Python that only reads files this line wrote before it (new files in the
    // temp directory: the here-document's own text, or the person's page) and prints.
    const pyRead = Boolean(
      py &&
      pyStd &&
      pythonIsPureReader(py.code, py.args, (f) =>
        written.has(path.resolve(c.cwd, expandHome(f, ctx.home))),
      ),
    );
    const pyStdin = pyGet || (pyRead && py?.script === null && py.args[0] !== "-c");
    // `cat` of a here-document into a new temp file: a write of known text.
    const catHere = prog === "cat" && c.argv.length === 1 && (c.writes?.length ?? 0) > 0;
    if (
      c.assigns.length > 0 ||
      c.reads?.length ||
      ((c.stdin ?? null) !== null && !pyStdin && !catHere) ||
      (c.unknownArgs && prog !== "echo" && prog !== "printf") ||
      c.cwds.length !== 1 ||
      !(c.writes ?? []).every((w) => !w.append && writeOnce(w.path, c.cwd)) ||
      !c.redirects.every((r) => {
        const t = r.text.replace(/\s+/g, "");
        // A here-document only as the code of a python run read above.
        return (
          NO_FILE_REDIRECT.test(t) ||
          /^\d*>[^&>]/.test(t) ||
          ((pyStdin || catHere) && /^<<-?/.test(t))
        );
      })
    ) {
      return null;
    }
    if (
      pyGet ||
      isNodeGetOf(c.argv, (u) => isPersonNamedUrl(u, opts.personUrls), opts.environment)
    ) {
      fetches++;
      continue;
    }
    const get = personNamedGet(c.argv, opts.personUrls);
    if (get) {
      if (get.output !== null && !writeOnce(get.output, c.cwd)) {
        return null;
      }
      fetches++;
      continue;
    }
    if (prog === "mkdir") {
      const dirs = c.argv.slice(1).filter((a) => a !== "-p" && a !== "--parents");
      if (
        dirs.length === 0 ||
        dirs.some((d) => d.startsWith("-")) ||
        !dirs.every((d) =>
          tempScratchDir(ctx, path.resolve(c.cwd, expandHome(d, ctx.home)), secrets),
        )
      ) {
        return null;
      }
      continue;
    }
    if (
      catHere ||
      pyRead ||
      isTrFilter(c.argv) ||
      isPureSedFilter(c.argv) ||
      isPurePythonFilter(c.argv)
    ) {
      continue;
    }
    if (prog === "git" || !classifyArgv(c.argv).readOnly) {
      return null;
    }
  }
  // A GET needs the open flavor (an enforced allowlist is never widened); a
  // line with none must at least write its own scratch file (else the ordinary rules decide).
  if (fetches > 0) {
    return opts.policy.enforceAllowlists ? null : "get";
  }
  return written.size > 0 ? "scratch" : null;
}

/**
 * Every environment print in the line (`env`, `printenv` with no name) is
 * piped into `grep NAME`, and every NAME is one the line itself sets (NAME=,
 * export NAME=) or a script it sources sets: in the containment's
 * environment, built from nothing, the print shows only those.
 */
function printsOnlyOwnNames(cmd: string, cwd: string): boolean {
  const set = new Set<string>();
  const collect = (text: string) => {
    for (const m of text.matchAll(/(?:^|[\s;&|(])(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/g)) {
      set.add(m[1]);
    }
  };
  collect(cmd);
  for (const m of cmd.matchAll(/(?:^|[;&|(]\s*)(?:source|\.)\s+([^\s;&|]+)/g)) {
    try {
      collect(fs.readFileSync(path.resolve(cwd, m[1]), "utf8").slice(0, 64 * 1024));
    } catch {
      return false;
    }
  }
  const prints = [
    ...cmd.matchAll(/(?:^|[;&|(]\s*)(?:env|printenv)\b([^;&|]*)(\|\s*grep\s+([^;&|]*))?/g),
  ];
  return (
    prints.length > 0 &&
    prints.every((m) => {
      if (/\S/.test(m[1].replace(/\d?>\s*\/dev\/null/g, ""))) {
        return false; // options, names or a command: not a plain print
      }
      const words = (m[3] ?? "")
        .trim()
        .split(/\s+/)
        .filter((w) => !w.startsWith("-") || w === "-");
      const name = (words[0] ?? "").replace(/^['"]|['"]$/g, "");
      return words.length === 1 && set.has(name);
    })
  );
}

/**
 * A shell line: first as a definitions-free host run (definitionsFreeHostRun),
 * otherwise as decided by decideShellAs.
 */
/** The runtimes the programs of a line run under (./program-path.ts runtimesOf); null: not known. */
function lineRuntimes(
  commands: readonly SimpleCommand[] | null,
  pathVar: string | null,
): Set<CodeRuntime> | null {
  if (!commands) {
    return null;
  }
  const out = new Set<CodeRuntime>();
  for (const c of commands) {
    const assigned = c.assigns.find((a) => a.name === "PATH")?.value ?? pathVar;
    for (const w of programWords(c.argv)) {
      for (const d of c.cwds) {
        const r = runtimesOf(w, assigned, d);
        if (!r) {
          return null;
        }
        for (const x of r) {
          out.add(x);
        }
      }
    }
  }
  return out;
}

async function decideShell(ctx: Ctx): Promise<Decision> {
  const d = (await definitionsFreeHostRun(ctx)) ?? (await decideShellAs(ctx));
  // Whatever a line would run on the host (read-only, a version probe, file
  // operations in the scratch, a new temporary file): not with a session
  // environment that makes its programs load other code. A contained run
  // starts from an environment of its own and keeps its decision.
  const text = ctx.event.command?.text ?? "";
  const parsed = parseCompound(text, { cwd: ctx.cwd, home: ctx.home }, { fileRedirects: true });
  const loads = codeLoadingEnvOf(
    ctx.opts.environment ?? null,
    lineRuntimes(
      parsed.ok ? parsed.commands : null,
      ctx.opts.pinnedPath ?? ctx.opts.environment?.PATH ?? null,
    ),
  );
  if (loads && d.outcome === "allow" && !d.contain) {
    return irreversible(
      ["shell:session-env-loads-code"],
      `the session's environment sets ${loads}, which makes the programs this command starts load code other than their own. Command (quoted as the agent gave it): ${q(ctx.event.command?.text ?? "", { max: 400 })}`,
      CAPABILITY.SPAWN_PROC,
      ctx.event,
      ctx.opts.policy,
    );
  }
  return d;
}

const sqWord = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;

/**
 * The line as the host's bash runs it with none of the shell's aliases or
 * functions: POSIX mode finds the special builtin exec before any function,
 * \exec is never an alias, /usr/bin/env and /bin/sh are named by path, and
 * dash (sh -c) reads no startup file and imports no function. The environment
 * is kept, with PATH set to `pinnedPath` (what the programs were resolved along).
 */
export function definitionsFreeLine(cmd: string, pinnedPath: string): string {
  return `POSIXLY_CORRECT=1 && \\exec /usr/bin/env ${sqWord(`PATH=${pinnedPath}`)} /bin/sh -c ${sqWord(cmd)}`;
}

/**
 * The definitions of the host's shell are not known (EngineOptions.shellDefinitions
 * "unknown"; a session's first command), its shell is bash (hostShell) and the
 * PATH it runs with is known (hostPath): a line that is read-only when decided
 * with no definitions, its programs resolved along that PATH, and that dash
 * reads as bash does, runs on the host as definitionsFreeLine makes it. Null
 * otherwise (the line is decided as before: never bare).
 */
async function definitionsFreeHostRun(ctx: Ctx): Promise<Decision | null> {
  const { event, opts } = ctx;
  const cmd = event.command?.text ?? "";
  const pinned = opts.hostPath ?? null;
  if (
    opts.hostShell !== "bash" ||
    typeof pinned !== "string" ||
    pinned === "" ||
    pinned.split(":").some((d) => !path.isAbsolute(d)) ||
    (event.command?.dialect ?? "posix") !== "posix" ||
    shellDefsOf(opts).known
  ) {
    return null;
  }
  const sub = await decideShellAs({
    ...ctx,
    opts: {
      ...opts,
      shellDefinitions: NO_SHELL_DEFINITIONS,
      containScripts: undefined,
      pinnedPath: pinned,
    },
  });
  if (
    sub.outcome !== "allow" ||
    !sub.codes.includes("read-only-command") ||
    sub.contain ||
    sub.hostRun
  ) {
    return null;
  }
  // dash runs it: it must read the same simple commands as bash does.
  const shellCtx = { cwd: ctx.cwd, home: ctx.home, env: opts.environment ?? null };
  const asBash = parseCompound(cmd, shellCtx, { fileRedirects: true });
  const asDash = parseCompound(cmd, shellCtx, { fileRedirects: true, shell: "dash" });
  if (
    !asBash.ok ||
    !asDash.ok ||
    JSON.stringify(asBash.commands.map((c) => c.argv)) !==
      JSON.stringify(asDash.commands.map((c) => c.argv))
  ) {
    return null;
  }
  // Redirections that create new files (exclusiveCreate): noclobber inside the
  // definitions-free shell, where `set` is the builtin.
  const { exclusiveCreate, ...rest } = sub;
  return {
    ...rest,
    codes: [...sub.codes, "shell-definitions-free"],
    hostRun: definitionsFreeLine(exclusiveCreate ? `set -C; ${cmd}` : cmd, pinned),
  };
}

async function decideShellAs(ctx: Ctx): Promise<Decision> {
  const { event, opts } = ctx;
  const policy = opts.policy;
  const cmd = event.command?.text ?? "";
  const dialect = event.command?.dialect ?? "posix";
  // The simple commands the shell will run, each where it runs (`cd` followed),
  // when the line is in the grammar the kit reads exactly (./shell-compound.ts).
  const shellCtx = {
    cwd: ctx.cwd,
    home: ctx.home,
    gitTop: (d: string) => ctx.fs.committedTree?.(d)?.top ?? null,
    // The session's environment (EngineOptions.environment): `$TMPDIR` and the like are known.
    env: opts.environment ?? null,
    // The host application's own read-only CLI forms (EngineOptions.hostReadOnlyCommands).
    readOnlyArgv: opts.hostReadOnlyCommands ?? null,
  };
  // Another user's authority (sudo, su, doas, pkexec, ...): never the agent's,
  // whatever runs under it (./privilege.ts). A host with NOPASSWD rules or
  // cached credentials would run it as root without a prompt.
  // (Code fetched and run in the same line keeps its own, more specific, denial.)
  const escalation = dialect === "posix" ? escalationIn(cmd, shellDefsOf(opts)) : null;
  if (escalation && execProvenance(cmd, dialect, ctx.cwd)?.kind !== "download-and-execute") {
    return deny(
      ["privilege-escalation"],
      `Enclawed never lets the agent run a command with another user's authority (${q(escalation.program, { max: 40 })}): it would run as root wherever no password is asked. If you need it, run it yourself in your own terminal. Command (quoted as the agent gave it): ${q(cmd, { max: 400 })}`,
      CAPABILITY.SPAWN_PROC,
    );
  }
  const parsed = dialect === "posix" ? parseCompound(cmd, shellCtx, { fileRedirects: true }) : null;
  // A path component whose value is unknown (`$(date +%F)`): decided as one name no
  // entry of its directory has (every write there is a new file), or not decided.
  const opaque = parsed?.ok ? opaqueResolved(parsed.commands) : null;
  if (opaque && !opaque.ok) {
    return irreversible(
      ["shell:shell-expansion"],
      `this command names a path with a part whose value is not known yet (${q(opaque.why, { max: 200 })}). Command (quoted as the agent gave it): ${q(cmd, { max: 400 })}`,
      CAPABILITY.SPAWN_PROC,
      event,
      opts.policy,
    );
  }
  const commands = opaque?.ok ? opaque.commands : parsed?.ok ? parsed.commands : null;
  // Each program the line runs, resolved along the session's PATH: an
  // allowlisted name is the allowlisted program only when it is the machine's
  // own, not a file the agent could have planted earlier on PATH
  // (./program-path.ts). A line not read exactly: its programs are unknown.
  // A command word that is an alias or function of the host's shell runs that,
  // not the program of its name (./shell-definitions.ts): unverified as well.
  const defs = shellDefsOf(opts);
  const shadow = commands ? shadowedCommandIn(commands, defs) : null;
  // The session's environment makes the programs load other code (NODE_OPTIONS,
  // PYTHONPATH, LD_PRELOAD, ...): nothing runs on the host as read-only.
  const loadsEnv = codeLoadingEnvOf(
    opts.environment ?? null,
    lineRuntimes(commands, opts.pinnedPath ?? opts.environment?.PATH ?? null),
  );
  const unverified = loadsEnv
    ? `the session's environment sets ${loadsEnv}, which makes the programs it starts load other code`
    : commands
      ? (shadow ??
        unverifiedProgramIn(commands, {
          pathVar: opts.pinnedPath ?? opts.environment?.PATH ?? null,
          environment: opts.environment ?? null,
          projectDir: opts.projectDir,
          scratch: policy.scratchPaths,
        }))
      : "the line is not read exactly, so which programs it runs could not be checked against PATH";
  if (opaque?.ok) {
    opaqueOf.set(event, opaque.patterns);
  }
  // Containment reads what each command runs, not its redirections or here-documents:
  // a line with any is offered containment only after decideRedirects decided them.
  const containable = commands?.every((c) => !hasFileRedirect(c)) ? commands : null;
  // One line whose quote is never closed: bash reads the whole line before it
  // runs any of it, meets the end inside the quote and stops with a syntax
  // error, so nothing runs (the host hands the line to the shell's eval as it is).
  // An alias's text is read in place of its word and could close the quote.
  if (
    parsed &&
    !parsed.ok &&
    parsed.code === "unbalanced-quote" &&
    !/[\n\r]/.test(cmd) &&
    aliasesLexNeutral(defs)
  ) {
    return allow(
      ["shell-syntax-error"],
      "this line leaves a quote open, so the shell stops with a syntax error before running any of it",
      CAPABILITY.FS_READ,
    );
  }
  const secret =
    commandNamesSecret(ctx, cmd, opts.secretPaths ?? []) ??
    (commands
      ? perCommand(commands, (c, d) =>
          commandNamesSecret({ ...ctx, cwd: d }, commandText(c), opts.secretPaths ?? []),
        )
      : null);
  if (secret) {
    return deny(
      ["secret-path"],
      `this command names ${showPath(secret)}, which holds secrets of Enclawed or of the agent CLI; the agent may not read it`,
      CAPABILITY.SPAWN_PROC,
    );
  }
  // Each simple command where it runs; a line the kit cannot read exactly, as a whole.
  const cred = commands
    ? perCommand(commands, (c, d) =>
        listsNamesOnly(c) || showsNoContent(c, d)
          ? null
          : commandReachesCredential(
              ctx.fs,
              commandText(c),
              d,
              ctx.home,
              createsNoFileBefore(ctx, commands, c),
            ),
      )
    : commandReachesCredential(ctx.fs, cmd, ctx.cwd, ctx.home);
  if (cred) {
    return personOnly(
      ["credential-path"],
      `this command reaches ${cred.what} (${showPath(cred.path)}); its content would reach the model. Command (quoted as the agent gave it): ${q(cmd, { max: 400 })}`,
      CAPABILITY.SPAWN_PROC,
      event,
    );
  }
  // File names a listing gives a reader (`cat $(git ls-files)`): every file it may list, checked.
  const listed = commands
    ? perCommand(commands, (c) => (listsNamesOnly(c) ? null : filesetCheck(ctx, c)))
    : null;
  if (listed?.cred) {
    return personOnly(
      ["credential-path"],
      `this command reads files a listing names, and one it may name is ${listed.cred.what} (${showPath(listed.cred.path)}); its content would reach the model. Command (quoted as the agent gave it): ${q(cmd, { max: 400 })}`,
      CAPABILITY.SPAWN_PROC,
      event,
    );
  }
  if (listed) {
    return irreversible(
      ["shell:shell-expansion"],
      `this command reads files a listing names, and Enclawed could not check them all: ${q(listed.why, { max: 300 })}. Command (quoted as the agent gave it): ${q(cmd, { max: 400 })}`,
      CAPABILITY.SPAWN_PROC,
      event,
      policy,
    );
  }
  // An environment print filtered to lines that hold no credential, on the
  // session's actual environment (./env-filter.ts), is a read like any other:
  // the rest of the line is decided below.
  const envFiltered = Boolean(
    dumpsEnvironment(cmd, dialect) && commands && envPrintsNoCredential(commands, opts.environment),
  );
  // Such a line made only of reads and pure filters (sed substitutions, tr) is read-only.
  if (
    envFiltered &&
    !unverified &&
    commands?.every(
      (c) =>
        !c.assigns.length &&
        !hasFileRedirect(c) &&
        c.argv[0] !== "git" &&
        (classifyArgv(c.argv).readOnly || isPureSedFilter(c.argv) || isTrFilter(c.argv)),
    )
  ) {
    return allow(
      ["read-only-command"],
      "read-only command (its environment print is filtered to lines that hold no credential)",
      CAPABILITY.FS_READ,
    );
  }
  if (dumpsEnvironment(cmd, dialect) && !envFiltered) {
    // Contained, the line prints the containment's own environment, built
    // from nothing: when every print is filtered to names the line itself
    // sets, it shows only what the line set, and no person is needed.
    if (
      containable &&
      opts.containScripts &&
      !opts.shellEnvRisk &&
      printsOnlyOwnNames(cmd, ctx.cwd)
    ) {
      const c = await containedDecision(ctx, containable, cmd);
      if (c.decision?.outcome === "allow" && c.decision.contain) {
        return c.decision;
      }
    }
    return personOnly(
      ["environment-dump"],
      `this command prints the session's environment, where credentials live. Command (quoted as the agent gave it): ${q(cmd, { max: 400 })}`,
      CAPABILITY.SPAWN_PROC,
      event,
    );
  }
  const prov = execProvenance(cmd, dialect, ctx.cwd);
  if (prov?.kind === "download-and-execute") {
    return deny(
      ["download-and-execute"],
      `${prov.detail}: code from the network would run unreviewed. A person who wants it runs it. Command (quoted as the agent gave it): ${q(cmd, { max: 400 })}`,
      CAPABILITY.SPAWN_PROC,
    );
  }
  if (prov?.kind === "nested-agent") {
    if (prov.bypass) {
      return deny(
        ["nested-agent"],
        `this command starts the agent CLI ${q(prov.agent, { max: 40 })} with its own checks off (${q(prov.bypass, { max: 80 })}), an agent nothing would govern. Command (quoted as the agent gave it): ${q(cmd, { max: 400 })}`,
        CAPABILITY.SPAWN_PROC,
      );
    }
    return personOnly(
      ["nested-agent"],
      `this command starts another agent CLI (${q(prov.agent, { max: 40 })}); its own calls are not checked here. Command (quoted as the agent gave it): ${q(cmd, { max: 400 })}`,
      CAPABILITY.SPAWN_PROC,
      event,
    );
  }
  // A call made under a verified skill (./skill-conformance.ts): decided
  // against the skill's admitted capabilities, by rule. Conforming: run
  // contained with those capabilities, no person; not conforming: denied.
  // The deny and person-only rules above still come first.
  const skillCall = opts.skills
    ? attributeSkillCall({ ...ctx, projectDir: opts.projectDir }, opts.skills, cmd, dialect)
    : null;
  if (skillCall?.kind === "nonconformant") {
    return deny(
      ["skill-nonconformant"],
      `this call runs the verified skill ${q(skillCall.skill, { max: 120 })}, and it does not conform to what the skill was verified to do: ${skillCall.why}. Command (quoted as the agent gave it): ${q(cmd, { max: 400 })}`,
      CAPABILITY.SPAWN_PROC,
    );
  }
  if (skillCall?.kind === "conformant" && !opts.shellEnvRisk) {
    const hit = opts.protected ? commandNamesProtected(ctx, cmd, opts.protected) : null;
    if (hit) {
      return deny(
        ["protected-path"],
        `this command names ${showPath(hit)}, which holds Enclawed's own state, policy, audit log or code; the agent may not change it`,
        CAPABILITY.SPAWN_PROC,
      );
    }
    return skillDecision(skillCall.run);
  }
  if (prov?.kind === "package-install") {
    return {
      ...personOnly(
        ["package-install"],
        `${prov.detail}. It runs contained: the project read-write, no credentials, the network only to its package registry. Command (quoted as the agent gave it): ${q(cmd, { max: 400 })}`,
        CAPABILITY.SPAWN_PROC,
        event,
      ),
      contain: { kind: "package-install", label: `${prov.tool} install`, tool: prov.tool },
    };
  }
  const scratch = commands && !unverified ? personNamedFetchLine(ctx, commands) : null;
  if (
    scratch === "get" ||
    (!opts.policy.enforceAllowlists &&
      // The idiom runs builtins (exec, printf) and cat: cat is checked on PATH.
      !lineMayInvokeDefinition(cmd, defs) &&
      !unverifiedProgramOf(
        "cat",
        {
          pathVar: opts.pinnedPath ?? opts.environment?.PATH ?? null,
          environment: opts.environment ?? null,
          projectDir: opts.projectDir,
          scratch: policy.scratchPaths,
        },
        ctx.cwd,
      ) &&
      isPersonNamedDevTcpGet(cmd, opts.personUrls))
  ) {
    return allow(
      ["read-only-retrieval", "person-named-url"],
      "a plain GET of a URL the person named in the task, its output read by read-only commands only",
      CAPABILITY.NET_EGRESS,
    );
  }
  if (scratch === "scratch") {
    // Each file it writes is new: the host's shell creates it exclusively (noclobber).
    const exclusive = commands?.every(
      (c) =>
        !teeTargets(c.argv) &&
        !c.redirects.some((r) => /^(?:\d|&)?>\||\/dev\/(?:stdout|stderr|fd\/)/.test(r.text)),
    );
    return {
      ...allow(
        ["temp-new-file"],
        "it writes only new files in the system's temporary directory (removing them undoes it) and otherwise only reads",
        CAPABILITY.FS_WRITE_REV,
      ),
      ...(exclusive ? { exclusiveCreate: true as const } : {}),
    };
  }
  // A toolchain program asked only for its version (`nvcc --version`): read-only on the host,
  // as an exact argument vector (./contained-exec.ts versionProbe; its program path is checked as any).
  const probes = (commands ?? [])
    .filter((c) => versionProbe(c.argv[0] ?? "", c.argv.slice(1), c.cwd))
    .map((c) => c.argv);
  const classified = (opts.shell ?? strictShellClassifier).classify(
    cmd,
    dialect,
    probes.length
      ? { ...shellCtx, readOnlyArgv: [...(shellCtx.readOnlyArgv ?? []), ...probes] }
      : shellCtx,
  );
  const verdict =
    classified.readOnly && unverified && dialect === "posix"
      ? { readOnly: false as const, code: "program-unverified", detail: unverified }
      : classified;
  if (!verdict.readOnly && opts.protected) {
    const prot = opts.protected;
    const hit =
      commandNamesProtected(ctx, cmd, prot) ??
      (commands
        ? perCommand(commands, (c, d) =>
            commandNamesProtected({ ...ctx, cwd: d }, commandText(c), prot),
          )
        : null);
    if (hit) {
      return deny(
        ["protected-path"],
        `this command names ${showPath(hit)}, which holds Enclawed's own state, policy, audit log or code; the agent may not change it`,
        CAPABILITY.SPAWN_PROC,
      );
    }
  }
  if (verdict.readOnly && opts.shellEnvRisk) {
    return irreversible(
      ["settings-env-overrides"],
      `a settings file sets an environment variable that changes what shell commands run: ${q(opts.shellEnvRisk, { max: 300 })}`,
      CAPABILITY.SPAWN_PROC,
      event,
      policy,
    );
  }
  if (verdict.readOnly && verdict.gits && ctx.fs.gitPrograms) {
    // Each git command against the programs the repository can make it start,
    // and only those it actually starts (./git-programs.ts, measured on git v2.53).
    for (const g of verdict.gits) {
      const programs = ctx.fs.gitPrograms(g.cwd, opts.environment);
      const hit = programs
        ? gitCommandStarts(g, programs)
        : { kind: "include" as const, line: "the repository's git config could not be read" };
      if (hit) {
        return irreversible(
          ["git-config-runs-programs"],
          `the repository's git configuration makes \`git ${q(g.sub, { max: 40 })}\` start a program (${hit.kind}). Config line (quoted from the repository): ${q(hit.line, { max: 300 })}`,
          CAPABILITY.SPAWN_PROC,
          event,
          policy,
        );
      }
    }
  } else if (verdict.readOnly && verdict.git) {
    const gitCwd = verdict.git.cdirs.reduce((acc, d) => path.resolve(acc, d), ctx.cwd);
    // No way to check the repository's git config: the command may start a program, so it asks.
    const risk = ctx.fs.gitConfigRisk
      ? ctx.fs.gitConfigRisk(gitCwd)
      : "the repository's git config could not be checked";
    if (risk) {
      return irreversible(
        ["git-config-runs-programs"],
        `the repository's git config can make this git command start a program. Config line (quoted from the repository): ${q(risk, { max: 300 })}`,
        CAPABILITY.SPAWN_PROC,
        event,
        policy,
      );
    }
  }
  if (verdict.readOnly) {
    return allow(["read-only-command"], "read-only command", CAPABILITY.FS_READ);
  }
  // gh holding no credentials stops before any request (./gh-cli.ts): a line of
  // such gh commands and read-only commands is read-only.
  const gh = commands && !unverified ? ghInertLine(ctx, commands) : null;
  if (gh) {
    return gh;
  }
  // git fetch from a configured https remote that starts nothing (./git-writes.ts),
  // with read-only commands: a network read into the repository's own objects and refs.
  const fetched =
    commands && !unverified && !opts.shellEnvRisk ? gitFetchLine(ctx, commands) : null;
  if (fetched) {
    return fetched;
  }
  // File programs that reach the session's scratch directory: run on the host,
  // when Enclawed reads every effect exactly (the programs are the machine's own).
  if (commands && containable && !unverified && !shadow && !opts.shellEnvRisk) {
    const s = await scratchFileOps(ctx, containable, cmd);
    if (s) {
      return s;
    }
  }
  // Not read-only: run contained, with no person, when what it runs is read
  // and shows nothing containment cannot take back (./contained-exec.ts),
  // and the project files git does not keep were snapshotted first.
  let notContained: string | null = null;
  // Files written by redirection: decided as the equivalent Write (./path-rules.ts).
  if (
    commands &&
    (!containable || commands.some((c) => teeTargets(c.argv))) &&
    !opts.shellEnvRisk
  ) {
    const r = await decideRedirects(ctx, commands, cmd);
    // A command of the line is an alias or function, or a program word that does not
    // resolve to the machine's own program: what runs bare is not what was read.
    if (r && !((shadow || unverified) && r.outcome === "allow" && !r.contain)) {
      return r;
    }
  }
  if (containable && opts.containScripts && !opts.shellEnvRisk) {
    const c = await containedDecision(ctx, containable, cmd);
    if (c.decision) {
      return c.decision;
    }
    notContained = c.why;
  }
  const script =
    prov?.kind === "project-script"
      ? prov.text
        ? ` It runs the project's ${q(prov.runner, { max: 20 })} script ${q(prov.script, { max: 80 })}, defined in ${showPath(prov.source)} as (quoted from the repository): ${q(prov.text, { max: 600 })}.`
        : ` It runs the project's ${q(prov.runner, { max: 20 })} script ${q(prov.script, { max: 80 })}, whose text could not be resolved: check what it runs before approving.`
      : "";
  const d = irreversible(
    [
      `shell:${verdict.code}`,
      ...(prov?.kind === "project-script" ? (["project-script"] as const) : []),
    ],
    `this command is not on the read-only allowlist (${verdict.code}): Enclawed can't tell what it changes (files no history keeps, the network, settings that decide what runs).${"segment" in verdict && verdict.segment ? ` Because of (quoted from the command): ${q(verdict.segment, { max: 200 })}.` : ""}${verdict.detail ? ` Detail (quoted from the command): ${q(verdict.detail)}.` : ""}${commands ? effectsOf(ctx, commands) : ""}${notContained ? ` It cannot run contained without a person because ${q(notContained, { max: 300 })}.` : ""}${script} Command (quoted as the agent gave it): ${q(cmd, { max: 400 })}`,
    CAPABILITY.SPAWN_PROC,
    event,
    policy,
  );
  // A project script runs the repository's code: contained, never bare.
  const segment = "segment" in verdict && verdict.segment ? { segment: verdict.segment } : {};
  return prov?.kind === "project-script"
    ? {
        ...d,
        ...segment,
        contain: {
          kind: "project-script",
          label: `${prov.runner} ${prov.script}`,
          tool: prov.runner,
        },
      }
    : { ...d, ...segment };
}

/** Why an admitted MCP server is not read-only by its signed record, or null when it is. */
export function mcpReadOnlyByRecord(record: McpAdmissionRecord): string | null {
  const c = record.containment;
  if (!c) {
    return "its admission record declares no containment";
  }
  if (record.remote) {
    return "it is a remote server";
  }
  if (c.roots.some((r) => r.access !== "ro")) {
    return "its containment lets it write a folder";
  }
  if ((c.execConfigWritable ?? []).length) {
    return "its containment lets it write configuration";
  }
  if ((c.destinations ?? []).length) {
    return "its containment lets it reach the network";
  }
  if ((c.secrets ?? []).length) {
    return "it holds secrets";
  }
  // Programs it starts run in the same view: they cannot write or reach the network either.
  return null;
}

/** A conforming call under a verified skill: allowed by rule, contained with the skill's capabilities. */
function skillDecision(run: SkillRun): Decision {
  const irrev = run.caps.some((c) => isCapabilityToken(c) && isIrreversible(c));
  return {
    outcome: "allow",
    reason: `${REASON_PREFIX}${irrev ? "irreversible, run by rule" : "reversible"} under the verified skill ${q(run.name, { max: 120 })}: it runs ${q(run.file, { max: 200 })} contained, with only the capabilities the skill was verified to have (${run.caps.join(", ") || "none"})`,
    codes: ["skill-conformant", ...(irrev ? (["executed-under-skill"] as const) : [])],
    capability: CAPABILITY.SPAWN_PROC,
    reversible: !irrev,
    contain: { kind: "skill", label: `skill ${run.name}`, tool: null, skill: run },
  };
}

/**
 * An MCP call decided by the effects its server's code verifiably has for
 * it (./mcp-effects.ts): effect-free (no write the person could lose, no
 * deletion, no program, no network, reads only of the project or of the
 * server's own files, and arguments kept nowhere) runs with no person, unless
 * a read reaches a secret or a credential. Otherwise why, for the question.
 */
function mcpByEffects(
  ctx: Ctx,
  admitted: McpAdmitted,
  tool: string,
): { decision: Decision | null; why: string | null } {
  const { opts, event } = ctx;
  const program = admitted.program;
  if (!program) {
    return { decision: null, why: null };
  }
  const real = Object.keys(admitted.record.tools).find(
    (t) => t.replace(/[^a-zA-Z0-9_-]/g, "_") === tool,
  );
  if (real === undefined) {
    return { decision: null, why: null };
  }
  const v = mcpEffectVerdict(program, real, event.params, {
    projectDir: opts.projectDir,
    home: ctx.home,
    gitPrograms: ctx.fs.gitPrograms ? (cwd, env) => ctx.fs.gitPrograms?.(cwd, env) ?? null : null,
  });
  if (!v.effectFree) {
    return { decision: null, why: v.why };
  }
  const secrets = opts.secretPaths ?? [];
  for (const r of v.reads) {
    if (secrets.length && meetsSecret(ctx, r, secrets, false)) {
      return { decision: null, why: `it reads ${r}, which holds secrets` };
    }
    const cred = readReachesCredential(ctx.fs, r, ctx.home, false, false);
    if (cred) {
      return { decision: null, why: `it reads ${cred.what} (${r})` };
    }
  }
  return {
    decision: allow(
      ["mcp-verified-effect-free"],
      `by the code of the MCP server ${q(admitted.name, { max: 80 })} as it started, this call writes nothing the person could lose, deletes nothing, starts no program, reaches no network and reads only the project or the server's own files`,
      CAPABILITY.TOOL_INVOKE,
    ),
    why: null,
  };
}

async function decideByKind(ctx: Ctx): Promise<Decision> {
  const { event, opts } = ctx;
  switch (event.kind) {
    case "read":
      return allow(["read"], "read", CAPABILITY.FS_READ);
    case "fetch":
    case "search":
      return decideRetrieval(ctx);
    case "session":
      return allow(["session-internal"], "session bookkeeping", CAPABILITY.FS_WRITE_REV);
    case "agent":
      return allow(
        ["subagent"],
        "subagent launch; its own tool calls are checked",
        CAPABILITY.SPAWN_PROC,
      );
    case "skill":
      return allow(["read"], "skill load; what it then runs is checked", CAPABILITY.FS_READ);
    case "fs-write":
      return decideFsWrite(ctx);
    case "shell":
      return await decideShell(ctx);
    case "mcp": {
      const roles =
        opts.mcp && event.mcp
          ? checkArgumentRoles(opts.mcp.roles(event.mcp.server, event.mcp.tool), event.params, ctx)
          : null;
      const unchecked = roles?.ok && roles.unchecked.length ? roles.unchecked : [];
      // Read-only by its signed admission record, never by what the server says
      // about its tools (annotations): contained with no folder it may write, no
      // destination and no secret, a call cannot change anything or send
      // anything anywhere; what it returns is cleaned like any result.
      const admitted = opts.mcp && event.mcp ? opts.mcp.server(event.mcp.server) : null;
      const why = admitted ? mcpReadOnlyByRecord(admitted.record) : null;
      if (admitted && why === null && roles?.ok !== false) {
        return allow(
          ["mcp-contained-read-only"],
          `the MCP server ${q(admitted.name, { max: 80 })} runs contained by its signed admission record with no folder it may write, no network destination and no secret, so this call can change nothing`,
          CAPABILITY.TOOL_INVOKE,
        );
      }
      // By the effects the server's own code has for this call (./mcp-effects.ts).
      const byCode =
        admitted?.program && event.mcp ? mcpByEffects(ctx, admitted, event.mcp.tool) : null;
      if (byCode?.decision) {
        return byCode.decision;
      }
      return irreversible(
        ["mcp-tool", ...(unchecked.length ? (["mcp-argument-unchecked"] as const) : [])],
        `MCP tools act outside this machine's history.${byCode?.why ? ` By its code, ${q(byCode.why, { max: 300 })}.` : ""} Tool (name as given): ${q(event.tool, { max: 120 })}${unchecked.length ? `. Arguments Enclawed did not check (no declared role): ${unchecked.map((a) => q(a, { max: 60 })).join(", ")}` : ""}`,
        CAPABILITY.TOOL_INVOKE,
        event,
        opts.policy,
      );
    }
    default:
      return irreversible(
        ["unknown-tool"],
        `${q(event.tool, { max: 120 })} is not a tool Enclawed knows to be reversible`,
        CAPABILITY.TOOL_INVOKE,
        event,
        opts.policy,
      );
  }
}

/** Is the event well formed? Throws (the caller denies) otherwise. */
/** A pre-action event the adapter built wrong: denied with the code "malformed-event". */
export class MalformedEventError extends Error {
  override name = "MalformedEventError";
}

export function validatePreAction(event: PreActionEvent): void {
  if (!event || event.type !== "pre-action") {
    throw new MalformedEventError("not a pre-action event");
  }
  if (typeof event.tool !== "string" || event.tool.length === 0) {
    throw new MalformedEventError("the tool name is missing");
  }
  if (!event.params || typeof event.params !== "object" || Array.isArray(event.params)) {
    throw new MalformedEventError("the tool input is not an object");
  }
  if (!Array.isArray(event.policyIds) || event.policyIds.length === 0) {
    throw new MalformedEventError("the call has no policy ids");
  }
  if (event.approvalRoute !== "person" && event.approvalRoute !== "no-person") {
    throw new MalformedEventError("the call's approval route is not known");
  }
  if (event.skill !== undefined && typeof event.skill !== "string") {
    throw new MalformedEventError("the skill name is not a string");
  }
}

/**
 * The PreToolUse decision. Rules, in order: hardware halt; MCP admission;
 * skill admission; the workflow profile; tool allowlist; secret reads; then the reversibility of
 * the call by kind (file writes: protected paths, hard links, symlinks,
 * exec-config files, history, untracked overwrite; shell: secrets, protected
 * paths, settings env, git config, read-only allowlist; retrieval: host
 * allowlist). Throws only on a malformed event.
 */
// Per call: the virtual environments the decision found untrusted, with their
// fingerprints then (trusted when a person approves the call at Enclawed's prompt).
const venvsToTrust = new Map<string, Map<string, string>>();

function noteVenvToTrust(
  callId: string | null | undefined,
  dir: string,
  fingerprint: string,
): void {
  if (!callId) {
    return;
  }
  const m = venvsToTrust.get(callId) ?? new Map<string, string>();
  m.set(dir, fingerprint);
  venvsToTrust.set(callId, m);
  if (venvsToTrust.size > 256) {
    venvsToTrust.delete(venvsToTrust.keys().next().value as string);
  }
}

export async function decidePreAction(
  event: PreActionEvent,
  opts: EngineOptions,
): Promise<Decision> {
  validatePreAction(event);
  const ctx = contextOf(event, opts);
  for (const rule of [
    hardwareRule,
    hostPromptHoldRule,
    repoConfigHoldRule,
    mcpRule,
    skillRule,
    workflowRule,
    allowlistRule,
    // The file-integrity record could not be checked: denied here (fail
    // closed); what a change outside the agent asks is decided last (./file-integrity.ts).
    fileIntegrityDeny,
    secretReadRule,
    readArgumentRule,
    outboundDlpRule,
    credentialHandleRule,
    taintRule,
  ]) {
    const d = await rule(ctx);
    if (d) {
      return d;
    }
  }
  const d = await decideByKind(ctx);
  if (d.outcome === "deny") {
    return d;
  }
  // Files changed outside the agent are asked about AFTER the call's own rules
  // (./file-integrity.ts): code from one runs without a person only when this
  // decision runs it contained, and a git commit (the acceptance point) is
  // always asked; one question names both reasons, and a contained decision
  // stays contained once approved. With no person to ask it is a deny.
  const fi = await fileIntegrityAsk(ctx, d);
  if (!fi) {
    return d;
  }
  return {
    ...d,
    outcome: fi.outcome,
    codes: [...d.codes, ...fi.codes],
    reason:
      d.outcome === "ask" ? `${d.reason} ${fi.reason.slice(REASON_PREFIX.length)}` : fi.reason,
  };
}

// ─── Audit summaries (no content, no secrets) ───────────────────────────

const MAX_TEXT = 2000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Free text for an audit record: capped at `max` characters and passed
 * through the framework's DLP redaction; text that cannot be redacted is
 * omitted, never kept as it is. Not a string: null.
 */
export function auditText(value: unknown, max = MAX_TEXT): string | null {
  return redacted(value, max);
}

/** Content for an audit record: only its SHA-256 and size (strings as they are, anything else as JSON). */
export function auditDigest(value: unknown): { sha256: string; bytes: number } {
  return digestOf(value);
}

function redacted(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cut = value.length > max ? `${value.slice(0, max)}…[+${value.length - max} chars]` : value;
  try {
    return dlpRedact(cut);
  } catch {
    return "[unredactable; omitted]";
  }
}

function digestOf(value: unknown): { sha256: string; bytes: number } {
  const json = typeof value === "string" ? value : (JSON.stringify(value ?? null) ?? "null");
  return { sha256: sha256(json), bytes: Buffer.byteLength(json) };
}

/** Digest of a tool input in canonical form: what was decided, to compare with what ran. */
export function inputDigest(params: unknown): string {
  return sha256(canonicalJson(params ?? {}));
}

/** What the audit log keeps of a call's input: commands and URLs DLP-redacted and capped, content as digests. */
export function summarizeAction(event: PreActionEvent | PostActionEvent): Record<string, unknown> {
  const pre = event.type === "pre-action" ? event : null;
  switch (event.kind) {
    case "shell":
      return { command: redacted(pre?.command?.text ?? event.params.command) };
    case "fs-write":
      return {
        targets: (pre?.writes ?? []).map((w) => ({ path: w.path, op: w.op })),
        input: digestOf(event.params),
      };
    case "read":
      return { targets: (pre?.reads ?? []).map((r) => r.path) };
    case "fetch":
      return { url: redacted(pre?.url ?? event.params.url, 1000) };
    case "search":
      return { input: digestOf(event.params) };
    default:
      return { keys: Object.keys(event.params).toSorted(), input: digestOf(event.params) };
  }
}

// ─── The engine ─────────────────────────────────────────────────────────

/** The containment refusals a decision may name (the rest read as containment-setup-failed). */
const CONTAIN_CODES: ReadonlySet<string> = new Set([
  "mcp-server-not-contained",
  "containment-unavailable",
  "containment-setup-failed",
  "containment-declaration-invalid",
  "containment-root-missing",
  "containment-root-too-broad",
  "containment-root-is-credential-store",
  "containment-program-missing",
  "containment-program-writable",
  "containment-command-not-allowed",
  "containment-cwd-outside-roots",
  "containment-env-inline-secret",
  "containment-env-reserved",
  "containment-tree-too-large",
  "containment-libraries-unresolved",
  "skill-changed",
]);

/** The marker every contained command line carries (contained-launch.ts scriptContainer). */
const CONTAINED_MARKER = "ENCLAWED_CONTAIN=";
const REFUSED_WRITE = /Read-only file system|EROFS|Permission denied|EACCES|enclawed name guard:/;

/**
 * For a contained command's result: why a write failed when the containment
 * refused it (EROFS from a read-only bind, or EACCES from the name guard, the
 * same refusal), or null.
 */
/** The result in its own shape, every string replaced: the first non-empty one by `text`, the rest emptied. */
function withheldShape(v: unknown, text: string): unknown {
  let placed = false;
  const walk = (x: unknown, depth: number): unknown => {
    if (typeof x === "string") {
      if (!placed) {
        placed = true;
        return text;
      }
      return "";
    }
    if (depth > 32 || !x || typeof x !== "object") {
      return x;
    }
    if (Array.isArray(x)) {
      return x.map((y) => walk(y, depth + 1));
    }
    return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y, depth + 1)]));
  };
  const out = walk(v, 0);
  return placed ? out : text;
}

export function containedWriteRefused(event: PostActionEvent): string | null {
  const cmd = event.params?.command;
  if (event.kind !== "shell" || typeof cmd !== "string" || !cmd.includes(CONTAINED_MARKER)) {
    return null;
  }
  const text = typeof event.result === "string" ? event.result : JSON.stringify(event.result ?? "");
  return REFUSED_WRITE.test(text.slice(0, 1024 * 1024))
    ? "a write in this contained command was refused by Enclawed's containment (a read-only path, or a file that configures what runs later, such as .envrc, .git/hooks or an agent CLI's settings). It is refused on purpose: do not try to write it another way; ask the person if the change is needed."
    : null;
}

/** Apply a string rewrite to every string inside a tool result (same shape back). */
function mapStrings(
  v: unknown,
  f: (t: string) => { text: string; removed: number },
  depth = 0,
): { value: unknown; removed: number } {
  if (typeof v === "string") {
    const r = f(v);
    return { value: r.text, removed: r.removed };
  }
  if (depth > 32 || !v || typeof v !== "object") {
    return { value: v, removed: 0 };
  }
  let removed = 0;
  if (Array.isArray(v)) {
    const out = v.map((x: unknown) => {
      const r = mapStrings(x, f, depth + 1);
      removed += r.removed;
      return r.value;
    });
    return { value: removed ? out : v, removed };
  }
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    const r = mapStrings(x, f, depth + 1);
    removed += r.removed;
    out[k] = r.value;
  }
  return { value: removed ? out : v, removed };
}

export type ApprovalPrompt = (req: ApprovalRequest) => Promise<string | null>;

/**
 * The engine an adapter drives: one method per agent event. It decides,
 * asks (through the adapter's prompt) when the decision is "ask", writes the
 * audit record BEFORE answering (a decision that cannot be recorded does not
 * run), and never throws for a pre-action: every failure is a denial.
 */
export class DecisionEngine {
  readonly approvals: ApprovalLedger;
  private readonly decided: DecidedStore;

  private readonly taint: TaintStore;

  constructor(readonly opts: EngineOptions) {
    this.approvals = opts.approvals ?? new ApprovalLedger();
    this.decided = opts.decided ?? memoryDecidedStore();
    this.taint = opts.taint ?? memoryTaintStore();
  }

  private record(type: string, actor: ActorRef, payload: unknown): Promise<unknown> | null {
    const sink = this.opts.audit;
    if (!sink) {
      return null;
    }
    return sink.append({
      type: `${this.opts.host}.${type}`,
      actor: actorOf(this.opts.host, actor),
      level: null,
      payload,
    });
  }

  /** Decide a pre-action; `prompt` asks a person (the adapter's own UI) when the decision is "ask". */
  async preAction(event: PreActionEvent, prompt?: ApprovalPrompt): Promise<HandledDecision> {
    let d: Decision;
    try {
      d = await decidePreAction(event, { ...this.opts, taint: this.taint });
    } catch (err) {
      const malformed = err instanceof MalformedEventError;
      d = deny(
        [malformed ? "malformed-event" : "engine-error"],
        `could not check this tool call, so it is blocked: ${sanitizeText((err as Error)?.message ?? err)}`,
        null,
      );
    }
    let answer: Outcome = d.outcome;
    let answerReason = d.reason;
    let approval: ApprovalVerdict | null = null;
    if (d.outcome === "ask" && prompt) {
      // The prompt states the effect, and the answer is derived from it
      // (./approval-effect.ts): it cannot be typed without reading it.
      const req = this.approvals.request({
        callId: event.callId,
        tool: event.tool,
        params: event.params,
        reason: d.reason,
        effect: approvalEffect(event, d),
      });
      let typed: string | null = null;
      try {
        typed = await prompt(req);
      } catch {
        typed = null;
      }
      approval = this.approvals.answer({
        type: "approval-answer",
        requestId: req.id,
        typed,
        callId: event.callId,
        tool: event.tool,
        params: event.params,
      });
      answer = approval.approved ? "allow" : "deny";
      // The person approved a line a virtual environment's trust stopped: its
      // installed packages are trusted as they are now.
      const toTrust = event.callId ? venvsToTrust.get(event.callId) : undefined;
      if (approval.approved && toTrust && this.opts.venvTrust) {
        for (const [dir, fingerprint] of toTrust) {
          this.opts.venvTrust.trust(dir, fingerprint);
        }
      }
      const rest = d.reason.slice(REASON_PREFIX.length);
      answerReason = approval.approved
        ? `${REASON_PREFIX}approved by a person at Enclawed's own prompt. ${rest}`
        : `${REASON_PREFIX}not approved at Enclawed's prompt (${sanitizeText(approval.reason, { max: 200 })}), so the call is blocked. Ask the person before trying it again. ${rest}`;
    }
    // A git commit accepts changes only when a person approved it at Enclawed's own prompt.
    if (d.codes.includes("git-commit-accepts-changes") && approval?.approved !== true) {
      try {
        this.opts.fileIntegrity?.dropCommitAcceptance(event.callId);
      } catch {
        /* nothing is accepted without the record */
      }
    }
    // No prompt of Enclawed's own: the ask goes to the host's prompt only when
    // the host cannot approve it there by itself, or the write can be put back
    // (./host-prompt.ts). The conflict write keeps its own grant.
    let hostPrompt: Readonly<{ selfApprovable: boolean; code?: ReasonCode }> | null = null;
    if (
      d.outcome === "ask" &&
      !prompt &&
      this.opts.hostPrompt &&
      !d.codes.includes("repo-config-conflict-resolution")
    ) {
      let r: ReturnType<typeof askAtHostPrompt>;
      try {
        r = askAtHostPrompt(this.opts.hostPrompt, event, d, inputDigest(event.params ?? {}));
      } catch (err) {
        r = {
          answer: "deny",
          code: "host-self-approval",
          selfApprovable: true,
          reason: `${REASON_PREFIX}this needs a person's answer, and the grant for the host's prompt could not be written (${sanitizeText((err as Error)?.message ?? err, { max: 200 })}), so the call is blocked.`,
        };
      }
      if (r.answer === "deny") {
        answer = "deny";
        answerReason = r.reason;
        d = { ...d, codes: [...d.codes, r.code] };
        hostPrompt = { selfApprovable: r.selfApprovable, code: r.code };
      } else {
        hostPrompt = { selfApprovable: r.selfApprovable };
      }
    }
    // A project script or install runs only contained: the command becomes the contained one.
    let rewrite: Decision["rewrite"];
    // A line run on the host with none of the shell's definitions (definitionsFreeHostRun).
    if (answer === "allow" && d.hostRun && event.command) {
      rewrite = { command: d.hostRun, params: { ...event.params, command: d.hostRun } };
    }
    const contain = d.contain;
    // Redirections that create new files: run with noclobber, so none overwrites
    // a file that appeared after the decision (`set` is the shell's builtin unless
    // the host's shell defines it).
    if (
      answer === "allow" &&
      !contain &&
      !d.hostRun &&
      d.exclusiveCreate &&
      event.command?.dialect === "posix" &&
      !lineShadow("set -C", shellDefsOf(this.opts), event.cwd)
    ) {
      const command = `set -C; ${event.command.text}`;
      rewrite = { command, params: { ...event.params, command } };
    }
    if (answer === "allow" && contain && event.command) {
      const container = this.opts.containScripts;
      let c: Awaited<ReturnType<NonNullable<typeof container>>>;
      if (!container) {
        c = {
          ok: false,
          code: "containment-unavailable",
          message: "this session has no containment for what the agent runs",
        };
      } else {
        try {
          c = await container({
            kind: contain.kind,
            label: contain.label,
            command: event.command.text,
            dialect: event.command.dialect,
            cwd: event.cwd,
            projectDir: this.opts.projectDir,
            tool: contain.tool,
            ...(contain.skill ? { skill: contain.skill } : {}),
            ...(contain.code ? { code: contain.code } : {}),
            ...(contain.build ? { build: contain.build } : {}),
          });
        } catch (err) {
          c = {
            ok: false,
            code: "containment-setup-failed",
            message: sanitizeText((err as Error)?.message ?? err, { max: 300 }),
          };
        }
      }
      if (c.ok) {
        // The contained line runs through the host's shell: an alias or function
        // there in place of its command word would run instead of the containment.
        const shadowed = launchShadow(c.command, this.opts, event.cwd);
        if (!shadowed) {
          rewrite = { command: c.command, params: { ...event.params, command: c.command } };
        } else {
          answer = "deny";
          d = { ...d, codes: [...d.codes, "shell-definition-shadow"] };
          answerReason = `${REASON_PREFIX}${contain.label} runs only contained, and the contained command would not reach its containment: ${sanitizeText(shadowed, { max: 400 })}`;
        }
      } else {
        answer = "deny";
        const code: ReasonCode = CONTAIN_CODES.has(c.code)
          ? (c.code as ReasonCode)
          : "containment-setup-failed";
        d = { ...d, codes: [...d.codes, code] };
        answerReason = `${REASON_PREFIX}${contain.label} runs only contained, and it could not be: ${sanitizeText(c.message, { max: 400 })}`;
      }
    }
    // With a hardware root held, the device holder signs a commitment to this
    // decision (./call-commitment.ts); the evidence goes into the record. A
    // decision that cannot be committed does not run.
    let commitmentCall: CallCommitmentCall | null = null;
    let commitment: unknown = null;
    if (this.opts.commit) {
      const call: CallCommitmentCall = {
        callId: event.callId ?? "",
        tool: event.tool,
        inputDigest: event.params ? inputDigest(event.params) : null,
        decision: d.outcome,
        answered: answer,
        codes: [...d.codes],
        reversible: d.reversible,
        policyIds: [...event.policyIds],
        approvalRoute: event.approvalRoute,
        approvedBy: approval?.approved
          ? "enclawed-prompt"
          : hostPrompt && !hostPrompt.code && d.outcome === "ask"
            ? "host-prompt"
            : null,
      };
      commitmentCall = call;
      try {
        const ev = await this.opts.commit(call);
        const why = evidenceCovers(call, ev);
        if (why) {
          throw new Error(why);
        }
        commitment = ev;
      } catch (err) {
        const why = sanitizeText((err as Error)?.message ?? err, { max: 300 });
        // A call already refused stays refused for its own reason; any other
        // is refused because its decision could not be committed.
        if (answer !== "deny") {
          answer = "deny";
          answerReason = `${REASON_PREFIX}the hardware root did not sign a commitment to this decision, so the call is blocked: ${why}`;
          d = { ...d, codes: [...d.codes, "device-commit-failed"] };
          rewrite = undefined;
        }
        commitmentCall = { ...call, answered: "deny", codes: [...d.codes] };
        commitment = { error: why };
      }
    }
    // A checked action opens in the file-integrity record with what this
    // decision covers (./action-scope.ts): a change while it runs outside its
    // write scope is outside the agent, and its output is withheld when it
    // reads such a path (postAction). A record that cannot open it blocks.
    const ledger = this.opts.fileIntegrity ?? null;
    let begun = false;
    if (answer === "allow" && ledger && event.callId && bracketsAuditedAction(event.kind)) {
      try {
        ledger.beginAuditedAction(
          event.callId,
          auditedActionScope(event, d, {
            projectDir: this.opts.projectDir,
            home: this.opts.home ?? null,
            asked: d.outcome !== "allow",
            env: this.opts.environment ?? null,
          }),
        );
        begun = true;
      } catch (err) {
        answer = "deny";
        answerReason = `${REASON_PREFIX}the record of the project's files could not open this call (${sanitizeText((err as Error)?.message ?? err, { max: 200 })}), so what it changes or reads could not be told apart from changes outside the agent; the call is blocked.`;
        d = { ...d, codes: [...d.codes, "engine-error"] };
        rewrite = undefined;
      }
    }
    let audited = false;
    try {
      const p = this.record("tool.pre", event.actor, {
        callId: event.callId,
        tool: event.tool,
        kind: event.kind,
        decision: d.outcome,
        answered: answer,
        codes: d.codes,
        capability: d.capability,
        reversible: d.reversible,
        projectDir: this.opts.projectDir,
        cwd: event.cwd,
        hostMode: event.hostMode ?? null,
        ...(this.opts.workflow ? { workflow: this.opts.workflow.name } : {}),
        inputDigest: event.params ? inputDigest(event.params) : null,
        binding: event.params ? bindingOf(event.params) : null,
        ...(d.targets ? { targets: d.targets } : {}),
        ...(d.contain?.skill
          ? {
              skill: {
                name: d.contain.skill.name,
                contentDigest: d.contain.skill.contentDigest,
                file: d.contain.skill.file,
                caps: d.contain.skill.caps,
                egress: d.contain.skill.egress,
              },
            }
          : {}),
        ...(rewrite ? { contained: { command: redacted(rewrite.command) } } : {}),
        ...(approval
          ? {
              approval: { by: "enclawed-prompt", approved: approval.approved, code: approval.code },
            }
          : {}),
        ...(hostPrompt ? { hostPrompt } : {}),
        input: event.params ? summarizeAction(event) : null,
        ...(commitmentCall ? { commitmentCall, commitment } : {}),
      });
      if (p) {
        await p;
        audited = true;
      }
    } catch (err) {
      if (begun && ledger && event.callId) {
        try {
          ledger.dropAuditedAction(event.callId);
        } catch {
          /* the record denies every call when it cannot be read */
        }
      }
      return {
        ...d,
        answer: "deny",
        answerReason: `${REASON_PREFIX}the decision could not be recorded in the audit log, so the call is blocked: ${sanitizeText((err as Error)?.message ?? err, { max: 300 })}`,
        codes: [...d.codes, "audit-unavailable"],
        audited: false,
      };
    }
    if (event.callId && event.params) {
      await this.decided.remember(
        event.callId,
        inputDigest(rewrite ? rewrite.params : event.params),
      );
    }
    // What this command fetches from the network is remembered, so running it
    // later is download-and-execute (taintRule).
    if (answer === "allow" && event.kind === "shell" && event.command) {
      try {
        const view = await settledTaintView(this.taint);
        const { adds } = taintEffects(event.command.text, event.command.dialect, event.cwd, view);
        if (adds.length) {
          await this.taint.add(adds);
        }
      } catch {
        /* the next decision reads what the store has */
      }
    }
    return { ...d, answer, answerReason, audited, ...(rewrite ? { rewrite } : {}) };
  }

  /** Clean a result before the model reads it, and record what was removed. */
  async postAction(
    event: PostActionEvent,
  ): Promise<
    CleanOutcome & { inputChanged: boolean; notice?: string; hostPrompt?: HostPromptCompletion }
  > {
    // A finished command's downloads and unpacked archives are on disk now:
    // their digests and members are measured while their names still hold.
    if (event.kind === "shell") {
      try {
        await settledTaintView(this.taint);
      } catch {
        /* settled at the next decision */
      }
    }
    // The checked action ends in the file-integrity record. A path it reads
    // that changed outside the agent while it ran (a file swapped for a link
    // to a credential store, a secret put where nothing was) means its output
    // may carry what nobody decided: the whole output is withheld, not
    // cleaned. A record that cannot say withholds too (fail closed).
    let withheld: { paths: readonly string[]; why: string } | null = null;
    const ledger = this.opts.fileIntegrity ?? null;
    if (ledger && event.callId && bracketsAuditedAction(event.kind)) {
      try {
        const end = ledger.endAuditedAction(event.callId);
        if (end.outsideReads.length) {
          withheld = {
            paths: end.outsideReads,
            why: `${end.outsideReads
              .slice(0, 8)
              .map((p) => showPath(p))
              .join(
                ", ",
              )}${end.outsideReads.length > 8 ? `, and ${end.outsideReads.length - 8} more` : ""} changed outside the agent while this call that reads ${end.outsideReads.length === 1 ? "it" : "them"} ran (${FILE_CHANGED_CODE})`,
          };
        }
      } catch (err) {
        withheld = {
          paths: [],
          why: `the record of the project's files could not be checked (${sanitizeText((err as Error)?.message ?? err, { max: 200 })})`,
        };
      }
    }
    if (withheld && event.modelReads) {
      const text = `[tool output withheld by Enclawed: ${withheld.why}]`;
      const output = withheldShape(event.result, text);
      try {
        await this.record("tool.output-withheld", event.actor, {
          callId: event.callId,
          tool: event.tool,
          kind: event.kind,
          code: FILE_CHANGED_CODE,
          paths: withheld.paths.slice(0, 50),
          response: digestOf(event.result),
        });
      } catch {
        /* the output is withheld whether or not it could be recorded */
      }
      return {
        changed: true,
        output,
        note: `${REASON_PREFIX}this call's output was withheld: ${withheld.why}. Nothing it printed reached you; the changed file may not be used until a person reviews it.`,
        audit: null,
        inputChanged: false,
      };
    }
    const cleaned: CleanOutcome = event.modelReads
      ? cleanToolResult(event.tool, event.result, this.opts.cleanerMode ?? "on")
      : { changed: false, audit: null };
    // Credentials never reach the model in a tool result (whatever the cleaner's mode).
    let c: CleanOutcome & { credentials?: { removed: number; kinds: string[] } } = cleaned;
    if (event.modelReads) {
      try {
        const r = redactCredentialsIn(cleaned.changed ? cleaned.output : event.result);
        if (r.removed > 0) {
          c = {
            ...cleaned,
            changed: true,
            output: r.value,
            credentials: { removed: r.removed, kinds: r.kinds },
            note: `${cleaned.note ? `${cleaned.note} ` : ""}${REASON_PREFIX}removed ${r.removed} credential${r.removed === 1 ? "" : "s"} (${r.kinds.join(", ")}) from this tool result before you could read it.`,
          };
        }
      } catch {
        c = {
          ...cleaned,
          changed: true,
          output: "[unredactable; omitted]",
          note: `${REASON_PREFIX}this tool result could not be checked for credentials, so it was withheld.`,
        };
      }
    }
    // The host's credential handles, and what the project's secret files hold,
    // never reach the model either (a recursive search reads .env files too).
    if (event.modelReads) {
      try {
        const current = c.changed ? c.output : event.result;
        let removed = 0;
        const handles = this.opts.credentials ?? [];
        const viaHandles = handles.length
          ? mapStrings(current, (t) => redactHandles(t, handles))
          : null;
        removed += viaHandles?.removed ?? 0;
        const values = projectSecretValues(this.opts.projectDir, this.opts.home ?? null);
        const viaProject = redactProjectSecretsIn(
          viaHandles ? viaHandles.value : current,
          values,
          this.opts.projectDir,
        );
        removed += viaProject.removed;
        // Last, by content over the whole output: a credential-shaped name
        // with a token-shaped value (what a link to a credential store shows).
        const viaContent = mapStrings(viaProject.value, redactSecretAssignments);
        removed += viaContent.removed;
        if (removed > 0) {
          c = {
            ...c,
            changed: true,
            output: viaContent.value,
            note: `${c.note ? `${c.note} ` : ""}${REASON_PREFIX}removed ${removed} secret value${removed === 1 ? "" : "s"} (the session's credentials or the project's secret files) from this tool result before you could read it.`,
          };
        }
      } catch {
        c = {
          ...c,
          changed: true,
          output: "[unredactable; omitted]",
          note: `${REASON_PREFIX}this tool result could not be checked for secrets, so it was withheld.`,
        };
      }
    }
    // A contained command whose write was refused: read-only inside the view
    // (EROFS) or refused by the name guard (EACCES) is the same refusal, and
    // the model is told so out of band instead of trying another way round.
    const containedRefusal = containedWriteRefused(event);
    if (containedRefusal) {
      c = {
        ...c,
        note: `${c.note ? `${c.note} ` : ""}${REASON_PREFIX}${containedRefusal}`,
      };
    }
    const ran = inputDigest(event.params);
    const decided = event.callId ? await this.decided.recall(event.callId) : null;
    const inputChanged = decided !== null && decided !== ran;
    // A call asked at the host's prompt: was the answer the person's? (./host-prompt.ts)
    let hostPrompt: HostPromptCompletion | null = null;
    if (this.opts.hostPrompt && !event.failed) {
      try {
        hostPrompt = await completeHostPromptAsk(this.opts.hostPrompt, {
          callId: event.callId,
          hostMode: event.hostMode ?? null,
          digest: ran,
          store: this.opts.history.store,
        });
      } catch (err) {
        hostPrompt = {
          ok: false,
          code: "approval-not-from-person",
          reason: `${REASON_PREFIX}whether a person answered this call's prompt could not be checked (${sanitizeText((err as Error)?.message ?? err, { max: 200 })}).`,
          reverted: [],
          quarantined: [],
          failures: [],
        };
      }
      if (hostPrompt && !hostPrompt.ok) {
        try {
          await this.record("tool.approval-not-from-person", event.actor, {
            callId: event.callId,
            tool: event.tool,
            hostMode: event.hostMode ?? null,
            code: hostPrompt.code,
            reverted: hostPrompt.reverted,
            quarantined: hostPrompt.quarantined,
            failures: hostPrompt.failures,
          });
        } catch {
          /* the hold and the put-back stand either way */
        }
      }
    }
    const notices = [
      inputChanged
        ? `${REASON_PREFIX}the tool call that ran (tool, untrusted name: ${q(event.tool, { max: 120 })}) is not the one Enclawed checked; something rewrote its input after the decision. It is recorded as input-changed-after-decision.`
        : null,
      hostPrompt && !hostPrompt.ok ? hostPrompt.reason : null,
    ].filter((n): n is string => n !== null);
    const notice = notices.length ? notices.join(" ") : undefined;
    // Recording a post-action cannot change what already happened: the
    // cleaned output is returned even when the record fails.
    try {
      await this.record(event.failed ? "tool.failure" : "tool.post", event.actor, {
        callId: event.callId,
        tool: event.tool,
        kind: event.kind,
        inputDigest: ran,
        ...(inputChanged ? { inputChanged: { decided, ran } } : {}),
        response: digestOf(event.result),
        ...(c.audit ? { inputCleaner: c.audit } : {}),
        ...(c.credentials ? { credentialsRemoved: c.credentials } : {}),
      });
    } catch {
      /* the caller surfaces the audit failure from its own logger state */
    }
    return {
      ...c,
      inputChanged,
      ...(notice ? { notice } : {}),
      ...(hostPrompt ? { hostPrompt } : {}),
    };
  }

  /** Session start: record it, and return the context the model must get (where Enclawed's notices come from). */
  async sessionStart(event: SessionStartEvent): Promise<{ context: string }> {
    await this.record("session.start", event.actor, {
      source: event.source ?? null,
      projectDir: this.opts.projectDir,
      ...event.details,
    });
    return { context: NOTICE_CONTEXT };
  }

  async sessionEnd(event: SessionEndEvent): Promise<void> {
    await this.record("session.end", event.actor, { reason: event.reason ?? null });
  }

  /**
   * An MCP server's tools/list answer. Drifted tools are revoked for the
   * rest of the session; `stop` says the session should be stopped (the
   * server changed behind its admission).
   */
  async mcpDefinitions(
    event: McpDefinitionsEvent,
    actor: ActorRef,
  ): Promise<{ stop: boolean; reasons: string[] }> {
    const mcp = this.opts.mcp;
    if (!mcp) {
      return { stop: false, reasons: [] };
    }
    const drifts = mcp.observe(event.server, event.tools);
    if (drifts.length === 0) {
      return { stop: false, reasons: [] };
    }
    const name = mcp.server(event.server)?.name ?? event.server;
    const reasons = drifts.map((d) => describeMcpToolDrift(name, d));
    await this.record("mcp.drift", actor, { server: name, drifts });
    return { stop: true, reasons };
  }
}
