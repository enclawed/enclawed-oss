// Human-in-the-loop (HITL) controller. See enclawed/src/hitl.mjs for the
// canonical reference; this is the TypeScript twin used by the upstream
// build. Same semantics, same wire shape on the audit log.

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

import type { AuditLogger } from "./audit-log.js";

export const SESSION_STATE = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  PAUSED: "paused",
  STOPPED: "stopped",
  COMPLETED: "completed",
  FAILED: "failed",
} as const);

export type SessionState = (typeof SESSION_STATE)[keyof typeof SESSION_STATE];

export const APPROVAL = Object.freeze({
  ALLOW: "allow",
  DENY: "deny",
} as const);

export type ApprovalDecision = (typeof APPROVAL)[keyof typeof APPROVAL];

const TERMINAL = new Set<SessionState>([
  SESSION_STATE.STOPPED, SESSION_STATE.COMPLETED, SESSION_STATE.FAILED,
]);

export class AgentStoppedError extends Error {
  override name = "AgentStoppedError";
  constructor(public readonly reason: string | null) {
    super(`agent stopped: ${reason ?? "no reason given"}`);
  }
}

export class ApprovalDeniedError extends Error {
  override name = "ApprovalDeniedError";
  constructor(public readonly actionType: string, reason?: string) {
    super(`action "${actionType}" denied${reason ? ": " + reason : ""}`);
  }
}

export type ApprovalRequest = Readonly<{
  id: string;
  sessionId: string;
  agentId: string;
  actionType: string;
  payload: unknown;
  ts: number;
  resolved: boolean;
  decision: ApprovalDecision | null;
  promise: Promise<ApprovalDecision>;
}>;

type InternalApproval = ApprovalRequest & {
  _resolve: (d: ApprovalDecision) => void;
};

export class AgentSession {
  readonly id: string = randomUUID();
  readonly agentId: string;
  state: SessionState = SESSION_STATE.PENDING;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  stopReason: string | null = null;
  private readonly _requireApproval: Set<string>;
  private _pauseGate: Promise<void> | null = null;
  private _pauseResolve: (() => void) | null = null;

  constructor(opts: {
    agentId: string;
    controller: HitlController;
    requireApprovalFor?: Iterable<string>;
  }) {
    this.agentId = String(opts.agentId);
    this._controller = opts.controller;
    this._requireApproval = new Set(opts.requireApprovalFor ?? []);
  }

  private readonly _controller: HitlController;

  start(): this {
    if (this.state !== SESSION_STATE.PENDING) {
      throw new Error(`cannot start session in state ${this.state}`);
    }
    this.state = SESSION_STATE.RUNNING;
    this.startedAt = Date.now();
    this._controller._emit("agent.started", { sessionId: this.id, agentId: this.agentId });
    return this;
  }

  pause(): void {
    if (this.state !== SESSION_STATE.RUNNING) return;
    this.state = SESSION_STATE.PAUSED;
    this._pauseGate = new Promise<void>((res) => { this._pauseResolve = res; });
    this._controller._emit("agent.paused", { sessionId: this.id, agentId: this.agentId });
  }

  resume(): void {
    if (this.state !== SESSION_STATE.PAUSED) return;
    this.state = SESSION_STATE.RUNNING;
    if (this._pauseResolve) this._pauseResolve();
    this._pauseGate = null;
    this._pauseResolve = null;
    this._controller._emit("agent.resumed", { sessionId: this.id, agentId: this.agentId });
  }

  stop(reason: string = "user-requested"): void {
    if (TERMINAL.has(this.state)) return;
    this.state = SESSION_STATE.STOPPED;
    this.stoppedAt = Date.now();
    this.stopReason = String(reason);
    if (this._pauseResolve) this._pauseResolve();
    this._controller._emit("agent.stopped", {
      sessionId: this.id, agentId: this.agentId, reason: this.stopReason,
    });
  }

  complete(): void {
    if (TERMINAL.has(this.state)) return;
    this.state = SESSION_STATE.COMPLETED;
    this.stoppedAt = Date.now();
    this._controller._emit("agent.completed", { sessionId: this.id, agentId: this.agentId });
  }

  fail(reason: string): void {
    if (TERMINAL.has(this.state)) return;
    this.state = SESSION_STATE.FAILED;
    this.stoppedAt = Date.now();
    this.stopReason = String(reason);
    this._controller._emit("agent.failed", {
      sessionId: this.id, agentId: this.agentId, reason: this.stopReason,
    });
  }

  isLive(): boolean {
    return this.state === SESSION_STATE.RUNNING || this.state === SESSION_STATE.PAUSED;
  }
  isStopped(): boolean { return TERMINAL.has(this.state); }

  async checkpoint(): Promise<void> {
    if (this.isStopped()) throw new AgentStoppedError(this.stopReason);
    while (this.state === SESSION_STATE.PAUSED) {
      await this._pauseGate;
      if (this.isStopped()) throw new AgentStoppedError(this.stopReason);
    }
  }

  async proposeAction(actionType: string, payload: unknown): Promise<ApprovalDecision> {
    await this.checkpoint();
    if (!this._requireApproval.has(actionType)) {
      this._controller._emit("agent.action.committed", {
        sessionId: this.id, agentId: this.agentId, actionType, payload,
      });
      return APPROVAL.ALLOW;
    }
    const req = this._controller._enqueueApproval({
      sessionId: this.id, agentId: this.agentId, actionType, payload,
    });
    const decision = await req.promise;
    if (this.isStopped()) throw new AgentStoppedError(this.stopReason);
    this._controller._emit("agent.action." + decision, {
      sessionId: this.id, agentId: this.agentId, actionType, payload,
    });
    if (decision === APPROVAL.DENY) throw new ApprovalDeniedError(actionType);
    return decision;
  }
}

export class HitlController extends EventEmitter {
  private _sessions = new Map<string, AgentSession>();
  private _approvals = new Map<string, InternalApproval>();
  private readonly _audit: AuditLogger | null;

  constructor(opts: { audit?: AuditLogger | null } = {}) {
    super();
    this._audit = opts.audit ?? null;
  }

  createSession(opts: { agentId: string; requireApprovalFor?: Iterable<string> }): AgentSession {
    if (!opts.agentId) throw new Error("createSession: agentId required");
    const session = new AgentSession({
      agentId: opts.agentId,
      controller: this,
      requireApprovalFor: opts.requireApprovalFor,
    });
    this._sessions.set(session.id, session);
    this._emit("session.created", { sessionId: session.id, agentId: session.agentId });
    return session;
  }

  getSession(id: string): AgentSession | undefined { return this._sessions.get(id); }
  listSessions(): AgentSession[] { return [...this._sessions.values()]; }
  liveSessions(): AgentSession[] { return this.listSessions().filter((s) => s.isLive()); }

  pendingApprovals(): ApprovalRequest[] {
    return [...this._approvals.values()].filter((a) => !a.resolved);
  }

  resolveApproval(approvalId: string, decision: ApprovalDecision): void {
    const a = this._approvals.get(approvalId);
    if (!a) throw new Error(`unknown approval id: ${approvalId}`);
    if (a.resolved) throw new Error(`approval ${approvalId} already resolved`);
    if (decision !== APPROVAL.ALLOW && decision !== APPROVAL.DENY) {
      throw new Error(`decision must be allow|deny, got ${decision}`);
    }
    (a as { resolved: boolean }).resolved = true;
    (a as { decision: ApprovalDecision | null }).decision = decision;
    a._resolve(decision);
    this._emit("approval.resolved", { id: approvalId, decision });
  }

  stopAll(reason: string = "user-requested-shutdown"): void {
    for (const s of this.liveSessions()) s.stop(reason);
  }

  /** @internal */
  _emit(type: string, payload: unknown): void {
    this.emit("event", { ts: Date.now(), type, payload });
    this.emit(type, payload);
    if (this._audit) {
      this._audit.append({
        type: "hitl." + type, actor: "hitl", level: null, payload,
      }).catch(() => {});
    }
  }

  /** @internal */
  _enqueueApproval(info: {
    sessionId: string; agentId: string; actionType: string; payload: unknown;
  }): InternalApproval {
    const id = randomUUID();
    let resolve!: (d: ApprovalDecision) => void;
    const promise = new Promise<ApprovalDecision>((res) => { resolve = res; });
    const req: InternalApproval = {
      id, sessionId: info.sessionId, agentId: info.agentId,
      actionType: info.actionType, payload: info.payload,
      ts: Date.now(), resolved: false, decision: null,
      _resolve: resolve, promise,
    };
    this._approvals.set(id, req);
    this._emit("approval.requested", {
      id, sessionId: info.sessionId, agentId: info.agentId, actionType: info.actionType,
    });
    return req;
  }
}
