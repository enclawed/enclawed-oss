// enclawed adapter kit: the per-call device commitment.
//
// With a hardware root held, the device's role on a call is no longer a
// liveness answer over a random nonce: the adapter's launcher has the device
// sign a COMMITMENT to the decision itself. The commitment is a SHA-256 over
// a versioned, domain-separated, length-prefixed encoding of
//
//   the session's launch nonce, the call's sequence number in the session,
//   the call id, the tool, the digest of the input that was decided, the
//   decision and the answer given, the reason codes, reversibility, the
//   policy ids the call matched, the approval route, the digest of the
//   effective policy (approved at launch), the digest of the measured launch
//   (the code that decides), and the hash of the previous call's signature.
//
// The signature and the commitment's fields go into the call's audit record.
// Because each commitment names the previous signature, a call missing from
// the log, an extra call, or calls in another order break the chain; the
// anchored log head covers the last one. `verifyCallChain` checks a session's
// records offline: every record of a held session carries a device signature
// over the commitment recomputed from the record, the sequence is contiguous,
// the chain is intact, the digests are the launch's, and every decision is
// re-derived from the recorded policy (`replayDecision`): a decision the
// policy does not allow is a mismatch.
//
// What this does not do, stated plainly: the facts a decision rests on that
// depend on the machine at the time of the call (is this path tracked, is
// this command read-only) are attested, not re-derived; they are bound to
// the input digest the launcher compared with the host's own record of the
// call, and to the measured code that decided them. A launcher replaced on a
// host where the attacker is the same user or root can lie about its own
// measurement; that case is detected by verify (unsigned or mis-chained
// calls, a decision the recorded policy does not allow), not prevented.

import { createHash } from "node:crypto";
import { canonicalJson } from "../mcp-tool-pins.js";
import type { Outcome } from "./types.js";

export const CALL_COMMITMENT_DOMAIN = "enclawed.call-commitment.v1";
export const CALL_COMMITMENT_VERSION = 1;

const HEX32 = /^[0-9a-f]{64}$/;
const NONCE = /^[0-9a-f]{32,128}$/;
const OUTCOMES: ReadonlySet<string> = new Set(["allow", "ask", "deny"]);
const MAX_TEXT = 4096;
const MAX_LIST = 256;

/** What the engine knows about the call it decided (the adapter's committer adds the session's part). */
export type CallCommitmentCall = Readonly<{
  callId: string;
  tool: string;
  inputDigest: string | null;
  decision: Outcome;
  answered: Outcome;
  codes: readonly string[];
  reversible: boolean | null;
  policyIds: readonly string[];
  approvalRoute: string;
  /** Who answered an ask: Enclawed's own prompt, the host's prompt, or nobody. */
  approvedBy: "enclawed-prompt" | "host-prompt" | null;
}>;

/** The session's part, assigned by whoever holds the device (the launcher), never by the deciding process. */
export type CallCommitmentSession = Readonly<{
  sessionNonce: string;
  seq: number;
  policyDigest: string;
  measurementDigest: string;
  /** sha256 (hex) of the previous call's signature (canonical JSON), null for the first call. */
  previous: string | null;
}>;

export type CallCommitmentFields = CallCommitmentCall & CallCommitmentSession;

/**
 * What a committed call carries into its audit record: the session's part,
 * the commitment (hex) and the device's signature over it (opaque to the kit:
 * the adapter's device answer, checked by the adapter's `checkSignature`).
 */
export type CommitmentEvidence = Readonly<
  CallCommitmentSession & {
    v: 1;
    commitment: string;
    signature: unknown;
  }
>;

/** The adapter's committer: sends the call to the device holder and returns the signed evidence (or throws). */
export type CallCommitter = (call: CallCommitmentCall) => Promise<CommitmentEvidence>;

export class CommitmentFieldError extends Error {}

function text(v: unknown, what: string, max = MAX_TEXT): string {
  if (typeof v !== "string" || v.length > max) {
    throw new CommitmentFieldError(`${what} must be a string of at most ${max} characters`);
  }
  return v;
}

function list(v: unknown, what: string): readonly string[] {
  if (!Array.isArray(v) || v.length > MAX_LIST) {
    throw new CommitmentFieldError(`${what} must be a list of at most ${MAX_LIST} strings`);
  }
  return v.map((x, i) => text(x, `${what}[${i}]`, 512));
}

function hex32(v: unknown, what: string, nullable = false): string | null {
  if (nullable && v === null) {
    return null;
  }
  if (typeof v !== "string" || !HEX32.test(v)) {
    throw new CommitmentFieldError(
      `${what} must be 64 lowercase hex digits${nullable ? " or null" : ""}`,
    );
  }
  return v;
}

function outcome(v: unknown, what: string): Outcome {
  if (typeof v !== "string" || !OUTCOMES.has(v)) {
    throw new CommitmentFieldError(`${what} must be allow, ask or deny`);
  }
  return v as Outcome;
}

/** Check and copy the fields (unknown input from a socket or a log). Throws CommitmentFieldError. */
export function commitmentFields(v: unknown): CallCommitmentFields {
  if (v === null || typeof v !== "object") {
    throw new CommitmentFieldError("the commitment fields are not an object");
  }
  const o = v as Record<string, unknown>;
  const seq = o.seq;
  if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0) {
    throw new CommitmentFieldError("seq must be a non-negative integer");
  }
  if (typeof o.sessionNonce !== "string" || !NONCE.test(o.sessionNonce)) {
    throw new CommitmentFieldError("sessionNonce must be 32 to 128 lowercase hex digits");
  }
  if (o.reversible !== null && typeof o.reversible !== "boolean") {
    throw new CommitmentFieldError("reversible must be true, false or null");
  }
  if (
    o.approvedBy !== null &&
    o.approvedBy !== "enclawed-prompt" &&
    o.approvedBy !== "host-prompt"
  ) {
    throw new CommitmentFieldError("approvedBy must be enclawed-prompt, host-prompt or null");
  }
  return {
    sessionNonce: o.sessionNonce,
    seq,
    callId: text(o.callId, "callId", 512),
    tool: text(o.tool, "tool", 512),
    inputDigest: hex32(o.inputDigest, "inputDigest", true),
    decision: outcome(o.decision, "decision"),
    answered: outcome(o.answered, "answered"),
    codes: list(o.codes, "codes"),
    reversible: o.reversible,
    policyIds: list(o.policyIds, "policyIds"),
    approvalRoute: text(o.approvalRoute, "approvalRoute", 64),
    approvedBy: o.approvedBy,
    policyDigest: hex32(o.policyDigest, "policyDigest") as string,
    measurementDigest: hex32(o.measurementDigest, "measurementDigest") as string,
    previous: hex32(o.previous, "previous", true),
  };
}

// Encoding: the domain, a zero byte, then each field in this fixed order as
// tag (1 byte) | length (4 bytes, big-endian) | bytes. Strings are UTF-8;
// lists are a count (4 bytes) followed by each item length-prefixed; seq is
// 8 bytes big-endian; a tri-state is one byte (0 false, 1 true, 2 null); an
// absent digest is zero bytes. No field can run into the next.
function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

function field(tag: number, bytes: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), u32(bytes.length), bytes]);
}

const utf8 = (s: string) => Buffer.from(s, "utf8");
const strList = (xs: readonly string[]) =>
  Buffer.concat([u32(xs.length), ...xs.map((x) => Buffer.concat([u32(utf8(x).length), utf8(x)]))]);
const tri = (v: boolean | null) => Buffer.from([v === null ? 2 : v ? 1 : 0]);

/** The exact bytes the commitment hashes (exported for test vectors and other implementations). */
export function encodeCallCommitment(input: CallCommitmentFields): Buffer {
  const f = commitmentFields(input);
  const seq = Buffer.alloc(8);
  seq.writeBigUInt64BE(BigInt(f.seq));
  return Buffer.concat([
    utf8(CALL_COMMITMENT_DOMAIN),
    Buffer.from([0]),
    field(1, Buffer.from(f.sessionNonce, "hex")),
    field(2, seq),
    field(3, utf8(f.callId)),
    field(4, utf8(f.tool)),
    field(5, f.inputDigest ? Buffer.from(f.inputDigest, "hex") : Buffer.alloc(0)),
    field(6, utf8(f.decision)),
    field(7, utf8(f.answered)),
    field(8, strList(f.codes)),
    field(9, tri(f.reversible)),
    field(10, strList(f.policyIds)),
    field(11, utf8(f.approvalRoute)),
    field(12, utf8(f.approvedBy ?? "")),
    field(13, Buffer.from(f.policyDigest, "hex")),
    field(14, Buffer.from(f.measurementDigest, "hex")),
    field(15, f.previous ? Buffer.from(f.previous, "hex") : Buffer.alloc(0)),
  ]);
}

/** The commitment: SHA-256 (hex) of the encoding. This is the 32-byte nonce the device signs. */
export function callCommitment(fields: CallCommitmentFields): string {
  return createHash("sha256").update(encodeCallCommitment(fields)).digest("hex");
}

/** What the next call's `previous` names: sha256 (hex) of a signature's canonical JSON. */
export function signatureLink(signature: unknown): string {
  return createHash("sha256")
    .update(`${CALL_COMMITMENT_DOMAIN}\0link\0`)
    .update(canonicalJson(signature ?? null))
    .digest("hex");
}

/**
 * Check that `evidence` commits to exactly `call`: the commitment recomputed
 * from the call and the evidence's session part equals the one signed.
 * null when it does, else why not. (The signature itself is the adapter's.)
 */
export function evidenceCovers(call: CallCommitmentCall, evidence: unknown): string | null {
  if (evidence === null || typeof evidence !== "object") {
    return "no commitment evidence";
  }
  const e = evidence as Record<string, unknown>;
  if (e.v !== 1 || typeof e.commitment !== "string") {
    return "the commitment evidence is not version 1";
  }
  let want: string;
  try {
    want = callCommitment({
      ...call,
      sessionNonce: e.sessionNonce as string,
      seq: e.seq as number,
      policyDigest: e.policyDigest as string,
      measurementDigest: e.measurementDigest as string,
      previous: (e.previous ?? null) as string | null,
    });
  } catch (err) {
    return `the commitment evidence is malformed: ${(err as Error).message}`;
  }
  return want === e.commitment ? null : "the signed commitment is not for this call and decision";
}

// ─── The effective policy, as committed and recorded ─────────────────────

function plain(v: unknown): unknown {
  if (v instanceof Set) {
    return [...v]
      .map((x) => plain(x))
      .toSorted((a, b) =>
        canonicalJson(a) < canonicalJson(b) ? -1 : canonicalJson(a) > canonicalJson(b) ? 1 : 0,
      );
  }
  if (v instanceof Map) {
    return Object.fromEntries([...v.entries()].map(([k, x]) => [String(k), plain(x)]));
  }
  if (Array.isArray(v)) {
    return v.map((x) => plain(x));
  }
  if (v !== null && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  }
  return v;
}

/** The effective policy (and the adapter's options) in canonical plain form: sets as sorted lists. */
export function canonicalPolicy(policy: unknown, options: unknown = null): Record<string, unknown> {
  return { v: 1, policy: plain(policy), options: plain(options) };
}

/** sha256 (hex) of the canonical policy: what is approved at launch and committed per call. */
export function policyDigestOf(canonical: Record<string, unknown>): string {
  return createHash("sha256")
    .update("enclawed.policy.v1\0")
    .update(canonicalJson(canonical))
    .digest("hex");
}

// ─── Replay: the decision the recorded policy allows ─────────────────────

export type ReplayIssue = Readonly<{ code: "decision-mismatch"; detail: string }>;

const listOf = (v: unknown): readonly string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/**
 * Re-derive, from the recorded policy (canonical form), what it allows for a
 * committed call, and compare with what was decided and answered. Only the
 * policy's own rules are re-derived (the allowlist, pre-approved irreversible
 * tools, who may answer an ask); see the header for what is attested instead.
 * null when consistent.
 */
export function replayDecision(
  canonical: Record<string, unknown>,
  call: CallCommitmentCall,
): ReplayIssue | null {
  const p = (canonical.policy ?? {}) as Record<string, unknown>;
  const ids = call.policyIds.map((x) => x.toLowerCase());
  const bad = (detail: string): ReplayIssue => ({ code: "decision-mismatch", detail });
  if (call.decision === "deny") {
    return call.answered === "deny" ? null : bad("a denied call was answered as run");
  }
  if (p.enforceAllowlists === true) {
    const allowed = new Set(listOf(p.allowedTools).map((x) => x.toLowerCase()));
    if (!ids.some((id) => allowed.has(id))) {
      return bad(`the policy does not allow ${call.tool}, and the call was ${call.decision}`);
    }
  }
  const preApproved = new Set(listOf(p.preApprovedIrreversibleTools).map((x) => x.toLowerCase()));
  if (call.codes.includes("pre-approved") && !ids.some((id) => preApproved.has(id))) {
    return bad(`the call claims pre-approval the policy does not give ${call.tool}`);
  }
  if (call.decision === "allow") {
    if (call.reversible === null) {
      return bad("an allowed call carries no reversibility");
    }
    if (!call.reversible && !call.codes.includes("pre-approved")) {
      return bad("an irreversible call was allowed without a person and without pre-approval");
    }
    return call.answered === "allow"
      ? null
      : call.answered === "deny"
        ? null
        : bad("an allowed call was answered as asked");
  }
  // decision "ask"
  if (
    call.approvalRoute === "no-person" &&
    !call.codes.includes("repo-config-conflict-resolution")
  ) {
    return bad("a call was asked in a session where no person can answer");
  }
  if (call.answered === "allow" && call.approvedBy === null) {
    return bad("an asked call ran with no record of who answered");
  }
  return null;
}

// ─── Offline verification of a session's chain ──────────────────────────

/** What the launch recorded for the session's commitments. */
export type CommitmentLaunch = Readonly<{
  sessionNonce: string;
  /** The root was held: every call must be committed. */
  required: boolean;
  policyDigest: string;
  measurementDigest: string;
  /** The effective policy's canonical form, recorded at launch (to replay decisions). */
  policy: Record<string, unknown> | null;
}>;

/** One call record of the session (the audit payload of its pre-action record). */
export type CommittedRecord = Readonly<Record<string, unknown>>;

export type ChainIssueCode =
  | "launch-policy-mismatch"
  | "uncommitted-call"
  | "malformed-commitment"
  | "commitment-mismatch"
  | "bad-signature"
  | "sequence-gap"
  | "chain-broken"
  | "foreign-session"
  | "policy-changed"
  | "measurement-changed"
  | "decision-mismatch"
  | "end-mismatch";

export type ChainIssue = Readonly<{
  index: number;
  callId: string | null;
  code: ChainIssueCode;
  detail: string;
}>;

export type ChainVerdict = Readonly<{
  ok: boolean;
  committed: number;
  issues: readonly ChainIssue[];
}>;

/** The call part of a pre-action record, as the engine writes it (null when absent). */
export function recordCall(rec: CommittedRecord): CallCommitmentCall | null {
  const c = rec.commitmentCall;
  if (c === null || typeof c !== "object") {
    return null;
  }
  const o = c as Record<string, unknown>;
  try {
    const f = commitmentFields({
      ...o,
      sessionNonce: "0".repeat(32),
      seq: 0,
      policyDigest: "0".repeat(64),
      measurementDigest: "0".repeat(64),
      previous: null,
    });
    return {
      callId: f.callId,
      tool: f.tool,
      inputDigest: f.inputDigest,
      decision: f.decision,
      answered: f.answered,
      codes: f.codes,
      reversible: f.reversible,
      policyIds: f.policyIds,
      approvalRoute: f.approvalRoute,
      approvedBy: f.approvedBy,
    };
  } catch {
    return null;
  }
}

/**
 * Verify a session's committed calls, in log order. `checkSignature(commitment,
 * signature)` is the adapter's device check (null when the device signed this
 * commitment). `end`, when the session's end was recorded by the launcher: how
 * many calls it committed and the last signature's link.
 */
export function verifyCallChain(o: {
  launch: CommitmentLaunch;
  records: readonly CommittedRecord[];
  checkSignature: (commitment: string, signature: unknown) => string | null;
  end?: Readonly<{ count: number; last: string | null }> | null;
}): ChainVerdict {
  const issues: ChainIssue[] = [];
  const { launch } = o;
  if (launch.policy && policyDigestOf(launch.policy) !== launch.policyDigest) {
    issues.push({
      index: -1,
      callId: null,
      code: "launch-policy-mismatch",
      detail: "the recorded policy is not the one whose digest the launch committed to",
    });
  }
  let seq = 0;
  let previous: string | null = null;
  o.records.forEach((rec, index) => {
    const callId = typeof rec.callId === "string" ? rec.callId : null;
    const issue = (code: ChainIssueCode, detail: string) =>
      issues.push({ index, callId, code, detail });
    const ev = rec.commitment as Record<string, unknown> | null | undefined;
    const call = recordCall(rec);
    if (!ev || typeof ev !== "object" || ev.v !== 1 || !call) {
      // An uncommitted deny where the device could not be reached is a refusal, not a gap.
      const deniedUnreachable =
        rec.answered === "deny" &&
        ev !== null &&
        typeof ev === "object" &&
        typeof (ev as { error?: unknown }).error === "string";
      if (launch.required && !deniedUnreachable) {
        issue(
          "uncommitted-call",
          "a call of a session that held the hardware root carries no device commitment",
        );
      }
      return;
    }
    let fields: CallCommitmentFields;
    try {
      fields = commitmentFields({ ...call, ...ev });
    } catch (err) {
      issue("malformed-commitment", (err as Error).message);
      return;
    }
    if (fields.sessionNonce !== launch.sessionNonce) {
      issue("foreign-session", "the commitment names another session");
    }
    if (fields.seq !== seq) {
      issue("sequence-gap", `expected call ${seq}, found ${fields.seq}`);
    }
    if (fields.previous !== previous) {
      issue("chain-broken", "the commitment does not name the previous call's signature");
    }
    if (fields.policyDigest !== launch.policyDigest) {
      issue(
        "policy-changed",
        "the call was decided under another policy than the one approved at launch",
      );
    }
    if (fields.measurementDigest !== launch.measurementDigest) {
      issue(
        "measurement-changed",
        "the call was decided by other code than the code measured at launch",
      );
    }
    if (callCommitment(fields) !== ev.commitment) {
      issue("commitment-mismatch", "the recorded call is not what the commitment covers");
    }
    const why = o.checkSignature(String(ev.commitment), ev.signature);
    if (why) {
      issue("bad-signature", why);
    }
    if (launch.policy) {
      const r = replayDecision(launch.policy, call);
      if (r) {
        issue(r.code, r.detail);
      }
    }
    seq = fields.seq + 1;
    previous = signatureLink(ev.signature);
  });
  if (o.end) {
    if (o.end.count !== seq || o.end.last !== previous) {
      issues.push({
        index: o.records.length,
        callId: null,
        code: "end-mismatch",
        detail: `the launcher committed ${o.end.count} call(s), the log shows ${seq}${o.end.last !== previous ? " and another last signature" : ""}`,
      });
    }
  }
  return { ok: issues.length === 0, committed: seq, issues };
}
