/** Sorted-key JSON without whitespace; undefined-valued keys are omitted. */
export declare function canonicalJson(value: unknown): string;
/** The pin of one tool definition: SHA-256 (hex) of its canonical JSON. */
export declare function mcpToolDefinitionDigest(tool: unknown): string;
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
/**
 * Pin a tools/list answer. Throws on a nameless tool or a duplicate name:
 * an answer that cannot be pinned unambiguously is not admitted.
 */
export declare function pinMcpToolDefinitions(tools: readonly unknown[]): McpToolPins;
/**
 * Compare a tools/list answer with the pins. Returns every drift, in a
 * deterministic order (by tool name, then code); an empty list means the
 * answer is exactly what was admitted.
 */
export declare function checkMcpToolDefinitions(pins: McpToolPins, tools: readonly unknown[]): McpToolDrift[];
export type McpToolCallDecision = {
    ok: true;
} | {
    ok: false;
    code: McpToolDriftCode;
    reason: string;
};
/**
 * The pins of one admitted server plus the tools revoked since admission.
 * A revocation is permanent for this admission: a server that changes a tool
 * back to its pinned definition does not get it back (it already showed it
 * can change behind the name). Re-admission makes a new pin set.
 */
export declare class McpToolPinSet {
    readonly server: string;
    readonly pins: McpToolPins;
    private readonly revoked;
    constructor(server: string, admittedTools: readonly unknown[]);
    /**
     * A pin set from digests recorded at admission (a signed admission record
     * keeps name -> digest, not the definitions). Throws on a nameless tool or a
     * digest that is not a SHA-256 hex string: pins that cannot be compared
     * exactly are not admitted.
     */
    static fromDigests(server: string, digests: McpToolPins): McpToolPinSet;
    /**
     * Check a later tools/list answer. Revokes each drifted tool and returns
     * the drifts that were new (already-revoked tools are not reported twice).
     */
    observe(tools: readonly unknown[]): McpToolDrift[];
    /** Revoke every pinned tool (a listing that failed or could not be checked). */
    revokeAll(code?: McpToolDriftCode): McpToolDrift[];
    /** May `tool` be called under this admission? */
    check(tool: string): McpToolCallDecision;
    revokedTools(): McpToolDrift[];
}
/** One plain sentence for the agent and the log. */
export declare function describeMcpToolDrift(server: string, drift: McpToolDrift): string;
