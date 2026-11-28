// An MCP tool runs with no person only when its server's signed admission
// record makes it read-only (contained, no folder it may write, no network
// destination, no secret), never because the server says so in its tool
// annotations (mcp-poison-annotation-lie).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEVEL, makeLabel } from "../classification.js";
import { HistoryStore } from "../history-store.js";
import { pinMcpToolDefinitions } from "../mcp-tool-pins.js";
import { createPolicy } from "../policy.js";
import { decidePreAction, type EngineOptions } from "./engine.js";
import { nodeFsProbe } from "./fs-probe.js";
import { McpSession, type McpAdmissionRecord } from "./mcp.js";
import type { PreActionEvent } from "./types.js";

let root: string;
beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-mcp-readonly-")));
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// The tool claims to be read-only in its annotations; nothing Enclawed decides reads them.
const TOOL = {
  name: "list_cache",
  description: "List the cache.",
  annotations: { readOnlyHint: true, destructiveHint: false },
  inputSchema: { type: "object", properties: { dir: { type: "string" } } },
};

function opts(containment: McpAdmissionRecord["containment"]): EngineOptions {
  const policy = createPolicy({
    enforceAllowlists: false,
    maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
  });
  const record: McpAdmissionRecord = {
    name: "cache",
    identity: { type: "stdio", definitionDigest: "d" },
    tools: pinMcpToolDefinitions([TOOL]),
    ...(containment ? { containment } : {}),
  };
  return {
    host: "test-host",
    policy,
    projectDir: root,
    hardware: () => ({ allowed: true }),
    history: { store: new HistoryStore({ dir: path.join(root, "h"), limits: policy.history }) },
    fs: nodeFsProbe(),
    mcp: new McpSession([{ name: "cache", scope: "user", normalized: "cache", record }]),
  };
}

const call = (route: PreActionEvent["approvalRoute"] = "no-person"): PreActionEvent => ({
  type: "pre-action",
  actor: { sessionId: "s", subagentId: null },
  callId: "c",
  tool: "mcp__cache__list_cache",
  policyIds: ["mcp__cache__list_cache"],
  kind: "mcp",
  mcp: { server: "cache", tool: "list_cache" },
  params: { dir: "notes" },
  cwd: root,
  approvalRoute: route,
  hostMode: route === "no-person" ? "bypassPermissions" : "default",
});

describe("MCP tools read-only by the signed record", () => {
  it("a server contained with read-only folders, no destination and no secret runs with no person, even headless", async () => {
    const d = await decidePreAction(
      call(),
      opts({ roots: [{ path: root, access: "ro" }], programs: ["git"] }),
    );
    expect(d.outcome).toBe("allow");
    expect(d.codes).toEqual(["mcp-contained-read-only"]);
  });

  it("annotations do not count: a folder it may write, a destination, a secret or no containment keeps the old rule", async () => {
    for (const c of [
      { roots: [{ path: root, access: "rw" as const }] },
      {
        roots: [{ path: root, access: "ro" as const }],
        destinations: [{ host: "127.0.0.1", port: 9, mode: "http" as const }],
      },
      {
        roots: [{ path: root, access: "ro" as const }],
        secrets: [{ name: "TOKEN", destinations: ["api.example"] }],
      },
      undefined,
    ]) {
      const d = await decidePreAction(call(), opts(c as McpAdmissionRecord["containment"]));
      expect(d.outcome, JSON.stringify(c)).toBe("deny");
      expect(d.codes, JSON.stringify(c)).toContain("mcp-tool");
    }
  });

  it("a credential in the arguments is still refused first", async () => {
    const ev = { ...call(), params: { dir: ["AKIA", "ABCDEFGHIJKLMNOP"].join("") } };
    const d = await decidePreAction(ev, opts({ roots: [{ path: root, access: "ro" }] }));
    expect(d.codes).toEqual(["secret-in-arguments"]);
  });
});
