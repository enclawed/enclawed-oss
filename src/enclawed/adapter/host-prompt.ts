// enclawed adapter kit: asks answered at the host's own permission prompt.
//
// With no adapter prompt (a host's managed mode, or a launcher with no
// terminal), an "ask" goes to the host's own permission prompt. Whether that
// prompt stands for the person depends on the host: a host may re-check a
// pending call and approve it without the person. For example, when its
// permission context changes while the prompt is open (the person switches
// modes, or another answer saves a rule), a host may run its own permission
// check again, without the hook, and run the call when that check allows it
// (a mode that allows file edits, read-only commands or reads in the working
// folders by itself).
//
// The adapter declares, as host data, what its host's own check can allow by
// itself in a mode a person can switch to while the prompt is open
// (HostSelfApproval). The kit decides:
//
//   the host cannot approve it by itself   asked there; the answer holds.
//   it can, and the action is revertible   asked there, only in a person-held
//     (a file write whose prior content    mode, with a grant bound to the
//     Enclawed snapshotted)                call and its input. On the host's
//                                          post-tool event the grant is spent:
//                                          the call must have run in a
//                                          person-held mode with the input
//                                          that was asked. Otherwise the write
//                                          is quarantined, the file is put
//                                          back from the snapshot, and the
//                                          host session is held (every later
//                                          call is denied).
//   it can, and the action is not          denied up front: a check after the
//     revertible                           fact would come too late.
//
// A hook or plugin that may answer the host's prompt in the person's place
// (promptAnswerer, decided over the host's managed settings by
// hostPromptAnswerer in ./managed-hooks.ts) turns every ask into a denial.
//
// Grants and the hold live in files of one directory per host session, one
// file per call, so concurrent hook processes never overwrite each other.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { HistoryStore } from "../history-store.js";
import { programOf, segments } from "./exec-provenance.js";
import { isPersonHeldMode, personHeldModes, type HostModeOrder } from "./host-modes.js";
import type { Decision, PreActionEvent, ReasonCode } from "./types.js";
import { REASON_PREFIX } from "./types.js";
import { quoteUntrusted as q, sanitizeText } from "./untrusted.js";

/**
 * What the host's own permission check allows by itself, in some mode a
 * person can switch to while its prompt is open (host data the adapter
 * declares; every list errs on the side of "can").
 */
export type HostSelfApproval = Readonly<{
  /** Host modes in which a pending ask waits for the person's answer. */
  personModes: readonly string[];
  /**
   * The order of the host's modes (the same data as the mode binding's,
   * LaunchContext.modeOrder): a declared person mode counts only when it is
   * the narrowest rank in which the host prompts, never the plan mode
   * (isPersonHeldMode).
   */
  modeOrder?: HostModeOrder | null;
  /**
   * Action kinds (other than shell, fetch and mcp, decided below) whose calls
   * the host may allow by itself in any mode, a person-held one included,
   * whatever their input.
   */
  kinds: readonly PreActionEvent["kind"][];
  /**
   * Action kinds the host allows by itself only in a mode that is not
   * person-held (for example file edits in a mode that accepts edits): a call that then
   * ran in a person-held mode was answered by the person. A kind in neither
   * list is one the host always asks about.
   */
  otherModeKinds: readonly PreActionEvent["kind"][];
  /**
   * Shell commands the host may allow by itself, as word prefixes ("rm",
   * "git log"). A command line is the host's to allow only when every simple
   * command in it starts with one of them (the host allows a compound command
   * only when it allows each part).
   */
  shellPrefixes: readonly string[];
  /** Shell dialects whose commands the host may allow by itself, whatever they are. */
  shellDialects: readonly ("posix" | "powershell")[];
  /** Hosts ("docs.python.org") or host/path prefixes ("go.dev/doc") the host fetches without asking. */
  fetchHosts: readonly string[];
  /**
   * Host tool names its allow rules name ("*": rules the adapter cannot see
   * may name any tool), and prefixes that name a group of tools (an MCP
   * server's tools).
   */
  ruleTools: readonly string[];
  ruleToolPrefixes: readonly string[];
}>;

export type HostPromptGuard = Readonly<{
  /** One directory per host session (created 0700): the grants and the hold. */
  dir: string;
  /** Where a write that ran without the person's answer is kept before the file is put back. */
  quarantineDir: string;
  host: HostSelfApproval;
  /** Why something other than the person may answer the host's prompt; null when only the person can. */
  promptAnswerer: string | null;
}>;

type TargetRecord = Readonly<{
  path: string;
  prior: "absent" | "content";
  snapshot: string | null;
}>;

type GrantRecord = Readonly<{
  v: 1;
  callId: string;
  tool: string;
  selfApprovable: boolean;
  /** Digest of the input that was asked (inputDigest). */
  digest: string;
  askMode: string | null;
  issuedAt: number;
  targets: readonly TargetRecord[];
}>;

type HoldRecord = Readonly<{
  v: 1;
  since: number;
  callId: string | null;
  tool: string | null;
  reason: string;
}>;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const grantFile = (g: HostPromptGuard, callId: string) =>
  path.join(g.dir, `grant-${sha256(callId)}.json`);
const holdFile = (g: HostPromptGuard) => path.join(g.dir, "held.json");

function writeJson(file: string, v: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(v), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// ─── Can the host approve this call by itself? ──────────────────────────

const words = (s: string) => s.split(/\s+/).filter(Boolean);

function startsWithPrefix(argv: readonly string[], prefixes: readonly string[][]): boolean {
  return prefixes.some(
    (p) => p.length > 0 && p.length <= argv.length && p.every((w, i) => argv[i] === w),
  );
}

/** Could the host's own check allow this shell command line by itself? Unparsed: yes. */
function shellSelfApprovable(text: string, h: HostSelfApproval): boolean {
  const prefixes = h.shellPrefixes.map(words);
  const segs = segments(text);
  if (segs.length === 0) {
    return true;
  }
  return segs.every((s) => {
    const raw = s.words.map((w, i) => (i === 0 ? path.basename(w) : w));
    if (startsWithPrefix(raw, prefixes)) {
      return true;
    }
    // The host may look through wrappers (env, timeout, nice, ...) the way the kit does.
    const p = programOf(s.words);
    return p === null || startsWithPrefix([p.prog, ...p.args], prefixes);
  });
}

function hostOfUrl(url: string): { host: string; path: string } | null {
  try {
    const u = new URL(url);
    return { host: u.hostname.toLowerCase(), path: u.pathname };
  } catch {
    return null;
  }
}

/**
 * When the host's own permission check may allow this call by itself:
 * "never"; only in a mode that is not person-held ("other-mode", which the
 * mode the call ran in reveals afterwards); or in "any-mode" (an allow rule,
 * a read-only command, a preapproved host: no mode reveals it). Errs on the
 * wider answer.
 */
export function hostSelfApproval(
  event: PreActionEvent,
  h: HostSelfApproval,
): "never" | "other-mode" | "any-mode" {
  if (
    h.ruleTools.includes("*") ||
    h.ruleTools.includes(event.tool) ||
    h.ruleToolPrefixes.some((p) => event.tool.startsWith(p))
  ) {
    return "any-mode";
  }
  const any = (yes: boolean) => (yes ? "any-mode" : "never");
  switch (event.kind) {
    case "shell": {
      const c = event.command;
      return any(!c || h.shellDialects.includes(c.dialect) || shellSelfApprovable(c.text, h));
    }
    case "fetch": {
      const u = typeof event.url === "string" ? hostOfUrl(event.url) : null;
      // A host/path entry is matched by its host alone (errs on "yes").
      return any(!u || h.fetchHosts.some((e) => e.split("/")[0]?.toLowerCase() === u.host));
    }
    case "mcp":
      return "never";
    default:
      return h.kinds.includes(event.kind)
        ? "any-mode"
        : h.otherModeKinds.includes(event.kind)
          ? "other-mode"
          : "never";
  }
}

/** Could the host's own permission check allow this call by itself, in some mode? */
export function hostMaySelfApprove(event: PreActionEvent, h: HostSelfApproval): boolean {
  return hostSelfApproval(event, h) !== "never";
}

// Codes of a file-write ask whose only reason is that the prior content
// exists nowhere but in Enclawed's snapshot: putting the snapshot back undoes it.
const REVERTIBLE_CODES: ReadonlySet<string> = new Set([
  "untracked-overwrite",
  "git-untracked",
  "git-ignored",
  "git-state-unknown",
]);

/** The targets to put back if the write ran without the person's answer, or null (not revertible). */
export function revertibleTargets(
  event: PreActionEvent,
  d: Decision,
): readonly TargetRecord[] | null {
  if (event.kind !== "fs-write" || !d.targets?.length) {
    return null;
  }
  if (!d.codes.every((c) => REVERTIBLE_CODES.has(c))) {
    return null;
  }
  const out: TargetRecord[] = [];
  for (const t of d.targets) {
    if (!t.reversible || t.basis !== "snapshot" || t.sandbox || !t.realPath) {
      return null;
    }
    if (t.prior === "content" && t.snapshot) {
      out.push({ path: t.realPath, prior: "content", snapshot: t.snapshot });
    } else if (t.prior === "absent") {
      out.push({ path: t.realPath, prior: "absent", snapshot: null });
    } else {
      return null;
    }
  }
  return out;
}

// ─── The ask ────────────────────────────────────────────────────────────

export type HostPromptAsk =
  | Readonly<{ answer: "ask"; selfApprovable: boolean }>
  | Readonly<{ answer: "deny"; code: ReasonCode; reason: string; selfApprovable: boolean }>;

/**
 * The kit decided "ask" and only the host's prompt can ask: ask there (the
 * grant is written), or deny with why.
 */
export function askAtHostPrompt(
  g: HostPromptGuard,
  event: PreActionEvent,
  d: Decision,
  digest: string,
  now: () => number = Date.now,
): HostPromptAsk {
  const rest = d.reason.startsWith(REASON_PREFIX) ? d.reason.slice(REASON_PREFIX.length) : d.reason;
  if (g.promptAnswerer) {
    return {
      answer: "deny",
      code: "host-prompt-answerable",
      selfApprovable: true,
      reason: `${REASON_PREFIX}this needs a person's answer, and the host's permission prompt can be answered by something other than the person (${sanitizeText(g.promptAnswerer, { max: 300 })}), so it is not asked there. ${rest}`,
    };
  }
  const how = hostSelfApproval(event, g.host);
  const self = how !== "never";
  const mode = event.hostMode ?? null;
  const personHeld = isPersonHeldMode(mode, g.host.personModes, g.host.modeOrder);
  // Putting a write back after the fact helps only when the mode it ran in
  // tells whether the person answered ("other-mode").
  const targets = how === "never" ? [] : how === "other-mode" ? revertibleTargets(event, d) : null;
  if (self && !targets) {
    return {
      answer: "deny",
      code: "host-self-approval",
      selfApprovable: true,
      reason: `${REASON_PREFIX}this needs a person's answer, and the host's permission prompt can approve this call by itself (a mode switch or a permission change while the prompt is open), so it is not asked there. Approve it at Enclawed's own prompt (start the session through the adapter's launcher) or do it yourself. ${rest}`,
    };
  }
  if (self && (!personHeld || !event.callId)) {
    return {
      answer: "deny",
      code: "host-self-approval",
      selfApprovable: true,
      reason: `${REASON_PREFIX}this needs a person's answer, and in the host's ${q(mode ?? "unknown", { max: 40 })} mode its prompt can approve this call by itself; switch to ${
        personHeldModes(g.host.personModes, g.host.modeOrder)
          .map((m) => q(m, { max: 40 }))
          .join(" or ") || "a mode in which the host asks the person"
      } to be asked. ${rest}`,
    };
  }
  if (event.callId) {
    const rec: GrantRecord = {
      v: 1,
      callId: event.callId,
      tool: event.tool,
      selfApprovable: self,
      digest,
      askMode: mode,
      issuedAt: now(),
      targets: targets ?? [],
    };
    writeJson(grantFile(g, event.callId), rec);
  }
  return { answer: "ask", selfApprovable: self };
}

// ─── The host's post-tool event ─────────────────────────────────────────

export type HostPromptCompletion =
  | Readonly<{ ok: true; selfApprovable: boolean }>
  | Readonly<{
      ok: false;
      code: "approval-not-from-person";
      reason: string;
      /** Files put back from their snapshot (or removed: they did not exist before). */
      reverted: readonly string[];
      /** Where each written file was kept before it was put back. */
      quarantined: readonly { path: string; to: string }[];
      /** Files that could not be put back, and why. */
      failures: readonly { path: string; error: string }[];
    }>;

function readGrant(g: HostPromptGuard, callId: string): GrantRecord | "unreadable" | null {
  let text: string;
  try {
    text = fs.readFileSync(grantFile(g, callId), "utf8");
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ENOENT" ? null : "unreadable";
  }
  try {
    const v = JSON.parse(text) as GrantRecord;
    return v && v.v === 1 && v.callId === callId ? v : "unreadable";
  } catch {
    return "unreadable";
  }
}

function putBack(
  t: TargetRecord,
  content: Buffer | null,
  keepDir: string,
  i: number,
): { quarantined: { path: string; to: string } | null } {
  let quarantined: { path: string; to: string } | null = null;
  let st: fs.Stats | null = null;
  try {
    st = fs.lstatSync(t.path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
  if (st) {
    if (!st.isFile()) {
      throw new Error("it is no longer a regular file");
    }
    fs.mkdirSync(keepDir, { recursive: true, mode: 0o700 });
    const to = path.join(keepDir, `${i}-${path.basename(t.path)}`);
    fs.copyFileSync(t.path, to);
    fs.chmodSync(to, 0o600);
    quarantined = { path: t.path, to };
  }
  if (content === null) {
    fs.rmSync(t.path, { force: true });
  } else {
    const tmp = path.join(
      path.dirname(t.path),
      `.${path.basename(t.path)}.enclawed-revert.${process.pid}`,
    );
    fs.writeFileSync(tmp, content, { mode: st ? st.mode & 0o777 : 0o644 });
    fs.renameSync(tmp, t.path);
  }
  return { quarantined };
}

/**
 * The host ran a call (its post-tool event): spend the call's grant. A call
 * the host could approve by itself must have run in a person-held mode, with
 * the input that was asked; otherwise its writes are quarantined and put
 * back from their snapshots, and the host session is held. `null`: nothing
 * was asked at the host's prompt for this call.
 */
export async function completeHostPromptAsk(
  g: HostPromptGuard,
  call: Readonly<{
    callId: string | null;
    /** The host's mode when it ran the call. */
    hostMode: string | null;
    /** Digest of the input that ran (inputDigest). */
    digest: string;
    store: Pick<HistoryStore, "readVerified">;
    now?: () => number;
  }>,
): Promise<HostPromptCompletion | null> {
  if (!call.callId) {
    return null;
  }
  const grant = readGrant(g, call.callId);
  if (grant === null) {
    return null;
  }
  fs.rmSync(grantFile(g, call.callId), { force: true });
  if (grant === "unreadable") {
    // A grant that cannot be read cannot vouch for anything: fail closed.
    return violation(g, call, null, "the grant written when it was asked could not be read", []);
  }
  if (!grant.selfApprovable) {
    return { ok: true, selfApprovable: false };
  }
  const why = !isPersonHeldMode(call.hostMode, g.host.personModes, g.host.modeOrder)
    ? `the host ran it in its ${q(call.hostMode ?? "unknown", { max: 40 })} mode, where its prompt approves such a call by itself (a mode switch while the prompt was open), so no person's answer is on record`
    : call.digest !== grant.digest
      ? "the input that ran is not the input that was asked"
      : null;
  if (!why) {
    return { ok: true, selfApprovable: true };
  }
  return violation(g, call, grant, why, grant.targets);
}

async function violation(
  g: HostPromptGuard,
  call: Readonly<{
    callId: string | null;
    store: Pick<HistoryStore, "readVerified">;
    now?: () => number;
  }>,
  grant: GrantRecord | null,
  why: string,
  targets: readonly TargetRecord[],
): Promise<HostPromptCompletion> {
  const now = (call.now ?? Date.now)();
  // Hold first: whatever happens to the files, nothing else runs in this session.
  const hold: HoldRecord = {
    v: 1,
    since: now,
    callId: call.callId,
    tool: grant?.tool ?? null,
    reason: why,
  };
  writeJson(holdFile(g), hold);
  const keepDir = path.join(g.quarantineDir, `${now}-${sha256(call.callId ?? "").slice(0, 12)}`);
  const reverted: string[] = [];
  const quarantined: { path: string; to: string }[] = [];
  const failures: { path: string; error: string }[] = [];
  for (const [i, t] of targets.entries()) {
    try {
      const content =
        t.prior === "absent" || !t.snapshot ? null : await call.store.readVerified(t.snapshot);
      const r = putBack(t, content, keepDir, i);
      if (r.quarantined) {
        quarantined.push(r.quarantined);
      }
      reverted.push(t.path);
    } catch (err) {
      failures.push({
        path: t.path,
        error: sanitizeText((err as Error)?.message ?? err, { max: 200 }),
      });
    }
  }
  const put = reverted.length
    ? ` Enclawed put back ${reverted.map((p) => q(p, { max: 200 })).join(", ")} from the snapshot taken before the call; what the call wrote is kept in quarantine.`
    : "";
  const failed = failures.length
    ? ` Could not put back: ${failures.map((f) => `${q(f.path, { max: 200 })} (${f.error})`).join(", ")}.`
    : "";
  return {
    ok: false,
    code: "approval-not-from-person",
    reason: `${REASON_PREFIX}a call that needed a person's answer ran without one: ${why}.${put}${failed} This session is held: every further tool call is refused; start a new session after checking the change.`,
    reverted,
    quarantined,
    failures,
  };
}

/** Why the host session is held (a call ran without the person's answer), or null. An unreadable hold holds. */
export function hostPromptHold(g: HostPromptGuard): string | null {
  let text: string;
  try {
    text = fs.readFileSync(holdFile(g), "utf8");
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ENOENT"
      ? null
      : "the session's hold could not be read";
  }
  try {
    const v = JSON.parse(text) as HoldRecord;
    return typeof v?.reason === "string" ? v.reason : "the session's hold is unreadable";
  } catch {
    return "the session's hold is unreadable";
  }
}
