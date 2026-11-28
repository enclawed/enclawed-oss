import { canonicalEgressTarget } from "./egress-target.js";

// Capability vocabulary for the skill trust schema (paper §3.5, Table 1).
//
// The vocabulary is small enough to be enumerated and large enough to
// discriminate side-effect classes. Every capability declared in a skill
// manifest must use one of these tokens; anything else is denied at parse
// time. The reversible/irreversible split is the load-bearing distinction
// the gate (paper §4.2) uses to choose between the transaction buffer and
// the HITL lifecycle.

export const CAPABILITY = Object.freeze({
  NET_EGRESS: "net.egress",
  FS_READ: "fs.read",
  FS_WRITE_REV: "fs.write.rev",
  FS_WRITE_IRREV: "fs.write.irrev",
  TOOL_INVOKE: "tool.invoke",
  SPAWN_PROC: "spawn.proc",
  PUBLISH: "publish",
  PAY: "pay",
  MUTATE_SCHEMA: "mutate.schema",
} as const);

export type CapabilityToken = (typeof CAPABILITY)[keyof typeof CAPABILITY];

export const ALL_CAPABILITIES: ReadonlyArray<CapabilityToken> = Object.freeze([
  CAPABILITY.NET_EGRESS,
  CAPABILITY.FS_READ,
  CAPABILITY.FS_WRITE_REV,
  CAPABILITY.FS_WRITE_IRREV,
  CAPABILITY.TOOL_INVOKE,
  CAPABILITY.SPAWN_PROC,
  CAPABILITY.PUBLISH,
  CAPABILITY.PAY,
  CAPABILITY.MUTATE_SCHEMA,
]);

const CAP_SET: ReadonlySet<string> = new Set<string>(ALL_CAPABILITIES);

export function isCapabilityToken(value: unknown): value is CapabilityToken {
  return typeof value === "string" && CAP_SET.has(value);
}

// Static reversibility tagging (paper §4.2). A reversible capability leaves a
// single object in a state from which the runtime, holding a recent snapshot,
// can restore the prior state. Irreversible capabilities cannot, alone, be
// rolled back.
const REVERSIBLE = new Set<CapabilityToken>([CAPABILITY.FS_READ, CAPABILITY.FS_WRITE_REV]);

export function isReversible(cap: CapabilityToken): boolean {
  return REVERSIBLE.has(cap);
}

export function isIrreversible(cap: CapabilityToken): boolean {
  return !REVERSIBLE.has(cap);
}

// A capability invocation: the token plus a structured target. Targets are
// canonicalized for the audit log and for biconditional projection.
export type CapabilityCall = Readonly<{
  cap: CapabilityToken;
  target: string;
  args?: Readonly<Record<string, unknown>>;
}>;

export function makeCall(input: {
  cap: CapabilityToken;
  target: string;
  args?: Record<string, unknown>;
}): CapabilityCall {
  if (!isCapabilityToken(input.cap)) {
    throw new TypeError(`unknown capability: ${String(input.cap)}`);
  }
  if (typeof input.target !== "string" || input.target.length === 0) {
    throw new TypeError("capability target must be a non-empty string");
  }
  return Object.freeze({
    cap: input.cap,
    target: input.target,
    args: input.args ? Object.freeze({ ...input.args }) : undefined,
  });
}

// A net.egress target is a destination profile (./egress-target.ts):
// scheme, host, port and, optionally, the request shape the destination
// takes ("https://registry.npmjs.org:443#npm-registry"). A bare host still
// parses as before (https, 443, no shape). makeEgressCall writes the
// canonical form, so two calls to the same profile project to one key.
export {
  canonicalEgressTarget,
  egressTargetString,
  parseEgressTarget,
  type EgressTarget,
} from "./egress-target.js";

export function makeEgressCall(target: string, args?: Record<string, unknown>): CapabilityCall {
  return makeCall({ cap: CAPABILITY.NET_EGRESS, target: canonicalEgressTarget(target), args });
}

// Multiset projection key used by both the gate audit and the biconditional
// checker (paper §5.2). Two calls match iff both (cap, target) projections
// match. Args are preserved in the audit but do not enter the projection.
export function projectionKey(call: { cap: string; target: string }): string {
  return JSON.stringify([call.cap, call.target]);
}
