// MCP admission fixes found while switching codenclawed onto the kit: a
// pinned package runner is admitted on its package pin (npx is itself a Node
// script, which must not be asked for a tree pin of its own), deno's remote
// entries and Windows runner names are resolved like the others, and account
// connectors are admitted only by the operator's list.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { codeResolution } from "./mcp-package-pins.js";
import {
  admitMcpServers,
  McpSession,
  mcpDefinitionDigest,
  type McpCandidate,
  type McpServerDefinition,
} from "./mcp.js";
import { pinMcpServer, signedMcpPinStore } from "./trust.js";

let root: string;
beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-mcp-fixes-")));
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("pinned package runners", () => {
  it("false positive: an npx server pinned by its package starts, though npx itself is a Node script in a package", async () => {
    // A stand-in npx: a Node script inside an npm-like package directory.
    const npmDir = path.join(root, "npm");
    fs.mkdirSync(path.join(npmDir, "bin"), { recursive: true });
    fs.writeFileSync(path.join(npmDir, "package.json"), '{"name":"npm"}');
    fs.writeFileSync(path.join(npmDir, "bin", "npx"), "#!/usr/bin/env node\n", { mode: 0o755 });
    const def: McpServerDefinition = {
      command: path.join(npmDir, "bin", "npx"),
      args: ["-y", "some-mcp@1.2.3"],
    };
    const pin = {
      kind: "npm",
      name: "some-mcp",
      version: "1.2.3",
      integrity: "sha512-abc",
    } as const;
    const dir = path.join(root, "pins");
    const trustDir = path.join(root, "trust");
    await pinMcpServer(
      { dir, trustDir, builtinToolNames: [], authorize: async () => {} },
      {
        name: "srv",
        scope: "project",
        source: ".mcp.json",
        definitionDigest: mcpDefinitionDigest(def),
        executable: null,
        executableSha256: null,
        serverInfo: { name: "srv", version: "1" },
        tools: [{ name: "t", description: "t", inputSchema: { type: "object" } }],
        code: pin,
      },
    );
    const cand: McpCandidate = {
      name: "srv",
      scope: "project",
      source: ".mcp.json",
      definitionDigest: mcpDefinitionDigest(def),
      executableSha256: null,
      definition: def,
      code: pin,
      cwd: root,
      pathVar: process.env.PATH ?? "",
    };
    const r = admitMcpServers([cand], signedMcpPinStore({ dir, trustDir }).load().records, {
      builtinToolNames: [],
    });
    expect(r.ok && r.admitted.map((a) => a.name)).toEqual(["srv"]);
    // Attack: another version than the pin is still refused.
    const other = admitMcpServers(
      [{ ...cand, code: { ...pin, version: "1.2.4" } }],
      signedMcpPinStore({ dir, trustDir }).load().records,
      { builtinToolNames: [] },
    );
    expect(other.ok && other.admitted).toEqual([]);
  });

  it("attack: deno running a URL, npm: or jsr: entry is unpinned; Windows runner names are runners", () => {
    for (const e of ["https://x.example/mod.ts", "npm:pkg", "jsr:@a/b"]) {
      expect(codeResolution({ command: "deno", args: ["run", "-A", e] }).kind, e).toBe("unpinned");
    }
    expect(codeResolution({ command: "deno", args: ["run", "./local.ts"] }).kind).toBe("static");
    expect(codeResolution({ command: "C:\\nodejs\\npx.cmd", args: ["-y", "pkg"] }).kind).toBe(
      "unpinned",
    );
    expect(codeResolution({ command: "npx.exe", args: ["-y", "pkg@1.0.0"] }).kind).toBe(
      "pinned-form",
    );
  });
});

describe("account connectors", () => {
  const isConnector = (s: string) => s.startsWith("claude_ai_");
  it("attack: a connector tool the policy does not list is refused; FP: a listed one, or every tool of a listed connector, runs", () => {
    const s = new McpSession([], {
      connectors: [
        { server: "claude_ai_Gmail", tools: ["search"] },
        { server: "claude_ai_Drive", tools: ["*"] },
      ],
      connectorServer: isConnector,
    });
    expect(s.verdict("claude_ai_Gmail", "send")?.code).toBe("mcp-connector-not-allowed");
    expect(s.verdict("claude_ai_Calendar", "list")?.code).toBe("mcp-connector-not-allowed");
    expect(s.verdict("claude_ai_Gmail", "search")).toBeNull();
    expect(s.verdict("claude_ai_Drive", "anything")).toBeNull();
    // An ordinary server is still decided by its admission.
    expect(s.verdict("github", "x")?.code).toBe("mcp-server-not-admitted");
  });
});
