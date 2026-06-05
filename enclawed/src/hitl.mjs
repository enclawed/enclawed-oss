// Human-in-the-loop (HITL) controller. Provides:
//
//   - per-agent sessions with start / pause / resume / stop / complete / fail
//     state machine
//   - cooperative cancellation: agent code awaits session.checkpoint() between
//     actions, which throws AgentStoppedError if stopped and blocks until
//     resumed if paused
//   - per-action-type approval gate: actions whose type is in the session's
//     requireApprovalFor set must wait for a human decision (allow/deny)
//     before committing; ApprovalDeniedError on deny
//   - real-time event stream on the controller (EventEmitter) so a UI / CLI /
//     remote operator can subscribe to every state transition and every
//     proposed/committed/denied action
//   - audit-log integration: every event is appended to the hash-chained log
//     when an AuditLogger is supplied
//
// Design notes:
//   * Cooperative cancellation, not preemptive: the host process cannot
//     forcibly halt an awaiting agent, only signal it. This matches Node's
//     single-threaded async model and avoids the safety hazards of forced
//     thread cancellation. An agent that ignores checkpoints can still be
//     stopped at the OS level (process signal) but that is out of scope.
//   * Approval queue is in-memory only; production deployments should
//     persist outstanding approvals so a controller restart does not lose
//     in-flight decisions.

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

export const SESSION_STATE = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

export const APPROVAL = Object.freeze({
  ALLOW: 'allow',
  DENY: 'deny',
});

const TERMINAL = new Set([SESSION_STATE.STOPPED, SESSION_STATE.COMPLETED, SESSION_STATE.FAILED]);

export class AgentStoppedError extends Error {
  constructor(reason) {
    super(`agent stopped: ${reason ?? 'no reason given'}`);
    this.name = 'AgentStoppedError';
    this.reason = reason ?? null;
  }
}

export class ApprovalDeniedError extends Error {
  constructor(actionType, reason) {
    super(`action "${actionType}" denied${reason ? ': ' + reason : ''}`);
    this.name = 'ApprovalDeniedError';
    this.actionType = actionType;
  }
}

export class AgentSession {
  constructor({ agentId, controller, requireApprovalFor = [] }) {
    this.id = randomUUID();
    this.agentId = String(agentId);
    this.controller = controller;
    this.state = SESSION_STATE.PENDING;
    this.startedAt = null;
    this.stoppedAt = null;
    this.stopReason = null;
    this._requireApproval = new Set(requireApprovalFor);
    this._pauseGate = null;
    this._pauseResolve = null;
  }

  start() {
    if (this.state !== SESSION_STATE.PENDING) {
      throw new Error(`cannot start session in state ${this.state}`);
    }
    this.state = SESSION_STATE.RUNNING;
    this.startedAt = Date.now();
    this.controller._emit('agent.started', { sessionId: this.id, agentId: this.agentId });
    return this;
  }

  pause() {
    if (this.state !== SESSION_STATE.RUNNING) return;
    this.state = SESSION_STATE.PAUSED;
    this._pauseGate = new Promise((res) => { this._pauseResolve = res; });
    this.controller._emit('agent.paused', { sessionId: this.id, agentId: this.agentId });
  }

  resume() {
    if (this.state !== SESSION_STATE.PAUSED) return;
    this.state = SESSION_STATE.RUNNING;
    if (this._pauseResolve) this._pauseResolve();
    this._pauseGate = null;
    this._pauseResolve = null;
    this.controller._emit('agent.resumed', { sessionId: this.id, agentId: this.agentId });
  }

  stop(reason = 'user-requested') {
    if (TERMINAL.has(this.state)) return;
    this.state = SESSION_STATE.STOPPED;
    this.stoppedAt = Date.now();
    this.stopReason = String(reason);
    if (this._pauseResolve) this._pauseResolve();
    this.controller._emit('agent.stopped', {
      sessionId: this.id, agentId: this.agentId, reason: this.stopReason,
    });
  }

  complete() {
    if (TERMINAL.has(this.state)) return;
    this.state = SESSION_STATE.COMPLETED;
    this.stoppedAt = Date.now();
    this.controller._emit('agent.completed', { sessionId: this.id, agentId: this.agentId });
  }

  fail(reason) {
    if (TERMINAL.has(this.state)) return;
    this.state = SESSION_STATE.FAILED;
    this.stoppedAt = Date.now();
    this.stopReason = String(reason);
    this.controller._emit('agent.failed', {
      sessionId: this.id, agentId: this.agentId, reason: this.stopReason,
    });
  }

  // A session is "live" only after start() and before any terminal state.
  // PENDING sessions exist in the registry but are not considered live.
  isLive() {
    return this.state === SESSION_STATE.RUNNING || this.state === SESSION_STATE.PAUSED;
  }
  isStopped() { return TERMINAL.has(this.state); }

  // Cooperative checkpoint. Agent code must await this between actions for
  // pause/stop to be observable.
  async checkpoint() {
    if (this.isStopped()) throw new AgentStoppedError(this.stopReason);
    while (this.state === SESSION_STATE.PAUSED) {
      await this._pauseGate;
      if (this.isStopped()) throw new AgentStoppedError(this.stopReason);
    }
  }

  // Propose an action. If its type requires approval, await a human
  // decision before returning. Throws ApprovalDeniedError on deny.
  async proposeAction(actionType, payload) {
    await this.checkpoint();
    if (!this._requireApproval.has(actionType)) {
      this.controller._emit('agent.action.committed', {
        sessionId: this.id, agentId: this.agentId, actionType, payload,
      });
      return APPROVAL.ALLOW;
    }
    const req = this.controller._enqueueApproval({
      sessionId: this.id, agentId: this.agentId, actionType, payload,
    });
    const decision = await req.promise;
    // Re-check state after awaiting; the agent may have been stopped
    // while waiting on a human.
    if (this.isStopped()) throw new AgentStoppedError(this.stopReason);
    this.controller._emit('agent.action.' + decision, {
      sessionId: this.id, agentId: this.agentId, actionType, payload,
    });
    if (decision === APPROVAL.DENY) throw new ApprovalDeniedError(actionType);
    return decision;
  }
}

export class HitlController extends EventEmitter {
  constructor({ audit = null } = {}) {
    super();
    this._sessions = new Map();
    this._approvals = new Map();
    this._audit = audit;
  }

  createSession({ agentId, requireApprovalFor = [] } = {}) {
    if (!agentId) throw new Error('createSession: agentId required');
    const session = new AgentSession({
      agentId, controller: this,
      requireApprovalFor,
    });
    this._sessions.set(session.id, session);
    this._emit('session.created', { sessionId: session.id, agentId: session.agentId });
    return session;
  }

  getSession(id) { return this._sessions.get(id); }
  listSessions() { return [...this._sessions.values()]; }
  liveSessions() { return this.listSessions().filter((s) => s.isLive()); }

  pendingApprovals() {
    return [...this._approvals.values()].filter((a) => !a.resolved);
  }

  resolveApproval(approvalId, decision) {
    const a = this._approvals.get(approvalId);
    if (!a) throw new Error(`unknown approval id: ${approvalId}`);
    if (a.resolved) throw new Error(`approval ${approvalId} already resolved`);
    if (decision !== APPROVAL.ALLOW && decision !== APPROVAL.DENY) {
      throw new Error(`decision must be allow|deny, got ${decision}`);
    }
    a.resolved = true;
    a.decision = decision;
    a._resolve(decision);
    this._emit('approval.resolved', { id: approvalId, decision });
  }

  stopAll(reason = 'user-requested-shutdown') {
    for (const s of this.liveSessions()) s.stop(reason);
  }

  _emit(type, payload) {
    const ev = { ts: Date.now(), type, payload };
    this.emit('event', ev);
    this.emit(type, payload);
    if (this._audit) {
      this._audit.append({
        type: 'hitl.' + type, actor: 'hitl', level: null,
        payload,
      }).catch(() => {});
    }
  }

  _enqueueApproval(info) {
    const id = randomUUID();
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    const req = {
      id,
      sessionId: info.sessionId,
      agentId: info.agentId,
      actionType: info.actionType,
      payload: info.payload,
      ts: Date.now(),
      resolved: false,
      decision: null,
      _resolve: resolve,
      promise,
    };
    this._approvals.set(id, req);
    this._emit('approval.requested', {
      id, sessionId: info.sessionId, agentId: info.agentId, actionType: info.actionType,
    });
    return req;
  }
}
