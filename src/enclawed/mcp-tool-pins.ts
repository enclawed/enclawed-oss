// enclawed: MCP tool-definition pinning (post-admission drift, the "rug pull").
//
// When an MCP server is admitted, every tool it offers is pinned by the
// SHA-256 of the canonical JSON of its whole definition (name, description,
// input schema, annotations, everything the server sent). Every later
// tools/list answer, whether it follows a `notifications/tools/list_changed`
// or not, is checked against the pins. A tool whose definition changed, a
// tool that disappeared and came back, and a tool that was never pinned are
// revoked: they are not callable again until the server is admitted afresh
// (a new admission pins whatever it then offers). Tools whose definitions
// did not change stay callable, so a server that only adds or edits one tool
// does not lose the others.
//
// What a pin cannot see: a server whose definitions stay byte-identical but
// whose results turn hostile. That is not detected here and is not meant to
// be; results are untrusted input wherever they come from (the tool-result
// middleware cleans them before the model reads them, and whatever the model
// then does goes through the per-action gate and the egress checks).
//
// The digest is sha256(canonicalJson(tool)) with sorted keys, no whitespace,
// and undefined-valued keys left out, so a pin made by another enclawed
// application for the same definition is the same string.

import { createHash } from "node:crypto";

/** Sorted-key JSON without whitespace; undefined-valued keys are omitted. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .toSorted()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`)
    .join(",")}}`;
}

/** The pin of one tool definition: SHA-256 (hex) of its canonical JSON. */
export function mcpToolDefinitionDigest(tool: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(tool ?? null))
    .digest("hex");
}

/** name -> digest, as admitted. */
export type McpToolPins = Readonly<Record<string, string>>;

export type McpToolDriftCode = "definition-changed" | "not-pinned" | "removed";

export type McpToolDrift = Readonly<{
  tool: string;
  code: McpToolDriftCode;
  /** The admitted digest (absent for a tool that was never pinned). */
  pinned?: string;
  /** The digest now offered (absent for a removed tool). */
  offered?: string;
}>;

type NamedTool = { name?: unknown };

function toolName(tool: unknown): string | null {
  const name = (tool as NamedTool | null)?.name;
  return typeof name === "string" && name.length > 0 ? name : null;
}

/**
 * Pin a tools/list answer. Throws on a nameless tool or a duplicate name:
 * an answer that cannot be pinned unambiguously is not admitted.
 */
export function pinMcpToolDefinitions(tools: readonly unknown[]): McpToolPins {
  const pins: Record<string, string> = Object.create(null);
  for (const tool of tools) {
    const name = toolName(tool);
    if (!name) {
      throw new Error("MCP tools/list answer has a tool without a name; it cannot be pinned");
    }
    if (Object.hasOwn(pins, name)) {
      throw new Error(`MCP tools/list answer offers the tool ${JSON.stringify(name)} twice`);
    }
    pins[name] = mcpToolDefinitionDigest(tool);
  }
  return Object.freeze(pins);
}

/**
 * Compare a tools/list answer with the pins. Returns every drift, in a
 * deterministic order (by tool name, then code); an empty list means the
 * answer is exactly what was admitted.
 */
export function checkMcpToolDefinitions(
  pins: McpToolPins,
  tools: readonly unknown[],
): McpToolDrift[] {
  const drifts: McpToolDrift[] = [];
  const seen = new Set<string>();
  for (const tool of tools) {
    const name = toolName(tool);
    if (!name) {
      drifts.push({ tool: "", code: "not-pinned", offered: mcpToolDefinitionDigest(tool) });
      continue;
    }
    const offered = mcpToolDefinitionDigest(tool);
    if (seen.has(name)) {
      drifts.push({ tool: name, code: "definition-changed", pinned: pins[name], offered });
      continue;
    }
    seen.add(name);
    if (!Object.hasOwn(pins, name)) {
      drifts.push({ tool: name, code: "not-pinned", offered });
    } else if (pins[name] !== offered) {
      drifts.push({ tool: name, code: "definition-changed", pinned: pins[name], offered });
    }
  }
  for (const name of Object.keys(pins)) {
    if (!seen.has(name)) {
      drifts.push({ tool: name, code: "removed", pinned: pins[name] });
    }
  }
  return drifts.toSorted((a, b) =>
    a.tool === b.tool ? a.code.localeCompare(b.code) : a.tool.localeCompare(b.tool),
  );
}

export type McpToolCallDecision =
  | { ok: true }
  | { ok: false; code: McpToolDriftCode; reason: string };

/**
 * The pins of one admitted server plus the tools revoked since admission.
 * A revocation is permanent for this admission: a server that changes a tool
 * back to its pinned definition does not get it back (it already showed it
 * can change behind the name). Re-admission makes a new pin set.
 */
export class McpToolPinSet {
  readonly pins: McpToolPins;
  private readonly revoked = new Map<string, McpToolDrift>();

  constructor(
    readonly server: string,
    admittedTools: readonly unknown[],
  ) {
    this.pins = pinMcpToolDefinitions(admittedTools);
  }

  /**
   * A pin set from digests recorded at admission (a signed admission record
   * keeps name -> digest, not the definitions). Throws on a nameless tool or a
   * digest that is not a SHA-256 hex string: pins that cannot be compared
   * exactly are not admitted.
   */
  static fromDigests(server: string, digests: McpToolPins): McpToolPinSet {
    const pins: Record<string, string> = Object.create(null);
    for (const [name, digest] of Object.entries(digests)) {
      if (name.length === 0) {
        throw new Error("MCP admission record pins a tool without a name");
      }
      if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) {
        throw new Error(
          `MCP admission record has no valid digest for the tool ${JSON.stringify(name)}`,
        );
      }
      pins[name] = digest;
    }
    const set = new McpToolPinSet(server, []);
    // `pins` is readonly to callers; it is set once here, before the set is shared.
    (set as { pins: McpToolPins }).pins = Object.freeze(pins);
    return set;
  }

  /**
   * Check a later tools/list answer. Revokes each drifted tool and returns
   * the drifts that were new (already-revoked tools are not reported twice).
   */
  observe(tools: readonly unknown[]): McpToolDrift[] {
    const fresh: McpToolDrift[] = [];
    for (const drift of checkMcpToolDefinitions(this.pins, tools)) {
      if (!this.revoked.has(drift.tool)) {
        this.revoked.set(drift.tool, drift);
        fresh.push(drift);
      }
    }
    return fresh;
  }

  /** Revoke every pinned tool (a listing that failed or could not be checked). */
  revokeAll(code: McpToolDriftCode = "definition-changed"): McpToolDrift[] {
    const fresh: McpToolDrift[] = [];
    for (const name of Object.keys(this.pins)) {
      if (!this.revoked.has(name)) {
        const drift: McpToolDrift = { tool: name, code, pinned: this.pins[name] };
        this.revoked.set(name, drift);
        fresh.push(drift);
      }
    }
    return fresh;
  }

  /** May `tool` be called under this admission? */
  check(tool: string): McpToolCallDecision {
    const drift = this.revoked.get(tool);
    if (drift) {
      return { ok: false, code: drift.code, reason: describeMcpToolDrift(this.server, drift) };
    }
    if (!Object.hasOwn(this.pins, tool)) {
      return {
        ok: false,
        code: "not-pinned",
        reason: `the MCP server ${JSON.stringify(this.server)} has no admitted tool ${JSON.stringify(tool)}`,
      };
    }
    return { ok: true };
  }

  revokedTools(): McpToolDrift[] {
    return [...this.revoked.values()];
  }
}

/** One plain sentence for the agent and the log. */
export function describeMcpToolDrift(server: string, drift: McpToolDrift): string {
  const tool = JSON.stringify(drift.tool);
  const where = `the MCP server ${JSON.stringify(server)}`;
  switch (drift.code) {
    case "definition-changed":
      return (
        `the definition of the tool ${tool} offered by ${where} changed after it was admitted; ` +
        "it is refused until the server is admitted again"
      );
    case "removed":
      return (
        `the tool ${tool} was withdrawn by ${where} after it was admitted; ` +
        "it is refused until the server is admitted again"
      );
    case "not-pinned":
      return `${where} offered the tool ${tool}, which was not part of its admission; it is refused`;
  }
  return `the tool ${tool} of ${where} is refused`;
}
