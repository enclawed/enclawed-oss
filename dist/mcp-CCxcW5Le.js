import { t as hostUid } from "./userns-Om3FzFOv.js";
import { a as checkRequestShape, c as verifyPinnedAnswer, t as GENERIC_SHAPE } from "./request-shape-BtkUVGoh.js";
import { D as requestToolIssueSlot, st as createCapacityLedger } from "./src-C2b2oXDB.js";
import { t as privateSocketDir } from "./unix-socket-dir-DQnFGbjL.js";
import { A as checkRoutingProvenance, D as nodeToolchain, E as lookupProgram, F as suppliedValues, O as planContainment, i as nameGuardDigest, r as nameGuardConfig, s as CA_BUNDLE_PATHS, t as ensureNameGuard, x as credentialFindings } from "./name-guard-CTKesQw-.js";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import os from "node:os";
import crypto, { createHash, randomBytes } from "node:crypto";
import net from "node:net";
import { Duplex } from "node:stream";
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import tls from "node:tls";
import http2 from "node:http2";
//#region src/enclawed/containment/x509.ts
function derLength(n) {
	if (n < 128) return Buffer.from([n]);
	const bytes = [];
	let v = n;
	while (v > 0) {
		bytes.unshift(v & 255);
		v = Math.floor(v / 256);
	}
	return Buffer.from([128 | bytes.length, ...bytes]);
}
function tlv(tag, content) {
	return Buffer.concat([
		Buffer.from([tag]),
		derLength(content.length),
		content
	]);
}
const seq = (...items) => tlv(48, Buffer.concat(items));
const set = (...items) => tlv(49, Buffer.concat(items));
const octets = (b) => tlv(4, b);
const bitString = (b, unused = 0) => tlv(3, Buffer.concat([Buffer.from([unused]), b]));
const utf8 = (s) => tlv(12, Buffer.from(s, "utf8"));
const boolTrue = () => tlv(1, Buffer.from([255]));
const explicit = (n, content) => tlv(160 + n, content);
function derInteger(b) {
	let i = 0;
	while (i < b.length - 1 && b[i] === 0) i++;
	let v = b.subarray(i);
	if (v[0] & 128) v = Buffer.concat([Buffer.from([0]), v]);
	return tlv(2, v);
}
function oid(dotted) {
	const parts = dotted.split(".").map(Number);
	const out = [40 * parts[0] + parts[1]];
	for (const p of parts.slice(2)) {
		const stack = [p & 127];
		let v = Math.floor(p / 128);
		while (v > 0) {
			stack.unshift(v & 127 | 128);
			v = Math.floor(v / 128);
		}
		out.push(...stack);
	}
	return tlv(6, Buffer.from(out));
}
function derTime(d) {
	const iso = d.toISOString().replace(/[-:T]/g, "").slice(0, 14);
	const y = d.getUTCFullYear();
	return y >= 1950 && y < 2050 ? tlv(23, Buffer.from(`${iso.slice(2)}Z`)) : tlv(24, Buffer.from(`${iso}Z`));
}
const OID = {
	ecdsaWithSha256: "1.2.840.10045.4.3.2",
	commonName: "2.5.4.3",
	organization: "2.5.4.10",
	basicConstraints: "2.5.29.19",
	keyUsage: "2.5.29.15",
	extKeyUsage: "2.5.29.37",
	serverAuth: "1.3.6.1.5.5.7.3.1",
	subjectAltName: "2.5.29.17",
	subjectKeyId: "2.5.29.14",
	authorityKeyId: "2.5.29.35",
	nameConstraints: "2.5.29.30"
};
/** A name no destination can have (RFC 6761): the permitted subtree of a CA with no destinations. */
const NO_NAME = "enclawed-no-destination.invalid";
/** NameConstraints: permitted = the declared DNS names; excluded = all IPv4 and IPv6 addresses. */
function nameConstraints(names) {
	const permitted = (names.length > 0 ? names : [NO_NAME]).map((n) => seq(tlv(130, Buffer.from(n, "ascii"))));
	const excluded = [seq(tlv(135, Buffer.alloc(8))), seq(tlv(135, Buffer.alloc(32)))];
	return seq(tlv(160, Buffer.concat(permitted)), tlv(161, Buffer.concat(excluded)));
}
function name(cn) {
	return seq(set(seq(oid(OID.organization), utf8("Enclawed containment"))), set(seq(oid(OID.commonName), utf8(cn))));
}
function extension(id, critical, value) {
	return seq(oid(id), ...critical ? [boolTrue()] : [], octets(value));
}
function keyId(spkiDer) {
	return crypto.createHash("sha256").update(spkiDer).digest().subarray(0, 20);
}
function pem(label, der) {
	const b64 = der.toString("base64").replace(/(.{64})/g, "$1\n");
	return `-----BEGIN ${label}-----\n${b64}${b64.endsWith("\n") ? "" : "\n"}-----END ${label}-----\n`;
}
function buildCertificate(input) {
	const spki = input.subjectKey.export({
		type: "spki",
		format: "der"
	});
	const serial = crypto.randomBytes(16);
	serial[0] &= 127;
	serial[0] |= 1;
	const sigAlg = seq(oid(OID.ecdsaWithSha256));
	const exts = [];
	if (input.ca) {
		exts.push(extension(OID.basicConstraints, true, seq(boolTrue(), derInteger(Buffer.from([0])))));
		exts.push(extension(OID.keyUsage, true, bitString(Buffer.from([6]), 1)));
		if (input.permittedNames) exts.push(extension(OID.nameConstraints, true, nameConstraints(input.permittedNames)));
	} else {
		exts.push(extension(OID.basicConstraints, true, seq()));
		exts.push(extension(OID.keyUsage, true, bitString(Buffer.from([128]), 7)));
		exts.push(extension(OID.extKeyUsage, false, seq(oid(OID.serverAuth))));
		const alt = input.altName ?? input.subject;
		const ipFamily = net.isIP(alt);
		const general = ipFamily === 4 ? tlv(135, Buffer.from(alt.split(".").map(Number))) : ipFamily === 6 ? tlv(135, ipv6Bytes(alt)) : tlv(130, Buffer.from(alt, "ascii"));
		exts.push(extension(OID.subjectAltName, false, seq(general)));
	}
	exts.push(extension(OID.subjectKeyId, false, octets(keyId(spki))));
	exts.push(extension(OID.authorityKeyId, false, seq(tlv(128, keyId(input.issuerSpki)))));
	const tbs = seq(explicit(0, derInteger(Buffer.from([2]))), derInteger(serial), sigAlg, name(input.issuer), seq(derTime(input.notBefore), derTime(input.notAfter)), name(input.subject), spki, explicit(3, seq(...exts)));
	return seq(tbs, sigAlg, bitString(crypto.sign("sha256", tbs, input.issuerKey)));
}
function ipv6Bytes(ip) {
	const u = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
	const [head, tail] = u.includes("::") ? u.split("::") : [u, ""];
	const h = head ? head.split(":") : [];
	const t = tail ? tail.split(":") : [];
	const groups = [
		...h,
		...Array(8 - h.length - t.length).fill("0"),
		...t
	];
	return Buffer.concat(groups.map((g) => Buffer.from(g.padStart(4, "0"), "hex")));
}
const LIFETIME_MS = 720 * 3600 * 1e3;
const BACKDATE_MS = 3600 * 1e3;
const DNS_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
/**
* Make a fresh CA for one container, constrained to `names` (the declared
* destinations). Its private key exists only in this object.
*/
function createContainerCa(label, names, now = /* @__PURE__ */ new Date()) {
	return makeCa(label, names, now).ca;
}
function makeCa(label, rawNames, now) {
	const names = [...new Set(rawNames.map((n) => n.toLowerCase()))].toSorted();
	for (const n of names) if (!DNS_NAME.test(n)) throw new Error(`enclawed containment CA: not a DNS name: ${n}`);
	const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
	const caSpki = publicKey.export({
		type: "spki",
		format: "der"
	});
	const subject = `Enclawed containment CA (${label.slice(0, 40)})`;
	const notBefore = new Date(now.getTime() - BACKDATE_MS);
	const notAfter = new Date(now.getTime() + LIFETIME_MS);
	const caDer = buildCertificate({
		subject,
		issuer: subject,
		subjectKey: publicKey,
		issuerKey: privateKey,
		issuerSpki: caSpki,
		ca: true,
		permittedNames: names,
		notBefore,
		notAfter
	});
	const leaves = /* @__PURE__ */ new Map();
	const sign = (hostname) => {
		const host = hostname.toLowerCase();
		const leaf = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
		const der = buildCertificate({
			subject: host,
			issuer: subject,
			subjectKey: leaf.publicKey,
			issuerKey: privateKey,
			issuerSpki: caSpki,
			ca: false,
			altName: host,
			notBefore,
			notAfter
		});
		return {
			keyPem: leaf.privateKey.export({
				type: "pkcs8",
				format: "pem"
			}),
			certPem: pem("CERTIFICATE", der)
		};
	};
	return {
		ca: {
			certPem: pem("CERTIFICATE", caDer),
			names,
			leafFor(hostname) {
				const host = hostname.toLowerCase();
				if (!names.includes(host)) throw new Error(`enclawed containment CA: ${host} is not a declared destination`);
				const cached = leaves.get(host);
				if (cached) return cached;
				const out = sign(host);
				leaves.set(host, out);
				return out;
			}
		},
		sign
	};
}
//#endregion
//#region src/enclawed/containment/relay-types.ts
/** Largest request body (or WebSocket message) the relay reads, and so can inspect; larger is refused. */
const MAX_REQUEST_BODY = 16 * 1024 * 1024;
/** Every occurrence of `from` in `buf` replaced by `to`. */
function replaceBytes(buf, from, to) {
	const parts = [];
	let at = 0;
	for (let i = buf.indexOf(from, at); i >= 0; i = buf.indexOf(from, at)) {
		parts.push(buf.subarray(at, i), to);
		at = i + from.length;
	}
	if (parts.length === 0) return buf;
	parts.push(buf.subarray(at));
	return Buffer.concat(parts);
}
const refusal = (code, message) => ({
	ok: false,
	code,
	message
});
/** Headers that describe one hop, never forwarded as they are. */
const HOP_BY_HOP = new Set([
	"connection",
	"keep-alive",
	"proxy-connection",
	"proxy-authorization",
	"proxy-authenticate",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"content-length",
	"host",
	"http2-settings"
]);
function hostOf(authority) {
	const a = authority.toLowerCase().trim();
	if (a.startsWith("[")) return a.slice(1, a.indexOf("]"));
	return a.replace(/:\d+$/, "");
}
/** Read a request body, bounded; null when it exceeds MAX_REQUEST_BODY. */
function readBody(stream) {
	return new Promise((resolve) => {
		const chunks = [];
		let size = 0;
		let done = false;
		const finish = (v) => {
			if (!done) {
				done = true;
				resolve(v);
			}
		};
		stream.on("data", (c) => {
			size += c.length;
			if (size > 16777216) {
				stream.destroy();
				finish(null);
				return;
			}
			chunks.push(c);
		});
		stream.on("end", () => finish(Buffer.concat(chunks)));
		stream.on("error", () => finish(Buffer.concat(chunks)));
		stream.on("close", () => finish(Buffer.concat(chunks)));
	});
}
//#endregion
//#region src/enclawed/containment/relay-h2.ts
const isGrpc = (ct) => typeof ct === "string" && /^application\/grpc(\+|;|$)/i.test(ct);
/** Length-prefixed gRPC messages from a byte stream. */
function createGrpcParser(max = MAX_REQUEST_BODY) {
	let buf = Buffer.alloc(0);
	return {
		push(chunk) {
			buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk]);
			const messages = [];
			while (buf.length >= 5) {
				const flag = buf[0];
				const len = buf.readUInt32BE(1);
				if (flag > 1) return {
					messages,
					error: `bad gRPC message flag ${flag}`
				};
				if (len > max) return {
					messages,
					error: `gRPC message larger than ${max} bytes`
				};
				if (buf.length < 5 + len) break;
				messages.push({
					compressed: flag === 1,
					payload: Buffer.from(buf.subarray(5, 5 + len))
				});
				buf = buf.subarray(5 + len);
			}
			return {
				messages,
				error: null
			};
		},
		pending: () => buf.length
	};
}
function grpcFrame(compressed, payload) {
	const head = Buffer.alloc(5);
	head[0] = compressed ? 1 : 0;
	head.writeUInt32BE(payload.length, 1);
	return Buffer.concat([head, payload]);
}
function grpcCodec(encoding) {
	switch ((encoding ?? "identity").toLowerCase()) {
		case "identity": return {
			decode: (b) => b,
			encode: (b) => b
		};
		case "gzip": return {
			decode: (b) => zlib.gunzipSync(b),
			encode: (b) => zlib.gzipSync(b)
		};
		case "deflate": return {
			decode: (b) => zlib.inflateSync(b),
			encode: (b) => zlib.deflateSync(b)
		};
		default: return null;
	}
}
function createH2Relay(core, allowed) {
	const sessions = /* @__PURE__ */ new Map();
	const plain = (dest) => dest.mode === "http";
	const connectUpstream = (dest) => {
		const have = sessions.get(dest);
		if (have) return have;
		const up = core.upstreamOf(dest);
		const p = new Promise((resolve) => {
			const open = (sock) => {
				const session = http2.connect(`${plain(dest) ? "http" : "https"}://${dest.host}:${dest.port}`, {
					createConnection: () => sock,
					settings: { enablePush: false }
				});
				session.once("connect", () => resolve(session));
				session.once("error", () => {
					sessions.delete(dest);
					resolve(null);
				});
				session.once("close", () => sessions.delete(dest));
			};
			if (plain(dest)) {
				const sock = net.connect(up.port, up.host);
				sock.once("error", () => resolve(null));
				sock.once("connect", () => open(sock));
				return;
			}
			const sock = tls.connect({
				host: up.host,
				port: up.port,
				servername: dest.host,
				ALPNProtocols: ["h2", "http/1.1"],
				...up.ca ? { ca: up.ca } : {}
			});
			sock.once("error", () => {
				sessions.delete(dest);
				resolve(null);
			});
			sock.once("secureConnect", () => {
				if (sock.alpnProtocol !== "h2") {
					sock.destroy();
					resolve(null);
					return;
				}
				open(sock);
			});
		});
		sessions.set(dest, p);
		p.then((s) => {
			if (!s) sessions.delete(dest);
		});
		return p;
	};
	/** The upstream's answer streamed back on `stream`, trailers included. */
	const pipeAnswer = (upReq, stream, onStatus) => {
		let trailers = {};
		upReq.on("trailers", (t) => {
			trailers = Object.fromEntries(Object.entries(t).filter(([k, v]) => !k.startsWith(":") && v !== void 0));
		});
		upReq.on("response", (h) => {
			const outHeaders = {};
			for (const [k, v] of Object.entries(h)) if (v !== void 0 && (k === ":status" || !k.startsWith(":") && !HOP_BY_HOP.has(k))) outHeaders[k] = v;
			if (stream.destroyed || stream.closed) return;
			stream.respond(outHeaders, { waitForTrailers: true });
			stream.on("wantTrailers", () => {
				if (Object.keys(trailers).length > 0) stream.sendTrailers(trailers);
				else stream.close();
			});
			upReq.pipe(stream);
			onStatus(Number(h[":status"]));
		});
		stream.on("close", () => {
			if (!upReq.closed) upReq.close(http2.constants.NGHTTP2_CANCEL);
		});
	};
	const requestHeaders = (method, target, authority, dest, pairs, te) => {
		const h = {
			":method": method,
			":path": target,
			":authority": authority,
			":scheme": plain(dest) ? "http" : "https"
		};
		for (const [k, v] of pairs) {
			const key = k.toLowerCase();
			if (key === "te") continue;
			const existing = h[key];
			h[key] = existing === void 0 ? v : Array.isArray(existing) ? [...existing, v] : [String(existing), v];
		}
		if (typeof te === "string" && te.toLowerCase() === "trailers") h.te = "trailers";
		return h;
	};
	const handleH2 = async (dest, stream, hdrs, rawHeaders) => {
		const method = hdrs[":method"] ?? "GET";
		const target = hdrs[":path"] ?? "/";
		const where = {
			method,
			path: target.split("?")[0]
		};
		const grpc = isGrpc(hdrs["content-type"]);
		stream.on("error", () => {});
		const refuse = (r) => {
			core.refuseEvent(r.code, dest.host, dest.port, r.message, where);
			if (stream.destroyed || stream.closed) return;
			if (!stream.headersSent) {
				if (grpc) {
					stream.respond({
						":status": 200,
						"content-type": "application/grpc",
						"grpc-status": "7",
						"grpc-message": encodeURIComponent(`enclawed-containment: ${r.code}`),
						"x-enclawed-refused": r.code
					}, { endStream: true });
					return;
				}
				stream.respond({
					":status": 403,
					"content-type": "application/json",
					"x-enclawed-refused": r.code
				});
				stream.end(JSON.stringify({
					error: "enclawed-containment",
					code: r.code,
					message: r.message
				}));
			} else stream.close(http2.constants.NGHTTP2_REFUSED_STREAM);
		};
		const bound = core.bind(dest);
		if (!bound.ok) {
			refuse(bound);
			return;
		}
		const authority = hdrs[":authority"] ?? hdrs.host ?? "";
		if (hostOf(authority) !== dest.host) {
			refuse(refusal("host-header-mismatch", `request :authority "${authority}" is not the destination ${dest.host}`));
			return;
		}
		const pairs = [];
		const headers = {};
		for (let i = 0; i < rawHeaders.length; i += 2) {
			const k = rawHeaders[i];
			if (!k.startsWith(":")) {
				pairs.push([k, rawHeaders[i + 1]]);
				headers[k.toLowerCase()] = hdrs[k.toLowerCase()];
			}
		}
		if (grpc) {
			await streamGrpc(dest, stream, hdrs, {
				method,
				target,
				authority,
				pairs,
				headers
			}, bound.call, refuse, where);
			return;
		}
		const body = await readBody(stream);
		if (body === null) {
			refuse(refusal("request-too-large", `request body larger than ${MAX_REQUEST_BODY} bytes cannot be inspected`));
			return;
		}
		const enc = hdrs["content-encoding"];
		const out = await core.inspect(dest, {
			method,
			target,
			authority,
			headerPairs: pairs,
			headers,
			body,
			contentEncoding: typeof enc === "string" ? enc : void 0
		}, bound.call, "request");
		if (!out.ok) {
			refuse(out);
			return;
		}
		const session = dest.shape?.profile === "npm-registry" || dest.shape?.profile === "pypi" ? null : await connectUpstream(dest);
		if (!session) {
			const up = core.upstreamOf(dest);
			const h1 = {};
			for (const [k, v] of out.headerPairs) if (k.toLowerCase() !== "te") h1[k] = v;
			h1.host = authority;
			h1["content-length"] = String(out.body.length);
			const opts = {
				host: up.host,
				port: up.port,
				method,
				path: out.target,
				headers: h1,
				agent: false
			};
			const upReq = plain(dest) ? http.request(opts) : https.request({
				...opts,
				servername: dest.host,
				...up.ca ? { ca: up.ca } : {}
			});
			upReq.on("response", (upRes) => {
				if (out.pin) {
					verifyPinnedAnswer(upRes, out.pin).then((v) => {
						if (!v.ok) {
							refuse(refusal(v.code, v.message));
							return;
						}
						if (stream.destroyed || stream.closed) {
							v.discard();
							return;
						}
						const verified = {
							":status": v.status,
							"content-length": String(v.size)
						};
						for (const [k, x] of Object.entries(v.headers)) if (!HOP_BY_HOP.has(k)) verified[k] = x;
						stream.respond(verified);
						v.open().pipe(stream);
						allowed(dest, "h2", where, v.status, bound.call);
					});
					return;
				}
				const outHeaders = { ":status": upRes.statusCode ?? 502 };
				for (const [k, v] of Object.entries(upRes.headers)) if (v !== void 0 && !HOP_BY_HOP.has(k)) outHeaders[k] = v;
				stream.respond(outHeaders);
				upRes.pipe(stream);
				allowed(dest, "h2", where, upRes.statusCode, bound.call);
			});
			upReq.on("error", (err) => refuse(refusal("upstream-failed", `upstream ${dest.host}:${dest.port}: ${err.message}`)));
			upReq.end(out.body);
			return;
		}
		let upReq;
		try {
			upReq = session.request(requestHeaders(method, out.target, authority, dest, out.headerPairs, hdrs.te), { endStream: false });
		} catch (err) {
			refuse(refusal("upstream-failed", `upstream ${dest.host}:${dest.port}: ${err instanceof Error ? err.message : String(err)}`));
			return;
		}
		pipeAnswer(upReq, stream, (status) => allowed(dest, "h2", where, status, bound.call));
		upReq.on("error", (err) => refuse(refusal("upstream-failed", `upstream ${dest.host}:${dest.port}: ${err.message}`)));
		upReq.end(out.body);
	};
	const streamGrpc = async (dest, stream, hdrs, req, call, refuse, where) => {
		stream.pause();
		const encoding = hdrs["grpc-encoding"];
		const codec = grpcCodec(typeof encoding === "string" ? encoding : void 0);
		if (!codec) {
			refuse(refusal("request-encoding-unsupported", `gRPC encoding "${String(encoding)}" cannot be inspected`));
			return;
		}
		const head = await core.inspect(dest, {
			method: req.method,
			target: req.target,
			authority: req.authority,
			headerPairs: req.pairs,
			headers: req.headers,
			body: Buffer.alloc(0)
		}, call, "request");
		if (!head.ok) {
			refuse(head);
			return;
		}
		const session = await connectUpstream(dest);
		if (!session) {
			refuse(refusal("upstream-failed", `gRPC to ${dest.host}:${dest.port} needs an h2 upstream`));
			return;
		}
		let upReq;
		try {
			upReq = session.request(requestHeaders(req.method, head.target, req.authority, dest, head.headerPairs, hdrs.te), { endStream: false });
		} catch (err) {
			refuse(refusal("upstream-failed", `upstream ${dest.host}:${dest.port}: ${err instanceof Error ? err.message : String(err)}`));
			return;
		}
		let failed = false;
		const fail = (r) => {
			if (failed) return;
			failed = true;
			if (!upReq.closed) upReq.close(http2.constants.NGHTTP2_CANCEL);
			refuse(r);
		};
		pipeAnswer(upReq, stream, (status) => allowed(dest, "h2", where, status, call));
		upReq.on("error", (err) => fail(refusal("upstream-failed", `upstream ${dest.host}:${dest.port}: ${err.message}`)));
		const parser = createGrpcParser();
		const contentType = typeof hdrs["content-type"] === "string" ? hdrs["content-type"] : "application/grpc";
		let chain = Promise.resolve();
		const forward = async (m) => {
			if (failed) return;
			const bound = core.bind(dest);
			if (!bound.ok) {
				fail(bound);
				return;
			}
			let decoded;
			try {
				decoded = m.compressed ? codec.decode(m.payload) : m.payload;
			} catch {
				fail(refusal("request-encoding-unsupported", "a gRPC message could not be decompressed"));
				return;
			}
			const out = await core.inspect(dest, {
				method: req.method,
				target: req.target,
				authority: req.authority,
				headerPairs: [],
				headers: { "content-type": contentType },
				body: decoded
			}, bound.call, "message");
			if (!out.ok) {
				fail(out);
				return;
			}
			const body = out.body.equals(decoded) ? m.payload : m.compressed ? codec.encode(out.body) : out.body;
			upReq.write(grpcFrame(m.compressed, body));
		};
		stream.on("data", (chunk) => {
			const r = parser.push(chunk);
			for (const m of r.messages) chain = chain.then(() => forward(m)).catch(() => fail(refusal("upstream-failed", "message relay failed")));
			if (r.error) {
				const e = r.error;
				chain = chain.then(() => fail(refusal("request-too-large", e)));
			}
		});
		stream.on("end", () => {
			chain = chain.then(() => {
				if (failed) return;
				if (parser.pending() > 0) {
					fail(refusal("routing-body-unparseable", "the gRPC stream ended inside a message"));
					return;
				}
				upReq.end();
			});
		});
		stream.resume();
	};
	return {
		handleH2,
		close() {
			for (const p of sessions.values()) p.then((s) => s?.destroy());
		}
	};
}
//#endregion
//#region src/enclawed/containment/relay-opaque.ts
const MAX_CLIENT_HELLO = 64 * 1024;
const EXT_SERVER_NAME = 0;
const EXT_ECH = 65037;
/** Bytes of the previous read kept for the DLP scan of the next one. */
const DLP_OVERLAP = 4096;
/** Read a TLS ClientHello from the start of `buf` (possibly spread over several records). */
function readClientHello(buf) {
	if (buf.length === 0) return { state: "need-more" };
	if (buf[0] !== 22) return { state: "not-tls" };
	const hs = [];
	let off = 0;
	let have = 0;
	let need = -1;
	while (need < 0 || have < need) {
		if (buf.length < off + 5) return buf.length > MAX_CLIENT_HELLO ? {
			state: "malformed",
			why: "ClientHello too large"
		} : { state: "need-more" };
		if (buf[off] !== 22 || buf[off + 1] !== 3) return {
			state: "malformed",
			why: "not a TLS handshake record"
		};
		const recLen = buf.readUInt16BE(off + 3);
		if (recLen === 0 || recLen > 16640) return {
			state: "malformed",
			why: "bad TLS record length"
		};
		if (buf.length < off + 5 + recLen) return { state: "need-more" };
		hs.push(buf.subarray(off + 5, off + 5 + recLen));
		have += recLen;
		off += 5 + recLen;
		if (need < 0) {
			const first = Buffer.concat(hs);
			if (first.length < 4) continue;
			if (first[0] !== 1) return {
				state: "malformed",
				why: "first handshake message is not a ClientHello"
			};
			need = 4 + first.readUIntBE(1, 3);
			if (need > MAX_CLIENT_HELLO) return {
				state: "malformed",
				why: "ClientHello too large"
			};
		}
	}
	const m = Buffer.concat(hs).subarray(4, need);
	try {
		let p = 34;
		p += 1 + m[p];
		p += 2 + m.readUInt16BE(p);
		p += 1 + m[p];
		if (p === m.length) return {
			state: "hello",
			serverName: null,
			ech: false,
			length: off
		};
		const extEnd = p + 2 + m.readUInt16BE(p);
		p += 2;
		let serverName = null;
		let ech = false;
		while (p + 4 <= extEnd) {
			const type = m.readUInt16BE(p);
			const len = m.readUInt16BE(p + 2);
			const data = m.subarray(p + 4, p + 4 + len);
			if (data.length !== len) return {
				state: "malformed",
				why: "truncated extension"
			};
			if (type === EXT_ECH) ech = true;
			else if (type === EXT_SERVER_NAME) {
				let q = 2;
				const listEnd = 2 + data.readUInt16BE(0);
				while (q + 3 <= listEnd) {
					const nameType = data[q];
					const nameLen = data.readUInt16BE(q + 1);
					const name = data.subarray(q + 3, q + 3 + nameLen);
					if (nameType === 0) {
						if (serverName !== null || !/^[\x21-\x7e]+$/.test(name.toString("latin1"))) return {
							state: "malformed",
							why: "bad or repeated server name"
						};
						serverName = name.toString("ascii").toLowerCase();
					}
					q += 3 + nameLen;
				}
			}
			p += 4 + len;
		}
		return {
			state: "hello",
			serverName,
			ech,
			length: off
		};
	} catch {
		return {
			state: "malformed",
			why: "unreadable ClientHello"
		};
	}
}
const looksLikeClientHello = (b) => b.length >= 3 && b[0] === 22 && b[1] === 3 && b[2] >= 1 && b[2] <= 4;
function serveOpaque(core, sock, dest) {
	const bound = core.bind(dest);
	if (!bound.ok) {
		core.refuseEvent(bound.code, dest.host, dest.port, bound.message);
		sock.destroy();
		return;
	}
	const up = core.upstreamOf(dest);
	const upstream = net.connect(up.port, up.host);
	let done = false;
	const close = () => {
		done = true;
		sock.destroy();
		upstream.destroy();
	};
	const refuse = (code, message) => {
		if (!done) core.refuseEvent(code, dest.host, dest.port, message);
		close();
	};
	upstream.on("error", (err) => refuse("upstream-failed", err.message));
	sock.on("error", close);
	sock.on("close", close);
	upstream.on("close", close);
	upstream.once("connect", () => {
		core.opts.onEvent({
			type: "egress-allowed",
			host: dest.host,
			port: dest.port,
			mode: "opaque",
			callIds: bound.call ? [bound.call.callId] : [],
			at: core.now()
		});
		sock.write(Buffer.from([1]));
		upstream.pipe(sock);
		let mode = "start";
		let pending = Buffer.alloc(0);
		let window = "";
		const secretValues = [...core.opts.secretValues.entries()].filter(([, v]) => v.length >= 8);
		const scanClear = (chunk) => {
			const text = window + chunk.toString("latin1");
			const found = credentialFindings(text);
			if (found.length > 0) {
				refuse("secret-in-request", `the stream to ${dest.host}:${dest.port} carries a credential (${found.join(", ")})`);
				return false;
			}
			for (const [id, v] of secretValues) if (text.includes(v)) {
				refuse("secret-in-request", `the stream to ${dest.host}:${dest.port} carries the value of secret ${id}`);
				return false;
			}
			window = text.slice(-DLP_OVERLAP);
			return true;
		};
		const onHello = () => {
			const v = readClientHello(pending);
			if (v.state === "need-more") return;
			if (v.state !== "hello") {
				refuse("opaque-tls-unreadable", `TLS handshake to ${dest.host}:${dest.port} could not be read: ${v.state === "malformed" ? v.why : "not TLS"}`);
				return;
			}
			if (v.ech) {
				refuse("opaque-tls-name-mismatch", `TLS to ${dest.host}:${dest.port} uses an encrypted ClientHello, whose server name cannot be checked`);
				return;
			}
			if (v.serverName !== dest.host) {
				refuse("opaque-tls-name-mismatch", `TLS to ${dest.host}:${dest.port} names ${v.serverName ?? "no server"}; only ${dest.host} may be reached there`);
				return;
			}
			mode = "tls";
			upstream.write(pending);
			pending = Buffer.alloc(0);
		};
		sock.on("data", (chunk) => {
			if (done) return;
			if (mode === "tls") {
				upstream.write(chunk);
				return;
			}
			if (mode === "hello") {
				pending = Buffer.concat([pending, chunk]);
				onHello();
				return;
			}
			if (mode === "start" && chunk[0] === 22) {
				mode = "hello";
				pending = chunk;
				onHello();
				return;
			}
			mode = "clear";
			if (looksLikeClientHello(chunk)) {
				mode = "hello";
				pending = chunk;
				onHello();
				return;
			}
			if (scanClear(chunk)) upstream.write(chunk);
		});
		sock.resume();
	});
}
//#endregion
//#region src/enclawed/containment/relay-ws.ts
const OP_CONT = 0;
const OP_TEXT = 1;
const OP_BINARY = 2;
const OP_CLOSE = 8;
const OP_PING = 9;
const OP_PONG = 10;
/** One frame, as sent by a client (masked) or by this relay to a client (unmasked). */
function encodeFrame(opcode, payload, mask) {
	const len = payload.length;
	const head = [128 | opcode];
	const m = mask ? 128 : 0;
	if (len < 126) head.push(m | len);
	else if (len < 65536) head.push(m | 126, len >> 8, len & 255);
	else {
		head.push(m | 127);
		const b = Buffer.alloc(8);
		b.writeBigUInt64BE(BigInt(len));
		head.push(...b);
	}
	if (!mask) return Buffer.concat([Buffer.from(head), payload]);
	const key = randomBytes(4);
	const body = Buffer.alloc(len);
	for (let i = 0; i < len; i++) body[i] = payload[i] ^ key[i & 3];
	return Buffer.concat([
		Buffer.from(head),
		key,
		body
	]);
}
const closePayload = (code, reason = "") => {
	const r = Buffer.from(reason.slice(0, 100), "utf8");
	const b = Buffer.alloc(2 + r.length);
	b.writeUInt16BE(code, 0);
	r.copy(b, 2);
	return b;
};
/**
* Incremental parser of client frames. Yields complete messages (data
* messages reassembled from fragments, control frames as they come) or a
* protocol error. Fail closed: unmasked frames, reserved bits (no
* extension is negotiated), reserved opcodes, bad control frames and
* oversize messages are errors.
*/
function createClientFrameParser(max = MAX_REQUEST_BODY) {
	let buf = Buffer.alloc(0);
	let fragOpcode = 0;
	let frags = [];
	let fragSize = 0;
	return { push(chunk) {
		buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk]);
		const messages = [];
		for (;;) {
			if (buf.length < 2) break;
			const b0 = buf[0];
			const b1 = buf[1];
			const fin = (b0 & 128) !== 0;
			const rsv = b0 & 112;
			const opcode = b0 & 15;
			const masked = (b1 & 128) !== 0;
			let len = b1 & 127;
			let off = 2;
			if (len === 126) {
				if (buf.length < 4) break;
				len = buf.readUInt16BE(2);
				off = 4;
			} else if (len === 127) {
				if (buf.length < 10) break;
				const big = buf.readBigUInt64BE(2);
				if (big > BigInt(max)) return {
					messages,
					error: `frame larger than ${max} bytes`
				};
				len = Number(big);
				off = 10;
			}
			if (!masked) return {
				messages,
				error: "unmasked client frame"
			};
			if (rsv !== 0) return {
				messages,
				error: "reserved bits set (no extension was negotiated)"
			};
			if (len > max) return {
				messages,
				error: `frame larger than ${max} bytes`
			};
			if (buf.length < off + 4 + len) break;
			const key = buf.subarray(off, off + 4);
			const payload = Buffer.alloc(len);
			for (let i = 0; i < len; i++) payload[i] = buf[off + 4 + i] ^ key[i & 3];
			buf = buf.subarray(off + 4 + len);
			if (opcode >= 8) {
				if (![
					OP_CLOSE,
					OP_PING,
					OP_PONG
				].includes(opcode)) return {
					messages,
					error: `reserved control opcode ${opcode}`
				};
				if (!fin || len > 125) return {
					messages,
					error: "fragmented or oversize control frame"
				};
				messages.push({
					opcode,
					payload
				});
				continue;
			}
			if (opcode === OP_CONT) {
				if (fragOpcode === 0) return {
					messages,
					error: "continuation without a message"
				};
			} else if (opcode === OP_TEXT || opcode === OP_BINARY) {
				if (fragOpcode !== 0) return {
					messages,
					error: "new message inside a fragmented one"
				};
				fragOpcode = opcode;
			} else return {
				messages,
				error: `reserved data opcode ${opcode}`
			};
			fragSize += len;
			if (fragSize > max) return {
				messages,
				error: `message larger than ${max} bytes`
			};
			frags.push(payload);
			if (fin) {
				messages.push({
					opcode: fragOpcode,
					payload: Buffer.concat(frags)
				});
				fragOpcode = 0;
				frags = [];
				fragSize = 0;
			}
		}
		return {
			messages,
			error: null
		};
	} };
}
function rawResponse(socket, status, body, extra = {}) {
	const head = [
		`HTTP/1.1 ${status} ${http.STATUS_CODES[status] ?? ""}`,
		"content-type: application/json",
		`content-length: ${Buffer.byteLength(body)}`,
		"connection: close",
		...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
		"",
		""
	].join("\r\n");
	socket.end(head + body);
}
function serveWebSocket(core, dest, req, client, head) {
	const target = req.url ?? "/";
	const where = {
		method: "GET",
		path: target.split("?")[0]
	};
	const refuseHandshake = (r) => {
		core.refuseEvent(r.code, dest.host, dest.port, r.message, where);
		rawResponse(client, 403, JSON.stringify({
			error: "enclawed-containment",
			code: r.code,
			message: r.message
		}), { "x-enclawed-refused": r.code });
	};
	const upgrade = (req.headers.upgrade ?? "").toLowerCase();
	if (upgrade !== "websocket" || req.method !== "GET" || req.headers["sec-websocket-version"] !== "13" || typeof req.headers["sec-websocket-key"] !== "string") {
		refuseHandshake(refusal("upgrade-unsupported", `upgrade "${upgrade}" is not a WebSocket handshake; refused`));
		return;
	}
	const bound = core.bind(dest);
	if (!bound.ok) {
		refuseHandshake(bound);
		return;
	}
	const pairs = [];
	for (let i = 0; i < req.rawHeaders.length; i += 2) if (req.rawHeaders[i].toLowerCase() !== "sec-websocket-extensions") pairs.push([req.rawHeaders[i], req.rawHeaders[i + 1]]);
	const authority = req.headers.host ?? "";
	core.inspect(dest, {
		method: "GET",
		target,
		authority,
		headerPairs: pairs,
		headers: req.headers,
		body: Buffer.alloc(0)
	}, bound.call, "request").then((out) => {
		if (!out.ok) {
			refuseHandshake(out);
			return;
		}
		const headers = {};
		for (const [k, v] of out.headerPairs) headers[k] = v;
		headers.host = authority;
		headers.connection = "Upgrade";
		headers.upgrade = "websocket";
		const up = core.upstreamOf(dest);
		const upReq = (dest.mode === "http" ? http : https).request({
			host: up.host,
			port: up.port,
			method: "GET",
			path: out.target,
			headers,
			...dest.mode === "http" ? {} : {
				servername: dest.host,
				ALPNProtocols: ["http/1.1"],
				...up.ca ? { ca: up.ca } : {}
			},
			agent: false
		});
		upReq.on("error", (err) => refuseHandshake(refusal("upstream-failed", `upstream ${dest.host}:${dest.port}: ${err.message}`)));
		upReq.on("response", (upRes) => {
			const chunks = [];
			upRes.on("data", (c) => chunks.push(c));
			upRes.on("end", () => {
				const body = Buffer.concat(chunks);
				const lines = [`HTTP/1.1 ${upRes.statusCode ?? 502} ${upRes.statusMessage ?? ""}`];
				for (let i = 0; i < upRes.rawHeaders.length; i += 2) {
					const k = upRes.rawHeaders[i].toLowerCase();
					if (![
						"connection",
						"transfer-encoding",
						"content-length",
						"keep-alive"
					].includes(k)) lines.push(`${upRes.rawHeaders[i]}: ${upRes.rawHeaders[i + 1]}`);
				}
				lines.push(`content-length: ${body.length}`, "connection: close", "", "");
				client.end(Buffer.concat([Buffer.from(lines.join("\r\n"), "latin1"), body]));
			});
		});
		upReq.on("upgrade", (upRes, upSock, upHead) => {
			if (upRes.headers["sec-websocket-extensions"]) {
				upSock.destroy();
				refuseHandshake(refusal("websocket-extension-refused", "the server negotiated a WebSocket extension that was not offered"));
				return;
			}
			const lines = ["HTTP/1.1 101 Switching Protocols"];
			for (let i = 0; i < upRes.rawHeaders.length; i += 2) lines.push(`${upRes.rawHeaders[i]}: ${upRes.rawHeaders[i + 1]}`);
			lines.push("", "");
			client.write(lines.join("\r\n"));
			if (upHead.length > 0) client.write(upHead);
			core.opts.onEvent({
				type: "egress-allowed",
				host: dest.host,
				port: dest.port,
				mode: dest.mode,
				protocol: "websocket",
				...where,
				status: 101,
				callIds: bound.call ? [bound.call.callId] : [],
				at: core.now()
			});
			relayFrames(core, dest, target, authority, client, upSock, head);
		});
		upReq.end();
	});
}
function relayFrames(core, dest, target, authority, client, upSock, head) {
	const parser = createClientFrameParser();
	let closed = false;
	const shut = (r) => {
		if (closed) return;
		closed = true;
		core.refuseEvent(r.code, dest.host, dest.port, r.message, {
			method: "WEBSOCKET",
			path: target.split("?")[0]
		});
		client.end(encodeFrame(OP_CLOSE, closePayload(1008, r.code), false));
		upSock.end(encodeFrame(OP_CLOSE, closePayload(1001), true));
		setTimeout(() => {
			client.destroy();
			upSock.destroy();
		}, 200).unref();
	};
	upSock.pipe(client);
	upSock.on("error", () => client.destroy());
	upSock.on("close", () => client.end());
	client.on("error", () => upSock.destroy());
	client.on("close", () => upSock.destroy());
	let chain = Promise.resolve();
	const forward = async (m) => {
		if (closed) return;
		const bound = core.bind(dest);
		if (m.opcode >= 8) {
			if (!bound.ok || m.payload.length === 0) {
				const payload = m.opcode === OP_CLOSE && m.payload.length >= 2 ? m.payload.subarray(0, 2) : Buffer.alloc(0);
				upSock.write(encodeFrame(m.opcode, payload, true));
				return;
			}
		} else if (!bound.ok) {
			shut(bound);
			return;
		}
		const call = bound.ok ? bound.call : null;
		const text = m.opcode === OP_TEXT ? m.payload.toString("utf8") : null;
		const json = text !== null && /^\s*[[{]/.test(text);
		const out = await core.inspect(dest, {
			method: "WEBSOCKET",
			target,
			authority,
			headerPairs: [],
			headers: json ? { "content-type": "application/json" } : {},
			body: m.payload
		}, call, "message");
		if (!out.ok) {
			shut(out);
			return;
		}
		if (m.opcode >= 8 && out.body.length > 125) {
			shut(refusal("websocket-protocol-error", "a control frame grew beyond 125 bytes"));
			return;
		}
		upSock.write(encodeFrame(m.opcode, out.body, true));
	};
	const onData = (chunk) => {
		const r = parser.push(chunk);
		for (const m of r.messages) chain = chain.then(() => forward(m)).catch(() => shut(refusal("websocket-protocol-error", "message relay failed")));
		if (r.error) {
			const err = r.error;
			chain = chain.then(() => shut(refusal("websocket-protocol-error", err)));
		}
	};
	if (head.length > 0) onData(head);
	client.on("data", onData);
}
//#endregion
//#region src/enclawed/containment/relay.ts
/** Longest delay the egress pipeline may impose on one request. */
const MAX_PIPELINE_DELAY_MS = 3e4;
/**
* The capacity ledger of each generic-profile destination (internal
* constants, never settings): a burst of 16 Kibit of path choice, refilled at
* 64 bit/s. A request whose bits of choice (./request-shape-profiles.ts) do
* not fit is refused (request-shape-capacity), so no declared destination
* carries more than this out of the process, whatever its paths spell.
*/
const GENERIC_LEDGER_BURST_BITS = 16 * 1024;
function decodeBody(encoding, body) {
	const enc = (encoding ?? "identity").toLowerCase().trim();
	try {
		switch (enc) {
			case "":
			case "identity": return body;
			case "gzip":
			case "x-gzip": return zlib.gunzipSync(body);
			case "deflate": return zlib.inflateSync(body);
			case "br": return zlib.brotliDecompressSync(body);
			default: return null;
		}
	} catch {
		return null;
	}
}
function createEgressRelay(opts) {
	const calls = /* @__PURE__ */ new Map();
	const queue = [];
	const sockets = /* @__PURE__ */ new Set();
	const now = () => (/* @__PURE__ */ new Date()).toISOString();
	const ledgers = /* @__PURE__ */ new Map();
	const ledgerOf = (key) => {
		let l = ledgers.get(key);
		if (!l) {
			l = createCapacityLedger({
				capacityBits: GENERIC_LEDGER_BURST_BITS,
				refillBitsPerSec: 64,
				...opts.ledgerClock ? { now: opts.ledgerClock } : {}
			});
			ledgers.set(key, l);
		}
		return l;
	};
	const findDest = (host, port) => host ? opts.destinations.find((d) => d.host === host.toLowerCase() && d.port === port) ?? null : null;
	const refuseEvent = (code, host, port, message, extra = {}) => {
		opts.onEvent({
			type: "egress-refused",
			code,
			host,
			port,
			...extra,
			callIds: [...calls.keys()],
			message,
			at: now()
		});
	};
	const bind = (dest) => {
		const inFlight = [...calls.values()];
		if (inFlight.length > 1) return refusal("call-ambiguous", `request to ${dest.host} while ${inFlight.length} tool calls are in flight: it cannot be bound to one call`);
		if (inFlight.length === 0) return dest.background ? {
			ok: true,
			call: null
		} : refusal("no-call-in-flight", `request to ${dest.host} with no tool call in flight; not a declared background destination`);
		return {
			ok: true,
			call: inFlight[0]
		};
	};
	const inspect = async (dest, facts, call, kind) => {
		if (kind === "request" && hostOf(facts.authority) !== dest.host) return refusal("host-header-mismatch", `request Host "${facts.authority}" is not the destination ${dest.host}`);
		const shape = dest.shape ?? GENERIC_SHAPE;
		const shapeBody = shape.profile === "api" && facts.body.length > 0 && facts.body.length <= 16777216 ? decodeBody(facts.contentEncoding, facts.body) : null;
		const shaped = checkRequestShape(shape, {
			method: facts.method,
			target: facts.target,
			headerPairs: facts.headerPairs,
			bodyLength: facts.body.length,
			body: shapeBody,
			kind
		});
		if (!shaped.ok) return refusal(shaped.code, shaped.message);
		if (shaped.bits > 0 && !ledgerOf(`${dest.host}:${dest.port}`).tryConsume(shaped.bits)) return refusal("request-shape-capacity", `${dest.host} takes no more requests now: the paths sent to it already carried what a destination without an API profile may carry`);
		if (facts.body.length > 16777216) return refusal("request-too-large", `request body larger than ${MAX_REQUEST_BODY} bytes cannot be inspected`);
		const decoded = decodeBody(facts.contentEncoding, facts.body);
		if (decoded === null) return refusal("request-encoding-unsupported", `request body encoding "${String(facts.contentEncoding)}" cannot be inspected`);
		const encoded = decoded !== facts.body;
		const headerText = facts.headerPairs.map(([k, v]) => `${k}\n${v}`).join("\n");
		const bodyText = decoded.toString("utf8");
		const destKey = `${dest.host}:${dest.port}`;
		const present = [];
		for (const s of opts.secrets) {
			const handle = opts.handles.get(s.id);
			if (!handle) continue;
			if (facts.target.includes(handle) || headerText.includes(handle) || bodyText.includes(handle)) {
				if (!s.destinations.map((d) => d.toLowerCase()).includes(destKey)) return refusal("secret-handle-wrong-destination", `secret ${s.id} may only be sent to ${s.destinations.join(", ")}, not ${destKey}`);
				if (encoded && bodyText.includes(handle)) return refusal("secret-handle-in-encoded-body", `secret ${s.id} appears in a compressed body, where it cannot be substituted`);
				present.push(s);
			}
		}
		const inspected = `${facts.target}\n${headerText}\n${bodyText}`;
		const found = credentialFindings(inspected);
		if (found.length > 0) return refusal("secret-in-request", `the request carries a credential (${found.join(", ")})`);
		for (const [id, value] of opts.secretValues) if (value.length >= 8 && inspected.includes(value)) return refusal("secret-in-request", `the request carries the value of secret ${id}, which the process should only hold as a handle`);
		const supplied = suppliedValues([...call ? [call.arguments] : [], ...dest.constants]);
		const contentType = facts.headers["content-type"];
		const routing = checkRoutingProvenance({
			host: dest.host,
			method: facts.method,
			target: facts.target,
			headers: facts.headers,
			contentType: typeof contentType === "string" ? contentType : void 0,
			body: decoded
		}, dest.profiles, supplied);
		if (!routing.ok) return refusal(routing.code, routing.message);
		let outBody = facts.body;
		if (opts.egressRunner && bodyText.length > 0) {
			let result;
			try {
				result = await opts.egressRunner(bodyText, {
					kind: "tool-call",
					id: `containment:${opts.label}:${dest.host}`,
					toolName: call?.tool
				});
			} catch (err) {
				return refusal("egress-pipeline-error", `egress pipeline failed: ${err instanceof Error ? err.message : String(err)}`);
			}
			if (result.cancelled) return refusal("egress-pipeline-cancelled", `egress pipeline refused the request: ${result.reason}`);
			if (result.content !== bodyText) {
				if (encoded) return refusal("egress-pipeline-error", "egress pipeline rewrote a compressed body, which cannot be re-encoded faithfully");
				outBody = Buffer.from(result.content, "utf8");
			}
			if (result.delayMs > 0) await new Promise((r) => setTimeout(r, Math.min(result.delayMs, MAX_PIPELINE_DELAY_MS)));
		}
		const scheme = dest.mode === "http" ? "http" : "https";
		const defaultPort = dest.mode === "http" ? 80 : 443;
		const url = `${scheme}://${dest.host}${dest.port === defaultPort ? "" : `:${dest.port}`}${facts.target}`;
		if (call) try {
			await requestToolIssueSlot(call.tool, url, call.callId);
		} catch {
			return refusal("batcher-slot-refused", "the egress batcher refused this request's slot");
		}
		const substitute = (text) => {
			let out = text;
			for (const s of present) {
				const handle = opts.handles.get(s.id);
				const value = opts.secretValues.get(s.id);
				if (value !== void 0) out = out.split(handle).join(value);
			}
			return out;
		};
		if (present.length > 0 && !encoded) for (const s of present) {
			const value = opts.secretValues.get(s.id);
			if (value !== void 0) outBody = replaceBytes(outBody, Buffer.from(opts.handles.get(s.id), "utf8"), Buffer.from(value, "utf8"));
		}
		const headerPairs = [];
		for (const [k, v] of facts.headerPairs) {
			const name = k.toLowerCase();
			if (HOP_BY_HOP.has(name) || shaped.drop.has(name)) continue;
			const rewritten = shaped.rewrite.get(name);
			if (rewritten === null) continue;
			headerPairs.push([k, rewritten === void 0 ? substitute(v) : rewritten]);
		}
		return {
			ok: true,
			body: outBody,
			headerPairs,
			target: substitute(facts.target),
			pin: facts.method === "GET" ? shaped.pin : null
		};
	};
	const upstreamOf = (dest) => opts.upstream?.(dest.host, dest.port) ?? {
		host: dest.host,
		port: dest.port
	};
	const core = {
		opts,
		now,
		refuseEvent,
		bind,
		inspect,
		upstreamOf,
		callIds: () => [...calls.keys()]
	};
	const allowed = (dest, protocol, where, status, call) => opts.onEvent({
		type: "egress-allowed",
		host: dest.host,
		port: dest.port,
		mode: dest.mode,
		protocol,
		...where,
		status,
		callIds: call ? [call.callId] : [],
		at: now()
	});
	const handleH1 = async (dest, req, res, noBody = false) => {
		const method = req.method ?? "GET";
		const target = req.url ?? "/";
		const where = {
			method,
			path: target.split("?")[0]
		};
		const refuse = (r) => {
			refuseEvent(r.code, dest.host, dest.port, r.message, where);
			if (!res.headersSent) {
				const body = JSON.stringify({
					error: "enclawed-containment",
					code: r.code,
					message: r.message
				});
				res.writeHead(403, {
					"content-type": "application/json",
					"content-length": Buffer.byteLength(body),
					"x-enclawed-refused": r.code,
					connection: "close"
				});
				res.end(body);
			} else res.destroy();
		};
		const bound = bind(dest);
		if (!bound.ok) {
			refuse(bound);
			return;
		}
		if (hostOf(req.headers.host ?? "") !== dest.host) {
			refuse(refusal("host-header-mismatch", `request Host "${req.headers.host ?? ""}" is not the destination ${dest.host}`));
			return;
		}
		const body = noBody ? Buffer.alloc(0) : await readBody(req);
		if (body === null) {
			refuse(refusal("request-too-large", `request body larger than ${MAX_REQUEST_BODY} bytes cannot be inspected`));
			return;
		}
		const pairs = [];
		for (let i = 0; i < req.rawHeaders.length; i += 2) pairs.push([req.rawHeaders[i], req.rawHeaders[i + 1]]);
		const enc = req.headers["content-encoding"];
		const out = await inspect(dest, {
			method,
			target,
			authority: req.headers.host ?? "",
			headerPairs: pairs,
			headers: req.headers,
			body,
			contentEncoding: typeof enc === "string" ? enc : void 0
		}, bound.call, "request");
		if (!out.ok) {
			refuse(out);
			return;
		}
		const headers = {};
		for (const [k, v] of out.headerPairs) {
			const existing = headers[k];
			headers[k] = existing === void 0 ? v : Array.isArray(existing) ? [...existing, v] : [existing, v];
		}
		headers.host = req.headers.host ?? dest.host;
		headers["content-length"] = String(out.body.length);
		const up = upstreamOf(dest);
		const upReq = (dest.mode === "http" ? http : https).request({
			host: up.host,
			port: up.port,
			method,
			path: out.target,
			headers,
			...dest.mode === "http" ? {} : {
				servername: dest.host,
				ALPNProtocols: ["http/1.1"],
				...up.ca ? { ca: up.ca } : {}
			},
			agent: false
		});
		upReq.on("response", (upRes) => {
			if (out.pin) {
				verifyPinnedAnswer(upRes, out.pin).then((v) => {
					if (!v.ok) {
						refuse(refusal(v.code, v.message));
						return;
					}
					res.writeHead(v.status, {
						...v.headers,
						"content-length": String(v.size)
					});
					v.open().pipe(res);
					allowed(dest, "http/1.1", where, v.status, bound.call);
				});
				return;
			}
			const outHeaders = {};
			for (const [k, v] of Object.entries(upRes.headers)) if (v !== void 0 && ![
				"connection",
				"keep-alive",
				"transfer-encoding"
			].includes(k)) outHeaders[k] = v;
			res.writeHead(upRes.statusCode ?? 502, outHeaders);
			upRes.pipe(res);
			allowed(dest, "http/1.1", where, upRes.statusCode, bound.call);
		});
		upReq.on("error", (err) => refuse(refusal("upstream-failed", `upstream ${dest.host}:${dest.port}: ${err.message}`)));
		upReq.end(out.body);
	};
	const destOf = /* @__PURE__ */ new WeakMap();
	/**
	* An HTTP/1.1 request with an Upgrade header: WebSocket goes through
	* ./relay-ws.ts; an h2c upgrade offer (curl --http2 on http://) is
	* declined the way RFC 9113 allows, by answering it as HTTP/1.1.
	*/
	const upgradeOrRequest = (dest, req, socket, head) => {
		if ((req.headers.upgrade ?? "").toLowerCase() === "h2c" && !req.headers["content-length"] && !req.headers["transfer-encoding"]) {
			const res = new http.ServerResponse(req);
			res.assignSocket(socket);
			res.shouldKeepAlive = false;
			res.on("finish", () => socket.end());
			if (head.length > 0) socket.unshift(head);
			handleH1(dest, req, res, true).catch(() => socket.destroy());
			return;
		}
		serveWebSocket(core, dest, req, socket, head);
	};
	const httpServer = http.createServer((req, res) => {
		const dest = destOf.get(req.socket);
		if (!dest) {
			res.destroy();
			return;
		}
		handleH1(dest, req, res).catch((err) => {
			refuseEvent("upstream-failed", dest.host, dest.port, `relay error: ${err instanceof Error ? err.message : String(err)}`);
			res.destroy();
		});
	});
	httpServer.keepAliveTimeout = 5e3;
	httpServer.on("upgrade", (req, socket, head) => {
		const dest = destOf.get(req.socket) ?? destOf.get(socket);
		if (!dest) {
			socket.destroy();
			return;
		}
		upgradeOrRequest(dest, req, socket, head);
	});
	httpServer.on("connect", (req, socket) => {
		const dest = destOf.get(socket);
		refuseEvent("upgrade-unsupported", dest?.host ?? null, dest?.port ?? 0, "CONNECT through an inspected destination is refused", {
			method: "CONNECT",
			path: req.url ?? ""
		});
		socket.destroy();
	});
	const h2 = createH2Relay(core, allowed);
	const handleH2 = h2.handleH2;
	const secureServers = /* @__PURE__ */ new Map();
	const secureServerFor = (dest) => {
		const have = secureServers.get(dest);
		if (have) return have;
		const leaf = opts.ca.leafFor(dest.host);
		const s = http2.createSecureServer({
			key: leaf.keyPem,
			cert: leaf.certPem,
			allowHTTP1: true,
			settings: { enablePush: false },
			SNICallback: (servername, cb) => {
				if (servername.toLowerCase() !== dest.host) {
					refuseEvent("tls-name-mismatch", dest.host, dest.port, `TLS server name ${servername} is not ${dest.host}`);
					cb(/* @__PURE__ */ new Error("server name mismatch"));
					return;
				}
				cb(null, tls.createSecureContext({
					key: leaf.keyPem,
					cert: leaf.certPem
				}));
			}
		});
		s.on("request", (req, res) => {
			if (req.httpVersionMajor >= 2) return;
			handleH1(dest, req, res).catch((err) => {
				refuseEvent("upstream-failed", dest.host, dest.port, `relay error: ${err instanceof Error ? err.message : String(err)}`);
				res.destroy();
			});
		});
		for (const l of s.listeners("stream")) s.removeListener("stream", l);
		s.on("stream", (stream, hdrs, _flags, rawHeaders) => {
			handleH2(dest, stream, hdrs, rawHeaders).catch((err) => {
				refuseEvent("upstream-failed", dest.host, dest.port, `relay error: ${err instanceof Error ? err.message : String(err)}`);
				stream.destroy();
			});
		});
		s.on("upgrade", (req, socket, head) => upgradeOrRequest(dest, req, socket, head));
		s.on("connect", (req, socket) => {
			refuseEvent("upgrade-unsupported", dest.host, dest.port, "CONNECT through an inspected destination is refused", {
				method: "CONNECT",
				path: req.url ?? ""
			});
			socket.destroy();
		});
		s.on("tlsClientError", (err) => {
			refuseEvent("tls-handshake-failed", dest.host, dest.port, `TLS with the contained process failed: ${err.message}`);
		});
		s.on("sessionError", () => {});
		secureServers.set(dest, s);
		return s;
	};
	const h2cServers = /* @__PURE__ */ new Map();
	const h2cServerFor = (dest) => {
		let s = h2cServers.get(dest);
		if (!s) {
			s = http2.createServer({ settings: { enablePush: false } });
			s.on("stream", (stream, hdrs, _flags, rawHeaders) => {
				handleH2(dest, stream, hdrs, rawHeaders).catch((err) => {
					refuseEvent("upstream-failed", dest.host, dest.port, `relay error: ${err instanceof Error ? err.message : String(err)}`);
					stream.destroy();
				});
			});
			s.on("sessionError", () => {});
			h2cServers.set(dest, s);
		}
		return s;
	};
	const serveInspected = (sock, dest) => {
		sock.write(Buffer.from([1]));
		if (dest.mode === "http") {
			sock.once("data", (first) => {
				sock.pause();
				if (first.toString("latin1").startsWith("PRI ")) {
					const duplex = new Duplex({
						read() {
							sock.resume();
						},
						write(chunk, _enc, cb) {
							sock.write(chunk, cb);
						},
						final(cb) {
							sock.end();
							cb();
						},
						destroy(err, cb) {
							sock.destroy();
							cb(err);
						}
					});
					duplex.push(first);
					sock.on("data", (c) => {
						if (!duplex.push(c)) sock.pause();
					});
					sock.on("end", () => duplex.push(null));
					sock.on("close", () => duplex.destroy());
					h2cServerFor(dest).emit("connection", duplex);
					return;
				}
				sock.unshift(first);
				destOf.set(sock, dest);
				httpServer.emit("connection", sock);
				sock.resume();
			});
			sock.resume();
			return;
		}
		secureServerFor(dest).emit("connection", sock);
		sock.resume();
	};
	const end = (callId) => {
		calls.delete(callId);
		if (calls.size === 0) queue.shift()?.();
	};
	return {
		handle(sock) {
			sockets.add(sock);
			sock.on("close", () => sockets.delete(sock));
			sock.on("error", () => sock.destroy());
			let head = "";
			const onData = (chunk) => {
				head += chunk.toString("latin1");
				const nl = head.indexOf("\n");
				if (nl < 0) {
					if (head.length > 4096) sock.destroy();
					return;
				}
				sock.removeListener("data", onData);
				sock.pause();
				let meta;
				try {
					meta = JSON.parse(head.slice(0, nl));
				} catch {
					sock.destroy();
					return;
				}
				if (!meta.name) {
					refuseEvent("destination-unnamed", null, meta.port, `connection on port ${meta.port} to an address no looked-up name maps to`);
					sock.destroy();
					return;
				}
				const dest = findDest(meta.name, meta.port);
				if (!dest) {
					refuseEvent("destination-not-declared", meta.name, meta.port, `${meta.name}:${meta.port} is not a declared destination`);
					sock.destroy();
					return;
				}
				if (dest.mode === "opaque") serveOpaque(core, sock, dest);
				else serveInspected(sock, dest);
			};
			sock.on("data", onData);
		},
		acquireCall(call) {
			return new Promise((resolve) => {
				const admit = () => {
					calls.set(call.callId, call);
					resolve(() => end(call.callId));
				};
				if (calls.size === 0 && queue.length === 0) admit();
				else queue.push(admit);
			});
		},
		beginCall(call) {
			calls.set(call.callId, call);
		},
		endCall(callId) {
			end(callId);
		},
		close() {
			for (const s of sockets) s.destroy();
			httpServer.close();
			for (const s of secureServers.values()) s.close();
			h2.close();
			for (const s of h2cServers.values()) s.close();
		}
	};
}
//#endregion
//#region src/enclawed/containment/host.ts
const SYSTEM_DIRS = [
	"/usr/bin",
	"/bin",
	"/usr/sbin",
	"/sbin"
];
function systemBinary(name) {
	for (const d of SYSTEM_DIRS) {
		const p = path.join(d, name);
		try {
			if (fs.statSync(p).isFile()) return p;
		} catch {}
	}
	return null;
}
const OUTER_FLAGS = [
	"--user",
	"--map-root-user",
	"--net",
	"--mount",
	"--pid",
	"--fork",
	"--mount-proc",
	"--kill-child"
];
let support = null;
/** Can this host contain a process? Probed once (cached): the same nesting the real start uses. */
function containmentSupport(platform = process.platform) {
	if (platform !== process.platform) return unavailable(platform);
	if (support) return support;
	support = probe();
	return support;
}
function unavailable(platform) {
	return {
		ok: false,
		code: "containment-unavailable",
		reason: platform === "darwin" ? "macOS has no unprivileged mount and network namespaces; the containment backend for macOS does not exist yet" : platform === "win32" ? "Windows needs an AppContainer + WFP backend, which does not exist yet" : `containment needs Linux namespaces (platform ${platform})`
	};
}
function probe() {
	if (process.platform !== "linux") return unavailable(process.platform);
	const unshare = systemBinary("unshare");
	const bwrap = systemBinary("bwrap");
	const ip = systemBinary("ip");
	const mount = systemBinary("mount");
	if (!unshare || !mount) return {
		ok: false,
		code: "containment-unavailable",
		reason: "util-linux (unshare, mount) is not installed"
	};
	if (!bwrap) return {
		ok: false,
		code: "containment-unavailable",
		reason: "bubblewrap (bwrap) is not installed"
	};
	if (!ip) return {
		ok: false,
		code: "containment-unavailable",
		reason: "iproute2 (ip) is not installed"
	};
	return spawnSync(unshare, [
		...OUTER_FLAGS,
		bwrap,
		"--unshare-user",
		"--disable-userns",
		"--unshare-pid",
		"--dev-bind",
		"/",
		"/",
		"--",
		"/bin/true"
	], {
		stdio: "ignore",
		timeout: 15e3,
		env: { PATH: "/usr/bin:/bin" }
	}).status === 0 ? { ok: true } : {
		ok: false,
		code: "containment-unavailable",
		reason: "unprivileged (nested) user namespaces are disabled on this host"
	};
}
/** For tests: forget the cached probe. */
function resetContainmentSupportForTest() {
	support = null;
}
var ContainmentUnavailableError = class extends Error {
	constructor(reason) {
		super(`enclawed containment: ${reason}`);
		this.reason = reason;
		this.name = "ContainmentUnavailableError";
		this.code = "containment-unavailable";
	}
};
/** The message shown when a process that must be contained is not started. */
function uncontainedRefusal(label, kind, reason) {
	return `Enclawed: ${kind === "mcp-server" ? `MCP server "${label}"` : kind === "package-install" ? `package install "${label}"` : `project script "${label}"`} was not started: it may only run contained, and containment is not available here (${reason}). Nothing was run. On Linux, install util-linux, iproute2 and bubblewrap and enable unprivileged user namespaces.`;
}
function containInitCommand() {
	const here = path.dirname(fileURLToPath(import.meta.url));
	const roots = [
		here,
		path.join(here, ".."),
		path.join(here, "..", "..")
	];
	const relatives = ["contain-init.js", path.join("enclawed", "containment", "contain-init.js")];
	for (const root of roots) for (const rel of relatives) {
		const c = path.join(root, rel);
		if (fs.existsSync(c)) return [process.execPath, c];
	}
	const src = path.join(here, "contain-init.ts");
	if (fs.existsSync(src)) return [
		process.execPath,
		"--import",
		fileURLToPath(import.meta.resolve("tsx")),
		src
	];
	throw new Error("enclawed containment: contain-init is missing from this install");
}
function journalPath(stateDir) {
	return path.join(stateDir, "containment-placeholders.json");
}
function readJournal(stateDir) {
	try {
		const v = JSON.parse(fs.readFileSync(journalPath(stateDir), "utf8"));
		return Array.isArray(v) ? v.filter((e) => e && typeof e.path === "string") : [];
	} catch {
		return [];
	}
}
function writeJournal(stateDir, entries) {
	const tmp = `${journalPath(stateDir)}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(entries), { mode: 384 });
	fs.renameSync(tmp, journalPath(stateDir));
}
function withJournal(stateDir, fn) {
	fs.mkdirSync(stateDir, {
		recursive: true,
		mode: 448
	});
	const lock = `${journalPath(stateDir)}.lock`;
	const deadline = Date.now() + 1e4;
	for (;;) try {
		fs.closeSync(fs.openSync(lock, "wx", 384));
		break;
	} catch {
		try {
			const holder = Number(fs.readFileSync(lock, "utf8"));
			if (holder && !pidAlive(holder)) {
				fs.rmSync(lock, { force: true });
				continue;
			}
		} catch {}
		if (Date.now() > deadline) throw new Error("enclawed containment: placeholder journal is locked");
		spinWait(20);
	}
	try {
		fs.writeFileSync(lock, String(process.pid));
		const entries = readJournal(stateDir);
		const out = fn(entries);
		writeJournal(stateDir, entries);
		return out;
	} finally {
		fs.rmSync(lock, { force: true });
	}
}
function spinWait(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function pidAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return err.code === "EPERM";
	}
}
const ownerAlive = (owner) => pidAlive(Number(owner.split(":")[0]));
const BLOCK_START = "# >>> enclawed containment placeholder ";
const BLOCK_END = "# <<< enclawed containment placeholder ";
/** `text` without the exclude blocks of the owners `drop` selects. */
function stripBlocks(text, drop) {
	const out = [];
	let skipping = null;
	for (const line of text.split("\n")) {
		if (skipping === null && line.startsWith(BLOCK_START)) {
			const owner = line.slice(39).trim();
			if (drop(owner)) {
				skipping = owner;
				continue;
			}
		}
		if (skipping !== null) {
			if (line === `${BLOCK_END}${skipping}`) skipping = null;
			continue;
		}
		out.push(line);
	}
	return out.join("\n");
}
/** Remove `e` if it is still the placeholder recorded; true when it is gone (or no longer ours). */
function removeIfUnused(e) {
	try {
		if (e.kind === "exclude") {
			const text = fs.readFileSync(e.path, "utf8");
			const kept = stripBlocks(text, (o) => !e.owners.includes(o));
			if (kept !== text) fs.writeFileSync(e.path, kept);
			return e.owners.length === 0;
		}
		const st = fs.lstatSync(e.path);
		if (st.dev !== e.dev || st.ino !== e.ino) return true;
		if (e.kind === "file") {
			if (!st.isFile() || fs.readFileSync(e.path, "utf8") !== (e.content ?? "")) return true;
			fs.unlinkSync(e.path);
			return true;
		}
		if (!st.isDirectory() || fs.readdirSync(e.path).length > 0) return true;
		fs.rmdirSync(e.path);
		return true;
	} catch {
		return true;
	}
}
function prune(entries) {
	for (const e of entries) e.owners = e.owners.filter(ownerAlive);
	entries.sort((a, b) => b.path.length - a.path.length);
	const keep = entries.filter((e) => {
		if (e.kind === "exclude") {
			removeIfUnused(e);
			return e.owners.length > 0;
		}
		return e.owners.length > 0 || !removeIfUnused(e);
	});
	entries.splice(0, entries.length, ...keep);
}
/** Remove placeholders left by containments whose process is gone (crash). */
function sweepPlaceholders(stateDir) {
	withJournal(stateDir, prune);
}
/** The git work tree top and info/exclude file that `p` belongs to, or null. */
function gitExcludeOf(p) {
	for (let d = path.dirname(p);; d = path.dirname(d)) {
		const dotGit = path.join(d, ".git");
		try {
			const st = fs.lstatSync(dotGit);
			let gitDir = dotGit;
			if (st.isFile()) {
				const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotGit, "utf8"));
				if (!m) return null;
				gitDir = path.resolve(d, m[1].trim());
			} else if (!st.isDirectory()) return null;
			let common = gitDir;
			try {
				common = path.resolve(gitDir, fs.readFileSync(path.join(gitDir, "commondir"), "utf8").trim());
			} catch {}
			return {
				top: d,
				exclude: path.join(common, "info", "exclude")
			};
		} catch {}
		if (d === path.dirname(d)) return null;
	}
}
function acquirePlaceholders(placeholders, stateDir, owner) {
	withJournal(stateDir, (entries) => {
		prune(entries);
		const excludes = /* @__PURE__ */ new Map();
		for (const ph of placeholders) {
			const p = ph.path;
			const chain = [];
			let cur = path.dirname(p);
			while (!fs.existsSync(cur)) {
				chain.unshift(cur);
				cur = path.dirname(cur);
			}
			for (const dir of chain) {
				fs.mkdirSync(dir, { mode: 493 });
				const st = fs.statSync(dir);
				entries.push({
					path: dir,
					dev: st.dev,
					ino: st.ino,
					owners: [owner],
					kind: "dir"
				});
			}
			let made = false;
			try {
				if (ph.kind === "dir") fs.mkdirSync(p, { mode: 493 });
				else fs.writeFileSync(p, ph.content, {
					flag: "wx",
					mode: 420
				});
				made = true;
			} catch (err) {
				if (err.code !== "EEXIST") throw err;
			}
			const st = fs.lstatSync(p);
			if (made) entries.push(ph.kind === "dir" ? {
				path: p,
				dev: st.dev,
				ino: st.ino,
				owners: [owner],
				kind: "dir"
			} : {
				path: p,
				dev: st.dev,
				ino: st.ino,
				owners: [owner],
				kind: "file",
				content: ph.content
			});
			else {
				const e = entries.find((x) => x.path === p && x.dev === st.dev && x.ino === st.ino);
				if (e && !e.owners.includes(owner)) e.owners.push(owner);
			}
			if (ph.kind === "file") {
				const g = gitExcludeOf(p);
				if (g) {
					const list = excludes.get(g.exclude) ?? [];
					list.push(`/${path.relative(g.top, p).split(path.sep).join("/")}`);
					excludes.set(g.exclude, list);
				}
			}
		}
		for (const [file, lines] of excludes) try {
			fs.mkdirSync(path.dirname(file), { recursive: true });
			let text = "";
			try {
				text = fs.readFileSync(file, "utf8");
			} catch {}
			const block = [
				`${BLOCK_START}${owner}`,
				...lines,
				`${BLOCK_END}${owner}`
			].join("\n");
			fs.writeFileSync(file, `${text}${text === "" || text.endsWith("\n") ? "" : "\n"}${block}\n`);
			const e = entries.find((x) => x.kind === "exclude" && x.path === file);
			if (e) e.owners.push(owner);
			else entries.push({
				path: file,
				dev: 0,
				ino: 0,
				owners: [owner],
				kind: "exclude"
			});
		} catch {}
	});
}
function releasePlaceholders(stateDir, owner) {
	withJournal(stateDir, (entries) => {
		for (const e of entries) {
			if (e.kind === "exclude" && e.owners.includes(owner)) try {
				const text = fs.readFileSync(e.path, "utf8");
				fs.writeFileSync(e.path, stripBlocks(text, (o) => o === owner));
			} catch {}
			e.owners = e.owners.filter((o) => o !== owner);
		}
		prune(entries);
	});
}
/** Largest exec-config file whose original bytes are kept for restoring. */
const MAX_RESTORE_BYTES = 1024 * 1024;
/** Identity (and, for original files, content digest) of everything the host watches. */
function snapshotProtected(plan) {
	const originals = /* @__PURE__ */ new Map();
	const cfg = [];
	for (const pr of plan.protect) {
		const st = fs.lstatSync(pr.path);
		let digest = null;
		if (pr.file && st.isFile()) {
			const bytes = fs.readFileSync(pr.path);
			digest = createHash("sha256").update(bytes).digest("hex");
			if (pr.origin === "original" && bytes.length <= MAX_RESTORE_BYTES) originals.set(pr.path, bytes);
		}
		cfg.push({
			path: pr.path,
			origin: pr.origin,
			file: pr.file,
			dev: st.dev,
			ino: st.ino,
			digest
		});
	}
	return {
		cfg,
		anchors: plan.anchored.map((a) => {
			const st = fs.lstatSync(a);
			return {
				path: a,
				dev: st.dev,
				ino: st.ino
			};
		}),
		originals
	};
}
/** After a view change: put back original exec-config files that ./contain-init.ts quarantined. */
function restoreOriginals(snap, paths, onEvent) {
	for (const p of paths) {
		const bytes = snap.originals.get(p);
		if (!bytes) continue;
		try {
			fs.writeFileSync(p, bytes, { flag: "wx" });
			onEvent({
				type: "notice",
				code: "containment-original-restored",
				path: p
			});
		} catch (err) {
			onEvent({
				type: "notice",
				code: "containment-original-not-restored",
				path: p,
				message: err instanceof Error ? err.message : String(err)
			});
		}
	}
}
async function openContainment(plan, opts) {
	const sup = containmentSupport();
	if (!sup.ok) throw new ContainmentUnavailableError(sup.reason);
	for (const s of plan.secrets) if (!opts.secretValues?.has(s.id)) throw new Error(`enclawed containment: secret ${s.id} is declared but its value was not provided`);
	const onEvent = opts.onEvent ?? (() => {});
	sweepPlaceholders(opts.stateDir);
	const sockDir = privateSocketDir("ecw-contain-", { maxName: 10 });
	const eventSock = path.join(sockDir, "events.sock");
	const relaySock = path.join(sockDir, "relay.sock");
	const emptyDir = path.join(sockDir, "empty");
	const emptyFile = path.join(sockDir, "empty-file");
	fs.mkdirSync(emptyDir, { mode: 365 });
	fs.writeFileSync(emptyFile, "", { mode: 292 });
	const ca = createContainerCa(plan.label, plan.destinations.filter((d) => d.mode === "inspect").map((d) => d.host));
	const handles = /* @__PURE__ */ new Map();
	const env = { ...plan.env };
	for (const s of plan.secrets) {
		const h = `enclawed-handle-${randomBytes(16).toString("hex")}`;
		handles.set(s.id, h);
		env[s.variable] = h;
	}
	const caPath = CA_BUNDLE_PATHS[0];
	env.NODE_EXTRA_CA_CERTS = caPath;
	env.SSL_CERT_FILE = caPath;
	env.REQUESTS_CA_BUNDLE = caPath;
	env.CURL_CA_BUNDLE = caPath;
	env.GIT_SSL_CAINFO = caPath;
	const ops = [...plan.ops];
	for (const p of CA_BUNDLE_PATHS) {
		ops.push({
			op: "dir",
			path: path.dirname(p)
		});
		ops.push({
			op: "file",
			path: p,
			content: ca.certPem
		});
	}
	const owner = `${process.pid}:${randomBytes(8).toString("hex")}`;
	acquirePlaceholders(plan.placeholders, opts.stateDir, owner);
	let snap;
	try {
		snap = snapshotProtected(plan);
	} catch (err) {
		releasePlaceholders(opts.stateDir, owner);
		fs.rmSync(sockDir, {
			recursive: true,
			force: true
		});
		throw new Error(`enclawed containment: a protected path changed before start: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
	}
	const quarantineDir = path.join(opts.stateDir, "containment-quarantine");
	if (!plan.nameGuard) {
		releasePlaceholders(opts.stateDir, owner);
		fs.rmSync(sockDir, {
			recursive: true,
			force: true
		});
		throw new ContainmentUnavailableError("the plan has no name guard; nothing is started without it");
	}
	const guardSha256 = nameGuardDigest(plan.nameGuard);
	if (guardSha256 === null) {
		releasePlaceholders(opts.stateDir, owner);
		fs.rmSync(sockDir, {
			recursive: true,
			force: true
		});
		throw new ContainmentUnavailableError("the plan names a name guard this process did not verify");
	}
	const guardConfig = path.join(sockDir, "guard.conf");
	const guardJournal = path.join(sockDir, "guard.journal");
	const guardApprovals = path.join(sockDir, "guard.approvals");
	const conflicted = /* @__PURE__ */ new Set();
	const approvals = /* @__PURE__ */ new Set();
	const writeApprovals = () => {
		const tmp = `${guardApprovals}.tmp`;
		fs.writeFileSync(tmp, [...approvals].map((a) => `${a}\n`).join(""), { mode: 384 });
		fs.renameSync(tmp, guardApprovals);
	};
	const gitExes = [...new Set([...plan.programs.filter((p) => path.basename(p) === "git"), ...plan.programs.some((p) => path.basename(p) === "git") ? ["/usr/lib/git-core/git"] : []].filter((p) => fs.existsSync(p)).map((p) => fs.realpathSync(p)))];
	fs.writeFileSync(guardApprovals, "", { mode: 384 });
	fs.writeFileSync(guardConfig, nameGuardConfig(plan.rwRoots, plan.execConfigWritable, gitExes, guardApprovals), { mode: 384 });
	fs.writeFileSync(guardJournal, "", { mode: 384 });
	const relay = createEgressRelay({
		label: plan.label,
		destinations: plan.destinations,
		ca,
		secrets: plan.secrets,
		secretValues: opts.secretValues ?? /* @__PURE__ */ new Map(),
		handles,
		egressRunner: opts.egressRunner ?? null,
		upstream: opts.upstream,
		onEvent
	});
	const conns = /* @__PURE__ */ new Set();
	let closed = false;
	let eventServer = null;
	let relayServer = null;
	const shutdown = async () => {
		if (closed) return;
		closed = true;
		await new Promise((r) => setTimeout(r, 50));
		relay.close();
		for (const c of conns) c.destroy();
		await Promise.all([eventServer, relayServer].map((srv) => new Promise((r) => {
			if (!srv?.listening) {
				r();
				return;
			}
			srv.close(() => r());
		})));
		releasePlaceholders(opts.stateDir, owner);
		fs.rmSync(sockDir, {
			recursive: true,
			force: true
		});
	};
	eventServer = net.createServer((sock) => {
		conns.add(sock);
		sock.unref();
		let buf = "";
		sock.setEncoding("utf8");
		sock.on("data", (chunk) => {
			buf += chunk;
			let nl;
			while ((nl = buf.indexOf("\n")) >= 0) {
				const line = buf.slice(0, nl);
				buf = buf.slice(nl + 1);
				try {
					const ev = JSON.parse(line);
					if (ev.type === "notice" && ev.code === "containment-repo-config-changed" && Array.isArray(ev.paths)) for (const c of ev.paths) {
						if (typeof c.path !== "string") continue;
						if (c.state === "conflicted") conflicted.add(c.path);
					}
					if (ev.type === "notice" && ev.code === "containment-repo-config-approved-write") {
						if (typeof ev.path === "string" && approvals.delete(ev.path)) writeApprovals();
					}
					if (ev.type === "refused" && Array.isArray(ev.restore)) restoreOriginals(snap, ev.restore.filter((x) => typeof x === "string"), onEvent);
					onEvent(ev);
				} catch {}
			}
		});
		sock.on("error", () => {});
		sock.on("close", () => {
			conns.delete(sock);
			shutdown();
		});
	});
	relayServer = net.createServer((sock) => relay.handle(sock));
	try {
		await Promise.all([[eventServer, eventSock], [relayServer, relaySock]].map(([srv, p]) => new Promise((resolve, reject) => {
			srv.once("error", reject);
			srv.listen(p, () => resolve());
		})));
	} catch (err) {
		await shutdown();
		throw err;
	}
	eventServer.unref();
	relayServer.unref();
	const cfg = {
		sockDir,
		eventSock,
		relaySock,
		relayPorts: [...new Set(plan.destinations.map((d) => d.port))],
		viewRoot: path.join(sockDir, "root"),
		ops,
		emptyDir,
		emptyFile,
		bwrap: systemBinary("bwrap"),
		mount: systemBinary("mount"),
		uid: plan.uid,
		gid: plan.gid,
		command: plan.command,
		args: [...plan.args],
		cwd: plan.cwd,
		env,
		strictExec: plan.strictExec,
		protect: snap.cfg,
		anchors: snap.anchors,
		quarantineDir,
		installGuards: [...plan.installGuards],
		nameGuard: {
			binary: plan.nameGuard,
			sha256: guardSha256,
			socket: `enclawed-guard-${randomBytes(12).toString("hex")}`,
			config: guardConfig,
			journal: guardJournal
		}
	};
	return {
		argv: [
			systemBinary("unshare"),
			...OUTER_FLAGS,
			...containInitCommand()
		],
		env: {
			ENCLAWED_CONTAIN: JSON.stringify(cfg),
			PATH: "/usr/sbin:/usr/bin:/sbin:/bin"
		},
		handles,
		async runCall(call, run) {
			const end = await relay.acquireCall(call);
			try {
				return await run();
			} finally {
				end();
			}
		},
		acquireCall: (c) => relay.acquireCall(c),
		approveRepoConfigWrite(p) {
			if (!conflicted.has(p)) throw new Error(`enclawed containment: ${p} is not a conflicted repository configuration file`);
			approvals.add(p);
			writeApprovals();
		},
		revokeRepoConfigWrite(p) {
			if (approvals.delete(p)) writeApprovals();
		},
		beginCall: (c) => relay.beginCall(c),
		endCall: (id) => relay.endCall(id),
		close: shutdown
	};
}
//#endregion
//#region src/enclawed/containment/mcp.ts
function defaultContext() {
	const uid = hostUid() ?? process.getuid?.() ?? 65534;
	const gid = process.getgid?.() ?? 65534;
	return {
		home: os.homedir(),
		uid: uid === 0 ? 65534 : uid,
		gid: gid === 0 ? 65534 : gid
	};
}
/** The declaration for an admitted MCP server. Values of secret variables are returned separately. */
function mcpContainmentDeclaration(def, rec) {
	const defEnv = def.env ?? {};
	const env = {};
	for (const k of rec.env ?? []) if (k in defEnv) env[k] = defEnv[k];
	const secretValues = /* @__PURE__ */ new Map();
	const missing = [];
	for (const s of rec.secrets ?? []) {
		const v = defEnv[s.variable];
		if (v === void 0) missing.push(s.variable);
		else secretValues.set(s.id, v);
	}
	const roots = [...rec.roots];
	if (rec.packageRoot) roots.push({
		path: rec.packageRoot,
		access: "ro",
		exec: true
	});
	const cwd = def.cwd ?? rec.cwd ?? rec.packageRoot ?? rec.roots[0]?.path ?? "/";
	return {
		declaration: {
			kind: "mcp-server",
			label: def.name,
			command: def.command,
			args: [...def.args],
			cwd,
			roots,
			programs: [def.command, ...rec.programs ?? []],
			env,
			secrets: rec.secrets ?? [],
			destinations: rec.destinations ?? [],
			execConfigWritable: rec.execConfigWritable ?? []
		},
		secretValues,
		missing
	};
}
async function contain(declaration, secretValues, opts, ctx) {
	const sup = containmentSupport();
	if (!sup.ok) return {
		ok: false,
		code: "containment-unavailable",
		message: uncontainedRefusal(declaration.label, declaration.kind, sup.reason)
	};
	const guard = ensureNameGuard(opts.stateDir);
	if (!guard.ok) return {
		ok: false,
		code: "containment-unavailable",
		message: uncontainedRefusal(declaration.label, declaration.kind, guard.reason)
	};
	const planned = planContainment(declaration, {
		...ctx,
		nameGuard: guard.binary
	});
	if (!planned.ok) return {
		ok: false,
		code: planned.code,
		message: `Enclawed: ${declaration.label} was not started: ${planned.message}`
	};
	try {
		return {
			ok: true,
			containment: await openContainment(planned.plan, {
				...opts,
				secretValues
			}),
			plan: planned.plan
		};
	} catch (err) {
		if (err instanceof ContainmentUnavailableError) return {
			ok: false,
			code: err.code,
			message: uncontainedRefusal(declaration.label, declaration.kind, err.reason)
		};
		return {
			ok: false,
			code: "containment-setup-failed",
			message: `Enclawed: ${declaration.label} was not started: ${err instanceof Error ? err.message : String(err)}`
		};
	}
}
/** Start an admitted MCP server contained, or refuse (`mcp-server-not-contained` family). */
async function containMcpServer(def, rec, opts, ctx = defaultContext()) {
	if (!rec) return {
		ok: false,
		code: "mcp-server-not-contained",
		message: `Enclawed: MCP server "${def.name}" was not started: its admission record declares no containment (folders, programs, destinations). Re-admit it with a containment declaration.`
	};
	const { declaration, secretValues, missing } = mcpContainmentDeclaration(def, rec);
	if (missing.length > 0) return {
		ok: false,
		code: "containment-declaration-invalid",
		message: `Enclawed: MCP server "${def.name}" was not started: its definition has no value for the declared secret variable(s) ${missing.join(", ")}`
	};
	return contain(declaration, secretValues, opts, ctx);
}
/**
* What project scripts and installs run besides the node toolchain: npm,
* yarn, pnpm and make hand every script to `sh -c`, and scripts call the
* standard POSIX tools. Each is resolved to its real binary with its
* interpreter and shared libraries (the program allowlist of ./plan.ts);
* a tool this host does not have is left out. The security of a contained
* script comes from its view, the name guard, the network relay and the
* absence of credentials, not from the absence of a shell.
*/
const PROJECT_SCRIPT_PROGRAMS = [
	"/bin/sh",
	"sh",
	"bash",
	"make",
	"env",
	"awk",
	"sed",
	"grep",
	"find",
	"xargs",
	"mkdir",
	"rm",
	"rmdir",
	"cp",
	"mv",
	"ln",
	"cat",
	"test",
	"[",
	"printf",
	"echo",
	"tee",
	"sort",
	"uniq",
	"head",
	"tail",
	"tr",
	"cut",
	"basename",
	"dirname",
	"which",
	"uname",
	"date",
	"sleep",
	"true",
	"false",
	"chmod",
	"touch",
	"wc",
	"diff",
	"tar",
	"gzip",
	"ls",
	"pwd",
	"expr",
	"id",
	"readlink",
	"realpath",
	"mktemp"
];
/** The project-script tools this host has (each name or path that resolves). */
function projectScriptPrograms() {
	return PROJECT_SCRIPT_PROGRAMS.filter((p) => lookupProgram(p) !== null);
}
/** The declaration for a project script or package install: project read-write, toolchain read-only. */
function projectScriptDeclaration(input) {
	const tc = nodeToolchain();
	return {
		kind: input.kind ?? "project-script",
		label: input.label,
		command: input.command,
		args: [...input.args],
		cwd: input.cwd ?? input.projectDir,
		roots: [{
			path: input.projectDir,
			access: "rw",
			exec: true
		}, ...tc.roots],
		programs: [...new Set([
			...tc.programs,
			...projectScriptPrograms(),
			...input.programs ?? []
		])],
		env: input.env ?? {},
		destinations: input.destinations ?? [],
		...input.codePins ? { codePins: input.codePins } : {}
	};
}
/**
* The package registries an install may reach, by package manager. The
* containment's own table: an install reaches its registry and nothing
* else unless the operator declares a mirror.
*/
const PACKAGE_REGISTRIES = {
	npm: ["registry.npmjs.org"],
	pnpm: ["registry.npmjs.org"],
	yarn: ["registry.yarnpkg.com", "registry.npmjs.org"],
	bun: ["registry.npmjs.org"],
	pip: ["pypi.org", "files.pythonhosted.org"],
	pip3: ["pypi.org", "files.pythonhosted.org"],
	uv: ["pypi.org", "files.pythonhosted.org"],
	poetry: ["pypi.org", "files.pythonhosted.org"],
	npx: ["registry.npmjs.org"],
	pnpx: ["registry.npmjs.org"],
	bunx: ["registry.npmjs.org"],
	uvx: ["pypi.org", "files.pythonhosted.org"],
	pipx: ["pypi.org", "files.pythonhosted.org"]
};
/** The request shape of each package manager's registry (./request-shape.ts). */
const PACKAGE_REGISTRY_PROFILES = {
	npm: "npm-registry",
	pnpm: "npm-registry",
	yarn: "npm-registry",
	bun: "npm-registry",
	pip: "pypi",
	pip3: "pypi",
	uv: "pypi",
	poetry: "pypi",
	npx: "npm-registry",
	pnpx: "npm-registry",
	bunx: "npm-registry",
	uvx: "pypi",
	pipx: "pypi"
};
/**
* The destinations an install reaches: each registry (the tool's public one,
* or the operator's mirrors) as an inspected background destination WITH the
* registry's request shape, so only package metadata and artifact fetches
* reach it. A mirror is a host ("npm.mirror.example"), or a URL whose path is
* where the registry protocol is served
* ("https://artifacts.example/artifactory/api/npm/npm-remote"): the path
* becomes the shape's prefix and nothing outside it is reachable. A Python
* index URL as pip and uv name it (".../simple/", what pythonIndexUrls
* returns for a runner) is served from the part before /simple; PyPI's own
* index adds its files host.
*/
function registryDestinations(tool, o = {}) {
	const profile = PACKAGE_REGISTRY_PROFILES[tool];
	const registries = o.registries ?? PACKAGE_REGISTRIES[tool];
	if (!profile || !registries || registries.length === 0) return { error: `no package registry is known for "${tool}"` };
	const out = [];
	for (const r of registries) {
		let host;
		let port = 443;
		let mode = "inspect";
		let pathPrefix = "";
		if (r.includes("://")) {
			let u;
			try {
				u = new URL(r);
			} catch {
				return { error: `registry ${JSON.stringify(r)} is not a URL` };
			}
			if (u.protocol !== "https:" && u.protocol !== "http:" || u.username || u.password) return { error: `registry ${JSON.stringify(r)} must be an https or http URL without credentials` };
			if (u.search || u.hash) return { error: `registry ${JSON.stringify(r)} carries a query or fragment` };
			host = u.hostname.toLowerCase();
			mode = u.protocol === "https:" ? "inspect" : "http";
			port = u.port ? Number(u.port) : mode === "inspect" ? 443 : 80;
			const raw = /^[a-z]+:\/\/[^/?#]*([^?#]*)/i.exec(r)?.[1] ?? "";
			pathPrefix = raw === "/" ? "" : raw.replace(/\/$/, "");
			if (profile === "pypi") pathPrefix = pathPrefix.replace(/\/simple$/, "");
		} else host = r.toLowerCase();
		out.push({
			host,
			port,
			mode,
			background: true,
			shape: {
				profile,
				pathPrefix,
				...o.pins ? { pins: o.pins } : {},
				...o.requirePins ? { requirePins: true } : {}
			}
		});
	}
	if (profile === "pypi" && out.some((d) => d.host === "pypi.org" && d.port === 443) && !out.some((d) => d.host === "files.pythonhosted.org")) {
		const pypi = out.find((d) => d.host === "pypi.org");
		out.push({
			...pypi,
			host: "files.pythonhosted.org"
		});
	}
	return out;
}
/**
* The declaration for a package install (M5): lifecycle scripts run, the
* project is read-only except the install's outputs, lockfiles and manifest
* (./plan.ts, ./install-guard.ts), and the network reaches only the
* registry (inspected, through the relay; no call is in flight during an
* install, so the registry is a background destination), and only with the
* registry protocol's requests (registryDestinations: package metadata and
* artifact fetches; pinned artifacts verified before the install sees them).
*/
function packageInstallDeclaration(input) {
	const destinations = registryDestinations(input.tool, {
		registries: input.registries,
		pins: input.pins,
		requirePins: input.requirePins
	});
	if ("error" in destinations) return destinations;
	return projectScriptDeclaration({
		label: input.label,
		kind: "package-install",
		projectDir: input.projectDir,
		command: input.command,
		args: input.args,
		cwd: input.cwd,
		programs: input.programs,
		env: input.env,
		destinations
	});
}
/** Run a package install caged (M5), or refuse. */
async function containPackageInstall(input, opts, ctx = defaultContext()) {
	const declaration = packageInstallDeclaration(input);
	if ("error" in declaration) return {
		ok: false,
		code: "containment-declaration-invalid",
		message: `Enclawed: ${input.label} was not started: ${declaration.error}`
	};
	return contain(declaration, /* @__PURE__ */ new Map(), opts, ctx);
}
/** Run a project script (npm test, make, ...) or package install contained, or refuse. */
async function containProjectScript(input, opts, ctx = defaultContext()) {
	return contain(projectScriptDeclaration(input), /* @__PURE__ */ new Map(), opts, ctx);
}
/**
* POSIX tools a shell skill without spawn.proc still has: the shell's own
* text and file utilities. Never another interpreter, package manager,
* build tool or a program that starts programs (env, xargs, find, awk, sed,
* tar, make). Their effects are bounded by the view and the relay like the
* script's own.
*/
const SHELL_SKILL_UTILITIES = PROJECT_SCRIPT_PROGRAMS.filter((p) => ![
	"/bin/sh",
	"sh",
	"bash",
	"make",
	"env",
	"xargs",
	"find",
	"awk",
	"sed",
	"tar"
].includes(p));
const SHELLS = new Set([
	"sh",
	"bash",
	"dash"
]);
/**
* The containment of a call made under a verified skill: exactly the
* skill's admitted capabilities. The skill's copy read-only; the project
* read-only with fs.read, read-write with fs.write.rev / fs.write.irrev
* (the files that configure what runs later stay read-only), absent
* otherwise; programs: the interpreter (and, for a shell script, the
* shell's utilities), the project-script toolchain only with spawn.proc;
* the network only with net.egress, only to the declared targets, through
* the relay with each target's request shape. No credential, no inherited
* environment.
*/
function skillRunDeclaration(input) {
	const has = (c) => input.caps.includes(c);
	const write = has("fs.write.rev") || has("fs.write.irrev");
	const read = write || has("fs.read");
	const spawn = has("spawn.proc");
	const tc = spawn ? nodeToolchain() : {
		programs: [],
		roots: []
	};
	const inProject = (p) => {
		const rel = path.relative(input.projectDir, p);
		return rel === "" || !rel.startsWith("..") && !path.isAbsolute(rel);
	};
	const programs = spawn ? [
		...tc.programs,
		...projectScriptPrograms(),
		input.interpreter
	] : SHELLS.has(input.interpreter) ? [input.interpreter, ...SHELL_SKILL_UTILITIES.filter((p) => lookupProgram(p) !== null)] : [input.interpreter];
	return {
		kind: "project-script",
		label: input.label,
		command: input.interpreter,
		args: [input.file, ...input.args],
		cwd: read && inProject(input.cwd) ? input.cwd : input.skillDir,
		roots: [
			{
				path: input.skillDir,
				access: "ro",
				exec: false
			},
			...read ? [{
				path: input.projectDir,
				access: write ? "rw" : "ro",
				exec: spawn
			}] : [],
			...tc.roots
		],
		programs: [...new Set(programs)],
		env: {},
		destinations: has("net.egress") ? input.destinations.map((d) => ({
			...d,
			background: true
		})) : []
	};
}
/** Run one call of a verified skill contained with its admitted capabilities, or refuse. */
async function containSkillRun(input, opts, ctx = defaultContext()) {
	return contain(skillRunDeclaration(input), /* @__PURE__ */ new Map(), opts, ctx);
}
//#endregion
export { createContainerCa as S, uncontainedRefusal as _, containProjectScript as a, readClientHello as b, packageInstallDeclaration as c, skillRunDeclaration as d, ContainmentUnavailableError as f, sweepPlaceholders as g, resetContainmentSupportForTest as h, containPackageInstall as i, projectScriptDeclaration as l, openContainment as m, PACKAGE_REGISTRY_PROFILES as n, containSkillRun as o, containmentSupport as p, containMcpServer as r, mcpContainmentDeclaration as s, PACKAGE_REGISTRIES as t, registryDestinations as u, GENERIC_LEDGER_BURST_BITS as v, MAX_REQUEST_BODY as x, createEgressRelay as y };
