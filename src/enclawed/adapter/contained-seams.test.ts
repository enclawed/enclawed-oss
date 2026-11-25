// The kit's seams onto containment v2: remote MCP servers through Enclawed's
// own transport with the signed remote record and the egress pipeline on
// every call body; installs only as caged package installs; containment
// events as audit records.

import type { EgressRunner } from "@enclawed/egress-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RemoteConnect } from "../containment/remote-mcp.js";
import { startStandIns, type Recorded } from "../containment/test-helpers.js";
import { containmentAuditOf, scriptContainer } from "./contained-launch.js";
import { connectRemoteMcpServer, isRemoteRecord, RemoteCallRefused } from "./remote-launch.js";

const URL_ = "https://mcp.remote.test/mcp";
let stand: Awaited<ReturnType<typeof startStandIns>>;
const calls: unknown[] = [];

beforeAll(async () => {
  stand = await startStandIns({
    "mcp.remote.test": (r: Recorded) => {
      const msg = JSON.parse(r.body || "{}") as { id?: number; method?: string; params?: unknown };
      if (msg.method === "tools/call") {
        calls.push(msg.params);
      }
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: msg.id ?? 0, result: { ok: true } }),
      };
    },
  });
});
afterAll(() => stand.close());

const def = { name: "remote", type: "http", url: URL_ };
const record = { url: URL_, transport: "streamable-http" } as const;
const runner = (f: (c: string) => Awaited<ReturnType<EgressRunner>>): EgressRunner =>
  Object.assign(async (c: string) => f(c), {
    audit: {} as EgressRunner["audit"],
    config: {} as EgressRunner["config"],
  });

describe("remote MCP servers", () => {
  it("attack: a remote server with no signed remote part, or another URL or transport, is not connected", () => {
    expect(connectRemoteMcpServer(def, null)).toMatchObject({
      ok: false,
      code: "mcp-remote-not-admitted",
    });
    expect(
      connectRemoteMcpServer(def, { url: "https://other.test/mcp", transport: "streamable-http" }),
    ).toMatchObject({ ok: false, code: "mcp-remote-url-mismatch" });
    expect(connectRemoteMcpServer(def, { url: URL_, transport: "sse" })).toMatchObject({
      ok: false,
      code: "mcp-remote-url-mismatch",
    });
    expect(
      connectRemoteMcpServer(
        { ...def, url: "http://mcp.remote.test/mcp" },
        { ...record, url: "http://mcp.remote.test/mcp" },
      ),
    ).toMatchObject({
      ok: false,
      code: "remote-scheme-refused",
    });
    expect(
      isRemoteRecord({
        url: URL_,
        transport: "streamable-http",
        authorizationOrigins: ["file:///x"],
      }),
    ).toBe(false);
  });

  it("attack: a call body the egress pipeline cancels is never sent", async () => {
    const c = connectRemoteMcpServer(def, record, {
      connect: stand.upstream as RemoteConnect,
      egressRunner: runner(() => ({ cancelled: true, reason: "secret", findings: [], delayMs: 0 })),
    });
    expect(c.ok).toBe(true);
    if (!c.ok) {
      return;
    }
    const before = calls.length;
    await expect(
      c.callTool({ callId: "1", tool: "send", arguments: { body: "AKIA..." } }),
    ).rejects.toMatchObject({ code: "egress-pipeline-cancelled" });
    expect(RemoteCallRefused.name).toBe("RemoteCallRefused");
    expect(calls.length).toBe(before);
  });

  it("false positive: an admitted remote server's call goes out, as the pipeline passed or rewrote it", async () => {
    const c = connectRemoteMcpServer(def, record, {
      connect: stand.upstream as RemoteConnect,
      egressRunner: runner((content) => ({
        cancelled: false,
        content: content.replace("raw", "clean"),
        findings: [],
        delayMs: 0,
      })),
    });
    if (!c.ok) {
      throw new Error(c.message);
    }
    await c.client.initialize();
    await c.callTool({ callId: "2", tool: "echo", arguments: { text: "raw" } });
    expect(calls.at(-1)).toEqual({ name: "echo", arguments: { text: "clean" } });
    c.client.close();
  });
});

describe("installs and containment events", () => {
  it("attack: an install that names no package manager is refused (never run as a plain script)", async () => {
    const s = scriptContainer({ stateDir: "/nonexistent" });
    const r = await s.contain({
      kind: "package-install",
      label: "install",
      command: "npm install x",
      dialect: "posix",
      cwd: "/tmp",
      projectDir: "/tmp",
      tool: null,
    });
    expect(r).toMatchObject({ ok: false, code: "containment-declaration-invalid" });
    expect(r.ok ? "" : r.message).toMatch(/names no package manager/);
    await s.close();
  });

  it("containment and relay events become audit records with a closed type", () => {
    expect(
      containmentAuditOf({
        type: "refused",
        code: "containment-view-changed",
        message: "m",
        frozen: true,
        changed: ["/p/.git/config"],
        quarantined: ["/q/1"],
        restore: [],
      }),
    ).toEqual({
      type: "containment.view-changed",
      payload: {
        code: "containment-view-changed",
        message: "m",
        frozen: true,
        changed: ["/p/.git/config"],
        quarantined: ["/q/1"],
        restore: [],
      },
    });
    expect(
      containmentAuditOf({ type: "notice", code: "containment-original-restored", path: "/p/x" })
        .type,
    ).toBe("containment.original-restored");
    expect(
      containmentAuditOf({ type: "refused", code: "containment-install-cage", violations: [] })
        .type,
    ).toBe("containment.install-cage");
    expect(
      containmentAuditOf({ type: "notice", code: "containment-host-change", path: "/p/x" }).type,
    ).toBe("containment.host-change");
    expect(
      containmentAuditOf({ type: "refused", code: "containment-guard-stopped", message: "m" }).type,
    ).toBe("containment.guard-stopped");
    const refused = containmentAuditOf({
      type: "egress-refused",
      code: "call-ambiguous",
      host: "h",
      port: 443,
      callIds: ["a", "b"],
      message: "m",
      at: "t",
    });
    expect(refused).toMatchObject({
      type: "containment.egress-refused",
      payload: { code: "call-ambiguous" },
    });
    expect(containmentAuditOf({ type: "notice", code: "something-else", secret: "x" })).toEqual({
      type: "containment.event",
      payload: { kind: "notice", code: "something-else" },
    });
  });
});

describe("a write the containment refused", () => {
  const post = (command: string, result: unknown) => ({
    type: "post-action" as const,
    actor: { sessionId: "s", subagentId: null },
    callId: null,
    tool: "Bash",
    kind: "shell" as const,
    params: { command },
    result,
    modelReads: true,
  });
  const contained = "exec env -i 'ENCLAWED_CONTAIN={}' /usr/bin/node /x/contain-init.js";
  it("EROFS from a read-only bind and EACCES from the name guard are the same refusal, told to the model", async () => {
    const { containedWriteRefused } = await import("./engine.js");
    expect(
      containedWriteRefused(
        post(contained, { stderr: "sh: 1: cannot create .envrc: Read-only file system" }),
      ),
    ).toMatch(/refused by Enclawed's containment/);
    expect(
      containedWriteRefused(
        post(contained, { stderr: "sh: 1: cannot create sub/.envrc: Permission denied" }),
      ),
    ).toMatch(/refused by Enclawed's containment/);
  });
  it("false positive: a command that was not contained, or a contained one with no refused write, gets no note", async () => {
    const { containedWriteRefused } = await import("./engine.js");
    expect(containedWriteRefused(post("cat /root/x", { stderr: "Permission denied" }))).toBeNull();
    expect(containedWriteRefused(post(contained, { stdout: "tests passed" }))).toBeNull();
  });
});
