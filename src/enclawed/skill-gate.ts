// Capability gate (paper §4).
//
// The gate sits between the LLM-driven agent and the external world. It
// receives a CapabilityCall, looks up the active skill's verification level,
// and routes:
//
//   unverified -> every irreversible call walks HITL, regardless of whether
//                 the cap is in M.caps. Reversible calls run through the
//                 transaction buffer.
//   declared   -> calls with (cap, target) in M.caps run through the
//                 transaction buffer for reversible, or directly for
//                 irreversible (audited but not gated). Calls outside M.caps
//                 walk HITL.
//   tested     -> same as declared; the runtime additionally checks the
//                 biconditional between rounds (caller decides cadence).
//   formal     -> same as tested at run time.
//
// Audit records use the typed wire shape from paper §4.3:
//   irreversible.request, irreversible.decision,
//   irreversible.executed, irreversible.error
// All four records carry a shared requestId so the trace is reconstructable.

import { randomUUID } from "node:crypto";

import type { AuditLogger } from "./audit-log.js";
import {
  type CapabilityCall,
  isIrreversible,
  isReversible,
  projectionKey,
} from "./skill-capabilities.js";
import {
  type SkillManifest,
  VERIFICATION,
} from "./skill-manifest.js";
import type { Broker, BrokerRequest } from "./skill-broker.js";
import { format as formatLabel } from "./classification.js";

export class GateDeniedError extends Error {
  override name = "GateDeniedError";
  constructor(public readonly reason: string) {
    super(`gate denied: ${reason}`);
  }
}

export type ExecuteFn = (call: CapabilityCall) => Promise<{ ok: true } | { ok: false; reason: string }>;

export type GateOutcome =
  | { kind: "executed"; requestId: string; call: CapabilityCall }
  | { kind: "denied"; requestId: string; call: CapabilityCall; reason: string }
  | { kind: "error"; requestId: string; call: CapabilityCall; reason: string };

// In-memory transaction buffer for reversible calls. The gate commits on
// successful execute, rolls back on error.
type TxnEntry = {
  requestId: string;
  call: CapabilityCall;
  rollback: () => Promise<void> | void;
};

export class TransactionBuffer {
  private readonly entries: TxnEntry[] = [];

  record(entry: TxnEntry): void {
    this.entries.push(entry);
  }

  async rollbackAll(): Promise<void> {
    while (this.entries.length > 0) {
      const e = this.entries.pop();
      if (!e) break;
      try {
        await e.rollback();
      } catch {
        // best-effort
      }
    }
  }

  size(): number {
    return this.entries.length;
  }
}

export class SkillGate {
  private readonly audit: AuditLogger;
  private readonly broker: Broker;
  private readonly txn: TransactionBuffer;
  private readonly active: Map<string, SkillManifest> = new Map();
  private readonly declaredKeys: Map<string, Set<string>> = new Map();

  constructor(opts: { audit: AuditLogger; broker: Broker; txn?: TransactionBuffer }) {
    this.audit = opts.audit;
    this.broker = opts.broker;
    this.txn = opts.txn ?? new TransactionBuffer();
  }

  loadSkill(manifest: SkillManifest): void {
    this.active.set(manifest.id, manifest);
    // Pre-compute the (cap, target-pattern) projection set. We index by cap
    // alone here; the gate matches on cap membership and the target is
    // permitted at the manifest level. A finer-grained per-target match is
    // left to the policy broker.
    const keys = new Set<string>();
    for (const c of manifest.caps) keys.add(c);
    this.declaredKeys.set(manifest.id, keys);
  }

  unloadAll(): void {
    this.active.clear();
    this.declaredKeys.clear();
  }

  isLoaded(skillId: string): boolean {
    return this.active.has(skillId);
  }

  // Dispatch a capability call originating from the named skill.
  // The execute closure is supplied by the caller and represents the host
  // API the capability resolves to. The gate calls it iff the broker
  // (for HITL) or the policy (for declared) approves.
  async dispatch(input: {
    skillId: string;
    call: CapabilityCall;
    execute: ExecuteFn;
    rollback?: () => Promise<void> | void;
  }): Promise<GateOutcome> {
    const manifest = this.active.get(input.skillId);
    if (!manifest) {
      return this.denied(input.call, "skill not loaded");
    }
    const declared = this.declaredKeys.get(input.skillId)!;
    const requestId = randomUUID();

    if (isReversible(input.call.cap)) {
      // Reversible calls always execute through the txn buffer; the gate
      // does not stop to ask. Audit reflects success/failure.
      return this.executeReversible(requestId, manifest, input);
    }

    // Irreversible. Decide based on verification level.
    const v = manifest.verification;
    const inDeclared = declared.has(input.call.cap);

    if (v === VERIFICATION.UNVERIFIED) {
      return this.executeIrreversibleViaBroker(requestId, manifest, input);
    }

    if (
      (v === VERIFICATION.DECLARED ||
        v === VERIFICATION.TESTED ||
        v === VERIFICATION.FORMAL) &&
      inDeclared
    ) {
      return this.executeIrreversibleDirect(requestId, manifest, input);
    }

    // declared/tested/formal but cap is outside M.caps -> walk HITL.
    return this.executeIrreversibleViaBroker(requestId, manifest, input);
  }

  private async executeReversible(
    requestId: string,
    manifest: SkillManifest,
    input: { skillId: string; call: CapabilityCall; execute: ExecuteFn; rollback?: () => Promise<void> | void },
  ): Promise<GateOutcome> {
    await this.audit.append({
      type: "reversible.request",
      actor: input.skillId,
      level: formatLabel(manifest.label),
      payload: { requestId, call: callPayload(input.call), projection: projectionKey(input.call) },
    });
    try {
      const res = await input.execute(input.call);
      if (res.ok) {
        if (input.rollback) {
          this.txn.record({ requestId, call: input.call, rollback: input.rollback });
        }
        await this.audit.append({
          type: "reversible.executed",
          actor: input.skillId,
          level: formatLabel(manifest.label),
          payload: {
            requestId,
            call: callPayload(input.call),
            projection: projectionKey(input.call),
            ok: true,
          },
        });
        return { kind: "executed", requestId, call: input.call };
      }
      await this.audit.append({
        type: "reversible.error",
        actor: input.skillId,
        level: formatLabel(manifest.label),
        payload: { requestId, call: callPayload(input.call), reason: res.reason },
      });
      return { kind: "error", requestId, call: input.call, reason: res.reason };
    } catch (err) {
      const reason = (err as Error).message;
      await this.audit.append({
        type: "reversible.error",
        actor: input.skillId,
        level: formatLabel(manifest.label),
        payload: { requestId, call: callPayload(input.call), reason },
      });
      return { kind: "error", requestId, call: input.call, reason };
    }
  }

  private async executeIrreversibleViaBroker(
    requestId: string,
    manifest: SkillManifest,
    input: { skillId: string; call: CapabilityCall; execute: ExecuteFn },
  ): Promise<GateOutcome> {
    await this.audit.append({
      type: "irreversible.request",
      actor: input.skillId,
      level: formatLabel(manifest.label),
      payload: { requestId, call: callPayload(input.call), projection: projectionKey(input.call) },
    });
    const brokerReq: BrokerRequest = Object.freeze({
      requestId,
      call: input.call,
      skillId: input.skillId,
      ts: Date.now(),
    });
    const decision = await this.broker.decide(brokerReq);
    await this.audit.append({
      type: "irreversible.decision",
      actor: input.skillId,
      level: formatLabel(manifest.label),
      payload: {
        requestId,
        call: callPayload(input.call),
        decision: decision.decision,
        broker: this.broker.id,
        reason: decision.reason ?? null,
      },
    });
    if (decision.decision === "deny") {
      return { kind: "denied", requestId, call: input.call, reason: decision.reason ?? "denied" };
    }
    return this.runIrreversible(requestId, manifest, input);
  }

  private async executeIrreversibleDirect(
    requestId: string,
    manifest: SkillManifest,
    input: { skillId: string; call: CapabilityCall; execute: ExecuteFn },
  ): Promise<GateOutcome> {
    // Verified-and-declared path: no broker stop, but full audit.
    await this.audit.append({
      type: "irreversible.request",
      actor: input.skillId,
      level: formatLabel(manifest.label),
      payload: {
        requestId,
        call: callPayload(input.call),
        projection: projectionKey(input.call),
        path: "verified-declared",
      },
    });
    await this.audit.append({
      type: "irreversible.decision",
      actor: input.skillId,
      level: formatLabel(manifest.label),
      payload: {
        requestId,
        call: callPayload(input.call),
        decision: "approve",
        broker: "verification:" + manifest.verification,
        reason: "covered by manifest caps at verification level " + manifest.verification,
      },
    });
    return this.runIrreversible(requestId, manifest, input);
  }

  private async runIrreversible(
    requestId: string,
    manifest: SkillManifest,
    input: { skillId: string; call: CapabilityCall; execute: ExecuteFn },
  ): Promise<GateOutcome> {
    try {
      const res = await input.execute(input.call);
      if (res.ok) {
        await this.audit.append({
          type: "irreversible.executed",
          actor: input.skillId,
          level: formatLabel(manifest.label),
          payload: {
            requestId,
            call: callPayload(input.call),
            projection: projectionKey(input.call),
            ok: true,
          },
        });
        return { kind: "executed", requestId, call: input.call };
      }
      await this.audit.append({
        type: "irreversible.error",
        actor: input.skillId,
        level: formatLabel(manifest.label),
        payload: { requestId, call: callPayload(input.call), reason: res.reason, ok: false },
      });
      return { kind: "error", requestId, call: input.call, reason: res.reason };
    } catch (err) {
      const reason = (err as Error).message;
      await this.audit.append({
        type: "irreversible.error",
        actor: input.skillId,
        level: formatLabel(manifest.label),
        payload: { requestId, call: callPayload(input.call), reason, ok: false },
      });
      return { kind: "error", requestId, call: input.call, reason };
    }
  }

  private async denied(call: CapabilityCall, reason: string): Promise<GateOutcome> {
    const requestId = randomUUID();
    await this.audit.append({
      type: "irreversible.decision",
      actor: "gate",
      level: null,
      payload: {
        requestId,
        call: callPayload(call),
        decision: "deny",
        broker: "gate",
        reason,
      },
    });
    return { kind: "denied", requestId, call, reason };
  }

  txnBuffer(): TransactionBuffer {
    return this.txn;
  }

  // Convenience for tests: ensure a known-irreversible cap is actually flagged.
  classify(call: CapabilityCall): "reversible" | "irreversible" {
    return isIrreversible(call.cap) ? "irreversible" : "reversible";
  }
}

function callPayload(call: CapabilityCall): Record<string, unknown> {
  return {
    cap: call.cap,
    target: call.target,
    args: call.args ?? null,
  };
}
