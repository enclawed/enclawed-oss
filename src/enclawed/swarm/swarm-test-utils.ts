// Test helpers for the swarm: real Ed25519 keys, a deterministic clock and an
// in-memory network that can drop, delay or tamper with messages.

import { createHash, generateKeyPairSync } from "node:crypto";
import { approvalDigest, joinDigest, SwarmLedger, statementDigest } from "./chain.js";
import { CoordinatorEngine, type ConsensusClock, type ConsensusMessage } from "./consensus.js";
import { memorySignGuardStore, type SignGuardStore } from "./sign-guard.js";
import { softwareSigner, type SwarmSigner } from "./signer.js";
import type { Genesis, Statement, SwarmState, SwarmTx } from "./types.js";

export const BUNDLE_0 = createHash("sha256").update("bundle-0").digest("hex");
export const BUNDLE_1 = createHash("sha256").update("bundle-1").digest("hex");

/**
 * A principal key of kind "device" for genesis validation tests. It cannot
 * sign: device signing needs real hardware and is covered by the driver tests.
 */
export function deviceKeyFor(id: string, uidByte: number): SwarmSigner {
  const { publicKey } = generateKeyPairSync("ed25519");
  return {
    key: {
      id,
      kind: "device",
      publicKey: Buffer.from(String(publicKey.export({ format: "jwk" }).x), "base64url").toString(
        "hex",
      ),
      uid: uidByte.toString(16).padStart(2, "0").repeat(12),
    },
    async sign() {
      throw new Error("test device key cannot sign");
    },
  };
}

export function makeGenesis(opts: {
  coordinators: SwarmSigner[];
  admins: SwarmSigner[];
  leaseMs?: number;
  heartbeatMs?: number;
  requireDeviceKeys?: boolean;
  growth?: { maxCoordinators: number; nodesPerCoordinator: number };
  expiryBlocks?: number;
}): Genesis {
  return {
    swarmId: "swarm-test",
    createdAt: 0,
    coordinators: opts.coordinators.map((s) => s.key),
    admins: opts.admins.map((s) => s.key),
    params: {
      leaseMs: opts.leaseMs ?? 30_000,
      heartbeatMs: opts.heartbeatMs ?? 5_000,
      requireDeviceKeys: opts.requireDeviceKeys ?? false,
      ...(opts.growth ? { growth: opts.growth } : {}),
      ...(opts.expiryBlocks !== undefined ? { expiryBlocks: opts.expiryBlocks } : {}),
    },
    bundleHash: BUNDLE_0,
  };
}

export function coordinators(n: number): SwarmSigner[] {
  return Array.from({ length: n }, (_, i) => softwareSigner(`coord-${i}`));
}

export async function joinTx(
  state: Pick<SwarmState, "swarmId" | "epoch" | "rosterVersion">,
  node: SwarmSigner,
  admin: SwarmSigner,
  coordinatorAddress?: string,
): Promise<SwarmTx> {
  const pop = await node.sign(joinDigest(state.swarmId, node.key));
  const unsigned = {
    type: "node.join" as const,
    node: node.key,
    pop,
    ...(coordinatorAddress ? { coordinator: { address: coordinatorAddress } } : {}),
    approval: { admin: admin.key.id, sig: "" },
  };
  unsigned.approval.sig = await admin.sign(approvalDigest(state, unsigned));
  return unsigned;
}

export async function bundleTx(
  state: Pick<SwarmState, "swarmId" | "epoch" | "rosterVersion">,
  bundleHash: string,
  admin: SwarmSigner,
): Promise<SwarmTx> {
  const tx = {
    type: "bundle.publish" as const,
    bundleHash,
    approval: { admin: admin.key.id, sig: "" },
  };
  tx.approval.sig = await admin.sign(approvalDigest(state, tx));
  return tx;
}

export async function signStatement(
  signer: SwarmSigner,
  body: Omit<Statement, "sig" | "signer">,
): Promise<Statement> {
  const st: Statement = { ...body, signer: signer.key.id, sig: "" };
  st.sig = await signer.sign(statementDigest(st));
  return st;
}

const flush = () => new Promise<void>((r) => setImmediate(r));

/** Virtual time. Timers run in order; promises settle between them. */
export class FakeClock implements ConsensusClock {
  private t = 0;
  private seq = 0;
  private queue: { at: number; seq: number; fn: () => void; id: number }[] = [];

  now(): number {
    return this.t;
  }

  setTimeout(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.queue.push({ at: this.t + Math.max(0, ms), seq: id, fn, id });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.queue = this.queue.filter((e) => e.id !== handle);
  }

  async runFor(ms: number): Promise<void> {
    const end = this.t + ms;
    await flush();
    for (;;) {
      this.queue.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = this.queue[0];
      if (!next || next.at > end) {
        break;
      }
      this.queue.shift();
      this.t = next.at;
      next.fn();
      await flush();
    }
    this.t = end;
  }
}

type Tamper = (from: string, to: string, msg: ConsensusMessage) => ConsensusMessage[] | null;

/** In-memory network of coordinator engines sharing one FakeClock. */
export class SimNetwork {
  readonly clock = new FakeClock();
  readonly engines = new Map<string, CoordinatorEngine>();
  readonly ledgers = new Map<string, SwarmLedger>();
  readonly guards = new Map<string, SignGuardStore>();
  readonly down = new Set<string>();
  readonly alerts: string[] = [];
  tamper: Tamper | null = null;
  latencyMs = 5;

  constructor(
    readonly genesis: Genesis,
    signers: SwarmSigner[],
  ) {
    for (const signer of signers) {
      this.add(signer);
    }
  }

  /** Adds a coordinator, or restarts one: its ledger and sign guard survive. */
  add(signer: SwarmSigner): CoordinatorEngine {
    const id = signer.key.id;
    this.engines.get(id)?.stop();
    const l = this.ledgers.get(id) ?? SwarmLedger.restore(this.genesis).ledger;
    this.ledgers.set(id, l);
    const guard = this.guards.get(id) ?? memorySignGuardStore();
    this.guards.set(id, guard);
    const engine = new CoordinatorEngine({
      ledger: l,
      signer,
      clock: this.clock,
      timeouts: { blockIntervalMs: 200 },
      signGuard: guard,
      transport: {
        broadcast: (msg) => this.broadcast(id, msg),
        requestSync: (from) => this.sync(id, from),
      },
      onAlert: (m) => this.alerts.push(`${id}: ${m}`),
    });
    this.engines.set(id, engine);
    return engine;
  }

  start(): void {
    for (const [id, e] of this.engines) {
      if (!this.down.has(id)) {
        e.start();
      }
    }
  }

  stop(): void {
    for (const e of this.engines.values()) {
      e.stop();
    }
  }

  private deliver(to: string, msg: ConsensusMessage): void {
    const copy = JSON.parse(JSON.stringify(msg)) as ConsensusMessage;
    this.clock.setTimeout(() => {
      if (!this.down.has(to)) {
        this.engines.get(to)?.receive(copy);
      }
    }, this.latencyMs);
  }

  broadcast(from: string, msg: ConsensusMessage): void {
    if (this.down.has(from)) {
      return;
    }
    for (const to of this.engines.keys()) {
      if (to === from) {
        continue;
      }
      const out = this.tamper ? this.tamper(from, to, msg) : [msg];
      for (const m of out ?? []) {
        this.deliver(to, m);
      }
    }
  }

  private sync(to: string, from: number): void {
    for (const [peer, ledger] of this.ledgers) {
      if (peer === to || this.down.has(peer) || ledger.height < from) {
        continue;
      }
      for (const committed of ledger.blocksFrom(from)) {
        this.deliver(to, { type: "commit", committed });
      }
      return;
    }
  }

  heights(): number[] {
    return [...this.ledgers.values()].map((l) => l.height);
  }
}
