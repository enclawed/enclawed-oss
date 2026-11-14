// The swarm and its processes on a real Enclaweder. Nothing here is
// simulated: the devices are the ones on the bus, bound by Enclawed's own
// bootstrap, and every process on the machine shares them through its owner.
//
// All real-device tests live in this one file, run in order. A process that
// has bound a device keeps it for its life, so the takeover test runs first,
// before this test process boots the hardware root itself; the removal test
// runs last, because its DIRTY latch holds for the rest of the process.
//
// Runs only where an Enclaweder is attached. ENCLAWEDER_USBIPD_BUSID (WSL with
// usbipd-win) also runs the removal test, which detaches the device and
// attaches it again.

import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { buildRecord, type AuditRecord } from "../audit-log.js";
import { brokerSocketPath, connectRoot } from "../hardware-root/broker.js";
import { findAllEnclaweders, verifyChallenge } from "../hardware-root/enclaweder-hid.js";
import { HardwareRootGuard } from "../hardware-root/guard.js";
import {
  bootHardwareRoot,
  closeHardwareRootSession,
  hardwareRootHealth,
} from "../hardware-root/index.js";
import { queueJournalPath, verifyQueueJournal } from "../hardware-root/queue-journal.js";
import { admitJob, main, sameDeviceKey } from "./cli.js";
import { runCoordinator, runNode, type CoordinatorHandle } from "./daemon.js";
import { localDevices, type DeviceAccess } from "./device-broker.js";
import { fleetSigner, softwareSigner, verifyDigest } from "./signer.js";
import type { Genesis } from "./types.js";

const execFileAsync = promisify(execFile);
const present = findAllEnclaweders().length > 0;
const here = path.dirname(fileURLToPath(import.meta.url));
const child = path.join(here, "../hardware-root/test-child.ts");
const tsx = path.join(here, "../../../node_modules/tsx/dist/esm/index.mjs");
const dir = mkdtempSync(path.join(os.tmpdir(), "swarm-enclaweder-"));
// This test's own owner socket and guard state: never the user's.
process.env.ENCLAWEDER_STATE = path.join(dir, "hw-root.state");
process.env.ENCLAWEDER_BROKER = path.join(dir, "root", "enclaweder.sock");
const base = 17_000 + Math.floor(Math.random() * 2000) * 2;
const cleanups: (() => unknown)[] = [];
const children: ChildProcess[] = [];

afterAll(async () => {
  for (const c of children) {
    c.kill("SIGKILL");
  }
  for (const c of cleanups.splice(0).toReversed()) {
    await c();
  }
  closeHardwareRootSession();
  rmSync(dir, { recursive: true, force: true });
});

const until = async (cond: () => boolean, ms = 10_000) => {
  for (let t = 0; t < ms && !cond(); t += 50) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return cond();
};

type Line = Record<string, unknown> & { event: string };
/** Another Enclawed process on this machine, booting the real bootstrap. */
function startChild(...args: string[]) {
  const proc = spawn(process.execPath, ["--import", tsx, child, ...args], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(proc);
  const lines: Line[] = [];
  createInterface({ input: proc.stdout }).on("line", (l) => {
    try {
      lines.push(JSON.parse(l) as Line);
    } catch {
      // not ours
    }
  });
  const exited = new Promise<number | null>((r) => proc.on("exit", (code) => r(code)));
  return { proc, lines, exited };
}

describe.skipIf(!present)("one machine's Enclaweder, many processes", () => {
  it("passes to a client when its owner exits, as UNAVAILABLE, never DIRTY", async () => {
    const owner = startChild("hold");
    expect(await until(() => owner.lines.some((l) => l.event === "booted"), 30_000)).toBe(true);
    expect(owner.lines[0]).toMatchObject({ role: "owner", clean: true });
    const c = startChild("hold");
    expect(await until(() => c.lines.some((l) => l.event === "booted"), 30_000)).toBe(true);
    expect(c.lines[0]).toMatchObject({ role: "client", clean: true });
    expect(await until(() => c.lines.some((l) => l.event === "health" && l.signed))).toBe(true);
    owner.proc.kill("SIGKILL");
    await owner.exited;
    const healthAfter = () =>
      c.lines
        .filter((l) => l.event === "health")
        .slice(-1)
        .map((l) => l.health as { status: string })[0];
    // The client takes over: it signs on the device again as its new owner.
    const n = c.lines.length;
    expect(
      await until(
        () => c.lines.slice(n).some((l) => l.event === "health" && l.signed === true),
        30_000,
      ),
    ).toBe(true);
    expect(c.lines.some((l) => (l.health as { status?: string })?.status === "DIRTY")).toBe(false);
    expect(healthAfter().status).toBe("CLEAN");
    c.proc.kill("SIGKILL");
    await c.exited;
  }, 90_000);

  it("serves 16 processes that boot at once, every signature by the device", async () => {
    const kids = Array.from({ length: 16 }, () => startChild("sign", "3"));
    const done = await Promise.all(kids.map((k) => k.exited));
    // Any process that failed, with what it said.
    expect(kids.filter((_, i) => done[i] !== 0).map((k) => k.lines)).toEqual([]);
    const booted = kids.map((k) => k.lines.find((l) => l.event === "booted")!);
    expect(booted.filter((b) => b.role === "owner")).toHaveLength(1);
    expect(booted.filter((b) => b.role === "client")).toHaveLength(15);
    expect(booted.every((b) => b.clean)).toBe(true);
    const members = booted[0].members as { uid: string; pubkey: string }[];
    let total = 0;
    for (const k of kids) {
      const signed = k.lines.find((l) => l.event === "signed")!;
      for (const s of signed.sigs as { digest: string; uid: string; sig: string }[]) {
        const m = members.find((x) => x.uid === s.uid)!;
        expect(
          verifyChallenge(
            Buffer.from(m.pubkey, "hex"),
            Buffer.from(s.digest, "hex"),
            Buffer.from(s.uid, "hex"),
            Buffer.from(s.sig, "hex"),
          ),
        ).toBe(true);
        total++;
      }
    }
    expect(total).toBe(48);
  }, 120_000);
});

describe.skipIf(!present)("this process as the owner", () => {
  let devices: DeviceAccess;

  it("owns the devices, on a socket only the user can open", async () => {
    const root = await bootHardwareRoot();
    expect(root).toBeInstanceOf(HardwareRootGuard);
    expect(hardwareRootHealth()).toEqual({ status: "CLEAN" });
    expect(statSync(brokerSocketPath()).mode & 0o777).toBe(0o600);
    expect(statSync(path.dirname(brokerSocketPath())).mode & 0o777).toBe(0o700);
    devices = (await localDevices())!;
    expect(devices.fleet.members.length).toBe(findAllEnclaweders().length);
  }, 60_000);

  it("keeps a flooding client from starving another, and bounds it", async () => {
    const flood = (await connectRoot(brokerSocketPath()))!;
    const fair = (await connectRoot(brokerSocketPath()))!;
    cleanups.push(
      () => flood.close(),
      () => fair.close(),
    );
    const floods = Array.from({ length: 40 }, (_, i) =>
      flood
        .device()
        .challenge(Buffer.alloc(32, i + 1))
        .then(
          () => "ok",
          (e: Error) => e.message,
        ),
    );
    const t0 = Date.now();
    await fair.device().challenge(Buffer.alloc(32, 99));
    const fairMs = Date.now() - t0;
    const outcomes = await Promise.all(floods);
    expect(outcomes.filter((o) => /busy/.test(o)).length).toBeGreaterThan(0);
    // The fair client waited for at most a couple of the flood's requests.
    expect(fairMs).toBeLessThan(2000);
  }, 60_000);

  it("keeps every client's requests its own: no one can read, redirect or alter another's", async () => {
    const members = devices.fleet.members;
    /** A raw client, as an attacker on this machine would write one. */
    const raw = () =>
      new Promise<{ send(o: unknown): void; replies: Record<string, unknown>[]; s: net.Socket }>(
        (resolve) => {
          const s = net.connect(brokerSocketPath(), () =>
            resolve({ send: (o) => s.write(JSON.stringify(o) + "\n"), replies, s }),
          );
          const replies: Record<string, unknown>[] = [];
          let buf = "";
          s.on("data", (d) => {
            buf += d.toString();
            for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
              replies.push(JSON.parse(buf.slice(0, nl)) as Record<string, unknown>);
              buf = buf.slice(nl + 1);
            }
          });
        },
      );
    const a = await raw();
    const b = await raw();
    cleanups.push(
      () => a.s.destroy(),
      () => b.s.destroy(),
    );
    const da = Buffer.alloc(32, 0xaa).toString("hex");
    const db = Buffer.alloc(32, 0xbb).toString("hex");
    // Same request id from both, and b claims to be another client, the
    // owner included: each still gets exactly its own answer, on its own digest.
    a.send({ id: 1, op: "sign", digest: da });
    b.send({ id: 1, op: "sign", digest: db, client: 0, queue: "a", replace: 1 });
    b.send({ id: 2, op: "cancel", target: 1 });
    expect(await until(() => a.replies.length >= 1 && b.replies.length >= 2, 10_000)).toBe(true);
    const verify = (r: Record<string, unknown>, digest: string) => {
      const m = members.find((x) => x.uid === r.uid)!;
      return verifyChallenge(
        Buffer.from(m.pubkey, "hex"),
        Buffer.from(digest, "hex"),
        Buffer.from(String(r.uid), "hex"),
        Buffer.from(String(r.sig), "hex"),
      );
    };
    expect(a.replies).toHaveLength(1);
    expect(verify(a.replies[0], da)).toBe(true);
    const bSigned = b.replies.find((r) => r.id === 1)!;
    expect(verify(bSigned, db)).toBe(true);
    expect(verify(bSigned, da)).toBe(false);
    expect(b.replies.find((r) => r.id === 2)).toMatchObject({ ok: false, error: "bad request" });
  }, 30_000);

  it("journals every request, signed by the device as it grows; a rewrite is caught", async () => {
    const journalFile = queueJournalPath(process.env.ENCLAWEDER_STATE!);
    const s = fleetSigner("job.j", devices.fleet);
    for (let i = 0; i < 5; i++) {
      await s.sign(Buffer.alloc(32, 0x40 + i));
    }
    const members = devices.fleet.members;
    // The device signs the head within a second or so.
    let report = await verifyQueueJournal(journalFile, members);
    for (let i = 0; i < 40 && report.checkpoints === 0; i++) {
      await new Promise((r) => setTimeout(r, 100));
      report = await verifyQueueJournal(journalFile, members);
    }
    expect(report.ok).toBe(true);
    expect(report.checkpoints).toBeGreaterThan(0);
    expect(report.badCheckpoints).toBe(0);
    expect(report.signed).toBeGreaterThanOrEqual(5);

    // An attacker rewrites the first request and recomputes every hash after
    // it, so the chain alone verifies again; the device's checkpoints do not.
    const copy = path.join(dir, "journal-rewritten.jsonl");
    const recs = readFileSync(journalFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as AuditRecord);
    let prev = "0".repeat(64);
    const forged = recs.map((r, i) => {
      const payload =
        i === 0 ? { ...(r.payload as object), digest: "ee".repeat(32) } : (r.payload as object);
      const b = buildRecord({
        prevHash: prev,
        type: r.type,
        actor: r.actor,
        level: r.level,
        payload,
        ts: r.ts,
      });
      prev = b.recordHash;
      return JSON.stringify(b);
    });
    writeFileSync(copy, forged.join("\n") + "\n");
    writeFileSync(`${copy}.head`, `${prev}\n`);
    const tampered = await verifyQueueJournal(copy, members);
    expect(tampered.chain.ok).toBe(true);
    expect(tampered.badCheckpoints).toBeGreaterThan(0);
    expect(tampered.ok).toBe(false);
  }, 60_000);

  it("refuses bad requests and drops garbage without disturbing anyone", async () => {
    const ask = (line: string) =>
      new Promise<string>((resolve) => {
        const s = net.connect(brokerSocketPath(), () => s.write(line));
        let out = "";
        s.on("data", (d) => {
          out += d.toString();
          if (out.includes("\n")) {
            s.destroy();
            resolve(out);
          }
        });
        s.on("close", () => resolve(out));
      });
    expect(await ask(`${JSON.stringify({ id: 1, op: "sign", digest: "zz" })}\n`)).toMatch(
      /bad request/,
    );
    expect(await ask(`${JSON.stringify({ id: 2, op: "zeroize" })}\n`)).toMatch(/bad request/);
    expect(await ask("not json\n")).toBe("");
    expect(await ask("x".repeat(70_000))).toBe("");
    const s = fleetSigner("job.r1", devices.fleet);
    const d = Buffer.alloc(32, 3);
    expect(verifyDigest(s.key, d, await s.sign(d))).toBe(true);
  }, 30_000);
});

describe.skipIf(!present)("swarm command line", () => {
  const swarm = path.join(dir, "swarm");
  const coords: CoordinatorHandle[] = [];
  let operator: Genesis["admins"][number];
  afterAll(async () => {
    for (const c of coords) {
      await c.stop();
    }
  });

  it("exports the operator's key from the device, keeping nothing on disk", async () => {
    // A separate process, as on a real machine: a client of this owner.
    // Asynchronously: this process is the owner, and must keep serving the
    // child while it waits for it.
    const { stdout: out } = await execFileAsync(
      process.execPath,
      ["--import", tsx, path.join(here, "cli.ts"), "keygen", "--device", "--id", "operator"],
      { env: process.env, encoding: "utf8" },
    );
    operator = JSON.parse(out.trim().split("\n").pop()!) as Genesis["admins"][number];
    const devices = (await localDevices())!;
    expect(operator.kind).toBe("device");
    expect(operator.publicKey).toBe(devices.fleet.members[0].pubkey);
    // This process still owns the devices and still serves them.
    expect(hardwareRootHealth()).toEqual({ status: "CLEAN" });
  }, 60_000);

  it("admits every rank of a job under the device's key, and a rank leases on it", async () => {
    const devices = (await localDevices())!;
    const opFile = path.join(dir, "operator.json");
    writeFileSync(opFile, JSON.stringify(operator));
    await main([
      "init",
      "--dir",
      swarm,
      "--coordinators",
      "2",
      "--base-port",
      String(base),
      "--lease-ms",
      "6000",
      "--heartbeat-ms",
      "1000",
      "--admin-pub",
      opFile,
    ]);
    const genesis = JSON.parse(readFileSync(path.join(swarm, "genesis.json"), "utf8")) as Genesis;
    expect(genesis.admins.some((a) => sameDeviceKey(a, operator))).toBe(true);
    const addrs = [0, 1].map((i) => ({ host: "127.0.0.1", port: base + i }));
    for (const i of [0, 1]) {
      coords.push(
        await runCoordinator({
          genesis,
          signer: softwareSigner(
            `coord-${i}`,
            readFileSync(path.join(swarm, "keys", `coord-${i}.pem`), "utf8"),
          ),
          dataDir: path.join(swarm, `data-${i}`),
          listen: addrs[i],
          peers: addrs.filter((_, j) => j !== i),
        }),
      );
    }
    await admitJob(swarm, "job", 4, devices);
    for (let r = 0; r < 4; r++) {
      const key = coords[0].ledger.state.nodes.get(`job.r${r}`);
      expect(key && sameDeviceKey(key, operator)).toBe(true);
      // No key file: these ranks sign through the device.
      expect(existsSync(path.join(swarm, "jobs", "job", `rank-${r}.pem`))).toBe(false);
    }
    const rank = await runNode({
      genesis,
      signer: fleetSigner("job.r0", devices.fleet),
      coordinators: addrs,
      deviceStatus: () => devices.health(),
    });
    cleanups.push(() => rank.stop());
    expect(await until(() => rank.node.check("irreversible").allowed, 30_000)).toBe(true);
  }, 120_000);
});

const busid = process.env.ENCLAWEDER_USBIPD_BUSID;
const usbipd = "/mnt/c/Program Files/usbipd-win/usbipd.exe";
describe.skipIf(!present || !busid || !existsSync(usbipd))("device removal", () => {
  it("tells this process and every client, for good, when the device is removed", async () => {
    const clients = await Promise.all(
      Array.from({ length: 4 }, async () => (await connectRoot(brokerSocketPath(), 100))!),
    );
    cleanups.push(...clients.map((c) => () => c.close()));
    expect(clients.every((c) => c.health().status === "CLEAN")).toBe(true);
    execFileSync(usbipd, ["detach", "--busid", busid!]);
    try {
      expect(
        await until(
          () =>
            hardwareRootHealth().status === "DIRTY" &&
            clients.every((c) => c.health().status === "DIRTY"),
          20_000,
        ),
      ).toBe(true);
      await expect(clients[0].device().challenge(Buffer.alloc(32, 5))).rejects.toThrow();
    } finally {
      for (let i = 0; i < 10 && findAllEnclaweders().length === 0; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          execFileSync(usbipd, ["attach", "--wsl", "--busid", busid!]);
        } catch {
          // not yet
        }
      }
    }
    expect(await until(() => findAllEnclaweders().length > 0, 20_000)).toBe(true);
    await new Promise((r) => setTimeout(r, 2000));
    expect(hardwareRootHealth().status).toBe("DIRTY");
    expect(clients.every((c) => c.health().status === "DIRTY")).toBe(true);
  }, 120_000);
});
