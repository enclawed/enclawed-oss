// The hardware root's sharing machinery, where it is pure logic: the
// scheduler's rules, the socket directory's checks, claiming a stale socket,
// and a refused boot reaching every client as a halt. The devices themselves
// are exercised in swarm/enclaweder.hardware.test.ts.

import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  claimOwnership,
  connectRoot,
  DeviceScheduler,
  RootHaltError,
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
