import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wrapToolWithBeforeToolCallHook } from "../agents/pi-tools.before-tool-call.js";
import type { AnyAgentTool } from "../agents/tools/common.js";
import { callGatewayTool } from "../agents/tools/gateway.js";
import { projectSnapshotPlan } from "./adapter/contained-exec.js";
import { resetAgentToolGuardForTest } from "./agent-tool-guard.js";
import { makeLabel, LEVEL } from "./classification.js";
import { prepareFsWriteHistory, resetFsReversibilityForTest } from "./fs-reversibility.js";
import { pathMatchesEntry } from "./history-paths.js";
import { RestoreError, restoreSnapshot } from "./history-restore.js";
import { HistoryStore, sha256Hex } from "./history-store.js";
import { createPolicy, DEFAULT_HISTORY_POLICY } from "./policy.js";
import { clearRuntime, setRuntime, type EnclawedRuntime } from "./runtime.js";

vi.mock("../agents/tools/gateway.js", () => ({ callGatewayTool: vi.fn() }));
const mockGateway = vi.mocked(callGatewayTool);

type AuditRecord = { type: string; actor: string; payload: Record<string, unknown> };

let root: string;
let workspace: string;
let scratch: string;
let outside: string;
let historyDir: string;
const savedHistoryEnv = process.env.ENCLAWED_HISTORY_DIR;

function installRuntime(
  opts: {
    flavor?: "open" | "enclaved";
    history?: Partial<{
      maxFileBytes: number;
      maxTotalBytes: number;
      noHistoryPaths: string[];
      noHistoryTools: string[];
    }>;
    preApproved?: string[];
  } = {},
): AuditRecord[] {
  const records: AuditRecord[] = [];
  setRuntime({
    flavor: opts.flavor ?? "enclaved",
    policy: createPolicy({
      enforceAllowlists: false,
      preApprovedIrreversibleTools: opts.preApproved,
      scratchPaths: [scratch],
      history: opts.history,
      maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
      defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    }),
    audit: {
      append: async (r: AuditRecord) => {
        records.push(r);
      },
    },
    restoreFetch: () => {},
    fipsRequired: false,
    moduleDecisions: null,
  } as unknown as EnclawedRuntime);
  return records;
}

function answerApproval(decision: string) {
  mockGateway.mockImplementation((async (method: string) =>
    method === "plugin.approval.request"
      ? { id: "plugin:1" }
      : { id: "plugin:1", decision }) as unknown as typeof callGatewayTool);
}

/** A file tool that really writes, so tests can see whether it ran. */
function fileTool(name: "write" | "edit" | "apply_patch", fsRoot: string | null = workspace) {
  const execute = vi.fn(async (_id: string, params: Record<string, unknown>) => {
    if (name === "write") {
      fs.writeFileSync(path.resolve(workspace, String(params.path)), String(params.content));
    }
    return { content: [], details: {} };
  });
  const tool = wrapToolWithBeforeToolCallHook({ name, execute } as unknown as AnyAgentTool, {
    agentId: "main",
    sessionKey: "s1",
    ...(fsRoot ? { fsRoot } : {}),
  });
  return { tool, execute };
}

const run = (tool: AnyAgentTool, params: Record<string, unknown>) =>
  tool.execute("call-1", params, undefined, undefined);

function git(...args: string[]) {
  execFileSync(
    "git",
    ["-C", workspace, "-c", "user.email=t@example.com", "-c", "user.name=t", ...args],
    {
      stdio: "ignore",
    },
  );
}

const store = () => new HistoryStore({ dir: historyDir, limits: DEFAULT_HISTORY_POLICY });

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-fsrev-")));
  workspace = path.join(root, "ws");
  scratch = path.join(root, "scratch");
  outside = path.join(root, "outside");
  historyDir = path.join(root, "history");
  for (const d of [workspace, scratch, outside]) {
    fs.mkdirSync(d);
  }
  process.env.ENCLAWED_HISTORY_DIR = historyDir;
  mockGateway.mockReset();
});

afterEach(() => {
  clearRuntime();
  resetAgentToolGuardForTest();
  resetFsReversibilityForTest();
  if (savedHistoryEnv === undefined) {
    delete process.env.ENCLAWED_HISTORY_DIR;
  } else {
    process.env.ENCLAWED_HISTORY_DIR = savedHistoryEnv;
  }
  fs.rmSync(root, { recursive: true, force: true });
});

describe("file writes are reversible by default when their history is kept", () => {
  it("snapshots the prior content, audits hash and path, then writes without asking", async () => {
    const records = installRuntime();
    fs.writeFileSync(path.join(workspace, "a.txt"), "before");
    const { tool, execute } = fileTool("write");
    await run(tool, { path: "a.txt", content: "after" });
    expect(execute).toHaveBeenCalledOnce();
    expect(mockGateway).not.toHaveBeenCalled();
    const hash = sha256Hex(Buffer.from("before"));
    expect(fs.readFileSync(path.join(historyDir, "objects", hash), "utf8")).toBe("before");
    const rec = records.find((r) => r.type === "tool.reversible.history");
    expect(rec?.payload).toMatchObject({
      tool: "write",
      capability: "fs.write.rev",
      targets: [
        {
          path: "a.txt",
          realPath: path.join(workspace, "a.txt"),
          reversible: true,
          basis: "snapshot",
          snapshot: hash,
        },
      ],
    });
  });

  it("records a new file's absent prior state", async () => {
    installRuntime();
    const { tool, execute } = fileTool("write");
    await run(tool, { path: "new.txt", content: "x" });
    expect(execute).toHaveBeenCalledOnce();
    const entries = await store().list();
    expect(entries).toMatchObject([{ op: "write", hash: null, path: "new.txt" }]);
  });

  it("keeps a snapshot for a tracked file with uncommitted changes", async () => {
    installRuntime();
    git("init", "-q");
    fs.writeFileSync(path.join(workspace, "t.txt"), "committed");
    git("add", "t.txt");
    git("commit", "-q", "-m", "init");
    fs.writeFileSync(path.join(workspace, "t.txt"), "dirty");
    const outcome = await prepareFsWriteHistory({
      tool: "edit",
      targets: [{ path: "t.txt", absPath: path.join(workspace, "t.txt"), op: "edit" }],
      fsRoot: workspace,
      policy: createPolicy({
        maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
        defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
      }),
      store: store(),
      gatewayTmpDir: null,
    });
    expect(outcome.targets[0]).toMatchObject({ reversible: true, basis: "snapshot" });
  });

  it("treats a git-clean tracked file as reversible when no snapshot fits", async () => {
    const records = installRuntime({ history: { maxFileBytes: 4 } });
    git("init", "-q");
    fs.writeFileSync(path.join(workspace, "big.txt"), "larger than four bytes");
    git("add", "big.txt");
    git("commit", "-q", "-m", "init");
    const { tool, execute } = fileTool("write");
    await run(tool, { path: "big.txt", content: "y" });
    expect(execute).toHaveBeenCalledOnce();
    expect(mockGateway).not.toHaveBeenCalled();
    const rec = records.find((r) => r.type === "tool.reversible.history");
    expect((rec?.payload.targets as Array<Record<string, unknown>>)[0]).toMatchObject({
      basis: "git-clean",
      snapshot: null,
    });
  });

  it("needs no history inside a scratch location, even one listed as no-history", async () => {
    installRuntime({ history: { noHistoryPaths: [scratch], noHistoryTools: ["write"] } });
    fs.writeFileSync(path.join(scratch, "s.txt"), "old");
    const { tool, execute } = fileTool("write");
    await run(tool, { path: path.join(scratch, "s.txt"), content: "new" });
    expect(execute).toHaveBeenCalledOnce();
    expect(mockGateway).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(historyDir, "objects"))).toBe(false);
  });

  it("treats the gateway temp directory as scratch", async () => {
    const outcome = await prepareFsWriteHistory({
      tool: "write",
      targets: [{ path: "x", absPath: path.join(scratch, "x"), op: "write" }],
      policy: createPolicy({
        maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
        defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
      }),
      store: store(),
      gatewayTmpDir: scratch,
    });
    expect(outcome.targets[0]).toMatchObject({ reversible: true, basis: "scratch" });
  });

  it("snapshots the content apply_patch deletes", async () => {
    const records = installRuntime();
    fs.writeFileSync(path.join(workspace, "gone.txt"), "deleted content");
    const { tool, execute } = fileTool("apply_patch");
    await run(tool, { input: "*** Begin Patch\n*** Delete File: gone.txt\n*** End Patch" });
    expect(execute).toHaveBeenCalledOnce();
    const hash = sha256Hex(Buffer.from("deleted content"));
    expect(await store().readVerified(hash)).toEqual(Buffer.from("deleted content"));
    expect(records.find((r) => r.type === "tool.reversible.history")?.payload).toMatchObject({
      targets: [{ op: "delete", snapshot: hash }],
    });
  });
});

describe("writes with no recoverable history wait for a person", () => {
  it("prompts when the snapshot is over the size cap, and audits why", async () => {
    const records = installRuntime({ history: { maxFileBytes: 4 } });
    fs.writeFileSync(path.join(workspace, "big.txt"), "larger than four bytes");
    answerApproval("deny");
    const { tool, execute } = fileTool("write");
    await expect(run(tool, { path: "big.txt", content: "y" })).rejects.toThrow(/not approved/);
    expect(execute).not.toHaveBeenCalled();
    expect(records.find((r) => r.type === "tool.irreversible.request")?.payload).toMatchObject({
      capability: "fs.write.irrev",
      noHistory: [{ path: "big.txt", reversible: false, code: "over-size-cap" }],
    });
  });

  it("prompts when the snapshot would exceed the retention budget", async () => {
    const records = installRuntime({ history: { maxTotalBytes: 4 } });
    fs.writeFileSync(path.join(workspace, "a.txt"), "more than four");
    answerApproval("allow-once");
    const { tool, execute } = fileTool("write");
    await run(tool, { path: "a.txt", content: "y" });
    expect(mockGateway).toHaveBeenCalled();
    expect(execute).toHaveBeenCalledOnce();
    expect(records.find((r) => r.type === "tool.irreversible.request")?.payload).toMatchObject({
      noHistory: [{ code: "over-retention-budget" }],
    });
  });

  it("prompts for a path the operator opted out of history", async () => {
    const records = installRuntime({ history: { noHistoryPaths: [`${workspace}/data/**`] } });
    fs.mkdirSync(path.join(workspace, "data"));
    fs.writeFileSync(path.join(workspace, "data", "set.bin"), "rows");
    answerApproval("deny");
    const { tool, execute } = fileTool("write");
    await expect(run(tool, { path: "data/set.bin", content: "y" })).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
    expect(records.find((r) => r.type === "tool.irreversible.request")?.payload).toMatchObject({
      noHistory: [{ code: "no-history-path" }],
    });
    expect(fs.existsSync(path.join(historyDir, "objects"))).toBe(false);
  });

  it("prompts for a tool the operator opted out of history", async () => {
    const records = installRuntime({ history: { noHistoryTools: ["edit"] } });
    fs.writeFileSync(path.join(workspace, "a.txt"), "x");
    answerApproval("deny");
    const { tool } = fileTool("edit");
    await expect(run(tool, { path: "a.txt", edits: [] })).rejects.toThrow();
    expect(records.find((r) => r.type === "tool.irreversible.request")?.payload).toMatchObject({
      noHistory: [{ code: "no-history-tool" }],
    });
  });

  it("prompts when apply_patch mixes a reversible and an irreversible path", async () => {
    installRuntime();
    fs.writeFileSync(path.join(workspace, "in.txt"), "a\n");
    answerApproval("deny");
    const { tool, execute } = fileTool("apply_patch");
    const patch = [
      "*** Begin Patch",
      "*** Add File: in2.txt",
      "+hello",
      `*** Add File: ${path.join(outside, "x.txt")}`,
      "+escape",
      "*** End Patch",
    ].join("\n");
    await expect(run(tool, { input: patch })).rejects.toThrow(/not approved/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("prompts for a caller with no host root and no file bridge", async () => {
    const records = installRuntime();
    answerApproval("deny");
    const { tool, execute } = fileTool("write", null);
    await expect(run(tool, { path: "a.txt", content: "y" })).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
    expect(records.find((r) => r.type === "tool.irreversible.request")?.payload).toMatchObject({
      noHistory: [{ code: "no-file-bridge" }],
    });
  });

  it("runs a pre-approved tool without a prompt but still audits the missing history", async () => {
    const records = installRuntime({ history: { maxFileBytes: 1 }, preApproved: ["write"] });
    fs.writeFileSync(path.join(workspace, "a.txt"), "xyz");
    const { tool, execute } = fileTool("write");
    await run(tool, { path: "a.txt", content: "y" });
    expect(execute).toHaveBeenCalledOnce();
    expect(mockGateway).not.toHaveBeenCalled();
    expect(records.at(-1)).toMatchObject({
      type: "tool.irreversible.decision",
      payload: { decision: "pre-approved", noHistory: [{ code: "over-size-cap" }] },
    });
  });

  it("leaves the open flavor unchanged: no snapshot, no prompt", async () => {
    const records = installRuntime({ flavor: "open" });
    fs.writeFileSync(path.join(workspace, "a.txt"), "before");
    const { tool, execute } = fileTool("write");
    await run(tool, { path: "a.txt", content: "after" });
    expect(execute).toHaveBeenCalledOnce();
    expect(records).toEqual([]);
    expect(fs.existsSync(historyDir)).toBe(false);
  });
});

describe("enclawed history restore", () => {
  it("verifies the hash, restores, keeps what it replaced, and audits", async () => {
    const records = installRuntime();
    fs.writeFileSync(path.join(workspace, "a.txt"), "before");
    await run(fileTool("write").tool, { path: "a.txt", content: "after" });
    const hash = sha256Hex(Buffer.from("before"));
    const result = await restoreSnapshot({ hash, store: store() });
    expect(result.to).toBe(path.join(workspace, "a.txt"));
    expect(fs.readFileSync(result.to, "utf8")).toBe("before");
    expect(result.replacedSnapshot).toBe(sha256Hex(Buffer.from("after")));
    expect(records.at(-1)).toMatchObject({
      type: "history.restore",
      payload: { hash, outcome: "restored", to: result.to },
    });
  });

  it("a symbolic link's history is the link itself: restore makes it again, following nothing", async () => {
    const records = installRuntime();
    const link = path.join(workspace, "cfg");
    // A dangling target: restore must recreate the text, never resolve it.
    fs.symlinkSync("../nowhere/settings.json", link);
    const plan = projectSnapshotPlan(workspace, new Map(), {
      maxFiles: 100,
      maxBytes: 1 << 20,
      maxFileBytes: 1 << 20,
    });
    expect(plan.ok && plan.links).toEqual([{ path: link, target: "../nowhere/settings.json" }]);
    const st = store();
    const put = await st.put(Buffer.from("../nowhere/settings.json"));
    expect(put.ok).toBe(true);
    const hash = put.ok ? put.hash : "";
    await st.record({
      path: link,
      realPath: link,
      op: "write",
      hash,
      size: 24,
      tool: "exec",
      toolCallId: null,
      agentId: null,
      kind: "symlink",
    });
    // The run replaced the link by a file.
    fs.rmSync(link);
    fs.writeFileSync(link, "replaced");
    const result = await restoreSnapshot({ hash, store: st });
    expect(result.to).toBe(link);
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(link)).toBe("../nowhere/settings.json");
    expect(result.replacedSnapshot).toBe(sha256Hex(Buffer.from("replaced")));
    expect(records.at(-1)).toMatchObject({ payload: { outcome: "restored", kind: "symlink" } });
  });

  it("refuses a tampered snapshot and audits the refusal", async () => {
    const records = installRuntime();
    fs.writeFileSync(path.join(workspace, "a.txt"), "before");
    await run(fileTool("write").tool, { path: "a.txt", content: "after" });
    const hash = sha256Hex(Buffer.from("before"));
    fs.writeFileSync(path.join(historyDir, "objects", hash), "evil");
    await expect(restoreSnapshot({ hash, store: store() })).rejects.toMatchObject({
      code: "tampered",
    });
    expect(fs.readFileSync(path.join(workspace, "a.txt"), "utf8")).toBe("after");
    expect(records.at(-1)).toMatchObject({
      type: "history.restore",
      payload: { outcome: "refused", code: "tampered" },
    });
  });

  it("refuses to restore when the audit log is unavailable", async () => {
    await expect(restoreSnapshot({ hash: "0".repeat(64), store: store() })).rejects.toBeInstanceOf(
      RestoreError,
    );
  });

  it("prunes snapshots past the age limit", async () => {
    let now = Date.now();
    const s = new HistoryStore({
      dir: historyDir,
      limits: { ...DEFAULT_HISTORY_POLICY, maxAgeDays: 8 },
      now: () => now,
    });
    const put = await s.put(Buffer.from("old"));
    expect(put.ok).toBe(true);
    await s.record({
      path: "p",
      realPath: "/p",
      op: "write",
      hash: put.ok ? put.hash : null,
      size: 3,
      tool: "write",
      toolCallId: null,
      agentId: null,
    });
    now += 9 * 24 * 60 * 60 * 1000;
    expect(await s.prune()).toEqual({ removedEntries: 1, removedObjects: 1 });
    expect(await s.list()).toEqual([]);
  });
});

describe("no-history path matching", () => {
  it("matches plain prefixes and * / ** globs", () => {
    expect(pathMatchesEntry("/data/sets/a.bin", "/data")).toBe(true);
    expect(pathMatchesEntry("/database/a", "/data")).toBe(false);
    expect(pathMatchesEntry("/data/sets/a.bin", "/data/**")).toBe(true);
    expect(pathMatchesEntry("/data/a.bin", "/data/*.bin")).toBe(true);
    expect(pathMatchesEntry("/data/x/a.bin", "/data/*.bin")).toBe(false);
    expect(pathMatchesEntry("/build/out/deep/f", "/build/*")).toBe(true);
  });
});

/** An in-memory sandbox file bridge rooted at /workspace. */
function fakeSandbox(sandboxRoot: string) {
  const files = new Map<string, Buffer>();
  const toContainer = (filePath: string, cwd?: string) => {
    const rel = path.relative(cwd ?? sandboxRoot, path.resolve(cwd ?? sandboxRoot, filePath));
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`path escapes sandbox: ${filePath}`);
    }
    return path.posix.join("/workspace", rel.split(path.sep).join("/"));
  };
  let failReads = false;
  const bridge = {
    files,
    failReads: (v: boolean) => {
      failReads = v;
    },
    resolvePath: ({ filePath, cwd }: { filePath: string; cwd?: string }) => ({
      containerPath: toContainer(filePath, cwd),
    }),
    readFile: async ({ filePath, cwd }: { filePath: string; cwd?: string }) => {
      if (failReads) {
        throw new Error("container exec failed");
      }
      const buf = files.get(toContainer(filePath, cwd));
      if (!buf) {
        throw new Error("ENOENT");
      }
      return buf;
    },
    stat: async ({ filePath, cwd }: { filePath: string; cwd?: string }) => {
      const buf = files.get(toContainer(filePath, cwd));
      return buf ? { type: "file" as const, size: buf.length } : null;
    },
    writeFile: async ({
      filePath,
      cwd,
      data,
    }: {
      filePath: string;
      cwd?: string;
      data: Buffer | string;
    }) => {
      files.set(toContainer(filePath, cwd), Buffer.from(data));
    },
  };
  return bridge;
}

function sandboxedWrite(bridge: ReturnType<typeof fakeSandbox>, sandboxRoot: string) {
  const execute = vi.fn(async (_id: string, params: Record<string, unknown>) => {
    await bridge.writeFile({
      filePath: String(params.path),
      cwd: sandboxRoot,
      data: String(params.content),
    });
    return { content: [], details: {} };
  });
  const tool = wrapToolWithBeforeToolCallHook(
    { name: "write", execute } as unknown as AnyAgentTool,
    {
      agentId: "main",
      sessionKey: "s1",
      fsSandbox: {
        ref: { backendId: "docker", runtimeId: "enclawed-sbx-main", sessionKey: "agent:main:s1" },
        root: sandboxRoot,
        files: bridge,
      },
    },
  );
  return { tool, execute };
}

describe("sandboxed file tools keep history through the sandbox file bridge", () => {
  it("snapshots through the bridge, then writes without asking", async () => {
    const records = installRuntime();
    const bridge = fakeSandbox(workspace);
    bridge.files.set("/workspace/a.txt", Buffer.from("in sandbox"));
    const { tool, execute } = sandboxedWrite(bridge, workspace);
    await run(tool, { path: "a.txt", content: "changed" });
    expect(execute).toHaveBeenCalledOnce();
    expect(mockGateway).not.toHaveBeenCalled();
    const hash = sha256Hex(Buffer.from("in sandbox"));
    expect(records.find((r) => r.type === "tool.reversible.history")?.payload).toMatchObject({
      targets: [
        {
          basis: "snapshot",
          snapshot: hash,
          sandbox: {
            backendId: "docker",
            runtimeId: "enclawed-sbx-main",
            containerPath: "/workspace/a.txt",
          },
        },
      ],
    });
    expect((await store().list())[0]).toMatchObject({
      hash,
      sandbox: { runtimeId: "enclawed-sbx-main", containerPath: "/workspace/a.txt" },
    });
  });

  it("prompts when the bridge cannot read the target", async () => {
    const records = installRuntime();
    const bridge = fakeSandbox(workspace);
    bridge.files.set("/workspace/a.txt", Buffer.from("x"));
    bridge.failReads(true);
    answerApproval("deny");
    const { tool, execute } = sandboxedWrite(bridge, workspace);
    await expect(run(tool, { path: "a.txt", content: "y" })).rejects.toThrow(/not approved/);
    expect(execute).not.toHaveBeenCalled();
    expect(records.find((r) => r.type === "tool.irreversible.request")?.payload).toMatchObject({
      noHistory: [{ code: "sandbox-read-failed" }],
    });
  });

  it("restores into the sandbox the snapshot came from", async () => {
    const records = installRuntime();
    const bridge = fakeSandbox(workspace);
    bridge.files.set("/workspace/a.txt", Buffer.from("original"));
    await run(sandboxedWrite(bridge, workspace).tool, { path: "a.txt", content: "changed" });
    const hash = sha256Hex(Buffer.from("original"));
    const opened: string[] = [];
    const result = await restoreSnapshot({
      hash,
      store: store(),
      openSandbox: async (origin) => {
        opened.push(origin.runtimeId);
        return bridge;
      },
    });
    expect(opened).toEqual(["enclawed-sbx-main"]);
    expect(bridge.files.get("/workspace/a.txt")?.toString()).toBe("original");
    expect(result).toMatchObject({
      to: "/workspace/a.txt",
      sandbox: { runtimeId: "enclawed-sbx-main" },
      replacedSnapshot: sha256Hex(Buffer.from("changed")),
    });
    expect(fs.existsSync(path.join(workspace, "a.txt"))).toBe(false);
    expect(records.at(-1)).toMatchObject({
      type: "history.restore",
      payload: { outcome: "restored", sandbox: { runtimeId: "enclawed-sbx-main" } },
    });
  });

  it("refuses when that sandbox is gone, and --to restores on the host instead", async () => {
    const records = installRuntime();
    const bridge = fakeSandbox(workspace);
    bridge.files.set("/workspace/a.txt", Buffer.from("original"));
    await run(sandboxedWrite(bridge, workspace).tool, { path: "a.txt", content: "changed" });
    const hash = sha256Hex(Buffer.from("original"));
    await expect(
      restoreSnapshot({ hash, store: store(), openSandbox: async () => null }),
    ).rejects.toMatchObject({ code: "sandbox-missing", message: /--to <host path>/ });
    expect(records.at(-1)).toMatchObject({
      type: "history.restore",
      payload: { outcome: "refused", code: "sandbox-missing" },
    });
    const hostCopy = path.join(outside, "recovered.txt");
    const result = await restoreSnapshot({
      hash,
      to: hostCopy,
      store: store(),
      openSandbox: async () => null,
    });
    expect(result.sandbox).toBeNull();
    expect(fs.readFileSync(hostCopy, "utf8")).toBe("original");
  });
});
