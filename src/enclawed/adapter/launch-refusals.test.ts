// Launch-time refusals and timing moved out of codenclawed: the project /
// state-directory overlap, the transcript-disabling flags (R4), the hook
// handshake deadline and the approval timeout. Ported from codenclawed's
// regressions (I3/I4, N1/N4) and opt-outs tests; every rule has an attack and
// a false-positive case, on real directories.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRecord, type AuditRecord } from "../audit-log.js";
import {
  APPROVAL_HOOK_MARGIN_S,
  APPROVAL_TIMEOUT_MS,
  approvalHookTimeoutS,
  askWithinTimeout,
} from "./approval.js";
import {
  HANDSHAKE_TIMEOUT_S,
  decideProjectOverlap,
  decideTranscriptFlags,
  handshakeTimeoutAction,
  noHandshakeVerdict,
  transcriptDisablingFlag,
} from "./launch-refusals.js";
import { HookHandshake } from "./transport.js";

let root: string;
beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-adapter-refusals-")));
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function mk(...parts: string[]): string {
  const d = path.join(root, ...parts);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

describe("project overlap with the state directory and the installation", () => {
  it("attack: a project that contains, is, or is inside the state directory is refused", () => {
    const home = mk("home1");
    const state = mk("home1", ".enclawed");
    const install = mk("opt", "adapter");
    const roots = [
      { label: "the adapter's installation", path: install },
      { label: "the Enclawed state directory", path: state },
    ];
    const contains = decideProjectOverlap({ projectDir: home, roots });
    expect(contains?.code).toBe("project-contains-protected");
    expect(contains?.message).toMatch(/contains the Enclawed state directory/);
    expect(decideProjectOverlap({ projectDir: state, roots })?.code).toBe("project-is-protected");
    const inner = mk("home1", ".enclawed", "claude-code");
    expect(decideProjectOverlap({ projectDir: inner, roots })?.code).toBe(
      "project-inside-protected",
    );
    // A directory not created yet resolves through its nearest existing parent.
    expect(decideProjectOverlap({ projectDir: path.join(state, "not", "yet"), roots })?.code).toBe(
      "project-inside-protected",
    );
    expect(decideProjectOverlap({ projectDir: path.join(install, ".."), roots })?.label).toBe(
      "the adapter's installation",
    );
  });

  it("attack: a symlink to the home directory or a case-folded spelling still overlaps", () => {
    const home = mk("home2");
    const state = mk("home2", ".enclawed");
    const link = path.join(root, "link-to-home2");
    fs.symlinkSync(home, link);
    const roots = [{ label: "the Enclawed state directory", path: state }];
    expect(decideProjectOverlap({ projectDir: link, roots })?.code).toBe(
      "project-contains-protected",
    );
    expect(
      decideProjectOverlap({ projectDir: home.toUpperCase(), roots, realpath: (p) => p })?.code,
    ).toBe("project-contains-protected");
  });

  it("FP: a project beside the state directory, or a sibling with a common name prefix, starts", () => {
    const state = mk("home3", ".enclawed");
    const roots = [
      { label: "the Enclawed state directory", path: state },
      { label: "the adapter's installation", path: mk("opt3", "adapter") },
    ];
    expect(decideProjectOverlap({ projectDir: mk("home3", "proj"), roots })).toBeNull();
    expect(decideProjectOverlap({ projectDir: mk("home3", ".enclawed-old"), roots })).toBeNull();
    expect(decideProjectOverlap({ projectDir: mk("opt3", "adapter2"), roots })).toBeNull();
    expect(
      decideProjectOverlap({ projectDir: mk("home3", "p"), roots: [{ label: "x", path: "" }] }),
    ).toBeNull();
  });
});

describe("transcript-disabling flags (R4)", () => {
  const FLAGS = ["--no-session-persistence"];

  it("attack: the flag among the host's options refuses the launch, in either form", () => {
    for (const args of [
      ["--no-session-persistence", "-p", "x"],
      ["-p", "--no-session-persistence"],
      ["--model", "m", "--no-session-persistence=true"],
    ]) {
      const r = decideTranscriptFlags(args, FLAGS, "claude");
      expect(r?.code, args.join(" ")).toBe("transcript-disabled");
      expect(r?.message).toMatch(/transcript/);
    }
  });

  it("FP: the same words in the prompt after --, similar flags, or no flag at all start", () => {
    expect(transcriptDisablingFlag(["-p", "--", "--no-session-persistence"], FLAGS)).toBeNull();
    expect(transcriptDisablingFlag(["--no-session-persistence-x", "-p"], FLAGS)).toBeNull();
    expect(transcriptDisablingFlag(["--session-persistence"], FLAGS)).toBeNull();
    expect(decideTranscriptFlags(["-p", "hello"], FLAGS, "claude")).toBeNull();
    expect(decideTranscriptFlags(["--no-session-persistence"], [], "claude")).toBeNull();
  });
});

describe("handshake timing", () => {
  it("the timeout is a fixed constant; headless stops the host, interactive warns", () => {
    expect(HANDSHAKE_TIMEOUT_S).toBe(30);
    expect(handshakeTimeoutAction({ headless: true }).action).toBe("stop-host");
    const warn = handshakeTimeoutAction({ headless: false, refused: "peer check failed" });
    expect(warn.action).toBe("warn");
    expect(warn.reason).toMatch(/refused: peer check failed/);
  });

  it("attack: no handshake by the deadline stops a headless host; the timer gets the constant", () => {
    const hs = new HookHandshake({ nonce: "n", recordType: "h.session.start" });
    let fire: (() => void) | null = null;
    let ms = 0;
    const seen: string[] = [];
    hs.watchDeadline({
      headless: true,
      onTimeout: (a) => seen.push(a.action),
      setTimer: (fn, t) => {
        fire = fn;
        ms = t;
        return () => {
          fire = null;
        };
      },
    });
    expect(ms).toBe(HANDSHAKE_TIMEOUT_S * 1000);
    (fire as (() => void) | null)?.();
    expect(seen).toEqual(["stop-host"]);
  });

  it("FP: a handshake before the deadline, or a cancelled watch, never fires", () => {
    const hs = new HookHandshake({ nonce: "n2", recordType: "h.session.start" });
    let fire: (() => void) | null = null;
    const seen: string[] = [];
    const cancel = hs.watchDeadline({
      headless: true,
      onTimeout: (a) => seen.push(a.action),
      setTimer: (fn) => {
        fire = fn;
        return () => {};
      },
    });
    // Complete the handshake with a genuine chained record.
    const c = hs.challenge();
    const rec: AuditRecord = buildRecord({
      prevHash: "0".repeat(64),
      type: "h.session.start",
      actor: "hook",
      level: null,
      payload: { launcherNonce: "n2", handshake: c },
    });
    expect(hs.accept(c, rec.recordHash, [JSON.stringify(rec)]).ok).toBe(true);
    (fire as (() => void) | null)?.();
    expect(seen).toEqual([]);
    const hs2 = new HookHandshake({ nonce: "n3", recordType: "h.session.start" });
    let fire2: (() => void) | null = null;
    const stop = hs2.watchDeadline({
      headless: true,
      onTimeout: (a) => seen.push(a.action),
      setTimer: (fn) => {
        fire2 = fn;
        return () => {};
      },
    });
    stop();
    (fire2 as (() => void) | null)?.();
    expect(seen).toEqual([]);
    cancel();
  });

  it("the end-of-session verdict: no handshake fails the session unless the host failed first", () => {
    const base = { expected: true, done: false, stoppedForTimeout: false };
    expect(noHandshakeVerdict({ ...base, hostExitCode: 0 })?.failSession).toBe(true);
    expect(
      noHandshakeVerdict({ ...base, stoppedForTimeout: true, hostExitCode: 137 })?.failSession,
    ).toBe(true);
    expect(noHandshakeVerdict({ ...base, hostExitCode: 1 })?.failSession).toBe(false);
    expect(noHandshakeVerdict({ ...base, done: true, hostExitCode: 0 })).toBeNull();
    expect(noHandshakeVerdict({ ...base, expected: false, hostExitCode: 0 })).toBeNull();
  });
});

describe("approval timeout", () => {
  const manual = () => {
    const t: { fire: (() => void) | null; ms: number } = { fire: null, ms: 0 };
    const setTimer = (fn: () => void, ms: number) => {
      t.fire = fn;
      t.ms = ms;
      return () => {
        t.fire = null;
      };
    };
    return { t, setTimer };
  };

  it("the timeout is an internal constant and the host's hook outlives it", () => {
    expect(APPROVAL_TIMEOUT_MS).toBe(5 * 60 * 1000);
    expect(approvalHookTimeoutS(10)).toBe(APPROVAL_TIMEOUT_MS / 1000 + APPROVAL_HOOK_MARGIN_S);
    expect(approvalHookTimeoutS(10_000)).toBe(10_000);
    expect(approvalHookTimeoutS(Number.NaN)).toBe(330);
  });

  it("attack: no answer in time denies, and a late correct answer does not approve", async () => {
    const { t, setTimer } = manual();
    let answer: ((v: { answer: string | null }) => void) | null = null;
    let aborted = false;
    const p = askWithinTimeout({
      code: "xyz",
      setTimer,
      read: (signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
          });
          answer = resolve;
        }),
    });
    expect(t.ms).toBe(APPROVAL_TIMEOUT_MS);
    t.fire?.();
    (answer as ((v: { answer: string | null }) => void) | null)?.({ answer: "xyz" });
    const r = await p;
    expect(r).toMatchObject({ approved: false, code: "timeout" });
    expect(aborted).toBe(true);
  });

  it("attack: a wrong code, no terminal, or a prompt that throws denies", async () => {
    const ask = (read: () => Promise<{ answer: string | null; reason?: string }>) =>
      askWithinTimeout({ code: "xyz", read, setTimer: manual().setTimer });
    expect((await ask(async () => ({ answer: "yes" }))).code).toBe("wrong-code");
    expect((await ask(async () => ({ answer: "" }))).code).toBe("wrong-code");
    const none = await ask(async () => ({ answer: null, reason: "no terminal to ask on" }));
    expect(none).toMatchObject({ approved: false, code: "no-answer" });
    expect(none.reason).toMatch(/no terminal/);
    expect(
      (
        await ask(async () => {
          throw new Error("EIO");
        })
      ).code,
    ).toBe("prompt-failed");
    expect(
      (
        await askWithinTimeout({
          code: "",
          read: async () => ({ answer: "" }),
          setTimer: manual().setTimer,
        })
      ).approved,
    ).toBe(false);
  });

  it("FP: the code typed in time approves (any case, surrounding spaces)", async () => {
    const { t, setTimer } = manual();
    const r = await askWithinTimeout({
      code: "xyz",
      setTimer,
      read: async () => ({ answer: " XyZ " }),
    });
    expect(r).toMatchObject({ approved: true, code: "approved" });
    expect(t.fire).toBeNull();
  });

  it("the default timer is real and cancelled on an answer", async () => {
    const r = await askWithinTimeout({ code: "abc", read: async () => ({ answer: "abc" }) });
    expect(r.approved).toBe(true);
  });
});
