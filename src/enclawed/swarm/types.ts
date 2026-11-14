// Wire and state types for the swarm coordinator chain.

import type { SwarmPrincipalKey } from "./signer.js";

export type SwarmParams = {
  /** Longest lease a coordinator may grant. */
  leaseMs: number;
  /** How often nodes send device-signed heartbeats. */
  heartbeatMs: number;
  /** Refuse coordinator and admin keys that do not live in an Enclaweder. */
  requireDeviceKeys: boolean;
  /**
   * Automatic growth of the coordinator set. When present, any coordinator may
   * promote an eligible, currently leased node once the swarm has at least
   * `nodesPerCoordinator` nodes per existing coordinator, up to
   * `maxCoordinators`. Absent: the set changes only by admin-approved adds.
   */
  growth?: { maxCoordinators: number; nodesPerCoordinator: number };
  /**
   * How many blocks a node may go without renewing its lease before any
   * coordinator may evict it ("expired"). Measured on the chain, never on a
   * wall clock: every block needs a quorum, so no proposer can hurry it, and
   * while the chain is stalled it does not advance. Part of the epoch's
   * policy: set at genesis, changed by params.update. Absent: nodes never
   * expire.
   */
  expiryBlocks?: number;
};

export type Genesis = {
  swarmId: string;
  createdAt: number;
  /**
   * At least 2. Two or three coordinators need every vote (any fault halts the
   * chain, which fails closed); from four on, 3f+1 tolerates f faulty ones.
   */
  coordinators: SwarmPrincipalKey[];
  /** Operators allowed to approve joins and operator evictions. */
  admins: SwarmPrincipalKey[];
  params: SwarmParams;
  /** Hash of the policy/trust/revocation bundle in force at genesis. */
  bundleHash: string;
};

/**
 * "final" is signed once per height, after the coordinator has decided a block
 * by Tendermint's rules. It carries no round (always 0), so a coordinator that
 * helps finalize two blocks at one height has signed the same slot twice,
 * whatever rounds it voted in. That closes the gap left by Tendermint's own
 * votes, where a coordinator that ignores its lock across rounds ("amnesia")
 * can take part in a fork without any two of its votes sharing a slot.
 */
export type StatementKind = "proposal" | "prevote" | "precommit" | "final";

/**
 * A signed consensus statement. Proposals and votes share this shape so a
 * double-sign of either is the same kind of evidence.
 */
export type Statement = {
  swarmId: string;
  kind: StatementKind;
  height: number;
  round: number;
  /** null is a vote for nothing (nil). Proposals always name a block. */
  blockHash: string | null;
  /** Proposals only: the round in which the proposer saw this block win 2f+1 prevotes, or -1. */
  validRound?: number;
  signer: string;
  sig: string;
};

/** Two statements by one coordinator for the same slot that name different blocks. */
export type EquivocationProof = { a: Statement; b: Statement };

/** An admin's signature over one specific transaction. */
export type Approval = { admin: string; sig: string };

export type HeartbeatStatus = "CLEAN" | "DIRTY";

export type HeartbeatBody = {
  swarmId: string;
  nodeId: string;
  /** The epoch the node believes is current. */
  epoch: number;
  /** Strictly increasing per node. */
  seq: number;
  time: number;
  status: HeartbeatStatus;
  reason?: string;
};

export type SignedHeartbeat = { body: HeartbeatBody; sig: string };

export type SwarmTx =
  | {
      type: "node.join";
      node: SwarmPrincipalKey;
      /** The node's own signature over the join: proof it holds the key it registers. */
      pop: string;
      /**
       * Set for long-lived hosts (gateways, service nodes) that may be promoted
       * to coordinator: where they will listen. Never set for MPI ranks.
       * Covered by the admin approval.
       */
      coordinator?: { address: string };
      /**
       * An observer (an operator's monitor session): on chain so that its own
       * eviction is visible to all, but it never holds a lease, so it can
       * authorize nothing, and it does not expire. Covered by the approval.
       */
      observer?: true;
      approval: Approval;
    }
  | {
      type: "coordinator.add";
      coordinator: SwarmPrincipalKey;
      address: string;
      pop: string;
      approval: Approval;
    }
  | {
      type: "coordinator.promote";
      nodeId: string;
      /**
       * The candidate's own signature, at a recent height, that it is synced
       * and ready to coordinate. Only the candidate can produce it, so no one
       * can promote a host that is not running (which, at two or three
       * coordinators, would halt the chain).
       */
      ready: { height: number; sig: string };
    }
  | { type: "coordinator.retire"; coordinatorId: string; approval: Approval }
  | { type: "node.evict"; nodeId: string; reason: "dirty"; evidence: SignedHeartbeat }
  | { type: "node.evict"; nodeId: string; reason: "operator"; approval: Approval }
  /**
   * A node that renewed no lease for more than params.expiryBlocks blocks, as
   * the chain itself shows: the evidence is the chain state every coordinator
   * already holds. A removed device cannot sign its own DIRTY report; this is
   * how its node leaves the swarm.
   */
  | { type: "node.evict"; nodeId: string; reason: "expired" }
  | { type: "coordinator.evict"; coordinatorId: string; evidence: EquivocationProof }
  | { type: "bundle.publish"; bundleHash: string; approval: Approval }
  | {
      type: "params.update";
      /** New lease length and heartbeat interval, applied from the next epoch. */
      leaseMs: number;
      heartbeatMs: number;
      /** New expiry, in blocks; absent: unchanged. */
      expiryBlocks?: number;
      approval: Approval;
    }
  | {
      type: "lease.grant";
      nodeId: string;
      epoch: number;
      durationMs: number;
      /**
       * The CLEAN heartbeat this lease answers. Carrying the device-signed
       * heartbeat means no proposer can keep a silent node leased: it would need
       * a heartbeat with a higher seq than any already used, which only the
       * node's Enclaweder can produce.
       */
      heartbeat: SignedHeartbeat;
    };

export type BlockHeader = {
  swarmId: string;
  height: number;
  round: number;
  prevHash: string;
  proposer: string;
  /** The epoch in force when the block's first transaction applies. */
  epoch: number;
  /**
   * That epoch's hash: the chain of every epoch so far, each over the one
   * before. The block's certificate signs it, so rewriting any past epoch's
   * policy or membership breaks every later block.
   */
  epochHash: string;
  time: number;
  txRoot: string;
  /**
   * Coordinators whose finals certified the previous block, as the proposer
   * saw them. Only steers who proposes first at the next height (dead
   * coordinators are skipped), so it affects liveness, never safety. Empty at
   * height 1.
   */
  active: string[];
};

export type Block = { header: BlockHeader; txs: SwarmTx[] };

/** A quorum of "final" statements for one block. */
export type QuorumCertificate = {
  height: number;
  /** The Tendermint round the block was decided in; informational. */
  round: number;
  blockHash: string;
  votes: Statement[];
};

export type CommittedBlock = { block: Block; hash: string; qc: QuorumCertificate };

export type NodeLeaseRecord = {
  epoch: number;
  durationMs: number;
  heartbeatSeq: number;
  /** Height of the block that granted it. */
  height: number;
};

export type SwarmState = {
  swarmId: string;
  genesisHash: string;
  /** Height of the last committed block; 0 is genesis. */
  height: number;
  headHash: string;
  headTime: number;
  epoch: number;
  /**
   * Hash of the current epoch: over the previous epoch's hash and everything
   * this one starts with (its number, the block it starts at, the policy, the
   * coordinators, admins and members, the evicted). See epochHashOf.
   */
  epochHash: string;
  params: SwarmParams;
  bundleHash: string;
  /** Sorted by id; proposer order follows this order. */
  coordinators: SwarmPrincipalKey[];
  /** From the last block's header: who to try first as proposer. */
  active: string[];
  /** Listen addresses of coordinators added after genesis, and of eligible nodes. */
  addresses: Map<string, string>;
  /** Bumped on every roster change; approvals of roster changes bind to it. */
  rosterVersion: number;
  admins: SwarmPrincipalKey[];
  nodes: Map<string, SwarmPrincipalKey>;
  leases: Map<string, NodeLeaseRecord>;
  /** Highest heartbeat seq used per node. Kept across epochs so no heartbeat is used twice. */
  lastHeartbeatSeq: Map<string, number>;
  /** Height at which each node joined or last had a lease granted: its expiry clock. */
  lastRenewed: Map<string, number>;
  /** Nodes that joined as observers: never leased, never expired. */
  observers: Set<string>;
  /** Ids that may never rejoin under the same identity. */
  evicted: Set<string>;
  /** Set once the chain can no longer reach a safe quorum; it then refuses new blocks. */
  halted: string | null;
};
