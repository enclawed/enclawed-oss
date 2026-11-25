// enclawed adapter kit: approval binding.
//
// An "ask" is a question for a person, and the answer must be bound to the
// one call it was asked about. No approval signal a host CLI emits can be
// trusted on its own: a process of the same user can run the genuine hook
// command on any input and produce every hook event. So:
//
//   - The engine issues an ApprovalRequest bound to the call: its id, its
//     tool, and a digest over the tool and every key of its input.
//   - The adapter shows the call's effect in plain words (./approval-effect.ts:
//     what cannot be taken back, which path or host), Enclawed's reason, and
//     what to type: a word taken from the effect's target (its name) followed
//     by a random three-letter code, on a prompt it owns (a terminal, a
//     dialog), pausing the host so keys typed earlier or injected by a
//     process that cannot see the prompt do not answer it. Only that answer
//     approves: it cannot be typed without reading what is affected.
//   - The engine accepts the answer only for that request, once, before it
//     expires, with the code, for the same call id, the same tool and the
//     same input. Anything else denies.
//
// Separately, bindingOf/bindingMatches bind a reported decision to the call
// a transcript shows (portability requirement R4), and decisionViolation says
// whether a call that ran broke the decision made for it.
//
// Ported from codenclawed's approval.mjs, call-binding.mjs and
// launcher.mjs (decisionViolation).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { canonicalJson } from "../mcp-tool-pins.js";
import {
  approvalCode,
  approvalConfirmation,
  normalizeConfirmation,
  type ApprovalEffect,
} from "./approval-effect.js";
import type { ApprovalAnswer, ApprovalRequest, Outcome } from "./types.js";

export { approvalCode };

/**
 * How long a person has to answer an approval prompt. An internal constant,
 * never a setting: an unanswered question denies, so a longer timeout only
 * widens the window in which a call waits on an unattended terminal.
 */
export const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;
/** @deprecated the same constant under its earlier name. */
export const DEFAULT_APPROVAL_TTL_MS = APPROVAL_TIMEOUT_MS;
/** What the host's pre-tool hook timeout must exceed the approval timeout by (the hook waits for the answer). */
export const APPROVAL_HOOK_MARGIN_S = 30;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Path keys whose value a host may rewrite to an absolute form before the hook sees it. */
export const PATH_KEYS: readonly string[] = ["file_path", "notebook_path", "path"];

export type CallBinding = Readonly<{
  /** key -> SHA-256 of the canonical JSON of its value. */
  keys: Readonly<Record<string, string>>;
  /** The raw value of the path keys (capped), for the absolute-form comparison. */
  paths: Readonly<Record<string, string>>;
}>;

/** What a decision is bound to: a digest per top-level key, and the raw path keys. */
export function bindingOf(params: unknown): CallBinding {
  const keys: Record<string, string> = {};
  const paths: Record<string, string> = {};
  if (params && typeof params === "object" && !Array.isArray(params)) {
    const rec = params as Record<string, unknown>;
    for (const k of Object.keys(rec).toSorted()) {
      keys[k] = sha256(canonicalJson(rec[k]));
      const v = rec[k];
      if (PATH_KEYS.includes(k) && typeof v === "string") {
        paths[k] = v.slice(0, 4096);
      }
    }
  }
  return { keys, paths };
}

/** One digest over the tool and the whole input: what an approval is for. */
export function callDigest(tool: string, params: unknown): string {
  return sha256(canonicalJson({ tool, params: params ?? {} }));
}

function isInside(dir: string, p: string): boolean {
  const rel = path.relative(dir, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// May `decided` (the hook's absolute path) be the host's rewrite of `written`
// (the transcript's path)? Only by equality of resolved absolute paths.
function sameCallPath(
  written: unknown,
  decided: unknown,
  ctx: { cwd: string | null; home: string | null; callCwd: string | null },
): boolean {
  if (typeof written !== "string" || typeof decided !== "string") {
    return false;
  }
  if (written === decided) {
    return true;
  }
  if (!path.isAbsolute(decided)) {
    return false;
  }
  const norm = path.normalize(decided);
  if (path.isAbsolute(written)) {
    return path.normalize(written) === norm;
  }
  if (written === "~" || written.startsWith("~/")) {
    return Boolean(ctx.home) && path.join(ctx.home as string, written.slice(1)) === norm;
  }
  const bases: string[] = [];
  if (ctx.cwd && path.isAbsolute(ctx.cwd)) {
    bases.push(ctx.cwd);
    if (
      ctx.callCwd &&
      path.isAbsolute(ctx.callCwd) &&
      isInside(ctx.cwd, path.normalize(ctx.callCwd))
    ) {
      bases.push(path.normalize(ctx.callCwd));
    }
  }
  return bases.some((b) => path.resolve(b, written) === norm);
}

export type BindingCheck =
  | { ok: true }
  | { ok: false; code: "tool-name-mismatch" | "tool-input-mismatch"; reason: string };

/**
 * Does a reported decision match the call the transcript shows? Every key the
 * transcript's input has must be in the decided input with an equal value; a
 * path key may instead be the absolute form of the transcript's path. Extra
 * keys in the decided input are allowed (hosts add derived fields).
 */
export function bindingMatches(
  reported: { tool: string | null; binding: CallBinding | null },
  seen: { name: string | null; input: unknown; cwd?: string | null },
  ctx: { cwd?: string | null; home?: string | null } = {},
): BindingCheck {
  if (reported.tool !== seen.name) {
    return {
      ok: false,
      code: "tool-name-mismatch",
      reason: `the hook decided a ${reported.tool ?? "(no name)"} call, but the transcript's call is ${seen.name ?? "(no name)"}`,
    };
  }
  const want =
    seen.input && typeof seen.input === "object" && !Array.isArray(seen.input)
      ? (seen.input as Record<string, unknown>)
      : {};
  const got = reported.binding?.keys ?? {};
  for (const k of Object.keys(want)) {
    if (got[k] === sha256(canonicalJson(want[k]))) {
      continue;
    }
    if (
      PATH_KEYS.includes(k) &&
      sameCallPath(want[k], reported.binding?.paths?.[k], {
        cwd: ctx.cwd ?? null,
        home: ctx.home ?? null,
        callCwd: seen.cwd ?? null,
      })
    ) {
      continue;
    }
    return {
      ok: false,
      code: "tool-input-mismatch",
      reason: `the input the hook decided on differs from the transcript's ${seen.name} call in ${JSON.stringify(k)}`,
    };
  }
  return { ok: true };
}

export type ApprovalVerdict = Readonly<{
  approved: boolean;
  code:
    | "approved"
    | "unknown-request"
    | "already-answered"
    | "expired"
    | "no-answer"
    | "wrong-code"
    | "other-call"
    | "other-tool"
    | "input-changed";
  reason: string;
}>;

/** Does the typed text approve? Letters and digits compared, case and separators ignored. */
function sameCode(typed: string, code: string): boolean {
  const a = Buffer.from(normalizeConfirmation(typed), "utf8");
  const b = Buffer.from(normalizeConfirmation(code), "utf8");
  return b.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The approvals of one session: each request is answered at most once, by
 * its code, for the call it was issued for, before it expires.
 */
export class ApprovalLedger {
  private readonly open = new Map<string, ApprovalRequest>();
  private readonly answered = new Set<string>();

  constructor(private readonly opts: { now?: () => number; code?: () => string } = {}) {}

  /**
   * Issue a request for a call the engine decided "ask". The answer is
   * derived from the call's effect (./approval-effect.ts): the word of what it
   * acts on, then a random code; with no effect given, the tool is what it
   * acts on.
   */
  request(call: {
    callId: string | null;
    tool: string;
    params: unknown;
    reason: string;
    effect?: ApprovalEffect | null;
  }): ApprovalRequest {
    const now = (this.opts.now ?? Date.now)();
    const effect: ApprovalEffect = call.effect ?? {
      summary: `may not be undoable: runs the tool ${call.tool.slice(0, 120)}`,
      irreversible: null,
      target: { kind: "tool", name: call.tool },
    };
    const confirmation = approvalConfirmation(effect, (this.opts.code ?? approvalCode)());
    const req: ApprovalRequest = {
      type: "approval-request",
      id: randomBytes(16).toString("hex"),
      callId: call.callId,
      tool: call.tool,
      reason: call.reason,
      effect,
      confirm: confirmation.prompt,
      code: confirmation.answer,
      bindingDigest: callDigest(call.tool, call.params),
      issuedAt: now,
      expiresAt: now + APPROVAL_TIMEOUT_MS,
    };
    this.open.set(req.id, req);
    return req;
  }

  /** Check an answer. The request is spent whatever the verdict (one try per prompt). */
  answer(a: ApprovalAnswer): ApprovalVerdict {
    if (this.answered.has(a.requestId)) {
      return {
        approved: false,
        code: "already-answered",
        reason: "this approval was already answered",
      };
    }
    const req = this.open.get(a.requestId);
    if (!req) {
      return { approved: false, code: "unknown-request", reason: "no such approval was asked" };
    }
    this.open.delete(a.requestId);
    this.answered.add(a.requestId);
    if ((this.opts.now ?? Date.now)() > req.expiresAt) {
      return { approved: false, code: "expired", reason: "no answer in time" };
    }
    if (a.typed === null) {
      return { approved: false, code: "no-answer", reason: "no answer was given" };
    }
    if (!sameCode(a.typed, req.code)) {
      return {
        approved: false,
        code: "wrong-code",
        reason: "the code typed was not the one shown",
      };
    }
    if (a.callId !== req.callId) {
      return { approved: false, code: "other-call", reason: "the answer is for another call" };
    }
    if (a.tool !== req.tool) {
      return { approved: false, code: "other-tool", reason: "the answer is for another tool" };
    }
    if (callDigest(a.tool, a.params) !== req.bindingDigest) {
      return {
        approved: false,
        code: "input-changed",
        reason: "the call's input changed after the question was asked",
      };
    }
    return {
      approved: true,
      code: "approved",
      reason: "approved by a person at Enclawed's prompt",
    };
  }

  /** Requests still waiting for an answer. */
  pending(): ApprovalRequest[] {
    return [...this.open.values()];
  }
}

// ─── The timed prompt ───────────────────────────────────────────────────

/**
 * The pre-tool hook timeout the adapter writes into the host's settings when
 * the hook waits for the launcher's prompt: at least the host's own minimum,
 * and longer than the approval timeout, so the prompt's deny (not the host's
 * hook timeout) ends an unanswered question.
 */
export function approvalHookTimeoutS(hostMinimumS: number): number {
  const min = Number.isFinite(hostMinimumS) && hostMinimumS > 0 ? Math.ceil(hostMinimumS) : 0;
  return Math.max(min, Math.ceil(APPROVAL_TIMEOUT_MS / 1000) + APPROVAL_HOOK_MARGIN_S);
}

/** What the adapter's prompt read: the typed text, or null with why nothing was read. */
export type PromptRead = Readonly<{ answer: string | null; reason?: string }>;

export type TimedApproval = Readonly<{
  approved: boolean;
  code: "approved" | "timeout" | "no-answer" | "wrong-code" | "prompt-failed";
  reason: string;
}>;

/**
 * Ask once, with the kit's timeout: only `code` (trimmed, any case) approves;
 * no answer within APPROVAL_TIMEOUT_MS, no terminal, a prompt that throws, or
 * any other text denies. A late answer never approves: the verdict is final at
 * the deadline. `read` is the adapter's prompt (it gets an AbortSignal that
 * fires at the deadline so it can close its terminal). `setTimer` is a seam
 * for tests; it gets the constant's milliseconds.
 */
export function askWithinTimeout(o: {
  code: string;
  read: (signal: AbortSignal) => Promise<PromptRead>;
  setTimer?: (fn: () => void, ms: number) => () => void;
}): Promise<TimedApproval> {
  const abort = new AbortController();
  return new Promise<TimedApproval>((resolve) => {
    let done = false;
    let cancelTimer: () => void = () => {};
    const finish = (v: TimedApproval) => {
      if (done) {
        return;
      }
      done = true;
      cancelTimer();
      abort.abort();
      resolve(v);
    };
    const set =
      o.setTimer ??
      ((fn: () => void, ms: number) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      });
    cancelTimer = set(
      () => finish({ approved: false, code: "timeout", reason: "no answer in time" }),
      APPROVAL_TIMEOUT_MS,
    );
    let pending: Promise<PromptRead>;
    try {
      pending = o.read(abort.signal);
    } catch (err) {
      pending = Promise.reject(err);
    }
    pending.then(
      (r) => {
        if (r === null || typeof r !== "object" || typeof r.answer !== "string") {
          const why = r && typeof r === "object" && typeof r.reason === "string" ? r.reason : null;
          finish({ approved: false, code: "no-answer", reason: why ?? "no answer was given" });
          return;
        }
        if (typeof o.code !== "string" || o.code === "" || !sameCode(r.answer, o.code)) {
          finish({
            approved: false,
            code: "wrong-code",
            reason: r.reason ?? "the code typed was not the one shown",
          });
          return;
        }
        finish({ approved: true, code: "approved", reason: "approved at Enclawed's prompt" });
      },
      (err: unknown) =>
        finish({
          approved: false,
          code: "prompt-failed",
          reason: `the prompt failed (${err instanceof Error ? err.message : String(err)})`,
        }),
    );
  });
}

/**
 * Did a call that ran break the decision made for it? null: no; "wait": not
 * decidable yet; otherwise what it ran against. `final` turns "wait" into a
 * verdict (the session is ending).
 */
export function decisionViolation(
  decision: Outcome | null,
  o: {
    approvalByEnclawedPrompt: boolean;
    approved?: boolean;
    personReachable: boolean;
    final?: boolean;
  },
): null | "wait" | "deny" | "ask" | "ask-without-person" | "no-decision" {
  if (decision === "allow") {
    return null;
  }
  if (decision === "deny") {
    return "deny";
  }
  if (decision === "ask") {
    if (!o.personReachable) {
      return "ask-without-person";
    }
    if (o.approvalByEnclawedPrompt) {
      return o.approved ? null : o.final ? "ask" : "wait";
    }
    // The host's own approval route answered; the kit cannot verify it.
    return o.approved ? null : o.final ? "ask" : "wait";
  }
  return o.final ? "no-decision" : "wait";
}
