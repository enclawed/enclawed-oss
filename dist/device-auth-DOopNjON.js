//#region src/shared/device-auth.ts
const WS_SCHEMES = {
	"ws:": {
		scheme: "ws:",
		defaultPort: "80"
	},
	"http:": {
		scheme: "ws:",
		defaultPort: "80"
	},
	"wss:": {
		scheme: "wss:",
		defaultPort: "443"
	},
	"https:": {
		scheme: "wss:",
		defaultPort: "443"
	}
};
/**
* Normalized gateway origin (`scheme://host:port`) that a stored device token is
* bound to. Only ws:/wss: (and the equivalent http:/https:) URLs have an
* origin; anything else (unparsable, file:, javascript:) returns null, and a caller holding null must
* neither send nor store a device token. Userinfo, path, query and fragment
* are not part of the origin; the default port is made explicit so `wss://h`
* and `wss://h:443` are the same gateway.
*/
function normalizeGatewayOrigin(url, base) {
	const trimmed = typeof url === "string" ? url.trim() : "";
	if (!trimmed) return null;
	let parsed;
	try {
		parsed = base ? new URL(trimmed, base) : new URL(trimmed);
	} catch {
		return null;
	}
	const mapped = WS_SCHEMES[parsed.protocol.toLowerCase()];
	if (!mapped) return null;
	const hostname = parsed.hostname.toLowerCase();
	if (!hostname) return null;
	return `${mapped.scheme}//${hostname}:${parsed.port || mapped.defaultPort}`;
}
function normalizeDeviceAuthRole(role) {
	return role.trim();
}
function normalizeDeviceAuthScopes(scopes) {
	if (!Array.isArray(scopes)) return [];
	const out = /* @__PURE__ */ new Set();
	for (const scope of scopes) {
		const trimmed = scope.trim();
		if (trimmed) out.add(trimmed);
	}
	if (out.has("operator.admin")) {
		out.add("operator.read");
		out.add("operator.write");
	} else if (out.has("operator.write")) out.add("operator.read");
	return [...out].toSorted();
}
//#endregion
export { normalizeDeviceAuthScopes as n, normalizeGatewayOrigin as r, normalizeDeviceAuthRole as t };
