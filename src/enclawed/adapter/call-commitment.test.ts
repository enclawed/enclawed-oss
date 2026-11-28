// The per-call device commitment: encoding, evidence binding, chain
// verification and the policy replay (attack side and legitimate side).

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type CallCommitmentCall,
  type CommitmentLaunch,
  callCommitment,
  canonicalPolicy,
  encodeCallCommitment,
  evidenceCovers,
  policyDigestOf,
  replayDecision,
  signatureLink,
  verifyCallChain,
} from "./call-commitment.js";

// A device stand-in: an HMAC under a key only the "device" has.
const KEY = Buffer.alloc(32, 7);
const sign = (commitment: string) => ({
  sig: createHmac("sha256", KEY).update(commitment).digest("hex"),
});
const check = (commitment: string, s: unknown) =>
  (s as { sig?: string })?.sig === sign(commitment).sig
    ? null
    : "the device did not sign this commitment";

const policy = canonicalPolicy({
  enforceAllowlists: true,
  allowedTools: new Set(["read", "bash", "write"]),
  preApprovedIrreversibleTools: new Set(["write"]),
});
const NONCE = "ab".repeat(16);
const launch: CommitmentLaunch = {
  sessionNonce: NONCE,
  required: true,
  policyDigest: policyDigestOf(policy),
  measurementDigest: "cd".repeat(32),
  policy,
};

const call = (over: Partial<CallCommitmentCall> = {}): CallCommitmentCall => ({
  callId: "call-1",
  tool: "Read",
  inputDigest: "11".repeat(32),
  decision: "allow",
  answered: "allow",
  codes: ["read-only"],
  reversible: true,
  policyIds: ["read"],
  approvalRoute: "person",
  approvedBy: null,
  ...over,
});

/** A session as a genuine launcher would commit it. */
function session(calls: CallCommitmentCall[]) {
  let previous: string | null = null;
  return calls.map((c, seq) => {
    const part = {
      sessionNonce: NONCE,
      seq,
      policyDigest: launch.policyDigest,
      measurementDigest: launch.measurementDigest,
      previous,
    };
    const commitment = callCommitment({ ...c, ...part });
    const signature = sign(commitment);
    previous = signatureLink(signature);
    return {
      callId: c.callId,
      answered: c.answered,
      commitmentCall: c,
      commitment: { v: 1, ...part, commitment, signature },
    };
  });
}

describe("call commitment encoding", () => {
  it("is deterministic, domain-separated and changes with every field", () => {
    const f = {
      ...call(),
      sessionNonce: NONCE,
      seq: 0,
      policyDigest: launch.policyDigest,
      measurementDigest: launch.measurementDigest,
      previous: null,
    };
    expect(callCommitment(f)).toBe(callCommitment({ ...f }));
    expect(encodeCallCommitment(f).subarray(0, 27).toString()).toBe("enclawed.call-commitment.v1");
    const variants = [
      { seq: 1 },
      { callId: "call-2" },
      { decision: "ask" as const },
      { answered: "deny" as const },
      { codes: ["read-only", "x"] },
      { codes: ["read-onlyx"] },
      { reversible: false },
      { policyIds: ["bash"] },
      { approvalRoute: "no-person" },
      { approvedBy: "host-prompt" as const },
      { policyDigest: "ee".repeat(32) },
      { measurementDigest: "ee".repeat(32) },
      { previous: "ee".repeat(32) },
      { inputDigest: null },
    ];
    const seen = new Set([callCommitment(f)]);
    for (const v of variants) {
      seen.add(callCommitment({ ...f, ...v }));
    }
    expect(seen.size).toBe(variants.length + 1);
  });

  it("refuses malformed fields", () => {
    const f = {
      ...call(),
      sessionNonce: NONCE,
      seq: 0,
      policyDigest: launch.policyDigest,
      measurementDigest: launch.measurementDigest,
      previous: null,
    };
    expect(() => callCommitment({ ...f, seq: -1 })).toThrow();
    expect(() => callCommitment({ ...f, decision: "maybe" as never })).toThrow();
    expect(() => callCommitment({ ...f, policyDigest: "zz" })).toThrow();
  });

  it("evidence covers exactly the call it was made for", () => {
    const [r] = session([call()]);
    expect(evidenceCovers(call(), r.commitment)).toBeNull();
    expect(evidenceCovers(call({ decision: "deny", answered: "deny" }), r.commitment)).toMatch(
      /not for this call/,
    );
    expect(evidenceCovers(call(), null)).toMatch(/no commitment/);
  });
});

describe("verifyCallChain", () => {
  const calls = [
    call(),
    call({ callId: "call-2", tool: "Bash", policyIds: ["bash"] }),
    call({ callId: "call-3" }),
  ];

  it("a genuine session verifies, with its end", () => {
    const recs = session(calls);
    const last = signatureLink((recs[2].commitment as { signature: unknown }).signature);
    const v = verifyCallChain({
      launch,
      records: recs,
      checkSignature: check,
      end: { count: 3, last },
    });
    expect(v.issues).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.committed).toBe(3);
  });

  it("an unsigned call in a held session fails (a hook that skipped the device)", () => {
    const recs = session(calls);
    const forged = [
      recs[0],
      { callId: "call-2", answered: "allow", commitmentCall: calls[1] },
      recs[2],
    ];
    const v = verifyCallChain({ launch, records: forged, checkSignature: check });
    expect(v.issues.map((i) => i.code)).toContain("uncommitted-call");
  });

  it("an uncommitted deny where the device could not be reached is not a gap", () => {
    const recs = session(calls);
    const withDeny = [
      recs[0],
      { callId: "x", answered: "deny", commitment: { error: "device unreachable" } },
      recs[1],
      recs[2],
    ];
    expect(verifyCallChain({ launch, records: withDeny, checkSignature: check }).ok).toBe(true);
  });

  it("a missing, extra or reordered call breaks the chain", () => {
    const recs = session(calls);
    expect(
      verifyCallChain({ launch, records: [recs[0], recs[2]], checkSignature: check }).issues.map(
        (i) => i.code,
      ),
    ).toEqual(expect.arrayContaining(["sequence-gap", "chain-broken"]));
    expect(
      verifyCallChain({ launch, records: [recs[1], recs[0], recs[2]], checkSignature: check }).ok,
    ).toBe(false);
    expect(verifyCallChain({ launch, records: [...recs, recs[2]], checkSignature: check }).ok).toBe(
      false,
    );
  });

  it("a truncated tail is found against the launcher's end record", () => {
    const recs = session(calls);
    const last = signatureLink((recs[2].commitment as { signature: unknown }).signature);
    const v = verifyCallChain({
      launch,
      records: recs.slice(0, 2),
      checkSignature: check,
      end: { count: 3, last },
    });
    expect(v.issues.map((i) => i.code)).toContain("end-mismatch");
  });

  it("an edited decision, a forged signature or another policy fails", () => {
    const recs = session(calls);
    const edited = [
      { ...recs[0], commitmentCall: { ...calls[0], decision: "deny", answered: "deny" } },
      recs[1],
      recs[2],
    ];
    expect(
      verifyCallChain({ launch, records: edited, checkSignature: check }).issues.map((i) => i.code),
    ).toContain("commitment-mismatch");
    const forgedSig = [
      { ...recs[0], commitment: { ...recs[0].commitment, signature: { sig: "00" } } },
      recs[1],
      recs[2],
    ];
    expect(
      verifyCallChain({ launch, records: forgedSig, checkSignature: check }).issues.map(
        (i) => i.code,
      ),
    ).toContain("bad-signature");
    const otherPolicy = { ...launch, policyDigest: "ff".repeat(32), policy: null };
    expect(
      verifyCallChain({ launch: otherPolicy, records: recs, checkSignature: check }).issues.map(
        (i) => i.code,
      ),
    ).toContain("policy-changed");
    const otherNonce = { ...launch, sessionNonce: "cd".repeat(16) };
    expect(
      verifyCallChain({ launch: otherNonce, records: recs, checkSignature: check }).issues.map(
        (i) => i.code,
      ),
    ).toContain("foreign-session");
  });

  it("a launch policy that is not the committed digest fails", () => {
    const v = verifyCallChain({
      launch: { ...launch, policy: canonicalPolicy({ enforceAllowlists: false }) },
      records: [],
      checkSignature: check,
    });
    expect(v.issues.map((i) => i.code)).toContain("launch-policy-mismatch");
  });

  it("a correctly signed decision the recorded policy does not allow is a mismatch (a lying hook)", () => {
    const lie = call({ callId: "c", tool: "WebFetch", policyIds: ["webfetch"], codes: ["fetch"] });
    const v = verifyCallChain({ launch, records: session([lie]), checkSignature: check });
    expect(v.issues.map((i) => i.code)).toContain("decision-mismatch");
  });
});

describe("replayDecision", () => {
  it("accepts what the policy allows", () => {
    expect(replayDecision(policy, call())).toBeNull();
    expect(
      replayDecision(
        policy,
        call({
          tool: "Write",
          policyIds: ["write"],
          reversible: false,
          codes: ["x", "pre-approved"],
        }),
      ),
    ).toBeNull();
    expect(
      replayDecision(
        policy,
        call({
          decision: "ask",
          answered: "allow",
          approvedBy: "enclawed-prompt",
          reversible: false,
        }),
      ),
    ).toBeNull();
    expect(
      replayDecision(policy, call({ decision: "deny", answered: "deny", policyIds: ["webfetch"] })),
    ).toBeNull();
    expect(replayDecision(policy, call({ decision: "allow", answered: "deny" }))).toBeNull();
  });

  it("refuses what it does not", () => {
    const bad = [
      call({ decision: "deny", answered: "allow" }),
      call({ policyIds: ["webfetch"] }),
      call({ tool: "Bash", policyIds: ["bash"], reversible: false, codes: ["x", "pre-approved"] }),
      call({ reversible: false, codes: ["x"] }),
      call({ reversible: null }),
      call({ decision: "ask", answered: "allow", approvedBy: null }),
      call({ decision: "ask", answered: "deny", approvalRoute: "no-person" }),
      call({ decision: "allow", answered: "ask" }),
    ];
    for (const c of bad) {
      expect(replayDecision(policy, c)).not.toBeNull();
    }
  });
});
