// Byzantine-fault-tolerant agreement among the coordinators.
//
// This is the Tendermint algorithm (Buchman, Kwon, Milosevic 2018): rounds of
// propose -> prevote -> precommit, with locking so that a block once
// precommitted by 2f+1 can never be contradicted while at most f coordinators
// are faulty. One step is added after Tendermint decides: each coordinator
// signs a single "final" statement for the height, and only a quorum of finals
// commits the block. Tendermint alone cannot always name the culprits of a
// fork (a coordinator that ignores its lock in a later round signs no two
// votes for the same slot); with finals, any fork means the coordinators in
// both certificates signed two finals for one height, which is evidence anyone
// can check.
//
// It runs inside each gateway that hosts a coordinator. Agents never wait on
// it: per-action decisions stay local to each node, and the chain only carries
// membership, epochs, leases and evidence.
//
// The engine is transport- and clock-agnostic so the same code runs over the
// gateway connection in production and over an in-memory network in tests.

import {
  activeFor,
  applyBlock,
  blockHash,
  coordinatorKey,
  faultTolerance,
  makeBlock,
  proposerFor,
  quorumSize,
  statementDigest,
  verifyEquivocation,
  verifyStatement,
  type CommitResult,
  type SwarmLedger,
} from "./chain.js";
import { verifyHeartbeat } from "./heartbeat.js";
import { Mempool } from "./mempool.js";
import {
  memorySignGuardStore,
  SignGuard,
  type SignGuardRecord,
  type SignGuardStore,
} from "./sign-guard.js";
import type { SwarmSigner } from "./signer.js";
import type {
  Block,
  CommittedBlock,
  EquivocationProof,
  SignedHeartbeat,
  Statement,
  StatementKind,
  SwarmTx,
} from "./types.js";

export type ConsensusMessage =
  | { type: "proposal"; statement: Statement; block: Block }
  | { type: "vote"; statement: Statement }
  | { type: "commit"; committed: CommittedBlock }
  | { type: "tx"; tx: SwarmTx };

export interface ConsensusTransport {
  broadcast(msg: ConsensusMessage): void;
  /** Ask peers for committed blocks starting at `fromHeight`; they arrive as commit messages. */
  requestSync(fromHeight: number): void;
}

export interface ConsensusClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemClock: ConsensusClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return t;
  },
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export type ConsensusTimeouts = {
  proposeMs: number;
  prevoteMs: number;
  precommitMs: number;
  /** Added per round so a slow network eventually gets enough time. */
  roundStepMs: number;
  /** Pause between a commit and the next height, so transactions batch. */
  blockIntervalMs: number;
  /** A proposal whose time is further than this from ours is refused. */
  maxClockSkewMs: number;
  /**
   * How often a coordinator re-sends its own statements for the current height.
   * Links drop messages and peers restart; without re-sending, a round that
   * lost a vote would wait forever.
   */
  regossipMs: number;
};

export const DEFAULT_TIMEOUTS: ConsensusTimeouts = {
  proposeMs: 1000,
  prevoteMs: 500,
  precommitMs: 500,
  roundStepMs: 250,
  blockIntervalMs: 1000,
  maxClockSkewMs: 30_000,
  regossipMs: 1000,
};

type Step = "propose" | "prevote" | "precommit" | "decided";

export type CoordinatorEngineOptions = {
  ledger: SwarmLedger;
  signer: SwarmSigner;
  transport: ConsensusTransport;
  clock?: ConsensusClock;
  timeouts?: Partial<ConsensusTimeouts>;
  maxTxsPerBlock?: number;
  onCommit?: (cb: CommittedBlock) => void;
  /**
   * Durable record of what this coordinator has signed. Production must pass a
   * file-backed store; the in-memory default forgets on restart.
   */
  signGuard?: SignGuardStore;
  /** A coordinator double-signed. The engine also queues its eviction. */
  onEvidence?: (proof: EquivocationProof) => void;
  /** The ledger refused a block: a fork (fail closed) or a malformed peer message. */
  onAlert?: (message: string) => void;
};

export class CoordinatorEngine {
  private readonly ledger: SwarmLedger;
  private readonly signer: SwarmSigner;
  private readonly transport: ConsensusTransport;
  private readonly clock: ConsensusClock;
  private readonly timeouts: ConsensusTimeouts;
  private readonly maxTxs: number;
  private readonly opts: CoordinatorEngineOptions;
  private readonly mempool = new Mempool();
  private readonly guard: SignGuard;

  private running = false;
  private height = 0;
  private round = 0;
  private step: Step = "propose";
  private lockedRound = -1;
  private lockedHash: string | null = null;
  private validRound = -1;
  private validBlock: Block | null = null;
  /** round -> proposal accepted from that round's proposer. */
  private proposals = new Map<number, { block: Block; hash: string; validRound: number }>();
  /** `${kind}:${round}` -> signer -> statement; first statement per slot wins. */
  private votes = new Map<string, Map<string, Statement>>();
  private firedPrevoteTimeout = new Set<number>();
  private firedPrecommitTimeout = new Set<number>();
  private timers = new Set<unknown>();
  /** Statements for heights we have not reached yet, replayed when we get there. */
  private future: ConsensusMessage[] = [];
  private evidenceSeen = new Set<string>();
  /** What this coordinator has said at the current height, re-sent by regossip(). */
  private own: ConsensusMessage[] = [];
  private gossipTimer: unknown = null;
  private lastSyncRequest = Number.NEGATIVE_INFINITY;
  /** The block this coordinator decided at the current height, once it has. */
  private decision: { round: number; block: Block; hash: string } | null = null;
  /** The current height's block is on the ledger. */
  private committed = false;

  constructor(opts: CoordinatorEngineOptions) {
    this.opts = opts;
    this.ledger = opts.ledger;
    this.signer = opts.signer;
    this.transport = opts.transport;
    this.clock = opts.clock ?? systemClock;
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...opts.timeouts };
    this.maxTxs = opts.maxTxsPerBlock ?? 4096;
    this.guard = new SignGuard(opts.signGuard ?? memorySignGuardStore());
  }

  get id(): string {
    return this.signer.key.id;
  }

  /** Where consensus is right now, for status displays. */
  status(): { height: number; round: number; step: Step; mempool: number; halted: string | null } {
    return {
      height: this.height,
      round: this.round,
      step: this.step,
      mempool: this.mempool.size,
      halted: this.ledger.state.halted,
    };
  }

  start(): void {
    if (this.running) {
      return;
    }
    if (!coordinatorKey(this.ledger.state, this.id)) {
      throw new Error(`swarm: ${this.id} is not a coordinator of ${this.ledger.state.swarmId}`);
    }
    this.running = true;
    this.transport.requestSync(this.ledger.height + 1);
    this.startHeight();
    this.regossip();
  }

  stop(): void {
    this.running = false;
    for (const t of this.timers) {
      this.clock.clearTimeout(t);
    }
    this.timers.clear();
    if (this.gossipTimer !== null) {
      this.clock.clearTimeout(this.gossipTimer);
      this.gossipTimer = null;
    }
  }

  private regossip(): void {
    this.gossipTimer = this.clock.setTimeout(() => {
      if (!this.running) {
        return;
      }
      // Keep re-sending until the block is committed: peers that have not
      // decided yet need our precommits and our final to get there.
      if (!this.committed) {
        for (const msg of this.own) {
          this.transport.broadcast(msg);
        }
      }
      this.regossip();
    }, this.timeouts.regossipMs);
  }

  private requestSyncThrottled(): void {
    const now = this.clock.now();
    if (now - this.lastSyncRequest >= this.timeouts.regossipMs) {
      this.lastSyncRequest = now;
      this.transport.requestSync(this.ledger.height + 1);
    }
  }

  /**
   * A heartbeat from a node attached to this gateway. CLEAN renews the node's
   * lease; DIRTY is evidence that evicts it. Anything that does not verify
   * against the node's registered key is dropped.
   */
  acceptHeartbeat(hb: SignedHeartbeat): "lease" | "evict" | "rejected" {
    const state = this.ledger.state;
    const node = hb?.body ? state.nodes.get(hb.body.nodeId) : undefined;
    if (!node || hb.body.swarmId !== state.swarmId || !verifyHeartbeat(node, hb)) {
      return "rejected";
    }
    if (hb.body.status === "DIRTY") {
      this.submit({ type: "node.evict", nodeId: node.id, reason: "dirty", evidence: hb });
      return "evict";
    }
    this.submit({
      type: "lease.grant",
      nodeId: node.id,
      epoch: state.epoch,
      durationMs: state.params.leaseMs,
      heartbeat: hb,
    });
    return "lease";
  }

  /** Queue a transaction locally and gossip it to the other coordinators. */
  submit(tx: SwarmTx): void {
    this.mempool.add(tx);
    this.transport.broadcast({ type: "tx", tx });
  }

  receive(msg: ConsensusMessage): void {
    if (!this.running || !msg) {
      return;
    }
    switch (msg.type) {
      case "tx":
        this.mempool.add(msg.tx);
        return;
      case "commit":
        this.onCommitMessage(msg.committed);
        return;
      case "proposal":
      case "vote": {
        const h = msg.statement?.height;
        if (h > this.height) {
          if (this.future.length < 4096) {
            this.future.push(msg);
          }
          // Peers are past us: we missed a commit. Ask for it rather than wait.
          this.requestSyncThrottled();
          return;
        }
        if (h === this.height) {
          this.onStatement(msg);
        }
        return;
      }
    }
  }

  // ---- heights and rounds ---------------------------------------------

  private startHeight(): void {
    if (!this.running) {
      return;
    }
    const state = this.ledger.state;
    if (state.halted) {
      this.opts.onAlert?.(`swarm chain halted: ${state.halted}`);
      return;
    }
    if (!coordinatorKey(state, this.id)) {
      this.opts.onAlert?.(`${this.id} is no longer a coordinator; stopping`);
      this.stop();
      return;
    }
    this.height = this.ledger.height + 1;
    this.lockedRound = -1;
    this.lockedHash = null;
    this.validRound = -1;
    this.validBlock = null;
    this.proposals.clear();
    this.votes.clear();
    this.firedPrevoteTimeout.clear();
    this.firedPrecommitTimeout.clear();
    this.own = [];
    this.decision = null;
    this.committed = false;
    // Resuming a height we already signed in: restore the lock and move past
    // every round we voted in, so nothing we sign can contradict what we signed.
    const last = this.guard.last;
    let firstRound = 0;
    if (last && last.height === this.height && last.kind === "final" && last.validBlock) {
      // We had decided and signed our final; re-send exactly that and wait.
      this.step = "decided";
      this.decision = {
        round: last.validRound,
        block: last.validBlock,
        hash: last.blockHash ?? "",
      };
      void this.signFinal();
      this.replayFuture();
      return;
    }
    if (last && last.height === this.height) {
      this.lockedRound = last.lockedRound;
      this.lockedHash = last.lockedHash;
      this.validRound = last.validRound;
      this.validBlock = last.validBlock;
      firstRound = last.round + 1;
    }
    this.startRound(firstRound);
    this.replayFuture();
  }

  private replayFuture(): void {
    const pending = this.future.filter(
      (m) => "statement" in m && m.statement.height === this.height,
    );
    this.future = this.future.filter((m) => "statement" in m && m.statement.height > this.height);
    for (const m of pending) {
      this.onStatement(m as Extract<ConsensusMessage, { statement: Statement }>);
    }
  }

  private startRound(round: number): void {
    this.round = round;
    this.step = "propose";
    const state = this.ledger.state;
    if (proposerFor(state, round) === this.id) {
      const block =
        this.validBlock ??
        makeBlock(state, {
          proposer: this.id,
          round,
          time: this.clock.now(),
          txs: this.mempool.build(state, state.params.leaseMs, this.maxTxs),
          active: activeFor(state, this.ledger.block(this.ledger.height)),
        });
      void this.sign("proposal", round, blockHash(block.header), this.validRound).then((st) => {
        if (st) {
          const msg: ConsensusMessage = { type: "proposal", statement: st, block };
          this.own.push(msg);
          this.transport.broadcast(msg);
          this.onStatement(msg);
        }
      });
    }
    this.schedule(this.timeouts.proposeMs + round * this.timeouts.roundStepMs, () => {
      if (this.round === round && this.step === "propose") {
        void this.vote("prevote", round, null);
      }
    });
    this.evaluate();
  }

  // ---- statements -------------------------------------------------------

  private onStatement(msg: Extract<ConsensusMessage, { statement: Statement }>): void {
    const st = msg.statement;
    const state = this.ledger.state;
    if (
      !st ||
      st.height !== this.height ||
      !Number.isSafeInteger(st.round) ||
      st.round < 0 ||
      !verifyStatement(state, st)
    ) {
      return;
    }
    if (msg.type === "proposal") {
      if (st.kind !== "proposal" || st.signer !== proposerFor(state, st.round)) {
        return;
      }
      if (!this.recordStatement(st)) {
        return;
      }
      if (!msg.block || blockHash(msg.block.header) !== st.blockHash) {
        return;
      }
      if (!this.proposals.has(st.round)) {
        this.proposals.set(st.round, {
          block: msg.block,
          hash: st.blockHash,
          validRound: st.validRound ?? -1,
        });
      }
    } else {
      if (st.kind === "final") {
        if (st.round !== 0 || st.blockHash === null) {
          return;
        }
      } else if (st.kind !== "prevote" && st.kind !== "precommit") {
        return;
      }
      if (!this.recordStatement(st)) {
        return;
      }
    }
    this.evaluate();
  }

  /**
   * Remembers the first statement per (kind, round, signer). A second one that
   * names a different block is a double-sign: keep the first, report both.
   * Returns false when the statement should not be counted.
   */
  private recordStatement(st: Statement): boolean {
    const slotKey = `${st.kind}:${st.round}`;
    let slot = this.votes.get(slotKey);
    if (!slot) {
      slot = new Map();
      this.votes.set(slotKey, slot);
    }
    const prev = slot.get(st.signer);
    if (!prev) {
      slot.set(st.signer, st);
      return true;
    }
    if (prev.blockHash !== st.blockHash) {
      this.reportEquivocation({ a: prev, b: st });
    }
    return false;
  }

  private reportEquivocation(proof: EquivocationProof): void {
    const key = `${proof.a.signer}:${proof.a.kind}:${proof.a.height}:${proof.a.round}`;
    if (this.evidenceSeen.has(key) || !verifyEquivocation(this.ledger.state, proof)) {
      return;
    }
    this.evidenceSeen.add(key);
    this.opts.onEvidence?.(proof);
    this.submit({ type: "coordinator.evict", coordinatorId: proof.a.signer, evidence: proof });
  }

  private count(kind: StatementKind, round: number, hash?: string | null): number {
    const slot = this.votes.get(`${kind}:${round}`);
    if (!slot) {
      return 0;
    }
    if (hash === undefined) {
      return slot.size;
    }
    let n = 0;
    for (const v of slot.values()) {
      if (v.blockHash === hash) {
        n += 1;
      }
    }
    return n;
  }

  private quorum(): number {
    return quorumSize(this.ledger.state.coordinators.length);
  }

  private isValid(block: Block): boolean {
    if (Math.abs(block.header.time - this.clock.now()) > this.timeouts.maxClockSkewMs) {
      return false;
    }
    try {
      applyBlock(this.ledger.state, block);
      return true;
    } catch {
      return false;
    }
  }

  /** The Tendermint "upon" rules, re-checked after every event. */
  private evaluate(): void {
    if (!this.running || this.committed) {
      return;
    }
    this.tryFinalize();
    if (this.committed || this.step === "decided") {
      return;
    }
    const q = this.quorum();
    const r = this.round;
    const prop = this.proposals.get(r);

    // Proposal for this round, while still waiting to prevote.
    if (prop && this.step === "propose") {
      const vr = prop.validRound;
      if (vr < 0) {
        const ok =
          this.isValid(prop.block) && (this.lockedRound === -1 || this.lockedHash === prop.hash);
        void this.vote("prevote", r, ok ? prop.hash : null);
      } else if (vr < r && this.count("prevote", vr, prop.hash) >= q) {
        const ok =
          this.isValid(prop.block) && (this.lockedRound <= vr || this.lockedHash === prop.hash);
        void this.vote("prevote", r, ok ? prop.hash : null);
      }
    }

    if (
      this.step === "prevote" &&
      this.count("prevote", r) >= q &&
      !this.firedPrevoteTimeout.has(r)
    ) {
      this.firedPrevoteTimeout.add(r);
      this.schedule(this.timeouts.prevoteMs + r * this.timeouts.roundStepMs, () => {
        if (this.round === r && this.step === "prevote") {
          void this.vote("precommit", r, null);
        }
      });
    }

    // 2f+1 prevotes for this round's proposal: lock it and precommit.
    if (
      prop &&
      (this.step === "prevote" || this.step === "precommit") &&
      this.count("prevote", r, prop.hash) >= q &&
      this.validRound !== r
    ) {
      if (this.isValid(prop.block)) {
        if (this.step === "prevote") {
          this.lockedRound = r;
          this.lockedHash = prop.hash;
          void this.vote("precommit", r, prop.hash);
        }
        this.validRound = r;
        this.validBlock = prop.block;
      }
    }

    if (this.step === "prevote" && this.count("prevote", r, null) >= q) {
      void this.vote("precommit", r, null);
    }

    if (this.count("precommit", r) >= q && !this.firedPrecommitTimeout.has(r)) {
      this.firedPrecommitTimeout.add(r);
      this.schedule(this.timeouts.precommitMs + r * this.timeouts.roundStepMs, () => {
        if (this.round === r && this.step !== "decided") {
          this.startRound(r + 1);
        }
      });
    }

    // Decide: any round whose proposal has 2f+1 precommits.
    for (const [round, p] of this.proposals) {
      if (this.count("precommit", round, p.hash) >= q) {
        this.decide(round, p.block, p.hash);
        return;
      }
    }

    // f+1 coordinators are already in a later round: catch up.
    const f1 = faultTolerance(this.ledger.state.coordinators.length) + 1;
    let skipTo = -1;
    for (const key of this.votes.keys()) {
      const round = Number(key.split(":")[1]);
      if (round > r && this.signersInRound(round) >= f1) {
        skipTo = Math.max(skipTo, round);
      }
    }
    if (skipTo > r) {
      this.startRound(skipTo);
    }
  }

  private signersInRound(round: number): number {
    const ids = new Set<string>();
    for (const kind of ["proposal", "prevote", "precommit"] as const) {
      for (const id of this.votes.get(`${kind}:${round}`)?.keys() ?? []) {
        ids.add(id);
      }
    }
    return ids.size;
  }

  /**
   * Tendermint has decided `block`. Sign our final for it, and pass on what
   * convinced us (the proposal and the precommits), so that peers who missed
   * some of those messages can decide too and add their finals.
   */
  private decide(round: number, block: Block, hash: string): void {
    this.step = "decided";
    this.decision = { round, block, hash };
    const proposal = this.votes.get(`proposal:${round}`)?.values().next().value;
    if (proposal) {
      this.own.push({ type: "proposal", statement: proposal, block });
    }
    for (const v of this.votes.get(`precommit:${round}`)?.values() ?? []) {
      if (v.blockHash === hash && v.signer !== this.id) {
        this.own.push({ type: "vote", statement: v });
      }
    }
    void this.signFinal();
  }

  private async signFinal(): Promise<void> {
    const d = this.decision;
    if (!d) {
      return;
    }
    const st = await this.sign("final", 0, d.hash, undefined, {
      lockedRound: this.lockedRound,
      lockedHash: this.lockedHash,
      validRound: d.round,
      validBlock: d.block,
    });
    if (st) {
      const msg: ConsensusMessage = { type: "vote", statement: st };
      this.own.push(msg);
      this.transport.broadcast(msg);
      this.onStatement(msg);
    }
  }

  /** Commits the height's block once a quorum of finals names one we hold. */
  private tryFinalize(): void {
    const slot = this.votes.get("final:0");
    if (this.committed || !slot) {
      return;
    }
    const byHash = new Map<string, Statement[]>();
    for (const v of slot.values()) {
      const list = byHash.get(v.blockHash ?? "") ?? [];
      list.push(v);
      byHash.set(v.blockHash ?? "", list);
    }
    for (const [hash, finals] of byHash) {
      if (finals.length < this.quorum()) {
        continue;
      }
      const block =
        this.decision?.hash === hash
          ? this.decision.block
          : [...this.proposals.values()].find((p) => p.hash === hash)?.block;
      if (!block) {
        // We have the certificate but not the block; a peer's commit will bring both.
        this.requestSyncThrottled();
        return;
      }
      const committed: CommittedBlock = {
        block,
        hash,
        qc: {
          height: this.height,
          round: this.decision?.round ?? block.header.round,
          blockHash: hash,
          votes: finals.toSorted((a, b) => (a.signer < b.signer ? -1 : 1)),
        },
      };
      const result = this.ledger.commit(committed);
      if (!result.ok) {
        this.onCommitRefused(result);
        return;
      }
      this.transport.broadcast({ type: "commit", committed });
      this.afterCommit(committed);
      return;
    }
  }

  private onCommitRefused(result: Exclude<CommitResult, { ok: true }>): void {
    if (result.code === "fork") {
      for (const proof of result.fork.proofs) {
        this.opts.onEvidence?.(proof);
      }
      this.opts.onAlert?.(
        `FORK at height ${result.fork.height}: double signers ${result.fork.doubleSigners.join(", ")}`,
      );
      this.stop();
    } else if (result.code === "gap") {
      this.requestSyncThrottled();
    } else {
      this.opts.onAlert?.(`block refused by ledger: ${result.error.slice(0, 200)}`);
    }
  }

  private onCommitMessage(cb: CommittedBlock): void {
    const result = this.ledger.commit(cb);
    if (!result.ok) {
      if (result.code !== "invalid") {
        this.onCommitRefused(result);
      }
      return;
    }
    if (result.applied) {
      this.afterCommit(cb);
    }
  }

  private afterCommit(cb: CommittedBlock): void {
    this.mempool.prune(this.ledger.state);
    this.opts.onCommit?.(cb);
    for (const t of this.timers) {
      this.clock.clearTimeout(t);
    }
    this.timers.clear();
    // During a catch-up each block reschedules this, so only the last one starts a height.
    this.step = "decided";
    this.committed = true;
    this.schedule(this.timeouts.blockIntervalMs, () => this.startHeight());
  }

  // ---- signing --------------------------------------------------------

  private async vote(
    kind: "prevote" | "precommit",
    round: number,
    hash: string | null,
  ): Promise<void> {
    // Step advances synchronously so a rule cannot fire twice while the device signs.
    this.step = kind;
    const st = await this.sign(kind, round, hash);
    if (st) {
      const msg: ConsensusMessage = { type: "vote", statement: st };
      this.own.push(msg);
      this.transport.broadcast(msg);
      this.onStatement(msg);
    }
  }

  private async sign(
    kind: StatementKind,
    round: number,
    hash: string | null,
    validRound?: number,
    lockOverride?: Pick<
      SignGuardRecord,
      "lockedRound" | "lockedHash" | "validRound" | "validBlock"
    >,
  ): Promise<Statement | null> {
    const height = this.height;
    const body: Statement = {
      swarmId: this.ledger.state.swarmId,
      kind,
      height,
      round,
      blockHash: hash,
      ...(kind === "proposal" ? { validRound: validRound ?? -1 } : {}),
      signer: this.id,
      sig: "",
    };
    const lock = lockOverride ?? {
      lockedRound: this.lockedRound,
      lockedHash: this.lockedHash,
      validRound: this.validRound,
      validBlock: this.validBlock,
    };
    if (!this.guard.admit({ height, round, kind, blockHash: hash }, lock)) {
      this.opts.onAlert?.(
        `refused to sign ${kind} h${height} r${round}: would contradict an earlier signature`,
      );
      return null;
    }
    try {
      body.sig = await this.signer.sign(statementDigest(body));
    } catch (err) {
      this.opts.onAlert?.(`signing failed: ${(err as Error).message}`);
      return null;
    }
    // The height may have moved on while the device was signing.
    return this.running && this.height === height ? body : null;
  }

  private schedule(ms: number, fn: () => void): void {
    const handle: unknown = this.clock.setTimeout(() => {
      this.timers.delete(handle);
      if (this.running) {
        fn();
      }
    }, ms);
    this.timers.add(handle);
  }
}
