// Long-running swarm processes: a coordinator (inside a gateway, or standalone
// for HPC jobs), a node that follows the chain and holds a lease, and the
// local decision socket that per-rank client libraries call.

import { timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileLedgerStore, readyDigest, SwarmLedger } from "./chain.js";
import { CoordinatorEngine, type ConsensusTimeouts } from "./consensus.js";
import { canPromote } from "./mempool.js";
import { SwarmHub } from "./net.js";
import { SwarmNode, type ActionClass, type LeaseDecision } from "./node.js";
import { fileSignGuardStore } from "./sign-guard.js";
import type { SwarmSigner } from "./signer.js";
import type {
  CommittedBlock,
  EquivocationProof,
  Genesis,
  HeartbeatStatus,
  SwarmState,
} from "./types.js";

export type HostPort = { host: string; port: number };

/**
 * Where to reach each current coordinator: genesis coordinators from the
 * deployment's address list, later ones from the address recorded on chain
 * when they were added or promoted.
 */
export function coordinatorPeers(
  state: Pick<SwarmState, "coordinators" | "addresses">,
  genesisAddrs: ReadonlyMap<string, HostPort>,
  selfId?: string,
): HostPort[] {
  const out: HostPort[] = [];
  for (const c of state.coordinators) {
    if (c.id === selfId) {
      continue;
    }
    const onChain = state.addresses.get(c.id);
    const addr = onChain ? parseHostPorts(onChain)[0] : genesisAddrs.get(c.id);
    if (addr) {
      out.push(addr);
    }
  }
  return out;
}

export function parseHostPorts(list: string): HostPort[] {
  return list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.lastIndexOf(":");
      const port = Number(s.slice(i + 1));
      if (i <= 0 || !Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error(`not host:port: ${s}`);
      }
      return { host: s.slice(0, i), port };
    });
}

export type CoordinatorHandle = {
  engine: CoordinatorEngine;
  hub: SwarmHub;
  ledger: SwarmLedger;
  /** Height of the first stored block that failed verification at startup, if any. */
  truncatedAt: number | null;
  stop(): Promise<void>;
};

export async function runCoordinator(opts: {
  genesis: Genesis;
  signer: SwarmSigner;
  dataDir: string;
  listen: HostPort;
  peers: HostPort[];
  /** Genesis coordinators' addresses; when given, peers follow the on-chain roster. */
  genesisAddrs?: ReadonlyMap<string, HostPort>;
  /**
   * Committed blocks this process already verified (a promoted node's own
   * chain), so the coordinator starts at the tip. Each is verified again.
   */
  seed?: CommittedBlock[];
  timeouts?: Partial<ConsensusTimeouts>;
  onCommit?: (cb: CommittedBlock) => void;
  onEvidence?: (proof: EquivocationProof) => void;
  onAlert?: (message: string) => void;
}): Promise<CoordinatorHandle> {
  mkdirSync(opts.dataDir, { recursive: true });
  const id = opts.signer.key.id;
  const { ledger, truncatedAt } = SwarmLedger.restore(
    opts.genesis,
    fileLedgerStore(path.join(opts.dataDir, `ledger-${id}.jsonl`)),
  );
  if (opts.seed) {
    ledger.sync(opts.seed);
  }
  // Assigned right after construction; the hub only calls back once started.
  let engine!: CoordinatorEngine;
  const hub = new SwarmHub({
    id,
    role: "coordinator",
    listen: opts.listen,
    connect: opts.peers,
    ledger,
    onConsensus: (msg) => engine.receive(msg),
    onCommit: (committed) => engine.receive({ type: "commit", committed }),
    onHeartbeat: (hb) => {
      engine.acceptHeartbeat(hb);
    },
    onTx: (tx) => engine.submit(tx),
  });
  engine = new CoordinatorEngine({
    ledger,
    signer: opts.signer,
    timeouts: opts.timeouts,
    signGuard: fileSignGuardStore(path.join(opts.dataDir, `guard-${id}.json`)),
    transport: {
      broadcast: (msg) => {
        // Commits go out through onCommit below, which also covers synced blocks.
        if (msg.type !== "commit") {
          hub.broadcastConsensus(msg);
        }
      },
      requestSync: (from) => hub.requestSync(from),
    },
    onCommit: (cb) => {
      // Blocks learned by sync reach nodes too, not just the ones we decided.
      hub.publishCommit(cb);
      if (opts.genesisAddrs) {
        hub.setTargets(coordinatorPeers(ledger.state, opts.genesisAddrs, id));
      }
      opts.onCommit?.(cb);
    },
    onEvidence: opts.onEvidence,
    onAlert: opts.onAlert,
  });
  await hub.start();
  engine.start();
  return {
    engine,
    hub,
    ledger,
    truncatedAt,
    async stop() {
      engine.stop();
      await hub.close();
    },
  };
}

export type NodeHandle = {
  node: SwarmNode;
  hub: SwarmHub;
  ledger: SwarmLedger;
  /** Set while this node also serves as a coordinator after a promotion. */
  coordinator(): CoordinatorHandle | null;
  stop(): Promise<void>;
};

export async function runNode(opts: {
  genesis: Genesis;
  signer: SwarmSigner;
  coordinators: HostPort[];
  deviceStatus?: () => { status: HeartbeatStatus | "UNAVAILABLE"; reason?: string };
  safetyMarginMs?: number;
  onBlock?: (cb: CommittedBlock) => void;
  /** Genesis coordinators' addresses; when given, the node follows the on-chain roster. */
  genesisAddrs?: ReadonlyMap<string, HostPort>;
  /**
   * For long-lived hosts that joined as coordinator candidates: once the chain
   * promotes this node, start a coordinator with the same key, listening here.
   */
  promotion?: {
    listen: HostPort;
    dataDir: string;
    timeouts?: Partial<ConsensusTimeouts>;
    onCommit?: (cb: CommittedBlock) => void;
    onAlert?: (message: string) => void;
    onPromoted?: (height: number) => void;
  };
}): Promise<NodeHandle> {
  const { ledger } = SwarmLedger.restore(opts.genesis);
  const id = opts.signer.key.id;
  let node!: SwarmNode;
  let coordinator: CoordinatorHandle | null = null;
  let starting = false;
  let stopped = false;
  let lastAsk = Number.NEGATIVE_INFINITY;
  const maybePromote = () => {
    const p = opts.promotion;
    if (!p || coordinator || starting || stopped || !opts.genesisAddrs) {
      return;
    }
    const isCoordinator = ledger.state.coordinators.some((c) => c.id === id);
    if (!isCoordinator) {
      // Ask for promotion when the growth rule allows it, proving we are synced.
      const now = Date.now();
      if (canPromote(ledger.state, id) && now - lastAsk > 2 * ledger.state.params.heartbeatMs) {
        lastAsk = now;
        const height = ledger.height;
        void opts.signer.sign(readyDigest(ledger.state.swarmId, id, height)).then((sig) => {
          hub.submitTx({ type: "coordinator.promote", nodeId: id, ready: { height, sig } });
        });
      }
      return;
    }
    starting = true;
    void runCoordinator({
      genesis: opts.genesis,
      signer: opts.signer,
      dataDir: p.dataDir,
      listen: p.listen,
      peers: coordinatorPeers(ledger.state, opts.genesisAddrs, id),
      genesisAddrs: opts.genesisAddrs,
      seed: ledger.blocksFrom(1, ledger.height),
      timeouts: p.timeouts,
      onCommit: p.onCommit,
      onAlert: p.onAlert,
    }).then(
      (h) => {
        coordinator = h;
        starting = false;
        p.onPromoted?.(ledger.height);
      },
      (err: unknown) => {
        starting = false;
        p.onAlert?.(`could not start coordinator: ${(err as Error).message}`);
      },
    );
  };
  const hub = new SwarmHub({
    id,
    role: "node",
    connect: opts.coordinators,
    ledger,
    onCommit: (cb) => {
      const before = ledger.height;
      node.ingest(cb);
      if (ledger.height > before) {
        if (opts.genesisAddrs) {
          hub.setTargets(coordinatorPeers(ledger.state, opts.genesisAddrs, id));
        }
        maybePromote();
        opts.onBlock?.(cb);
      }
    },
  });
  node = new SwarmNode({
    ledger,
    signer: opts.signer,
    sendHeartbeat: (hb, o) => hub.sendHeartbeat(hb, o),
    requestSync: (from) => hub.requestSync(from),
    deviceStatus: opts.deviceStatus,
    safetyMarginMs: opts.safetyMarginMs,
  });
  await hub.start();
  node.start();
  return {
    node,
    hub,
    ledger,
    coordinator: () => coordinator,
    async stop() {
      stopped = true;
      node.stop();
      await coordinator?.stop();
      await hub.close();
    },
  };
}

// ---- local decision socket --------------------------------------------------

function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type DecisionRequest = {
  token: string;
  /** What the caller is about to do, for the audit trail. */
  action: string;
  class: ActionClass;
};

export type DecisionReply = { allowed: boolean; code?: string; reason?: string };

/**
 * Serves lease decisions to the processes this node supervises, over a Unix
 * socket only they can reach: the socket lives in a 0700 directory and every
 * request carries a per-launch token passed in the child's environment.
 * Answers come from memory, so a rank's check costs one local round trip.
 */
export async function startDecisionServer(opts: {
  socketPath: string;
  token: string;
  decide: (req: DecisionRequest) => LeaseDecision;
  onDecision?: (req: DecisionRequest, reply: DecisionReply) => void;
}): Promise<{ close(): Promise<void> }> {
  if (Buffer.byteLength(opts.socketPath) > 100) {
    throw new Error(`decision socket path is too long for a Unix socket: ${opts.socketPath}`);
  }
  const dir = path.dirname(opts.socketPath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  rmSync(opts.socketPath, { force: true });
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let buf = "";
    socket.on("data", (chunk: string) => {
      buf += chunk;
      if (buf.length > 64 * 1024) {
        socket.destroy();
        return;
      }
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        let reply: DecisionReply;
        let req: DecisionRequest | null = null;
        try {
          req = JSON.parse(line) as DecisionRequest;
        } catch {
          req = null;
        }
        if (!req || typeof req.token !== "string" || !tokenMatches(req.token, opts.token)) {
          reply = { allowed: false, code: "unauthorized", reason: "bad or missing token" };
        } else if (req.class !== "reversible" && req.class !== "irreversible") {
          reply = {
            allowed: false,
            code: "bad-request",
            reason: "class must be reversible or irreversible",
          };
        } else {
          const d = opts.decide(req);
          reply = d.allowed
            ? { allowed: true }
            : { allowed: false, code: d.code, reason: d.reason };
          opts.onDecision?.(req, reply);
        }
        socket.write(JSON.stringify(reply) + "\n");
      }
    });
    socket.on("error", () => socket.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.socketPath, () => resolve());
  });
  chmodSync(opts.socketPath, 0o600);
  return {
    close: () =>
      new Promise<void>((r) =>
        server.close(() => {
          rmSync(opts.socketPath, { force: true });
          r();
        }),
      ),
  };
}
