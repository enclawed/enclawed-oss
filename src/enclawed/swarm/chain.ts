// The coordinator blockchain: deterministic validation and state transitions.
//
// Every coordinator keeps the same chain. A block is final once a quorum of
// coordinators has signed a "final" statement for it (its quorum certificate),
// and every coordinator key lives in an Enclaweder, so:
//   - a coordinator whose host is compromised cannot forge a block on its own:
//     it holds one signature, and finality needs a quorum;
//   - one that signs two different blocks for the same slot hands everyone the
//     evidence (two signed statements), which goes on chain and evicts it;
//   - two final blocks at one height can only exist if the coordinators in both
//     certificates signed two finals for that height, so every fork names its
//     culprits with transferable evidence (see ForkEvidence);
//   - a lagging, restarted or tampered coordinator heals itself: it keeps only
//     the prefix of its own store that verifies, then takes the rest from any
//     peer, checking every quorum certificate, so a lying peer cannot feed it a
//     fake history (see SwarmLedger.restore and SwarmLedger.sync).
//
// Everything in this file is pure validation over signed data. The consensus
// protocol that produces the certificates is in consensus.ts.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { digest, digestHex, TAG } from "./codec.js";
import { verifyHeartbeat } from "./heartbeat.js";
import { isPrincipalKey, verifyDigest, type SwarmPrincipalKey } from "./signer.js";
import type {
  Block,
  BlockHeader,
  CommittedBlock,
  EquivocationProof,
  Genesis,
  QuorumCertificate,
  Statement,
  SwarmState,
  SwarmTx,
} from "./types.js";

/**
 * Two coordinators already rule out a forged block: with a quorum of n - f the
 * pair must both sign. What small sets give up is liveness, not safety: with
 * two or three coordinators any single fault halts the chain, every lease then
 * runs out, and the swarm fails closed. Growing the set (coordinator.add,
 * coordinator.promote) buys fault tolerance one coordinator at a time.
 */
export const MIN_COORDINATORS = 2;
const STATE_WINDOW = 64;

export type ChainErrorCode =
  | "bad-genesis"
  | "halted"
  | "wrong-swarm"
  | "wrong-height"
  | "wrong-prev"
  | "wrong-epoch"
  | "wrong-proposer"
  | "time-regressed"
  | "bad-tx-root"
  | "bad-tx"
  | "bad-active"
  | "bad-qc";

export class ChainError extends Error {
  readonly code: ChainErrorCode;
  constructor(code: ChainErrorCode, message: string) {
    super(`swarm chain: ${message}`);
    this.name = "ChainError";
    this.code = code;
  }
}

/** Largest f with 3f+1 <= n. */
export function faultTolerance(n: number): number {
  return Math.floor((n - 1) / 3);
}

/** Votes needed for a quorum certificate: n - f, which is 2f+1 when n = 3f+1. */
export function quorumSize(n: number): number {
  return n - faultTolerance(n);
}

export function genesisHash(genesis: Genesis): string {
  return digestHex(TAG.genesis, genesis);
}

export function txRoot(txs: SwarmTx[]): string {
  return digestHex(TAG.txs, txs);
}

export function blockHash(header: BlockHeader): string {
  return digestHex(TAG.block, header);
}

export function statementDigest(s: Statement): Buffer {
  const { sig: _sig, ...body } = s;
  return digest(TAG.statement, body);
}

export function joinDigest(swarmId: string, node: SwarmPrincipalKey): Buffer {
  return digest(TAG.join, { swarmId, node });
}

export function readyDigest(swarmId: string, nodeId: string, height: number): Buffer {
  return digest(TAG.ready, { swarmId, nodeId, height });
}

/** How far behind the chain a readiness statement may be and still count. */
export const READY_WINDOW = 32;

/**
 * What an admin signs to approve a transaction. Joins and operator evictions
 * cannot be replayed (the node then exists or is permanently evicted), so they
 * bind only the transaction. A bundle publish binds the epoch too, or an old
 * approval could roll the swarm back to an earlier policy. Coordinator adds and
 * retirements bind the roster version, so an old approval cannot undo a later
 * change.
 */
export function approvalDigest(
  state: Pick<SwarmState, "swarmId" | "epoch" | "rosterVersion"> &
    Partial<Pick<SwarmState, "epochHash">>,
  tx: SwarmTx,
): Buffer {
  switch (tx.type) {
    case "node.join":
      return digest(TAG.approval, {
        swarmId: state.swarmId,
        type: tx.type,
        node: tx.node,
        coordinator: tx.coordinator ?? null,
        ...(tx.observer ? { observer: true } : {}),
      });
    case "coordinator.add":
      return digest(TAG.approval, {
        swarmId: state.swarmId,
        type: tx.type,
        coordinator: tx.coordinator,
        address: tx.address,
        rosterVersion: state.rosterVersion,
      });
    case "coordinator.retire":
      return digest(TAG.approval, {
        swarmId: state.swarmId,
        type: tx.type,
        coordinatorId: tx.coordinatorId,
        rosterVersion: state.rosterVersion,
      });
    case "node.evict":
      return digest(TAG.approval, {
        swarmId: state.swarmId,
        type: tx.type,
        nodeId: tx.nodeId,
        reason: tx.reason,
      });
    case "bundle.publish":
      return digest(TAG.approval, {
        swarmId: state.swarmId,
        type: tx.type,
        bundleHash: tx.bundleHash,
        epoch: state.epoch,
        epochHash: needEpochHash(state),
      });
    case "params.update":
      return digest(TAG.approval, {
        swarmId: state.swarmId,
        type: tx.type,
        leaseMs: tx.leaseMs,
        heartbeatMs: tx.heartbeatMs,
        ...(tx.expiryBlocks !== undefined ? { expiryBlocks: tx.expiryBlocks } : {}),
        epoch: state.epoch,
        epochHash: needEpochHash(state),
      });
    default:
      throw new ChainError("bad-tx", `${tx.type} takes no approval`);
  }
}

/** Policy approvals bind to the epoch's hash, not only its number. */
function needEpochHash(state: Partial<Pick<SwarmState, "epochHash">>): string {
  if (!state.epochHash) {
    throw new ChainError("bad-tx", "a policy approval binds to the epoch's hash");
  }
  return state.epochHash;
}

function sortedById(keys: SwarmPrincipalKey[]): SwarmPrincipalKey[] {
  return keys.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function validateGenesis(g: Genesis): void {
  const fail = (m: string): never => {
    throw new ChainError("bad-genesis", m);
  };
  if (!g || typeof g.swarmId !== "string" || g.swarmId.length === 0) {
    fail("swarmId is required");
  }
  if (!Array.isArray(g.coordinators) || g.coordinators.length < MIN_COORDINATORS) {
    fail(`need at least ${MIN_COORDINATORS} coordinators (4 tolerates one faulty)`);
  }
  if (!Array.isArray(g.admins) || g.admins.length === 0) {
    fail("need at least one admin");
  }
  const ids = new Set<string>();
  for (const k of [...g.coordinators, ...g.admins]) {
    if (!isPrincipalKey(k)) {
      fail(`malformed principal key ${JSON.stringify((k as { id?: unknown })?.id)}`);
    }
    if (ids.has(k.id)) {
      fail(`duplicate principal id ${k.id}`);
    }
    ids.add(k.id);
    if (g.params?.requireDeviceKeys && k.kind !== "device") {
      fail(`${k.id} is not an Enclaweder key and requireDeviceKeys is set`);
    }
  }
  const p = g.params;
  if (
    !p ||
    !Number.isSafeInteger(p.leaseMs) ||
    p.leaseMs <= 0 ||
    !Number.isSafeInteger(p.heartbeatMs) ||
    p.heartbeatMs <= 0 ||
    p.heartbeatMs >= p.leaseMs
  ) {
    fail("params need positive integer leaseMs > heartbeatMs");
  }
  if (p.expiryBlocks !== undefined && !validExpiry(p.expiryBlocks)) {
    fail(
      `expiryBlocks must be an integer in ${PARAM_BOUNDS.expiryBlocks.min}..${PARAM_BOUNDS.expiryBlocks.max}`,
    );
  }
  if (
    p.growth !== undefined &&
    (!Number.isSafeInteger(p.growth.maxCoordinators) ||
      p.growth.maxCoordinators < g.coordinators.length ||
      !Number.isSafeInteger(p.growth.nodesPerCoordinator) ||
      p.growth.nodesPerCoordinator < 1)
  ) {
    fail("growth needs integer maxCoordinators >= the genesis set and nodesPerCoordinator >= 1");
  }
  if (typeof g.bundleHash !== "string" || !/^[0-9a-f]{64}$/.test(g.bundleHash)) {
    fail("bundleHash must be a sha256 hex digest");
  }
}

export function genesisState(g: Genesis): SwarmState {
  validateGenesis(g);
  const hash = genesisHash(g);
  const s = genesisBody(g, hash);
  // Epoch 0 chains to the genesis itself.
  s.epochHash = epochHashOf(s, hash);
  return s;
}

function genesisBody(g: Genesis, hash: string): SwarmState {
  return {
    swarmId: g.swarmId,
    genesisHash: hash,
    height: 0,
    headHash: hash,
    headTime: g.createdAt,
    epoch: 0,
    params: { ...g.params, ...(g.params.growth ? { growth: { ...g.params.growth } } : {}) },
    bundleHash: g.bundleHash,
    coordinators: sortedById(g.coordinators),
    active: [],
    addresses: new Map(),
    rosterVersion: 0,
    admins: sortedById(g.admins),
    nodes: new Map(),
    leases: new Map(),
    lastHeartbeatSeq: new Map(),
    lastRenewed: new Map(),
    observers: new Set(),
    evicted: new Set(),
    halted: null,
    epochHash: "",
  };
}

export function cloneState(s: SwarmState): SwarmState {
  return {
    ...s,
    params: { ...s.params },
    // coordinators and admins are replaced, never mutated, so they can be shared.
    nodes: new Map(s.nodes),
    addresses: new Map(s.addresses),
    leases: new Map(s.leases),
    lastHeartbeatSeq: new Map(s.lastHeartbeatSeq),
    lastRenewed: new Map(s.lastRenewed),
    observers: new Set(s.observers),
    evicted: new Set(s.evicted),
  };
}

/**
 * Round 0 rotates over the coordinators that certified recently (the previous
 * block's `active` list), so a crashed coordinator is skipped instead of
 * costing a propose timeout at every n-th height. Later rounds rotate over the
 * whole set, so a bad `active` list can delay a height by one round at most.
 */
export function proposerFor(
  state: Pick<SwarmState, "height" | "coordinators" | "active">,
  round: number,
): string {
  if (round === 0 && state.active.length > 0) {
    return state.active[(state.height + 1) % state.active.length];
  }
  const n = state.coordinators.length;
  return state.coordinators[(state.height + 1 + round) % n].id;
}

/**
 * What a proposer puts in `active` for the next block: the coordinators whose
 * finals certified the block it builds on. Empty (whole-set rotation) when
 * that is not a quorum of the current set, for example right after it grew.
 */
export function activeFor(state: SwarmState, previous: CommittedBlock | undefined): string[] {
  if (!previous) {
    return [];
  }
  const ids = new Set(state.coordinators.map((c) => c.id));
  const signers = [...new Set(previous.qc.votes.map((v) => v.signer))]
    .filter((id) => ids.has(id))
    .toSorted();
  return signers.length >= quorumSize(state.coordinators.length) ? signers : [];
}

function validActive(state: SwarmState, active: unknown): active is string[] {
  if (!Array.isArray(active)) {
    return false;
  }
  if (active.length === 0) {
    return true;
  }
  const ids = new Set(state.coordinators.map((c) => c.id));
  const sorted = [...active].toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return (
    active.every((id, i) => typeof id === "string" && ids.has(id) && id === sorted[i]) &&
    new Set(active).size === active.length &&
    active.length >= quorumSize(state.coordinators.length)
  );
}

/** Limits on what params.update may set; genesis is checked against the same rule. */
export const PARAM_BOUNDS = {
  leaseMs: { min: 1_000, max: 600_000 },
  heartbeatMs: { min: 100, max: 60_000 },
  // Never fewer than three blocks: a live node renews on every heartbeat, and
  // must never be expired between two of its own renewals.
  expiryBlocks: { min: 3, max: 1_000_000 },
} as const;

export function validExpiry(expiryBlocks: unknown): boolean {
  return (
    Number.isSafeInteger(expiryBlocks) &&
    (expiryBlocks as number) >= PARAM_BOUNDS.expiryBlocks.min &&
    (expiryBlocks as number) <= PARAM_BOUNDS.expiryBlocks.max
  );
}

/**
 * Nodes that renewed no lease for more than the epoch's expiryBlocks, as of
 * the block after the current head: a pure function of the chain state, so
 * every coordinator reaches the same answer. Coordinators are excluded:
 * their faults are consensus's to judge, by their own signatures.
 */
export function expiredNodes(s: SwarmState): string[] {
  const limit = s.params.expiryBlocks;
  if (limit === undefined) {
    return [];
  }
  const now = s.height + 1;
  return [...s.nodes.keys()]
    .filter((id) => !s.coordinators.some((c) => c.id === id) && !s.observers.has(id))
    .filter((id) => now - (s.lastRenewed.get(id) ?? now) > limit)
    .toSorted();
}

export function validTiming(leaseMs: unknown, heartbeatMs: unknown): boolean {
  return (
    Number.isSafeInteger(leaseMs) &&
    Number.isSafeInteger(heartbeatMs) &&
    (heartbeatMs as number) >= PARAM_BOUNDS.heartbeatMs.min &&
    (heartbeatMs as number) <= PARAM_BOUNDS.heartbeatMs.max &&
    (leaseMs as number) >= PARAM_BOUNDS.leaseMs.min &&
    (leaseMs as number) <= PARAM_BOUNDS.leaseMs.max &&
    (heartbeatMs as number) < (leaseMs as number)
  );
}

/** Removes a coordinator from the roster, halting if too few would remain. */
function dropCoordinator(s: SwarmState, id: string, why: string): void {
  s.coordinators = s.coordinators.filter((c) => c.id !== id);
  s.active = s.active.filter((a) => a !== id);
  s.addresses.delete(id);
  s.rosterVersion += 1;
  if (s.coordinators.length < MIN_COORDINATORS) {
    const n = s.coordinators.length;
    s.halted = `only ${n} coordinator${n === 1 ? " remains" : "s remain"} after ${why}`;
  }
}

function addCoordinator(s: SwarmState, key: SwarmPrincipalKey, address: string): void {
  s.coordinators = sortedById([...s.coordinators, key]);
  s.addresses.set(key.id, address);
  s.rosterVersion += 1;
}

function validAddress(a: unknown): a is string {
  return typeof a === "string" && a.length <= 256 && /^[^\s:]+:\d{1,5}$/.test(a);
}

export function coordinatorKey(state: Roster, id: string): SwarmPrincipalKey | undefined {
  return state.coordinators.find((c) => c.id === id);
}

type Roster = Pick<SwarmState, "swarmId" | "coordinators">;

export function verifyStatement(state: Roster, s: Statement): boolean {
  if (!s || s.swarmId !== state.swarmId) {
    return false;
  }
  const key = coordinatorKey(state, s.signer);
  return !!key && verifyDigest(key, statementDigest(s), s.sig);
}

/** Checks a double-sign: same signer, same slot, different block, both genuine. */
export function verifyEquivocation(state: Roster, proof: EquivocationProof): boolean {
  const { a, b } = proof ?? ({} as EquivocationProof);
  if (!a || !b) {
    return false;
  }
  const sameSlot =
    a.signer === b.signer && a.kind === b.kind && a.height === b.height && a.round === b.round;
  return (
    sameSlot &&
    a.blockHash !== b.blockHash &&
    verifyStatement(state, a) &&
    verifyStatement(state, b)
  );
}

/** Verifies a QC against the coordinator set that was in force for that height. */
export function verifyQc(
  state: Roster,
  hash: string,
  height: number,
  qc: QuorumCertificate,
): boolean {
  if (!qc || qc.blockHash !== hash || qc.height !== height || !Array.isArray(qc.votes)) {
    return false;
  }
  const seen = new Set<string>();
  for (const v of qc.votes) {
    if (
      v.kind !== "final" ||
      v.height !== height ||
      v.round !== 0 ||
      v.blockHash !== hash ||
      seen.has(v.signer) ||
      !verifyStatement(state, v)
    ) {
      return false;
    }
    seen.add(v.signer);
  }
  return seen.size >= quorumSize(state.coordinators.length);
}

function verifyApproval(
  state: SwarmState,
  tx: SwarmTx & { approval: { admin: string; sig: string } },
): boolean {
  const admin = state.admins.find((a) => a.id === tx.approval?.admin);
  return !!admin && verifyDigest(admin, approvalDigest(state, tx), tx.approval.sig);
}

function bumpEpoch(s: SwarmState): void {
  s.epoch += 1;
  // A new epoch invalidates every lease; nodes renew against the new one.
  s.leases.clear();
  // Chained to the previous epoch, over what this one starts with.
  s.epochHash = epochHashOf(s, s.epochHash);
}

/**
 * An epoch's hash: the previous epoch's hash, and everything this epoch
 * starts with. Epochs thus form a chain from genesis, and every block's
 * certificate signs the one it runs in (BlockHeader.epochHash): changing any
 * past epoch's policy or membership changes every epoch hash after it.
 */
export function epochHashOf(s: SwarmState, prev: string): string {
  const keys = (m: Iterable<SwarmPrincipalKey>) =>
    [...m].toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return digestHex(TAG.epoch, {
    prev,
    swarmId: s.swarmId,
    epoch: s.epoch,
    startsAt: s.height + 1,
    params: s.params,
    bundleHash: s.bundleHash,
    coordinators: keys(s.coordinators),
    admins: keys(s.admins),
    nodes: keys(s.nodes.values()),
    observers: [...s.observers].toSorted(),
    evicted: [...s.evicted].toSorted(),
  });
}

/** Applies one transaction to `s` in place. Throws ChainError("bad-tx") if it is invalid. */
export function applyTx(s: SwarmState, tx: SwarmTx): void {
  const bad = (m: string) => new ChainError("bad-tx", `${tx?.type ?? "tx"}: ${m}`);
  switch (tx?.type) {
    case "node.join": {
      const node = tx.node;
      if (!isPrincipalKey(node)) {
        throw bad("malformed node key");
      }
      if (tx.coordinator !== undefined && !validAddress(tx.coordinator?.address)) {
        throw bad("coordinator address must be host:port");
      }
      if (s.nodes.has(node.id) || s.evicted.has(node.id) || coordinatorKey(s, node.id)) {
        throw bad(`id ${node.id} is taken or was evicted`);
      }
      if (s.params.requireDeviceKeys && node.kind !== "device") {
        throw bad(`${node.id} is not an Enclaweder key`);
      }
      if (!verifyDigest(node, joinDigest(s.swarmId, node), tx.pop)) {
        throw bad("proof of possession does not verify");
      }
      if (!verifyApproval(s, tx)) {
        throw bad("admin approval does not verify");
      }
      if (tx.observer !== undefined && !tx.observer) {
        throw bad("observer must be true or absent");
      }
      if (tx.observer && tx.coordinator !== undefined) {
        throw bad("an observer cannot be a coordinator candidate");
      }
      s.nodes.set(node.id, node);
      if (tx.observer) {
        s.observers.add(node.id);
      }
      // Its expiry clock starts at the block that admits it.
      s.lastRenewed.set(node.id, s.height + 1);
      if (tx.coordinator) {
        s.addresses.set(node.id, tx.coordinator.address);
      }
      bumpEpoch(s);
      return;
    }
    case "node.evict": {
      const node = s.nodes.get(tx.nodeId);
      if (!node) {
        throw bad(`unknown node ${tx.nodeId}`);
      }
      if (tx.reason === "dirty") {
        if (!verifyHeartbeat(node, tx.evidence) || tx.evidence.body.status !== "DIRTY") {
          throw bad("evidence is not a genuine DIRTY heartbeat from that node");
        }
      } else if (tx.reason === "operator") {
        if (!verifyApproval(s, tx)) {
          throw bad("admin approval does not verify");
        }
      } else if (tx.reason === "expired") {
        // The evidence is the chain itself, checked against the same state by
        // every coordinator.
        if (!expiredNodes(s).includes(tx.nodeId)) {
          throw bad(
            `${tx.nodeId} has not gone more than ${s.params.expiryBlocks ?? "any number of"} blocks unrenewed`,
          );
        }
      } else {
        throw bad("unknown reason");
      }
      s.nodes.delete(tx.nodeId);
      s.lastHeartbeatSeq.delete(tx.nodeId);
      s.lastRenewed.delete(tx.nodeId);
      s.observers.delete(tx.nodeId);
      s.addresses.delete(tx.nodeId);
      s.evicted.add(tx.nodeId);
      // A promoted coordinator is still a node: a DIRTY device ends both roles.
      if (coordinatorKey(s, tx.nodeId)) {
        dropCoordinator(s, tx.nodeId, `evicting node ${tx.nodeId}`);
      }
      bumpEpoch(s);
      return;
    }
    case "coordinator.evict": {
      if (tx.evidence?.a?.signer !== tx.coordinatorId || !verifyEquivocation(s, tx.evidence)) {
        throw bad("evidence is not a genuine double-sign by that coordinator");
      }
      dropCoordinator(s, tx.coordinatorId, `evicting ${tx.coordinatorId}`);
      s.evicted.add(tx.coordinatorId);
      if (s.nodes.delete(tx.coordinatorId)) {
        s.lastHeartbeatSeq.delete(tx.coordinatorId);
      }
      bumpEpoch(s);
      return;
    }
    case "coordinator.add": {
      const key = tx.coordinator;
      if (!isPrincipalKey(key)) {
        throw bad("malformed coordinator key");
      }
      if (
        s.nodes.has(key.id) ||
        s.evicted.has(key.id) ||
        coordinatorKey(s, key.id) ||
        s.admins.some((a) => a.id === key.id)
      ) {
        throw bad(`id ${key.id} is taken or was evicted`);
      }
      if (s.params.requireDeviceKeys && key.kind !== "device") {
        throw bad(`${key.id} is not an Enclaweder key`);
      }
      if (!validAddress(tx.address)) {
        throw bad("address must be host:port");
      }
      if (!verifyDigest(key, joinDigest(s.swarmId, key), tx.pop)) {
        throw bad("proof of possession does not verify");
      }
      if (!verifyApproval(s, tx)) {
        throw bad("admin approval does not verify for this roster");
      }
      addCoordinator(s, key, tx.address);
      return;
    }
    case "coordinator.promote": {
      const g = s.params.growth;
      const node = s.nodes.get(tx.nodeId);
      const address = s.addresses.get(tx.nodeId);
      if (!g) {
        throw bad("this swarm does not grow automatically");
      }
      if (!node || !address || coordinatorKey(s, tx.nodeId)) {
        throw bad(`${tx.nodeId} is not an eligible node`);
      }
      if (s.leases.get(tx.nodeId)?.epoch !== s.epoch) {
        throw bad(`${tx.nodeId} holds no lease for the current epoch`);
      }
      const r = tx.ready;
      if (
        !r ||
        !Number.isSafeInteger(r.height) ||
        r.height > s.height ||
        r.height < s.height - READY_WINDOW ||
        !verifyDigest(node, readyDigest(s.swarmId, tx.nodeId, r.height), r.sig)
      ) {
        throw bad(`${tx.nodeId} has not signed a recent readiness statement`);
      }
      if (s.coordinators.length >= g.maxCoordinators) {
        throw bad(`already at ${g.maxCoordinators} coordinators`);
      }
      if (s.nodes.size < g.nodesPerCoordinator * (s.coordinators.length + 1)) {
        throw bad(`${s.nodes.size} nodes do not yet warrant another coordinator`);
      }
      addCoordinator(s, node, address);
      return;
    }
    case "coordinator.retire": {
      if (!coordinatorKey(s, tx.coordinatorId)) {
        throw bad(`unknown coordinator ${tx.coordinatorId}`);
      }
      if (s.coordinators.length <= MIN_COORDINATORS) {
        throw bad(`cannot go below ${MIN_COORDINATORS} coordinators`);
      }
      if (!verifyApproval(s, tx)) {
        throw bad("admin approval does not verify for this roster");
      }
      dropCoordinator(s, tx.coordinatorId, `retiring ${tx.coordinatorId}`);
      return;
    }
    case "bundle.publish": {
      if (typeof tx.bundleHash !== "string" || !/^[0-9a-f]{64}$/.test(tx.bundleHash)) {
        throw bad("bundleHash must be a sha256 hex digest");
      }
      if (!verifyApproval(s, tx)) {
        throw bad("admin approval does not verify for this epoch");
      }
      s.bundleHash = tx.bundleHash;
      bumpEpoch(s);
      return;
    }
    case "params.update": {
      if (!validTiming(tx.leaseMs, tx.heartbeatMs)) {
        throw bad(
          `need integers ${PARAM_BOUNDS.heartbeatMs.min} <= heartbeatMs < leaseMs <= ${PARAM_BOUNDS.leaseMs.max}`,
        );
      }
      if (!verifyApproval(s, tx)) {
        throw bad("admin approval does not verify for this epoch");
      }
      if (tx.expiryBlocks !== undefined && !validExpiry(tx.expiryBlocks)) {
        throw bad(
          `expiryBlocks must be an integer in ${PARAM_BOUNDS.expiryBlocks.min}..${PARAM_BOUNDS.expiryBlocks.max}`,
        );
      }
      s.params = {
        ...s.params,
        leaseMs: tx.leaseMs,
        heartbeatMs: tx.heartbeatMs,
        ...(tx.expiryBlocks !== undefined ? { expiryBlocks: tx.expiryBlocks } : {}),
      };
      // Leases were granted under the old length; everyone renews under the new one.
      bumpEpoch(s);
      return;
    }
    case "lease.grant": {
      if (!s.nodes.has(tx.nodeId)) {
        throw bad(`unknown node ${tx.nodeId}`);
      }
      if (s.observers.has(tx.nodeId)) {
        throw bad(`${tx.nodeId} is an observer and holds no lease`);
      }
      if (tx.epoch !== s.epoch) {
        throw bad(`lease is for epoch ${tx.epoch}, current is ${s.epoch}`);
      }
      if (
        !Number.isSafeInteger(tx.durationMs) ||
        tx.durationMs <= 0 ||
        tx.durationMs > s.params.leaseMs
      ) {
        throw bad(`duration must be 1..${s.params.leaseMs} ms`);
      }
      const node = s.nodes.get(tx.nodeId);
      const hb = tx.heartbeat;
      if (!node || !verifyHeartbeat(node, hb) || hb.body.status !== "CLEAN") {
        throw bad("heartbeat is not a genuine CLEAN heartbeat from that node");
      }
      if (hb.body.swarmId !== s.swarmId || hb.body.epoch > s.epoch) {
        throw bad("heartbeat is for another swarm or a future epoch");
      }
      const prevSeq = s.lastHeartbeatSeq.get(tx.nodeId) ?? -1;
      if (hb.body.seq <= prevSeq) {
        throw bad("heartbeat was already used for a lease");
      }
      s.lastHeartbeatSeq.set(tx.nodeId, hb.body.seq);
      s.lastRenewed.set(tx.nodeId, s.height + 1);
      s.leases.set(tx.nodeId, {
        epoch: tx.epoch,
        durationMs: tx.durationMs,
        heartbeatSeq: hb.body.seq,
        height: s.height + 1,
      });
      return;
    }
    default:
      throw bad("unknown transaction type");
  }
}

/**
 * Validates `block` as the next block after `state` and returns the state after
 * it. Does not check the QC (proposals have none yet); see applyCommitted.
 */
export function applyBlock(state: SwarmState, block: Block): SwarmState {
  if (state.halted) {
    throw new ChainError("halted", `chain is halted: ${state.halted}`);
  }
  const h = block?.header;
  if (!h || h.swarmId !== state.swarmId) {
    throw new ChainError("wrong-swarm", "block is for another swarm");
  }
  if (h.height !== state.height + 1) {
    throw new ChainError("wrong-height", `expected height ${state.height + 1}, got ${h.height}`);
  }
  if (h.prevHash !== state.headHash) {
    throw new ChainError("wrong-prev", `block ${h.height} does not extend our head`);
  }
  if (h.epoch !== state.epoch) {
    throw new ChainError("wrong-epoch", `block epoch ${h.epoch}, chain epoch ${state.epoch}`);
  }
  if (h.epochHash !== state.epochHash) {
    throw new ChainError("wrong-epoch", `block is for another history of epoch ${h.epoch}`);
  }
  if (!Number.isSafeInteger(h.round) || h.round < 0 || h.proposer !== proposerFor(state, h.round)) {
    throw new ChainError("wrong-proposer", `${h.proposer} may not propose round ${h.round}`);
  }
  if (!Number.isFinite(h.time) || h.time < state.headTime) {
    throw new ChainError("time-regressed", "block time is before its parent");
  }
  if (!Array.isArray(block.txs) || h.txRoot !== txRoot(block.txs)) {
    throw new ChainError("bad-tx-root", "transactions do not match the header");
  }
  if (!validActive(state, h.active) || (state.height === 0 && h.active.length > 0)) {
    throw new ChainError("bad-active", "active list is not a sorted quorum of coordinators");
  }
  const next = cloneState(state);
  for (const tx of block.txs) {
    applyTx(next, tx);
  }
  next.height = h.height;
  next.headHash = blockHash(h);
  next.headTime = h.time;
  // Only members of the roster the block leaves behind can propose next.
  const ids = new Set(next.coordinators.map((c) => c.id));
  next.active = h.active.filter((id) => ids.has(id));
  if (next.active.length < quorumSize(next.coordinators.length)) {
    next.active = [];
  }
  return next;
}

export function applyCommitted(state: SwarmState, cb: CommittedBlock): SwarmState {
  const hash = blockHash(cb.block.header);
  if (cb.hash !== hash || !verifyQc(state, hash, cb.block.header.height, cb.qc)) {
    throw new ChainError(
      "bad-qc",
      `block ${cb.block?.header?.height} lacks a valid quorum certificate`,
    );
  }
  return applyBlock(state, cb.block);
}

export function makeBlock(
  state: SwarmState,
  opts: { proposer: string; round: number; time: number; txs: SwarmTx[]; active?: string[] },
): Block {
  return {
    header: {
      swarmId: state.swarmId,
      height: state.height + 1,
      round: opts.round,
      prevHash: state.headHash,
      proposer: opts.proposer,
      epoch: state.epoch,
      epochHash: state.epochHash,
      time: Math.max(opts.time, state.headTime),
      txRoot: txRoot(opts.txs),
      active: opts.active ?? [],
    },
    txs: opts.txs,
  };
}

/**
 * Two blocks at one height, each with a valid QC. With at most f faulty
 * coordinators this cannot happen; seeing it means more than f signed both,
 * and the chain halts (fail closed) until humans intervene.
 */
export type ForkEvidence = {
  height: number;
  ours: CommittedBlock;
  theirs: CommittedBlock;
  /** Coordinators that signed a final for both blocks. */
  doubleSigners: string[];
  /** One verifiable double-sign per culprit, usable as coordinator.evict evidence. */
  proofs: EquivocationProof[];
};

/** Pairs each coordinator's finals from two conflicting certificates. */
export function forkProofs(a: QuorumCertificate, b: QuorumCertificate): EquivocationProof[] {
  const theirs = new Map(b.votes.map((v) => [v.signer, v]));
  const out: EquivocationProof[] = [];
  for (const v of a.votes) {
    const w = theirs.get(v.signer);
    if (w && w.blockHash !== v.blockHash) {
      out.push({ a: v, b: w });
    }
  }
  return out;
}

export type CommitResult =
  | { ok: true; applied: boolean }
  | { ok: false; code: "gap" | "invalid"; error: string }
  | { ok: false; code: "fork"; fork: ForkEvidence };

/** Durable storage for committed blocks. */
export interface LedgerStore {
  load(): CommittedBlock[];
  append(cb: CommittedBlock): void;
  /** Replace the stored blocks with a verified prefix. */
  rewrite(blocks: CommittedBlock[]): void;
}

export function memoryLedgerStore(initial: CommittedBlock[] = []): LedgerStore & {
  blocks: CommittedBlock[];
} {
  const store = {
    blocks: [...initial],
    load: () => [...store.blocks],
    append: (cb: CommittedBlock) => {
      store.blocks.push(cb);
    },
    rewrite: (blocks: CommittedBlock[]) => {
      store.blocks = [...blocks];
    },
  };
  return store;
}

/** One committed block per line. */
export function fileLedgerStore(path: string): LedgerStore {
  return {
    load() {
      let raw: string;
      try {
        raw = readFileSync(path, "utf8");
      } catch {
        return [];
      }
      const out: CommittedBlock[] = [];
      for (const line of raw.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        try {
          out.push(JSON.parse(line) as CommittedBlock);
        } catch {
          break; // a torn or edited line ends the trustworthy prefix
        }
      }
      return out;
    },
    append(cb) {
      appendFileSync(path, JSON.stringify(cb) + "\n");
    },
    rewrite(blocks) {
      writeFileSync(path, blocks.map((b) => JSON.stringify(b) + "\n").join(""));
    },
  };
}

export class SwarmLedger {
  readonly genesis: Genesis;
  private readonly store: LedgerStore;
  private readonly chain: CommittedBlock[] = [];
  /** The coordinator set that certifies block h is rosters[h - 1]. Shared arrays, so cheap. */
  private readonly rosters: SwarmPrincipalKey[][] = [];
  /** Recent states, newest last; full history would cost a state clone per block. */
  private readonly states: SwarmState[];
  private statesBase = 0;
  private fork: ForkEvidence | null = null;

  private constructor(genesis: Genesis, store: LedgerStore) {
    this.genesis = genesis;
    this.store = store;
    this.states = [genesisState(genesis)];
  }

  /**
   * Loads the stored chain, keeping only the prefix that verifies from genesis.
   * Anything after the first bad block is dropped from the store, and the
   * coordinator then re-syncs that part from its peers.
   */
  static restore(
    genesis: Genesis,
    store: LedgerStore = memoryLedgerStore(),
  ): { ledger: SwarmLedger; truncatedAt: number | null } {
    const ledger = new SwarmLedger(genesis, store);
    const stored = store.load();
    let truncatedAt: number | null = null;
    for (const cb of stored) {
      try {
        ledger.push(cb, applyCommitted(ledger.state, cb));
      } catch {
        truncatedAt = ledger.chain.length + 1;
        break;
      }
    }
    if (truncatedAt !== null) {
      store.rewrite(ledger.chain);
    }
    return { ledger, truncatedAt };
  }

  get state(): SwarmState {
    return this.states[this.states.length - 1];
  }

  get height(): number {
    return this.chain.length;
  }

  /** Set once a fork has been seen; the ledger then accepts nothing more. */
  get forkEvidence(): ForkEvidence | null {
    return this.fork;
  }

  /** State after block `height` (0 = genesis), while it is still in the recent window. */
  stateAt(height: number): SwarmState | undefined {
    return this.states[height - this.statesBase];
  }

  private push(cb: CommittedBlock, next: SwarmState): void {
    this.rosters.push(this.state.coordinators);
    this.chain.push(cb);
    this.states.push(next);
    if (this.states.length > STATE_WINDOW) {
      this.states.shift();
      this.statesBase += 1;
    }
  }

  block(height: number): CommittedBlock | undefined {
    return this.chain[height - 1];
  }

  blocksFrom(height: number, limit = 256): CommittedBlock[] {
    return this.chain.slice(Math.max(0, height - 1), Math.max(0, height - 1) + limit);
  }

  commit(cb: CommittedBlock): CommitResult {
    const h = cb?.block?.header?.height;
    if (!Number.isSafeInteger(h) || h < 1) {
      return { ok: false, code: "invalid", error: "block has no height" };
    }
    if (h > this.height + 1) {
      return { ok: false, code: "gap", error: `have ${this.height}, got ${h}` };
    }
    if (h <= this.height) {
      const ours = this.chain[h - 1];
      if (ours.hash === cb.hash) {
        return { ok: true, applied: false };
      }
      // A different block at a height we already finalized. Only evidence if
      // its own certificate is genuine; otherwise it is just a bad message.
      const parent = { swarmId: this.state.swarmId, coordinators: this.rosters[h - 1] };
      if (
        !verifyQc(parent, blockHash(cb.block.header), h, cb.qc) ||
        cb.hash !== blockHash(cb.block.header)
      ) {
        return { ok: false, code: "invalid", error: `conflicting block ${h} without a valid QC` };
      }
      const proofs = forkProofs(ours.qc, cb.qc).filter((p) => verifyEquivocation(parent, p));
      const fork: ForkEvidence = {
        height: h,
        ours,
        theirs: cb,
        doubleSigners: proofs.map((p) => p.a.signer),
        proofs,
      };
      this.fork = fork;
      this.state.halted = `fork at height ${h}`;
      return { ok: false, code: "fork", fork };
    }
    if (this.fork) {
      return { ok: false, code: "invalid", error: this.state.halted ?? "halted" };
    }
    let next: SwarmState;
    try {
      next = applyCommitted(this.state, cb);
    } catch (err) {
      return { ok: false, code: "invalid", error: (err as Error).message };
    }
    this.store.append(cb);
    this.push(cb, next);
    return { ok: true, applied: true };
  }

  /** Applies a run of blocks from a peer, stopping at the first that does not verify. */
  sync(blocks: CommittedBlock[]): { applied: number; stopped?: CommitResult } {
    let applied = 0;
    for (const cb of blocks) {
      const r = this.commit(cb);
      if (!r.ok) {
        return { applied, stopped: r };
      }
      if (r.applied) {
        applied += 1;
      }
    }
    return { applied };
  }
}
