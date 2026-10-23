// `enclawed swarm` commands for running a swarm across processes and MPI ranks.
//
//   init        create a swarm directory: genesis, coordinator and admin keys
//   coordinator run coordinator <index> of the swarm
//   admit       admit an MPI job: one key and one admin-approved join per rank
//   rank        run under mpirun/srun/flux: join as this rank, hold a lease, and
//               supervise the real program (e.g. mpi-myapp), pausing it while the
//               lease is not valid and killing it if the rank is evicted
//   launch      run mpiexec/srun/flux run with every rank wrapped in `rank`
//   host        run a long-lived host as a node that may be promoted to
//               coordinator when the swarm grows (see genesis params.growth)
//   status      print the chain as a coordinator sees it
//   attach      log in to a cluster's login node once, in a terminal (any
//               method the site uses; --kinit first for Kerberos sites), and
//               keep the SSH session for later swarm sessions
//   keygen      make an operator key on the laptop (development; with an
//               Enclaweder the key is the device's) and print its public half
//   relay       on a login node: pipe stdin/stdout to one coordinator (or the
//               declared model endpoint) of this swarm, for an SSH session
//
// Keys in this directory are software keys (0600 files). A production swarm
// keeps coordinator and admin keys in Enclawederes; this layout is for
// development, CI and experiments on hosts without devices.

import { spawn, type StdioOptions } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HardwareRootGuard } from "../hardware-root/guard.js";
import {
  bootHardwareRoot,
  closeHardwareRootSession,
  SOFTWARE_ONLY_NOTICE,
} from "../hardware-root/index.js";
import { parseLauncher } from "../hpc/launchers.js";
import { approvalDigest, joinDigest, SwarmLedger } from "./chain.js";
import { digestHex } from "./codec.js";
import {
  parseHostPorts,
  runCoordinator,
  runNode,
  startDecisionServer,
  type HostPort,
} from "./daemon.js";
import { localDevices, type DeviceAccess, type DeviceHealth } from "./device-broker.js";
import { launchContext } from "./mpi-env.js";
import { SwarmHub } from "./net.js";
import { signalTree } from "./proc-tree.js";
import { fleetSigner, softwareSigner, type SwarmSigner } from "./signer.js";
import type { CommittedBlock, Genesis, SwarmTx } from "./types.js";

type Args = { flags: Map<string, string>; rest: string[] };

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();
  let i = 0;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      i += 1;
      break;
    }
    if (!a.startsWith("--")) {
      break;
    }
    const eq = a.indexOf("=");
    if (eq > 0) {
      flags.set(a.slice(2, eq), a.slice(eq + 1));
    } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) {
      flags.set(a.slice(2), argv[i + 1]);
      i += 1;
    } else {
      flags.set(a.slice(2), "true");
    }
  }
  return { flags, rest: argv.slice(i) };
}

function need(args: Args, name: string): string {
  const v = args.flags.get(name);
  if (!v) {
    throw new Error(`--${name} is required`);
  }
  return v;
}

function log(event: string, fields: Record<string, unknown> = {}): void {
  process.stderr.write(JSON.stringify({ t: Date.now(), event, ...fields }) + "\n");
}

/** Says, every time, that these keys are software keys and what that exposes. */
function warnSoftwareKeys(what: string): void {
  log("warning.software-keys", { what, notice: SOFTWARE_ONLY_NOTICE });
}

function writeSecret(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, content, { mode: 0o600 });
}

function loadSigner(
  dir: string,
  id: string,
  file = path.join(dir, "keys", `${id}.pem`),
): SwarmSigner {
  return softwareSigner(id, readFileSync(file, "utf8"));
}

function loadGenesis(dir: string): Genesis {
  return JSON.parse(readFileSync(path.join(dir, "genesis.json"), "utf8")) as Genesis;
}

function coordinatorAddrs(dir: string) {
  return parseHostPorts(readFileSync(path.join(dir, "coordinators.txt"), "utf8").trim());
}

/** coordinators.txt lists genesis coordinators in genesis order. */
function genesisAddrMap(dir: string): Map<string, HostPort> {
  const addrs = coordinatorAddrs(dir);
  return new Map(loadGenesis(dir).coordinators.map((c, i) => [c.id, addrs[i]]));
}

function parseGrowth(v: string | undefined): Genesis["params"]["growth"] {
  if (!v) {
    return undefined;
  }
  const m = /^(\d+):(\d+)$/.exec(v);
  if (!m) {
    throw new Error("--growth is MAX_COORDINATORS:NODES_PER_COORDINATOR, e.g. 7:4");
  }
  return { maxCoordinators: Number(m[1]), nodesPerCoordinator: Number(m[2]) };
}

async function cmdInit(args: Args): Promise<void> {
  const dir = need(args, "dir");
  const n = Number(args.flags.get("coordinators") ?? 4);
  const host = args.flags.get("host") ?? "127.0.0.1";
  const basePort = Number(args.flags.get("base-port") ?? 7700);
  const coords = Array.from({ length: n }, (_, i) => softwareSigner(`coord-${i}`));
  const admin = softwareSigner("admin-0");
  for (const s of [...coords, admin]) {
    writeSecret(path.join(dir, "keys", `${s.key.id}.pem`), s.privateKeyPem);
  }
  // --admin-pub adds the operator's key (from `swarm keygen` on the laptop) as
  // a second admin. admin-0 stays on the cluster to approve rank joins; the
  // operator's key approves the operator's own actions.
  const extra = args.flags.get("admin-pub");
  const operator = extra
    ? (JSON.parse(readFileSync(extra, "utf8")) as Genesis["admins"][number])
    : null;
  const leaseMs = Number(args.flags.get("lease-ms") ?? 15_000);
  const genesis: Genesis = {
    swarmId: args.flags.get("swarm-id") ?? `swarm-${randomBytes(4).toString("hex")}`,
    createdAt: Date.now(),
    coordinators: coords.map((s) => s.key),
    admins: operator ? [admin.key, operator] : [admin.key],
    params: {
      leaseMs,
      heartbeatMs: Number(args.flags.get("heartbeat-ms") ?? 2_000),
      // How many blocks a node may go unrenewed before it is evicted. Default:
      // two leases' worth at one block a second, the shortest window that
      // still rides out a missed heartbeat or two. Adjustable per epoch by an
      // admin-approved params.update.
      expiryBlocks: Number(
        args.flags.get("expiry-blocks") ?? Math.max(3, Math.ceil((2 * leaseMs) / 1000)),
      ),
      requireDeviceKeys: false,
      ...(args.flags.get("growth") ? { growth: parseGrowth(args.flags.get("growth")) } : {}),
    },
    bundleHash: digestHex("ENCLAWED-POLICY-BUNDLE-01", args.flags.get("bundle") ?? "default"),
  };
  writeFileSync(path.join(dir, "genesis.json"), JSON.stringify(genesis, null, 2));
  writeFileSync(
    path.join(dir, "coordinators.txt"),
    coords.map((_, i) => `${host}:${basePort + i}`).join(",") + "\n",
  );
  log("swarm.init", { dir, swarmId: genesis.swarmId, coordinators: n });
  warnSoftwareKeys("the coordinators' keys and admin-0, kept in the swarm directory");
}

async function cmdCoordinator(args: Args): Promise<void> {
  const dir = need(args, "dir");
  const index = Number(need(args, "index"));
  const addrs = coordinatorAddrs(dir);
  const signer = loadSigner(dir, `coord-${index}`);
  const handle = await runCoordinator({
    genesis: loadGenesis(dir),
    signer,
    dataDir: path.join(dir, "data"),
    listen: addrs[index],
    peers: addrs.filter((_, i) => i !== index),
    genesisAddrs: genesisAddrMap(dir),
    onCommit: (cb) => logBlock(signer.key.id, cb),
    onEvidence: (p) => log("evidence", { id: signer.key.id, against: p.a.signer, kind: p.a.kind }),
    onAlert: (m) => log("alert", { id: signer.key.id, message: m }),
  });
  log("coordinator.up", {
    id: signer.key.id,
    height: handle.ledger.height,
    truncatedAt: handle.truncatedAt,
  });
  const shutdown = () => void handle.stop().then(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

function logBlock(id: string, cb: CommittedBlock): void {
  log("block", {
    id,
    height: cb.block.header.height,
    round: cb.block.header.round,
    txs: cb.block.txs.map((t) => t.type),
    epoch: cb.block.header.epoch,
    finals: cb.qc.votes.length,
  });
}

/**
 * A long-lived host (a gateway or service node, never an MPI rank) that joins
 * as a coordinator candidate. It runs as a node and holds a lease; once the
 * growth rule promotes it on chain, it also starts a coordinator with the same
 * key, listening at the address its admin-approved join recorded.
 */
async function cmdHost(args: Args): Promise<void> {
  const dir = need(args, "dir");
  const id = need(args, "id");
  const listen = need(args, "listen");
  const [addr] = parseHostPorts(listen);
  const genesis = loadGenesis(dir);
  // --device: the host's key is this machine's Enclaweders', and its
  // heartbeats report what the bootstrap's guard last saw: CLEAN, or DIRTY
  // for good.
  let signer: SwarmSigner;
  let deviceStatus: (() => DeviceHealth) | undefined;
  if (args.flags.get("device")) {
    const devices = await requireDevices("host");
    signer = fleetSigner(id, devices.fleet);
    deviceStatus = () => devices.health();
  } else {
    const keyFile = path.join(dir, "keys", `${id}.pem`);
    if (!existsSync(keyFile)) {
      writeSecret(keyFile, softwareSigner(id).privateKeyPem);
    }
    signer = loadSigner(dir, id);
  }
  const probe = SwarmLedger.restore(genesis).ledger;
  const admin = loadSigner(dir, "admin-0");
  const join = {
    type: "node.join" as const,
    node: signer.key,
    pop: await signer.sign(joinDigest(genesis.swarmId, signer.key)),
    coordinator: { address: listen },
    approval: { admin: admin.key.id, sig: "" },
  };
  join.approval.sig = await admin.sign(approvalDigest(probe.state, join));
  await follow(
    dir,
    (l) => l.state.nodes.has(id),
    120_000,
    (hub) => void hub.submitTx(join),
  );
  log("host.joined", { id, listen, key: signer.key.kind });
  const handle = await runNode({
    genesis,
    signer,
    deviceStatus,
    coordinators: coordinatorAddrs(dir),
    genesisAddrs: genesisAddrMap(dir),
    promotion: {
      listen: addr,
      dataDir: path.join(dir, "data"),
      onCommit: (cb) => logBlock(id, cb),
      onAlert: (m) => log("alert", { id, message: m }),
      onPromoted: (height) => log("host.promoted", { id, height }),
    },
  });
  const shutdown = () => {
    closeHardwareRootSession();
    void handle.stop().then(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

/** Connects as a monitor and resolves once `until` holds on the followed chain. */
async function follow(
  dir: string,
  until: (ledger: SwarmLedger, tipSeen: number) => boolean,
  timeoutMs: number,
  onStart?: (hub: SwarmHub) => void,
): Promise<SwarmLedger> {
  const { ledger } = SwarmLedger.restore(loadGenesis(dir));
  // Highest height any coordinator has announced to us, verified or not; only
  // used to tell when we have caught up, never trusted as chain state.
  let tipSeen = 0;
  const hub = new SwarmHub({
    id: `monitor-${process.pid}`,
    role: "monitor",
    connect: coordinatorAddrs(dir),
    ledger,
    onCommit: (cb) => {
      tipSeen = Math.max(tipSeen, cb.block.header.height);
      const r = ledger.commit(cb);
      if (!r.ok && r.code === "gap") {
        hub.requestSync(ledger.height + 1);
      }
    },
  });
  await hub.start();
  const deadline = Date.now() + timeoutMs;
  let started = false;
  try {
    for (;;) {
      if (!started && hub.peerCount("coordinator") > 0) {
        started = true;
        onStart?.(hub);
      }
      if (started && until(ledger, tipSeen)) {
        return ledger;
      }
      if (Date.now() > deadline) {
        throw new Error("timed out waiting for the chain");
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  } finally {
    await hub.close();
  }
}

async function cmdAdmit(args: Args): Promise<void> {
  await admitJob(need(args, "dir"), need(args, "job"), Number(need(args, "ranks")));
}

/** One key per rank, joins approved by the admin key, committed on chain before return. */
export async function admitJob(
  dir: string,
  job: string,
  ranks: number,
  devices: DeviceAccess | null = null,
): Promise<void> {
  if (!Number.isSafeInteger(ranks) || ranks < 1) {
    throw new Error("admit: ranks must be a positive integer");
  }
  const genesis = loadGenesis(dir);
  const admin = loadSigner(dir, "admin-0");
  const state = { swarmId: genesis.swarmId, epoch: 0, rosterVersion: 0 };
  const txs: SwarmTx[] = [];
  for (let r = 0; r < ranks; r++) {
    const id = `${job}.r${r}`;
    // With this machine's Enclaweders, every rank's key is theirs; otherwise
    // a software key per rank, kept for the rank to load.
    let s: SwarmSigner;
    if (!devices && r === 0) {
      warnSoftwareKeys(`the ${ranks} ranks of ${job}, admitted with software keys`);
    }
    if (devices) {
      s = fleetSigner(id, devices.fleet);
    } else {
      const sw = softwareSigner(id);
      writeSecret(path.join(dir, "jobs", job, `rank-${r}.pem`), sw.privateKeyPem);
      s = sw;
    }
    const pop = await s.sign(joinDigest(genesis.swarmId, s.key));
    const tx = {
      type: "node.join" as const,
      node: s.key,
      pop,
      approval: { admin: admin.key.id, sig: "" },
    };
    tx.approval.sig = await admin.sign(approvalDigest(state, tx));
    txs.push(tx);
  }
  const t0 = Date.now();
  const ledger = await follow(
    dir,
    (l) => txs.every((t) => t.type === "node.join" && l.state.nodes.has(t.node.id)),
    120_000,
    (hub) => {
      for (const tx of txs) {
        hub.submitTx(tx);
      }
    },
  );
  log("job.admitted", { job, ranks, height: ledger.height, ms: Date.now() - t0 });
}

/**
 * Runs a launcher with every program it starts wrapped in `swarm rank`:
 *   swarm launch --dir D --rank-bin /path/to/swarm -- mpiexec -n 28 mpi-myapp -in run.in
 * becomes, after admitting 28 ranks,
 *   mpiexec -n 28 /path/to/swarm rank --dir D --job J -- mpi-myapp -in run.in
 * Site shims named mpiexec/mpirun/srun call this, so agents cannot start an
 * unsupervised rank by forgetting the wrapper.
 */
async function cmdLaunch(args: Args): Promise<number> {
  const dir = need(args, "dir");
  const rankBin = args.flags.get("rank-bin") ?? process.env.ENCLAWED_SWARM_BIN;
  if (!rankBin) {
    throw new Error("launch: --rank-bin or ENCLAWED_SWARM_BIN must name the swarm command");
  }
  const [launcher, ...rest] = args.rest;
  if (!launcher) {
    throw new Error("launch: give the launcher command after --");
  }
  const words = rest.map((text) => ({ text, dynamic: false }));
  const req = parseLauncher(path.basename(launcher), words, {
    inAllocation: Boolean(process.env.SLURM_JOB_ID),
    inFluxJob: Boolean(process.env.FLUX_JOB_ID),
    readScript: () => null,
  });
  if (!req || req.kind !== "launch" || req.programs.length === 0) {
    throw new Error(`launch: ${launcher} does not start ranks this command can wrap`);
  }
  if (req.problems.length > 0 || req.ranks === null) {
    throw new Error(
      `launch: ${[...req.problems, req.ranks === null ? "rank count unknown" : ""].filter(Boolean).join("; ")}`,
    );
  }
  const job = args.flags.get("job") ?? `job-${randomBytes(4).toString("hex")}`;
  // With this machine's Enclaweders present, every rank is admitted under
  // their key, and the ranks sign through them via Enclawed's bootstrap.
  await admitJob(dir, job, req.ranks, await deviceAccess());
  const wrapper = [rankBin, "rank", "--dir", dir, "--job", job];
  for (const flag of ["on-lease-loss", "device-file", "run-dir", "lease-timeout-ms"]) {
    const v = args.flags.get(flag);
    if (v) {
      wrapper.push(`--${flag}`, v);
    }
  }
  wrapper.push("--");
  const argv = [...rest];
  for (const p of req.programs.toSorted((a, b) => b.offset - a.offset)) {
    argv.splice(p.offset, 0, ...wrapper);
  }
  log("launch", { job, ranks: req.ranks, launcher });
  const child = spawn(launcher, argv, { stdio: "inherit" });
  return new Promise((resolve) => child.on("exit", (c, sig) => resolve(c ?? (sig ? 128 : 1))));
}

async function cmdRank(args: Args): Promise<number> {
  const dir = need(args, "dir");
  const job = need(args, "job");
  const ctx = launchContext();
  const id = `${job}.r${ctx.rank}`;
  // A rank admitted with a software key has its key file; one admitted under
  // the machine's Enclaweders signs through them, via Enclawed's bootstrap,
  // and reports their health.
  const keyFile = path.join(dir, "jobs", job, `rank-${ctx.rank}.pem`);
  const devices = existsSync(keyFile) ? null : await requireDevices("rank");
  const signer = devices ? fleetSigner(id, devices.fleet) : loadSigner(dir, id, keyFile);
  const onLoss = args.flags.get("on-lease-loss") ?? "pause";
  // Simulated device presence for hosts without devices: CLEAN while the
  // file exists, DIRTY for good once it has gone.
  // "{rank}" in the path gives each rank its own device file.
  const deviceFile = args.flags.get("device-file")?.replaceAll("{rank}", String(ctx.rank));
  let dirty: string | null = null;
  const deviceStatus = (): DeviceHealth => {
    if (!dirty && deviceFile && !existsSync(deviceFile)) {
      dirty = "Enclaweder removed";
    }
    if (!dirty && devices) {
      const h = devices.health();
      if (h.status === "DIRTY") {
        dirty = h.reason ?? "Enclaweder DIRTY";
      } else if (h.status === "UNAVAILABLE") {
        return h;
      }
    }
    return dirty ? { status: "DIRTY", reason: dirty } : { status: "CLEAN" };
  };
  const t0 = Date.now();
  const handle = await runNode({
    genesis: loadGenesis(dir),
    signer,
    coordinators: coordinatorAddrs(dir),
    genesisAddrs: genesisAddrMap(dir),
    deviceStatus,
  });
  const leaseWait = Number(args.flags.get("lease-timeout-ms") ?? 60_000);
  while (!handle.node.check("irreversible").allowed) {
    if (Date.now() - t0 > leaseWait) {
      log("rank.no-lease", { id, decision: handle.node.check("irreversible") });
      await handle.stop();
      return 3;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  log("rank.leased", {
    id,
    rank: ctx.rank,
    size: ctx.size,
    ms: Date.now() - t0,
    height: handle.ledger.height,
  });

  const token = randomBytes(24).toString("hex");
  // Unix socket paths are capped near 104 bytes, so they live in a short runtime dir.
  const runDir =
    args.flags.get("run-dir") ??
    path.join(process.env.XDG_RUNTIME_DIR ?? "/tmp", `enclawed-${process.getuid?.() ?? "u"}`);
  const socketPath = path.join(runDir, `${job}.r${ctx.rank}.sock`);
  let decisions = 0;
  const server = await startDecisionServer({
    socketPath,
    token,
    decide: (req) => handle.node.check(req.class),
    onDecision: (req, reply) => {
      decisions += 1;
      if (!reply.allowed) {
        log("rank.decision.deny", { id, action: req.action, code: reply.code });
      }
    },
  });

  const [cmd, ...cmdArgs] = args.rest;
  if (!cmd) {
    throw new Error("rank: give the program to run after --");
  }
  // MPI's process manager talks to each rank over an inherited descriptor
  // (PMI_FD); pass it through or the program cannot join the MPI job.
  const stdio: StdioOptions = ["inherit", "inherit", "inherit"];
  const pmiFd = Number(process.env.PMI_FD);
  if (Number.isInteger(pmiFd) && pmiFd > 2) {
    for (let fd = 3; fd <= pmiFd; fd++) {
      (stdio as unknown[])[fd] = fd === pmiFd ? pmiFd : "ignore";
    }
  }
  // Every signal goes to the program's whole process tree (proc-tree.ts): a
  // rank that is an agent starts tools of its own, and a pause or a kill has
  // to reach them too. The program stays in this process group, so a launcher
  // that ends the job by killing the group still takes it down.
  const child = spawn(cmd, cmdArgs, {
    stdio,
    env: {
      ...process.env,
      ENCLAWED_DECISION_SOCKET: socketPath,
      ENCLAWED_DECISION_TOKEN: token,
      ENCLAWED_SWARM_NODE: id,
    },
  });
  const signalProgram = (sig: NodeJS.Signals) => {
    if (child.pid === undefined) {
      return;
    }
    signalTree(child.pid, sig);
  };
  // A launcher that ends the job signals the supervisor; pass it on.
  const forward = (sig: NodeJS.Signals) => () => {
    signalProgram("SIGCONT");
    signalProgram(sig);
  };
  const forwarders = (["SIGTERM", "SIGINT", "SIGHUP"] as const).map((sig) => {
    const f = forward(sig);
    process.on(sig, f);
    return [sig, f] as const;
  });
  let paused = false;
  let killed = false;
  const watch = setInterval(() => {
    const d = handle.node.check("irreversible");
    if (d.allowed) {
      if (paused) {
        paused = false;
        signalProgram("SIGCONT");
        log("rank.resumed", { id });
      }
      return;
    }
    if (
      d.code === "evicted" ||
      d.code === "device-dirty" ||
      d.code === "halted" ||
      onLoss === "kill"
    ) {
      if (!killed) {
        killed = true;
        log("rank.killed", { id, code: d.code, reason: d.reason });
        signalProgram("SIGKILL");
      }
    } else if (!paused) {
      paused = true;
      signalProgram("SIGSTOP");
      log("rank.paused", { id, code: d.code });
    }
  }, 100);
  const code: number = await new Promise((resolve) =>
    child.on("exit", (c, sig) => resolve(c ?? (sig ? 128 : 1))),
  );
  clearInterval(watch);
  for (const [sig, f] of forwarders) {
    process.off(sig, f);
  }
  await server.close();
  if (dirty) {
    // The program is already dead; now make sure the swarm hears about it. A
    // DIRTY heartbeat is the eviction evidence, so send one at once and keep
    // heartbeating until the eviction is on chain. Exiting first would leave
    // this node's lease valid until it expired.
    void handle.node.heartbeat();
    const until = Date.now() + 2 * handle.ledger.state.params.leaseMs;
    while (!handle.ledger.state.evicted.has(id) && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 100));
    }
    log("rank.reported", {
      id,
      reason: dirty,
      evictedOnChain: handle.ledger.state.evicted.has(id),
      height: handle.ledger.height,
    });
  }
  await handle.stop();
  const cpu = process.cpuUsage();
  log("rank.exit", {
    id,
    code,
    decisions,
    killed,
    supervisorCpuMs: Math.round((cpu.user + cpu.system) / 1000),
    blocks: handle.ledger.height,
  });
  return killed ? 137 : code;
}

/**
 * Pipes this process's stdin and stdout to one address the swarm directory
 * lists. It never takes an arbitrary destination: run over SSH it must not
 * become the port forwarding a site has turned off.
 */
/** This machine's Enclaweders, through Enclawed's bootstrap; null when none is present. */
async function deviceAccess(): Promise<DeviceAccess | null> {
  return localDevices();
}

/** Same devices, in the same order: what a genesis or join registered. */
export function sameDeviceKey(a: SwarmSigner["key"], b: SwarmSigner["key"]): boolean {
  const devs = (k: SwarmSigner["key"]) =>
    [{ publicKey: k.publicKey, uid: k.uid }, ...(k.members ?? [])]
      .map((m) => `${m.publicKey}/${m.uid}`)
      .join(",");
  return a.kind === "device" && b.kind === "device" && devs(a) === devs(b);
}

/** As deviceAccess, but a device is required. */
async function requireDevices(what: string): Promise<DeviceAccess> {
  const access = await deviceAccess();
  if (!access) {
    throw new Error(`${what}: no Enclaweder is bound`);
  }
  if (access.health().status !== "CLEAN") {
    throw new Error(`${what}: the Enclaweder is not CLEAN (${access.health().reason ?? ""})`);
  }
  return access;
}

/**
 * Holds this machine's Enclaweders for as long as it runs: Enclawed's
 * bootstrap makes the first process that boots the hardware root their owner,
 * so starting this first keeps ownership with a process that stays up.
 */
async function cmdDeviceBroker(_args: Args): Promise<void> {
  const root = await bootHardwareRoot();
  if (!root) {
    throw new Error("device-broker: no Enclaweder is present");
  }
  if (!(root instanceof HardwareRootGuard)) {
    throw new Error("device-broker: another process already owns this machine's Enclaweders");
  }
  log("device-broker.up", { owner: true });
  // Serving the devices does not keep a process alive (an agent that happened
  // to boot first must still exit when done); owning them is this process's
  // whole job, so it holds itself until stopped.
  const hold = setInterval(() => undefined, 1 << 30);
  const shutdown = () => {
    clearInterval(hold);
    closeHardwareRootSession();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

async function cmdKeygen(args: Args): Promise<void> {
  const id = need(args, "id");
  // --device: the key is this machine's Enclaweders' own; print its public
  // half for the genesis (--admin-pub) and keep nothing on disk.
  if (args.flags.get("device")) {
    const devices = await requireDevices("keygen");
    try {
      process.stdout.write(JSON.stringify(fleetSigner(id, devices.fleet).key) + "\n");
    } finally {
      closeHardwareRootSession();
    }
    return;
  }
  const out = need(args, "out");
  if (existsSync(out)) {
    throw new Error(`keygen: ${out} exists; refusing to overwrite a key`);
  }
  const s = softwareSigner(id);
  writeSecret(out, s.privateKeyPem);
  process.stdout.write(JSON.stringify(s.key) + "\n");
}

async function cmdRelay(args: Args): Promise<number> {
  const dir = need(args, "dir");
  let target: HostPort;
  if (args.flags.get("model")) {
    const line = readFileSync(path.join(dir, "model.txt"), "utf8").trim();
    [target] = parseHostPorts(line);
  } else {
    const addrs = coordinatorAddrs(dir);
    const i = Number(need(args, "index"));
    if (!Number.isInteger(i) || !addrs[i]) {
      throw new Error(`relay: no coordinator ${String(i)} in ${dir}`);
    }
    target = addrs[i];
  }
  const net = await import("node:net");
  const sock = net.connect(target.port, target.host);
  return new Promise((resolve) => {
    const done = (code: number) => {
      sock.destroy();
      resolve(code);
    };
    sock.once("connect", () => {
      process.stdin.pipe(sock);
      sock.pipe(process.stdout);
    });
    sock.once("error", () => done(1));
    sock.once("close", () => done(0));
    process.stdin.once("end", () => done(0));
  });
}

/**
 * The one interactive step of working over SSH: log in to the login node (the
 * site's prompts happen here) and leave an SSH master for later sessions.
 */
async function cmdAttach(args: Args): Promise<void> {
  const ssh = await import("./ssh.js");
  const target = {
    host: need(args, "ssh"),
    jump: args.flags.get("jump"),
    sshBin: args.flags.get("ssh-bin"),
    remoteSwarm: (args.flags.get("remote-swarm") ?? "enclawed swarm").split(/\s+/),
    remoteDir: args.flags.get("remote-dir") ?? "/",
    ...kerberosFlags(args),
  };
  const cp = await ssh.ensureMaster(target);
  log("attach.ready", {
    host: target.host,
    controlPath: cp.path,
    fromUserConfig: cp.fromUserConfig,
  });
  if (!cp.fromUserConfig) {
    // Without this, the agent's own `ssh <host> ...` commands start a new
    // login, which at a token-protected site they cannot complete.
    process.stderr.write(
      "To let your own ssh commands (and the agent's) share this session, add to ~/.ssh/config:\n\n" +
        ssh.controlPathSnippet(target) +
        "\n\n",
    );
  }
}

/** --kinit [principal] and --forward-ticket, for sites that need Kerberos first. */
function kerberosFlags(args: Args): { kerberos?: { principal?: string; forwardTicket?: boolean } } {
  const kinit = args.flags.get("kinit");
  if (kinit === undefined) {
    return {};
  }
  return {
    kerberos: {
      ...(kinit !== "true" ? { principal: kinit } : {}),
      ...(args.flags.get("forward-ticket") ? { forwardTicket: true } : {}),
    },
  };
}

async function cmdStatus(args: Args): Promise<void> {
  const dir = need(args, "dir");
  const genesis = loadGenesis(dir);
  // Done once we hold the newest block announced to us. A halted or idle chain
  // announces nothing, so also stop once the height has held still for a while.
  let lastHeight = -1;
  let stableSince = Date.now();
  const ledger = await follow(
    dir,
    (l, tipSeen) => {
      if (l.height !== lastHeight) {
        lastHeight = l.height;
        stableSince = Date.now();
      }
      return (tipSeen > 0 && l.height >= tipSeen) || Date.now() - stableSince > 3000;
    },
    60_000,
  );
  const s = ledger.state;
  process.stdout.write(
    JSON.stringify(
      {
        swarmId: genesis.swarmId,
        height: s.height,
        epoch: s.epoch,
        halted: s.halted,
        coordinators: s.coordinators.map((c) => c.id),
        evicted: [...s.evicted],
        nodes: s.nodes.size,
        leases: s.leases.size,
      },
      null,
      2,
    ) + "\n",
  );
}

export async function main(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  const args = parseArgs(rest);
  switch (sub) {
    case "init":
      await cmdInit(args);
      return 0;
    case "coordinator":
      await cmdCoordinator(args);
      return -1; // keeps running
    case "admit":
      await cmdAdmit(args);
      return 0;
    case "rank":
      return cmdRank(args);
    case "host":
      await cmdHost(args);
      return -1; // keeps running
    case "launch":
      return cmdLaunch(args);
    case "relay":
      return cmdRelay(args);
    case "keygen":
      await cmdKeygen(args);
      return 0;
    case "attach":
      await cmdAttach(args);
      return 0;
    case "device-broker":
      await cmdDeviceBroker(args);
      return -1;
    case "genesis":
      process.stdout.write(JSON.stringify(loadGenesis(need(args, "dir"))) + "\n");
      return 0;
    case "status":
      await cmdStatus(args);
      return 0;
    default:
      process.stderr.write(
        "usage: swarm <init|coordinator|admit|launch|rank|host|status|relay|genesis|keygen|attach|device-broker> [--flags] [-- cmd]\n",
      );
      return 2;
  }
}

if (process.argv[1] && /swarm[\\/]cli\.(ts|js)$/.test(process.argv[1])) {
  main(process.argv.slice(2)).then(
    (code) => {
      if (code >= 0) {
        process.exit(code);
      }
    },
    (err: unknown) => {
      log("error", { message: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    },
  );
}
