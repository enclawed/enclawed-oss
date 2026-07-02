// MCP client wrapper that gates every connection through verifyServerClearance().
// In the enclaved flavor, connections are blocked unless the server's
// clearance assertion is signed by a trust-root signer approved for at
// least the caller's required clearance tier. In the open flavor, the
// same check runs but failures are warnings (the host can still allow the
// connection if it chooses).
//
// Sector-neutral: the same shape works whether the deploying organization
// uses generic tier names ("restricted-plus") or US-government markings
// ("q-cleared"). They share the same numeric ladder.
//
// Tool dispatch goes over HTTP+JSON-RPC (http-transport.ts) once the
// admission gate is open. The first-party bundled bridges (Google
// Workspace, GitHub) call registerServer() at load time; invoke() looks
// up the bridge entry by serverUrl and enforces the per-bridge
// `allowedTools` allowlist before any network call.

import { getRuntime } from "../../../enclawed/ts/runtime.js";
import type { ClearanceLevel } from "../../../enclawed/ts/module-manifest.js";
import { verifyServerClearance } from "./server-clearance-verifier.js";
import { getServerByEndpoint, isToolAdmitted } from "./server-registry.js";

export type McpToolCall = {
  serverUrl: string;
  toolName: string;
  arguments: Record<string, unknown>;
};

export type McpToolResult =
  | { ok: true; output: unknown }
  | { ok: false; reason: string };

export type McpClientOptions = {
  requiredClearance?: ClearanceLevel;
  // Test seam: synchronous (cached) decision override for the connection check.
  override?: { ok: boolean; reason?: string };
  // Test seam: skip the verifyServerClearance() pre-check for HTTP servers
  // that don't host a .well-known/enclawed-clearance.json (e.g. unit tests
  // that exercise the transport against a local mock). Defaults to false;
  // the bundled first-party bridges set this to true because Google /
  // GitHub MCP servers don't carry an enclawed manifest and the bridges'
  // own signed enclawed.module.json + registry registration is the
  // admission gate.
  skipClearancePreflight?: boolean;
};

export class QClearedMcpClient {
  constructor(private readonly opts: McpClientOptions = {}) {}

  private get required(): ClearanceLevel {
    return this.opts.requiredClearance ?? "restricted-plus";
  }

  async connect(serverUrl: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const rt = getRuntime();
    const flavor = rt?.flavor ?? "open";
    const override = this.opts.override;

    if (this.opts.skipClearancePreflight && !override) {
      // The caller has already gated this URL through a different signed
      // admission path (e.g. a registered first-party bridge). Just audit
      // the allow and move on.
      if (rt) {
        rt.audit
          .append({
            type: "mcp.connect.allow",
            actor: "mcp-attested",
            level: this.required,
            payload: { serverUrl, signerKeyId: "bridge-admitted" },
          })
          .catch(() => {});
      }
      return { ok: true };
    }

    const result = override
      ? override.ok
        ? { ok: true as const, clearance: this.required, signerKeyId: "override" }
        : { ok: false as const, reason: override.reason ?? "override deny" }
      : await verifyServerClearance(serverUrl, this.required);
    if (!result.ok) {
      const reason = `MCP server ${serverUrl}: ${result.reason}`;
      if (rt) {
        rt.audit
          .append({
            type: flavor === "enclaved" ? "mcp.connect.deny" : "mcp.connect.warn",
            actor: "mcp-attested",
            level: this.required,
            payload: { serverUrl, reason: result.reason },
          })
          .catch(() => {});
      }
      if (flavor === "enclaved") {
        return { ok: false, reason };
      }
      // Open flavor: surface the warning to the caller but allow them to
      // proceed if they explicitly want to. Returning ok:true here would
      // mask a verification failure, so we return ok:false and let the
      // host decide.
      return { ok: false, reason: `${reason} (open flavor: warn-only)` };
    }
    if (rt) {
      rt.audit
        .append({
          type: "mcp.connect.allow",
          actor: "mcp-attested",
          level: result.clearance,
          payload: { serverUrl, signerKeyId: result.signerKeyId },
        })
        .catch(() => {});
    }
    return { ok: true };
  }

  async invoke(call: McpToolCall): Promise<McpToolResult> {
    // Look up the bridge that owns this endpoint. If the call hits an
    // endpoint that no bundled bridge has registered, fall back to the
    // legacy "lab fills in" path so existing direct-dispatch callers
    // aren't broken; but the admission gate (clearance verifier) still
    // runs.
    const bridge = getServerByEndpoint(call.serverUrl);
    if (bridge) {
      if (!isToolAdmitted(bridge, call.toolName)) {
        const rt = getRuntime();
        if (rt) {
          rt.audit
            .append({
              type: "mcp.tool.deny",
              actor: "mcp-attested",
              level: bridge.requiredClearance,
              payload: {
                serverUrl: call.serverUrl,
                bridge: bridge.bridge,
                toolName: call.toolName,
                reason: "tool not in bridge allowedTools",
              },
            })
            .catch(() => {});
        }
        return {
          ok: false,
          reason:
            `tool "${call.toolName}" not admitted by bridge "${bridge.bridge}" ` +
            `(allowed: ${bridge.allowedTools.join(", ")})`,
        };
      }
      const c = await this.connect(call.serverUrl);
      if (!c.ok) return { ok: false, reason: c.reason };
      const rpc = await bridge.transport.call("tools/call", {
        name: call.toolName,
        arguments: call.arguments,
      });
      if (!rpc.ok) return { ok: false, reason: rpc.reason };
      return { ok: true, output: rpc.result };
    }

    const c = await this.connect(call.serverUrl);
    if (!c.ok) return { ok: false, reason: c.reason };
    return {
      ok: false,
      reason:
        "no registered bridge for this serverUrl; load a bundled bridge " +
        "(mcp-google-workspace, mcp-github, …) or register a custom one " +
        "via mcp-attested/server-registry",
    };
  }
}
