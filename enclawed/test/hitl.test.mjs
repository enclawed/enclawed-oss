import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentStoppedError,
  APPROVAL,
  ApprovalDeniedError,
  HitlController,
  SESSION_STATE,
} from '../src/hitl.mjs';

test('createSession returns a pending session with a fresh id', () => {
  const c = new HitlController();
  const s = c.createSession({ agentId: 'agent-1' });
  assert.equal(s.state, SESSION_STATE.PENDING);
  assert.equal(s.agentId, 'agent-1');
  assert.match(s.id, /^[0-9a-f-]{36}$/);
  assert.equal(c.listSessions().length, 1);
  assert.equal(c.liveSessions().length, 0);  // not started yet
});

test('start transitions to RUNNING and emits agent.started', () => {
  const c = new HitlController();
  const events = [];
  c.on('event', (ev) => events.push(ev));
  const s = c.createSession({ agentId: 'a' }).start();
  assert.equal(s.state, SESSION_STATE.RUNNING);
  assert.ok(events.some((e) => e.type === 'agent.started'));
  assert.ok(s.startedAt > 0);
});

test('checkpoint passes through immediately when running', async () => {
  const c = new HitlController();
  const s = c.createSession({ agentId: 'a' }).start();
  await s.checkpoint();   // does not throw
  assert.equal(s.state, SESSION_STATE.RUNNING);
});

test('pause blocks checkpoint until resume', async () => {
  const c = new HitlController();
  const s = c.createSession({ agentId: 'a' }).start();
  s.pause();
  assert.equal(s.state, SESSION_STATE.PAUSED);
  let resolved = false;
  const p = s.checkpoint().then(() => { resolved = true; });
  // Give the event loop a tick to confirm we're awaiting.
  await new Promise((r) => setImmediate(r));
  assert.equal(resolved, false);
  s.resume();
  await p;
  assert.equal(resolved, true);
  assert.equal(s.state, SESSION_STATE.RUNNING);
});

test('stop unblocks a paused checkpoint with AgentStoppedError', async () => {
  const c = new HitlController();
  const s = c.createSession({ agentId: 'a' }).start();
  s.pause();
  const p = assert.rejects(() => s.checkpoint(), AgentStoppedError);
  await new Promise((r) => setImmediate(r));
  s.stop('emergency');
  await p;
  assert.equal(s.state, SESSION_STATE.STOPPED);
  assert.equal(s.stopReason, 'emergency');
});

test('checkpoint throws AgentStoppedError if already stopped', async () => {
  const c = new HitlController();
  const s = c.createSession({ agentId: 'a' }).start();
  s.stop('done');
  await assert.rejects(() => s.checkpoint(), AgentStoppedError);
});

test('proposeAction without approval-required commits immediately', async () => {
  const c = new HitlController();
  const events = [];
  c.on('event', (e) => events.push(e));
  const s = c.createSession({ agentId: 'a' }).start();
  const r = await s.proposeAction('read.local', { path: '/etc/hosts' });
  assert.equal(r, APPROVAL.ALLOW);
  assert.ok(events.some((e) => e.type === 'agent.action.committed'));
});

test('proposeAction with approval-required awaits human decision', async () => {
  const c = new HitlController();
  const s = c.createSession({
    agentId: 'a',
    requireApprovalFor: ['shell.exec'],
  }).start();
  const proposal = s.proposeAction('shell.exec', { cmd: 'rm -rf /tmp/x' });
  // No approval yet — proposal must still be pending.
  await new Promise((r) => setImmediate(r));
  const pending = c.pendingApprovals();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].actionType, 'shell.exec');
  c.resolveApproval(pending[0].id, APPROVAL.ALLOW);
  const r = await proposal;
  assert.equal(r, APPROVAL.ALLOW);
});

test('proposeAction throws ApprovalDeniedError when human denies', async () => {
  const c = new HitlController();
  const s = c.createSession({
    agentId: 'a',
    requireApprovalFor: ['shell.exec'],
  }).start();
  const proposal = s.proposeAction('shell.exec', { cmd: 'rm -rf /' });
  await new Promise((r) => setImmediate(r));
  const [pending] = c.pendingApprovals();
  c.resolveApproval(pending.id, APPROVAL.DENY);
  await assert.rejects(() => proposal, ApprovalDeniedError);
});

test('proposeAction unblocks with AgentStoppedError if stopped during approval wait', async () => {
  const c = new HitlController();
  const s = c.createSession({
    agentId: 'a',
    requireApprovalFor: ['shell.exec'],
  }).start();
  const proposal = s.proposeAction('shell.exec', { cmd: 'sleep 9' });
  await new Promise((r) => setImmediate(r));
  const [pending] = c.pendingApprovals();
  s.stop('emergency');
  // Resolve approval after stop — proposeAction should throw stopped, not deny.
  c.resolveApproval(pending.id, APPROVAL.ALLOW);
  await assert.rejects(() => proposal, AgentStoppedError);
});

test('resolveApproval rejects unknown / already-resolved / invalid decisions', async () => {
  const c = new HitlController();
  assert.throws(() => c.resolveApproval('nope', APPROVAL.ALLOW), /unknown approval/);
  const s = c.createSession({ agentId: 'a', requireApprovalFor: ['x'] }).start();
  // Test invalid decision FIRST — before resolving — so the request is still
  // pending and resolveApproval reaches the decision-validation code path.
  const proposal = s.proposeAction('x', null);
  await new Promise((r) => setImmediate(r));
  const [a] = c.pendingApprovals();
  assert.throws(() => c.resolveApproval(a.id, 'maybe'), /allow\|deny/);
  c.resolveApproval(a.id, APPROVAL.ALLOW);
  await proposal;  // settle the floated promise so the test exits cleanly
  assert.throws(() => c.resolveApproval(a.id, APPROVAL.ALLOW), /already resolved/);
});

test('stopAll halts every live session, leaves terminal ones alone', () => {
  const c = new HitlController();
  const s1 = c.createSession({ agentId: 'a1' }).start();
  const s2 = c.createSession({ agentId: 'a2' }).start();
  const s3 = c.createSession({ agentId: 'a3' }).start();
  s3.complete();
  c.stopAll('shutdown');
  assert.equal(s1.state, SESSION_STATE.STOPPED);
  assert.equal(s2.state, SESSION_STATE.STOPPED);
  assert.equal(s3.state, SESSION_STATE.COMPLETED);  // unchanged
});

test('controller emits typed events plus generic event stream', () => {
  const c = new HitlController();
  const generic = [];
  const typed = [];
  c.on('event', (e) => generic.push(e.type));
  c.on('agent.started', (p) => typed.push(p));
  const s = c.createSession({ agentId: 'a' }).start();
  assert.ok(generic.includes('agent.started'));
  assert.equal(typed.length, 1);
  assert.equal(typed[0].agentId, 'a');
});

test('audit-log integration receives an event per HITL transition', async () => {
  const records = [];
  const fakeAudit = {
    append: async (r) => { records.push(r.type); return r; },
  };
  const c = new HitlController({ audit: fakeAudit });
  const s = c.createSession({ agentId: 'a' }).start();
  s.pause(); s.resume(); s.stop('done');
  // Allow the .catch(()=>{}) microtasks to settle.
  await new Promise((r) => setImmediate(r));
  for (const t of ['hitl.session.created', 'hitl.agent.started', 'hitl.agent.paused',
                   'hitl.agent.resumed', 'hitl.agent.stopped']) {
    assert.ok(records.includes(t), `missing audit event: ${t}`);
  }
});
