// Session guards moved out of codenclawed: the managed-hooks check, the
// dropped-settings watcher and the interactive prevalidation, the audit-log
// anchor chain follower, and the transcript watch for calls that ran without a
// decision. Ported from codenclawed's regressions (I10, N1/N4), round4 (F1,
// N14) tests; each rule has attack and false-positive cases on real files.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuditLogger } from "../audit-log.js";
import { AnchorTamper, anchorFilesGuard, followChain } from "./anchor-chain.js";
import {
  managedHooksStatus,
  readManagedDocs,
  runsManagedHook,
  type ManagedHooksSpec,
} from "./managed-hooks.js";
import {
  PREVALIDATE_RUN_MS,
  neutralizeHookCommands,
  prevalidateSettings,
  settingsDropWatcher,
} from "./settings-drop.js";
import {
  prefixedDirs,
  transcriptCallVerdict,
  watchTranscripts,
  type TranscriptLine,
} from "./transcript-watch.js";

let root: string;
beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-adapter-guards-")));
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function mk(...parts: string[]): string {
  const d = path.join(root, ...parts);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ─── Managed hooks ──────────────────────────────────────────────────────

describe("managed hooks installed and unmodified", () => {
  const P = "__HOOK__";
  const expected = {
    PreToolUse: [
      {
        matcher: "*",
        hooks: [{ type: "command", command: P, timeout: 10, onFailure: "block" }],
      },
    ],
    SessionStart: [{ hooks: [{ type: "command", command: P, timeout: 10 }] }],
  };
  let dir: string;
  let script: string;
  let spec: ManagedHooksSpec;
  const command = () => `'/usr/bin/env' -i X="$X" '/usr/bin/node' '${script}' --origin managed`;
  const template = () => ({
    allowManagedHooksOnly: true,
    hooks: JSON.parse(JSON.stringify(expected).replaceAll(P, command().replaceAll('"', '\\"'))),
  });
  const write = (doc: unknown, file = "managed-settings.json") =>
    fs.writeFileSync(path.join(dir, file), typeof doc === "string" ? doc : JSON.stringify(doc));
  const status = () =>
    managedHooksStatus(
      readManagedDocs({
        mainFile: path.join(dir, "managed-settings.json"),
        dropInDir: path.join(dir, "managed-settings.d"),
      }),
      spec,
    );

  beforeAll(() => {
    dir = mk("managed");
    mk("managed", "managed-settings.d");
    script = path.join(mk("install", "bin"), "codenclawed-hook.mjs");
    fs.writeFileSync(script, "// hook\n");
    spec = {
      expected,
      placeholder: P,
      hookScriptNames: ["codenclawed-hook", "codenclawed-hook.mjs"],
      managedArgs: ["--origin", "managed"],
      lockKey: "allowManagedHooksOnly",
    };
  });

  it("FP: the genuine block is installed, whatever the key order or the file split", () => {
    write(template());
    expect(status()).toMatchObject({ installed: true, code: "installed" });
    // Keys reordered, and the lock in a drop-in.
    const t = template();
    const reordered = {
      hooks: {
        SessionStart: t.hooks.SessionStart,
        PreToolUse: [{ hooks: t.hooks.PreToolUse[0].hooks, matcher: "*" }],
      },
    };
    write(reordered);
    write({ allowManagedHooksOnly: true }, "managed-settings.d/50-lock.json");
    write("not json", "managed-settings.d/.hidden.json");
    expect(status().installed).toBe(true);
    fs.rmSync(path.join(dir, "managed-settings.d", "50-lock.json"));
    fs.rmSync(path.join(dir, "managed-settings.d", ".hidden.json"));
    // A Windows-style double-quoted script path.
    expect(runsManagedHook(`"C:\\node.exe" "${script}" --origin managed`, spec)).toBe(true);
  });

  it("attack: settings that only mention the hook, or a modified copy, do not count", () => {
    write({ permissions: { deny: ["Bash(codenclawed-hook *)"] } });
    expect(status()).toMatchObject({ installed: false, code: "hook-missing" });
    write({
      $comment: "codenclawed-hook",
      hooks: {
        PreToolUse: [
          {
            matcher: "WebFetch",
            hooks: [{ type: "command", command: "codenclawed-hook --origin managed" }],
          },
        ],
      },
    });
    expect(status().code).toBe("hook-missing");
    const noBlock = template();
    delete (noBlock.hooks.PreToolUse[0].hooks[0] as Record<string, unknown>).onFailure;
    write(noBlock);
    expect(status()).toMatchObject({ installed: false, event: "PreToolUse" });
    const narrowed = template();
    narrowed.hooks.PreToolUse[0].matcher = "Bash";
    write(narrowed);
    expect(status().installed).toBe(false);
    const extra = template();
    extra.hooks.PreToolUse[0].hooks.push({ type: "command", command: "true", timeout: 1 });
    write(extra);
    expect(status().installed).toBe(false);
  });

  it("attack: a hook script that does not exist, a look-alike name, or the wrong mode does not count", () => {
    const t = (cmd: string) => {
      const d = template();
      d.hooks.PreToolUse[0].hooks[0].command = cmd;
      d.hooks.SessionStart[0].hooks[0].command = cmd;
      return d;
    };
    write(t(`/usr/bin/node '${path.join(root, "gone", "codenclawed-hook.mjs")}' --origin managed`));
    expect(status().installed).toBe(false);
    const evil = path.join(mk("evil"), "evilcodenclawed-hook.mjs");
    fs.writeFileSync(evil, "");
    write(t(`/usr/bin/node '${evil}' --origin managed`));
    expect(status().installed).toBe(false);
    write(t(`/usr/bin/node '${script}' --origin launcher`));
    expect(status().installed).toBe(false);
    write(t(`/usr/bin/node codenclawed-hook.mjs --origin managed`));
    expect(status().installed).toBe(false);
  });

  it("attack: no lock, a broken drop-in, or no managed settings at all", () => {
    const t = template();
    delete (t as Record<string, unknown>).allowManagedHooksOnly;
    write(t);
    expect(status().code).toBe("lock-missing");
    write(template());
    write("{ broken", "managed-settings.d/10-x.json");
    expect(status()).toMatchObject({ installed: false, code: "invalid-document" });
    fs.rmSync(path.join(dir, "managed-settings.d", "10-x.json"));
    expect(managedHooksStatus([], spec).code).toBe("no-managed-settings");
  });
});

// ─── Dropped settings ───────────────────────────────────────────────────

describe("dropped settings file", () => {
  const HEADER = /did not load[^\n]*including hooks/;
  const msg = (file: string) =>
    `These settings files did not load, so nothing in them is in effect, including hooks and permission rules. Each loads again once the problem listed for it is fixed:\n  ${file} ($schema): Expected string, but received number\n`;

  it("attack: the host's report naming the adapter's file fires once, even split across chunks", () => {
    const dir = mk("settings-a");
    const seen: string[] = [];
    const w = settingsDropWatcher({
      settingsDir: dir,
      header: HEADER,
      onDrop: (l) => seen.push(l),
    });
    const text = msg(path.join(dir, "settings.json"));
    const cut = text.indexOf("including") + 3;
    expect(w(text.slice(0, cut))).toBe(false);
    expect(w(text.slice(cut))).toBe(true);
    expect(w(text)).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/Expected string/);
  });

  it("FP: a dropped USER file, the directory named before the header, or no header do not fire", () => {
    const dir = mk("settings-b");
    const seen: string[] = [];
    const w = settingsDropWatcher({
      settingsDir: dir,
      header: new RegExp(HEADER.source, "g"),
      onDrop: (l) => seen.push(l),
    });
    w(`debug: using --settings ${dir}/settings.json\n`);
    w(msg(path.join(root, "home", ".claude", "settings.json")));
    expect(seen).toEqual([]);
    const w2 = settingsDropWatcher({
      settingsDir: dir,
      header: HEADER,
      onDrop: (l) => seen.push(l),
    });
    w2(`  ${dir}/settings.json: something else\n`);
    expect(seen).toEqual([]);
  });

  it("neutralized hooks keep their structure and run nothing", () => {
    const hooks = {
      PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "rm -rf /", timeout: 9 }] }],
      Stop: [{ hooks: [{ type: "prompt", prompt: "p" }] }],
      Odd: "x",
    };
    const n = neutralizeHookCommands(hooks, "true") as typeof hooks;
    expect(n.PreToolUse[0]).toEqual({
      matcher: "*",
      hooks: [{ type: "command", command: "true", timeout: 9 }],
    });
    expect(n.Stop).toEqual(hooks.Stop);
    expect(n.Odd).toBe("x");
    expect(hooks.PreToolUse[0].hooks[0].command).toBe("rm -rf /");
  });

  it("attack: prevalidation refuses the launch when the one-shot run reports the file dropped", async () => {
    const dir = mk("settings-c");
    let killed = false;
    const r = await prevalidateSettings({
      settingsDir: dir,
      header: HEADER,
      run: async ({ onStderr, deadlineMs }) => {
        expect(deadlineMs).toBe(PREVALIDATE_RUN_MS);
        if (onStderr(msg(path.join(dir, "prevalidate.json")))) {
          killed = true;
        }
        return true;
      },
    });
    expect(r).toMatchObject({ ok: false, code: "settings-dropped" });
    expect(killed).toBe(true);
  });

  it("FP: a clean run loads; a host that cannot start leaves it to the live guards", async () => {
    const dir = mk("settings-d");
    const ok = await prevalidateSettings({
      settingsDir: dir,
      header: HEADER,
      run: async ({ onStderr }) => {
        onStderr("Not logged in\n");
        return true;
      },
    });
    expect(ok).toEqual({ ok: true, code: "loaded", ran: true });
    const notRun = await prevalidateSettings({
      settingsDir: dir,
      header: HEADER,
      run: async () => false,
    });
    expect(notRun).toMatchObject({ ok: true, code: "not-run" });
    const threw = await prevalidateSettings({
      settingsDir: dir,
      header: HEADER,
      run: async () => {
        throw new Error("ENOENT");
      },
    });
    expect(threw).toMatchObject({ ok: true, code: "not-run" });
  });
});

// ─── Anchor chain ───────────────────────────────────────────────────────

describe("audit-log anchor chain", () => {
  const rec = (k: number, pad = "p") => ({
    type: "h.tool.pre",
    actor: "a",
    level: null,
    payload: { k, pad: pad.repeat(200) },
  });
  async function appendAll(log: string, recs: ReturnType<typeof rec>[], maxBytes?: number) {
    const L = new AuditLogger({ filePath: log, ...(maxBytes ? { maxBytes } : {}) });
    for (const r of recs) {
      await L.append(r);
    }
    await L.close();
  }
  const tamperOf = (f: () => void): string | null => {
    try {
      f();
      return null;
    } catch (err) {
      expect(err).toBeInstanceOf(AnchorTamper);
      return (err as AnchorTamper).reason;
    }
  };

  it("FP: appends, a genuine rotation and several rotations between checks are followed", async () => {
    const log = path.join(mk("chain-ok"), "audit.jsonl");
    await appendAll(log, [rec(0), rec(1)]);
    const chain = followChain(log);
    expect(chain.state().records).toBe(2);
    await appendAll(log, [rec(2)]);
    const a = chain.advance();
    expect(a.records).toBe(3);
    // Rotation: many records with a small segment size.
    await appendAll(
      log,
      Array.from({ length: 12 }, (_, i) => rec(100 + i, "q")),
      1500,
    );
    expect(
      fs.readdirSync(path.dirname(log)).filter((n) => /audit\.\d+\.jsonl$/.test(n)).length,
    ).toBeGreaterThan(1);
    expect(tamperOf(() => chain.advance())).toBeNull();
    // 15 records plus one segment-start record per rotation.
    expect(chain.state().records).toBeGreaterThan(15);
    const lines = fs.readFileSync(log, "utf8").trim().split("\n");
    expect(chain.state().head).toBe(JSON.parse(lines.at(-1) as string).recordHash);
  });

  it("FP: a log that does not exist yet is followed from its first record; history before the session is taken as found", async () => {
    const d = mk("chain-new");
    const log = path.join(d, "audit.jsonl");
    const chain = followChain(log);
    expect(chain.advance()).toEqual({ head: null, records: 0 });
    fs.writeFileSync(log, "garbage from before\n");
    const c2 = followChain(log);
    expect(c2.state().records).toBe(1);
  });

  it("attack: the log replaced mid-session by a fabricated chain is refused", async () => {
    const log = path.join(mk("chain-replace"), "audit.jsonl");
    await appendAll(log, [rec(0), rec(1)]);
    const chain = followChain(log);
    chain.advance();
    for (const f of [log, `${log}.head`]) {
      fs.rmSync(f, { force: true });
    }
    expect(tamperOf(() => chain.advance())).toBe("log-deleted");
    await appendAll(log, [rec(0), rec(1)]);
    expect(tamperOf(() => chain.advance())).toBe("log-replaced");
  });

  it("attack: a record rewritten in place, a truncation, or a forged appended record is refused", async () => {
    const mkLog = async (name: string) => {
      const log = path.join(mk(name), "audit.jsonl");
      await appendAll(
        log,
        [0, 1, 2, 3].map((k) => rec(k)),
      );
      const chain = followChain(log);
      chain.advance();
      return { log, chain };
    };
    const a = await mkLog("chain-rw");
    fs.writeFileSync(a.log, fs.readFileSync(a.log, "utf8").replace('"k":1', '"k":7'));
    expect(tamperOf(() => a.chain.advance())).toBe("log-rewritten");
    const b = await mkLog("chain-trunc");
    const lines = fs.readFileSync(b.log, "utf8").split("\n");
    fs.writeFileSync(b.log, `${lines.slice(0, 2).join("\n")}\n`);
    expect(tamperOf(() => b.chain.advance())).toBe("log-shrank");
    const c = await mkLog("chain-forge");
    const last = JSON.parse(fs.readFileSync(c.log, "utf8").trim().split("\n").at(-1) as string);
    fs.appendFileSync(c.log, `${JSON.stringify({ ...last, payload: { k: 99 } })}\n`);
    expect(tamperOf(() => c.chain.advance())).toBe("record-hash-mismatch");
    const d = await mkLog("chain-json");
    fs.appendFileSync(d.log, "{not json\n");
    expect(tamperOf(() => d.chain.advance())).toBe("record-not-json");
  });

  it("attack: a sealed segment rewritten before the last verified record is refused", async () => {
    const log = path.join(mk("chain-sealed"), "audit.jsonl");
    await appendAll(log, [rec(0), rec(1)]);
    const chain = followChain(log);
    chain.advance();
    await appendAll(
      log,
      Array.from({ length: 10 }, (_, i) => rec(10 + i, "q")),
      1500,
    );
    const first = path.join(path.dirname(log), "audit.1.jsonl");
    expect(fs.existsSync(first)).toBe(true);
    fs.writeFileSync(first, fs.readFileSync(first, "utf8").replace('"k":0', '"k":5'));
    expect(tamperOf(() => chain.advance())).toBe("sealed-segment-changed");
  });

  it("anchor files: deleted or rewritten is tamper; appends and the launcher's own writes are not", () => {
    const d = mk("anchor-files");
    const anchor = path.join(d, "audit.jsonl.anchor");
    const hist = path.join(d, "audit.jsonl.anchors");
    fs.writeFileSync(anchor, '{"head":"a"}');
    fs.writeFileSync(hist, "a\n");
    const g = anchorFilesGuard(anchor, hist);
    expect(tamperOf(() => g.check())).toBeNull();
    fs.appendFileSync(hist, "b\n");
    expect(tamperOf(() => g.check())).toBeNull();
    fs.writeFileSync(anchor, '{"head":"b"}');
    expect(tamperOf(() => g.check())).toBe("anchor-file-rewritten");
    g.wrote();
    expect(tamperOf(() => g.check())).toBeNull();
    fs.writeFileSync(hist, "x\n");
    expect(tamperOf(() => g.check())).toBe("history-rewritten");
    g.wrote();
    fs.rmSync(hist);
    expect(tamperOf(() => g.check())).toBe("history-deleted");
    g.wrote();
    fs.rmSync(anchor);
    expect(tamperOf(() => g.check())).toBe("anchor-file-deleted");
    // Nothing written yet: missing files are not tamper.
    const fresh = anchorFilesGuard(path.join(d, "none"), path.join(d, "none2"));
    expect(tamperOf(() => fresh.check())).toBeNull();
  });
});

// ─── Transcript watch ───────────────────────────────────────────────────

describe("transcript watch", () => {
  // A Claude-Code-like line format (the adapter's parser; the kit only tails and decides).
  const parseLine = (line: string): TranscriptLine => {
    const r = JSON.parse(line) as { message?: { content?: unknown[] } };
    const uses = [];
    const results = [];
    for (const b of (r.message?.content ?? []) as Record<string, unknown>[]) {
      if (b.type === "tool_use" && typeof b.id === "string") {
        uses.push({ id: b.id, name: typeof b.name === "string" ? b.name : null });
      } else if (b.type === "tool_result" && typeof b.tool_use_id === "string") {
        results.push({ id: b.tool_use_id, isError: b.is_error === true });
      }
    }
    return { uses, results };
  };
  const use = (id: string, name = "Bash") =>
    `${JSON.stringify({ message: { content: [{ type: "tool_use", id, name, input: { command: "ls é" } }] } })}\n`;
  const result = (id: string, isError = false) =>
    `${JSON.stringify({ message: { content: [{ type: "tool_result", tool_use_id: id, is_error: isError }] } })}\n`;

  it("tails only this session's lines, new and subagent files, split and multibyte lines", () => {
    const projects = mk("projects");
    const own = mk("projects", "-tmp-proj");
    mk("projects", "-tmp-other");
    fs.writeFileSync(path.join(own, "old.jsonl"), use("before"));
    fs.writeFileSync(path.join(projects, "-tmp-other", "x.jsonl"), "");
    const uses: string[] = [];
    const results: string[] = [];
    const w = watchTranscripts({
      dirs: () => prefixedDirs(projects, ["-tmp-proj"]),
      depth: 3,
      extension: ".jsonl",
      parseLine,
      onUse: (u) => uses.push(u.id),
      onResult: (r) => results.push(r.id),
      timer: false,
    });
    const sess = path.join(own, "s.jsonl");
    const line = use("u1");
    const cut = Buffer.from(line).indexOf(Buffer.from("é")) + 1; // inside the two-byte character
    fs.writeFileSync(sess, Buffer.from(line).subarray(0, cut));
    w.poll();
    expect(uses).toEqual([]);
    fs.appendFileSync(sess, Buffer.from(line).subarray(cut));
    fs.appendFileSync(path.join(own, "old.jsonl"), result("before"));
    const sub = mk("projects", "-tmp-proj", "s", "subagents");
    fs.writeFileSync(path.join(sub, "a.jsonl"), use("u2"));
    fs.writeFileSync(path.join(projects, "-tmp-other", "x.jsonl"), use("other"));
    w.poll();
    expect(uses.toSorted()).toEqual(["u1", "u2"]);
    expect(results).toEqual(["before"]);
    w.stop();
  });

  it("attack: a call before the handshake, or a successful call with no decision, is unchecked", () => {
    const none = { handshake: false, decided: () => false };
    expect(transcriptCallVerdict({ kind: "use", id: "t1", name: "Bash" }, none)).toMatchObject({
      verdict: "unchecked",
      code: "call-before-handshake",
    });
    expect(
      transcriptCallVerdict(
        { kind: "result", id: "t1", isError: false },
        { handshake: true, decided: () => false },
      ),
    ).toMatchObject({ verdict: "unchecked", code: "ran-without-decision" });
  });

  it("FP: an error result (refused before any hook), a decided call, or a use after the handshake", () => {
    const decided = { handshake: true, decided: (id: string) => id === "d" };
    expect(transcriptCallVerdict({ kind: "result", id: "x", isError: true }, decided).verdict).toBe(
      "ok",
    );
    expect(transcriptCallVerdict({ kind: "result", id: "d", isError: false }, decided)).toEqual({
      verdict: "check-decision",
      id: "d",
    });
    expect(transcriptCallVerdict({ kind: "use", id: "x", name: null }, decided).verdict).toBe("ok");
    expect(
      transcriptCallVerdict(
        { kind: "use", id: "d", name: null },
        { handshake: false, decided: (id) => id === "d" },
      ).verdict,
    ).toBe("ok");
  });
});
