// Hook transport security (codenclawed session.mjs, peer.mjs, control.mjs,
// call-binding.mjs, reconcile.mjs and their round 2-5 tests), the
// device-counted unlock in activation, and the containment seam.

import { generateKeyPairSync, sign as edSign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRecord, type AuditRecord } from "../audit-log.js";
import type { SecondFactorResult } from "../auth/index.js";
import {
  TAG_UNLOCK_GRANT,
  TAG_UNLOCK_USE,
  TAG_UNLOCK_STATE,
} from "../hardware-root/device-factors.js";
import type { LatchFrameDevice } from "../hardware-root/device-latch.js";
import { bindingOf } from "./approval.js";
import {
  deviceActivation,
  frameworkDeviceTotp,
  issueDeviceUnlock,
  launchContained,
  spendDeviceUnlock,
  type DeviceTotpSeam,
} from "./session.js";
import {
  CallLedger,
  contextMatches,
  emptyEnvCommand,
  envCodeLoadingRisk,
  HookHandshake,
  hookEnvironment,
  readSessionFile,
  reconcile,
  replaceProcessEnv,
  rewriteSessionFile,
  verifyChainedRecord,
  verifyHookPeer,
  verifyLauncherPeer,
  writeSessionFile,
  type LaunchContext,
  type ProcessProbe,
} from "./transport.js";
import type { ContainedLaunch, LaunchContainment } from "./types.js";

/** The unlock ticket a grant is bound to (its body digest and the credential that signed it). */
const TICKET = { digest: "7".repeat(64), credentialId: "cred-person" };
/** The job a test unlock delegates. */
const JOB = {
  name: "test-job",
  measurementDigest: "1".repeat(64),
  policyDigest: "2".repeat(64),
  projectDigest: "3".repeat(64),
  kind: "headless:print",
};

let root: string;
beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-adapter-transport-")));
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function privateDir(name: string): string {
  const d = path.join(root, name);
  fs.mkdirSync(d, { mode: 0o700 });
  fs.chmodSync(d, 0o700);
  return d;
}

describe("session file", () => {
  it("attack: a changed file, a symlink, a file open to others, a wrong digest or a public directory is refused", () => {
    const dir = privateDir("s1");
    const { file, digest } = writeSessionFile(dir, { projectDir: "/p", env: { HOME: "/h" } });
    expect(readSessionFile(file, digest).projectDir).toBe("/p");
    fs.appendFileSync(file, " ");
    expect(() => readSessionFile(file, digest)).toThrow(/does not match the digest/);
    const digest2 = rewriteSessionFile(file, { projectDir: "/p" });
    expect(readSessionFile(file, digest2).projectDir).toBe("/p");
    expect(() => readSessionFile(file, "0".repeat(64))).toThrow(/does not match/);
    expect(() => readSessionFile(file, "short")).toThrow(/no session digest/);
    expect(() => readSessionFile("relative.json", digest2)).toThrow(/no session file/);
    const link = path.join(dir, "link.json");
    fs.symlinkSync(file, link);
    expect(() => readSessionFile(link, digest2)).toThrow(/cannot open/);
    fs.chmodSync(file, 0o644);
    expect(() => readSessionFile(file, digest2)).toThrow(/readable or writable by other users/);
    fs.chmodSync(file, 0o600);
    fs.chmodSync(dir, 0o755);
    expect(() => readSessionFile(file, digest2)).toThrow(/session directory/);
    fs.chmodSync(dir, 0o700);
    expect(() => writeSessionFile(dir, {})).toThrow();
  });
});

describe("environment (env -i semantics)", () => {
  it("attack: code-loading variables never reach the hook; a peer that carries one is refused", () => {
    const env = hookEnvironment(
      {
        HOME: "/h",
        PATH: "/usr/bin",
        NODE_OPTIONS: "--require /tmp/x.js",
        LD_PRELOAD: "/tmp/x.so",
        ENCLAWEDER_FORENSIC_WEBHOOK: "https://x",
        ENCLAWED_STATE_DIR: "/s",
        AWS_SECRET_ACCESS_KEY: "k",
      },
      { projectDir: "/p", sessionDir: "/sess", pass: ["NODE_OPTIONS"] },
    );
    expect(env).toEqual({
      HOME: "/h",
      PATH: "/usr/bin",
      ENCLAWED_STATE_DIR: "/s",
      TMPDIR: "/sess",
    });
    expect(envCodeLoadingRisk(Buffer.from("HOME=/h\0NODE_OPTIONS=--require x\0"))).toBe(
      "NODE_OPTIONS",
    );
    expect(envCodeLoadingRisk(Buffer.from("A=1\0LD_AUDIT=x\0"))).toBe("LD_AUDIT");
    expect(envCodeLoadingRisk(null)).toMatch(/unreadable/);
    // A TMPDIR inside the project would be agent-writable scratch.
    expect(
      hookEnvironment({ TMPDIR: "/p/tmp" }, { projectDir: "/p", sessionDir: "/sess" }).TMPDIR,
    ).toBe("/sess");
    const target: NodeJS.ProcessEnv = { NODE_OPTIONS: "x", KEEP: "no" };
    replaceProcessEnv({ HOME: "/h" }, target);
    expect(target).toEqual({ HOME: "/h" });
  });

  it("the hook command empties the environment; without an env program there is no silent fallback", () => {
    expect(
      emptyEnvCommand(["/usr/bin/node", "/opt/hook.mjs", "--session", "/s f.json"], {
        keep: ["HOST_PROJECT_DIR", "bad name"],
        envProgram: "/usr/bin/env",
      }),
    ).toBe(
      `/usr/bin/env -i HOST_PROJECT_DIR="$HOST_PROJECT_DIR" /usr/bin/node /opt/hook.mjs --session '/s f.json'`,
    );
    expect(emptyEnvCommand(["node"], { envProgram: null })).toBeNull();
    expect(envCodeLoadingRisk(Buffer.from("HOME=/h\0PATH=/usr/bin\0"))).toBeNull();
  });
});

describe("peer verification", () => {
  const parents = new Map([
    [10, 1],
    [20, 10],
    [30, 20],
    [40, 1],
  ]);
  const probe = (o: Partial<Record<"exe" | "argv" | "env", unknown>> = {}): ProcessProbe => ({
    exe: () => (o.exe as string) ?? "/usr/bin/node",
    argv: () => (o.argv as string[]) ?? ["/usr/bin/node", "/opt/hook.mjs", "--session", "/s.json"],
    environ: () => (o.env === undefined ? Buffer.from("HOME=/h\0") : (o.env as Buffer | null)),
    parents: () => parents,
  });
  const expectArgs = {
    hostPid: 10,
    exe: "/usr/bin/node",
    argv: ["/usr/bin/node", "/opt/hook.mjs", "--session", "/s.json"],
  };

  it("attack: a process outside the host's tree, another binary, another command line, a code-loading environment are refused", () => {
    expect(verifyHookPeer({ available: true, pid: 40, reason: null }, expectArgs, probe()).ok).toBe(
      false,
    );
    expect(
      verifyHookPeer(
        { available: true, pid: 30, reason: null },
        expectArgs,
        probe({ exe: "/tmp/node" }),
      ).ok,
    ).toBe(false);
    expect(
      verifyHookPeer(
        { available: true, pid: 30, reason: null },
        expectArgs,
        probe({ argv: ["/usr/bin/node", "/opt/hook.mjs"] }),
      ).ok,
    ).toBe(false);
    expect(
      verifyHookPeer(
        { available: true, pid: 30, reason: null },
        expectArgs,
        probe({ env: Buffer.from("NODE_OPTIONS=x\0") }),
      ).ok,
    ).toBe(false);
    expect(
      verifyHookPeer({ available: true, pid: 30, reason: null }, expectArgs, probe({ env: null }))
        .ok,
    ).toBe(false);
    expect(
      verifyHookPeer({ available: true, pid: null, reason: "none" }, expectArgs, probe()).ok,
    ).toBe(false);
    expect(
      verifyHookPeer(
        { available: true, pid: 30, reason: null },
        { ...expectArgs, hostPid: null },
        probe(),
      ).ok,
    ).toBe(false);
    expect(verifyLauncherPeer({ available: true, pid: 99, reason: null }, 10).ok).toBe(false);
  });

  it("false positive: the genuine hook below the host is verified; an unavailable lookup is accepted but never verified", () => {
    expect(verifyHookPeer({ available: true, pid: 30, reason: null }, expectArgs, probe())).toEqual(
      { ok: true, verified: true, pid: 30 },
    );
    expect(verifyHookPeer({ available: false, reason: "no ss" }, expectArgs, probe())).toEqual({
      ok: true,
      verified: false,
      reason: "no ss",
    });
    expect(verifyLauncherPeer({ available: true, pid: 10, reason: null }, 10)).toEqual({
      ok: true,
      verified: true,
      reason: null,
    });
  });
});

describe("session-start handshake", () => {
  function chain(entries: { type: string; payload: unknown }[]): AuditRecord[] {
    const out: AuditRecord[] = [];
    let prev = "0".repeat(64);
    for (const e of entries) {
      const r = buildRecord({
        prevHash: prev,
        type: e.type,
        actor: "a",
        level: null,
        payload: e.payload,
        ts: 1,
      });
      out.push(r);
      prev = r.recordHash;
    }
    return out;
  }
  const lines = (recs: AuditRecord[]) => recs.map((r) => JSON.stringify(r));

  it("attack: a forged record, a raw line with the nonce, a reused or never-issued challenge do not complete it", () => {
    const hs = new HookHandshake({ nonce: "n1", recordType: "h.session.start" });
    const c = hs.challenge();
    // A chained record with the nonce but no challenge (what a repository hook could write).
    const forged = chain([{ type: "h.session.start", payload: { launcherNonce: "n1" } }]);
    expect(hs.accept(c, forged[0].recordHash, lines(forged)).ok).toBe(false);
    // A raw line claiming a hash that does not recompute.
    const raw = { ...forged[0], payload: { launcherNonce: "n1", handshake: c } };
    expect(hs.accept(c, raw.recordHash, [JSON.stringify(raw)]).ok).toBe(false);
    // A challenge that was never issued.
    const good = chain([
      { type: "h.session.start", payload: { launcherNonce: "n1", handshake: "f".repeat(64) } },
    ]);
    expect(hs.accept("f".repeat(64), good[0].recordHash, lines(good)).ok).toBe(false);
    // A broken link before the record.
    const two = chain([
      { type: "x", payload: {} },
      { type: "h.session.start", payload: { launcherNonce: "n1", handshake: c } },
    ]);
    const broken = [{ ...two[0], payload: { tampered: true } }, two[1]];
    expect(
      verifyChainedRecord(lines(broken), two[1].recordHash, { fromHash: two[0].recordHash }).ok,
    ).toBe(false);
    expect(hs.done).toBe(false);
  });

  it("the genuine record completes it once; waiters are released", async () => {
    const hs = new HookHandshake({ nonce: "n2", recordType: "h.session.start" });
    const waiting = hs.wait(5000);
    const c = hs.challenge();
    const recs = chain([
      { type: "x", payload: {} },
      { type: "h.session.start", payload: { launcherNonce: "n2", handshake: c } },
    ]);
    expect(hs.accept(c, recs[1].recordHash, lines(recs))).toEqual({ ok: true });
    expect(await waiting).toBe(true);
    expect(hs.record).toBe(recs[1].recordHash);
    expect(hs.accept(c, recs[1].recordHash, lines(recs)).ok).toBe(false);
    expect(await new HookHandshake({ nonce: "z", recordType: "t" }).wait(10)).toBe(false);
  });
});

describe("call binding and context", () => {
  const launch: LaunchContext = {
    cwd: "/proj",
    realpath: (p) => p,
    modes: ["default", "plan", "acceptEdits", "bypassPermissions"],
    bypassMode: "bypassPermissions",
    bypassAvailable: false,
    planMode: "plan",
    headless: true,
    scratchpadFor: (sid) => [`/tmp/host-1000/proj/${sid}/scratchpad`],
  };
  const ctx = (o: object = {}) => ({
    cwd: "/proj",
    mode: "default",
    scratchpadDir: null,
    sessionId: "s1",
    ...o,
  });

  it("attack: a forged cwd, mode, session or scratchpad does not match", () => {
    expect(
      contextMatches(ctx({ cwd: "/elsewhere" }), { cwd: "/proj", sessionId: "s1" }, launch).ok,
    ).toBe(false);
    expect(contextMatches(ctx({ cwd: "rel" }), null, launch).ok).toBe(false);
    expect(contextMatches(ctx({ mode: "bypassPermissions" }), null, launch).ok).toBe(false);
    expect(contextMatches(ctx({ mode: "yolo" }), null, launch).ok).toBe(false);
    expect(contextMatches(ctx({ sessionId: "other" }), { sessionId: "s1" }, launch).ok).toBe(false);
    expect(contextMatches(ctx({ scratchpadDir: "/proj" }), { sessionId: "s1" }, launch).ok).toBe(
      false,
    );
    expect(
      contextMatches(ctx({ mode: "acceptEdits" }), null, { ...launch, launchedMode: "default" }).ok,
    ).toBe(false);
    expect(
      contextMatches(ctx({ mode: "bypassPermissions" }), null, {
        ...launch,
        bypassAvailable: true,
        launchedMode: "plan",
      }).ok,
    ).toBe(false);
  });

  it("false positive: the real context matches (transcript cwd, scratchpad, leaving plan mode)", () => {
    expect(contextMatches(ctx(), { cwd: "/proj", sessionId: "s1" }, launch)).toEqual({ ok: true });
    expect(contextMatches(ctx({ cwd: "/proj/sub" }), { cwd: "/proj/sub" }, launch)).toEqual({
      ok: true,
    });
    expect(
      contextMatches(
        ctx({ scratchpadDir: "/tmp/host-1000/proj/s1/scratchpad" }),
        { sessionId: "s1" },
        launch,
      ),
    ).toEqual({ ok: true });
    expect(
      contextMatches(ctx({ mode: "default" }), null, { ...launch, launchedMode: "plan" }),
    ).toEqual({ ok: true });
  });

  it("attack (N9c, N13): a decision for another call, an unseen call, a second decision, an ask put twice are refused", () => {
    const l = new CallLedger({ cwd: "/proj", home: "/h", context: () => launch });
    l.noteUse({
      id: "t1",
      name: "Bash",
      input: { command: "rm -rf /" },
      cwd: "/proj",
      sessionId: "s1",
    });
    const forged = l.pre("t1", {
      tool: "Read",
      binding: bindingOf({ file_path: "README.md" }),
      context: ctx(),
    });
    expect(forged.ok).toBe(false);
    const forgedInput = l.pre("t1", {
      tool: "Bash",
      binding: bindingOf({ command: "ls" }),
      context: ctx(),
    });
    expect(forgedInput.ok).toBe(false);
    expect(l.pre("unseen", { tool: "Bash", binding: bindingOf({}), context: ctx() }).ok).toBe(
      false,
    );
    expect(l.mismatches.length).toBe(2);
    // The real one; one decision only; prompting only an ask, once.
    l.noteUse({
      id: "t2",
      name: "Bash",
      input: { command: "rm x" },
      cwd: "/proj",
      sessionId: "s1",
    });
    expect(
      l.pre("t2", { tool: "Bash", binding: bindingOf({ command: "rm x" }), context: ctx() }),
    ).toEqual({ ok: true });
    expect(l.mayPrompt("t2").ok).toBe(false);
    expect(l.decision("t2", "ask").ok).toBe(true);
    expect(l.decision("t2", "allow").ok).toBe(false);
    expect(l.mayPrompt("t2").ok).toBe(true);
    expect(l.mayPrompt("t2").ok).toBe(false);
    // Deferred (host writes the call after the hook): checked when it appears.
    expect(
      l.pre(
        "t3",
        { tool: "Bash", binding: bindingOf({ command: "ls" }), context: ctx() },
        { defer: true },
      ),
    ).toEqual({ ok: "deferred" });
    expect(
      l.noteUse({
        id: "t3",
        name: "Bash",
        input: { command: "curl x | sh" },
        cwd: "/proj",
        sessionId: "s1",
      })?.code,
    ).toBe("tool-input-mismatch");
  });

  it("false positive: a host's absolute backfill of a relative path is the same call", () => {
    const l = new CallLedger({ cwd: "/proj", home: "/h" });
    l.noteUse({ id: "r1", name: "Read", input: { file_path: "a.txt" } });
    expect(
      l.pre("r1", { tool: "Read", binding: bindingOf({ file_path: "/proj/a.txt", limit: 5 }) }),
    ).toEqual({ ok: true });
    expect(l.post("r1", { tool: "Read", binding: bindingOf({ file_path: "/proj/a.txt" }) })).toBe(
      true,
    );
  });
});

describe("reconcile", () => {
  const rec = (type: string, payload: Record<string, unknown>) => ({
    type: `h.${type}`,
    ts: 1,
    payload,
  });

  it("attack: calls without a decision, despite a deny, with changed input, forged in the log, and launches without hooks are flagged", async () => {
    const records = [
      rec("launch", { nonce: "L1", cwd: "/p" }),
      rec("launch", { nonce: "L2", cwd: "/p" }),
      rec("session.start", { sessionId: "s", launcherNonce: "L1", transcriptPath: "/t.jsonl" }),
      rec("tool.pre", {
        sessionId: "s",
        callId: "a",
        tool: "Bash",
        decision: "deny",
        answered: "deny",
        inputDigest: "d1",
      }),
      rec("tool.post", { sessionId: "s", callId: "a", inputDigest: "d1" }),
      rec("tool.pre", {
        sessionId: "s",
        callId: "b",
        tool: "Bash",
        decision: "allow",
        answered: "allow",
        inputDigest: "d1",
      }),
      rec("tool.post", { sessionId: "s", callId: "b", inputDigest: "d2" }),
      rec("tool.post", { sessionId: "s", callId: "c" }),
      rec("tool.pre", {
        sessionId: "s",
        callId: "d",
        tool: "Read",
        decision: "allow",
        answered: "allow",
        binding: bindingOf({ file_path: "README.md" }),
        projectDir: "/p",
      }),
      rec("tool.pre", {
        sessionId: "s",
        callId: "e",
        tool: "Bash",
        decision: "ask",
        answered: "ask",
      }),
      rec("session.end", { sessionId: "s" }),
    ];
    const r = await reconcile(records, {
      host: "h",
      readTranscript: async () => [
        { id: "d", name: "Bash", input: { command: "rm -rf /" }, ran: true },
        { id: "e", name: "Bash", input: {}, ran: true },
        { id: "z", name: "Bash", input: {}, ran: true },
      ],
    });
    const codes = r.findings.map((f) => f.code);
    for (const c of [
      "launch-without-hooks",
      "ran-despite-deny",
      "input-changed-after-decision",
      "ran-without-decision",
      "tool-name-mismatch",
      "ran-despite-decision",
      "transcript-call-without-decision",
    ]) {
      expect(codes, c).toContain(c);
    }
  });

  it("false positive: a clean session reconciles with no errors", async () => {
    const r = await reconcile(
      [
        rec("launch", { nonce: "L", cwd: "/p" }),
        rec("session.start", { sessionId: "s", launcherNonce: "L", transcriptPath: "/t" }),
        rec("tool.pre", {
          sessionId: "s",
          callId: "a",
          tool: "Read",
          decision: "allow",
          answered: "allow",
          inputDigest: "d",
          binding: bindingOf({ file_path: "/p/a" }),
          projectDir: "/p",
        }),
        rec("tool.post", { sessionId: "s", callId: "a", inputDigest: "d" }),
        rec("session.end", { sessionId: "s" }),
        { type: "other.app", payload: {} },
      ],
      {
        host: "h",
        readTranscript: async () => [
          { id: "a", name: "Read", input: { file_path: "a" }, ran: true },
        ],
      },
    );
    expect(r.findings.filter((f) => f.severity === "error")).toEqual([]);
  });
});

// ─── Device-counted unlock ─────────────────────────────────────────────

/** A stand-in Enclaweder that keeps and counts one unlock grant, signing as the real one does. */
function fakeDevice(o: { code?: string; uses?: number; replay?: boolean } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = Buffer.from(publicKey.export({ format: "der", type: "spki" }).subarray(12));
  const uid = Buffer.alloc(12, 7);
  let grant: { gid: bigint; uses: number; used: number; scope: Buffer } | null = null;
  let lastUse: Buffer | null = null;
  const body = (kind: number, state: number, scope: Buffer, useIndex: number) => {
    const b = Buffer.alloc(100);
    b[0] = 1;
    b[1] = state;
    b[3] = kind;
    b.writeUInt16LE(grant?.uses ?? 0, 4);
    b.writeUInt16LE(grant?.used ?? 0, 6);
    b.writeBigUInt64LE(grant?.gid ?? 0n, 8);
    b.writeBigUInt64LE(3n, 16);
    b.writeUInt32LE(60000, 24);
    b.writeBigUInt64LE(BigInt(Math.floor(Date.now() / 1000)), 40);
    b.writeUInt16LE(useIndex, 52);
    uid.copy(b, 56);
    scope.copy(b, 68);
    return b;
  };
  const answer = (status: number, tag: Buffer, nonce: Buffer, b: Buffer) =>
    Buffer.concat([
      Buffer.from([status]),
      b,
      edSign(null, Buffer.concat([tag, nonce, b]), privateKey),
    ]);
  const dev: LatchFrameDevice = {
    async request(type, _id, payload = Buffer.alloc(0)) {
      const nonce = payload.subarray(0, 32);
      if (type === 0x30) {
        const code = String(payload.readUInt32LE(32)).padStart(6, "0");
        if (code !== (o.code ?? "123456")) {
          return { payload: Buffer.from([5, 0, 0, 0, 0]) };
        }
        const scope = Buffer.from(payload.subarray(32 + 4 + 8 + 2 + 4, 32 + 4 + 8 + 2 + 4 + 32));
        grant = { gid: 42n, uses: payload.readUInt16LE(44), used: 0, scope };
        return { payload: answer(0, TAG_UNLOCK_GRANT, nonce, body(1, 1, scope, 0)) };
      }
      if (type === 0x31) {
        const gid = payload.readBigUInt64LE(32);
        const scope = Buffer.from(payload.subarray(48, 80));
        if (!grant || grant.used >= grant.uses) {
          return { payload: answer(2, TAG_UNLOCK_STATE, nonce, body(3, 2, scope, 0)) };
        }
        if (gid !== grant.gid || !scope.equals(grant.scope)) {
          return { payload: Buffer.from([5]) };
        }
        if (o.replay && lastUse) {
          // A relay replaying the device's earlier receipt instead of asking it.
          return { payload: lastUse };
        }
        grant.used++;
        lastUse = answer(0, TAG_UNLOCK_USE, nonce, body(2, 1, scope, grant.used));
        return { payload: lastUse };
      }
      return null;
    },
  };
  const seam: DeviceTotpSeam = {
    ...frameworkDeviceTotp,
    access: () => ({ pubkeyRaw: pub, uid, cert: Buffer.alloc(0), run: (fn) => fn(dev) }),
    enrolled: async () => true,
  };
  return { seam, used: () => grant?.used ?? 0 };
}

describe("device-counted unlock", () => {
  it("one person's authorization covers up to 65535 launches, counted by the device", async () => {
    const d = fakeDevice();
    const g = await issueDeviceUnlock({
      host: "h",
      ticket: TICKET,
      job: JOB,
      code: "123456",
      uses: 65_535,
      leaseS: 36 * 3600,
      device: d.seam,
    });
    expect(g.ok && g.grant.uses).toBe(65_535);
    // The wire's use count is 16 bits: more cannot be asked for.
    const over = await issueDeviceUnlock({
      host: "h",
      ticket: TICKET,
      job: JOB,
      code: "123456",
      uses: 65_536,
      leaseS: 600,
      device: d.seam,
    });
    expect(!over.ok && over.code).toBe("malformed");
  });

  it("attack 7 with a large unlock: a launch outside its job is refused with uses left; the job itself launches", async () => {
    const d = fakeDevice();
    const job = JOB;
    const unnamed = await issueDeviceUnlock({
      host: "h",
      ticket: TICKET,
      code: "123456",
      uses: 65_535,
      leaseS: 36 * 3600,
      device: d.seam,
    });
    expect(!unnamed.ok && unnamed.code).toBe("malformed");
    const long = await issueDeviceUnlock({
      host: "h",
      ticket: TICKET,
      code: "123456",
      uses: 1,
      leaseS: 601,
      device: d.seam,
    });
    expect(!long.ok && long.code).toBe("malformed");
    const g = await issueDeviceUnlock({
      host: "h",
      ticket: TICKET,
      job,
      code: "123456",
      uses: 65_535,
      leaseS: 36 * 3600,
      device: d.seam,
    });
    if (!g.ok) {
      throw new Error("grant");
    }
    const others = [
      null,
      { ...job, measurementDigest: "4".repeat(64) },
      { ...job, policyDigest: "4".repeat(64) },
      { ...job, projectDigest: "4".repeat(64) },
      { ...job, kind: "interactive" },
      { ...job, name: "other" },
    ];
    for (const other of others) {
      expect(
        (
          await spendDeviceUnlock(g.grant, {
            host: "h",
            ticket: TICKET,
            job: other,
            device: d.seam,
          })
        ).ok,
      ).toBe(false);
    }
    expect(d.used()).toBe(0);
    expect(
      (await spendDeviceUnlock(g.grant, { host: "h", ticket: TICKET, job, device: d.seam })).ok,
    ).toBe(true);
    expect(d.used()).toBe(1);
    // A one-use, ten-minute unlock needs no job, and is spent only without one.
    const d2 = fakeDevice();
    const small = await issueDeviceUnlock({
      host: "h",
      ticket: TICKET,
      code: "123456",
      uses: 1,
      leaseS: 600,
      device: d2.seam,
    });
    if (!small.ok) {
      throw new Error("grant");
    }
    expect(
      (
        await spendDeviceUnlock(small.grant, {
          host: "h",
          ticket: TICKET,
          job: null,
          device: d2.seam,
        })
      ).ok,
    ).toBe(true);
  });

  it("a grant made with a code the device checked buys exactly its uses; the device counts them", async () => {
    const d = fakeDevice();
    const g = await issueDeviceUnlock({
      host: "h",
      ticket: TICKET,
      job: JOB,
      code: "123456",
      uses: 2,
      leaseS: 600,
      device: d.seam,
    });
    expect(g.ok).toBe(true);
    if (!g.ok) {
      return;
    }
    expect(
      (await spendDeviceUnlock(g.grant, { host: "h", ticket: TICKET, job: JOB, device: d.seam }))
        .ok,
    ).toBe(true);
    expect(
      (await spendDeviceUnlock(g.grant, { host: "h", ticket: TICKET, job: JOB, device: d.seam }))
        .ok,
    ).toBe(true);
    const third = await spendDeviceUnlock(g.grant, {
      host: "h",
      ticket: TICKET,
      job: JOB,
      device: d.seam,
    });
    expect(!third.ok && third.code).toBe("no-grant");
    expect(d.used()).toBe(2);
  });

  it("attack: a wrong code, an edited grant, another program's scope, another device, no device: no launch", async () => {
    const d = fakeDevice();
    const bad = await issueDeviceUnlock({
      host: "h",
      ticket: TICKET,
      job: JOB,
      code: "000000",
      uses: 2,
      leaseS: 600,
      device: d.seam,
    });
    expect(!bad.ok && bad.code).toBe("rejected");
    const g = await issueDeviceUnlock({
      host: "h",
      ticket: TICKET,
      job: JOB,
      code: "123456",
      uses: 5,
      leaseS: 600,
      device: d.seam,
    });
    if (!g.ok) {
      throw new Error("grant");
    }
    // A host-side edit (more uses, another grant id) changes nothing on the device.
    const edited = await spendDeviceUnlock(
      { ...g.grant, gid: "43" },
      { host: "h", ticket: TICKET, job: JOB, device: d.seam },
    );
    expect(edited.ok).toBe(false);
    expect(
      (
        await spendDeviceUnlock(g.grant, {
          host: "other-cli",
          ticket: TICKET,
          job: JOB,
          device: d.seam,
        })
      ).ok,
    ).toBe(false);
    const other = fakeDevice();
    expect(
      (
        await spendDeviceUnlock(g.grant, {
          host: "h",
          ticket: TICKET,
          job: JOB,
          device: other.seam,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await spendDeviceUnlock(g.grant, {
          host: "h",
          ticket: TICKET,
          job: JOB,
          device: { ...d.seam, access: () => null },
        })
      ).ok,
    ).toBe(false);
    expect(
      (await spendDeviceUnlock(null, { host: "h", ticket: TICKET, job: JOB, device: d.seam })).ok,
    ).toBe(false);
    expect(
      (
        await spendDeviceUnlock(g.grant, {
          host: "h",
          ticket: TICKET,
          job: JOB,
          device: { ...d.seam, unlock: undefined },
        })
      ).ok,
    ).toBe(false);
  });

  it("activation: with a device bound, a headless ticket also spends a device-counted use; FIDO2 also needs a device code", async () => {
    const d = fakeDevice({ uses: 1 });
    const g = await issueDeviceUnlock({
      host: "h",
      ticket: TICKET,
      job: JOB,
      code: "123456",
      uses: 1,
      leaseS: 600,
      device: d.seam,
    });
    if (!g.ok) {
      throw new Error("grant");
    }
    const ticket: SecondFactorResult = { via: "ticket", credential: "k1", ticket: TICKET };
    // Attack 7: another ticket (replayed or edited), or one signed by the
    // attacker's own credential, names another scope; the device refuses it
    // and the use is not spent.
    const forged: SecondFactorResult = {
      via: "ticket",
      credential: "k9",
      ticket: { digest: "8".repeat(64), credentialId: "cred-person" },
    };
    const ownCred: SecondFactorResult = {
      via: "ticket",
      credential: "k9",
      ticket: { ...TICKET, credentialId: "cred-attacker" },
    };
    await expect(
      deviceActivation(forged, {}, { seam: d.seam, host: "h", unlock: g.grant, job: JOB }),
    ).rejects.toThrow(/device unlock/);
    await expect(
      deviceActivation(ownCred, {}, { seam: d.seam, host: "h", unlock: g.grant, job: JOB }),
    ).rejects.toThrow(/device unlock/);
    await expect(
      deviceActivation(
        { via: "ticket", credential: "k1" },
        {},
        { seam: d.seam, host: "h", unlock: g.grant },
      ),
    ).rejects.toThrow(/no unlock ticket/);
    // An older, unbound grant record is not spent.
    await expect(
      deviceActivation(
        ticket,
        {},
        { seam: d.seam, host: "h", unlock: { ...g.grant, v: 1 } as never },
      ),
    ).rejects.toThrow(/not bound to an unlock ticket/);
    expect(d.used()).toBe(0);
    const ok = await deviceActivation(
      ticket,
      {},
      { seam: d.seam, host: "h", unlock: g.grant, job: JOB },
    );
    expect(ok.device).toBe("device-unlock");
    await expect(
      deviceActivation(ticket, {}, { seam: d.seam, host: "h", unlock: g.grant, job: JOB }),
    ).rejects.toThrow(/headless launch with an Enclaweder needs a device unlock/);
    await expect(
      deviceActivation(ticket, {}, { seam: d.seam, host: "h", unlock: null, job: JOB }),
    ).rejects.toThrow(/device unlock/);
    // Interactive FIDO2: the device must verify a code too.
    const fido: SecondFactorResult = { via: "fido2", credential: "k1" };
    const factor = {
      kind: "device-totp" as const,
      label: "code",
      enrolled: async () => true,
      verify: async ({ code }: { code: string }) =>
        code === "654321" ? { ok: true as const } : { ok: false as const, code: "rejected" },
    };
    const typed = ["000000", "654321"];
    const r = await deviceActivation(
      fido,
      { deviceFactor: factor, readCode: async () => typed.shift() ?? "" },
      { seam: d.seam },
    );
    expect(r.device).toBe("device-totp");
    await expect(
      deviceActivation(
        fido,
        { deviceFactor: factor, readCode: async () => "111111" },
        { seam: d.seam },
      ),
    ).rejects.toThrow(/did not accept/);
    await expect(
      deviceActivation(fido, { deviceFactor: factor }, { seam: d.seam }),
    ).rejects.toThrow(/no way to ask/);
  });

  it("attack: a replayed receipt (not signed over this spend's fresh nonce) does not count", async () => {
    const d = fakeDevice({ replay: true });
    const g = await issueDeviceUnlock({
      host: "h",
      ticket: TICKET,
      job: JOB,
      code: "123456",
      uses: 5,
      leaseS: 600,
      device: d.seam,
    });
    if (!g.ok) {
      throw new Error("grant");
    }
    expect(
      (await spendDeviceUnlock(g.grant, { host: "h", ticket: TICKET, job: JOB, device: d.seam }))
        .ok,
    ).toBe(true);
    const again = await spendDeviceUnlock(g.grant, {
      host: "h",
      ticket: TICKET,
      job: JOB,
      device: d.seam,
    });
    expect(!again.ok && again.code).toBe("bad-receipt");
  });

  it("attack: a receipt the kit cannot verify (a seam that claims a spend) does not count", async () => {
    const d = fakeDevice();
    const g = await issueDeviceUnlock({
      host: "h",
      ticket: TICKET,
      job: JOB,
      code: "123456",
      uses: 5,
      leaseS: 600,
      device: d.seam,
    });
    if (!g.ok) {
      throw new Error("grant");
    }
    const lying: DeviceTotpSeam = {
      ...d.seam,
      unlock: {
        ...frameworkDeviceTotp.unlock!,
        spend: (async () => ({
          ok: true,
          receipt: {} as never,
          record: { ...g.grant.record, tag: "use" },
        })) as never,
      },
    };
    const r = await spendDeviceUnlock(g.grant, {
      host: "h",
      ticket: TICKET,
      job: JOB,
      device: lying,
    });
    expect(!r.ok && r.code).toBe("bad-receipt");
  });

  it("false positive: with no device bound the framework gate's answer stands; a device-verified code is not asked twice", async () => {
    const t: SecondFactorResult = { via: "ticket", credential: "k" };
    expect((await deviceActivation(t, {}, { seam: null })).device).toBeNull();
    expect(
      (await deviceActivation(t, {}, { seam: { ...frameworkDeviceTotp, access: () => null } }))
        .device,
    ).toBeNull();
    const d = fakeDevice();
    expect(
      (await deviceActivation({ via: "device-totp", credential: null }, {}, { seam: d.seam }))
        .device,
    ).toBe("device-totp");
  });
});

describe("launch containment seam", () => {
  const spec: ContainedLaunch = {
    kind: "mcp-server",
    argv: ["srv"],
    cwd: "/",
    env: {},
    roots: [],
    egress: [],
    label: "the MCP server docs",
  };
  it("attack: no containment, or a machine that cannot contain, or a failing build: never started", async () => {
    expect((await launchContained(null, spec)).ok).toBe(false);
    const cannot: LaunchContainment = {
      available: () => ({ ok: false, reason: "no user namespaces" }),
      launch: async () => ({ ok: true, pid: 1, stop: async () => {} }),
    };
    const r = await launchContained(cannot, spec);
    expect(!r.ok && r.reason).toMatch(/cannot contain it \(no user namespaces\)/);
    const throws: LaunchContainment = {
      available: () => ({ ok: true, reason: null }),
      launch: async () => {
        throw new Error("bind failed");
      },
    };
    expect((await launchContained(throws, spec)).ok).toBe(false);
  });
  it("false positive: an available containment launches", async () => {
    const ok: LaunchContainment = {
      available: () => ({ ok: true, reason: null }),
      launch: async () => ({ ok: true, pid: 7, stop: async () => {} }),
    };
    const r = await launchContained(ok, spec);
    expect(r.ok && r.pid).toBe(7);
  });
});

describe("unlockTicketBinding", () => {
  it("binds a grant to the ticket body digest and its credential; any body change is another binding", async () => {
    const { unlockTicketBinding } = await import("./session.js");
    const body = {
      v: 2 as const,
      rpId: "r",
      scope: "session-start" as const,
      nonce: "n",
      uid: 1,
      hostname: "h",
      machineId: null,
      bootId: "b",
      issuedAt: 1,
      expiresAt: 2,
      issuedAtMono: "1",
      expiresAtMono: "2",
      uses: 1,
      credential: "k",
      credentialId: "cid",
    };
    const a = unlockTicketBinding(body);
    expect(a.credentialId).toBe("cid");
    expect(a.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(unlockTicketBinding({ ...body, uses: 2 }).digest).not.toBe(a.digest);
    expect(unlockTicketBinding({ ...body, usesLeft: 0 } as typeof body).digest).toBe(a.digest);
  });
});
