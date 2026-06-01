import { r as registerServer } from "./server-registry-Dfft0BAM.js";
import { t as index } from "./tsdav.esm-CUuE7Ae3.js";
//#region extensions/mcp-carddav/src/vcard.ts
function unfold(raw) {
	const lines = raw.replace(/\r\n/g, "\n").split("\n");
	const out = [];
	for (const line of lines) if ((line.startsWith(" ") || line.startsWith("	")) && out.length > 0) out[out.length - 1] += line.slice(1);
	else out.push(line);
	return out;
}
function parseLine(line) {
	const colon = line.indexOf(":");
	if (colon < 0) return null;
	const head = line.slice(0, colon);
	const value = line.slice(colon + 1);
	const semi = head.indexOf(";");
	const name = (semi < 0 ? head : head.slice(0, semi)).replace(/^item\d+\./i, "").toUpperCase();
	const params = /* @__PURE__ */ new Map();
	if (semi >= 0) {
		const paramSpec = head.slice(semi + 1);
		for (const p of paramSpec.split(";")) {
			const eq = p.indexOf("=");
			if (eq < 0) {
				params.set("TYPE", p.toUpperCase());
				continue;
			}
			params.set(p.slice(0, eq).toUpperCase(), p.slice(eq + 1));
		}
	}
	return {
		name,
		params,
		value
	};
}
function assembleN(value) {
	const parts = value.split(";").map((p) => p.trim());
	return [parts[1] ?? "", parts[0] ?? ""].filter((p) => p.length > 0).join(" ").trim();
}
function parseVCard(rawIn) {
	if (!rawIn || typeof rawIn !== "string") return null;
	const lines = unfold(rawIn);
	let uid = "";
	let fn = "";
	let nDerived = "";
	const emails = [];
	const phones = [];
	for (const line of lines) {
		const parsed = parseLine(line);
		if (!parsed) continue;
		switch (parsed.name) {
			case "UID":
				uid = parsed.value.trim();
				break;
			case "FN":
				fn = parsed.value.trim();
				break;
			case "N":
				nDerived = assembleN(parsed.value);
				break;
			case "EMAIL": {
				const addr = parsed.value.trim().toLowerCase();
				if (addr.length > 0 && !emails.includes(addr)) emails.push(addr);
				break;
			}
			case "TEL": {
				const num = parsed.value.trim();
				if (num.length > 0 && !phones.includes(num)) phones.push(num);
				break;
			}
			default: break;
		}
	}
	const displayName = fn || nDerived;
	if (!uid && displayName.length === 0 && emails.length === 0) return null;
	return Object.freeze({
		uid: uid || `vcard:${displayName || emails[0] || "unknown"}`,
		displayName: displayName || emails[0] || "(no name)",
		emails: Object.freeze(emails),
		phones: Object.freeze(phones)
	});
}
//#endregion
//#region extensions/mcp-carddav/src/carddav-transport.ts
const { createDAVClient } = index;
var CardDavTransport = class {
	constructor(opts) {
		this.clientPromise = null;
		if (!opts.serverUrl) throw new TypeError("CardDavTransport: serverUrl required");
		if (!opts.username) throw new TypeError("CardDavTransport: username required");
		if (!opts.password) throw new TypeError("CardDavTransport: password required");
		this.serverUrl = opts.serverUrl;
		this.username = opts.username;
		this.password = opts.password;
		this.defaultAddressBookId = opts.defaultAddressBookId;
		this.clientFactory = opts.clientFactory ?? ((cfg) => createDAVClient({
			serverUrl: cfg.serverUrl,
			credentials: cfg.credentials,
			authMethod: "Basic",
			defaultAccountType: "carddav"
		}));
	}
	async call(method, params) {
		if (method !== "tools/call") return {
			ok: false,
			reason: `CardDAV bridge: unsupported MCP method ${method}`
		};
		const name = typeof params.name === "string" ? params.name : "";
		const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
		try {
			switch (name) {
				case "search_contacts": return {
					ok: true,
					result: await this.searchContacts(args)
				};
				case "list_contacts": return {
					ok: true,
					result: await this.listContacts(args)
				};
				default: return {
					ok: false,
					reason: `CardDAV bridge: unknown tool: ${name}`
				};
			}
		} catch (err) {
			this.clientPromise = null;
			return {
				ok: false,
				reason: `carddav ${name}: ${err.message}`
			};
		}
	}
	getClient() {
		if (!this.clientPromise) this.clientPromise = this.clientFactory({
			serverUrl: this.serverUrl,
			credentials: {
				username: this.username,
				password: this.password
			}
		});
		return this.clientPromise;
	}
	async resolvePrimaryBook(client) {
		const books = await client.fetchAddressBooks();
		if (!books || books.length === 0) throw new Error("no address books available on this account");
		if (this.defaultAddressBookId) {
			const match = books.find((b) => b.url === this.defaultAddressBookId || b.displayName === this.defaultAddressBookId);
			if (match) return { url: match.url };
		}
		return { url: books[0].url };
	}
	async fetchAllContacts(client) {
		const book = await this.resolvePrimaryBook(client);
		const objects = await client.fetchVCards({ addressBook: { url: book.url } });
		const contacts = [];
		for (const obj of objects) {
			if (typeof obj.data !== "string") continue;
			const parsed = parseVCard(obj.data);
			if (parsed) contacts.push(parsed);
		}
		return Object.freeze(contacts);
	}
	async searchContacts(args) {
		const queryRaw = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
		if (!queryRaw) throw new Error("search_contacts: `query` is required");
		const maxResults = typeof args.maxResults === "number" && args.maxResults > 0 ? Math.min(Math.floor(args.maxResults), 100) : 25;
		const client = await this.getClient();
		const all = await this.fetchAllContacts(client);
		const matches = [];
		for (const c of all) {
			const inEmails = c.emails.some((e) => e.includes(queryRaw));
			const inName = c.displayName.toLowerCase().includes(queryRaw);
			if (inEmails || inName) {
				matches.push(c);
				if (matches.length >= maxResults) break;
			}
		}
		return { contacts: Object.freeze(matches) };
	}
	async listContacts(args) {
		const maxResults = typeof args.maxResults === "number" && args.maxResults > 0 ? Math.min(Math.floor(args.maxResults), 500) : 100;
		const client = await this.getClient();
		const all = await this.fetchAllContacts(client);
		return { contacts: Object.freeze(all.slice(0, maxResults)) };
	}
};
//#endregion
//#region extensions/mcp-carddav/src/index.ts
const CARDDAV_TOOLS = Object.freeze(["search_contacts", "list_contacts"]);
function syntheticEndpoint(opts) {
	if (opts.endpoint) return opts.endpoint;
	let host = "carddav";
	try {
		host = new URL(opts.serverUrl).host;
	} catch {
		host = opts.serverUrl;
	}
	const u = encodeURIComponent(opts.username);
	return `mcp+carddav://${host}/${u}`;
}
function loadCardDavBridge(opts) {
	const requiredClearance = opts.requiredClearance ?? "internal";
	const endpoint = syntheticEndpoint(opts);
	const baseline = CARDDAV_TOOLS;
	const allowedTools = opts.allowedToolsOverride ? Object.freeze(baseline.filter((t) => opts.allowedToolsOverride.includes(t))) : baseline;
	const transport = new CardDavTransport(opts);
	const entry = Object.freeze({
		id: "mcp.carddav",
		bridge: "mcp-carddav",
		endpoint,
		requiredClearance,
		allowedTools,
		transport
	});
	registerServer(entry);
	return { registered: entry };
}
//#endregion
export { parseVCard as i, loadCardDavBridge as n, CardDavTransport as r, CARDDAV_TOOLS as t };
