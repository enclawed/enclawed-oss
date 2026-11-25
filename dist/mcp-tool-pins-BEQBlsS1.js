import { createHash } from "node:crypto";
//#region src/enclawed/mcp-tool-pins.ts
/** Sorted-key JSON without whitespace; undefined-valued keys are omitted. */
function canonicalJson(value) {
	if (value === null || typeof value !== "object") return JSON.stringify(value ?? null) ?? "null";
	if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
	const record = value;
	return `{${Object.keys(record).filter((k) => record[k] !== void 0).toSorted().map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(",")}}`;
}
/** The pin of one tool definition: SHA-256 (hex) of its canonical JSON. */
function mcpToolDefinitionDigest(tool) {
	return createHash("sha256").update(canonicalJson(tool ?? null)).digest("hex");
}
function toolName(tool) {
	const name = tool?.name;
	return typeof name === "string" && name.length > 0 ? name : null;
}
/**
* Pin a tools/list answer. Throws on a nameless tool or a duplicate name:
* an answer that cannot be pinned unambiguously is not admitted.
*/
function pinMcpToolDefinitions(tools) {
	const pins = Object.create(null);
	for (const tool of tools) {
		const name = toolName(tool);
		if (!name) throw new Error("MCP tools/list answer has a tool without a name; it cannot be pinned");
		if (Object.hasOwn(pins, name)) throw new Error(`MCP tools/list answer offers the tool ${JSON.stringify(name)} twice`);
		pins[name] = mcpToolDefinitionDigest(tool);
	}
	return Object.freeze(pins);
}
/**
* Compare a tools/list answer with the pins. Returns every drift, in a
* deterministic order (by tool name, then code); an empty list means the
* answer is exactly what was admitted.
*/
function checkMcpToolDefinitions(pins, tools) {
	const drifts = [];
	const seen = /* @__PURE__ */ new Set();
	for (const tool of tools) {
		const name = toolName(tool);
		if (!name) {
			drifts.push({
				tool: "",
				code: "not-pinned",
				offered: mcpToolDefinitionDigest(tool)
			});
			continue;
		}
		const offered = mcpToolDefinitionDigest(tool);
		if (seen.has(name)) {
			drifts.push({
				tool: name,
				code: "definition-changed",
				pinned: pins[name],
				offered
			});
			continue;
		}
		seen.add(name);
		if (!Object.hasOwn(pins, name)) drifts.push({
			tool: name,
			code: "not-pinned",
			offered
		});
		else if (pins[name] !== offered) drifts.push({
			tool: name,
			code: "definition-changed",
			pinned: pins[name],
			offered
		});
	}
	for (const name of Object.keys(pins)) if (!seen.has(name)) drifts.push({
		tool: name,
		code: "removed",
		pinned: pins[name]
	});
	return drifts.toSorted((a, b) => a.tool === b.tool ? a.code.localeCompare(b.code) : a.tool.localeCompare(b.tool));
}
/**
* The pins of one admitted server plus the tools revoked since admission.
* A revocation is permanent for this admission: a server that changes a tool
* back to its pinned definition does not get it back (it already showed it
* can change behind the name). Re-admission makes a new pin set.
*/
var McpToolPinSet = class McpToolPinSet {
	constructor(server, admittedTools) {
		this.server = server;
		this.revoked = /* @__PURE__ */ new Map();
		this.pins = pinMcpToolDefinitions(admittedTools);
	}
	/**
	* A pin set from digests recorded at admission (a signed admission record
	* keeps name -> digest, not the definitions). Throws on a nameless tool or a
	* digest that is not a SHA-256 hex string: pins that cannot be compared
	* exactly are not admitted.
	*/
	static fromDigests(server, digests) {
		const pins = Object.create(null);
		for (const [name, digest] of Object.entries(digests)) {
			if (name.length === 0) throw new Error("MCP admission record pins a tool without a name");
			if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) throw new Error(`MCP admission record has no valid digest for the tool ${JSON.stringify(name)}`);
			pins[name] = digest;
		}
		const set = new McpToolPinSet(server, []);
		set.pins = Object.freeze(pins);
		return set;
	}
	/**
	* Check a later tools/list answer. Revokes each drifted tool and returns
	* the drifts that were new (already-revoked tools are not reported twice).
	*/
	observe(tools) {
		const fresh = [];
		for (const drift of checkMcpToolDefinitions(this.pins, tools)) if (!this.revoked.has(drift.tool)) {
			this.revoked.set(drift.tool, drift);
			fresh.push(drift);
		}
		return fresh;
	}
	/** Revoke every pinned tool (a listing that failed or could not be checked). */
	revokeAll(code = "definition-changed") {
		const fresh = [];
		for (const name of Object.keys(this.pins)) if (!this.revoked.has(name)) {
			const drift = {
				tool: name,
				code,
				pinned: this.pins[name]
			};
			this.revoked.set(name, drift);
			fresh.push(drift);
		}
		return fresh;
	}
	/** May `tool` be called under this admission? */
	check(tool) {
		const drift = this.revoked.get(tool);
		if (drift) return {
			ok: false,
			code: drift.code,
			reason: describeMcpToolDrift(this.server, drift)
		};
		if (!Object.hasOwn(this.pins, tool)) return {
			ok: false,
			code: "not-pinned",
			reason: `the MCP server ${JSON.stringify(this.server)} has no admitted tool ${JSON.stringify(tool)}`
		};
		return { ok: true };
	}
	revokedTools() {
		return [...this.revoked.values()];
	}
};
/** One plain sentence for the agent and the log. */
function describeMcpToolDrift(server, drift) {
	const tool = JSON.stringify(drift.tool);
	const where = `the MCP server ${JSON.stringify(server)}`;
	switch (drift.code) {
		case "definition-changed": return `the definition of the tool ${tool} offered by ${where} changed after it was admitted; it is refused until the server is admitted again`;
		case "removed": return `the tool ${tool} was withdrawn by ${where} after it was admitted; it is refused until the server is admitted again`;
		case "not-pinned": return `${where} offered the tool ${tool}, which was not part of its admission; it is refused`;
	}
	return `the tool ${tool} of ${where} is refused`;
}
//#endregion
export { mcpToolDefinitionDigest as a, describeMcpToolDrift as i, canonicalJson as n, pinMcpToolDefinitions as o, checkMcpToolDefinitions as r, McpToolPinSet as t };
