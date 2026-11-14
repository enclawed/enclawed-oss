// The hardware root's sharing machinery, where it is pure logic: the
// scheduler's rules, the socket directory's checks, claiming a stale socket,
// and a refused boot reaching every client as a halt. The devices themselves
// are exercised in swarm/enclaweder.hardware.test.ts.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  claimOwnership,
  connectRoot,
  DeviceScheduler,
  RootHaltError,
  type RootService,
  schedulerFor,
  secureSocketDir,
  serveRoot,
} from "./broker.js";

const dir = mkdtempSync(path.join(os.tmpdir(), "hw-broker-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const sig = (d: Buffer) => ({ uid: Buffer.alloc(12, 1), sig: Buffer.concat([d, d]) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The work the scheduler dispatches, timed and recorded in order. */
function work(ms: number) {
  const order: string[] = [];
  let running = 0;
  let maxRunning = 0;
  const exec = async (d: Buffer) => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    order.push(d.toString("utf8", 0, 2));
    await sleep(ms);
    running--;
    return sig(d);
  };
  return { exec, order, maxRunning: () => maxRunning };
}
const job = (tag: string) => Buffer.concat([Buffer.from(tag), Buffer.alloc(30)]);

describe("device scheduler", () => {
  it("serves clients in turn, so one that floods cannot starve another", async () => {
    const w = work(10);
    const s = new DeviceScheduler(w.exec, () => 1, { maxQueued: 4, maxWaitMs: 5000 });
    const a = ["a1", "a2", "a3", "a4"].map((t) => s.submit(1, job(t)));
    const b = s.submit(2, job("b1"));
    await Promise.all([...a, b]);
    // a1 was already running; b1 goes next, ahead of a's backlog.
    expect(w.order.indexOf("b1")).toBe(1);
  });

  it("refuses a client's request beyond its bound, without touching a device", async () => {
    const w = work(20);
    const s = new DeviceScheduler(w.exec, () => 1, { maxQueued: 2, maxWaitMs: 5000 });
    const first = s.submit(1, job("x0"));
    await sleep(5); // x0 is running now, and off the client's bound
    const queued = [s.submit(1, job("x1")), s.submit(1, job("x2"))];
    await expect(s.submit(1, job("x3"))).rejects.toThrow(/busy/);
    await Promise.all([first, ...queued]);
    expect(w.order).toEqual(["x0", "x1", "x2"]);
  });

  it("drops a request that waited past its deadline, unsent", async () => {
    const w = work(60);
    const s = new DeviceScheduler(w.exec, () => 1, { maxQueued: 4, maxWaitMs: 1000 });
    const slow = s.submit(1, job("s1"));
    const late = s.submit(2, job("l1"), 20);
    await expect(late).rejects.toThrow(/timed out/);
    await slow;
    expect(w.order).toEqual(["s1"]);
  });

  it("never waits longer than its own limit, whatever a client asks", async () => {
    const w = work(60);
    const s = new DeviceScheduler(w.exec, () => 1, { maxQueued: 4, maxWaitMs: 20 });
    const slow = s.submit(1, job("s1"));
    await expect(s.submit(2, job("l1"), 60_000)).rejects.toThrow(/timed out/);
    await slow;
  });

  it("runs one request per device at a time", async () => {
    const w = work(15);
    const s = new DeviceScheduler(w.exec, () => 2, { maxQueued: 4, maxWaitMs: 5000 });
    await Promise.all(
      [1, 2, 3].flatMap((c) => ["1", "2", "3"].map((t) => s.submit(c, job(`${c}${t}`)))),
    );
    expect(w.maxRunning()).toBe(2);
  });

  it("drops a departed client's waiting requests, unsent", async () => {
    const w = work(30);
    const s = new DeviceScheduler(w.exec, () => 1, { maxQueued: 4, maxWaitMs: 5000 });
    const running = s.submit(1, job("r1"));
    const waiting = s.submit(2, job("w1"));
    s.forget(2);
    await expect(waiting).rejects.toThrow(/client gone/);
    await running;
    expect(w.order).toEqual(["r1"]);
  });
});

describe("the owner's socket", () => {
  it("creates its directory closed to everyone else", () => {
    const p = path.join(dir, "fresh", "root.sock");
    secureSocketDir(p);
    expect(statSync(path.dirname(p)).mode & 0o777).toBe(0o700);
  });

  it("refuses a path the kernel would cut short", () => {
    const long = path.join(dir, "x".repeat(120), "root.sock");
    expect(() => secureSocketDir(long)).toThrow(/longer than 107 bytes/);
  });

  it("refuses a directory open to other users", () => {
    const d = path.join(dir, "open");
    mkdirSync(d, { mode: 0o755 });
    expect(() => secureSocketDir(path.join(d, "root.sock"))).toThrow(/open to other users/);
  });

  it("refuses a directory that is a link", () => {
    const real = path.join(dir, "real");
    mkdirSync(real, { mode: 0o700 });
    const link = path.join(dir, "link");
    symlinkSync(real, link);
    expect(() => secureSocketDir(path.join(link, "root.sock"))).toThrow(/not a directory/);
  });

  it("replaces a stale socket nobody answers, and yields to a live owner", async () => {
    const d = path.join(dir, "claim");
    mkdirSync(d, { mode: 0o700 });
    const p = path.join(d, "root.sock");
    writeFileSync(p, ""); // left behind by an owner that died
    const owner = await claimOwnership(p);
    expect(owner).not.toBeNull();
    expect(statSync(p).mode & 0o777).toBe(0o600);
    expect(await claimOwnership(p)).toBeNull();
    await new Promise<void>((r) => owner!.close(() => r()));
  });

  it("tells every client why, when the owner's devices would not bind", async () => {
    const d = path.join(dir, "halt");
    mkdirSync(d, { mode: 0o700 });
    const p = path.join(d, "root.sock");
    const server = (await claimOwnership(p)) as net.Server;
    const served = serveRoot(
      server,
      Promise.reject(new Error("device not GENUINE -- no valid manufacturer certificate")),
    );
    await expect(connectRoot(p)).rejects.toBeInstanceOf(RootHaltError);
    await expect(connectRoot(p)).rejects.toThrow(/not GENUINE/);
    await served.close();
  });
});

// A process that booted the hardware root, as owner or as client, must exit
// when its own work is done: an agent that lived on after its reply held its
// MPI rank, and the whole job, until it was killed.
describe("the owner's socket keeps no finished process alive", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const tsx = path.join(here, "../../../node_modules/tsx/dist/esm/index.mjs");
  const pipes = () => process.getActiveResourcesInfo().filter((r) => r === "PipeWrap").length;
  const service = (signMs: number): RootService => ({
    members: () => [{ uid: "01".repeat(12), pubkey: "00".repeat(32), serial: "S" }],
    run: (fn) =>
      fn({
        getIdentity: async () => ({ uid: Buffer.alloc(12, 1), pubkeyRaw: Buffer.alloc(32) }),
        challenge: async (d) => {
          await sleep(signMs);
          return sig(d);
        },
      }),
    health: () => ({ status: "CLEAN" }),
  });
  const owner = async (name: string, signMs: number) => {
    const d = path.join(dir, name);
    mkdirSync(d, { mode: 0o700 });
    const p = path.join(d, "root.sock");
    const svc = service(signMs);
    const served = serveRoot(
      (await claimOwnership(p))!,
      Promise.resolve({ svc, scheduler: schedulerFor(svc) }),
    );
    return { p, served };
  };
  /** Runs the helper; resolves with its exit code, or "alive" if it is still running. */
  const runChild = (mode: string, p: string, ms: number) =>
    new Promise<number | "alive">((resolve) => {
      const c = spawn(
        process.execPath,
        ["--import", tsx, path.join(here, "broker-exit-child.ts"), mode, p],
        {
          stdio: "ignore",
        },
      );
      const t = setTimeout(() => {
        c.kill("SIGKILL");
        resolve("alive");
      }, ms);
      c.on("exit", (code) => {
        clearTimeout(t);
        resolve(code ?? -1);
      });
    });

  it("holds neither end while nothing is asked, health polls included", async () => {
    const before = pipes();
    const { p, served } = await owner("idle", 1);
    const root = (await connectRoot(p, 20))!;
    await sleep(100); // several health polls
    expect(pipes()).toBe(before);
    root.close();
    await served.close();
  });

  it("is not held by a connection that never asks for anything", async () => {
    const before = pipes();
    const { p, served } = await owner("silent", 1);
    const peer = net.connect(p);
    await new Promise((r) => peer.once("connect", r));
    await sleep(50);
    expect(pipes()).toBe(before + 1); // the peer's own end only
    const closed = new Promise((r) => peer.once("close", r));
    peer.destroy();
    await closed;
    await served.close();
  });

  it("holds both ends while a signature is being made, and lets go after", async () => {
    const before = pipes();
    const { p, served } = await owner("busy", 200);
    const root = (await connectRoot(p, 1000))!;
    const signing = root.device().challenge(Buffer.alloc(32, 3));
    await sleep(80);
    expect(pipes()).toBe(before + 2); // the client's connection and the owner's end of it
    await signing;
    await sleep(20);
    expect(pipes()).toBe(before);
    root.close();
    await served.close();
  });

  it("lets a client exit on its own once its signature is back", async () => {
    const { p, served } = await owner("client-exit", 1);
    expect(await runChild("client", p, 15_000)).toBe(0);
    await served.close();
  }, 30_000);

  it("lets an owner exit on its own when it has nothing left to do", async () => {
    const d = path.join(dir, "owner-exit");
    mkdirSync(d, { mode: 0o700 });
    expect(await runChild("owner", path.join(d, "root.sock"), 15_000)).toBe(0);
  }, 30_000);
});
