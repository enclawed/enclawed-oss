import { n as resolveDefaultConfigPath } from "./workspace-dir-CwLpjIOc.js";
import { n as getRuntime } from "./runtime-Dt7e6nAN.js";
import { t as CLOCK_DISAGREES_TEXT } from "./clock-disagrees-text-B9EMsSXG.js";
import { _ as resolveStateDir } from "./paths-DR_vFTXe.js";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import os from "node:os";
import { X509Certificate, constants as constants$1, createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import http from "node:http";
import tty from "node:tty";
//#region src/enclawed/auth/cbor.ts
var CborError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "CborError";
	}
};
const MAX_DEPTH = 16;
const MAX_ITEMS = 4096;
function decodeCborItem(buf, offset = 0) {
	return decodeAt(buf, offset, 0, { items: 0 });
}
/** Decode exactly one item spanning the whole buffer. */
function decodeCbor(buf) {
	const { value, end } = decodeCborItem(buf, 0);
	if (end !== buf.length) throw new CborError(`trailing bytes after CBOR item (${buf.length - end})`);
	return value;
}
function readLength(buf, offset, info) {
	if (info < 24) return {
		n: info,
		next: offset
	};
	const need = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : -1;
	if (need < 0) throw new CborError(`unsupported CBOR additional info ${info}`);
	if (offset + need > buf.length) throw new CborError("truncated CBOR length");
	const view = new DataView(buf.buffer, buf.byteOffset + offset, need);
	let n;
	if (need === 1) n = view.getUint8(0);
	else if (need === 2) n = view.getUint16(0);
	else if (need === 4) n = view.getUint32(0);
	else {
		const big = view.getBigUint64(0);
		n = big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big;
	}
	return {
		n,
		next: offset + need
	};
}
function asLength(n, remaining) {
	if (typeof n === "bigint" || n > remaining) throw new CborError("CBOR length exceeds the buffer");
	return n;
}
function decodeAt(buf, offset, depth, state) {
	if (depth > MAX_DEPTH) throw new CborError("CBOR nesting too deep");
	if (++state.items > MAX_ITEMS) throw new CborError("too many CBOR items");
	if (offset >= buf.length) throw new CborError("truncated CBOR item");
	const initial = buf[offset];
	const major = initial >> 5;
	const info = initial & 31;
	if (info === 31) throw new CborError("indefinite-length CBOR is not accepted");
	if (major === 7) {
		if (info === 20) return {
			value: false,
			end: offset + 1
		};
		if (info === 21) return {
			value: true,
			end: offset + 1
		};
		if (info === 22) return {
			value: null,
			end: offset + 1
		};
		throw new CborError(`unsupported CBOR simple/float value ${info}`);
	}
	const { n, next } = readLength(buf, offset + 1, info);
	switch (major) {
		case 0: return {
			value: n,
			end: next
		};
		case 1: return {
			value: typeof n === "bigint" ? -1n - n : -1 - n,
			end: next
		};
		case 2: {
			const len = asLength(n, buf.length - next);
			return {
				value: buf.slice(next, next + len),
				end: next + len
			};
		}
		case 3: {
			const len = asLength(n, buf.length - next);
			return {
				value: new TextDecoder("utf-8", { fatal: true }).decode(buf.subarray(next, next + len)),
				end: next + len
			};
		}
		case 4: {
			const count = asLength(n, buf.length - next);
			const arr = [];
			let at = next;
			for (let i = 0; i < count; i++) {
				const item = decodeAt(buf, at, depth + 1, state);
				arr.push(item.value);
				at = item.end;
			}
			return {
				value: arr,
				end: at
			};
		}
		case 5: {
			const count = asLength(n, buf.length - next);
			const map = /* @__PURE__ */ new Map();
			let at = next;
			for (let i = 0; i < count; i++) {
				const k = decodeAt(buf, at, depth + 1, state);
				if (typeof k.value !== "number" && typeof k.value !== "string") throw new CborError("CBOR map keys must be integers or text");
				if (map.has(k.value)) throw new CborError("duplicate CBOR map key");
				const v = decodeAt(buf, k.end, depth + 1, state);
				map.set(k.value, v.value);
				at = v.end;
			}
			return {
				value: map,
				end: at
			};
		}
		default: throw new CborError(`unsupported CBOR major type ${major}`);
	}
}
/**
* libfido2 prints authenticator data CBOR-wrapped (a byte string holding the
* raw bytes). Unwrap it when it is exactly one byte string; return raw data
* otherwise. Raw authenticator data starts with a 32-byte rpIdHash, so a
* caller must say which form it expects; see `unwrapCborByteString`.
*/
function unwrapCborByteString(buf) {
	const value = decodeCbor(buf);
	if (!(value instanceof Uint8Array)) throw new CborError("expected a CBOR byte string");
	return value;
}
//#endregion
//#region src/enclawed/auth/loopback-ceremony.ts
const PASSKEY_RP_ID = "localhost";
const MAX_BODY = 64 * 1024;
var CeremonyError = class extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "CeremonyError";
	}
};
const LOOPBACK = new Set([
	"127.0.0.1",
	"::1",
	"::ffff:127.0.0.1"
]);
/** Exactly http://localhost:<port> with a port in 1..65535 (no path, no default-port forms). */
function isLoopbackOrigin(origin) {
	const m = /^http:\/\/localhost:([1-9][0-9]{0,4})$/.exec(origin);
	return m !== null && Number(m[1]) <= 65535;
}
function b64url$1(b) {
	return Buffer.from(b).toString("base64url");
}
function fromB64urlField(v, what) {
	if (typeof v !== "string" || v.length === 0 || !/^[A-Za-z0-9_-]+$/.test(v)) throw new CeremonyError("bad-result", `${what} is not base64url`);
	return new Uint8Array(Buffer.from(v, "base64url"));
}
/** Parse the page's POST body into a ceremony result for `kind`. */
function parseCeremonyPost(body, kind, origin) {
	let v;
	try {
		v = JSON.parse(body);
	} catch {
		throw new CeremonyError("bad-result", "the page's answer is not JSON");
	}
	if (!v || typeof v !== "object") throw new CeremonyError("bad-result", "the page's answer is not an object");
	const o = v;
	if (o.kind === "error") {
		const name = typeof o.name === "string" ? o.name.slice(0, 64).replace(/[^\w.-]/g, "") : "";
		throw new CeremonyError("cancelled", `the browser did not complete the passkey ceremony${name ? ` (${name})` : ""}`);
	}
	if (o.kind !== kind) throw new CeremonyError("bad-result", "the page answered a different ceremony");
	const base = {
		kind,
		origin,
		credentialId: fromB64urlField(o.id, "id"),
		clientDataJSON: fromB64urlField(o.clientDataJSON, "clientDataJSON")
	};
	if (kind === "create") return {
		...base,
		attestationObject: fromB64urlField(o.attestationObject, "attestationObject")
	};
	return {
		...base,
		authenticatorData: fromB64urlField(o.authenticatorData, "authenticatorData"),
		signature: fromB64urlField(o.signature, "signature")
	};
}
function header(v) {
	return Array.isArray(v) ? v.join(",") : v;
}
function escapeHtml(s) {
	return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
/** The ceremony page. Options travel as JSON in a data block; the script runs under a CSP nonce. */
function ceremonyPage(req, nonce, timeoutMs) {
	const opts = req.kind === "create" ? {
		kind: "create",
		challenge: b64url$1(req.challenge),
		userId: b64url$1(req.userId),
		userName: req.userName,
		exclude: req.excludeCredentialIds.map(b64url$1),
		timeout: timeoutMs
	} : {
		kind: "get",
		challenge: b64url$1(req.challenge),
		allow: req.allowCredentialIds.map(b64url$1),
		timeout: timeoutMs
	};
	const data = JSON.stringify(opts).replace(/</g, "\\u003c");
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Enclawed passkey</title>
<style nonce="${nonce}">body{font:16px system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;color:#111;background:#fff}button{font:inherit;padding:.6rem 1.2rem}#s{margin-top:1rem}@media (prefers-color-scheme:dark){body{color:#eee;background:#111}}</style>
</head><body>
<h1>Enclawed</h1>
<p>${escapeHtml(req.title)}</p>
<p>${req.kind === "create" ? "Create a passkey on this device. Your device asks for your PIN, fingerprint or face." : "Confirm with this device's passkey. Your device asks for your PIN, fingerprint or face."}</p>
<button id="go" type="button">Continue</button>
<p id="s" role="status"></p>
<script type="application/json" id="o">${data}<\/script>
<script nonce="${nonce}">
(function () {
  var o = JSON.parse(document.getElementById("o").textContent);
  function dec(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function enc(buf) { var u = new Uint8Array(buf), s = ""; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, ""); }
  var st = document.getElementById("s"), go = document.getElementById("go"), sent = false;
  function post(body) {
    if (sent) return; sent = true; go.disabled = true;
    fetch(location.pathname, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "omit", cache: "no-store", redirect: "error" })
      .then(function (r) { st.textContent = r.ok ? "Done. You can close this tab and return to the terminal." : "Enclawed refused this answer. Return to the terminal."; })
      .catch(function () { st.textContent = "Could not reach Enclawed. Return to the terminal."; });
  }
  function run() {
    go.disabled = true; st.textContent = "Waiting for your device...";
    var p;
    if (o.kind === "create") {
      p = navigator.credentials.create({ publicKey: {
        rp: { id: "localhost", name: "Enclawed" },
        user: { id: dec(o.userId), name: o.userName, displayName: o.userName },
        challenge: dec(o.challenge),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }, { type: "public-key", alg: -8 }],
        authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "discouraged", requireResidentKey: false, userVerification: "required" },
        attestation: "direct",
        timeout: o.timeout,
        excludeCredentials: o.exclude.map(function (id) { return { type: "public-key", id: dec(id) }; })
      } }).then(function (c) {
        post({ kind: "create", id: enc(c.rawId), clientDataJSON: enc(c.response.clientDataJSON), attestationObject: enc(c.response.attestationObject) });
      });
    } else {
      p = navigator.credentials.get({ publicKey: {
        rpId: "localhost",
        challenge: dec(o.challenge),
        allowCredentials: o.allow.map(function (id) { return { type: "public-key", id: dec(id) }; }),
        userVerification: "required",
        timeout: o.timeout
      } }).then(function (c) {
        post({ kind: "get", id: enc(c.rawId), clientDataJSON: enc(c.response.clientDataJSON), authenticatorData: enc(c.response.authenticatorData), signature: enc(c.response.signature) });
      });
    }
    p.catch(function (e) { post({ kind: "error", name: (e && e.name) || "Error" }); });
  }
  go.addEventListener("click", run);
})();
<\/script>
</body></html>
`;
}
function securityHeaders(nonce) {
	return {
		"cache-control": "no-store",
		"x-content-type-options": "nosniff",
		"x-frame-options": "DENY",
		"referrer-policy": "no-referrer",
		"cross-origin-opener-policy": "same-origin",
		"cross-origin-resource-policy": "same-origin",
		"content-security-policy": nonce ? `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` : "default-src 'none'; frame-ancestors 'none'"
	};
}
function isLoopbackPeer(socket) {
	return LOOPBACK.has(socket.remoteAddress ?? "");
}
/**
* What the one-time server does with a request, given its state: a
* non-loopback peer is dropped; a foreign Host, a cross-site fetch, a
* second page load, a POST before the page or after the answer, a POST
* with another Origin or another content type are refused.
*/
function decideRequest(r, state) {
	if (!LOOPBACK.has(r.remoteAddress ?? "")) return { action: "drop" };
	if (r.host !== state.host) return {
		action: "deny",
		status: 403
	};
	if (r.url !== state.path) return {
		action: "deny",
		status: 404
	};
	const site = r.secFetchSite;
	if (r.method === "GET") {
		if (state.served) return {
			action: "deny",
			status: 404
		};
		if (site !== void 0 && site !== "none" && site !== "same-origin") return {
			action: "deny",
			status: 403
		};
		return { action: "page" };
	}
	if (r.method !== "POST") return {
		action: "deny",
		status: 404
	};
	if (!state.served || state.posted || r.origin !== state.origin || site !== void 0 && site !== "same-origin" || !/^application\/json(;|$)/.test(r.contentType ?? "")) return {
		action: "deny",
		status: 403
	};
	return { action: "accept-post" };
}
/**
* Start the one-time page for one ceremony. Resolves once listening; the
* ceremony's answer (or its failure) arrives on `result`.
*/
async function startLoopbackCeremony(req, opts) {
	const path = `/${randomBytes(32).toString("base64url")}`;
	const nonce = randomBytes(18).toString("base64");
	let served = false;
	let posted = false;
	let settle;
	const result = new Promise((resolve, reject) => {
		settle = {
			resolve,
			reject
		};
	});
	result.catch(() => {});
	let origin = "";
	let host = "";
	const server = http.createServer();
	let timer = null;
	let closed = false;
	const close = (err, value) => {
		if (closed) return;
		closed = true;
		if (timer) clearTimeout(timer);
		server.close();
		server.closeAllConnections();
		if (value) settle.resolve(value);
		else settle.reject(err ?? new CeremonyError("closed", "the passkey page was closed"));
	};
	const deny = (res, status) => {
		res.writeHead(status, {
			...securityHeaders(),
			"content-type": "text/plain",
			connection: "close"
		});
		res.end(status === 404 ? "not found\n" : "refused\n");
	};
	server.on("connection", (socket) => {
		if (!isLoopbackPeer(socket)) socket.destroy();
	});
	server.on("request", (req2, res) => {
		const decision = decideRequest({
			remoteAddress: req2.socket.remoteAddress,
			method: req2.method,
			url: req2.url,
			host: req2.headers.host,
			origin: req2.headers.origin,
			secFetchSite: header(req2.headers["sec-fetch-site"]),
			contentType: req2.headers["content-type"]
		}, {
			path,
			host,
			origin,
			served,
			posted
		});
		if (decision.action === "drop") {
			req2.socket.destroy();
			return;
		}
		if (decision.action === "deny") {
			deny(res, decision.status);
			return;
		}
		if (decision.action === "page") {
			served = true;
			res.writeHead(200, {
				...securityHeaders(nonce),
				"content-type": "text/html; charset=utf-8"
			});
			res.end(ceremonyPage(req, nonce, opts.timeoutMs));
			return;
		}
		posted = true;
		const chunks = [];
		let size = 0;
		let over = false;
		req2.on("data", (c) => {
			size += c.length;
			if (size > MAX_BODY) {
				over = true;
				req2.destroy();
				close(new CeremonyError("bad-result", "the page's answer is too large"));
				return;
			}
			chunks.push(c);
		});
		req2.on("end", () => {
			if (over) return;
			let parsed = null;
			let failure = null;
			try {
				parsed = parseCeremonyPost(Buffer.concat(chunks).toString("utf8"), req.kind, origin);
			} catch (err) {
				failure = err;
			}
			res.writeHead(parsed ? 200 : 400, {
				...securityHeaders(),
				"content-type": "text/plain",
				connection: "close"
			});
			res.end(parsed ? "ok\n" : "refused\n", () => {
				if (parsed) close(void 0, parsed);
				else close(failure ?? new CeremonyError("bad-result", "the page's answer was refused"));
			});
		});
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen({
			host: "127.0.0.1",
			port: 0,
			exclusive: true
		}, () => {
			server.off("error", reject);
			resolve();
		});
	});
	const port = server.address().port;
	origin = `http://localhost:${port}`;
	host = `localhost:${port}`;
	timer = setTimeout(() => close(new CeremonyError("timeout", "the passkey ceremony timed out")), opts.timeoutMs);
	timer.unref?.();
	return {
		url: `${origin}${path}`,
		origin,
		port,
		result,
		close: () => close()
	};
}
function credentialKind(c) {
	return c.kind ?? "security-key";
}
function authStateDir(env = process.env, stateDir) {
	return path.join(stateDir ?? resolveStateDir(env), "auth");
}
function emptyStore(rpId) {
	return {
		v: 1,
		rpId,
		credentials: [],
		failures: 0,
		lockedUntil: null
	};
}
function factorsFile(dir) {
	return path.join(dir, "factors.json");
}
function ensurePrivateDir(dir) {
	fs.mkdirSync(dir, {
		recursive: true,
		mode: 448
	});
	if (process.platform !== "win32") {
		const st = fs.lstatSync(dir);
		if (!st.isDirectory() || st.isSymbolicLink()) throw new Error(`auth state dir ${dir} is not a plain directory`);
		if (typeof process.getuid === "function" && st.uid !== process.getuid()) throw new Error(`auth state dir ${dir} is not owned by this user`);
		if ((st.mode & 63) !== 0) fs.chmodSync(dir, 448);
	}
}
function writePrivateJson(file, value) {
	ensurePrivateDir(path.dirname(file));
	const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
	fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, {
		mode: 384,
		flag: "wx"
	});
	fs.renameSync(tmp, file);
}
function isCredential(c) {
	if (!c || typeof c !== "object") return false;
	const r = c;
	return typeof r.id === "string" && typeof r.credentialId === "string" && (r.alg === -7 || r.alg === -8 || r.alg === -257) && (r.kind === void 0 || r.kind === "security-key" || r.kind === "passkey") && (r.counterPolicy === void 0 || r.counterPolicy === "tpm-non-exportable") && (r.role === void 0 || r.role === "device-unlock-signer") && typeof r.publicKeyCose === "string" && typeof r.signCount === "number" && Number.isInteger(r.signCount) && r.signCount >= 0 && typeof r.aaguid === "string";
}
/**
* Read the store. A missing file is an empty store; a file that exists but
* does not parse, or carries a different relying party id, is an error (it is
* never silently treated as "nothing enrolled", which would read the same as
* a fresh install).
*/
function readAuthStore(dir, rpId) {
	let raw;
	try {
		raw = fs.readFileSync(factorsFile(dir), "utf8");
	} catch (err) {
		if (err.code === "ENOENT") return emptyStore(rpId);
		throw err;
	}
	const parsed = JSON.parse(raw);
	if (parsed.v !== 1 || !Array.isArray(parsed.credentials)) throw new Error(`${factorsFile(dir)} is not a version-1 factor store`);
	if (parsed.rpId !== rpId) throw new Error(`${factorsFile(dir)} belongs to relying party ${String(parsed.rpId)}, not ${rpId}`);
	if (!parsed.credentials.every(isCredential)) throw new Error(`${factorsFile(dir)} holds a malformed credential record`);
	return {
		v: 1,
		rpId,
		credentials: parsed.credentials,
		failures: typeof parsed.failures === "number" ? parsed.failures : 0,
		lockedUntil: typeof parsed.lockedUntil === "number" ? parsed.lockedUntil : null
	};
}
function writeAuthStore(dir, store) {
	writePrivateJson(factorsFile(dir), store);
}
/** The store's lock could not be taken (another check in progress, or a lock that is not a file). */
var AuthLockError = class extends Error {
	constructor(message) {
		super(message);
		this.code = "busy";
		this.name = "AuthLockError";
	}
};
const LOCK_WAIT_MS = 12e4;
const LOCK_STALE_MS = 15 * 6e4;
function pidAlive(pid) {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return err.code === "EPERM";
	}
}
/** Exclusive lock beside the store. A holder that died, or one older than 15 minutes, is broken. */
async function withAuthLock(dir, waitMs, fn) {
	waitMs ??= LOCK_WAIT_MS;
	ensurePrivateDir(dir);
	const lock = path.join(dir, "factors.lock");
	const deadline = performance.now() + waitMs;
	for (;;) {
		try {
			const fd = fs.openSync(lock, "wx", 384);
			fs.writeSync(fd, `${process.pid}\n`);
			fs.closeSync(fd);
			break;
		} catch (err) {
			if (err.code !== "EEXIST") throw err;
		}
		let st = null;
		let holder = NaN;
		try {
			st = fs.lstatSync(lock);
			holder = Number.parseInt(fs.readFileSync(lock, "utf8"), 10);
		} catch {}
		if (st && !st.isFile()) throw new AuthLockError(`auth lock ${lock} is not a regular file`);
		if (st && (Number.isInteger(holder) && !pidAlive(holder) || Date.now() - st.mtimeMs > LOCK_STALE_MS)) {
			try {
				if (fs.lstatSync(lock).ino === st.ino) fs.rmSync(lock, { force: true });
			} catch {}
			continue;
		}
		if (performance.now() > deadline) throw new AuthLockError("another enclawed second-factor check is in progress; try again");
		await new Promise((r) => setTimeout(r, 50));
	}
	try {
		return await fn();
	} finally {
		fs.rmSync(lock, { force: true });
	}
}
//#endregion
//#region src/enclawed/auth/attestation-roots.ts
const PINNED_ATTESTATION_ROOTS = {
	tpm: [{
		name: "Microsoft TPM Root Certificate Authority 2014",
		source: "https://www.microsoft.com/pkiops/certs/Microsoft%20TPM%20Root%20Certificate%20Authority%202014.crt",
		sha256: "870c7a35ceab3d59979f2c6a524042d404cb71518004350925fb2ced79a999da",
		pem: `-----BEGIN CERTIFICATE-----
MIIF9TCCA92gAwIBAgIQXbYwTgy/J79JuMhpUB5dyzANBgkqhkiG9w0BAQsFADCB
jDELMAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1Jl
ZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjE2MDQGA1UEAxMt
TWljcm9zb2Z0IFRQTSBSb290IENlcnRpZmljYXRlIEF1dGhvcml0eSAyMDE0MB4X
DTE0MTIxMDIxMzExOVoXDTM5MTIxMDIxMzkyOFowgYwxCzAJBgNVBAYTAlVTMRMw
EQYDVQQIEwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVN
aWNyb3NvZnQgQ29ycG9yYXRpb24xNjA0BgNVBAMTLU1pY3Jvc29mdCBUUE0gUm9v
dCBDZXJ0aWZpY2F0ZSBBdXRob3JpdHkgMjAxNDCCAiIwDQYJKoZIhvcNAQEBBQAD
ggIPADCCAgoCggIBAJ+n+bnKt/JHIRC/oI/xgkgsYdPzP0gpvduDA2GbRtth+L4W
UyoZKGBw7uz5bjjP8Aql4YExyjR3EZQ4LqnZChMpoCofbeDR4MjCE1TGwWghGpS0
mM3GtWD9XiME4rE2K0VW3pdN0CLzkYbvZbs2wQTFfE62yNQiDjyHFWAZ4BQH4eWa
8wrDMUxIAneUCpU6zCwM+l6Qh4ohX063BHzXlTSTc1fDsiPaKuMMjWjK9vp5UHFP
a+dMAWr6OljQZPFIg3aZ4cUfzS9y+n77Hs1NXPBn6E4Db679z4DThIXyoKeZTv1a
aWOWl/exsDLGt2mTMTyykVV8uD1eRjYriFpmoRDwJKAEMOfaURarzp7hka9TOElG
yD2gOV4Fscr2MxAYCywLmOLzA4VDSYLuKAhPSp7yawET30AvY1HRfMwBxetSqWP2
+yZRNYJlHpor5QTuRDgzR+Zej+aWx6rWNYx43kLthozeVJ3QCsD5iEI/OZlmWn5W
Yf7O8LB/1A7scrYv44FD8ck3Z+hxXpkklAsjJMsHZa9mBqh+VR1AicX4uZG8m16x
65ZU2uUpBa3rn8CTNmw17ZHOiuSWJtS9+PrZVA8ljgf4QgA1g6NPOEiLG2fn8Gm+
r5Ak+9tqv72KDd2FPBJ7Xx4stYj/WjNPtEUhW4rcLK3ktLfcy6ea7Rocw5y5AgMB
AAGjUTBPMAsGA1UdDwQEAwIBhjAPBgNVHRMBAf8EBTADAQH/MB0GA1UdDgQWBBR6
jArOL0hiF+KU0a5VwVLscXSkVjAQBgkrBgEEAYI3FQEEAwIBADANBgkqhkiG9w0B
AQsFAAOCAgEAW4ioo1+J9VWC0UntSBXcXRm1ePTVamtsxVy/GpP4EmJd3Ub53JzN
BfYdgfUL51CppS3ZY6BoagB+DqoA2GbSL+7sFGHBl5ka6FNelrwsH6VVw4xV/8kl
IjmqOyfatPYsz0sUdZev+reeiGpKVoXrK6BDnUU27/mgPtem5YKWvHB/soofUrLK
zZV3WfGdx9zBr8V0xW6vO3CKaqkqU9y6EsQw34n7eJCbEVVQ8VdFd9iV1pmXwaBA
fBwkviPTKEP9Cm+zbFIOLr3V3CL9hJj+gkTUuXWlJJ6wVXEG5i4rIbLAV59UrW4L
onP+seqvWMJYUFxu/niF0R3fSGM+NU11DtBVkhRZt1u0kFhZqjDz1dWyfT/N7Hke
3WsDqUFsBi+8SEw90rWx2aUkLvKo83oU4Mx4na+2I3l9F2a2VNGk4K7l3a00g51m
iPiq0Da0jqw30PaLluTMTGY5+RnZVh50JD6nk+Ea3wRkU8aiYFnpIxfKBZ72whmY
Ya/egj9IKeqpR0vuLebbU0fJBf880K1jWD3Z5SFyJXo057Mv0OPw5mttytE585ZI
y5JsaRXlsOoWGRXE3kUT/MKR1UoAgR54c8Bsh+9Dq2wqIK9mRn15zvBDeyHG6+cz
urLopziOUeWokxZN1syrEdKlhFoPYavm6t+PzIcpdxZwHA+V3jLJPfI=
-----END CERTIFICATE-----`
	}],
	apple: [{
		name: "Apple WebAuthn Root CA",
		source: "https://www.apple.com/certificateauthority/Apple_WebAuthn_Root_CA.pem",
		sha256: "0915dd5c07a28db549d1f677bb5a75d4bfbe9561a773424327762e9e02f9bb29",
		pem: `-----BEGIN CERTIFICATE-----
MIICEjCCAZmgAwIBAgIQaB0BbHo84wIlpQGUKEdXcTAKBggqhkjOPQQDAzBLMR8w
HQYDVQQDDBZBcHBsZSBXZWJBdXRobiBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJ
bmMuMRMwEQYDVQQIDApDYWxpZm9ybmlhMB4XDTIwMDMxODE4MjEzMloXDTQ1MDMx
NTAwMDAwMFowSzEfMB0GA1UEAwwWQXBwbGUgV2ViQXV0aG4gUm9vdCBDQTETMBEG
A1UECgwKQXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTB2MBAGByqGSM49
AgEGBSuBBAAiA2IABCJCQ2pTVhzjl4Wo6IhHtMSAzO2cv+H9DQKev3//fG59G11k
xu9eI0/7o6V5uShBpe1u6l6mS19S1FEh6yGljnZAJ+2GNP1mi/YK2kSXIuTHjxA/
pcoRf7XkOtO4o1qlcaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQUJtdk
2cV4wlpn0afeaxLQG2PxxtcwDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2cA
MGQCMFrZ+9DsJ1PW9hfNdBywZDsWDbWFp28it1d/5w2RPkRX3Bbn/UbDTNLx7Jr3
jAGGiQIwHFj+dJZYUJR786osByBelJYsVZd2GbHQu209b5RCmGQ21gpSAk9QZW4B
1bWeT0vT
-----END CERTIFICATE-----`
	}],
	"android-key": [{
		name: "Google hardware attestation root (RSA-4096, serialNumber=f92009e853b6b045)",
		source: "https://android.googleapis.com/attestation/root",
		sha256: "cedb1cb6dc896ae5ec797348bce9286753c2b38ee71ce0fbe34a9a1248800dfc",
		pem: `-----BEGIN CERTIFICATE-----
MIIFHDCCAwSgAwIBAgIJAPHBcqaZ6vUdMA0GCSqGSIb3DQEBCwUAMBsxGTAXBgNV
BAUTEGY5MjAwOWU4NTNiNmIwNDUwHhcNMjIwMzIwMTgwNzQ4WhcNNDIwMzE1MTgw
NzQ4WjAbMRkwFwYDVQQFExBmOTIwMDllODUzYjZiMDQ1MIICIjANBgkqhkiG9w0B
AQEFAAOCAg8AMIICCgKCAgEAr7bHgiuxpwHsK7Qui8xUFmOr75gvMsd/dTEDDJdS
Sxtf6An7xyqpRR90PL2abxM1dEqlXnf2tqw1Ne4Xwl5jlRfdnJLmN0pTy/4lj4/7
tv0Sk3iiKkypnEUtR6WfMgH0QZfKHM1+di+y9TFRtv6y//0rb+T+W8a9nsNL/ggj
nar86461qO0rOs2cXjp3kOG1FEJ5MVmFmBGtnrKpa73XpXyTqRxB/M0n1n/W9nGq
C4FSYa04T6N5RIZGBN2z2MT5IKGbFlbC8UrW0DxW7AYImQQcHtGl/m00QLVWutHQ
oVJYnFPlXTcHYvASLu+RhhsbDmxMgJJ0mcDpvsC4PjvB+TxywElgS70vE0XmLD+O
JtvsBslHZvPBKCOdT0MS+tgSOIfga+z1Z1g7+DVagf7quvmag8jfPioyKvxnK/Eg
sTUVi2ghzq8wm27ud/mIM7AY2qEORR8Go3TVB4HzWQgpZrt3i5MIlCaY504LzSRi
igHCzAPlHws+W0rB5N+er5/2pJKnfBSDiCiFAVtCLOZ7gLiMm0jhO2B6tUXHI/+M
RPjy02i59lINMRRev56GKtcd9qO/0kUJWdZTdA2XoS82ixPvZtXQpUpuL12ab+9E
aDK8Z4RHJYYfCT3Q5vNAXaiWQ+8PTWm2QgBR/bkwSWc+NpUFgNPN9PvQi8WEg5Um
AGMCAwEAAaNjMGEwHQYDVR0OBBYEFDZh4QB8iAUJUYtEbEf/GkzJ6k8SMB8GA1Ud
IwQYMBaAFDZh4QB8iAUJUYtEbEf/GkzJ6k8SMA8GA1UdEwEB/wQFMAMBAf8wDgYD
VR0PAQH/BAQDAgIEMA0GCSqGSIb3DQEBCwUAA4ICAQB8cMqTllHc8U+qCrOlg3H7
174lmaCsbo/bJ0C17JEgMLb4kvrqsXZs01U3mB/qABg/1t5Pd5AORHARs1hhqGIC
W/nKMav574f9rZN4PC2ZlufGXb7sIdJpGiO9ctRhiLuYuly10JccUZGEHpHSYM2G
tkgYbZba6lsCPYAAP83cyDV+1aOkTf1RCp/lM0PKvmxYN10RYsK631jrleGdcdkx
oSK//mSQbgcWnmAEZrzHoF1/0gso1HZgIn0YLzVhLSA/iXCX4QT2h3J5z3znluKG
1nv8NQdxei2DIIhASWfu804CA96cQKTTlaae2fweqXjdN1/v2nqOhngNyz1361mF
mr4XmaKH/ItTwOe72NI9ZcwS1lVaCvsIkTDCEXdm9rCNPAY10iTunIHFXRh+7KPz
lHGewCq/8TOohBRn0/NNfh7uRslOSZ/xKbN9tMBtw37Z8d2vvnXq/YWdsm1+JLVw
n6yYD/yacNJBlwpddla8eaVMjsF6nBnIgQOf9zKSe06nSTqvgwUHosgOECZJZ1Eu
zbH4yswbt02tKtKEFhx+v+OTge/06V+jGsqTWLsfrOCNLuA8H++z+pUENmpqnnHo
vaI47gC+TNpkgYGkkBT6B/m/U01BuOBBTzhIlMEZq9qkDWuM2cA5kW5V3FJUcfHn
w1IdYIg2Wxg7yHcQZemFQg==
-----END CERTIFICATE-----`
	}, {
		name: "Google Key Attestation CA1 (EC P-384)",
		source: "https://android.googleapis.com/attestation/root",
		sha256: "6d9db4ce6c5c0b293166d08986e05774a8776ceb525d9e4329520de12ba4bcc0",
		pem: `-----BEGIN CERTIFICATE-----
MIICIjCCAaigAwIBAgIRAISp0Cl7DrWK5/8OgN52BgUwCgYIKoZIzj0EAwMwUjEc
MBoGA1UEAwwTS2V5IEF0dGVzdGF0aW9uIENBMTEQMA4GA1UECwwHQW5kcm9pZDET
MBEGA1UECgwKR29vZ2xlIExMQzELMAkGA1UEBhMCVVMwHhcNMjUwNzE3MjIzMjE4
WhcNMzUwNzE1MjIzMjE4WjBSMRwwGgYDVQQDDBNLZXkgQXR0ZXN0YXRpb24gQ0Ex
MRAwDgYDVQQLDAdBbmRyb2lkMRMwEQYDVQQKDApHb29nbGUgTExDMQswCQYDVQQG
EwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABCPaI3FO3z5bBQo8cuiEas4HjqCt
G/mLFfRT0MsIssPBEEU5Cfbt6sH5yOAxqEi5QagpU1yX4HwnGb7OtBYpDTB57uH5
Eczm34A5FNijV3s0/f0UPl7zbJcTx6xwqMIRq6NCMEAwDwYDVR0TAQH/BAUwAwEB
/zAOBgNVHQ8BAf8EBAMCAQYwHQYDVR0OBBYEFFIyuyz7RkOb3NaBqQ5lZuA0QepA
MAoGCCqGSM49BAMDA2gAMGUCMETfjPO/HwqReR2CS7p0ZWoD/LHs6hDi422opifH
EUaYLxwGlT9SLdjkVpz0UUOR5wIxAIoGyxGKRHVTpqpGRFiJtQEOOTp/+s1GcxeY
uR2zh/80lQyu9vAFCj6E4AXc+osmRg==
-----END CERTIFICATE-----`
	}]
};
/** A pinned root's certificate, or null when its PEM does not match its fingerprint or is not a CA. */
function loadPinnedRoot(r) {
	try {
		const cert = new X509Certificate(r.pem);
		return createHash("sha256").update(cert.raw).digest("hex") === r.sha256 && cert.ca ? cert : null;
	} catch {
		return null;
	}
}
/** The pinned roots of a format that match their fingerprints. */
function pinnedRoots(fmt) {
	return PINNED_ATTESTATION_ROOTS[fmt].map(loadPinnedRoot).filter((c) => c !== null);
}
//#endregion
//#region src/enclawed/auth/der.ts
var DerError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "DerError";
	}
};
const DER_CLASS = {
	universal: 0,
	application: 1,
	context: 2,
	private: 3
};
function tlvContent(t) {
	return t.buf.subarray(t.start, t.end);
}
/** Read one TLV at `at`, never past `limit`. */
function readTlv(buf, at = 0, limit = buf.length) {
	if (at >= limit) throw new DerError("truncated: no tag");
	const first = buf[at++];
	const cls = first >> 6;
	const constructed = (first & 32) !== 0;
	let tag = first & 31;
	if (tag === 31) {
		tag = 0;
		let n = 0;
		for (;;) {
			if (at >= limit) throw new DerError("truncated tag");
			const b = buf[at++];
			if (n === 0 && b === 128) throw new DerError("non-minimal tag");
			tag = tag * 128 + (b & 127);
			n++;
			if (n > 4) throw new DerError("tag too large");
			if ((b & 128) === 0) break;
		}
		if (tag < 31) throw new DerError("non-minimal tag");
	}
	if (at >= limit) throw new DerError("truncated length");
	let len = buf[at++];
	if (len === 128) throw new DerError("indefinite length is not DER");
	if (len > 128) {
		const n = len & 127;
		if (n > 4 || at + n > limit) throw new DerError("bad length");
		len = 0;
		for (let i = 0; i < n; i++) len = len * 256 + buf[at++];
		if (len < 128 || n > 1 && len < 256 ** (n - 1)) throw new DerError("non-minimal length");
	}
	if (at + len > limit) throw new DerError("content runs past its parent");
	return {
		cls,
		constructed,
		tag,
		start: at,
		end: at + len,
		buf
	};
}
/** Parse exactly one TLV filling `buf`. */
function parseDer(buf) {
	const t = readTlv(buf, 0, buf.length);
	if (t.end !== buf.length) throw new DerError("trailing bytes");
	return t;
}
/** The children of a constructed TLV, which must exactly fill it. */
function children(t) {
	if (!t.constructed) throw new DerError("not a constructed value");
	const out = [];
	let at = t.start;
	while (at < t.end) {
		const c = readTlv(t.buf, at, t.end);
		out.push(c);
		at = c.end;
	}
	return out;
}
const isSeq = (t) => t.cls === 0 && t.tag === 16 && t.constructed;
function seq(t, what) {
	if (!isSeq(t)) throw new DerError(`${what}: not a SEQUENCE`);
	return children(t);
}
/** A non-negative INTEGER or ENUMERATED that fits a safe integer. */
function readUint(t, what) {
	if (t.cls !== 0 || t.tag !== 2 && t.tag !== 10 || t.constructed) throw new DerError(`${what}: not an INTEGER`);
	const c = tlvContent(t);
	if (c.length === 0 || (c[0] & 128) !== 0) throw new DerError(`${what}: negative or empty INTEGER`);
	if (c.length > 1 && c[0] === 0 && (c[1] & 128) === 0) throw new DerError(`${what}: non-minimal INTEGER`);
	let v = 0;
	for (const b of c) {
		v = v * 256 + b;
		if (v > Number.MAX_SAFE_INTEGER) throw new DerError(`${what}: INTEGER too large`);
	}
	return v;
}
function readOctets(t, what) {
	if (t.cls !== 0 || t.tag !== 4 || t.constructed) throw new DerError(`${what}: not an OCTET STRING`);
	return tlvContent(t);
}
function readBoolean(t, what) {
	const c = tlvContent(t);
	if (t.cls !== 0 || t.tag !== 1 || t.constructed || c.length !== 1) throw new DerError(`${what}: not a BOOLEAN`);
	if (c[0] !== 0 && c[0] !== 255) throw new DerError(`${what}: non-DER BOOLEAN`);
	return c[0] === 255;
}
function readOid(t, what = "OID") {
	if (t.cls !== 0 || t.tag !== 6 || t.constructed) throw new DerError(`${what}: not an OBJECT IDENTIFIER`);
	const c = tlvContent(t);
	if (c.length === 0) throw new DerError(`${what}: empty OID`);
	const arcs = [];
	let v = 0;
	let fresh = true;
	for (const b of c) {
		if (fresh && b === 128) throw new DerError(`${what}: non-minimal OID arc`);
		fresh = false;
		v = v * 128 + (b & 127);
		if (v > Number.MAX_SAFE_INTEGER) throw new DerError(`${what}: OID arc too large`);
		if ((b & 128) === 0) {
			arcs.push(v);
			v = 0;
			fresh = true;
		}
	}
	if (!fresh) throw new DerError(`${what}: truncated OID`);
	return [...arcs[0] < 80 ? [Math.floor(arcs[0] / 40), arcs[0] % 40] : [2, arcs[0] - 80], ...arcs.slice(1)].join(".");
}
/** The extensions of an X.509 v3 certificate, in order. Duplicate OIDs are an error (RFC 5280 §4.2). */
function certExtensions(certDer) {
	const cert = seq(parseDer(certDer), "certificate");
	if (cert.length !== 3) throw new DerError("certificate: expected tbsCertificate, algorithm, signature");
	const wrapped = seq(cert[0], "tbsCertificate").find((t) => t.cls === DER_CLASS.context && t.tag === 3);
	if (!wrapped) return [];
	const list = children(wrapped);
	if (list.length !== 1) throw new DerError("extensions: expected one SEQUENCE");
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	for (const e of seq(list[0], "extensions")) {
		const parts = seq(e, "extension");
		const oid = readOid(parts[0], "extnID");
		let critical = false;
		let i = 1;
		if (parts.length === 3) {
			critical = readBoolean(parts[1], "critical");
			i = 2;
		} else if (parts.length !== 2) throw new DerError("extension: wrong number of fields");
		if (seen.has(oid)) throw new DerError(`extension ${oid} appears twice`);
		seen.add(oid);
		out.push({
			oid,
			critical,
			value: readOctets(parts[i], "extnValue")
		});
	}
	return out;
}
/** The certificate's version field (0 = v1, 2 = v3). */
function certVersion(certDer) {
	const first = seq(seq(parseDer(certDer), "certificate")[0], "tbsCertificate")[0];
	if (first.cls === DER_CLASS.context && first.tag === 0) return readUint(children(first)[0], "version");
	return 0;
}
/** True when the certificate's subject is the empty Name (a SEQUENCE with no RDNs). */
function certSubjectEmpty(certDer) {
	const tbs = seq(seq(parseDer(certDer), "certificate")[0], "tbsCertificate");
	const subject = tbs[(tbs[0].cls === DER_CLASS.context && tbs[0].tag === 0 ? 1 : 0) + 4];
	if (!subject || !isSeq(subject)) throw new DerError("tbsCertificate: no subject");
	return subject.end === subject.start;
}
//#endregion
//#region src/enclawed/auth/webauthn-error.ts
var WebAuthnError = class extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "WebAuthnError";
	}
};
//#endregion
//#region src/enclawed/auth/attestation-platform.ts
/** The pinned vendor roots (attestation-roots.ts), each checked against its fingerprint. */
function pinnedVendorRoots() {
	return {
		tpm: pinnedRoots("tpm"),
		apple: pinnedRoots("apple"),
		"android-key": pinnedRoots("android-key")
	};
}
const MAX_CHAIN = 6;
function invalid(message) {
	return new WebAuthnError("attestation-invalid", message);
}
function within(cert, now) {
	return now >= Date.parse(cert.validFrom) && now <= Date.parse(cert.validTo);
}
/**
* Verify x5c[0] up to one of `roots`: each certificate is inside its
* validity, each issuer is a CA whose key verifies the certificate below it,
* and the last link is signed by a pinned root (a copy of the root inside
* x5c is never trusted for itself). Returns the parsed x5c.
*/
function verifyChainToRoots(x5c, roots, now, what) {
	if (x5c.length === 0) throw new WebAuthnError("attestation-missing", `${what}: no attestation certificate`);
	if (x5c.length > MAX_CHAIN) throw invalid(`${what}: attestation chain longer than ${MAX_CHAIN}`);
	if (roots.length === 0) throw invalid(`${what}: no pinned root verifies (a pinned root does not match its fingerprint)`);
	let certs;
	try {
		certs = x5c.map((c) => new X509Certificate(Buffer.from(c)));
	} catch {
		throw invalid(`${what}: an attestation certificate does not parse`);
	}
	for (let i = 0; i < certs.length; i++) {
		const cur = certs[i];
		if (!within(cur, now)) throw invalid(`${what}: certificate ${i} is outside its validity`);
		if (i > 0 && !cur.ca) throw invalid(`${what}: certificate ${i} issues another but is not a CA`);
		const root = roots.find((r) => cur.checkIssued(r) && cur.verify(r.publicKey));
		if (root) {
			if (!within(root, now)) throw invalid(`${what}: the vendor root is outside its validity`);
			return certs;
		}
		const next = certs[i + 1];
		if (!next) break;
		if (!next.ca || !cur.checkIssued(next) || !cur.verify(next.publicKey)) throw invalid(`${what}: certificate ${i} is not signed by certificate ${i + 1}`);
	}
	throw invalid(`${what}: the attestation does not chain to the vendor's pinned root`);
}
function spki(key) {
	return key.export({
		type: "spki",
		format: "der"
	});
}
function sameKey(cert, pub, what) {
	if (!spki(cert.publicKey).equals(spki(pub.key))) throw invalid(`${what}: the certificate's key is not the credential key`);
}
/**
* COSE algorithms an attestation statement may be signed with. RS1 (SHA-1)
* is accepted for "tpm" statements only: Windows signs most TPM attestations
* with it. It never signs a credential (credential keys are ES256, EdDSA or
* RS256), and the binding of the credential key to the TPM is the SHA-256
* name of its public area, not this signature's hash.
*/
const SIG_ALGS = {
	[-7]: {
		hash: "sha256",
		kind: "ec"
	},
	[-35]: {
		hash: "sha384",
		kind: "ec"
	},
	[-36]: {
		hash: "sha512",
		kind: "ec"
	},
	[-257]: {
		hash: "sha256",
		kind: "rsa"
	},
	[-258]: {
		hash: "sha384",
		kind: "rsa"
	},
	[-259]: {
		hash: "sha512",
		kind: "rsa"
	},
	[-37]: {
		hash: "sha256",
		kind: "pss"
	},
	[-38]: {
		hash: "sha384",
		kind: "pss"
	},
	[-39]: {
		hash: "sha512",
		kind: "pss"
	},
	[-65535]: {
		hash: "sha1",
		kind: "rsa"
	}
};
function sigAlg(alg, fmt) {
	const a = alg === void 0 ? void 0 : SIG_ALGS[alg];
	if (!a || a.hash === "sha1" && fmt !== "tpm") throw invalid(`${fmt}: attestation algorithm ${String(alg)} is not accepted`);
	return a;
}
function verifySig(cert, a, data, sig) {
	const key = cert.publicKey;
	const type = key.asymmetricKeyType;
	try {
		if (a.kind === "ec") return type === "ec" && verify(a.hash, data, {
			key,
			dsaEncoding: "der"
		}, sig);
		if (type !== "rsa") return false;
		return verify(a.hash, data, a.kind === "pss" ? {
			key,
			padding: constants$1.RSA_PKCS1_PSS_PADDING,
			saltLength: constants$1.RSA_PSS_SALTLEN_DIGEST
		} : {
			key,
			padding: constants$1.RSA_PKCS1_PADDING
		}, sig);
	} catch {
		return false;
	}
}
function digest(hash, data) {
	return createHash(hash).update(data).digest();
}
const OID = {
	aaguid: "1.3.6.1.4.1.45724.1.1.4",
	san: "2.5.29.17",
	eku: "2.5.29.37",
	tcgKpAikCertificate: "2.23.133.8.3",
	tpmManufacturer: "2.23.133.2.1",
	tpmModel: "2.23.133.2.2",
	tpmVersion: "2.23.133.2.3",
	appleNonce: "1.2.840.113635.100.8.2",
	androidKeyDescription: "1.3.6.1.4.1.11129.2.1.17"
};
function extensions(der, what) {
	try {
		return certExtensions(der);
	} catch (err) {
		throw invalid(`${what}: certificate extensions do not parse (${err.message})`);
	}
}
function formatAaguid$1(b) {
	const h = Buffer.from(b).toString("hex");
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
/** id-fido-gen-ce-aaguid, when present, must be non-critical and equal the authenticator's AAGUID. */
function checkCertAaguid(exts, aaguid, what) {
	const e = exts.find((x) => x.oid === OID.aaguid);
	if (!e) return;
	let value;
	try {
		value = readOctets(parseDer(e.value), "aaguid");
	} catch {
		throw invalid(`${what}: malformed AAGUID extension`);
	}
	if (e.critical || value.length !== 16) throw invalid(`${what}: malformed AAGUID extension`);
	if (formatAaguid$1(value) !== aaguid) throw invalid(`${what}: certificate AAGUID differs from the authenticator's`);
}
function result(fmt, aaguid, leaf, leafDer, alg) {
	return {
		fmt,
		aaguid,
		certSha256: createHash("sha256").update(leafDer).digest("hex"),
		certSubject: (leaf.subject ?? "").replace(/\n/g, ", "),
		certIssuer: leaf.issuer.replace(/\n/g, ", "),
		allowedAs: null,
		...alg !== void 0 ? { alg } : {}
	};
}
/** Apple anonymous attestation: the credential certificate's nonce extension binds this registration. */
function verifyAppleAttestation(p) {
	const leaf = verifyChainToRoots(p.stmt.x5c, p.roots.apple, p.now, "apple")[0];
	const nonce = digest("sha256", Buffer.concat([p.authDataRaw, p.clientDataHash]));
	const ext = extensions(p.stmt.x5c[0], "apple").find((e) => e.oid === OID.appleNonce);
	if (!ext) throw invalid("apple: the credential certificate has no nonce extension");
	let certNonce;
	try {
		const items = seq(parseDer(ext.value), "apple nonce");
		const tagged = items.find((t) => t.cls === DER_CLASS.context && t.tag === 1);
		if (!tagged || items.length !== 1) throw new DerError("no [1] nonce");
		const inner = children(tagged);
		if (inner.length !== 1) throw new DerError("nonce is not one OCTET STRING");
		certNonce = readOctets(inner[0], "nonce");
	} catch (err) {
		throw invalid(`apple: malformed nonce extension (${err.message})`);
	}
	if (!nonce.equals(Buffer.from(certNonce))) throw invalid("apple: the certificate's nonce does not bind this registration");
	sameKey(leaf, p.credentialPublicKey, "apple");
	return result("apple", p.aaguid, leaf, p.stmt.x5c[0], void 0);
}
const KM_ORIGIN_GENERATED = 0;
const KM_PURPOSE_SIGN = 2;
const SECURITY_LEVEL_SOFTWARE = 0;
const VERIFIED_BOOT_VERIFIED = 0;
function authorizationList(t, what) {
	const out = /* @__PURE__ */ new Map();
	for (const item of seq(t, what)) {
		if (item.cls !== DER_CLASS.context || !item.constructed) throw new DerError(`${what}: entry is not an explicit tagged field`);
		if (out.has(item.tag)) throw new DerError(`${what}: tag ${item.tag} appears twice`);
		const inner = children(item);
		if (inner.length !== 1) throw new DerError(`${what}: tag ${item.tag} is not one value`);
		out.set(item.tag, inner[0]);
	}
	return out;
}
function parseAndroidKeyDescription(value) {
	const f = seq(parseDer(value), "KeyDescription");
	if (f.length < 8) throw new DerError("KeyDescription: too few fields");
	readUint(f[0], "attestationVersion");
	return {
		attestationSecurityLevel: readUint(f[1], "attestationSecurityLevel"),
		keymasterSecurityLevel: readUint(f[3], "keymasterSecurityLevel"),
		attestationChallenge: readOctets(f[4], "attestationChallenge"),
		softwareEnforced: authorizationList(f[6], "softwareEnforced"),
		teeEnforced: authorizationList(f[7], "teeEnforced")
	};
}
/**
* Android key attestation: the statement is signed by the credential key's
* own certificate, whose key description says the key was generated inside
* a TEE or StrongBox (not imported), for signing only, for this client data
* hash, on a device whose bootloader is locked with verified boot.
*/
function verifyAndroidKeyAttestation(p) {
	const a = sigAlg(p.stmt.alg, "android-key");
	const leaf = verifyChainToRoots(p.stmt.x5c, p.roots["android-key"], p.now, "android-key")[0];
	if (!verifySig(leaf, a, Buffer.concat([p.authDataRaw, p.clientDataHash]), p.stmt.sig)) throw invalid("android-key: attestation signature does not verify");
	sameKey(leaf, p.credentialPublicKey, "android-key");
	const ext = extensions(p.stmt.x5c[0], "android-key").find((e) => e.oid === OID.androidKeyDescription);
	if (!ext) throw invalid("android-key: the credential certificate has no key description");
	let kd;
	try {
		kd = parseAndroidKeyDescription(ext.value);
	} catch (err) {
		throw invalid(`android-key: malformed key description (${err.message})`);
	}
	if (!Buffer.from(kd.attestationChallenge).equals(Buffer.from(p.clientDataHash))) throw invalid("android-key: the attestation challenge is not this registration's client data hash");
	if (kd.attestationSecurityLevel === SECURITY_LEVEL_SOFTWARE || kd.keymasterSecurityLevel === SECURITY_LEVEL_SOFTWARE) throw invalid("android-key: the key is attested by software, not by secure hardware");
	if (kd.softwareEnforced.has(600) || kd.teeEnforced.has(600)) throw invalid("android-key: the key is usable by every application (allApplications)");
	const tee = kd.teeEnforced;
	try {
		const origin = tee.get(702);
		if (!origin || readUint(origin, "origin") !== KM_ORIGIN_GENERATED) throw invalid("android-key: the key was not generated inside secure hardware (origin)");
		const purpose = tee.get(1);
		if (!(purpose && purpose.cls === 0 && purpose.tag === 17 ? children(purpose).map((x) => readUint(x, "purpose")) : []).includes(KM_PURPOSE_SIGN)) throw invalid("android-key: the hardware does not enforce the signing purpose");
		const rot = tee.get(704);
		if (!rot) throw invalid("android-key: the hardware reports no root of trust");
		const r = seq(rot, "rootOfTrust");
		if (r.length < 3) throw new DerError("rootOfTrust: too few fields");
		if (!readBoolean(r[1], "deviceLocked")) throw invalid("android-key: the device's bootloader is unlocked");
		if (readUint(r[2], "verifiedBootState") !== VERIFIED_BOOT_VERIFIED) throw invalid("android-key: the device did not boot a verified system");
	} catch (err) {
		if (err instanceof WebAuthnError) throw err;
		throw invalid(`android-key: malformed authorization list (${err.message})`);
	}
	return result("android-key", p.aaguid, leaf, p.stmt.x5c[0], p.stmt.alg);
}
const TPM_GENERATED_VALUE = 4283712327;
const TPM_ST_ATTEST_CERTIFY = 32791;
const TPM_ALG = {
	RSA: 1,
	SHA1: 4,
	SHA256: 11,
	SHA384: 12,
	SHA512: 13,
	NULL: 16,
	ECC: 35
};
const TPM_NAME_HASH = {
	[TPM_ALG.SHA1]: "sha1",
	[TPM_ALG.SHA256]: "sha256",
	[TPM_ALG.SHA384]: "sha384",
	[TPM_ALG.SHA512]: "sha512"
};
const TPM_ECC_CURVE = {
	3: "P-256",
	4: "P-384",
	5: "P-521"
};
var Reader = class {
	constructor(b) {
		this.b = b;
		this.at = 0;
	}
	u8() {
		this.need(1);
		return this.b.readUInt8(this.at++);
	}
	u16() {
		this.need(2);
		const v = this.b.readUInt16BE(this.at);
		this.at += 2;
		return v;
	}
	u32() {
		this.need(4);
		const v = this.b.readUInt32BE(this.at);
		this.at += 4;
		return v;
	}
	bytes(n) {
		this.need(n);
		const v = this.b.subarray(this.at, this.at + n);
		this.at += n;
		return v;
	}
	tpm2b() {
		return this.bytes(this.u16());
	}
	done(what) {
		if (this.at !== this.b.length) throw invalid(`tpm: trailing bytes in ${what}`);
	}
	need(n) {
		if (this.at + n > this.b.length) throw invalid("tpm: structure truncated");
	}
};
/** TPMT_PUBLIC (TPM 2.0 Part 2 §12.2.4), for RSA and ECC signing keys. */
function parseTpmPublic(raw) {
	const r = new Reader(Buffer.from(raw));
	const type = r.u16();
	const nameAlg = r.u16();
	const objectAttributes = r.u32();
	r.tpm2b();
	if (r.u16() !== TPM_ALG.NULL) throw invalid("tpm: the credential key is a storage key (symmetric set)");
	if (r.u16() !== TPM_ALG.NULL) r.u16();
	if (type === TPM_ALG.RSA) {
		const keyBits = r.u16();
		const exponent = r.u32();
		const modulus = r.tpm2b();
		r.done("pubArea");
		return {
			type,
			nameAlg,
			objectAttributes,
			rsa: {
				keyBits,
				exponent,
				modulus
			}
		};
	}
	if (type === TPM_ALG.ECC) {
		const curve = r.u16();
		if (r.u16() !== TPM_ALG.NULL) r.u16();
		const x = r.tpm2b();
		const y = r.tpm2b();
		r.done("pubArea");
		return {
			type,
			nameAlg,
			objectAttributes,
			ecc: {
				curve,
				x,
				y
			}
		};
	}
	throw invalid(`tpm: public area type ${type} is not RSA or ECC`);
}
/** TPMS_ATTEST carrying TPMS_CERTIFY_INFO (TPM 2.0 Part 2 §10.12.12). */
function parseTpmCertInfo(raw) {
	const r = new Reader(Buffer.from(raw));
	const magic = r.u32();
	const type = r.u16();
	r.tpm2b();
	const extraData = r.tpm2b();
	r.bytes(17);
	r.bytes(8);
	const attestedName = r.tpm2b();
	r.tpm2b();
	r.done("certInfo");
	return {
		magic,
		type,
		extraData,
		attestedName
	};
}
function stripLeadingZeros(b) {
	let i = 0;
	while (i < b.length - 1 && b[i] === 0) i++;
	return Buffer.from(b.subarray(i));
}
/** The pubArea's key must be the credential key, parameter for parameter. */
function checkPubAreaKey(pub, cred) {
	const jwk = cred.key.export({ format: "jwk" });
	if (pub.rsa) {
		if (jwk.kty !== "RSA" || !jwk.n || !jwk.e) throw invalid("tpm: the public area is RSA, the credential key is not");
		const exponent = pub.rsa.exponent === 0 ? 65537 : pub.rsa.exponent;
		const e = Buffer.from(jwk.e, "base64url").readUIntBE(0, Buffer.from(jwk.e, "base64url").length);
		const n = Buffer.from(jwk.n, "base64url");
		if (e !== exponent || !stripLeadingZeros(n).equals(stripLeadingZeros(pub.rsa.modulus)) || pub.rsa.keyBits !== n.length * 8) throw invalid("tpm: the public area's RSA key is not the credential key");
		return;
	}
	if (pub.ecc) {
		const crv = TPM_ECC_CURVE[pub.ecc.curve];
		if (jwk.kty !== "EC" || !jwk.x || !jwk.y || crv !== jwk.crv) throw invalid("tpm: the public area's curve is not the credential key's");
		if (!Buffer.from(jwk.x, "base64url").equals(pub.ecc.x) || !Buffer.from(jwk.y, "base64url").equals(pub.ecc.y)) throw invalid("tpm: the public area's EC point is not the credential key");
		return;
	}
	throw invalid("tpm: the public area carries no key");
}
/** The TPM's identity from the AIK certificate's subjectAltName directoryName. */
function tpmSan(value) {
	const found = /* @__PURE__ */ new Map();
	for (const gn of seq(parseDer(value), "GeneralNames")) {
		if (gn.cls !== DER_CLASS.context || gn.tag !== 4) continue;
		const names = children(gn);
		if (names.length !== 1) throw new DerError("directoryName is not one Name");
		for (const rdn of children(names[0])) for (const atv of children(rdn)) {
			const [oid, val] = seq(atv, "AttributeTypeAndValue");
			const key = readOid(oid);
			if (found.has(key)) throw new DerError(`attribute ${key} appears twice`);
			found.set(key, Buffer.from(val.buf.subarray(val.start, val.end)).toString("utf8"));
		}
	}
	const manufacturer = found.get(OID.tpmManufacturer);
	const model = found.get(OID.tpmModel);
	const version = found.get(OID.tpmVersion);
	if (!manufacturer || model === void 0 || version === void 0) throw new DerError("TPM manufacturer, model or version missing");
	return {
		manufacturer,
		model,
		version
	};
}
/**
* TPM attestation (Windows Hello): the TPM certified (TPM2_Certify) that the
* credential key is a TPM-resident, non-duplicable key it generated, with
* this registration's hash as qualifying data, signed by an attestation
* identity key whose certificate chains to the TPM vendor root.
*/
function verifyTpmAttestation(p) {
	const s = p.stmt;
	if (s.ver !== "2.0") throw invalid(`tpm: version ${String(s.ver)} is not 2.0`);
	if (!s.certInfo || !s.pubArea) throw new WebAuthnError("attestation-format", "tpm: certInfo or pubArea missing");
	const a = sigAlg(s.alg, "tpm");
	const pub = parseTpmPublic(s.pubArea);
	checkPubAreaKey(pub, p.credentialPublicKey);
	const need = 262194;
	if ((pub.objectAttributes & need) !== need) throw invalid("tpm: the credential key is not a signing key generated in and fixed to this TPM");
	const nameHash = TPM_NAME_HASH[pub.nameAlg];
	if (!nameHash) throw invalid(`tpm: name algorithm ${pub.nameAlg} is not accepted`);
	const info = parseTpmCertInfo(s.certInfo);
	if (info.magic !== TPM_GENERATED_VALUE || info.type !== TPM_ST_ATTEST_CERTIFY) throw invalid("tpm: certInfo is not a TPM-generated certification");
	const attToBeSigned = Buffer.concat([p.authDataRaw, p.clientDataHash]);
	if (!info.extraData.equals(digest(a.hash, attToBeSigned))) throw invalid("tpm: certInfo does not bind this registration (extraData)");
	const nameAlg = Buffer.alloc(2);
	nameAlg.writeUInt16BE(pub.nameAlg);
	const name = Buffer.concat([nameAlg, digest(nameHash, s.pubArea)]);
	if (!info.attestedName.equals(name)) throw invalid("tpm: certInfo certifies a different key (attested name)");
	const aik = verifyChainToRoots(s.x5c, p.roots.tpm, p.now, "tpm")[0];
	if (!verifySig(aik, a, s.certInfo, s.sig)) throw invalid("tpm: the attestation identity key's signature does not verify");
	const aikDer = s.x5c[0];
	let san;
	try {
		if (certVersion(aikDer) !== 2) throw invalid("tpm: the AIK certificate is not X.509 v3");
		if (!certSubjectEmpty(aikDer)) throw invalid("tpm: the AIK certificate's subject is not empty");
		const exts = extensions(aikDer, "tpm");
		const sanExt = exts.find((e) => e.oid === OID.san);
		if (!sanExt) throw invalid("tpm: the AIK certificate has no subject alternative name");
		san = tpmSan(sanExt.value);
		const eku = exts.find((e) => e.oid === OID.eku);
		if (!(eku ? seq(parseDer(eku.value), "EKU").map((x) => readOid(x)) : []).includes(OID.tcgKpAikCertificate)) throw invalid("tpm: the AIK certificate lacks the tcg-kp-AIKCertificate key purpose");
		checkCertAaguid(exts, p.aaguid, "tpm");
	} catch (err) {
		if (err instanceof WebAuthnError) throw err;
		throw invalid(`tpm: malformed AIK certificate (${err.message})`);
	}
	if (aik.ca) throw invalid("tpm: the AIK certificate is a CA certificate");
	if (!/^id:[0-9A-F]{8}$/.test(san.manufacturer)) throw invalid(`tpm: TPM manufacturer ${JSON.stringify(san.manufacturer)} is not a TCG vendor id`);
	return {
		...result("tpm", p.aaguid, aik, aikDer, s.alg),
		certSubject: `TPM ${san.manufacturer} ${san.model} ${san.version}`
	};
}
/** Verify a platform format's statement with the given roots. */
function verifyPlatformAttestation(fmt, p) {
	switch (fmt) {
		case "tpm": return verifyTpmAttestation(p);
		case "apple": return verifyAppleAttestation(p);
		case "android-key": return verifyAndroidKeyAttestation(p);
	}
	throw new WebAuthnError("attestation-format", `unknown platform format ${String(fmt)}`);
}
//#endregion
//#region src/enclawed/auth/attestation-roots-packed.ts
const PACKED_HARDWARE_ROOTS = [
	{
		name: "C=FR, O=DIS, OU=CS, CN=Gemalto MultiApp FIDO Subca CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "050d4ebb551eac10382d05c147124f1c6347af433802dc51702c0cbf1153de1a",
		pem: `-----BEGIN CERTIFICATE-----
MIIDdTCCAl2gAwIBAgIJAICUTvkgtj5CMA0GCSqGSIb3DQEBCwUAMFExCzAJBgNV
BAYTAkZSMQwwCgYDVQQKDANESVMxCzAJBgNVBAsMAkNTMScwJQYDVQQDDB5HZW1h
bHRvIE11bHRpQXBwIEZJRE8gU3ViY2EgQ0EwHhcNMjAwNzA3MTQzNzE4WhcNMzAw
NzA1MTQzNzE4WjBRMQswCQYDVQQGEwJGUjEMMAoGA1UECgwDRElTMQswCQYDVQQL
DAJDUzEnMCUGA1UEAwweR2VtYWx0byBNdWx0aUFwcCBGSURPIFN1YmNhIENBMIIB
IjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvAKOeqC5/p0D1isCYKQJlVUO
rB6I7DLocunE/Rm8duGTbyxQht3CbFVTv3N2Lp2fbjxlI+3sOSGk33FTYkTqxcdJ
IrJ7SskBcUSNrfKOaQT/6KQcP4Cm7V+655Tq+TWxyxWQhDygt15qoP7MuK6bT9Sw
pCjpfKhaMSmyQaMoUcRAbLqdzBCac0hzB+Ze+gqJlnWV9UaSI2rFsVuH4ZE0cRO+
MOpaLgM/s248nGGHp22ewSQfbnPaBbb8iqyAP+cu52GLsUpKRJebE+R6+PMQ9JCd
WeQZR3DkfSidkv3mcb4jq1iIta+MqKhRnwrfXh911KWLnYAl9ENChLX0c6Sj1QID
AQABo1AwTjAdBgNVHQ4EFgQUWLvhRBUPn8uLIf68+gv/NZIwGSIwHwYDVR0jBBgw
FoAUWLvhRBUPn8uLIf68+gv/NZIwGSIwDAYDVR0TBAUwAwEB/zANBgkqhkiG9w0B
AQsFAAOCAQEAFLrDhaegeKHxYjH3EP3vUBKhnzM206ASxgeYCO2Ec9pOlYJaeqFE
+sUamUV/pwjDlqNaSgFgy7TweYkvOmMn4qScsHqvJ3zGOAiafwah1vUHfClXR8+a
xO2iGOUF0JKrZ9YYjbAa5/4HClv7jFPOdMWTOQyngoiHAs3jkuYjpCLFlB4VOi3d
1wjA1pnTdBKkAb7t8nTvw+/XbFvcQa73VH7sjvoBqD3fdMfRcuVq4qUZtZT6cGag
THD61Ttqh9oMCZXcDbR1PGZnNbqycsWPDIK0npmK3/3lfV8c+Zsry6e170mfJMZp
7O8m6CSz6/VLK+yDJd7841wpmeKTf6InZA==
-----END CERTIFICATE-----`
	},
	{
		name: "C=FR, O=Thales DIS, OU=BPS, CN=Thales DIS BPS FIDO ECDSA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "0b75a5b6c3cc1445abc0418089c0da7c03a1faa3593ecc99f05220eec32e7a1e",
		pem: `-----BEGIN CERTIFICATE-----
MIICSDCCAe2gAwIBAgIQU7uZMjA6oR8oWLjCyh8/6TAKBggqhkjOPQQDAjCBkTE1
MDMGCSqGSIb3DQEJARYmY2VydGlmaWNhdGUuYXV0b21hdGlvbkB0aGFsZXNncm91
cC5jb20xCzAJBgNVBAYTAkZSMQ4wDAYDVQQHDAVUb3VyczETMBEGA1UECgwKVGhh
bGVzIERJUzEmMCQGA1UEAwwdVGhhbGVzIERJUyBTb2x1dGlvbnMgRUNEU0EgQ0Ew
HhcNMjUwOTA1MDkzNDQzWhcNNDAwOTAxMDkzNDQzWjBUMQswCQYDVQQGEwJGUjET
MBEGA1UECgwKVGhhbGVzIERJUzEMMAoGA1UECwwDQlBTMSIwIAYDVQQDDBlUaGFs
ZXMgRElTIEJQUyBGSURPIEVDRFNBMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE
QG4ZdCUCRTVLlXRB7lDntvLQdEXqqTWkC0eqCd8NIxNJIqFRspITYNyGkj1hRgCW
gwr2R8Pf9KlRKq1EprQePKNjMGEwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQU
sbojIxEsqnknjegN+Q7QGExPAmEwHwYDVR0jBBgwFoAUjT/TrgYTW7Rp3PzgjE4B
p100YXcwDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMCA0kAMEYCIQCDQfm8eISl
uRbqTt1a5KkF/oJEGko1X6oaHHPG862ZSAIhANzwHd7WFrAybK21/2irjfxxNY9a
YOs3eD0GnTG+qJbF
-----END CERTIFICATE-----`
	},
	{
		name: "CN=Gemalto MultiApp FIDO CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "0c247f03fd5237a2df6661bf878faa09b38f2cfdcb89a2f24c61d48ca13b91da",
		pem: `-----BEGIN CERTIFICATE-----
MIIC6TCCAdGgAwIBAgIJAJbTyru1X/IPMA0GCSqGSIb3DQEBCwUAMCMxITAfBgNV
BAMMGEdlbWFsdG8gTXVsdGlBcHAgRklETyBDQTAeFw0xODA2MTIxNDQ1NTBaFw0y
ODA2MDkxNDQ1NTBaMCMxITAfBgNVBAMMGEdlbWFsdG8gTXVsdGlBcHAgRklETyBD
QTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAMVjKHWpbD7TSlMxocjT
l6nIf7x32PmsQ9zGuLGGqA0UQZoIq3XLzL6LYUvJ5A5g0uyFGllHEfGAKrEaCQ8F
VvPS/Uh0FyfzWhRAziTSijjMIIVjjjUv9m9vFmcXScgHig7Odz8858V0krNH99qG
m3wjgaOerTWmt+jXCUfn01IkTPwxG2HlgEd45jNLSV7Vool+Ke8E2ki4lEkTeHzb
oulR5GUbp3nMi7E47VMQa3bNwnzWBbsaBSSQhLk3m5HaKhhxa6wJDK47NiMCkCkd
IHuWSQLVAfm85UAONtEOPwi0OuK3qbe8yKOFGf0KhB5MMeAym7MV/M4W0a49ogPD
9pMCAwEAAaMgMB4wDAYDVR0TBAUwAwEB/zAOBgNVHQ8BAf8EBAMCAoQwDQYJKoZI
hvcNAQELBQADggEBAJWz5xLMk5WNYbAb6yOxECBoZ2WeB/ql4VJ3O/3/tNsxOYnz
LeWo540zQh9rAmaxz7eumBlskMq4yGPSNXB9ycWGHgkcCeSzN2wv8CIzDBs2oBZj
TNk65LBZDssTOBtMW/+uTFHQfbuO3ISLhI0DXfREi9NDM3jfk11xHcsfh2RMV+Qd
NfwVaZZrCq+ouG+Evkv7Kqq+oyu0VFM/tz68TGl6ylhPFR1qh9wttpVjAOOCEQCL
qP2dP28lwYByCqHQqVHwbujv/LZjZnKW3LYndZixPPSRCJssDDwJvh/f6nTxg9ZE
+/JcYre5CaI8nzVHaSOCjNJ7FzULG64JiWOvQ50=
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=HID Global, OU=Authenticator Attestation, CN=FIDO Attestation CA 8",
		source: "FIDO MDS3 blob no. 303",
		sha256: "0f8b05544f7b5ec17202d97df2d108df45114ee38019c2853eb00a105f19cb71",
		pem: `-----BEGIN CERTIFICATE-----
MIIC+jCCAqGgAwIBAgIUdhEg5Y/X2KZ5vowT+vf1lZdJgbcwCgYIKoZIzj0EAwIw
azELMAkGA1UEBhMCVVMxEzARBgNVBAoMCkhJRCBHbG9iYWwxIjAgBgNVBAsMGUF1
dGhlbnRpY2F0b3IgQXR0ZXN0YXRpb24xIzAhBgNVBAMMGkZJRE8gQXR0ZXN0YXRp
b24gUm9vdCBDQSAyMB4XDTI0MTAzMDE4MTU0N1oXDTQ5MTAzMDE4MTU0N1owZjEL
MAkGA1UEBhMCVVMxEzARBgNVBAoMCkhJRCBHbG9iYWwxIjAgBgNVBAsMGUF1dGhl
bnRpY2F0b3IgQXR0ZXN0YXRpb24xHjAcBgNVBAMMFUZJRE8gQXR0ZXN0YXRpb24g
Q0EgODBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABOvF2eIjmg/vdg2SM7hVZzLj
OMIeVomYVdrRaVogpuTLC7KOwHuuBmX4mS7j+P6YePWoU7syIWRU8FwAaAPNy6qj
ggEmMIIBIjAOBgNVHQ8BAf8EBAMCAYYwEgYDVR0TAQH/BAgwBgEB/wIBADAfBgNV
HSMEGDAWgBS76Dpl93vB2h5FDLvyMMvUByj3izAdBgNVHQ4EFgQUfuTDhukAU7Jp
npw4qcZcvOXMMSowRAYDVR0fBD0wOzA5oDegNYYzaHR0cDovL2NybC5oeWRyYW50
aWQuY29tL0ZJRE9BdHRlc3RhdGlvblJvb3RDQTIuY3JsMHYGCCsGAQUFBwEBBGow
aDA/BggrBgEFBQcwAoYzaHR0cDovL2NybC5oeWRyYW50aWQuY29tL0ZJRE9BdHRl
c3RhdGlvblJvb3RDQTIucDdjMCUGCCsGAQUFBzABhhlodHRwOi8vb2NzcC5oeWRy
YW50aWQuY29tMAoGCCqGSM49BAMCA0cAMEQCIF3NY898/6zaOApZotkx8M8L9/9b
981a6iYmwitqzgGEAiBMvjT5zjaM+UefpPrG/flxUxjWyLVhRdaWoYxUruriRg==
-----END CERTIFICATE-----`
	},
	{
		name: "CN=Yubico U2F Root CA Serial 457200631",
		source: "FIDO MDS3 blob no. 303",
		sha256: "0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42",
		pem: `-----BEGIN CERTIFICATE-----
MIIDHjCCAgagAwIBAgIEG0BT9zANBgkqhkiG9w0BAQsFADAuMSwwKgYDVQQDEyNZ
dWJpY28gVTJGIFJvb3QgQ0EgU2VyaWFsIDQ1NzIwMDYzMTAgFw0xNDA4MDEwMDAw
MDBaGA8yMDUwMDkwNDAwMDAwMFowLjEsMCoGA1UEAxMjWXViaWNvIFUyRiBSb290
IENBIFNlcmlhbCA0NTcyMDA2MzEwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQC/jwYuhBVlqaiYWEMsrWFisgJ+PtM91eSrpI4TK7U53mwCIawSDHy8vUmk
5N2KAj9abvT9NP5SMS1hQi3usxoYGonXQgfO6ZXyUA9a+KAkqdFnBnlyugSeCOep
8EdZFfsaRFtMjkwz5Gcz2Py4vIYvCdMHPtwaz0bVuzneueIEz6TnQjE63Rdt2zbw
nebwTG5ZybeWSwbzy+BJ34ZHcUhPAY89yJQXuE0IzMZFcEBbPNRbWECRKgjq//qT
9nmDOFVlSRCt2wiqPSzluwn+v+suQEBsUjTGMEd25tKXXTkNW21wIWbxeSyUoTXw
LvGS6xlwQSgNpk2qXYwf8iXg7VWZAgMBAAGjQjBAMB0GA1UdDgQWBBQgIvz0bNGJ
hjgpToksyKpP9xv9oDAPBgNVHRMECDAGAQH/AgEAMA4GA1UdDwEB/wQEAwIBBjAN
BgkqhkiG9w0BAQsFAAOCAQEAjvjuOMDSa+JXFCLyBKsycXtBVZsJ4Ue3LbaEsPY4
MYN/hIQ5ZM5p7EjfcnMG4CtYkNsfNHc0AhBLdq45rnT87q/6O3vUEtNMafbhU6kt
hX7Y+9XFN9NpmYxr+ekVY5xOxi8h9JDIgoMP4VB1uS0aunL1IGqrNooL9mmFnL2k
LVVee6/VR6C5+KSTCMCWppMuJIZII2v9o4dkoZ8Y7QRjQlLfYzd3qGtKbw7xaF1U
sG/5xUb/Btwb2X2g4InpiB/yt/3CpQXpiWX/K4mBvUKiGn05ZsqeY1gx4g0xLBqc
U9psmyPzK+Vsgw2jeRQ5JlKDyqE0hebfC1tvFu0CCrJFcw==
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=HID Global, OU=Authenticator Attestation, CN=FIDO Attestation CA 10",
		source: "FIDO MDS3 blob no. 303",
		sha256: "1180eee4f2e0065570d63f440fdfaa9cdac2f8fa3e5eb112d74191cca9a95b12",
		pem: `-----BEGIN CERTIFICATE-----
MIIC/jCCAqSgAwIBAgIUIP+VQuq/1RvsYoHluBAhEYPvgTgwCgYIKoZIzj0EAwIw
azELMAkGA1UEBhMCVVMxEzARBgNVBAoMCkhJRCBHbG9iYWwxIjAgBgNVBAsMGUF1
dGhlbnRpY2F0b3IgQXR0ZXN0YXRpb24xIzAhBgNVBAMMGkZJRE8gQXR0ZXN0YXRp
b24gUm9vdCBDQSAyMCAXDTI1MDIxMTE2MDAwMloYDzIwNTAwMjExMTYwMDAyWjBn
MQswCQYDVQQGEwJVUzETMBEGA1UECgwKSElEIEdsb2JhbDEiMCAGA1UECwwZQXV0
aGVudGljYXRvciBBdHRlc3RhdGlvbjEfMB0GA1UEAwwWRklETyBBdHRlc3RhdGlv
biBDQSAxMDBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABGtLZ1A63DxLfM+O7X7u
RbiJ2KiHaTpOxxro1LfN1K78bfIgmj4Glabe+0A7COwfxToorpNdk++t1H202kcv
/S+jggEmMIIBIjAOBgNVHQ8BAf8EBAMCAYYwEgYDVR0TAQH/BAgwBgEB/wIBADAf
BgNVHSMEGDAWgBS76Dpl93vB2h5FDLvyMMvUByj3izAdBgNVHQ4EFgQUS7eOYo4v
sklOvhhe4NqbkgdbmjMwRAYDVR0fBD0wOzA5oDegNYYzaHR0cDovL2NybC5oeWRy
YW50aWQuY29tL0ZJRE9BdHRlc3RhdGlvblJvb3RDQTIuY3JsMHYGCCsGAQUFBwEB
BGowaDA/BggrBgEFBQcwAoYzaHR0cDovL2NybC5oeWRyYW50aWQuY29tL0ZJRE9B
dHRlc3RhdGlvblJvb3RDQTIucDdjMCUGCCsGAQUFBzABhhlodHRwOi8vb2NzcC5o
eWRyYW50aWQuY29tMAoGCCqGSM49BAMCA0gAMEUCIEOttb49eGANGgrmjgzMymvJ
pC4u8FHSG0WH6oDZeY2LAiEAtYIT1x5n51V72/q1wjp32ztBUZnVJ8Gl3zjTDYRw
3y0=
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=Feitian Technologies, CN=Feitian FIDO CA 04",
		source: "FIDO MDS3 blob no. 303",
		sha256: "196f98300ebe607fa45eeca5925cc61b5f6450a2da0330bf617335aa84820250",
		pem: `-----BEGIN CERTIFICATE-----
MIIB+jCCAaCgAwIBAgIQGBUrQbdDrm20FZnDsX2CCTAKBggqhkjOPQQDAjBLMQsw
CQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNobm9sb2dpZXMxHTAbBgNV
BAMMFEZlaXRpYW4gRklETyBSb290IENBMCAXDTE4MDUyMDAwMDAwMFoYDzIwMzgw
NTE5MjM1OTU5WjBJMQswCQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNo
bm9sb2dpZXMxGzAZBgNVBAMMEkZlaXRpYW4gRklETyBDQSAwNDBZMBMGByqGSM49
AgEGCCqGSM49AwEHA0IABMWhFlY5ipIW/HK7KLpKaYU5v49HKwZsyEAqnaSf0CQz
67VHZ0cPXYd6nE4um3BH0lr4W84gPcZFUerZ23HruDOjZjBkMB0GA1UdDgQWBBST
I3BmxR3OxKscK62EwfPnHc5gZzAfBgNVHSMEGDAWgBRLvYcmEa0cic8EWL5w0giM
axYjtzASBgNVHRMBAf8ECDAGAQH/AgEAMA4GA1UdDwEB/wQEAwIBBjAKBggqhkjO
PQQDAgNIADBFAiB/tUDEP0aWFiS9EyVItErfBLZhcY/kLDK6X5rUDHBqtQIhAPrF
pn3c1cf3kVikGQVomVuux1PiepVKTjIh955KYMLx
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=Google, OU=Authenticator Attestation, CN=Titan Security Key Root",
		source: "FIDO MDS3 blob no. 303",
		sha256: "198493807e92540a44a9e1cc9cb0634e27ac68eb37a442da8af9cf60f99e70a6",
		pem: `-----BEGIN CERTIFICATE-----
MIICMjCCAdmgAwIBAgIBATAKBggqhkjOPQQDAjBkMQswCQYDVQQGEwJVUzEPMA0G
A1UECgwGR29vZ2xlMSIwIAYDVQQLDBlBdXRoZW50aWNhdG9yIEF0dGVzdGF0aW9u
MSAwHgYDVQQDDBdUaXRhbiBTZWN1cml0eSBLZXkgUm9vdDAgFw0yMTEyMDExNTIz
NTFaGA8yMTIxMTIwMjE1MjM1MVowZDELMAkGA1UEBhMCVVMxDzANBgNVBAoMBkdv
b2dsZTEiMCAGA1UECwwZQXV0aGVudGljYXRvciBBdHRlc3RhdGlvbjEgMB4GA1UE
AwwXVGl0YW4gU2VjdXJpdHkgS2V5IFJvb3QwWTATBgcqhkjOPQIBBggqhkjOPQMB
BwNCAARqmNWzcDNH63o8TzodB2jk9b49VPsfIvXpdhaWxfLayo4LBbDrXyxF3JR1
P6W6ZsqWCEYrX0oYIxAog3hCE4ydo3oweDAOBgNVHQ8BAf8EBAMCAQYwDwYDVR0T
AQH/BAUwAwEB/zAdBgNVHQ4EFgQU2d6JrFCoEZAe/LUpIMybltDsMh0wHwYDVR0j
BBgwFoAU2d6JrFCoEZAe/LUpIMybltDsMh0wFQYLKwYBBAGC5RwCAQEEBgQEAwIA
ADAKBggqhkjOPQQDAgNHADBEAiANIQ48/nMp2KfYNiovcyxWXJLiul4Sv+zcRJez
rd/WWAIgVucQ531fqzY7ODoK+dIDykRudvlW/yBqza/AdS0Sq6Q=
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=OneSpan, OU=Authenticator Attestation, CN=OneSpan DIGIPASS FX7-C CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "1b1678b4b9bdb1e6164dece87fd38147b00aa417df15f087679e0262e6fed206",
		pem: `-----BEGIN CERTIFICATE-----
MIICEjCCAbigAwIBAgIEATUAATAKBggqhkjOPQQDAjBnMQswCQYDVQQGEwJVUzEQ
MA4GA1UEChMHT25lU3BhbjEiMCAGA1UECxMZQXV0aGVudGljYXRvciBBdHRlc3Rh
dGlvbjEiMCAGA1UEAxMZT25lU3BhbiBESUdJUEFTUyBGWDctQyBDQTAgFw0yNTA2
MjUwNzMzMjVaGA8yMDU1MDYyNjA3MzMyNVowZzELMAkGA1UEBhMCVVMxEDAOBgNV
BAoTB09uZVNwYW4xIjAgBgNVBAsTGUF1dGhlbnRpY2F0b3IgQXR0ZXN0YXRpb24x
IjAgBgNVBAMTGU9uZVNwYW4gRElHSVBBU1MgRlg3LUMgQ0EwWTATBgcqhkjOPQIB
BggqhkjOPQMBBwNCAAQdlJtaubAs3ZXaVFEs94s9GPLI6Zig25BYtdatJvy3sn3R
PnseL37MRwcjIC9QbPmUut7Tp8u5psH5phCa9UJSo1AwTjAdBgNVHQ4EFgQUjSbd
Npmp9tdETGE28gwgZa5+lbUwHwYDVR0jBBgwFoAUjSbdNpmp9tdETGE28gwgZa5+
lbUwDAYDVR0TBAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiEA5jrrT8h+OiM055n0
KTSdwwXddx65vwynLr4fenEqTQoCIExsILgxOF/7vvhHA9kMC+uT02A6Nu9X2EdO
t3sq2jHe
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=OneSpan, OU=Authenticator Attestation, CN=OneSpan DIGIPASS FX7 CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "1b4280e5c5a7465fcdcec82e287949f5d33da4cb692a5467a05101b5546675a2",
		pem: `-----BEGIN CERTIFICATE-----
MIICDTCCAbSgAwIBAgIEeKRKhTAKBggqhkjOPQQDAjBlMQswCQYDVQQGEwJVUzEQ
MA4GA1UEChMHT25lU3BhbjEiMCAGA1UECxMZQXV0aGVudGljYXRvciBBdHRlc3Rh
dGlvbjEgMB4GA1UEAxMXT25lU3BhbiBESUdJUEFTUyBGWDcgQ0EwIBcNMjQwMzI5
MTEzNjU5WhgPMjA1NDAzMzAxMTM2NTlaMGUxCzAJBgNVBAYTAlVTMRAwDgYDVQQK
EwdPbmVTcGFuMSIwIAYDVQQLExlBdXRoZW50aWNhdG9yIEF0dGVzdGF0aW9uMSAw
HgYDVQQDExdPbmVTcGFuIERJR0lQQVNTIEZYNyBDQTBZMBMGByqGSM49AgEGCCqG
SM49AwEHA0IABMOTaYdNPlWUVvU6O6h9EybODkNA0Ym/1MbGuOxL2SzzOtaUsXdN
zekuHJnKV5XkB7o1MxfbcKzU86eN5Y4yxX+jUDBOMB0GA1UdDgQWBBS+MFzPKSFt
efEHH8d+jojdHWpg7zAfBgNVHSMEGDAWgBS+MFzPKSFtefEHH8d+jojdHWpg7zAM
BgNVHRMEBTADAQH/MAoGCCqGSM49BAMCA0cAMEQCIEMrqAcwLuAaKSU405ByLDg+
utZ+9hXuuXHy2EJ0PW32AiBpi+mVSdupZ90yaC8nDr5pTOPVUYnay7jLSbch80Wq
lw==
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=Feitian Technologies, CN=FEITIAN FIDO Root CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "1d0e48061d16ad771c76a4a2a4d856a497aa71578e1e9b3a309d1c0d6f68f7ba",
		pem: `-----BEGIN CERTIFICATE-----
MIICXzCCAcGgAwIBAgIQZlrgX7hufvlliU/zGXhixDAKBggqhkjOPQQDBDBLMQsw
CQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNobm9sb2dpZXMxHTAbBgNV
BAMMFEZFSVRJQU4gRklETyBSb290IENBMCAXDTI1MDEwMTAwMDAwMFoYDzIxMjQx
MjMxMjM1OTU5WjBLMQswCQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNo
bm9sb2dpZXMxHTAbBgNVBAMMFEZFSVRJQU4gRklETyBSb290IENBMIGbMBAGByqG
SM49AgEGBSuBBAAjA4GGAAQAM3K4RlbgKxBsfCjGUQtSK61JCaoM+ZlXBa8SxOHw
AIqbHa1+i7Eo23RGxrfBx8eUBDeEwSLY6yNhMsYMcnhzX8ABea2GAy5Ayd/0o0yT
Xt4NKOgRVktuW7fbAKpOobAerDk7rNOFj5KIafcXym4xAfDpXEPILiqXFpyyRrRM
k/MDayOjQjBAMB0GA1UdDgQWBBSTvGa4M5EerC5XgdIx1gst0nnezzAPBgNVHRMB
Af8EBTADAQH/MA4GA1UdDwEB/wQEAwIBBjAKBggqhkjOPQQDBAOBiwAwgYcCQgFe
RCXIxI4lhsJs76K+ZVFWh3bTmcrYE4y36Xda89LG1WjcxmKv1AQuqFN3PQloxRjf
xfhFOqLkq5kGwHR2Sasc8AJBSeUNSjsGUtOObL6E9l1Zf9wk7RSWxHtlsH0GjSrF
0Cb2GWI02VKLWWPweXZSInZpwlNzrCBENpcDm14/OyUPWUg=
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=HID Global, OU=Authenticator Attestation, CN=FIDO Attestation CA 6",
		source: "FIDO MDS3 blob no. 303",
		sha256: "2a3a942b61522e933ebc2c334ef5dbc33ea40fd9e7b53f52c489cd4b156c7bc0",
		pem: `-----BEGIN CERTIFICATE-----
MIIC/DCCAqGgAwIBAgIUYvCa/tQtMAHX75qVP9QiVnkV/a8wCgYIKoZIzj0EAwIw
azELMAkGA1UEBhMCVVMxEzARBgNVBAoMCkhJRCBHbG9iYWwxIjAgBgNVBAsMGUF1
dGhlbnRpY2F0b3IgQXR0ZXN0YXRpb24xIzAhBgNVBAMMGkZJRE8gQXR0ZXN0YXRp
b24gUm9vdCBDQSAyMB4XDTI0MDUwMjE5MTMyMFoXDTQ5MDUwMjE5MTMyMFowZjEL
MAkGA1UEBhMCVVMxEzARBgNVBAoMCkhJRCBHbG9iYWwxIjAgBgNVBAsMGUF1dGhl
bnRpY2F0b3IgQXR0ZXN0YXRpb24xHjAcBgNVBAMMFUZJRE8gQXR0ZXN0YXRpb24g
Q0EgNjBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABLR0sSaCUiQzX0YvNbsxjZPq
2oRKk1pfOelDL6AsLuZvYkkPKwlyRz8lNPrSmaVeV3gRypJl9bDf4dtmv0Mn5Yyj
ggEmMIIBIjAOBgNVHQ8BAf8EBAMCAYYwEgYDVR0TAQH/BAgwBgEB/wIBADAfBgNV
HSMEGDAWgBS76Dpl93vB2h5FDLvyMMvUByj3izAdBgNVHQ4EFgQUkczOMCw7hPn4
0zZshCaasGQKvWMwRAYDVR0fBD0wOzA5oDegNYYzaHR0cDovL2NybC5oeWRyYW50
aWQuY29tL0ZJRE9BdHRlc3RhdGlvblJvb3RDQTIuY3JsMHYGCCsGAQUFBwEBBGow
aDA/BggrBgEFBQcwAoYzaHR0cDovL2NybC5oeWRyYW50aWQuY29tL0ZJRE9BdHRl
c3RhdGlvblJvb3RDQTIucDdjMCUGCCsGAQUFBzABhhlodHRwOi8vb2NzcC5oeWRy
YW50aWQuY29tMAoGCCqGSM49BAMCA0kAMEYCIQDaEcFIm7l7bpvtQQvXvdEY/+G4
GHYTdrnBCYf9jmOsowIhAJIyFrTMb5NIzAI//WDOsYrlkDPpfUPLixZ0a+oeCmRP
-----END CERTIFICATE-----`
	},
	{
		name: "C=CN, O=Feitian Technologies, CN=Feitian FIDO Root CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "2b7f7417734ad972791ac23a53c596ff67d98c02d391c09ff1c128f097d9f8cc",
		pem: `-----BEGIN CERTIFICATE-----
MIIB2DCCAX6gAwIBAgIQBTmk3ZwilFXjsZywHDnMgDAKBggqhkjOPQQDAjBLMQsw
CQYDVQQGEwJDTjEdMBsGA1UECgwURmVpdGlhbiBUZWNobm9sb2dpZXMxHTAbBgNV
BAMMFEZlaXRpYW4gRklETyBSb290IENBMCAXDTIyMDYwODAwMDAwMFoYDzIwNTIw
NjA3MjM1OTU5WjBLMQswCQYDVQQGEwJDTjEdMBsGA1UECgwURmVpdGlhbiBUZWNo
bm9sb2dpZXMxHTAbBgNVBAMMFEZlaXRpYW4gRklETyBSb290IENBMFkwEwYHKoZI
zj0CAQYIKoZIzj0DAQcDQgAEnfAKbjvMX1Ey1b6k+WQQdNVMt9JgGWyJ3PvM4BSK
5XqTfo++0oAj/4tnwyIL0HFBR9St+ktjqSXDfjiXAurs86NCMEAwHQYDVR0OBBYE
FNGhmE2Bf8O5a/YHZ71QEv6QRfFUMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/
BAQDAgEGMAoGCCqGSM49BAMCA0gAMEUCIByRz4OAlRZ9Hz9KV7g2QNtC0C8JxH/x
LJY8FZEmtJ3sAiEAsreT0+eNkNcUjI9h5OPCoH6NmsOkgvEABJZrF07ADkY=
-----END CERTIFICATE-----`
	},
	{
		name: "CN=FT FIDO 0200",
		source: "FIDO MDS3 blob no. 303",
		sha256: "2c86cb00e189ca0431d33867bbb145cc3abbd4900508e3e26e92e35f2e22877a",
		pem: `-----BEGIN CERTIFICATE-----
MIIBfjCCASWgAwIBAgIBATAKBggqhkjOPQQDAjAXMRUwEwYDVQQDDAxGVCBGSURP
IDAyMDAwIBcNMTYwNTAxMDAwMDAwWhgPMjA1MDA1MDEwMDAwMDBaMBcxFTATBgNV
BAMMDEZUIEZJRE8gMDIwMDBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABNBmrRqV
OxztTJVN19vtdqcL7tKQeol2nnM2/yYgvksZnr50SKbVgIEkzHQVOu80LVEE3lVh
eO1HjggxAlT6o4WjYDBeMB0GA1UdDgQWBBRJFWQt1bvG3jM6XgmV/IcjNtO/CzAf
BgNVHSMEGDAWgBRJFWQt1bvG3jM6XgmV/IcjNtO/CzAMBgNVHRMEBTADAQH/MA4G
A1UdDwEB/wQEAwIBBjAKBggqhkjOPQQDAgNHADBEAiAwfPqgIWIUB+QBBaVGsdHy
0s5RMxlkzpSX/zSyTZmUpQIgB2wJ6nZRM8oX/nA43Rh6SJovM2XwCCH//+LirBAb
B0M=
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=HID Global, OU=Authenticator Attestation, CN=FIDO Attestation CA 9",
		source: "FIDO MDS3 blob no. 303",
		sha256: "2eab74db14a0056f996bc57ab470f8dec66900b9a9d35b982c9e9c6ac7edc80c",
		pem: `-----BEGIN CERTIFICATE-----
MIIC+jCCAqGgAwIBAgIUcX2ojMrk7m8CdV1xMA/1dRijV/UwCgYIKoZIzj0EAwIw
azELMAkGA1UEBhMCVVMxEzARBgNVBAoMCkhJRCBHbG9iYWwxIjAgBgNVBAsMGUF1
dGhlbnRpY2F0b3IgQXR0ZXN0YXRpb24xIzAhBgNVBAMMGkZJRE8gQXR0ZXN0YXRp
b24gUm9vdCBDQSAyMB4XDTI0MTAzMDE4MTY0MloXDTQ5MTAzMDE4MTY0MlowZjEL
MAkGA1UEBhMCVVMxEzARBgNVBAoMCkhJRCBHbG9iYWwxIjAgBgNVBAsMGUF1dGhl
bnRpY2F0b3IgQXR0ZXN0YXRpb24xHjAcBgNVBAMMFUZJRE8gQXR0ZXN0YXRpb24g
Q0EgOTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABPVQFsP7jLJgcLlc1R3jRmlH
vIk5jZQB652DUmD1RGMt7ygeWVZ5cmWEb6B1w/PqpJUUJ7126qgWOT220pXb2Sij
ggEmMIIBIjAOBgNVHQ8BAf8EBAMCAYYwEgYDVR0TAQH/BAgwBgEB/wIBADAfBgNV
HSMEGDAWgBS76Dpl93vB2h5FDLvyMMvUByj3izAdBgNVHQ4EFgQUBtxL1RMjMC3G
8v+9DxLqZ1pMOtkwRAYDVR0fBD0wOzA5oDegNYYzaHR0cDovL2NybC5oeWRyYW50
aWQuY29tL0ZJRE9BdHRlc3RhdGlvblJvb3RDQTIuY3JsMHYGCCsGAQUFBwEBBGow
aDA/BggrBgEFBQcwAoYzaHR0cDovL2NybC5oeWRyYW50aWQuY29tL0ZJRE9BdHRl
c3RhdGlvblJvb3RDQTIucDdjMCUGCCsGAQUFBzABhhlodHRwOi8vb2NzcC5oeWRy
YW50aWQuY29tMAoGCCqGSM49BAMCA0cAMEQCIGseXev6N2lDwgvClSyLGRuYZmqi
m1tkXW5rAM1hSDHqAiAIdbWCBMSlCxK3MDmE5IgLk/PYOdYEbRdtpPBaZUYzoA==
-----END CERTIFICATE-----`
	},
	{
		name: "CN=Yubico FIDO Root CA Serial 450203556",
		source: "FIDO MDS3 blob no. 303",
		sha256: "35f1a54b353bfb711e6d42adbeb76c0e9dead095018e6a94783ba2192fd6faad",
		pem: `-----BEGIN CERTIFICATE-----
MIIDMzCCAhugAwIBAgIUSOEjTf//yqRfPW7Qq8qtIyCrAg8wDQYJKoZIhvcNAQEL
BQAwLzEtMCsGA1UEAwwkWXViaWNvIEZJRE8gUm9vdCBDQSBTZXJpYWwgNDUwMjAz
NTU2MCAXDTI0MDUwMTAwMDAwMFoYDzIwNjAwNDMwMDAwMDAwWjAvMS0wKwYDVQQD
DCRZdWJpY28gRklETyBSb290IENBIFNlcmlhbCA0NTAyMDM1NTYwggEiMA0GCSqG
SIb3DQEBAQUAA4IBDwAwggEKAoIBAQCdvl27w2gu1fPXeEFbIdqx0BalvVDVWrQP
J7HqviuEtZHlxSLxSFtcXpTolvLvof8f4tMerQTkVGzcmYzm1EBT4IJuMmoEqfkE
EhWpsADMFrjZkqlZY9EqxQzLoVEEonE5oGxSdVCxCcLIackpyR/CCXvj1Bt/hTgE
9hTlF4pRqxMkx3plF7y8dDZlRHWs7vbnhmBCGeI0ZPEQ6nl2mCg2r74adF2u6K9r
rLfhBC3QLE8EPrgqUsI+hkuq2tK4M2SMOp8uUVVkqUeu3h0kr3WVI0W02pkgrOgi
FKLFNkSrbYhdjMBDj5izmqfc9xJRKoDX612qd8ZGVHpT5AYFX+1hAgMBAAGjRTBD
MB0GA1UdDgQWBBTZyU5DiQ/a2UEgE7qBK0zhIsRNRjASBgNVHRMBAf8ECDAGAQH/
AgEAMA4GA1UdDwEB/wQEAwIBBjANBgkqhkiG9w0BAQsFAAOCAQEAXvnB4SLuUJfY
MSVGAhssL/SmWli3FSccgxydvKlACcidIIWKQqa3q/QSUEQzC9DgEfMgr7iC1BkT
ZbILboV6UZ5knNsvjEZWuMeogJ8tgZs1hVvKwZizwJ+mEcmsjhIrBYuoL1T6yrOJ
vKFg1jv+Cy4ZwA9Bpk/V3UOir1VyK8dCtyHu6vfosotAdYx8FAuR243gRTMV6Jx8
Jdig2JDIAQMlzVeDpSUHX/K2HXRHxHwfgjbgUjjBu/72r8OfehyhzHXI3K8CFFdf
lO+8nEOJK3y8F1ivgS5uN/8SmcYw/STQYwhrxPuwz3nP8baMum4BB2nnYmpB60sX
3bl5k8QUSw==
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=Feitian Technologies, CN=FEITIAN FIDO EA Root",
		source: "FIDO MDS3 blob no. 303",
		sha256: "3b0e51e8199d3d4a598860967e68315e1f3c3f4d1cc78a0f993d5a0dc2c39dc0",
		pem: `-----BEGIN CERTIFICATE-----
MIICXzCCAcGgAwIBAgIQYz/WquPGwjhx9kZGw8AztTAKBggqhkjOPQQDBDBLMQsw
CQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNobm9sb2dpZXMxHTAbBgNV
BAMMFEZFSVRJQU4gRklETyBFQSBSb290MCAXDTI1MDEwMTAwMDAwMFoYDzIxMjQx
MjMxMjM1OTU5WjBLMQswCQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNo
bm9sb2dpZXMxHTAbBgNVBAMMFEZFSVRJQU4gRklETyBFQSBSb290MIGbMBAGByqG
SM49AgEGBSuBBAAjA4GGAAQAwm/HbN+icnGllPk+jE6WaC4PPgEwTiFtv1HMNVIP
m4LN2I48135T/e08eOym1Cyw7oLuACzj9hpHZ71/+RSGpzIBorebtFOS4h+MxMpE
yKR1SZb1e8gAT1KOmmrodwEhhPRiCga69yonZrK7xLgXOja6t+qGcIGpOZKpaPzG
dTdST1WjQjBAMB0GA1UdDgQWBBTgRW8yfjPdVoWWue+K3Bs+XvaUBDAPBgNVHRMB
Af8EBTADAQH/MA4GA1UdDwEB/wQEAwIBBjAKBggqhkjOPQQDBAOBiwAwgYcCQgEk
uc2+EnwH2pCwhDOXzZJR/W6ClQ4rNxqKzN5/TNMahKOUgmAD1/Webjd1yXjHbgvt
odfNmfmWNnMvQ9d13oSojQJBE0BE8bFTgWbKdU1KkjWHPFvlxKydDgftLR5LrhTe
FVIfqKGSfqz8uggqEydPay8uWM5eGy7G7RQye5ryTJ6WxIA=
-----END CERTIFICATE-----`
	},
	{
		name: "CN=Yubico FIDO Attestation B2 1",
		source: "FIDO MDS3 blob no. 303",
		sha256: "3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
		pem: `-----BEGIN CERTIFICATE-----
MIIDRzCCAjGgAwIBAgIUex9nT9vwZNXS483LdiYGfw2SjSowCwYJKoZIhvcNAQEL
MC4xLDAqBgNVBAMMI1l1YmljbyBBdHRlc3RhdGlvbiBJbnRlcm1lZGlhdGUgQiAx
MCAXDTI1MDgwMTAwMDAwMFoYDzk5OTkxMjMxMjM1OTU5WjAnMSUwIwYDVQQDDBxZ
dWJpY28gRklETyBBdHRlc3RhdGlvbiBCMiAxMIIBIjANBgkqhkiG9w0BAQEFAAOC
AQ8AMIIBCgKCAQEAu1Mevny9dyO9ZUC39SoMhLcR/DXrtF/ciM12tciy2EXAZ6Mk
rivVtCfEVM9X6ISTEnBP6uSYYov6ppv6O6Jh2NHmYm4w+JnS4VnCPU7mHAMfVI2M
GTTMVOew0xUsG7sISIkIDUBmuk8YK9c5zic9+vFQGLIksdXO5iVFIgNG53cGXD4Z
LZoAPiu0PEozxAqYIaI4gxKhOA3S8/W8mIWsu6ofyj4GvkFG6Z7kyF3107P7mwFH
LrI3ENaPWMOFcTaGa0dw+/vVRwjRcEZBVsuuT/87ckSs0a5pkt3vZBlaYeT8pzSr
eV7mowcIM90L2iaATlP0nxmaE6nOyTbojFVl2wIDAQABo2YwZDAdBgNVHQ4EFgQU
SXEh3sa3btDurm4MM/C7S1lRuuYwHwYDVR0jBBgwFoAU6rdCkJ4Me2R621R8A7p8
Tp/YoWEwEgYDVR0TAQH/BAgwBgEB/wIBADAOBgNVHQ8BAf8EBAMCAYYwCwYJKoZI
hvcNAQELA4IBAQB5Gc3haftp7hKsEZso+i/Z5nRuqdmzG2WClUoRUqbaPyglnJDj
KR/kfgOl6ibbF/zthm3KmXQ7HcDIP2xMdG7U2L2imbJQHqPf/h2Hqojb4rZgue+6
W4ktSR5elR9L1rYqE/SGYM4iEKoVQSv7RT1rxIeWiKsw/Vxxi/QOnsx3F7x80CCY
gB4E3yQx8VTW440hTEwTA1eMHOix32tPtyyHIa8PVVIfVpHQJBaMVvv508UEjwkb
U2rnjfzoSTNS9A5jUQ8mBSve95rjB0do98EU+DxdBqX2+H6i5wlICFgzhdzcsne9
hGKT6lzTX4cIdJsrY2+xleK0FFQy6lGEVLEe
-----END CERTIFICATE-----`
	},
	{
		name: "CN=Yubico Attestation Intermediate A 1",
		source: "FIDO MDS3 blob no. 303",
		sha256: "4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
		pem: `-----BEGIN CERTIFICATE-----
MIIDSDCCAjCgAwIBAgIUUcmMXzRIFOgGTK0Tb3gEuZYZkBIwDQYJKoZIhvcNAQEL
BQAwJDEiMCAGA1UEAwwZWXViaWNvIEF0dGVzdGF0aW9uIFJvb3QgMTAgFw0yNDEy
MDEwMDAwMDBaGA85OTk5MTIzMTIzNTk1OVowLjEsMCoGA1UEAwwjWXViaWNvIEF0
dGVzdGF0aW9uIEludGVybWVkaWF0ZSBBIDEwggEiMA0GCSqGSIb3DQEBAQUAA4IB
DwAwggEKAoIBAQDm555bWY9WW+tOY0rIWHldh+aNanoCZCFh7Gk3YZrQmPUw0hkS
G6qYHQtP+fZyS33VErvg+BQqnmumgNhfxFrkwEZELeidBcC8C4Ag4nqqiPWpzsvI
17NcxYlInLNLFcZY/+gOiN6ZOTihO5/vBZMbj9riaAcqliYmNGJPgTcMGaEAyMzE
MNy2nm6Ep+pjP5aF6gi21t/UQFsuJ1j2Rj/ynM/SdRt+ecal5OYotxHkFbL9vvv2
A2Ov5ITZClw4bOS9npypQimOZ5QAYytmYaQpWl/pMYz6zSj8RqkVDNEJGqNfTKA2
ivLYwX6lSttMPapg0J84l9X0voVN/FpS4VCVAgMBAAGjZjBkMB0GA1UdDgQWBBQg
KFAhG6RaW+hTy52dxeT8bC96HzAfBgNVHSMEGDAWgBTS7u9aIo06bVwjlz3yhdUm
8SV7kjASBgNVHRMBAf8ECDAGAQH/AgECMA4GA1UdDwEB/wQEAwIBhjANBgkqhkiG
9w0BAQsFAAOCAQEAYMzgLrJLIr0OovQnAZrRIGuabiHSUKSmbLRWpRkWeAtsChDE
HpXcJ/bgDNKYWoHqQ8xRUjB4CyepYevc3YlrG8o7zHxpfVcaoL5SeuJkzHxKn4bT
aSp9+Mvwamnp64kZMiNbFLknfP9kYKoRHkMWheRJ1UsP1z4ScmkCeILfsMs6vqov
qjWClFsJpBcsluYHWF7bBJ1n4Rwg+ATEopY4IgGv6Zvwc+A9r+AT2hqpoSkYoAl+
ANYwgslOf9sJe0V+TA9YY/UlaBmPPTd0//r9wvcePWZkPjKoAC/zUNhfDbh4LV8G
Hs3lyX2XomL/LNc8JYzyIaDEhGQveoPhh/tr1g==
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=HID Global, OU=Authenticator Attestation, CN=FIDO Attestation CA 5",
		source: "FIDO MDS3 blob no. 303",
		sha256: "47a1b53523de068bb9af9cb723a7ca08a397c3e4b07f924f7b299639aea39519",
		pem: `-----BEGIN CERTIFICATE-----
MIIC+zCCAqGgAwIBAgIUILwG56eXLK+mKWp46HoXOY+b6M0wCgYIKoZIzj0EAwIw
azELMAkGA1UEBhMCVVMxEzARBgNVBAoMCkhJRCBHbG9iYWwxIjAgBgNVBAsMGUF1
dGhlbnRpY2F0b3IgQXR0ZXN0YXRpb24xIzAhBgNVBAMMGkZJRE8gQXR0ZXN0YXRp
b24gUm9vdCBDQSAyMB4XDTIyMTEwNDIxMTAyN1oXDTQ3MTEwNDIxMTAyN1owZjEL
MAkGA1UEBhMCVVMxEzARBgNVBAoMCkhJRCBHbG9iYWwxIjAgBgNVBAsMGUF1dGhl
bnRpY2F0b3IgQXR0ZXN0YXRpb24xHjAcBgNVBAMMFUZJRE8gQXR0ZXN0YXRpb24g
Q0EgNTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABCHnKPsjKNdAs0SCNgsWlS4D
cobk7A7lkzQDkMkaLnLe6ibW8r+7k3rn8IUSo+5xMMLtIEJ/svJMgBZWxUoDxsWj
ggEmMIIBIjAOBgNVHQ8BAf8EBAMCAYYwEgYDVR0TAQH/BAgwBgEB/wIBADAfBgNV
HSMEGDAWgBS76Dpl93vB2h5FDLvyMMvUByj3izAdBgNVHQ4EFgQUDDODDZdTiPWr
WnjDiMwsZgyoezwwRAYDVR0fBD0wOzA5oDegNYYzaHR0cDovL2NybC5oeWRyYW50
aWQuY29tL0ZJRE9BdHRlc3RhdGlvblJvb3RDQTIuY3JsMHYGCCsGAQUFBwEBBGow
aDA/BggrBgEFBQcwAoYzaHR0cDovL2NybC5oeWRyYW50aWQuY29tL0ZJRE9BdHRl
c3RhdGlvblJvb3RDQTIucDdjMCUGCCsGAQUFBzABhhlodHRwOi8vb2NzcC5oeWRy
YW50aWQuY29tMAoGCCqGSM49BAMCA0gAMEUCIB24Le2zt7Z/W/P9zE9NfqzgPZjB
IpKk1quqgbZY66/FAiEAtsRY5bxaN9MDKGaefaTS6zgMVbxUlEpDn49C6VSWgmE=
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=Feitian Technologies, CN=Feitian FIDO Root CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "492bfc9bb0c655f695a9447b445ec4703cd92d63fd910b5043ba3b0a3964506d",
		pem: `-----BEGIN CERTIFICATE-----
MIIB2DCCAX6gAwIBAgIQGBUrQbdDrm20FZnDsX2CBTAKBggqhkjOPQQDAjBLMQsw
CQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNobm9sb2dpZXMxHTAbBgNV
BAMMFEZlaXRpYW4gRklETyBSb290IENBMCAXDTE4MDQwMTAwMDAwMFoYDzIwNDgw
MzMxMjM1OTU5WjBLMQswCQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNo
bm9sb2dpZXMxHTAbBgNVBAMMFEZlaXRpYW4gRklETyBSb290IENBMFkwEwYHKoZI
zj0CAQYIKoZIzj0DAQcDQgAEsFYEEhiJuqqnMgQjSiivBjV7DGCTf4XBBH/B7uvZ
sKxXShF0L8uDISWUvcExixRs6gB3oldSrjox6L8T94NOzqNCMEAwHQYDVR0OBBYE
FEu9hyYRrRyJzwRYvnDSCIxrFiO3MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/
BAQDAgEGMAoGCCqGSM49BAMCA0gAMEUCIDHSb2mbNDAUNXvpPU0oWKeNye0fQ2l9
D01AR2+sLZdhAiEAo3wz684IFMVsCCRmuJqxH6FQRESNqezuo1E+KkGxWuM=
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=HID Global, OU=Authenticator Attestation, CN=FIDO Attestation CA 7",
		source: "FIDO MDS3 blob no. 303",
		sha256: "4a576571111816aa6c300af1dc0c78c0101449d2fbf74082904f38f9b268b385",
		pem: `-----BEGIN CERTIFICATE-----
MIIC+zCCAqGgAwIBAgIUH3hdmkpe0jJT+qaJXxb4RQ8SnDowCgYIKoZIzj0EAwIw
azELMAkGA1UEBhMCVVMxEzARBgNVBAoMCkhJRCBHbG9iYWwxIjAgBgNVBAsMGUF1
dGhlbnRpY2F0b3IgQXR0ZXN0YXRpb24xIzAhBgNVBAMMGkZJRE8gQXR0ZXN0YXRp
b24gUm9vdCBDQSAyMB4XDTI0MDUwMjE5MTQ1MVoXDTQ5MDUwMjE5MTQ1MVowZjEL
MAkGA1UEBhMCVVMxEzARBgNVBAoMCkhJRCBHbG9iYWwxIjAgBgNVBAsMGUF1dGhl
bnRpY2F0b3IgQXR0ZXN0YXRpb24xHjAcBgNVBAMMFUZJRE8gQXR0ZXN0YXRpb24g
Q0EgNzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABFWABKJhPocYTubfezosakhI
Zy3fkkjercxgwf1608apC9b2+oc7lETX07fdOip6iES/ymdux0nGnL1GkNNP9bSj
ggEmMIIBIjAOBgNVHQ8BAf8EBAMCAYYwEgYDVR0TAQH/BAgwBgEB/wIBADAfBgNV
HSMEGDAWgBS76Dpl93vB2h5FDLvyMMvUByj3izAdBgNVHQ4EFgQUx6KUkl96yrfY
l4B0oEikNcwOqbswRAYDVR0fBD0wOzA5oDegNYYzaHR0cDovL2NybC5oeWRyYW50
aWQuY29tL0ZJRE9BdHRlc3RhdGlvblJvb3RDQTIuY3JsMHYGCCsGAQUFBwEBBGow
aDA/BggrBgEFBQcwAoYzaHR0cDovL2NybC5oeWRyYW50aWQuY29tL0ZJRE9BdHRl
c3RhdGlvblJvb3RDQTIucDdjMCUGCCsGAQUFBzABhhlodHRwOi8vb2NzcC5oeWRy
YW50aWQuY29tMAoGCCqGSM49BAMCA0gAMEUCIE4AgWM85sibY4aPGFPB+7I9LIa1
0t5N/fTSaOPZo/zqAiEArESuic0ol2nNKF7T+DLDyU8Cm9VRRsUpPF9VGhGaR3k=
-----END CERTIFICATE-----`
	},
	{
		name: "CN=Yubico FIDO Attestation B 1",
		source: "FIDO MDS3 blob no. 303",
		sha256: "4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
		pem: `-----BEGIN CERTIFICATE-----
MIIDSjCCAjKgAwIBAgIUR38mq26Sf2szVV2BdG6WEN7kuWUwDQYJKoZIhvcNAQEL
BQAwLjEsMCoGA1UEAwwjWXViaWNvIEF0dGVzdGF0aW9uIEludGVybWVkaWF0ZSBC
IDEwIBcNMjQxMjAxMDAwMDAwWhgPOTk5OTEyMzEyMzU5NTlaMCYxJDAiBgNVBAMM
G1l1YmljbyBGSURPIEF0dGVzdGF0aW9uIEIgMTCCASIwDQYJKoZIhvcNAQEBBQAD
ggEPADCCAQoCggEBANY0Wb9oPoRoKoQyWPaJpz11vrWTg6zTtmNj2VoKRnyvKGRq
pzb83w5l6YA96UYkYBDQP0ilO2DPe6wWqVR5zDfRzdcH8bh+L7dGGvae6hRTZhkF
kCpXDs4HccknrDf8FClJ7He39Jf42/G1Qm2zz9WWmrPXtgiK/x05GjsQfGuDG1zf
5QTUUie8lwymK3TfdOvNeeJAAPe2pn7ItfRb+rVrNWiDzlRn2vNnZ2wPo4wH/WJ6
dhXZG+rMWT+a6Bocg1UfIw6kdunG4bTpZzsvacFYyR0mpf+DeOnpSWAmywJWHvTl
f2YXxFyeXcTACdQlcMNGJ2VhZQ48xtP5/RBP/8kCAwEAAaNmMGQwHQYDVR0OBBYE
FChy42okiqcTS1iqa/HRWjkBn4H/MB8GA1UdIwQYMBaAFOq3QpCeDHtkettUfAO6
fE6f2KFhMBIGA1UdEwEB/wQIMAYBAf8CAQAwDgYDVR0PAQH/BAQDAgGGMA0GCSqG
SIb3DQEBCwUAA4IBAQAn+RHIPbtMEDNdT1g8H/RitAkUdLgAt1tWGWnlj9knbv4/
4GlX7C9p45efPO9/aZL6OV1XRKBi6KmtBW5K7nuYEnMx/5BqBSbLT7rhduC49TBe
Mb9PHdXsTlSVNYefr1dGidr4j0xVBQLb1rknDAbdWDzKfvnayKO8Frwe7Hx843MG
/rJ+c0XruUvbfVTCHLiIWhM7oNDhL8xob6xUo9KLKcSL+ItYsO3/9Wb8Q9GjsqL4
FXsDcG1SaYh7KpfuMmOixqzJZO2nIicPYRg1I2SuiUfYO70tmdHcbl+kSQmSYt7r
q4viILg2Gx3j9rITuWTjbaUaSSQxgOmMSHuyzMAC
-----END CERTIFICATE-----`
	},
	{
		name: "CN=Yubico FIDO Attestation A 1",
		source: "FIDO MDS3 blob no. 303",
		sha256: "4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
		pem: `-----BEGIN CERTIFICATE-----
MIIDSjCCAjKgAwIBAgIUTnbbGIR2NHvzqIKFAeQwG1XBis0wDQYJKoZIhvcNAQEL
BQAwLjEsMCoGA1UEAwwjWXViaWNvIEF0dGVzdGF0aW9uIEludGVybWVkaWF0ZSBB
IDEwIBcNMjQxMjAxMDAwMDAwWhgPOTk5OTEyMzEyMzU5NTlaMCYxJDAiBgNVBAMM
G1l1YmljbyBGSURPIEF0dGVzdGF0aW9uIEEgMTCCASIwDQYJKoZIhvcNAQEBBQAD
ggEPADCCAQoCggEBAOsXj3k04Ban4TYdtZKqD/OPJxyDyaPmCBUFUiaZIgTteZnj
3X25DhgpZZXsC4D0ydIcrlA6wNUInORL/L9zBbTEIMAVMGo6g7UKAmb2MF6AHbnh
YJd9eikupVNWShHNYNc4GBdO1YN6AfUqvJhHbe3V4SNMPmBREKJPVz7ThwgmggTe
8Ws2K0/wsqv2wSE7pbCBsUZhIX51bZM3pqDwJPTmRFEvt0/6tG5eO8F3j14OXqfE
hmjn1VvxKDYQOLZAxCwwgC0P4CdfWv3y8PSR8I354hO1Y+GzNjvIqX38NKLywuIY
HFerOxNlxEMBvFhYBuRuYAkkgUaPqN6UBhsILrsCAwEAAaNmMGQwHQYDVR0OBBYE
FCCoRHhiyNnbnXRWIL6ZBXoBX9YTMB8GA1UdIwQYMBaAFCAoUCEbpFpb6FPLnZ3F
5PxsL3ofMBIGA1UdEwEB/wQIMAYBAf8CAQAwDgYDVR0PAQH/BAQDAgGGMA0GCSqG
SIb3DQEBCwUAA4IBAQCQFafJI1/5Wg9CEEimE1RP54RgQwTNTOOQsLACTe+rItlF
QzC9ZDhrV828yX7jzy+AAsp3izK7T1th2dl7m+tu0sw2Pa/olc02nt6PyIw348ga
HzhI1+0KE45qxvFDeL2lMxbPfCYvyEEaYzjiQELU5951pXGWyKMa/4fLtO+ZKOXh
MuVeq4rXDPI54W6JHOiAaiKdiw+5e3c2kt/jFIQtM6vMXg9LNFzdjETNt20VX9Qe
vRpFZfucMG9wCaQDoFlPzpTMJKhPev/imJmZYhKfr0lLcemtqjIxLAoqZdOYfHBg
6+vAcdPI/iauGpUAv7X+UKNmDwjZ2BaH4sLwhB2m
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=OneSpan, OU=Authenticator Attestation, CN=OneSpan DIGIPASS FX2-A CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "55ead7d79cdd2f8ee4a5e96eadb55605bb936e8b9ee90458fda80529b6aa46c3",
		pem: `-----BEGIN CERTIFICATE-----
MIICETCCAbigAwIBAgIEATUBFTAKBggqhkjOPQQDAjBnMQswCQYDVQQGEwJVUzEQ
MA4GA1UEChMHT25lU3BhbjEiMCAGA1UECxMZQXV0aGVudGljYXRvciBBdHRlc3Rh
dGlvbjEiMCAGA1UEAxMZT25lU3BhbiBESUdJUEFTUyBGWDItQSBDQTAgFw0yNTA5
MDExMjQzNDFaGA8yMDU1MDkwMjEyNDM0MVowZzELMAkGA1UEBhMCVVMxEDAOBgNV
BAoTB09uZVNwYW4xIjAgBgNVBAsTGUF1dGhlbnRpY2F0b3IgQXR0ZXN0YXRpb24x
IjAgBgNVBAMTGU9uZVNwYW4gRElHSVBBU1MgRlgyLUEgQ0EwWTATBgcqhkjOPQIB
BggqhkjOPQMBBwNCAATrmyvKCEkw5DdLBYeiNKl5RbcN2dXZyCUdFH8MjznHXZ1+
v5smgIyrmS9m906BJRqu0bDWg9I70oJQW5Jxfkg3o1AwTjAdBgNVHQ4EFgQUxXzu
J1tSpBbkKlCm5nVe8m/cSocwHwYDVR0jBBgwFoAUxXzuJ1tSpBbkKlCm5nVe8m/c
SocwDAYDVR0TBAUwAwEB/zAKBggqhkjOPQQDAgNHADBEAiA+cOEzdlwxs/PLrTji
7+uMr27cuCLCVYFqMntLCd0WYQIgWf/LvODWlO4D9P+W1eC+5BXmH631tGed4CB5
3nI99BY=
-----END CERTIFICATE-----`
	},
	{
		name: "CN=Yubico Attestation Root 1",
		source: "FIDO MDS3 blob no. 303",
		sha256: "62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
		pem: `-----BEGIN CERTIFICATE-----
MIIDPjCCAiagAwIBAgIUXzeiEDJEOTt14F5n0o6Zf/bBwiUwDQYJKoZIhvcNAQEN
BQAwJDEiMCAGA1UEAwwZWXViaWNvIEF0dGVzdGF0aW9uIFJvb3QgMTAgFw0yNDEy
MDEwMDAwMDBaGA85OTk5MTIzMTIzNTk1OVowJDEiMCAGA1UEAwwZWXViaWNvIEF0
dGVzdGF0aW9uIFJvb3QgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEB
AMZ6/TxM8rIT+EaoPvG81ontMOo/2mQ2RBwJHS0QZcxVaNXvl12LUhBZ5LmiBScI
Zd1Rnx1od585h+/dhK7hEm7JAALkKKts1fO53KGNLZujz5h3wGncr4hyKF0G74b/
U3K9hE5mGND6zqYchCRAHfrYMYRDF4YL0X4D5nGdxvppAy6nkEmtWmMnwO3i0TAu
csrbE485HvGM4r0VpgVdJpvgQjiTJCTIq+D35hwtT8QDIv+nGvpcyi5wcIfCkzyC
imJukhYy6KoqNMKQEdpNiSOvWyDMTMt1bwCvEzpw91u+msUt4rj0efnO9s0ZOwdw
MRDnH4xgUl5ZLwrrPkfC1/0CAwEAAaNmMGQwHQYDVR0OBBYEFNLu71oijTptXCOX
PfKF1SbxJXuSMB8GA1UdIwQYMBaAFNLu71oijTptXCOXPfKF1SbxJXuSMBIGA1Ud
EwEB/wQIMAYBAf8CAQMwDgYDVR0PAQH/BAQDAgGGMA0GCSqGSIb3DQEBDQUAA4IB
AQC3IW/sgB9pZ8apJNjxuGoX+FkILks0wMNrdXL/coUvsrhzsvl6mePMrbGJByJ1
XnquB5sgcRENFxdQFma3mio8Upf1owM1ZreXrJ0mADG2BplqbJnxiyYa+R11reIF
TWeIhMNcZKsDZrFAyPuFjCWSQvJmNWe9mFRYFgNhXJKkXIb5H1XgEDlwiedYRM7V
olBNlld6pRFKlX8ust6OTMOeADl2xNF0m1LThSdeuXvDyC1g9+ILfz3S6OIYgc3i
roRcFD354g7rKfu67qFAw9gC4yi0xBTPrY95rh4/HqaUYCA/L8ldRk6H7Xk35D+W
Vpmq2Sh/xT5HiFuhf4wJb0bK
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=HID Global, OU=Authenticator Attestation, CN=FIDO Attestation CA 2",
		source: "FIDO MDS3 blob no. 303",
		sha256: "6834aecc369824e56c3804edb514fea92b72973d3804999d90362371b9175afe",
		pem: `-----BEGIN CERTIFICATE-----
MIIDCDCCAq+gAwIBAgIQQAFqUNTHZ8kBN8u/bCk+xDAKBggqhkjOPQQDAjBrMQsw
CQYDVQQGEwJVUzETMBEGA1UEChMKSElEIEdsb2JhbDEiMCAGA1UECxMZQXV0aGVu
dGljYXRvciBBdHRlc3RhdGlvbjEjMCEGA1UEAxMaRklETyBBdHRlc3RhdGlvbiBS
b290IENBIDEwHhcNMTkwNDI0MTkzMTIzWhcNNDQwNDI3MTkzMTIzWjBmMQswCQYD
VQQGEwJVUzETMBEGA1UEChMKSElEIEdsb2JhbDEiMCAGA1UECxMZQXV0aGVudGlj
YXRvciBBdHRlc3RhdGlvbjEeMBwGA1UEAxMVRklETyBBdHRlc3RhdGlvbiBDQSAy
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE4nK9ctzk6GEGFNQBcrnBBmWU+dCn
uHQAARrB2Eyc8MbsljkSFhZtfz/Rw6SuVIDk5VakDzrKBAOJ9v0Rvg/406OCATgw
ggE0MBIGA1UdEwEB/wQIMAYBAf8CAQAwDgYDVR0PAQH/BAQDAgGGMIGEBggrBgEF
BQcBAQR4MHYwLgYIKwYBBQUHMAGGImh0dHA6Ly9oaWQuZmlkby5vY3NwLmlkZW50
cnVzdC5jb20wRAYIKwYBBQUHMAKGOGh0dHA6Ly92YWxpZGF0aW9uLmlkZW50cnVz
dC5jb20vcm9vdHMvSElERklET1Jvb3RjYTEucDdjMB8GA1UdIwQYMBaAFB2m3iwW
SYHvWTHbJiHAyKDp+CSjMEcGA1UdHwRAMD4wPKA6oDiGNmh0dHA6Ly92YWxpZGF0
aW9uLmlkZW50cnVzdC5jb20vY3JsL0hJREZJRE9Sb290Y2ExLmNybDAdBgNVHQ4E
FgQUDLCbuLslcclrOZIz57Fu0imSMQ8wCgYIKoZIzj0EAwIDRwAwRAIgDCW5Irbj
EI/y35lPjx9a+/sF4lPSoZdBHgFgTWC+8VICIEqs2SPzUHgHVh65Ajl1oIUmhh0C
2lyR/Zdk7O3u1TIK
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=OneSpan, OU=Authenticator Attestation, CN=OneSpan DIGIPASS FX7 L2 CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "6ca500e490143a514096634c45289f82b833749aa0d3edabc83116f79375a2b5",
		pem: `-----BEGIN CERTIFICATE-----
MIICFDCCAbqgAwIBAgIEeKWlyTAKBggqhkjOPQQDAjBoMQswCQYDVQQGEwJVUzEQ
MA4GA1UEChMHT25lU3BhbjEiMCAGA1UECxMZQXV0aGVudGljYXRvciBBdHRlc3Rh
dGlvbjEjMCEGA1UEAxMaT25lU3BhbiBESUdJUEFTUyBGWDcgTDIgQ0EwIBcNMjQx
MjE4MTUzMzA5WhgPMjA1NDEyMTkxNTMzMDlaMGgxCzAJBgNVBAYTAlVTMRAwDgYD
VQQKEwdPbmVTcGFuMSIwIAYDVQQLExlBdXRoZW50aWNhdG9yIEF0dGVzdGF0aW9u
MSMwIQYDVQQDExpPbmVTcGFuIERJR0lQQVNTIEZYNyBMMiBDQTBZMBMGByqGSM49
AgEGCCqGSM49AwEHA0IABA4JPSyfcozRTRk8qrbtaOk9+C5cR1LrmLGpCfii20QV
vIpcukpCIXOnxjAIeapwXzGFSQ2hJszxDB2eWFjcRiSjUDBOMB0GA1UdDgQWBBQC
56Hc4b3eU5TFJmodtGFTL6jJWzAfBgNVHSMEGDAWgBQC56Hc4b3eU5TFJmodtGFT
L6jJWzAMBgNVHRMEBTADAQH/MAoGCCqGSM49BAMCA0gAMEUCIQC8WM9XLODQRD8Q
f54V+Cg2nWkxn0O5SaxFiB4o7yLjKQIgWvWB+peWTRrQeM6x1jN0+aTv1NG+8qXn
l9WUey3BOT0=
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=OneSpan, OU=Authenticator Attestation, CN=OneSpan DIGIPASS FX1 CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "7195352a9b50281dcd045434f04186a0b87fa80b0fd36d8cf0983891b8b042df",
		pem: `-----BEGIN CERTIFICATE-----
MIICDjCCAbSgAwIBAgIEeIcbCTAKBggqhkjOPQQDAjBlMQswCQYDVQQGEwJVUzEQ
MA4GA1UEChMHT25lU3BhbjEiMCAGA1UECxMZQXV0aGVudGljYXRvciBBdHRlc3Rh
dGlvbjEgMB4GA1UEAxMXT25lU3BhbiBESUdJUEFTUyBGWDEgQ0EwIBcNMjMwODA0
MTIzNTI2WhgPMjA1MzA4MDQxMjM1MjZaMGUxCzAJBgNVBAYTAlVTMRAwDgYDVQQK
EwdPbmVTcGFuMSIwIAYDVQQLExlBdXRoZW50aWNhdG9yIEF0dGVzdGF0aW9uMSAw
HgYDVQQDExdPbmVTcGFuIERJR0lQQVNTIEZYMSBDQTBZMBMGByqGSM49AgEGCCqG
SM49AwEHA0IABGDgvW7cmNuTjz7ukEB4cLCPNw+2e5NSxshnSKLuilrMdMK6JAZV
mInsB5ol7fOa6a1sw57gh13Ntu0dhWromDmjUDBOMB0GA1UdDgQWBBTnm8N8/JvC
eNQcV7Eu2UO1XU4TEjAfBgNVHSMEGDAWgBTnm8N8/JvCeNQcV7Eu2UO1XU4TEjAM
BgNVHRMEBTADAQH/MAoGCCqGSM49BAMCA0gAMEUCIQDDIFZnlTHkoBUA4BuLN/AB
77B3290KkMazewuZCw7sTwIgNt9qWgq1NH6r7hPGPkpHrC2dU3m67Eu/Z9JL1QXb
eo0=
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=HID Global, OU=Authenticator Attestation, CN=FIDO Attestation CA 4",
		source: "FIDO MDS3 blob no. 303",
		sha256: "78a2d5bd208ce1b18d61c94fc4c5905f5c7e022b200c1e60978698d6949f6f45",
		pem: `-----BEGIN CERTIFICATE-----
MIIC+zCCAqGgAwIBAgIUdHkZqoj6239E/8FQb+IJSuHCaFUwCgYIKoZIzj0EAwIw
azELMAkGA1UEBhMCVVMxEzARBgNVBAoMCkhJRCBHbG9iYWwxIjAgBgNVBAsMGUF1
dGhlbnRpY2F0b3IgQXR0ZXN0YXRpb24xIzAhBgNVBAMMGkZJRE8gQXR0ZXN0YXRp
b24gUm9vdCBDQSAyMB4XDTIyMTEwNDIxMDkzNFoXDTQ3MTEwNDIxMDkzNFowZjEL
MAkGA1UEBhMCVVMxEzARBgNVBAoMCkhJRCBHbG9iYWwxIjAgBgNVBAsMGUF1dGhl
bnRpY2F0b3IgQXR0ZXN0YXRpb24xHjAcBgNVBAMMFUZJRE8gQXR0ZXN0YXRpb24g
Q0EgNDBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABJlU/tx+AQkDersw3pJ2TCrs
rioVWg/p3I185883RPRo3yudd98jVnNtp7DiGF7sJzAjZ2i2Xb3vPUYH+u90fLmj
ggEmMIIBIjAOBgNVHQ8BAf8EBAMCAYYwEgYDVR0TAQH/BAgwBgEB/wIBADAfBgNV
HSMEGDAWgBS76Dpl93vB2h5FDLvyMMvUByj3izAdBgNVHQ4EFgQUDL+zpfrLud3q
pjVT+o9c5C0DX5UwRAYDVR0fBD0wOzA5oDegNYYzaHR0cDovL2NybC5oeWRyYW50
aWQuY29tL0ZJRE9BdHRlc3RhdGlvblJvb3RDQTIuY3JsMHYGCCsGAQUFBwEBBGow
aDA/BggrBgEFBQcwAoYzaHR0cDovL2NybC5oeWRyYW50aWQuY29tL0ZJRE9BdHRl
c3RhdGlvblJvb3RDQTIucDdjMCUGCCsGAQUFBzABhhlodHRwOi8vb2NzcC5oeWRy
YW50aWQuY29tMAoGCCqGSM49BAMCA0gAMEUCIBuW9ZrNrhNIxQsdyEgNCxnJlyrY
GBu61K2xA+zAopyOAiEApwS3XRePQAVVGnTDaE2l9fzOHv0P2DPTA85392VDbjs=
-----END CERTIFICATE-----`
	},
	{
		name: "C=BE, ST=Brabant, L=Strombeek-Bever, O=VASCO Data Security, OU=Authenticator Attestation, CN=VASCO DP785FIDO ROOT, emailAddress=jov@vasco.com",
		source: "FIDO MDS3 blob no. 303",
		sha256: "7bdf7e4993d36060e4c0dd8f128c7c356cbb583def7db00f01e6726c9e7f15f9",
		pem: `-----BEGIN CERTIFICATE-----
MIICuTCCAl+gAwIBAgIJAKq5cjZYxI4AMAoGCCqGSM49BAMCMIG4MQswCQYDVQQG
EwJCRTEQMA4GA1UECAwHQnJhYmFudDEYMBYGA1UEBwwPU3Ryb21iZWVrLUJldmVy
MRwwGgYDVQQKDBNWQVNDTyBEYXRhIFNlY3VyaXR5MSIwIAYDVQQLDBlBdXRoZW50
aWNhdG9yIEF0dGVzdGF0aW9uMR0wGwYDVQQDDBRWQVNDTyBEUDc4NUZJRE8gUk9P
VDEcMBoGCSqGSIb3DQEJARYNam92QHZhc2NvLmNvbTAeFw0xODA0MTExMjQ1MDRa
Fw0yODA0MDgxMjQ1MDRaMIG4MQswCQYDVQQGEwJCRTEQMA4GA1UECAwHQnJhYmFu
dDEYMBYGA1UEBwwPU3Ryb21iZWVrLUJldmVyMRwwGgYDVQQKDBNWQVNDTyBEYXRh
IFNlY3VyaXR5MSIwIAYDVQQLDBlBdXRoZW50aWNhdG9yIEF0dGVzdGF0aW9uMR0w
GwYDVQQDDBRWQVNDTyBEUDc4NUZJRE8gUk9PVDEcMBoGCSqGSIb3DQEJARYNam92
QHZhc2NvLmNvbTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABLDcYiuC92LRiyqa
GA1MRIH73mgOpbgwvoxsr+nPBj+438uIBOMn9p4iT3jKfcBaDPs44+gg2tfYlqFo
d7rNFsGjUDBOMB0GA1UdDgQWBBSejT9/k8LNFh+V4s5g4SbE0O38UTAfBgNVHSME
GDAWgBSejT9/k8LNFh+V4s5g4SbE0O38UTAMBgNVHRMEBTADAQH/MAoGCCqGSM49
BAMCA0gAMEUCIQDUMVXd4XSA1br+6n1w2Qk9TcX5ouZDVcaHsFDDmx1ztQIgMtG3
oABh6bGVzaLN80HtkycWAGUVSt7kDdQYIjNzTCQ=
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=OneSpan, OU=Authenticator Attestation, CN=OneSpan DIGIPASS FX7-B CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "81c07bd46de18417bd4fca7b3bdc0932553c63926efcbfd78bf6e221e8fd5425",
		pem: `-----BEGIN CERTIFICATE-----
MIICEjCCAbigAwIBAgIEATUBFTAKBggqhkjOPQQDAjBnMQswCQYDVQQGEwJVUzEQ
MA4GA1UEChMHT25lU3BhbjEiMCAGA1UECxMZQXV0aGVudGljYXRvciBBdHRlc3Rh
dGlvbjEiMCAGA1UEAxMZT25lU3BhbiBESUdJUEFTUyBGWDctQiBDQTAgFw0yNTA5
MDExMjUzNTdaGA8yMDU1MDkwMjEyNTM1N1owZzELMAkGA1UEBhMCVVMxEDAOBgNV
BAoTB09uZVNwYW4xIjAgBgNVBAsTGUF1dGhlbnRpY2F0b3IgQXR0ZXN0YXRpb24x
IjAgBgNVBAMTGU9uZVNwYW4gRElHSVBBU1MgRlg3LUIgQ0EwWTATBgcqhkjOPQIB
BggqhkjOPQMBBwNCAARgnymwcaLlZJVt6gVLRsW4SOpkInD7wQxwWRL2LP2Vct6F
ZR5Xlg4mmH694niw4pRNAbDJUScMJwuOKIs0/q7Wo1AwTjAdBgNVHQ4EFgQU555x
5RnQy3ccBp6Q94UntBCuwPEwHwYDVR0jBBgwFoAU555x5RnQy3ccBp6Q94UntBCu
wPEwDAYDVR0TBAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiEAg01p++itfM1TfNHs
yKVJETcA7LuWiS+j39f2ukFo+8gCIHTu3l6cBiBqSd/o+6730Rpya+YzOuN2fv4V
mZDYf95r
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=Google, OU=Authenticator Attestation, CN=Titan Security Key Signing",
		source: "FIDO MDS3 blob no. 303",
		sha256: "918a618c220cfdaeda51ea4eae0eb5dea106deef721882a82e5df5a9b04728e7",
		pem: `-----BEGIN CERTIFICATE-----
MIICIjCCAcigAwIBAgIBAjAKBggqhkjOPQQDAjBkMQswCQYDVQQGEwJVUzEPMA0G
A1UECgwGR29vZ2xlMSIwIAYDVQQLDBlBdXRoZW50aWNhdG9yIEF0dGVzdGF0aW9u
MSAwHgYDVQQDDBdUaXRhbiBTZWN1cml0eSBLZXkgUm9vdDAgFw0yMTEyMDExNTI2
MzFaGA8yMTIxMTIwMjE1MjYzMVowZzELMAkGA1UEBhMCVVMxDzANBgNVBAoMBkdv
b2dsZTEiMCAGA1UECwwZQXV0aGVudGljYXRvciBBdHRlc3RhdGlvbjEjMCEGA1UE
AwwaVGl0YW4gU2VjdXJpdHkgS2V5IFNpZ25pbmcwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAARGSX/0WmoStYfhmlzSPB4SARhmTBpPi0o3yYygS4smn/4OFdGNJdsP
xkub62pOlWe0I6cJSh9W3EAHA2ZPO+S+o2YwZDAOBgNVHQ8BAf8EBAMCAQYwEgYD
VR0TAQH/BAgwBgEB/wIBADAdBgNVHQ4EFgQURTqQYOsPJ897X40vav+XoW+S6sgw
HwYDVR0jBBgwFoAU2d6JrFCoEZAe/LUpIMybltDsMh0wCgYIKoZIzj0EAwIDSAAw
RQIgSr3N14HdtCfj7QZ0R7kWg6I317QENb8q+fbNko6nK4oCIQD5Jh14grDc6F7g
Hib9QTv8sUs6w8gF1JYKMK+LDOYPYg==
-----END CERTIFICATE-----`
	},
	{
		name: "C=CN, O=Feitian Technologies, CN=Feitian FIDO Root CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "925f79f4350ac09645dc71adc611badc248e837625246f11558edb3d5ee615f6",
		pem: `-----BEGIN CERTIFICATE-----
MIIB2DCCAX6gAwIBAgIQFZ97ws2JGPEoa5NI+p8z1jAKBggqhkjOPQQDAjBLMQsw
CQYDVQQGEwJDTjEdMBsGA1UECgwURmVpdGlhbiBUZWNobm9sb2dpZXMxHTAbBgNV
BAMMFEZlaXRpYW4gRklETyBSb290IENBMCAXDTE4MDQwMTAwMDAwMFoYDzIwNDgw
MzMxMjM1OTU5WjBLMQswCQYDVQQGEwJDTjEdMBsGA1UECgwURmVpdGlhbiBUZWNo
bm9sb2dpZXMxHTAbBgNVBAMMFEZlaXRpYW4gRklETyBSb290IENBMFkwEwYHKoZI
zj0CAQYIKoZIzj0DAQcDQgAEnfAKbjvMX1Ey1b6k+WQQdNVMt9JgGWyJ3PvM4BSK
5XqTfo++0oAj/4tnwyIL0HFBR9St+ktjqSXDfjiXAurs86NCMEAwHQYDVR0OBBYE
FNGhmE2Bf8O5a/YHZ71QEv6QRfFUMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/
BAQDAgEGMAoGCCqGSM49BAMCA0gAMEUCIQC3sT1lBjGeF+xKTpzV1KYU2ckahTd4
mLJyzYOhaHv4igIgD2JYkfyH5Q4Bpo8rroO0It7oYjF2kgy/eSZ3U9Glaqw=
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=Feitian Technologies, CN=FEITIAN FIDO CA 02",
		source: "FIDO MDS3 blob no. 303",
		sha256: "9c3fab00f8c7deebe66afdba08a8757e1d8feeb4ba48f3d1c695a7ba7ff5c493",
		pem: `-----BEGIN CERTIFICATE-----
MIICXDCCAb2gAwIBAgIQGgHtUVunmiOu21qJLyxioDAKBggqhkjOPQQDAzBLMQsw
CQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNobm9sb2dpZXMxHTAbBgNV
BAMMFEZFSVRJQU4gRklETyBSb290IENBMCAXDTI1MDEwMTAwMDAwMFoYDzIxMDAx
MjMxMjM1OTU5WjBJMQswCQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNo
bm9sb2dpZXMxGzAZBgNVBAMMEkZFSVRJQU4gRklETyBDQSAwMjB2MBAGByqGSM49
AgEGBSuBBAAiA2IABG0OZ69KtZqwmDohBSGKot0fYRjFrEqY34VZprPAWqWjIEQh
zfuA54fFGQi4GrAcLT7Sft0bLebn+qaA5aLtQcIGJP6v9NSI/+AMJSu7/z0HXUYT
JIrqVpFjRy+MywvisKNmMGQwHQYDVR0OBBYEFCjAzgTmgPdfCzUEFtuUi6NVy3BI
MB8GA1UdIwQYMBaAFJO8ZrgzkR6sLleB0jHWCy3Sed7PMBIGA1UdEwEB/wQIMAYB
Af8CAQAwDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA4GMADCBiAJCAXCYCGMW
HV2q6wvG2pleGesIcPfUwj6k1czgr+nHcnMwaLdqAD0/+pfMErJpHjLaChhRdzqM
mcDTsISjjkk8bSdzAkIB2ASq9dvNLmdVI6JaPx/YmABuzwHt8tCiFzNn+589bF+B
C9ztP3x3zM4egCwPK8v06S7bMphPDzu2BrOXP6YSkGQ=
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=HID Global, OU=Authenticator Attestation, CN=FIDO Attestation CA 1",
		source: "FIDO MDS3 blob no. 303",
		sha256: "a7d926099c8fa56ef68f3ad942d726ad1ccd14799f82647efe2d8af3c1dd4807",
		pem: `-----BEGIN CERTIFICATE-----
MIIDCTCCAq+gAwIBAgIQQAFqUNSe5SWAILs8H2DS1DAKBggqhkjOPQQDAjBrMQsw
CQYDVQQGEwJVUzETMBEGA1UEChMKSElEIEdsb2JhbDEiMCAGA1UECxMZQXV0aGVu
dGljYXRvciBBdHRlc3RhdGlvbjEjMCEGA1UEAxMaRklETyBBdHRlc3RhdGlvbiBS
b290IENBIDEwHhcNMTkwNDI0MTkzMTEyWhcNNDQwNDI3MTkzMTEyWjBmMQswCQYD
VQQGEwJVUzETMBEGA1UEChMKSElEIEdsb2JhbDEiMCAGA1UECxMZQXV0aGVudGlj
YXRvciBBdHRlc3RhdGlvbjEeMBwGA1UEAxMVRklETyBBdHRlc3RhdGlvbiBDQSAx
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEGhSML7cupCxTBCzsrcipwgPoz3dv
T3rBn1zakDzBg6Uc3HdGKJrVbrD+yXF6Y4ZqksUU7rbRivqOOzKxcJvPFqOCATgw
ggE0MBIGA1UdEwEB/wQIMAYBAf8CAQAwDgYDVR0PAQH/BAQDAgGGMIGEBggrBgEF
BQcBAQR4MHYwLgYIKwYBBQUHMAGGImh0dHA6Ly9oaWQuZmlkby5vY3NwLmlkZW50
cnVzdC5jb20wRAYIKwYBBQUHMAKGOGh0dHA6Ly92YWxpZGF0aW9uLmlkZW50cnVz
dC5jb20vcm9vdHMvSElERklET1Jvb3RjYTEucDdjMB8GA1UdIwQYMBaAFB2m3iwW
SYHvWTHbJiHAyKDp+CSjMEcGA1UdHwRAMD4wPKA6oDiGNmh0dHA6Ly92YWxpZGF0
aW9uLmlkZW50cnVzdC5jb20vY3JsL0hJREZJRE9Sb290Y2ExLmNybDAdBgNVHQ4E
FgQU38bQANW9dyVBkWl59BlNLD09e/QwCgYIKoZIzj0EAwIDSAAwRQIhAIUq7zvp
edfZRHtGrvJJz82R99D+Sr7bV7yrHDfBs8v6AiBaIW50j8WGVR1XHXaImNKllmRy
Nlk9klX8gTknOEtD8g==
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=OneSpan, OU=Authenticator Attestation, CN=OneSpan DIGIPASS FX1-C CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "ab0c31ff852ae30e1eb8307817aeb26fe745b7b20acdb6074e98877d9b6804b6",
		pem: `-----BEGIN CERTIFICATE-----
MIICEzCCAbigAwIBAgIEATUBFTAKBggqhkjOPQQDAjBnMQswCQYDVQQGEwJVUzEQ
MA4GA1UEChMHT25lU3BhbjEiMCAGA1UECxMZQXV0aGVudGljYXRvciBBdHRlc3Rh
dGlvbjEiMCAGA1UEAxMZT25lU3BhbiBESUdJUEFTUyBGWDEtQyBDQTAgFw0yNTA5
MDExMjM0MTFaGA8yMDU1MDkwMjEyMzQxMVowZzELMAkGA1UEBhMCVVMxEDAOBgNV
BAoTB09uZVNwYW4xIjAgBgNVBAsTGUF1dGhlbnRpY2F0b3IgQXR0ZXN0YXRpb24x
IjAgBgNVBAMTGU9uZVNwYW4gRElHSVBBU1MgRlgxLUMgQ0EwWTATBgcqhkjOPQIB
BggqhkjOPQMBBwNCAATvMsDTOjODViMT+Ccqo5EO8Lqcz+1q62jYynisULUd6/Yy
MM9b23M5SGofJtBrtMu07wz8AFoDEXGnHFX9ZLl9o1AwTjAdBgNVHQ4EFgQUuFlP
4cGSgRbiE6pmA9RdXYqyy7IwHwYDVR0jBBgwFoAUuFlP4cGSgRbiE6pmA9RdXYqy
y7IwDAYDVR0TBAUwAwEB/zAKBggqhkjOPQQDAgNJADBGAiEAghxzzgqVUcndO+da
9TMyeVgjYB+IvBgVwW8/5+RodAsCIQCifu/c/3E+mppceDAOaF6dU+0KCaEORAKY
FQ3rkZApIA==
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=OneSpan, OU=Authenticator Attestation, CN=OneSpan DIGIPASS FX2FIPS L2 CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "abacb925dfcc30b1abc9a73e2058ce0b7c115c22d95eea5ce189c6da0a9f54d6",
		pem: `-----BEGIN CERTIFICATE-----
MIICGzCCAcKgAwIBAgIEATT+ETAKBggqhkjOPQQDAjBsMQswCQYDVQQGEwJVUzEQ
MA4GA1UEChMHT25lU3BhbjEiMCAGA1UECxMZQXV0aGVudGljYXRvciBBdHRlc3Rh
dGlvbjEnMCUGA1UEAxMeT25lU3BhbiBESUdJUEFTUyBGWDJGSVBTIEwyIENBMCAX
DTI1MDEyOTE0NTQwM1oYDzIwNTUwMTMwMTQ1NDAzWjBsMQswCQYDVQQGEwJVUzEQ
MA4GA1UEChMHT25lU3BhbjEiMCAGA1UECxMZQXV0aGVudGljYXRvciBBdHRlc3Rh
dGlvbjEnMCUGA1UEAxMeT25lU3BhbiBESUdJUEFTUyBGWDJGSVBTIEwyIENBMFkw
EwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEGn+Qx18Dp8ZePY/T5hh6jPfyCLf+4D5v
wVWMIzHHr7jQy7Yss5xc6Ys+nLDZenPV3JOAVbpxZ68/5ifyrvOEDqNQME4wHQYD
VR0OBBYEFLc/Q7L4p5getGHP6h9R1L7T5QHKMB8GA1UdIwQYMBaAFLc/Q7L4p5ge
tGHP6h9R1L7T5QHKMAwGA1UdEwQFMAMBAf8wCgYIKoZIzj0EAwIDRwAwRAIgR8Zx
N5ZvBV1KyedhHdYoWvzZHJ2NczrmN4Y4Qa1sTiQCICK0v1GPNywEIf6D22+WnLf9
3/XLDXXzRnBI31hX6Dtd
-----END CERTIFICATE-----`
	},
	{
		name: "emailAddress=certificate.automation@thalesgroup.com, C=FR, L=Tours, O=Thales DIS, CN=Thales DIS Solutions ECDSA CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "b0747482d4f31a62ceef32bca6534dd9c2f6914cee21d23ad1ff38ce26a8acfb",
		pem: `-----BEGIN CERTIFICATE-----
MIIFCTCCAvGgAwIBAgINALPHqMrRm/0nxoGxijANBgkqhkiG9w0BAQsFADCBoTE1
MDMGCSqGSIb3DQEJARYmY2VydGlmaWNhdGUuYXV0b21hdGlvbkB0aGFsZXNncm91
cC5jb20xCzAJBgNVBAYTAkZSMQ4wDAYDVQQHDAVUb3VyczETMBEGA1UECgwKVGhh
bGVzIERJUzE2MDQGA1UEAwwtVGhhbGVzIERJUyBQcml2YXRlIFJvb3QgQ2VydGlm
aWNhdGUgQXV0aG9yaXR5MB4XDTIyMTAxODE2Mjk1M1oXDTQyMDkwMTE2MzQ1M1ow
gZExNTAzBgkqhkiG9w0BCQEWJmNlcnRpZmljYXRlLmF1dG9tYXRpb25AdGhhbGVz
Z3JvdXAuY29tMQswCQYDVQQGEwJGUjEOMAwGA1UEBwwFVG91cnMxEzARBgNVBAoM
ClRoYWxlcyBESVMxJjAkBgNVBAMMHVRoYWxlcyBESVMgU29sdXRpb25zIEVDRFNB
IENBMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEGCVKZf4SMluKSQAeW08lZhv+
7RlWUifsaF3d6WsPMmh6sZEWq+5HDdQl2OCyicoLyr1/GhYpZ/bFZdukeHA7zqOC
ARcwggETMA8GA1UdEwEB/wQFMAMBAf8wHQYDVR0OBBYEFI0/064GE1u0adz84IxO
AaddNGF3MB8GA1UdIwQYMBaAFFxl7XHt8YK0p9nsJOTPZYw9tquMMA4GA1UdDwEB
/wQEAwIBBjBjBgNVHR8EXDBaMFigVqBUhlJodHRwOi8vY3JsLWJwa2kuZ2VtYWx0
by5jb20vQ1JMMi9UaGFsZXNfRElTX1ByaXZhdGVfUm9vdF9DZXJ0aWZpY2F0ZV9B
dXRob3JpdHkuY3JsMEsGCCsGAQUFBwEBBD8wPTA7BggrBgEFBQcwAoYvaHR0cDov
L2FpYS1icGtpLmdlbWFsdG8uY29tL0FJQS9SU0FfUm9vdF9DQS5jcnQwDQYJKoZI
hvcNAQELBQADggIBAIpuLxSG00V5lkOWqE7rXFwpa3K0hiL3Tj0hSoBwzuHp/QaU
DZ4ZSgY7eQ98g7GwqGPORsKXNJWjhstqXOxUza+JKO0rnjOckxum6khHnVcVRzPj
IUXDwyteDa/xplHdX2gyB/Gq5cHpoRu59Rin8Z6Uc2nCDrd1dSxTQZpDy37iFqHz
mnlc2tFtMsXYLdCWcifC31nX6Ug1/fN1Dqji/9IQDgp56qamLHD8/Yfyzxe/XL6D
+BHla/J61P1ueQNy50HRAQDguiqO+CMrlAhMPLE4kliKIV57pmQmf9n0N3ISiCAP
tbY0plDCGGlteGsm+I5JfRMCMvNnnI025niWYDk8aVeJ/KJ1Z+wBDsI1Nb2k5XSP
PNaidCPPovfdjZ/gyvdG57SjyxEvnC0dpPHe6F2G3JXOyyqReWWItp45luUKX6yc
V+2HWe9USwn0TGeX8UI5DxU2yS88/fYfXEkD0sGj/sGbyda8etuBBTCbpNAv8iXF
1tOlHpwiEr9PJ0I50bk2EdJp0hoond+CSFjGLWAJ9+Ab6taf2mu0kAEDY5BZ2TYs
SXxPVUETK4Ko7puWwadfjqzv3jRsmfb5IZB8FHkaQhfTOxD+gVLN3FNCM9Iu9nRk
yM6DR79N9dlIKwc8T6hOW0pXvMVyXef5B+d2l9FxfwAdLo5G6k2fOyPIsN8P
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=Feitian Technologies, CN=FEITIAN FIDO CA 06",
		source: "FIDO MDS3 blob no. 303",
		sha256: "b65701540ac6014f15b343f78724c3300af9fb95f089f8dc009e7a018bb766b2",
		pem: `-----BEGIN CERTIFICATE-----
MIICWzCCAb2gAwIBAgIQCp16Ddg/PMH42DNlwp7NujAKBggqhkjOPQQDAzBLMQsw
CQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNobm9sb2dpZXMxHTAbBgNV
BAMMFEZFSVRJQU4gRklETyBSb290IENBMCAXDTI1MDEwMTAwMDAwMFoYDzIxMDAx
MjMxMjM1OTU5WjBJMQswCQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNo
bm9sb2dpZXMxGzAZBgNVBAMMEkZFSVRJQU4gRklETyBDQSAwNjB2MBAGByqGSM49
AgEGBSuBBAAiA2IABA7a+dmMNMIOEodscRq9wvbhc2U9rXAd0CCKJ+wgJKpzcvSG
4L7oe7g03yIMRf8pnPrN3dAGE7Nf3aT9QQzxzv9fAYUKtYFjRwcYFEtVfiHG5Qp4
W0Q28yu0JF+JsCmKU6NmMGQwHQYDVR0OBBYEFAeLKS9juH2fssAqHmqAEdsGvpoy
MB8GA1UdIwQYMBaAFJO8ZrgzkR6sLleB0jHWCy3Sed7PMBIGA1UdEwEB/wQIMAYB
Af8CAQAwDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA4GLADCBhwJCAQq6Mj3H
iY7PV2wvD6VortW/lpofG9ckfHfoBzGe+fe6Cya1xY5O/PaVxvb8qvCCb0qxOTN+
cIC4iHulfXlf/FNyAkFnLht+0AMxF/KloiV9m8pfNC9ySYdTJyNU/545oBKTRbFa
/Ve5SX77l6tOTO/6wmhDTp/bh6NVdW4IhL4kPI6woA==
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=Feitian Technologies, CN=FEITIAN FIDO CA 2304",
		source: "FIDO MDS3 blob no. 303",
		sha256: "bc085b03da5a135707c7dce1df4b69decef9697c6e39f4339bb5e460c41bbf88",
		pem: `-----BEGIN CERTIFICATE-----
MIICXjCCAb+gAwIBAgIQBIO+dXd3uuTaoGxQkVribDAKBggqhkjOPQQDAzBLMQsw
CQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNobm9sb2dpZXMxHTAbBgNV
BAMMFEZFSVRJQU4gRklETyBSb290IENBMCAXDTI1MDEwMTAwMDAwMFoYDzIxMDAx
MjMxMjM1OTU5WjBLMQswCQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNo
bm9sb2dpZXMxHTAbBgNVBAMMFEZFSVRJQU4gRklETyBDQSAyMzA0MHYwEAYHKoZI
zj0CAQYFK4EEACIDYgAEBFVxQ+Bf/DUBr63/s6T4DGH75rQxWiHjZtC9BXT7cOwK
sLgbjPlMPzcqideU0wvDrsV9GwWVD4goR3vaUcar6+LaOCuu0prvKIhwbpOkAOU1
B79v2S1psuzCDg4q0pZto2YwZDAdBgNVHQ4EFgQUOG1q+NF/OSZ5R/Sc8v30gcYp
LHQwHwYDVR0jBBgwFoAUk7xmuDORHqwuV4HSMdYLLdJ53s8wEgYDVR0TAQH/BAgw
BgEB/wIBADAOBgNVHQ8BAf8EBAMCAQYwCgYIKoZIzj0EAwMDgYwAMIGIAkIAyfOh
kRYEHbFR3VeoD4bCa7te9RrzD2RZ+rEAd9sHNHFbL0FsKboAc2C7PUAffkTRNr/A
EuvqFbqi7QauT8j2IaICQgFKMV428NvxaE5eI5nLWG0O1cv+kobQ7daJSjBh/1dO
JPoesIcovLAkb3sw/ijUDyRfD3zBlerAuwvqSO+HBofeJQ==
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=HID Global, OU=Authenticator Attestation, CN=FIDO Attestation CA 3",
		source: "FIDO MDS3 blob no. 303",
		sha256: "c663ccd6e1e2cf0f7179f71a3439c60714f323180fb83eb565caed863c132d62",
		pem: `-----BEGIN CERTIFICATE-----
MIIC+jCCAqGgAwIBAgIUB9f6weV4LZjnM5PBAWEvjQwqq+0wCgYIKoZIzj0EAwIw
azELMAkGA1UEBhMCVVMxEzARBgNVBAoMCkhJRCBHbG9iYWwxIjAgBgNVBAsMGUF1
dGhlbnRpY2F0b3IgQXR0ZXN0YXRpb24xIzAhBgNVBAMMGkZJRE8gQXR0ZXN0YXRp
b24gUm9vdCBDQSAyMB4XDTIyMDIxNTIxMzMwN1oXDTQ3MDIxNTIxMzMwN1owZjEL
MAkGA1UEBhMCVVMxEzARBgNVBAoMCkhJRCBHbG9iYWwxIjAgBgNVBAsMGUF1dGhl
bnRpY2F0b3IgQXR0ZXN0YXRpb24xHjAcBgNVBAMMFUZJRE8gQXR0ZXN0YXRpb24g
Q0EgMzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABGKt5kvJMJoAMgbcyZ1mMgPw
V/q5VZXV0bX3WDeBYct5/dRTxWhg3bQ2zJmTmb2/RWtN/coVa3IVjNHIYmnWrjOj
ggEmMIIBIjAOBgNVHQ8BAf8EBAMCAYYwEgYDVR0TAQH/BAgwBgEB/wIBADAfBgNV
HSMEGDAWgBS76Dpl93vB2h5FDLvyMMvUByj3izAdBgNVHQ4EFgQU18dtSwaYea8Q
oLsKx8hPiSNZV/wwRAYDVR0fBD0wOzA5oDegNYYzaHR0cDovL2NybC5oeWRyYW50
aWQuY29tL0ZJRE9BdHRlc3RhdGlvblJvb3RDQTIuY3JsMHYGCCsGAQUFBwEBBGow
aDA/BggrBgEFBQcwAoYzaHR0cDovL2NybC5oeWRyYW50aWQuY29tL0ZJRE9BdHRl
c3RhdGlvblJvb3RDQTIucDdjMCUGCCsGAQUFBzABhhlodHRwOi8vb2NzcC5oeWRy
YW50aWQuY29tMAoGCCqGSM49BAMCA0cAMEQCIFqCQUgOYGQ1SOEx0IWfiAlsOKM/
JQ2XQ+Ci5tijnQRTAiBhNa0E8jWssbAf+lGnAQNAe3ne6Xs3ExZsiDGYwhEUpA==
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=Feitian Technologies, CN=Feitian FIDO EA Root",
		source: "FIDO MDS3 blob no. 303",
		sha256: "cc7dd421c2c559c30279bd9b56a90fb644377d370cfdeb6f9cd488466e4425b9",
		pem: `-----BEGIN CERTIFICATE-----
MIIB2DCCAX+gAwIBAgIRAMs8YXVBoBNuXUjqfCoX7y4wCgYIKoZIzj0EAwIwSzEL
MAkGA1UEBhMCVVMxHTAbBgNVBAoMFEZlaXRpYW4gVGVjaG5vbG9naWVzMR0wGwYD
VQQDDBRGZWl0aWFuIEZJRE8gRUEgUm9vdDAgFw0yMzAxMDEwMDAwMDBaGA8yMDUy
MTIzMTIzNTk1OVowSzELMAkGA1UEBhMCVVMxHTAbBgNVBAoMFEZlaXRpYW4gVGVj
aG5vbG9naWVzMR0wGwYDVQQDDBRGZWl0aWFuIEZJRE8gRUEgUm9vdDBZMBMGByqG
SM49AgEGCCqGSM49AwEHA0IABD2LHHAQqYbdR1WZluertM30rWhorYavWmMVa4nd
X9PZwuREpLQ4m1nElqQKMnRE8/4C+Rqwiav+mpI4kxd5e5ujQjBAMB0GA1UdDgQW
BBS3ZZjyGlhZ99N1vLoTPXVUa4ZEYDAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB
/wQEAwIBBjAKBggqhkjOPQQDAgNHADBEAiAoD+R6kolIWaNJz4hz03D3ges3GbMB
jAWpkOUg9ayFgwIgbEw7AYSyk68OvxgXezgndTRTEuSWT+fdRnLaBNsaTw0=
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=HID Global, OU=Authenticator Attestation, CN=FIDO Attestation ICA 12 Enterprise",
		source: "FIDO MDS3 blob no. 303",
		sha256: "d3d28be22199cbb4245a9854f5f308d5e36cef0f2f4255d2353c0935808855ba",
		pem: `-----BEGIN CERTIFICATE-----
MIIDCjCCArCgAwIBAgIUAjddxicb2nvxYiM6s/RyDQUddnAwCgYIKoZIzj0EAwIw
azELMAkGA1UEBhMCVVMxEzARBgNVBAoMCkhJRCBHbG9iYWwxIjAgBgNVBAsMGUF1
dGhlbnRpY2F0b3IgQXR0ZXN0YXRpb24xIzAhBgNVBAMMGkZJRE8gQXR0ZXN0YXRp
b24gUm9vdCBDQSAzMCAXDTI1MTAyODIyNDU1MVoYDzIwNTAxMDI4MjI0NTUxWjBz
MQswCQYDVQQGEwJVUzETMBEGA1UECgwKSElEIEdsb2JhbDEiMCAGA1UECwwZQXV0
aGVudGljYXRvciBBdHRlc3RhdGlvbjErMCkGA1UEAwwiRklETyBBdHRlc3RhdGlv
biBJQ0EgMTIgRW50ZXJwcmlzZTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABJU7
fEfIy/PdV3tXjuANsSlzK5bkq70ZsItba3blBvsUX5MqJOAiVW2fTN1E5tSNXvUM
hwbKNtaN7uyjq4zCCn2jggEmMIIBIjAOBgNVHQ8BAf8EBAMCAYYwEgYDVR0TAQH/
BAgwBgEB/wIBADAfBgNVHSMEGDAWgBRtInUoqtx9nly25Z2zKvsHnFPMTjAdBgNV
HQ4EFgQUHRRgVgEkKQQ8cy430o7DgGMMaDcwRAYDVR0fBD0wOzA5oDegNYYzaHR0
cDovL2NybC5oeWRyYW50aWQuY29tL0ZJRE9BdHRlc3RhdGlvblJvb3RDQTMuY3Js
MHYGCCsGAQUFBwEBBGowaDA/BggrBgEFBQcwAoYzaHR0cDovL2NybC5oeWRyYW50
aWQuY29tL0ZJRE9BdHRlc3RhdGlvblJvb3RDQTMucDdjMCUGCCsGAQUFBzABhhlo
dHRwOi8vb2NzcC5oeWRyYW50aWQuY29tMAoGCCqGSM49BAMCA0gAMEUCIQCsflcZ
AFDjnAmjbN1F7HRR3Cb3m1SyITyi+AHuKgMBDgIgVYrds5TYsblmahic72uNnZC4
kJ5n+m6P4XW/7+pZFBo=
-----END CERTIFICATE-----`
	},
	{
		name: "CN=Yubico Attestation Intermediate B 1",
		source: "FIDO MDS3 blob no. 303",
		sha256: "d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754",
		pem: `-----BEGIN CERTIFICATE-----
MIIDSDCCAjCgAwIBAgIUDqERw+4RnGSggxgUewJFEPDRZ3YwDQYJKoZIhvcNAQEL
BQAwJDEiMCAGA1UEAwwZWXViaWNvIEF0dGVzdGF0aW9uIFJvb3QgMTAgFw0yNDEy
MDEwMDAwMDBaGA85OTk5MTIzMTIzNTk1OVowLjEsMCoGA1UEAwwjWXViaWNvIEF0
dGVzdGF0aW9uIEludGVybWVkaWF0ZSBCIDEwggEiMA0GCSqGSIb3DQEBAQUAA4IB
DwAwggEKAoIBAQDI7XnH+ZvDwMCQU8M8ZeV5qscublvVYaaRt3Ybaxn9godLx5sw
H0lXrdgjh5h7FpVgCgYYX7E4bl1vbzULemrMWT8N3WMGUe8QAJbBeioV7W/E+hTZ
P/0SKJVa3ewKBo6ULeMnfQZDrVORAk8wTLq2v5Llj5vMj7JtOotKa9J7nHS8kLmz
XXSaj0SwEPh5OAZUTNV4zs1bvoTAQQWrL4/J9QuKt6WCFE5nUNiRQcEbVF8mlqK2
bx2z6okVltyDVLCxYbpUTELvY1usR3DTGPUoIClOm4crpwnDRLVHvjYePGBB//pE
yzxA/gcScxjwaH1ZUw9bnSbHyurKqbTa1KvjAgMBAAGjZjBkMB0GA1UdDgQWBBTq
t0KQngx7ZHrbVHwDunxOn9ihYTAfBgNVHSMEGDAWgBTS7u9aIo06bVwjlz3yhdUm
8SV7kjASBgNVHRMBAf8ECDAGAQH/AgECMA4GA1UdDwEB/wQEAwIBhjANBgkqhkiG
9w0BAQsFAAOCAQEAqQaCWMxTGqVVX7Sk7kkJmUueTSYKuU6+KBBSgwIRnlw9K7He
1IpxZ0hdwpPNikKjmcyFgFPzhImwHJgxxuT90Pw3vYOdcJJNktDg35PXOfzSn15c
FAx1RO0mPTmIb8dXiEWOpzoXvdwXDM41ZaCDYMT7w4IQtMyvE7xUBZq2bjtAnq/N
DUA7be4H8H3ipC+/+NKlUrcUh+j48K67WI0u1m6FeQueBA7n06j825rqDqsaLs9T
b7KAHAw8PmrWaNPG2kjKerxPEfecivlFawp2RWZvxrVtn3TV2SBxyCJCkXsND05d
CErVHSJIs+BdtTVNY9AwtyPmnyb0v4mSTzvWdw==
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=Feitian Technologies, CN=Feitian FIDO Root CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "d6358e8e4547793345fd98c4d1f768183cc847499506ebd736634beff4793ca2",
		pem: `-----BEGIN CERTIFICATE-----
MIIB2TCCAX6gAwIBAgIQFQNKW+7zbg/7d+lTyrIWwDAKBggqhkjOPQQDAjBLMQsw
CQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNobm9sb2dpZXMxHTAbBgNV
BAMMFEZlaXRpYW4gRklETyBSb290IENBMCAXDTIyMDYwODAwMDAwMFoYDzIwNTIw
NjA3MjM1OTU5WjBLMQswCQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNo
bm9sb2dpZXMxHTAbBgNVBAMMFEZlaXRpYW4gRklETyBSb290IENBMFkwEwYHKoZI
zj0CAQYIKoZIzj0DAQcDQgAEsFYEEhiJuqqnMgQjSiivBjV7DGCTf4XBBH/B7uvZ
sKxXShF0L8uDISWUvcExixRs6gB3oldSrjox6L8T94NOzqNCMEAwHQYDVR0OBBYE
FEu9hyYRrRyJzwRYvnDSCIxrFiO3MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/
BAQDAgEGMAoGCCqGSM49BAMCA0kAMEYCIQCB0NFQSN0z4lWz/yc36ewrTCzttK/q
FvlaPOKh+T1o6wIhAP0oKKA+cicsDy3Y3n+VlP8eB3PBzMkhvW/9ISXCw+VB
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=OneSpan, OU=Authenticator Attestation, CN=OneSpan DIGIPASS FX1a CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "df39a02118443c64c2974375f1e6bc56f9eef5292ad5bd8460be0ce76b762093",
		pem: `-----BEGIN CERTIFICATE-----
MIICEDCCAbagAwIBAgIEeKSWsTAKBggqhkjOPQQDAjBmMQswCQYDVQQGEwJVUzEQ
MA4GA1UEChMHT25lU3BhbjEiMCAGA1UECxMZQXV0aGVudGljYXRvciBBdHRlc3Rh
dGlvbjEhMB8GA1UEAxMYT25lU3BhbiBESUdJUEFTUyBGWDFhIENBMCAXDTI0MDUy
NDA4MzY1OFoYDzIwNTQwNTI1MDgzNjU4WjBmMQswCQYDVQQGEwJVUzEQMA4GA1UE
ChMHT25lU3BhbjEiMCAGA1UECxMZQXV0aGVudGljYXRvciBBdHRlc3RhdGlvbjEh
MB8GA1UEAxMYT25lU3BhbiBESUdJUEFTUyBGWDFhIENBMFkwEwYHKoZIzj0CAQYI
KoZIzj0DAQcDQgAECE7jzTGkM5xT+zu+iiqkMsFYi7gx2X0UxdtaFbxXkPR+msGI
HMiQDe2hWsnunWOGTEC3tDT90nArF8CeFWe2W6NQME4wHQYDVR0OBBYEFEi4gzFj
rRlvrNjkQwk2XY6S14CIMB8GA1UdIwQYMBaAFEi4gzFjrRlvrNjkQwk2XY6S14CI
MAwGA1UdEwQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIhAK6Y1gyBmj1K/V5MKDPp
46zipCIlt/XW0xnSpsIQvqxkAiB9w8NjboZsSZneg3J6pwg+9g2lZta7HzZjle+L
Km5QxQ==
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=OneSpan, OU=Authenticator Attestation, CN=OneSpan DIGIPASS FX7FIPS L2 CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "e48a4fc3d4fbd3d3aee8cb3b4a1e7f97f088cb30fb370485d6275291c48e30da",
		pem: `-----BEGIN CERTIFICATE-----
MIICHTCCAcKgAwIBAgIEATT+ETAKBggqhkjOPQQDAjBsMQswCQYDVQQGEwJVUzEQ
MA4GA1UEChMHT25lU3BhbjEiMCAGA1UECxMZQXV0aGVudGljYXRvciBBdHRlc3Rh
dGlvbjEnMCUGA1UEAxMeT25lU3BhbiBESUdJUEFTUyBGWDdGSVBTIEwyIENBMCAX
DTI1MDEyOTE0NTgwM1oYDzIwNTUwMTMwMTQ1ODAzWjBsMQswCQYDVQQGEwJVUzEQ
MA4GA1UEChMHT25lU3BhbjEiMCAGA1UECxMZQXV0aGVudGljYXRvciBBdHRlc3Rh
dGlvbjEnMCUGA1UEAxMeT25lU3BhbiBESUdJUEFTUyBGWDdGSVBTIEwyIENBMFkw
EwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE7VeFbl0FwBWnHK9raK2drWQAaAxd73yK
tw5pJx35EjSZ3hfOmfJ/ybwkbu8ezFi+RNUA0GcPCkHkgLic3mSFWaNQME4wHQYD
VR0OBBYEFCj7nWSOxfOOOwpudQeH4IVFpl8bMB8GA1UdIwQYMBaAFCj7nWSOxfOO
OwpudQeH4IVFpl8bMAwGA1UdEwQFMAMBAf8wCgYIKoZIzj0EAwIDSQAwRgIhAOO6
MSjZVUfOY28SVJUdgYV2bqYA6Dy+8BBkGjP8am7BAiEAmk6AuXFah1XX7GMZmeT4
dsKw1okazv9xWGMj+9nFR4U=
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=OneSpan, OU=Authenticator Attestation, CN=OneSpan Digipass 785 FIDO CA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "e9e1252b0c255fd936c971726a00b9c4668b27235a0a2760b168fbc16c2339f3",
		pem: `-----BEGIN CERTIFICATE-----
MIIB1zCCAXygAwIBAgIEeCoOuTAKBggqhkjOPQQDAjBqMQswCQYDVQQGEwJVUzEQ
MA4GA1UEChMHT25lU3BhbjEiMCAGA1UECxMZQXV0aGVudGljYXRvciBBdHRlc3Rh
dGlvbjElMCMGA1UEAxMcT25lU3BhbiBEaWdpcGFzcyA3ODUgRklETyBDQTAeFw0x
ODA4MDExMDQwMDhaFw00ODA4MDExMDQwMDhaMGoxCzAJBgNVBAYTAlVTMRAwDgYD
VQQKEwdPbmVTcGFuMSIwIAYDVQQLExlBdXRoZW50aWNhdG9yIEF0dGVzdGF0aW9u
MSUwIwYDVQQDExxPbmVTcGFuIERpZ2lwYXNzIDc4NSBGSURPIENBMFkwEwYHKoZI
zj0CAQYIKoZIzj0DAQcDQgAE7pgEv+7pBW3vafi3AGGJRcUwfLrLbvbfoo0ZZs4Y
/18dxPPsr97yP8qGPeVVxA5cqtvDZ0e0UqRYNrxYJtr+SKMQMA4wDAYDVR0TBAUw
AwEB/zAKBggqhkjOPQQDAgNJADBGAiEAgOqPpSm+j+Nl6mqji6a9ibtyS6WNqWxg
Q3NI//nq/XsCIQDo1uHgj76YTfjJPQHtGOcos2C3upUfSMiZKQgpclr3gg==
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=Feitian Technologies, CN=FEITIAN EA CA 02",
		source: "FIDO MDS3 blob no. 303",
		sha256: "f69133c148261664746d706bdddb5edd31684640a85c8c57140b264c0e2e1252",
		pem: `-----BEGIN CERTIFICATE-----
MIICWTCCAbugAwIBAgIQKa7u5u13vYmO6A6+k2chhTAKBggqhkjOPQQDAzBLMQsw
CQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNobm9sb2dpZXMxHTAbBgNV
BAMMFEZFSVRJQU4gRklETyBFQSBSb290MCAXDTI1MDEwMTAwMDAwMFoYDzIxMDAx
MjMxMjM1OTU5WjBHMQswCQYDVQQGEwJVUzEdMBsGA1UECgwURmVpdGlhbiBUZWNo
bm9sb2dpZXMxGTAXBgNVBAMMEEZFSVRJQU4gRUEgQ0EgMDIwdjAQBgcqhkjOPQIB
BgUrgQQAIgNiAAS/dY9WUiVhoR6A7qGecjHeSuu9HwjHdEt/iOGcPPdSyhlwajDV
F68t9wMN8/5vlIaeKO0rRnFQnmGmmuUouerP2oPJwK+TuLfwDAarqbIHjWRsFuOy
b9z5fckfMfz2QEijZjBkMB0GA1UdDgQWBBSdR5BF7JygJOAF/KB+LlyBMQUBIjAf
BgNVHSMEGDAWgBTgRW8yfjPdVoWWue+K3Bs+XvaUBDASBgNVHRMBAf8ECDAGAQH/
AgEAMA4GA1UdDwEB/wQEAwIBBjAKBggqhkjOPQQDAwOBiwAwgYcCQgHBtwZDhaMN
Xywzb4hvQx7LNaQW6KxxDO35X0/Bo/Or0GhGuoKiKGn+2pPe4LuSKDH5w6n68Ek8
3Gq54uH6HuB59gJBV6Mu2oZfNmTG0I8z4nr0OlGnjO3YF46TiFUnx0XDbOqisoCr
7TtFVlIXhminPw5T449yqhfpuEBpRqVndw59CUs=
-----END CERTIFICATE-----`
	},
	{
		name: "C=US, O=HID Global, OU=Authenticator Attestation, CN=FIDO Attestation CA 11",
		source: "FIDO MDS3 blob no. 303",
		sha256: "f991e2acbba74348ebf6d9cf42fc6e12b094ba7b6a3f48ce6151f48adc557636",
		pem: `-----BEGIN CERTIFICATE-----
MIIC/zCCAqSgAwIBAgIUTRlWYMKcBnPE61H9F0Q7PwPY+HYwCgYIKoZIzj0EAwIw
azELMAkGA1UEBhMCVVMxEzARBgNVBAoMCkhJRCBHbG9iYWwxIjAgBgNVBAsMGUF1
dGhlbnRpY2F0b3IgQXR0ZXN0YXRpb24xIzAhBgNVBAMMGkZJRE8gQXR0ZXN0YXRp
b24gUm9vdCBDQSAyMCAXDTI1MDUxMzE2NTcwMVoYDzIwNTAwNTEzMTY1NzAxWjBn
MQswCQYDVQQGEwJVUzETMBEGA1UECgwKSElEIEdsb2JhbDEiMCAGA1UECwwZQXV0
aGVudGljYXRvciBBdHRlc3RhdGlvbjEfMB0GA1UEAwwWRklETyBBdHRlc3RhdGlv
biBDQSAxMTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABMyD1LoMt6p6z1Xe/Eqa
PeEBMphdZHCyDiGfNQmUrROzIoDXPyyTEnYZS7iGsFDJ5EkAKg0I2lk2UU1KR7Lc
l3CjggEmMIIBIjAOBgNVHQ8BAf8EBAMCAYYwEgYDVR0TAQH/BAgwBgEB/wIBADAf
BgNVHSMEGDAWgBS76Dpl93vB2h5FDLvyMMvUByj3izAdBgNVHQ4EFgQUlvqE1DAL
DTW25gFhHU/gMlr6J1EwRAYDVR0fBD0wOzA5oDegNYYzaHR0cDovL2NybC5oeWRy
YW50aWQuY29tL0ZJRE9BdHRlc3RhdGlvblJvb3RDQTIuY3JsMHYGCCsGAQUFBwEB
BGowaDA/BggrBgEFBQcwAoYzaHR0cDovL2NybC5oeWRyYW50aWQuY29tL0ZJRE9B
dHRlc3RhdGlvblJvb3RDQTIucDdjMCUGCCsGAQUFBzABhhlodHRwOi8vb2NzcC5o
eWRyYW50aWQuY29tMAoGCCqGSM49BAMCA0kAMEYCIQCEyn00g7uPZc4mp02dLnok
alykMNoMabFrW/njo5ejuAIhALqi9VxvDvRvzytnjOjslmv0Iz5Rs8eg1LS/9jkq
sWPn
-----END CERTIFICATE-----`
	},
	{
		name: "C=FR, O=Thales DIS, OU=CSP, CN=Thales DIS CSP FIDO ECDSA",
		source: "FIDO MDS3 blob no. 303",
		sha256: "fb1be369f1830fa1e4e4733a23577e2952391167f04d3b82264885eac7fa9a02",
		pem: `-----BEGIN CERTIFICATE-----
MIICRzCCAe2gAwIBAgIQZIXTU1u4X5DAtHuh/u4YizAKBggqhkjOPQQDAjCBkTE1
MDMGCSqGSIb3DQEJARYmY2VydGlmaWNhdGUuYXV0b21hdGlvbkB0aGFsZXNncm91
cC5jb20xCzAJBgNVBAYTAkZSMQ4wDAYDVQQHDAVUb3VyczETMBEGA1UECgwKVGhh
bGVzIERJUzEmMCQGA1UEAwwdVGhhbGVzIERJUyBTb2x1dGlvbnMgRUNEU0EgQ0Ew
HhcNMjUwOTMwMDIyMzI1WhcNNDAwOTI2MDIyMzI1WjBUMQswCQYDVQQGEwJGUjET
MBEGA1UECgwKVGhhbGVzIERJUzEMMAoGA1UECwwDQ1NQMSIwIAYDVQQDDBlUaGFs
ZXMgRElTIENTUCBGSURPIEVDRFNBMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE
fhil5a2E+oqT9tUCQ90eFaHBV0CSM2bqentKmdTNXytI2LBVJ+6c9tikviPFfdRs
6GIhEm0DeCdPdNZbEF7EI6NjMGEwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQU
K7H8OL05244wLOblW41RL8lcBWswHwYDVR0jBBgwFoAUjT/TrgYTW7Rp3PzgjE4B
p100YXcwDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMCA0gAMEUCIQDD8K+z6uN+
7qM/nH5uCNUSPpuxBrhd5TW63eQ33WWcAQIgYZvxITGXc6CHocH1Gmsu4RZkqpv7
GyrgTNMVfviHoWQ=
-----END CERTIFICATE-----`
	}
];
const PACKED_HARDWARE_MODELS = [
	{
		aaguid: "03012cb7-4fb2-42e7-9e8d-a81f10e2a5e9",
		description: "YubiKey 5 Series with Lightning (Consumer Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "04a8fcf2-19c1-457b-911e-69219f17583f",
		description: "Thales PAY GFCX13 authenticator",
		roots: ["0b75a5b6c3cc1445abc0418089c0da7c03a1faa3593ecc99f05220eec32e7a1e", "b0747482d4f31a62ceef32bca6534dd9c2f6914cee21d23ad1ff38ce26a8acfb"]
	},
	{
		aaguid: "0a357157-9b18-4c8a-920e-d156e972b2f8",
		description: "YubiKey 5 Series (Consumer Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "0b8b05a4-ebd4-4b0b-8f5f-33d7b6e606ab",
		description: "HID Crescendo 4000",
		roots: ["2a3a942b61522e933ebc2c334ef5dbc33ea40fd9e7b53f52c489cd4b156c7bc0"]
	},
	{
		aaguid: "0bb43545-fd2c-4185-87dd-feb0b2916ace",
		description: "Security Key NFC by Yubico - Enterprise Edition",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "0ebd9f2c-f685-441c-8c3e-a02a234a840a",
		description: "YubiKey 5 Series with NFC Enhanced PIN (Consumer Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "0fbb74b5-f1ac-4f14-a0f1-ec39b5edfdae",
		description: "Thales PAY GFCX19 authenticator",
		roots: ["0b75a5b6c3cc1445abc0418089c0da7c03a1faa3593ecc99f05220eec32e7a1e", "b0747482d4f31a62ceef32bca6534dd9c2f6914cee21d23ad1ff38ce26a8acfb"]
	},
	{
		aaguid: "11544c3c-3693-40ba-9dbb-3b8d2b977988",
		description: "Thales PAY GFCX20.1 authenticator",
		roots: ["0b75a5b6c3cc1445abc0418089c0da7c03a1faa3593ecc99f05220eec32e7a1e", "b0747482d4f31a62ceef32bca6534dd9c2f6914cee21d23ad1ff38ce26a8acfb"]
	},
	{
		aaguid: "12755c32-8ad1-46eb-881c-e0b38d848b09",
		description: "Feitian ePass FIDO Authenticator (CTAP2.1, CTAP2.0, U2F)",
		roots: [
			"2b7f7417734ad972791ac23a53c596ff67d98c02d391c09ff1c128f097d9f8cc",
			"cc7dd421c2c559c30279bd9b56a90fb644377d370cfdeb6f9cd488466e4425b9",
			"d6358e8e4547793345fd98c4d1f768183cc847499506ebd736634beff4793ca2"
		]
	},
	{
		aaguid: "12ded745-4bed-47d4-abaa-e713f51d6393",
		description: "Feitian AllinOne FIDO2 Authenticator",
		roots: [
			"1d0e48061d16ad771c76a4a2a4d856a497aa71578e1e9b3a309d1c0d6f68f7ba",
			"2c86cb00e189ca0431d33867bbb145cc3abbd4900508e3e26e92e35f2e22877a",
			"492bfc9bb0c655f695a9447b445ec4703cd92d63fd910b5043ba3b0a3964506d",
			"925f79f4350ac09645dc71adc611badc248e837625246f11558edb3d5ee615f6",
			"b65701540ac6014f15b343f78724c3300af9fb95f089f8dc009e7a018bb766b2",
			"cc7dd421c2c559c30279bd9b56a90fb644377d370cfdeb6f9cd488466e4425b9",
			"d6358e8e4547793345fd98c4d1f768183cc847499506ebd736634beff4793ca2"
		]
	},
	{
		aaguid: "13ac47cf-1d78-4fd5-9060-aedaabacf826",
		description: "HID Crescendo Key V3 - Enterprise Edition",
		roots: ["d3d28be22199cbb4245a9854f5f308d5e36cef0f2f4255d2353c0935808855ba"]
	},
	{
		aaguid: "149a2021-8ef6-4133-96b8-81f8d5b7f1f5",
		description: "Security Key by Yubico with NFC",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "19083c3d-8383-4b18-bc03-8f1c9ab2fd1b",
		description: "YubiKey 5 Series",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "19bca99b-7c09-44fe-a969-8cba45764542",
		description: "HID Crescendo Key V3 FIPS",
		roots: ["2eab74db14a0056f996bc57ab470f8dec66900b9a9d35b982c9e9c6ac7edc80c"]
	},
	{
		aaguid: "1ac71f64-468d-4fe0-bef1-0e5f2f551f18",
		description: "YubiKey 5 Series with NFC (Enterprise Profile)",
		roots: ["35f1a54b353bfb711e6d42adbeb76c0e9dead095018e6a94783ba2192fd6faad"]
	},
	{
		aaguid: "20ac7a17-c814-4833-93fe-539f0d5e3389",
		description: "YubiKey 5 Series (Enterprise Profile)",
		roots: ["35f1a54b353bfb711e6d42adbeb76c0e9dead095018e6a94783ba2192fd6faad"]
	},
	{
		aaguid: "234cd403-35a2-4cc2-8015-77ea280c77f5",
		description: "Feitian ePass FIDO2-NFC Series (CTAP2.1, CTAP2.0, U2F)",
		roots: [
			"2b7f7417734ad972791ac23a53c596ff67d98c02d391c09ff1c128f097d9f8cc",
			"cc7dd421c2c559c30279bd9b56a90fb644377d370cfdeb6f9cd488466e4425b9",
			"d6358e8e4547793345fd98c4d1f768183cc847499506ebd736634beff4793ca2"
		]
	},
	{
		aaguid: "23786452-f02d-4344-87ed-aaf703726881",
		description: "SafeNet eToken Fusion CC",
		roots: ["050d4ebb551eac10382d05c147124f1c6347af433802dc51702c0cbf1153de1a", "0c247f03fd5237a2df6661bf878faa09b38f2cfdcb89a2f24c61d48ca13b91da"]
	},
	{
		aaguid: "238ab2f5-b57f-4917-b3c6-3d3c6c0c350f",
		description: "FEITIAN FT-JCOS BioCard",
		roots: ["1d0e48061d16ad771c76a4a2a4d856a497aa71578e1e9b3a309d1c0d6f68f7ba", "bc085b03da5a135707c7dce1df4b69decef9697c6e39f4339bb5e460c41bbf88"]
	},
	{
		aaguid: "24673149-6c86-42e7-98d9-433fb5b73296",
		description: "YubiKey 5 Series with Lightning",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "2a55aee6-27cb-42c0-bc6e-04efe999e88a",
		description: "HID Crescendo 4000",
		roots: ["2a3a942b61522e933ebc2c334ef5dbc33ea40fd9e7b53f52c489cd4b156c7bc0"]
	},
	{
		aaguid: "2bff89f2-323a-48fc-b7c8-9ff7fe87c07e",
		description: "Feitian BioPass FIDO2 Pro (Enterprise Profile)",
		roots: [
			"2b7f7417734ad972791ac23a53c596ff67d98c02d391c09ff1c128f097d9f8cc",
			"cc7dd421c2c559c30279bd9b56a90fb644377d370cfdeb6f9cd488466e4425b9",
			"d6358e8e4547793345fd98c4d1f768183cc847499506ebd736634beff4793ca2"
		]
	},
	{
		aaguid: "2d3bec26-15ee-4f5d-88b2-53622490270b",
		description: "HID Crescendo Key V2",
		roots: ["47a1b53523de068bb9af9cb723a7ca08a397c3e4b07f924f7b299639aea39519"]
	},
	{
		aaguid: "2fc0579f-8113-47ea-b116-bb5a8db9202a",
		description: "YubiKey 5 Series with NFC",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "30b5035e-d297-4fc1-b00b-addc96ba6a97",
		description: "OneSpan FIDO Touch",
		roots: ["7bdf7e4993d36060e4c0dd8f128c7c356cbb583def7db00f01e6726c9e7f15f9", "e9e1252b0c255fd936c971726a00b9c4668b27235a0a2760b168fbc16c2339f3"]
	},
	{
		aaguid: "30b5035e-d297-4ff1-010b-addc96ba6a98",
		description: "OneSpan DIGIPASS FX1a",
		roots: ["df39a02118443c64c2974375f1e6bc56f9eef5292ad5bd8460be0ce76b762093"]
	},
	{
		aaguid: "30b5035e-d297-4ff1-020b-addc96ba6a98",
		description: "OneSpan DIGIPASS FX1-C",
		roots: ["ab0c31ff852ae30e1eb8307817aeb26fe745b7b20acdb6074e98877d9b6804b6"]
	},
	{
		aaguid: "30b5035e-d297-4ff1-b00b-addc96ba6a98",
		description: "OneSpan DIGIPASS FX1 BIO",
		roots: ["7195352a9b50281dcd045434f04186a0b87fa80b0fd36d8cf0983891b8b042df"]
	},
	{
		aaguid: "30b5035e-d297-4ff2-010b-addc96ba6a98",
		description: "OneSpan DIGIPASS FX2-A",
		roots: ["55ead7d79cdd2f8ee4a5e96eadb55605bb936e8b9ee90458fda80529b6aa46c3", "abacb925dfcc30b1abc9a73e2058ce0b7c115c22d95eea5ce189c6da0a9f54d6"]
	},
	{
		aaguid: "30b5035e-d297-4ff7-010b-addc96ba6a98",
		description: "OneSpan DIGIPASS FX7-B",
		roots: ["81c07bd46de18417bd4fca7b3bdc0932553c63926efcbfd78bf6e221e8fd5425", "e48a4fc3d4fbd3d3aee8cb3b4a1e7f97f088cb30fb370485d6275291c48e30da"]
	},
	{
		aaguid: "30b5035e-d297-4ff7-020b-addc96ba6a98",
		description: "OneSpan DIGIPASS FX7",
		roots: ["6ca500e490143a514096634c45289f82b833749aa0d3edabc83116f79375a2b5"]
	},
	{
		aaguid: "30b5035e-d297-4ff7-030b-addc96ba6a98",
		description: "OneSpan DIGIPASS FX7-C",
		roots: ["1b1678b4b9bdb1e6164dece87fd38147b00aa417df15f087679e0262e6fed206"]
	},
	{
		aaguid: "30b5035e-d297-4ff7-b00b-addc96ba6a98",
		description: "OneSpan DIGIPASS FX7",
		roots: ["1b4280e5c5a7465fcdcec82e287949f5d33da4cb692a5467a05101b5546675a2"]
	},
	{
		aaguid: "34744913-4f57-4e6e-a527-e9ec3c4b94e6",
		description: "YubiKey Bio Series - Multi-protocol Edition",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "39589099-9a75-49fc-afaa-801ca211c62a",
		description: "Feitian ePass FIDO-NFC (Enterprise Profile) (CTAP2.1, CTAP2.0, U2F)",
		roots: [
			"3b0e51e8199d3d4a598860967e68315e1f3c3f4d1cc78a0f993d5a0dc2c39dc0",
			"cc7dd421c2c559c30279bd9b56a90fb644377d370cfdeb6f9cd488466e4425b9",
			"f69133c148261664746d706bdddb5edd31684640a85c8c57140b264c0e2e1252"
		]
	},
	{
		aaguid: "3a662962-c6d4-4023-bebb-98ae92e78e20",
		description: "YubiKey 5 FIPS Series with Lightning (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "3aa78eb1-ddd8-46a8-a821-8f8ec57a7bd5",
		description: "YubiKey 5 CCN Series with NFC",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "3b24bf49-1d45-4484-a917-13175df0867b",
		description: "YubiKey 5 Series with Lightning (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "3e22415d-7fdf-4ea4-8a0c-dd60c4249b9d",
		description: "Feitian iePass FIDO Authenticator",
		roots: [
			"2c86cb00e189ca0431d33867bbb145cc3abbd4900508e3e26e92e35f2e22877a",
			"492bfc9bb0c655f695a9447b445ec4703cd92d63fd910b5043ba3b0a3964506d",
			"925f79f4350ac09645dc71adc611badc248e837625246f11558edb3d5ee615f6"
		]
	},
	{
		aaguid: "3ec9c8d3-a5a7-415b-a7b5-f1d606368d3f",
		description: "YubiKey 5 CCN Series with NFC (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "41e39911-c669-4811-b860-c6ad0b411b96",
		description: "YubiKey 5 Series with NFC (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "42b4fb4a-2866-43b2-9bf7-6c6669c2e5d3",
		description: "Google Titan Security Key v2",
		roots: ["198493807e92540a44a9e1cc9cb0634e27ac68eb37a442da8af9cf60f99e70a6", "918a618c220cfdaeda51ea4eae0eb5dea106deef721882a82e5df5a9b04728e7"]
	},
	{
		aaguid: "42df17de-06ba-4177-a2bb-6701be1380d6",
		description: "Feitian BioPass FIDO2 Plus Authenticator",
		roots: [
			"2b7f7417734ad972791ac23a53c596ff67d98c02d391c09ff1c128f097d9f8cc",
			"cc7dd421c2c559c30279bd9b56a90fb644377d370cfdeb6f9cd488466e4425b9",
			"d6358e8e4547793345fd98c4d1f768183cc847499506ebd736634beff4793ca2"
		]
	},
	{
		aaguid: "4599062e-6926-4fe7-9566-9e8fb1aedaa0",
		description: "YubiKey 5 Series (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "47ab2fb4-66ac-4184-9ae1-86be814012d5",
		description: "Security Key NFC by Yubico - Enterprise Edition",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "4c0cf95d-2f40-43b5-ba42-4c83a11c04ba",
		description: "Feitian BioPass FIDO2 Pro Authenticator",
		roots: ["2b7f7417734ad972791ac23a53c596ff67d98c02d391c09ff1c128f097d9f8cc", "d6358e8e4547793345fd98c4d1f768183cc847499506ebd736634beff4793ca2"]
	},
	{
		aaguid: "4d41190c-7beb-4a84-8018-adf265a6352d",
		description: "Thales IDPrime FIDO Bio",
		roots: ["050d4ebb551eac10382d05c147124f1c6347af433802dc51702c0cbf1153de1a", "0c247f03fd5237a2df6661bf878faa09b38f2cfdcb89a2f24c61d48ca13b91da"]
	},
	{
		aaguid: "4fc84f16-2545-4e53-b8fc-7bf4d7282a10",
		description: "YubiKey 5 CCN Series with NFC (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "524de2de-982f-49b4-a769-2b5e3b73ad79",
		description: "YubiKey 5 Series (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "54d9fee8-e621-4291-8b18-7157b99c5bec",
		description: "HID Crescendo Enabled",
		roots: ["c663ccd6e1e2cf0f7179f71a3439c60714f323180fb83eb565caed863c132d62"]
	},
	{
		aaguid: "57f7de54-c807-4eab-b1c6-1c9be7984e92",
		description: "YubiKey 5 FIPS Series",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "58276709-bb4b-4bb3-baf1-60eea99282a7",
		description: "YubiKey Bio Series - Multi-protocol Edition 1VDJSN",
		roots: [
			"35f1a54b353bfb711e6d42adbeb76c0e9dead095018e6a94783ba2192fd6faad",
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "662ef48a-95e2-4aaa-a6c1-5b9c40375824",
		description: "YubiKey 5 Series with NFC - Enhanced PIN",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "692db549-7ae5-44d5-a1e5-dd20a493b723",
		description: "HID Crescendo Key",
		roots: ["6834aecc369824e56c3804edb514fea92b72973d3804999d90362371b9175afe"]
	},
	{
		aaguid: "6ab56fad-881f-4a43-acb2-0be065924522",
		description: "YubiKey 5 Series with NFC (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "6d44ba9b-f6ec-2e49-b930-0c8fe920cb73",
		description: "Security Key by Yubico with NFC",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "6ec5cff2-a0f9-4169-945b-f33b563f7b99",
		description: "YubiKey Bio Series - Multi-protocol Edition (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "72c6b72d-8512-4c66-8359-9d3d10d9222f",
		description: "Security Key NFC by Yubico - Enterprise Edition (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "73bb0cd4-e502-49b8-9c6f-b59445bf720b",
		description: "YubiKey 5 FIPS Series",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "7409272d-1ff9-4e10-9fc9-ac0019c124fd",
		description: "YubiKey Bio Series - FIDO Edition",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "74820b05-a6c9-40f9-8fb0-9f86aca93998",
		description: "SafeNet eToken Fusion",
		roots: ["050d4ebb551eac10382d05c147124f1c6347af433802dc51702c0cbf1153de1a", "0c247f03fd5237a2df6661bf878faa09b38f2cfdcb89a2f24c61d48ca13b91da"]
	},
	{
		aaguid: "77010bd7-212a-4fc9-b236-d2ca5e9d4084",
		description: "Feitian BioPass FIDO2 Authenticator",
		roots: [
			"2c86cb00e189ca0431d33867bbb145cc3abbd4900508e3e26e92e35f2e22877a",
			"492bfc9bb0c655f695a9447b445ec4703cd92d63fd910b5043ba3b0a3964506d",
			"925f79f4350ac09645dc71adc611badc248e837625246f11558edb3d5ee615f6"
		]
	},
	{
		aaguid: "78ba3993-d784-4f44-8d6e-cc0a8ad5230e",
		description: "Feitian ePass FIDO-NFC(CTAP2.1, CTAP2.0, U2F)",
		roots: [
			"1d0e48061d16ad771c76a4a2a4d856a497aa71578e1e9b3a309d1c0d6f68f7ba",
			"9c3fab00f8c7deebe66afdba08a8757e1d8feeb4ba48f3d1c695a7ba7ff5c493",
			"d6358e8e4547793345fd98c4d1f768183cc847499506ebd736634beff4793ca2"
		]
	},
	{
		aaguid: "7991798a-a7f3-487f-98c0-3faf7a458a04",
		description: "HID Crescendo Key V3",
		roots: ["0f8b05544f7b5ec17202d97df2d108df45114ee38019c2853eb00a105f19cb71"]
	},
	{
		aaguid: "79f3c8ba-9e35-484b-8f47-53a5a0f5c630",
		description: "YubiKey 5 FIPS Series with NFC (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "7b96457d-e3cd-432b-9ceb-c9fdd7ef7432",
		description: "YubiKey 5 FIPS Series with Lightning",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "7d1351a6-e097-4852-b8bf-c9ac5c9ce4a3",
		description: "YubiKey Bio Series - Multi-protocol Edition",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "7dab85a5-d16d-4eaf-a7ef-4c1385b151c5",
		description: "YubiKey 5 Series with NFC (Consumer Profile) KVZR57-2",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "833b721a-ff5f-4d00-bb2e-bdda3ec01e29",
		description: "Feitian ePass FIDO2 Authenticator",
		roots: [
			"2c86cb00e189ca0431d33867bbb145cc3abbd4900508e3e26e92e35f2e22877a",
			"492bfc9bb0c655f695a9447b445ec4703cd92d63fd910b5043ba3b0a3964506d",
			"925f79f4350ac09645dc71adc611badc248e837625246f11558edb3d5ee615f6"
		]
	},
	{
		aaguid: "83c47309-aabb-4108-8470-8be838b573cb",
		description: "YubiKey Bio Series - FIDO Edition (Enterprise Profile)",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42", "3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b"]
	},
	{
		aaguid: "85203421-48f9-4355-9bc8-8a53846e5083",
		description: "YubiKey 5 FIPS Series with Lightning",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "87c13177-85d6-40ac-8c61-fe7ab3de9dfb",
		description: "HID Crescendo Key V3",
		roots: ["0f8b05544f7b5ec17202d97df2d108df45114ee38019c2853eb00a105f19cb71"]
	},
	{
		aaguid: "8c39ee86-7f9a-4a95-9ba3-f6b097e5c2ee",
		description: "YubiKey Bio Series - FIDO Edition (Enterprise Profile)",
		roots: ["35f1a54b353bfb711e6d42adbeb76c0e9dead095018e6a94783ba2192fd6faad"]
	},
	{
		aaguid: "8eec9bf9-486c-46da-9a67-1fbb4f66b9ed",
		description: "HID Crescendo 4000 FIPS",
		roots: ["4a576571111816aa6c300af1dc0c78c0101449d2fbf74082904f38f9b268b385"]
	},
	{
		aaguid: "905b4cb4-ed6f-4da9-92fc-45e0d4e9b5c7",
		description: "YubiKey 5 FIPS Series (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "90636e1f-ef82-43bf-bdcf-5255f139d12f",
		description: "YubiKey Bio Series - Multi-protocol Edition",
		roots: ["35f1a54b353bfb711e6d42adbeb76c0e9dead095018e6a94783ba2192fd6faad"]
	},
	{
		aaguid: "9152406a-de8e-46dd-8685-3875c067e486",
		description: "SafeNet eToken Fusion NFC 930C FIDO2.1",
		roots: ["b0747482d4f31a62ceef32bca6534dd9c2f6914cee21d23ad1ff38ce26a8acfb", "fb1be369f1830fa1e4e4733a23577e2952391167f04d3b82264885eac7fa9a02"]
	},
	{
		aaguid: "97e6a830-c952-4740-95fc-7c78dc97ce47",
		description: "YubiKey Bio Series - Multi-protocol Edition (Enterprise Profile)",
		roots: ["35f1a54b353bfb711e6d42adbeb76c0e9dead095018e6a94783ba2192fd6faad"]
	},
	{
		aaguid: "9806a2c8-c0da-478e-b4ca-620005d34182",
		description: "YubiKey Bio Multi-protocol Edition (Consumer Profile) 1VDJSN-2",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "9a3f2abd-a73d-439c-9ee7-1b53a857eaa7",
		description: "YubiKey 5 Series with NFC Enhanced PIN (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "9dd8d593-2213-438a-97f8-d6b813d51c27",
		description: "YubiKey Bio Fido Edition (Consumer Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "9eb7eabc-9db5-49a1-b6c3-555a802093f4",
		description: "YubiKey 5 Series with NFC KVZR57",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "9ff4cc65-6154-4fff-ba09-9e2af7882ad2",
		description: "Security Key NFC by Yubico - Enterprise Edition (Enterprise Profile)",
		roots: ["35f1a54b353bfb711e6d42adbeb76c0e9dead095018e6a94783ba2192fd6faad"]
	},
	{
		aaguid: "a02140b7-0cbd-42e1-a9b5-a39da2545114",
		description: "Feitian BioPass FIDO2 Plus (Enterprise Profile)",
		roots: [
			"2b7f7417734ad972791ac23a53c596ff67d98c02d391c09ff1c128f097d9f8cc",
			"cc7dd421c2c559c30279bd9b56a90fb644377d370cfdeb6f9cd488466e4425b9",
			"d6358e8e4547793345fd98c4d1f768183cc847499506ebd736634beff4793ca2"
		]
	},
	{
		aaguid: "a02167b9-ae71-4ac7-9a07-06432ebb6f1c",
		description: "YubiKey 5 Series with Lightning",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "a25342c0-3cdc-4414-8e46-f4807fca511c",
		description: "YubiKey 5 Series with NFC",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "a4e9fc6d-4cbe-4758-b8ba-37598bb5bbaa",
		description: "Security Key NFC by Yubico",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "aa79f476-ea00-417e-9628-1e8365123922",
		description: "HID Crescendo 4000 FIDO",
		roots: ["f991e2acbba74348ebf6d9cf42fc6e12b094ba7b6a3f48ce6151f48adc557636"]
	},
	{
		aaguid: "ad08c78a-4e41-49b9-86a2-ac15b06899e2",
		description: "YubiKey Bio Series - FIDO Edition (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "add92433-0d69-4026-8166-29b25bce64e9",
		description: "YubiKey Bio Fido Edition (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "aeb6569c-f8fb-4950-ac60-24ca2bbe2e52",
		description: "HID Crescendo C2300",
		roots: ["a7d926099c8fa56ef68f3ad942d726ad1ccd14799f82647efe2d8af3c1dd4807"]
	},
	{
		aaguid: "b2c1a50b-dad8-4dc7-ba4d-0ce9597904bc",
		description: "YubiKey 5 Series with NFC - Enhanced PIN (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "b6ede29c-3772-412c-8a78-539c1f4c62d2",
		description: "Feitian BioPass FIDO2 Plus Authenticator",
		roots: [
			"2c86cb00e189ca0431d33867bbb145cc3abbd4900508e3e26e92e35f2e22877a",
			"492bfc9bb0c655f695a9447b445ec4703cd92d63fd910b5043ba3b0a3964506d",
			"925f79f4350ac09645dc71adc611badc248e837625246f11558edb3d5ee615f6"
		]
	},
	{
		aaguid: "b7d3f68e-88a6-471e-9ecf-2df26d041ede",
		description: "Security Key NFC by Yubico",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "b90e7dc1-316e-4fee-a25a-56a666a670fe",
		description: "YubiKey 5 Series with Lightning (Enterprise Profile)",
		roots: ["35f1a54b353bfb711e6d42adbeb76c0e9dead095018e6a94783ba2192fd6faad"]
	},
	{
		aaguid: "b92c3f9a-c014-4056-887f-140a2501163b",
		description: "Security Key by Yubico",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "ba0a9266-40d8-4048-9786-d710b5474752",
		description: "YubiKey Bio Multi-protocol Edition (Consumer Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "c1f9a0bc-1dd2-404a-b27f-8e29047a43fd",
		description: "YubiKey 5 FIPS Series with NFC",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "c3479970-e58a-4f70-836f-853bf42fb063",
		description: "YubiKey 5 Series with Lightning (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "c4ddaf11-3032-4e77-b3b9-3a340369b9ad",
		description: "HID Crescendo Fusion",
		roots: ["1180eee4f2e0065570d63f440fdfaa9cdac2f8fa3e5eb112d74191cca9a95b12"]
	},
	{
		aaguid: "c5ef55ff-ad9a-4b9f-b580-adebafe026d0",
		description: "YubiKey 5 Series with Lightning",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "c80dbd9a-533f-4a17-b941-1a2f1c7cedff",
		description: "HID Crescendo C3000",
		roots: ["78a2d5bd208ce1b18d61c94fc4c5905f5c7e022b200c1e60978698d6949f6f45"]
	},
	{
		aaguid: "cb69481e-8ff7-4039-93ec-0a2729a154a8",
		description: "YubiKey 5 Series",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "d7781e5d-e353-46aa-afe2-3ca49f13332a",
		description: "YubiKey 5 Series with NFC",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "d8522d9f-575b-4866-88a9-ba99fa02f35b",
		description: "YubiKey Bio Series - FIDO Edition",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "dc5e949d-f939-43b3-9877-a85c7186b753",
		description: "YubiKey Bio Multi-protocol Edition (Enterprise Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "dd86a2da-86a0-4cbe-b462-4bd31f57bc6f",
		description: "YubiKey Bio Series - FIDO Edition",
		roots: ["35f1a54b353bfb711e6d42adbeb76c0e9dead095018e6a94783ba2192fd6faad"]
	},
	{
		aaguid: "e77e3c64-05e3-428b-8824-0cbeb04b829d",
		description: "Security Key NFC by Yubico",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "eb7ef748-cbe0-4b40-b8f6-07bd2d592d35",
		description: "YubiKey 5 CCN Series with NFC (Consumer Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "ed042a3a-4b22-4455-bb69-a267b652ae7e",
		description: "Security Key NFC by Yubico - Enterprise Edition",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "ee041bce-25e5-4cdb-8f86-897fd6418464",
		description: "Feitian ePass FIDO2-NFC Authenticator",
		roots: [
			"196f98300ebe607fa45eeca5925cc61b5f6450a2da0330bf617335aa84820250",
			"2c86cb00e189ca0431d33867bbb145cc3abbd4900508e3e26e92e35f2e22877a",
			"492bfc9bb0c655f695a9447b445ec4703cd92d63fd910b5043ba3b0a3964506d",
			"925f79f4350ac09645dc71adc611badc248e837625246f11558edb3d5ee615f6"
		]
	},
	{
		aaguid: "ee882879-721c-4913-9775-3dfcce97072a",
		description: "YubiKey 5 Series",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "efb96b10-a9ee-4b6c-a4a9-d32125ccd4a4",
		description: "Safenet eToken FIDO",
		roots: ["050d4ebb551eac10382d05c147124f1c6347af433802dc51702c0cbf1153de1a", "0c247f03fd5237a2df6661bf878faa09b38f2cfdcb89a2f24c61d48ca13b91da"]
	},
	{
		aaguid: "f4ce5fc0-57d3-46f5-a736-efb7d5bc63b5",
		description: "YubiKey 5 Series with NFC (Consumer Profile)",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "f8a011f3-8c0a-4d15-8006-17111f9edc7d",
		description: "Security Key by Yubico",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "fa2b99dc-9e39-4257-8f92-4a30d23c4118",
		description: "YubiKey 5 Series with NFC",
		roots: ["0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42"]
	},
	{
		aaguid: "fcc0118f-cd45-435b-8da1-9782b2da0715",
		description: "YubiKey 5 FIPS Series with NFC",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	},
	{
		aaguid: "ff4dac45-ede8-4ec2-aced-cf66103f4335",
		description: "YubiKey 5 Series",
		roots: [
			"3c6fe819adbd80afe75dc90af7bba34c95b2b7ac64384816e033f63b7c93848b",
			"4698a1d3389c3ec60016c216250f1d0439922832d65142327436376dc2942b55",
			"4eadda86ff62cff987e111a07910d8554de42f71d5d6da7744610e09012dd319",
			"4ebabc9cbc964f722c985f3784d057e9ef5dcf454dcb4f767fccca58cf16a4e8",
			"62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8",
			"d4cc3f456fdaf4e7812a21aab1dfe9d8e27d24e2fd2d6f21c9940109f0daa754"
		]
	}
];
//#endregion
//#region src/enclawed/auth/webauthn.ts
const FLAG_UP = 1;
const FLAG_UV = 4;
const FLAG_BE = 8;
const FLAG_BS = 16;
const FLAG_AT = 64;
const FLAG_ED = 128;
/** RSASSA-PKCS1-v1_5 with SHA-256: the credential key Windows Hello makes on most TPMs. */
const COSE_ALG_RS256 = -257;
/** The smallest RSA credential modulus accepted, in bits. */
const MIN_RSA_BITS = 2048;
function sha256(data) {
	return new Uint8Array(createHash("sha256").update(data).digest());
}
function equalBytes(a, b) {
	return a.length === b.length && timingSafeEqual(a, b);
}
function b64url(data) {
	return Buffer.from(data).toString("base64url");
}
function fromB64url(text) {
	if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new WebAuthnError("bad-client-data", "not base64url");
	return new Uint8Array(Buffer.from(text, "base64url"));
}
function formatAaguid(bytes) {
	const h = Buffer.from(bytes).toString("hex");
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
/** Turn a COSE_Key (RFC 9052/9053, RFC 8230) into a verification key. ES256, EdDSA and RS256 only. */
function coseToPublicKey(cose) {
	let map;
	try {
		map = decodeCbor(cose);
	} catch (err) {
		throw new WebAuthnError("bad-public-key", `credential key is not CBOR: ${String(err)}`);
	}
	if (!(map instanceof Map)) throw new WebAuthnError("bad-public-key", "credential key is not a COSE map");
	const kty = map.get(1);
	const alg = map.get(3);
	const crv = map.get(-1);
	const x = map.get(-2);
	try {
		if (kty === 2 && alg === -7) {
			const y = map.get(-3);
			if (crv !== 1 || !(x instanceof Uint8Array) || !(y instanceof Uint8Array)) throw new WebAuthnError("bad-public-key", "ES256 key must be P-256 with x and y");
			if (x.length !== 32 || y.length !== 32) throw new WebAuthnError("bad-public-key", "ES256 coordinates must be 32 bytes");
			return {
				alg: -7,
				cose,
				key: createPublicKey({
					key: {
						kty: "EC",
						crv: "P-256",
						x: b64url(x),
						y: b64url(y)
					},
					format: "jwk"
				})
			};
		}
		if (kty === 1 && alg === -8) {
			if (crv !== 6 || !(x instanceof Uint8Array) || x.length !== 32) throw new WebAuthnError("bad-public-key", "EdDSA key must be Ed25519 with a 32-byte x");
			return {
				alg: -8,
				cose,
				key: createPublicKey({
					key: {
						kty: "OKP",
						crv: "Ed25519",
						x: b64url(x)
					},
					format: "jwk"
				})
			};
		}
		if (kty === 3 && alg === -257) {
			const n = map.get(-1);
			const e = map.get(-2);
			if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array) || n.length === 0) throw new WebAuthnError("bad-public-key", "RS256 key must carry n and e");
			if (n[0] === 0 || e.length === 0 || e[0] === 0 || e.length > 4) throw new WebAuthnError("bad-public-key", "RS256 n and e must be minimal big-endian");
			const bits = (n.length - 1) * 8 + (32 - Math.clz32(n[0]));
			if (bits < 2048) throw new WebAuthnError("bad-public-key", `RS256 key is ${bits} bits; at least ${MIN_RSA_BITS} are required`);
			const eNum = Buffer.from(e).readUIntBE(0, e.length);
			if (eNum < 3 || eNum % 2 === 0) throw new WebAuthnError("bad-public-key", "RS256 public exponent must be odd and at least 3");
			return {
				alg: COSE_ALG_RS256,
				cose,
				key: createPublicKey({
					key: {
						kty: "RSA",
						n: b64url(n),
						e: b64url(e)
					},
					format: "jwk"
				})
			};
		}
	} catch (err) {
		if (err instanceof WebAuthnError) throw err;
		throw new WebAuthnError("bad-public-key", `invalid credential key: ${String(err)}`);
	}
	throw new WebAuthnError("unsupported-alg", `credential algorithm kty=${JSON.stringify(kty)} alg=${JSON.stringify(alg)} is not accepted (ES256, EdDSA or RS256 only)`);
}
/** Parse raw authenticator data (WebAuthn §6.1). */
function parseAuthenticatorData(raw) {
	if (raw.length < 37) throw new WebAuthnError("bad-authdata", "authenticator data shorter than 37 bytes");
	const rpIdHash = raw.slice(0, 32);
	const f = raw[32];
	const flags = {
		up: (f & FLAG_UP) !== 0,
		uv: (f & FLAG_UV) !== 0,
		be: (f & FLAG_BE) !== 0,
		bs: (f & FLAG_BS) !== 0,
		at: (f & FLAG_AT) !== 0,
		ed: (f & FLAG_ED) !== 0
	};
	if (flags.bs && !flags.be) throw new WebAuthnError("bad-authdata", "backup state set without backup eligibility");
	const signCount = new DataView(raw.buffer, raw.byteOffset + 33, 4).getUint32(0);
	let at = 37;
	let attested = null;
	try {
		if (flags.at) {
			if (raw.length < at + 18) throw new WebAuthnError("bad-authdata", "attested credential data truncated");
			const aaguid = raw.slice(at, at + 16);
			const idLen = raw[at + 16] << 8 | raw[at + 17];
			at += 18;
			if (idLen < 1 || idLen > 1023 || raw.length < at + idLen) throw new WebAuthnError("bad-authdata", "credential id length out of range");
			const credentialId = raw.slice(at, at + idLen);
			at += idLen;
			const item = decodeCborItem(raw, at);
			const cose = raw.slice(at, item.end);
			at = item.end;
			attested = {
				aaguid: formatAaguid(aaguid),
				credentialId,
				publicKey: coseToPublicKey(cose)
			};
		}
		if (flags.ed) {
			const ext = decodeCborItem(raw, at);
			if (!(ext.value instanceof Map)) throw new WebAuthnError("bad-authdata", "extensions are not a CBOR map");
			at = ext.end;
		}
	} catch (err) {
		if (err instanceof WebAuthnError) throw err;
		if (err instanceof CborError) throw new WebAuthnError("bad-authdata", `authenticator data: ${err.message}`);
		throw err;
	}
	if (at !== raw.length) throw new WebAuthnError("bad-authdata", "trailing bytes in authenticator data");
	return {
		rpIdHash,
		flags,
		signCount,
		attested
	};
}
/** WebAuthn §7.1 steps 5-11 / §7.2 steps 9-15: parse and check clientDataJSON; return its hash. */
function verifyClientData(clientDataJSON, expected) {
	let parsed;
	try {
		parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(clientDataJSON));
	} catch {
		throw new WebAuthnError("bad-client-data", "clientDataJSON is not UTF-8 JSON");
	}
	if (!parsed || typeof parsed !== "object") throw new WebAuthnError("bad-client-data", "clientDataJSON is not an object");
	const c = parsed;
	if (c.type !== expected.type) throw new WebAuthnError("type-mismatch", `clientData.type is ${String(c.type)}`);
	if (typeof c.challenge !== "string" || !equalBytes(fromB64url(c.challenge), expected.challenge)) throw new WebAuthnError("challenge-mismatch", "clientData.challenge is not the issued challenge");
	if (c.origin !== expected.origin) throw new WebAuthnError("origin-mismatch", `clientData.origin is ${String(c.origin)}`);
	if (c.crossOrigin === true) throw new WebAuthnError("origin-mismatch", "cross-origin ceremonies are not accepted");
	return sha256(clientDataJSON);
}
function checkRpAndFlags(auth, rpId) {
	if (!equalBytes(auth.rpIdHash, sha256(rpId))) throw new WebAuthnError("rp-mismatch", "rpIdHash does not match the relying party id");
	if (!auth.flags.up) throw new WebAuthnError("no-user-presence", "the authenticator did not assert user presence (UP=0)");
	if (!auth.flags.uv) throw new WebAuthnError("no-user-verification", "the authenticator did not verify the user (UV=0): a PIN or biometric is required");
	if (auth.flags.be) throw new WebAuthnError("backup-eligible", "the credential is backup-eligible (a synced passkey); only device-bound credentials are accepted");
}
/** Verify one signature with a credential key, per its COSE algorithm. */
function verifyWithCredentialKey(pub, data, signature) {
	try {
		if (pub.alg === -7) return verify("sha256", data, {
			key: pub.key,
			dsaEncoding: "der"
		}, signature);
		if (pub.alg === -257) return verify("sha256", data, {
			key: pub.key,
			padding: constants$1.RSA_PKCS1_PADDING
		}, signature);
		return verify(null, data, pub.key, signature);
	} catch {
		return false;
	}
}
let pinnedPacked = null;
/**
* The pinned packed trust (attestation-roots-packed.ts): each root checked
* against its fingerprint (a root whose PEM does not match is never trusted),
* each model with the roots it names.
*/
function pinnedPackedTrust() {
	if (pinnedPacked) return pinnedPacked;
	const roots = /* @__PURE__ */ new Map();
	for (const r of PACKED_HARDWARE_ROOTS) {
		const cert = loadPinnedRoot(r);
		if (cert) roots.set(r.sha256, cert);
	}
	const models = /* @__PURE__ */ new Map();
	for (const m of PACKED_HARDWARE_MODELS) models.set(m.aaguid, {
		description: m.description,
		roots: m.roots.map((f) => roots.get(f)).filter((c) => c !== void 0)
	});
	pinnedPacked = { models };
	return pinnedPacked;
}
const SOFTWARE_AUTHENTICATOR_ORG = /(^|\n)O=Chromium(\n|$)/;
const PLATFORM_FORMATS = [
	"tpm",
	"apple",
	"android-key"
];
const AAGUID_OID = Buffer.from("060b2b0601040182e51c010104", "hex");
/** The AAGUID extension of an attestation certificate, when present. */
function certAaguid(der) {
	const buf = Buffer.from(der);
	const at = buf.indexOf(AAGUID_OID);
	if (at < 0) return null;
	let p = at + AAGUID_OID.length;
	if (buf[p] === 1 && buf[p + 1] === 1) {
		if (buf[p + 2] !== 0) throw new WebAuthnError("attestation-invalid", "the AAGUID extension must not be critical");
		p += 3;
	}
	if (buf[p] !== 4 || buf[p + 1] !== 18 || buf[p + 2] !== 4 || buf[p + 3] !== 16) throw new WebAuthnError("attestation-invalid", "malformed AAGUID extension");
	return formatAaguid(buf.subarray(p + 4, p + 20));
}
function attestationVerify(cert, alg, data, sig) {
	const key = cert.publicKey;
	const type = key.asymmetricKeyType;
	try {
		if (type === "ec") {
			const curve = key.asymmetricKeyDetails?.namedCurve;
			const hash = curve === "prime256v1" ? "sha256" : curve === "secp384r1" ? "sha384" : null;
			if (!hash || alg !== void 0 && alg !== -7 && alg !== -35) return false;
			return verify(hash, data, {
				key,
				dsaEncoding: "der"
			}, sig);
		}
		if (type === "ed25519") {
			if (alg !== void 0 && alg !== -8) return false;
			return verify(null, data, key, sig);
		}
	} catch {
		return false;
	}
	return false;
}
/**
* WebAuthn §8.2 packed attestation, basic (x5c) only: a recognized hardware
* security key model (by AAGUID) whose attestation chains to that model's
* pinned root, then the organization's allowlist, which only narrows.
*/
function verifyPackedAttestation(params) {
	const { stmt, policy } = params;
	if (stmt.x5c.length === 0) throw new WebAuthnError("attestation-missing", "the authenticator gave only self attestation; a basic attestation certificate is required");
	let leaf;
	try {
		leaf = new X509Certificate(Buffer.from(stmt.x5c[0]));
	} catch {
		throw new WebAuthnError("attestation-invalid", "attestation certificate does not parse");
	}
	const signed = Buffer.concat([params.authDataRaw, params.clientDataHash]);
	if (!attestationVerify(leaf, stmt.alg, signed, stmt.sig)) throw new WebAuthnError("attestation-invalid", "attestation signature does not verify");
	if (leaf.ca) throw new WebAuthnError("attestation-invalid", "attestation certificate is a CA certificate");
	if (!/(^|\n)OU=Authenticator Attestation(\n|$)/.test(leaf.subject)) throw new WebAuthnError("attestation-invalid", "attestation certificate subject lacks OU=Authenticator Attestation");
	const now = policy.now ?? Date.now();
	if (now < Date.parse(leaf.validFrom) || now > Date.parse(leaf.validTo)) throw new WebAuthnError("attestation-invalid", "attestation certificate is outside its validity");
	const extAaguid = certAaguid(stmt.x5c[0]);
	if (extAaguid !== null && extAaguid !== params.aaguid) throw new WebAuthnError("attestation-invalid", "certificate AAGUID differs from the authenticator's");
	if (params.aaguid === "00000000-0000-0000-0000-000000000000") throw new WebAuthnError("zero-aaguid", "the authenticator does not identify its model (zero AAGUID)");
	for (const der of stmt.x5c) {
		let c;
		try {
			c = new X509Certificate(Buffer.from(der));
		} catch {
			throw new WebAuthnError("attestation-invalid", "attestation certificate does not parse");
		}
		if (SOFTWARE_AUTHENTICATOR_ORG.test(c.subject) || SOFTWARE_AUTHENTICATOR_ORG.test(c.issuer)) throw new WebAuthnError("attestation-not-allowed", "this is a browser's virtual (software) authenticator, not a device-bound hardware key");
	}
	const model = (params.trust ?? pinnedPackedTrust()).models.get(params.aaguid);
	if (!model) throw new WebAuthnError("attestation-not-allowed", `authenticator model ${params.aaguid} is not a recognized hardware security key (packed attestation is accepted only from certified hardware keys of known vendors); software and virtual authenticators are not a second factor`);
	try {
		verifyChainToRoots(stmt.x5c, model.roots, now, `packed (${model.description})`);
	} catch (err) {
		throw new WebAuthnError("attestation-not-allowed", `the attestation does not chain to the certificate authority of ${model.description}: ${err instanceof Error ? err.message : String(err)}`);
	}
	let allowedAs = model.description;
	if (policy.allowedAuthenticators.length > 0) {
		const entry = policy.allowedAuthenticators.find((e) => e.aaguid.toLowerCase() === params.aaguid);
		if (!entry) throw new WebAuthnError("attestation-not-allowed", `authenticator model ${params.aaguid} is not on this deployment's allowlist`);
		if (!entry.attestationCas.some((pem) => {
			try {
				const ca = new X509Certificate(pem);
				return ca.ca && leaf.checkIssued(ca) && leaf.verify(ca.publicKey);
			} catch {
				return false;
			}
		})) throw new WebAuthnError("attestation-not-allowed", `the attestation certificate does not chain to the CA configured for ${entry.description ?? entry.aaguid}`);
		allowedAs = entry.description ?? entry.aaguid;
	}
	return {
		fmt: "packed",
		aaguid: params.aaguid,
		certSha256: Buffer.from(sha256(stmt.x5c[0])).toString("hex"),
		certSubject: leaf.subject.replace(/\n/g, ", "),
		certIssuer: leaf.issuer.replace(/\n/g, ", "),
		allowedAs
	};
}
/**
* A platform format's statement (attestation-platform.ts), then the rules
* shared with packed: a model that names itself (non-zero AAGUID) and, when
* the deployment keeps an allowlist, a listed model. The vendor root is the
* chain anchor; an allowlist entry's CAs, when given, must also issue the
* attestation certificate's chain.
*/
function verifyPlatformStatement(fmt, p) {
	if (p.aaguid === "00000000-0000-0000-0000-000000000000") throw new WebAuthnError("zero-aaguid", "the authenticator does not identify its model (zero AAGUID)");
	const now = p.policy.now ?? Date.now();
	const res = verifyPlatformAttestation(fmt, {
		...p,
		now
	});
	if (p.policy.allowedAuthenticators.length === 0) return res;
	const entry = p.policy.allowedAuthenticators.find((e) => e.aaguid.toLowerCase() === p.aaguid);
	if (!entry) throw new WebAuthnError("attestation-not-allowed", `authenticator model ${p.aaguid} is not on this deployment's allowlist`);
	if (entry.attestationCas.length > 0) {
		const certs = p.stmt.x5c.map((c) => new X509Certificate(Buffer.from(c)));
		if (!entry.attestationCas.some((pem) => {
			try {
				const ca = new X509Certificate(pem);
				return ca.ca && certs.some((c) => c.checkIssued(ca) && c.verify(ca.publicKey));
			} catch {
				return false;
			}
		})) throw new WebAuthnError("attestation-not-allowed", `the attestation does not chain to the CA configured for ${entry.description ?? entry.aaguid}`);
	}
	return {
		...res,
		allowedAs: entry.description ?? entry.aaguid
	};
}
/** Decode a WebAuthn attestationObject into its format, authenticator data and statement. */
function decodeAttestationObject(attestationObject) {
	let obj;
	try {
		obj = decodeCbor(attestationObject);
	} catch (err) {
		throw new WebAuthnError("attestation-format", `attestationObject: ${String(err)}`);
	}
	if (!(obj instanceof Map)) throw new WebAuthnError("attestation-format", "attestationObject is not a map");
	const fmt = obj.get("fmt");
	const authData = obj.get("authData");
	const att = obj.get("attStmt");
	if (typeof fmt !== "string" || !(authData instanceof Uint8Array) || !(att instanceof Map)) throw new WebAuthnError("attestation-format", "attestationObject lacks fmt/authData/attStmt");
	const sig = att.get("sig");
	const alg = att.get("alg");
	const x5c = att.get("x5c");
	const ver = att.get("ver");
	const certInfo = att.get("certInfo");
	const pubArea = att.get("pubArea");
	const certs = [];
	if (Array.isArray(x5c)) for (const c of x5c) {
		if (!(c instanceof Uint8Array)) throw new WebAuthnError("attestation-format", "x5c entries must be byte strings");
		certs.push(c);
	}
	return {
		fmt,
		authDataRaw: authData,
		stmt: {
			alg: typeof alg === "number" ? alg : void 0,
			sig: sig instanceof Uint8Array ? sig : new Uint8Array(),
			x5c: certs,
			...typeof ver === "string" ? { ver } : {},
			...certInfo instanceof Uint8Array ? { certInfo } : {},
			...pubArea instanceof Uint8Array ? { pubArea } : {}
		}
	};
}
/**
* Verify a registration (WebAuthn §7.1) under this deployment's rules. The
* caller supplies the client data hash it computed itself from the
* clientDataJSON it issued (see `verifyClientData`).
*/
function verifyRegistration(params) {
	const auth = parseAuthenticatorData(params.authDataRaw);
	checkRpAndFlags(auth, params.rpId);
	if (!auth.attested) throw new WebAuthnError("no-attested-credential", "registration carries no credential (AT=0)");
	if (params.credentialId && !equalBytes(params.credentialId, auth.attested.credentialId)) throw new WebAuthnError("credential-id-mismatch", "reported credential id differs from the attested one");
	const platform = PLATFORM_FORMATS.find((f) => f === params.fmt);
	if (params.fmt !== "packed" && !platform) throw new WebAuthnError(params.fmt === "none" ? "attestation-missing" : "attestation-format", `attestation format "${params.fmt}" is not accepted (packed with a certificate, tpm, apple or android-key only)`);
	const attestation = platform ? verifyPlatformStatement(platform, {
		authDataRaw: params.authDataRaw,
		clientDataHash: params.clientDataHash,
		aaguid: auth.attested.aaguid,
		credentialPublicKey: auth.attested.publicKey,
		stmt: params.stmt,
		policy: params.policy,
		roots: params.roots ?? pinnedVendorRoots()
	}) : verifyPackedAttestation({
		authDataRaw: params.authDataRaw,
		clientDataHash: params.clientDataHash,
		aaguid: auth.attested.aaguid,
		stmt: params.stmt,
		policy: params.policy,
		...params.packedTrust ? { trust: params.packedTrust } : {}
	});
	return {
		credentialId: auth.attested.credentialId,
		publicKey: auth.attested.publicKey,
		signCount: auth.signCount,
		aaguid: auth.attested.aaguid,
		attestation
	};
}
/**
* Does the stored registration evidence prove, for THIS credential, a key generated in and fixed
* to a TPM (a "tpm" statement chained to the pinned Microsoft TPM root, fixedTPM, fixedParent,
* sensitiveDataOrigin, attested name over the public area)? Re-verified at its enrollment time
* on every use, so a store edited to claim the exemption without that statement gets the strict
* counter rule's refusal. False on anything else.
*/
function tpmCounterExemptionHolds(p) {
	if (!p.evidence) return false;
	try {
		const att = decodeAttestationObject(fromB64url(p.evidence.attestationObject));
		if (att.fmt !== "tpm") return false;
		const reg = verifyRegistration({
			rpId: p.rpId,
			clientDataHash: fromB64url(p.evidence.clientDataHash),
			fmt: att.fmt,
			authDataRaw: att.authDataRaw,
			stmt: att.stmt,
			credentialId: p.credentialId,
			policy: {
				allowedAuthenticators: [],
				now: p.enrolledAt
			},
			...p.roots ? { roots: p.roots } : {}
		});
		return reg.attestation.fmt === "tpm" && Buffer.from(reg.publicKey.cose).equals(Buffer.from(p.publicKeyCose));
	} catch {
		return false;
	}
}
/**
* Does the stored packed registration still prove, for THIS credential, a
* recognized hardware security key whose attestation chains to that model's
* pinned root (verified as at its enrollment time)? False when there is no
* evidence (an enrollment from before Enclawed 2.0.3 kept none), when it was
* a software or virtual authenticator, or when the store was edited.
*/
function packedEnrollmentHolds(p) {
	if (!p.evidence) return false;
	try {
		const reg = verifyRegistration({
			rpId: p.rpId,
			clientDataHash: fromB64url(p.evidence.clientDataHash),
			fmt: "packed",
			authDataRaw: fromB64url(p.evidence.authData),
			stmt: {
				sig: fromB64url(p.evidence.sig),
				x5c: p.evidence.x5c.map(fromB64url),
				...typeof p.evidence.alg === "number" ? { alg: p.evidence.alg } : {}
			},
			credentialId: p.credentialId,
			policy: {
				allowedAuthenticators: [],
				now: p.enrolledAt
			},
			...p.packedTrust ? { packedTrust: p.packedTrust } : {}
		});
		return reg.attestation.fmt === "packed" && Buffer.from(reg.publicKey.cose).equals(Buffer.from(p.publicKeyCose));
	} catch {
		return false;
	}
}
/**
* Everything in an assertion check except the counter: rpIdHash, UP and UV,
* not backup-eligible, no attested data, and the signature over
* authData || clientDataHash. Used on its own only to re-check an assertion
* whose counter was already accepted once (a signed unlock ticket).
*/
function verifySignedAssertion(params) {
	const auth = parseAuthenticatorData(params.authDataRaw);
	checkRpAndFlags(auth, params.rpId);
	if (auth.attested) throw new WebAuthnError("bad-authdata", "an assertion must not carry attested credential data");
	if (!verifyWithCredentialKey(coseToPublicKey(params.credentialPublicKey), Buffer.concat([params.authDataRaw, params.clientDataHash]), params.signature)) throw new WebAuthnError("bad-signature", "assertion signature does not verify");
	return auth;
}
/**
* Verify an assertion (WebAuthn §7.2) under this deployment's rules: rpIdHash,
* UP and UV, not backup-eligible, the signature over authData || clientDataHash,
* and a strictly increasing signature counter.
*/
function verifyAssertion(params) {
	const auth = verifySignedAssertion(params);
	if (params.counterPolicy === "tpm-non-exportable" && auth.signCount === 0 && params.storedSignCount === 0) return {
		signCount: 0,
		flags: auth.flags
	};
	if (auth.signCount === 0 && params.storedSignCount === 0) throw new WebAuthnError("counter-unsupported", "the authenticator does not keep a signature counter; clone detection needs one");
	if (auth.signCount <= params.storedSignCount) throw new WebAuthnError("counter-regressed", `signature counter ${auth.signCount} did not increase past ${params.storedSignCount}: possible cloned authenticator or replay`);
	return {
		signCount: auth.signCount,
		flags: auth.flags
	};
}
//#endregion
//#region src/enclawed/auth/ticket.ts
/**
* The longest a ticket may last, and the most uses it may carry: one person's
* authorization covers up to 36 h and 65535 launches (the device unlock
* grant's own limits, a 16-bit use count; with an Enclaweder bound the grant
* is bound to this ticket and the DEVICE counts the uses). An administrator
* may lower them (auth config); the defaults stay 10 minutes and 1 use.
*/
const TICKET_HARD_MAX_MINUTES = 2160;
/** Nanoseconds on the system-wide monotonic clock (Linux CLOCK_MONOTONIC, macOS mach time). */
function monotonicNow() {
	return process.hrtime.bigint();
}
const TICKET_MAX_USES = 65535;
function readTrim(file) {
	try {
		return fs.readFileSync(file, "utf8").trim() || null;
	} catch {
		return null;
	}
}
function run(cmd, args) {
	try {
		return execFileSync(cmd, args, {
			encoding: "utf8",
			timeout: 5e3,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		}).trim() || null;
	} catch {
		return null;
	}
}
/** This boot's identity, or null when the platform offers none (then no ticket can be bound). */
function currentBootId(platform = process.platform) {
	if (platform === "linux") return readTrim("/proc/sys/kernel/random/boot_id");
	if (platform === "darwin") return run("/usr/sbin/sysctl", ["-n", "kern.bootsessionuuid"]);
	return null;
}
function currentMachineId(platform = process.platform) {
	if (platform === "linux") return readTrim("/etc/machine-id") ?? readTrim("/var/lib/dbus/machine-id");
	if (platform === "darwin") {
		const out = run("/usr/sbin/ioreg", [
			"-rd1",
			"-c",
			"IOPlatformExpertDevice"
		]);
		const m = out ? /"IOPlatformUUID" = "([^"]+)"/.exec(out) : null;
		return m ? m[1] : null;
	}
	return null;
}
function currentBinding() {
	const bootId = currentBootId();
	if (!bootId) return null;
	return {
		uid: typeof process.getuid === "function" ? process.getuid() : null,
		hostname: os.hostname(),
		machineId: currentMachineId(),
		bootId
	};
}
function ticketFile(dir) {
	return path.join(dir, "unlock-ticket.json");
}
function usesFile(dir) {
	return path.join(dir, "unlock-ticket.used");
}
/** Resolve the lifetime: requested (or the configured default) within the configured maximum. */
function ticketMinutes(params) {
	const minutes = params.requested ?? params.configuredDefault;
	if (!Number.isInteger(minutes) || minutes < 1) throw new Error("unlock minutes must be a whole number of at least 1");
	if (minutes > params.configuredMax || minutes > 2160) throw new Error(`unlock minutes may not exceed ${Math.min(params.configuredMax, TICKET_HARD_MAX_MINUTES)} on this deployment`);
	return minutes;
}
/** Canonical bytes of a ticket body (fixed key order), whose SHA-256 is the WebAuthn challenge. */
function canonicalTicketBody(b) {
	const ordered = {
		v: b.v,
		rpId: b.rpId,
		scope: b.scope,
		nonce: b.nonce,
		uid: b.uid,
		hostname: b.hostname,
		machineId: b.machineId,
		bootId: b.bootId,
		issuedAt: b.issuedAt,
		expiresAt: b.expiresAt,
		issuedAtMono: b.issuedAtMono,
		expiresAtMono: b.expiresAtMono,
		uses: b.uses,
		credential: b.credential,
		credentialId: b.credentialId
	};
	return new TextEncoder().encode(JSON.stringify(ordered));
}
/** SHA-256 (hex) of a ticket body's canonical bytes: what a device unlock grant is bound to. */
function ticketDigest(b) {
	return Buffer.from(sha256(canonicalTicketBody(b))).toString("hex");
}
function ticketChallenge(b) {
	return sha256(canonicalTicketBody(b));
}
function newTicketBody(params) {
	if (params.minutes > 2160) throw new Error(`a ticket may not outlive ${TICKET_HARD_MAX_MINUTES} minutes`);
	if (!Number.isInteger(params.uses) || params.uses < 1 || params.uses > 65535) throw new Error(`ticket uses must be between 1 and ${TICKET_MAX_USES}`);
	return {
		v: 2,
		rpId: params.rpId,
		scope: "session-start",
		nonce: randomBytes(16).toString("hex"),
		...params.binding,
		issuedAt: params.now,
		expiresAt: params.now + params.minutes * 6e4,
		issuedAtMono: (params.mono ?? monotonicNow()).toString(),
		expiresAtMono: ((params.mono ?? monotonicNow()) + BigInt(params.minutes) * 60000000000n).toString(),
		uses: params.uses,
		credential: params.credential.id,
		credentialId: params.credential.credentialId
	};
}
function writeSignedTicket(dir, t) {
	const file = {
		body: t.body,
		clientDataJSON: b64url(t.clientDataJSON),
		authenticatorData: b64url(t.authDataRaw),
		signature: b64url(t.signature)
	};
	fs.rmSync(usesFile(dir), { force: true });
	writePrivateJson(ticketFile(dir), file);
}
function readUsed(dir) {
	const v = Number.parseInt(readTrim(usesFile(dir)) ?? "0", 10);
	return Number.isInteger(v) && v >= 0 ? v : Number.MAX_SAFE_INTEGER;
}
/** The origin a passkey's client data names, when it is a loopback page's; otherwise a refusal. */
function loopbackOriginOf(clientDataJSON) {
	let origin;
	try {
		origin = JSON.parse(Buffer.from(clientDataJSON).toString("utf8")).origin;
	} catch {
		throw new WebAuthnError("bad-client-data", "clientDataJSON is not JSON");
	}
	if (typeof origin !== "string" || !isLoopbackOrigin(origin)) throw new WebAuthnError("origin-mismatch", "a passkey ticket must come from a loopback page");
	return origin;
}
/** Verify a ticket's signature with the enrolled key it names. Throws WebAuthnError / Error. */
function verifyTicketSignature(t, params) {
	const b = t.body;
	if (b?.v !== 2 || b.scope !== "session-start" || b.rpId !== params.rpId) throw new WebAuthnError("bad-client-data", "not a session-start ticket for this relying party");
	const cred = params.credentials.find((c) => c.id === b.credential && c.credentialId === b.credentialId);
	if (!cred) throw new Error("unknown-key");
	const passkey = credentialKind(cred) === "passkey";
	const clientDataJSON = fromB64url(t.clientDataJSON);
	const clientDataHash = verifyClientData(clientDataJSON, {
		type: "webauthn.get",
		challenge: ticketChallenge(b),
		origin: passkey ? loopbackOriginOf(clientDataJSON) : params.origin
	});
	verifySignedAssertion({
		rpId: passkey ? PASSKEY_RP_ID : params.rpId,
		clientDataHash,
		authDataRaw: fromB64url(t.authenticatorData),
		signature: fromB64url(t.signature),
		credentialPublicKey: fromB64url(cred.publicKeyCose)
	});
	return cred;
}
/**
* Check the ticket and spend one use. Must run under the auth lock. Returns
* the ticket, or the refusal reason. An expired, spent, forged or
* wrong-boot ticket is deleted.
*/
function consumeTicket(params) {
	const file = ticketFile(params.dir);
	const drop = (reason) => {
		fs.rmSync(file, { force: true });
		fs.rmSync(usesFile(params.dir), { force: true });
		return {
			ok: false,
			reason
		};
	};
	let t;
	try {
		t = JSON.parse(fs.readFileSync(file, "utf8"));
	} catch (err) {
		return err.code === "ENOENT" ? {
			ok: false,
			reason: "no-ticket"
		} : drop("malformed");
	}
	if (!params.binding) return {
		ok: false,
		reason: "unbindable-platform"
	};
	try {
		verifyTicketSignature(t, params);
	} catch (err) {
		return drop(err instanceof Error && err.message === "unknown-key" ? "unknown-key" : "bad-signature");
	}
	const b = t.body;
	let issuedMono;
	let expiresMono;
	try {
		issuedMono = BigInt(b.issuedAtMono);
		expiresMono = BigInt(b.expiresAtMono);
	} catch {
		return drop("malformed");
	}
	if (typeof b.expiresAt !== "number" || typeof b.issuedAt !== "number" || !Number.isInteger(b.uses) || b.uses < 1 || b.uses > 65535 || b.expiresAt - b.issuedAt > 2160 * 6e4 || expiresMono - issuedMono > BigInt(2160) * 60000000000n) return drop("malformed");
	if (b.bootId !== params.binding.bootId) return drop("wrong-boot");
	const mono = params.mono ?? monotonicNow();
	if (!(mono < expiresMono) || !(params.now < b.expiresAt)) return drop("expired");
	if (mono < issuedMono || params.now < b.issuedAt - 6e4) return drop("not-yet-valid");
	if (b.uid !== params.binding.uid) return {
		ok: false,
		reason: "wrong-uid"
	};
	if (b.hostname !== params.binding.hostname || b.machineId !== params.binding.machineId) return {
		ok: false,
		reason: "wrong-host"
	};
	const used = readUsed(params.dir);
	if (used >= b.uses) return drop("spent");
	if (used + 1 >= b.uses) drop("spent");
	else fs.writeFileSync(usesFile(params.dir), `${used + 1}\n`, { mode: 384 });
	return {
		ok: true,
		ticket: {
			...b,
			usesLeft: b.uses - used - 1
		}
	};
}
function readTicket(dir) {
	try {
		const t = JSON.parse(fs.readFileSync(ticketFile(dir), "utf8"));
		return {
			...t.body,
			usesLeft: Math.max(0, t.body.uses - readUsed(dir))
		};
	} catch {
		return null;
	}
}
/** Does the ticket on disk carry a valid signature by an enrolled key? */
function ticketSignatureValid(dir, params) {
	try {
		verifyTicketSignature(JSON.parse(fs.readFileSync(ticketFile(dir), "utf8")), params);
		return true;
	} catch {
		return false;
	}
}
function revokeTicket(dir) {
	const file = ticketFile(dir);
	const had = fs.existsSync(file);
	fs.rmSync(file, { force: true });
	fs.rmSync(usesFile(dir), { force: true });
	return had;
}
//#endregion
//#region src/enclawed/auth/config.ts
var AuthConfigError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "AuthConfigError";
	}
};
function defaultAuthConfig() {
	return {
		unlockMinutes: 10,
		maxUnlockMinutes: TICKET_HARD_MAX_MINUTES,
		allowedAuthenticators: []
	};
}
const AAGUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function minutes(v, key, max) {
	if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > max) throw new AuthConfigError(`enclawed.auth.${key} must be a whole number from 1 to ${max}`);
	return v;
}
function loadPem(entry, where) {
	if (typeof entry !== "string" || entry.trim() === "") throw new AuthConfigError(`${where} must be PEM text or an absolute path to a PEM file`);
	if (entry.includes("-----BEGIN CERTIFICATE-----")) return entry;
	if (!path.isAbsolute(entry)) throw new AuthConfigError(`${where}: ${entry} is not an absolute path`);
	try {
		return fs.readFileSync(entry, "utf8");
	} catch (err) {
		throw new AuthConfigError(`${where}: cannot read ${entry}: ${String(err)}`);
	}
}
/** Parse the `enclawed.auth` block (undefined = defaults). Throws AuthConfigError. */
function parseAuthConfig(block) {
	const cfg = defaultAuthConfig();
	if (block === void 0 || block === null) return cfg;
	if (typeof block !== "object" || Array.isArray(block)) throw new AuthConfigError("enclawed.auth must be an object");
	const b = block;
	for (const key of Object.keys(b)) if (![
		"unlockMinutes",
		"maxUnlockMinutes",
		"allowedAuthenticators"
	].includes(key)) throw new AuthConfigError(`enclawed.auth.${key} is not a recognized setting`);
	if (b.maxUnlockMinutes !== void 0) cfg.maxUnlockMinutes = minutes(b.maxUnlockMinutes, "maxUnlockMinutes", TICKET_HARD_MAX_MINUTES);
	if (b.unlockMinutes !== void 0) cfg.unlockMinutes = minutes(b.unlockMinutes, "unlockMinutes", cfg.maxUnlockMinutes);
	else cfg.unlockMinutes = Math.min(cfg.unlockMinutes, cfg.maxUnlockMinutes);
	if (b.allowedAuthenticators !== void 0) {
		if (!Array.isArray(b.allowedAuthenticators)) throw new AuthConfigError("enclawed.auth.allowedAuthenticators must be an array");
		cfg.allowedAuthenticators = b.allowedAuthenticators.map((raw, i) => {
			const where = `enclawed.auth.allowedAuthenticators[${i}]`;
			if (!raw || typeof raw !== "object") throw new AuthConfigError(`${where} must be an object`);
			const e = raw;
			const aaguid = typeof e.aaguid === "string" ? e.aaguid.toLowerCase() : "";
			if (!AAGUID_RE.test(aaguid)) throw new AuthConfigError(`${where}.aaguid must be a UUID`);
			if (!Array.isArray(e.attestationCas) || e.attestationCas.length === 0) throw new AuthConfigError(`${where}.attestationCas must list the CA certificate(s) that issue this model's attestation`);
			return {
				aaguid,
				description: typeof e.description === "string" ? e.description : void 0,
				attestationCas: e.attestationCas.map((c, j) => loadPem(c, `${where}.attestationCas[${j}]`))
			};
		});
	}
	return cfg;
}
/** Read `enclawed.auth` from the resolved enclawed config file. A missing file means defaults. */
function loadAuthConfig(env = process.env) {
	let doc;
	try {
		const { path: configPath } = resolveDefaultConfigPath({ env });
		let raw;
		try {
			raw = fs.readFileSync(configPath, "utf8");
		} catch {
			return defaultAuthConfig();
		}
		doc = JSON.parse(raw);
	} catch (err) {
		throw new AuthConfigError(`cannot read the enclawed config: ${String(err)}`);
	}
	return parseAuthConfig(doc && typeof doc === "object" ? doc.enclawed?.auth : void 0);
}
//#endregion
//#region src/enclawed/auth/libfido2.ts
var TransportError = class extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "TransportError";
	}
};
const SYSTEM_DIRS = process.platform === "win32" ? [] : [
	"/usr/bin",
	"/usr/local/bin",
	"/opt/homebrew/bin",
	"/opt/local/bin"
];
function findTool(name, env = process.env) {
	const exe = process.platform === "win32" ? `${name}.exe` : name;
	const dirs = [...SYSTEM_DIRS, ...(env.PATH ?? "").split(path.delimiter).filter(Boolean)];
	for (const dir of dirs) {
		const p = path.join(dir, exe);
		try {
			fs.accessSync(p, fs.constants.X_OK);
			if (fs.statSync(p).isFile()) return p;
		} catch {}
	}
	return null;
}
const INSTALL_HINT = "install libfido2's tools: Debian/Ubuntu `sudo apt install fido2-tools`, Fedora `sudo dnf install fido2-tools`, macOS `brew install libfido2`, Windows: Yubico's libfido2 release (https://developers.yubico.com/libfido2/Releases/)";
function b64(text, what) {
	const t = text.trim();
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(t)) throw new TransportError("bad-output", `libfido2 printed a malformed ${what}`);
	return new Uint8Array(Buffer.from(t, "base64"));
}
/** Parse `fido2-token -L`: "<path>: vendor=..., product=... (<description>)". */
function parseDeviceList(stdout) {
	const out = [];
	for (const line of stdout.split(/\r?\n/)) {
		const at = line.indexOf(": ");
		if (at <= 0) continue;
		out.push({
			path: line.slice(0, at),
			description: line.slice(at + 2).trim()
		});
	}
	return out;
}
/** Parse `fido2-token -I <dev>` (CTAP authenticatorGetInfo, as libfido2 prints it). */
function parseDeviceInfo(stdout) {
	const options = /* @__PURE__ */ new Map();
	let aaguid = null;
	let algorithms = [];
	let versions = [];
	for (const line of stdout.split(/\r?\n/)) {
		const at = line.indexOf(":");
		if (at < 0) continue;
		const key = line.slice(0, at).trim();
		const value = line.slice(at + 1).trim();
		if (key === "options") for (const raw of value.split(",")) {
			const opt = raw.trim();
			if (!opt) continue;
			if (opt.startsWith("no") && opt.length > 2) options.set(opt.slice(2), false);
			else options.set(opt, true);
		}
		else if (key === "aaguid") aaguid = value.toLowerCase();
		else if (key === "algorithms") algorithms = value.split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
		else if (key === "version strings") versions = value.split(",").map((s) => s.trim()).filter(Boolean);
	}
	return {
		options,
		aaguid,
		algorithms,
		versions
	};
}
/** Why a device is refused before any ceremony, or null when it may be used. */
function deviceRefusal(dev) {
	if (/^windows:\/\//i.test(dev.path)) return {
		code: "platform-authenticator",
		message: "the Windows WebAuthn route (windows://hello) can answer with Windows Hello, whose key lives in this computer; use a security key over raw HID (run elevated, or from WSL with usbipd)"
	};
	if (dev.options.get("plat") === true) return {
		code: "platform-authenticator",
		message: `${dev.path} is a platform authenticator`
	};
	if (!dev.versions.some((v) => v.startsWith("FIDO_2"))) return {
		code: "no-user-verification",
		message: `${dev.path} is U2F-only and cannot verify a PIN`
	};
	if (dev.options.get("clientPin") !== true && dev.options.get("uv") !== true) return {
		code: "no-user-verification",
		message: `${dev.path} has no PIN set and no built-in user verification; set a PIN first: fido2-token -S ${dev.path}`
	};
	return null;
}
function uvModeFor(dev) {
	return dev.options.get("clientPin") === true ? "pin" : "builtin";
}
function createLibfido2Transport(opts = {}) {
	const env = opts.env ?? process.env;
	const run = opts.run ?? ((cmd, args, o) => spawnSync(cmd, args, {
		...o,
		encoding: "utf8"
	}));
	const timeout = opts.timeoutMs ?? 12e4;
	const tool = (name) => {
		const p = findTool(name, env);
		if (!p) throw new TransportError("tools-missing", `${name} was not found; ${INSTALL_HINT}`);
		return p;
	};
	const ceremony = (cmd, args, input) => {
		const r = run(tool(cmd), args, {
			input,
			stdio: [
				"pipe",
				"pipe",
				"inherit"
			],
			timeout
		});
		if (r.status !== 0) throw new TransportError("ceremony-failed", `${cmd} did not complete (exit ${String(r.status ?? r.signal)})`);
		return r.stdout ?? "";
	};
	return {
		listDevices() {
			const r = run(tool("fido2-token"), ["-L"], {
				stdio: [
					"ignore",
					"pipe",
					"pipe"
				],
				timeout: 15e3
			});
			if (r.status !== 0) return [];
			return parseDeviceList(r.stdout ?? "").map((d) => {
				if (/^windows:\/\//i.test(d.path)) return {
					...d,
					options: /* @__PURE__ */ new Map(),
					aaguid: null,
					algorithms: [],
					versions: []
				};
				const i = run(tool("fido2-token"), ["-I", d.path], {
					stdio: [
						"ignore",
						"pipe",
						"pipe"
					],
					timeout: 15e3
				});
				return {
					...d,
					...parseDeviceInfo(i.status === 0 ? i.stdout ?? "" : "")
				};
			});
		},
		makeCredential(p) {
			const refusal = deviceRefusal(p.device);
			if (refusal) throw new TransportError(refusal.code, refusal.message);
			if (!p.device.algorithms.includes(p.alg)) throw new TransportError("unsupported-algorithm", `${p.device.path} does not offer ${p.alg}`);
			const input = [
				Buffer.from(p.clientDataHash).toString("base64"),
				p.rpId,
				p.userName,
				Buffer.from(p.userId).toString("base64"),
				""
			].join("\n");
			const out = ceremony("fido2-cred", [
				"-M",
				"-v",
				p.device.path,
				p.alg
			], input).split(/\r?\n/);
			if (out.length < 6) throw new TransportError("bad-output", "fido2-cred printed too few lines");
			return {
				clientDataHash: b64(out[0], "client data hash"),
				rpId: out[1].trim(),
				fmt: out[2].trim(),
				authDataCbor: b64(out[3], "authenticator data"),
				credentialId: b64(out[4], "credential id"),
				sig: b64(out[5], "attestation signature"),
				x5c: out[6]?.trim() ? [b64(out[6], "attestation certificate")] : []
			};
		},
		hasCredential(p) {
			if (deviceRefusal(p.device)) return false;
			const input = [
				Buffer.from(new Uint8Array(32)).toString("base64"),
				p.rpId,
				Buffer.from(p.credentialId).toString("base64"),
				""
			].join("\n");
			return run(tool("fido2-assert"), [
				"-G",
				"-t",
				"up=false",
				"-t",
				"uv=false",
				p.device.path
			], {
				input,
				stdio: [
					"pipe",
					"pipe",
					"ignore"
				],
				timeout: 15e3
			}).status === 0;
		},
		getAssertion(p) {
			const refusal = deviceRefusal(p.device);
			if (refusal) throw new TransportError(refusal.code, refusal.message);
			const input = [
				Buffer.from(p.clientDataHash).toString("base64"),
				p.rpId,
				Buffer.from(p.credentialId).toString("base64"),
				""
			].join("\n");
			const out = ceremony("fido2-assert", [
				"-G",
				"-t",
				"up=true",
				...uvModeFor(p.device) === "pin" ? ["-t", "pin=true"] : ["-t", "uv=true"],
				p.device.path
			], input).split(/\r?\n/);
			if (out.length < 4) throw new TransportError("bad-output", "fido2-assert printed too few lines");
			return {
				clientDataHash: b64(out[0], "client data hash"),
				rpId: out[1].trim(),
				authDataCbor: b64(out[2], "authenticator data"),
				sig: b64(out[3], "assertion signature")
			};
		}
	};
}
//#endregion
//#region src/enclawed/auth/browser-open.ts
const BINFMT = "/proc/sys/fs/binfmt_misc";
/**
* Whether WSL's Windows interop is registered with the kernel: "on" when a
* WSLInterop binfmt entry is enabled, "off" when binfmt_misc is mounted and
* readable but no enabled entry exists (or binfmt_misc is disabled as a
* whole), "unknown" when binfmt_misc cannot be read at all. Without it,
* exec of a Windows .exe fails (ENOEXEC) and the C library's fallback hands
* the file to /bin/sh, which exits with an error: nothing Windows-side runs.
*/
function detectWslInterop(read = readFileOrNull) {
	const status = read(`${BINFMT}/status`)?.trim();
	if (status === void 0) return "unknown";
	if (status === "disabled") return "off";
	for (const name of ["WSLInterop", "WSLInterop-late"]) if (read(`${BINFMT}/${name}`)?.split("\n")[0]?.trim() === "enabled") return "on";
	return "off";
}
function readFileOrNull(p) {
	try {
		return fs.readFileSync(p, "utf8");
	} catch {
		return null;
	}
}
function onPathDefault(cmd, env) {
	for (const dir of (env.PATH ?? "").split(path.delimiter)) {
		if (!dir) continue;
		try {
			fs.accessSync(path.join(dir, cmd), fs.constants.X_OK);
			return true;
		} catch {}
	}
	return false;
}
function detectBrowserHost(deps = {}) {
	const platform = deps.platform ?? process.platform;
	const env = deps.env ?? process.env;
	if (platform === "linux") {
		const read = deps.readFile ?? readFileOrNull;
		const version = read("/proc/sys/kernel/osrelease") ?? read("/proc/version") ?? "";
		if (env.WSL_DISTRO_NAME || /microsoft|wsl/i.test(version)) return "wsl";
		return "linux";
	}
	if (platform === "darwin" || platform === "win32") return platform;
	return "other";
}
/** Only our own page URLs are handed to a shell-like opener: no character a shell would read. */
const SAFE_URL = /^http:\/\/localhost:[0-9]{1,5}\/[A-Za-z0-9_-]+$/;
/** The command that opens `url` in the person's browser on this host, or null when none is known. */
function browserCommand(host, url, onPath) {
	if (!SAFE_URL.test(url)) return null;
	switch (host) {
		case "darwin": return {
			cmd: "open",
			args: [url]
		};
		case "linux": return onPath("xdg-open") ? {
			cmd: "xdg-open",
			args: [url]
		} : null;
		case "win32": return {
			cmd: "cmd.exe",
			args: [
				"/d",
				"/c",
				"start",
				"\"\"",
				url
			]
		};
		case "wsl":
			if (onPath("wslview")) return {
				cmd: "wslview",
				args: [url]
			};
			return onPath("cmd.exe") ? {
				cmd: "cmd.exe",
				args: [
					"/d",
					"/c",
					"start",
					"\"\"",
					url
				],
				cwd: "/mnt/c"
			} : null;
		default: return null;
	}
}
function spawnDetachedDefault(cmd, args, cwd) {
	try {
		const child = spawn(cmd, args, {
			detached: true,
			stdio: "ignore",
			...cwd && fs.existsSync(cwd) ? { cwd } : {}
		});
		child.on("error", () => {});
		child.unref();
		return true;
	} catch {
		return false;
	}
}
/** Open `url`; returns how, or null when no opener is available (the caller prints the URL). */
function openBrowser(url, deps = {}) {
	const env = deps.env ?? process.env;
	const host = detectBrowserHost(deps);
	if (host === "wsl" && (deps.interop ?? (() => detectWslInterop(deps.readFile)))() === "off") return null;
	const c = browserCommand(host, url, deps.onPath ?? ((cmd) => onPathDefault(cmd, env)));
	if (!c) return null;
	return (deps.spawnDetached ?? spawnDetachedDefault)(c.cmd, c.args, c.cwd) ? c.cmd : null;
}
function runDefault(cmd, args, timeoutMs, cwd) {
	const r = spawnSync(cmd, args, {
		encoding: "utf8",
		timeout: timeoutMs,
		stdio: [
			"ignore",
			"pipe",
			"ignore"
		],
		...cwd && fs.existsSync(cwd) ? { cwd } : {}
	});
	return r.status === 0 ? r.stdout : null;
}
/**
* Under WSL: can a Windows program connect to localhost:<port>? A TCP
* connect from Windows PowerShell answers "reachable" when localhost
* forwarding (or mirrored networking) carries it into this WSL instance,
* "unreachable" when it does not, "unknown" when the check cannot run or
* says nothing clear (Windows interop off, PowerShell missing, slow or
* answering something else). Only "unreachable" is evidence the page cannot
* load; "unknown" is no evidence either way.
*/
function probeWslLocalhost(port, deps = {}) {
	if (!Number.isInteger(port) || port < 1 || port > 65535) return "unknown";
	if ((deps.interop ?? (() => detectWslInterop(deps.readFile)))() === "off") return "unknown";
	const word = (deps.run ?? runDefault)("powershell.exe", [
		"-NoProfile",
		"-NonInteractive",
		"-Command",
		`\$c = New-Object System.Net.Sockets.TcpClient; try { $c.Connect('localhost', ${port}); 'reachable' } catch { 'unreachable' } finally { $c.Close() }`
	], 15e3, "/mnt/c")?.trim().split(/\s+/).pop();
	return word === "reachable" || word === "unreachable" ? word : "unknown";
}
const WSL_FORWARDING_HELP = [
	"The Windows browser cannot reach this WSL instance's localhost, so the passkey page cannot open there.",
	"Turn WSL localhost forwarding on: in %UserProfile%\\.wslconfig put",
	"  [wsl2]",
	"  localhostForwarding=true",
	"(or networkingMode=mirrored), run \"wsl --shutdown\" from Windows, reopen the WSL terminal and try again."
].join("\n");
//#endregion
//#region src/enclawed/auth/passkey.ts
/** The ceremony cannot run on this computer (no browser can reach the page). */
var PasskeyUnavailableError = class extends Error {
	constructor(message) {
		super(message);
		this.code = "passkey-unavailable";
		this.name = "PasskeyUnavailableError";
	}
};
function loopbackPasskeyCeremony(opts = { timeoutMs: 12e4 }) {
	return async (req, say) => {
		const server = await startLoopbackCeremony(req, { timeoutMs: opts.timeoutMs });
		try {
			if (detectBrowserHost(opts.deps) === "wsl") {
				if (probeWslLocalhost(server.port, opts.deps) === "unreachable") throw new PasskeyUnavailableError(WSL_FORWARDING_HELP);
			}
			say(openBrowser(server.url, opts.deps) ? `Your browser opens a page for the passkey. If it did not, open: ${server.url}` : `Open this page in your browser to use your passkey: ${server.url}`);
			return await server.result;
		} catch (err) {
			server.close();
			throw err;
		}
	};
}
//#endregion
//#region src/enclawed/auth/tty.ts
function readLineFromTty(prompt) {
	let fd;
	try {
		fd = fs.openSync("/dev/tty", "r+");
	} catch {
		return Promise.reject(/* @__PURE__ */ new Error("there is no terminal to ask on"));
	}
	const input = new tty.ReadStream(fd);
	fs.writeSync(fd, prompt);
	return new Promise((resolve, reject) => {
		let buf = "";
		input.setRawMode(true);
		const finish = (fn) => {
			input.setRawMode(false);
			input.removeAllListeners("data");
			input.destroy();
			try {
				fs.writeSync(fd, "\n");
			} catch {}
			fn();
		};
		input.on("data", (d) => {
			for (const ch of d.toString("utf8")) {
				if (ch === "\r" || ch === "\n") {
					finish(() => resolve(buf));
					return;
				}
				if (ch === "" || ch === "") {
					finish(() => reject(/* @__PURE__ */ new Error("cancelled")));
					return;
				}
				if (ch === "" || ch === "\b") buf = buf.slice(0, -1);
				else if (buf.length < 64) buf += ch;
			}
		});
	});
}
//#endregion
//#region src/enclawed/auth/gate.ts
const DEFAULT_RP_ID = "enclawed.local";
const FREE_FAILURES = 5;
const MAX_LOCKOUT_MS = 36e5;
var SecondFactorError = class extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "SecondFactorError";
	}
};
const ENROLL_INSTRUCTIONS = [
	"Enclawed requires two-factor authentication, and no second factor is enrolled on this install.",
	"Enroll a FIDO2 security key with a PIN (for example a YubiKey 5 or a Google Titan key):",
	"  1. install libfido2's tools (" + INSTALL_HINT + ")",
	"  2. set a PIN on the key if it has none: fido2-token -S <device from fido2-token -L>",
	"  3. enclawed auth enroll --label primary",
	"  4. enroll a second key as a backup: enclawed auth enroll --label backup",
	"Or enroll this computer's device-bound passkey (Windows Hello with a TPM, or Apple's or Android's secure hardware):",
	"  enclawed auth enroll --passkey --label laptop",
	"See docs/security/two-factor.md."
].join("\n");
function isInteractiveDefault() {
	return process.stdin.isTTY && process.stderr.isTTY;
}
function defaultAudit() {
	return async (event) => {
		const runtime = getRuntime();
		if (!runtime) throw new SecondFactorError("audit-unavailable", "the enclawed audit log is not open");
		await runtime.audit.append({
			type: event.type,
			actor: "operator",
			level: null,
			payload: event.payload
		});
	};
}
function resolve$1(ctx) {
	const env = ctx.env ?? process.env;
	const rpId = ctx.rpId ?? "enclawed.local";
	return {
		env,
		dir: authStateDir(env, ctx.stateDir),
		rpId,
		origin: `enclawed-cli://${rpId}`,
		transport: ctx.transport ?? createLibfido2Transport({ env }),
		passkey: ctx.passkey ?? loopbackPasskeyCeremony({ timeoutMs: 12e4 }),
		audit: ctx.audit ?? defaultAudit(),
		now: ctx.now ?? Date.now,
		interactive: ctx.interactive ?? isInteractiveDefault(),
		deviceFactor: ctx.deviceFactor ?? null,
		readCode: ctx.readCode ?? readLineFromTty,
		say: ctx.say ?? ((line) => process.stderr.write(`${line}\n`)),
		lockWaitMs: ctx.lockWaitMs,
		packedTrust: ctx.packedTrust,
		config: () => {
			try {
				return ctx.config ?? loadAuthConfig(env);
			} catch (err) {
				throw new SecondFactorError("config-invalid", `enclawed.auth is invalid (${err instanceof AuthConfigError ? err.message : String(err)}); fix it before anything gated can run`);
			}
		}
	};
}
function credentialRef(c) {
	return {
		credential: c.id,
		label: c.label,
		aaguid: c.aaguid,
		kind: credentialKind(c)
	};
}
/**
* Why an enrolled credential is not a second factor, or null when it is. A
* "packed" enrollment counts only while its stored registration still proves
* a recognized hardware security key (packedEnrollmentHolds): a software or
* virtual authenticator, an enrollment from before Enclawed 2.0.3 (which kept
* no attestation to verify again) or an edited store is refused at use.
*/
function factorRefusal(c, o) {
	if (c.role !== void 0) return `${c.id} (${c.label}) is a device-unlock ticket signer, not a second factor`;
	if (c.attestation.fmt !== "packed") return null;
	if (packedEnrollmentHolds({
		rpId: credentialKind(c) === "passkey" ? "localhost" : o.rpId,
		credentialId: fromB64url(c.credentialId),
		publicKeyCose: fromB64url(c.publicKeyCose),
		evidence: c.packedEvidence,
		enrolledAt: c.enrolledAt,
		...o.packedTrust ? { packedTrust: o.packedTrust } : {}
	})) return null;
	return `${c.id} (${c.label}) is not a second factor: its packed attestation (${c.attestation.certIssuer || "no issuer"}) ${c.packedEvidence ? "does not chain to a recognized hardware security key's certificate authority (a software or virtual authenticator)" : "was enrolled before Enclawed 2.0.3 and kept nothing to verify it against the recognized hardware keys"}. Enroll a hardware security key or this computer's passkey (enclawed auth enroll, or enclawed auth enroll --passkey), then remove it: enclawed auth remove ${c.id}`;
}
/** The store's credentials that are second factors (factorRefusal), and the refusals of the rest. */
function qualifiedStore(r, store) {
	const refused = [];
	const legacy = [];
	const signers = [];
	const credentials = store.credentials.filter((c) => {
		if (c.role === "device-unlock-signer") {
			signers.push(c);
			return false;
		}
		const why = factorRefusal(c, {
			rpId: r.rpId,
			packedTrust: r.packedTrust
		});
		if (why) {
			refused.push(why);
			legacy.push(c);
		}
		return why === null;
	});
	return {
		store: {
			...store,
			credentials
		},
		refused,
		legacy,
		signers
	};
}
const securityKeys = (s) => s.credentials.filter((c) => credentialKind(c) === "security-key");
const passkeys = (s) => s.credentials.filter((c) => credentialKind(c) === "passkey");
async function record(r, type, payload) {
	try {
		await r.audit({
			type,
			payload
		});
	} catch (err) {
		if (err instanceof SecondFactorError) throw err;
		throw new SecondFactorError("audit-unavailable", `cannot write the audit log: ${String(err)}`);
	}
}
const AUDITED = /* @__PURE__ */ new WeakSet();
function markAudited(err) {
	AUDITED.add(err);
	return err;
}
async function guarded(r, type, base, fn) {
	try {
		return await fn();
	} catch (err) {
		if (err && typeof err === "object" && AUDITED.has(err)) throw err;
		if (err instanceof SecondFactorError && err.code === "audit-unavailable") throw err;
		const sfe = err instanceof SecondFactorError ? err : new SecondFactorError(err instanceof AuthLockError ? "busy" : "internal-error", `second-factor check refused: ${err instanceof Error ? err.message : String(err)}`);
		await record(r, type, {
			...base,
			outcome: "refused",
			code: failureCode(err) === "error" ? sfe.code : failureCode(err)
		});
		throw markAudited(sfe);
	}
}
/** Count a failure toward the lockout; never throws (a store that cannot be written reports null). */
async function countFailure(r) {
	try {
		return { failures: (await bumpFailures(r, loadStore(r))).failures };
	} catch {
		return { failures: null };
	}
}
function loadStore(r) {
	try {
		return readAuthStore(r.dir, r.rpId);
	} catch (err) {
		throw new SecondFactorError("store-invalid", `the second-factor store is unreadable: ${String(err)}`);
	}
}
/** Find a plugged-in, acceptable authenticator that holds one of the enrolled credentials. */
function locateEnrolledKey(r, store) {
	let devices;
	try {
		devices = r.transport.listDevices();
	} catch (err) {
		return new SecondFactorError(err instanceof TransportError && err.code === "tools-missing" ? "tools-missing" : "no-device", String(err instanceof Error ? err.message : err));
	}
	const refusals = [];
	const usable = devices.filter((d) => {
		const why = deviceRefusal(d);
		if (why) refusals.push(why.message);
		return !why;
	});
	if (usable.length === 0) return new SecondFactorError(refusals.length > 0 ? "device-refused" : "no-device", refusals.length > 0 ? `no acceptable security key: ${refusals.join("; ")}` : "no FIDO2 security key is plugged in; insert an enrolled key");
	for (const device of usable) for (const credential of securityKeys(store)) if (r.transport.hasCredential({
		device,
		rpId: r.rpId,
		credentialId: fromB64url(credential.credentialId)
	})) return {
		device,
		credential
	};
	return new SecondFactorError("unknown-key", "the security key plugged in is not enrolled on this install");
}
function failureCode(err) {
	if (err instanceof WebAuthnError || err instanceof TransportError || err instanceof SecondFactorError || err instanceof AuthLockError || err instanceof CeremonyError || err instanceof PasskeyUnavailableError) return err.code;
	if (err instanceof CborError) return "bad-authdata";
	return "error";
}
/**
* One interactive FIDO2 assertion against an enrolled credential. The
* challenge is fresh random bytes, or (for an unlock ticket) the hash of the
* ticket body the key is asked to sign.
*/
function fido2Ceremony(r, located, challenge = randomBytes(32)) {
	const clientDataJSON = Buffer.from(JSON.stringify({
		type: "webauthn.get",
		challenge: b64url(challenge),
		origin: r.origin,
		crossOrigin: false
	}));
	const clientDataHash = verifyClientData(clientDataJSON, {
		type: "webauthn.get",
		challenge,
		origin: r.origin
	});
	const issuedAt = performance.now();
	r.say(`Touch your security key (${located.credential.label}) and enter its PIN when asked.`);
	const got = r.transport.getAssertion({
		device: located.device,
		clientDataHash,
		rpId: r.rpId,
		credentialId: fromB64url(located.credential.credentialId)
	});
	if (performance.now() - issuedAt > 12e4) throw new SecondFactorError("challenge-expired", "the challenge expired before the key answered");
	if (got.rpId !== r.rpId || Buffer.compare(Buffer.from(got.clientDataHash), Buffer.from(clientDataHash)) !== 0) throw new WebAuthnError("client-data-hash-mismatch", "the authenticator answered a different challenge");
	const authDataRaw = unwrapCborByteString(got.authDataCbor);
	return {
		signCount: verifyAssertion({
			rpId: r.rpId,
			clientDataHash,
			authDataRaw,
			signature: got.sig,
			credentialPublicKey: fromB64url(located.credential.publicKeyCose),
			storedSignCount: located.credential.signCount
		}).signCount,
		clientDataJSON,
		authDataRaw,
		signature: got.sig
	};
}
/** The passkey a ticket is signed with: the most recently used (or enrolled) one. */
function ticketPasskey(store) {
	const list = passkeys(store);
	if (list.length === 0) return null;
	return list.reduce((a, b) => (b.lastUsedAt ?? b.enrolledAt) > (a.lastUsedAt ?? a.enrolledAt) ? b : a);
}
/**
* The counter rule for a stored passkey: the TPM exemption only when its stored registration
* still proves a non-exportable TPM key for this very credential; a store that claims the
* exemption without that proof is refused outright (tampering).
*/
function storedCounterPolicy(c) {
	if (c.counterPolicy === void 0) return "strict";
	if (c.counterPolicy === "tpm-non-exportable" && tpmCounterExemptionHolds({
		rpId: "localhost",
		credentialId: fromB64url(c.credentialId),
		publicKeyCose: fromB64url(c.publicKeyCose),
		evidence: c.tpmCounterEvidence,
		enrolledAt: c.enrolledAt
	})) return "tpm-non-exportable";
	throw new WebAuthnError("attestation-invalid", "the stored counter exemption is not backed by a verified TPM attestation of this passkey");
}
/** Accept a loopback ceremony's answer only from a loopback page, for the ceremony asked. */
function checkCeremonyAnswer(res, kind) {
	if (res.kind !== kind || !isLoopbackOrigin(res.origin)) throw new WebAuthnError("origin-mismatch", "the passkey answer did not come from a loopback page");
}
/**
* One passkey assertion through the loopback page: a fresh challenge (or a
* ticket body's hash), verified exactly like a security key's assertion
* (UP, UV, not backup-eligible, signature, strictly increasing counter)
* under the RP ID "localhost" and the page's exact origin.
*/
async function passkeyCeremony(r, candidates, purpose, challenge = randomBytes(32)) {
	const issuedAt = performance.now();
	const res = await r.passkey({
		kind: "get",
		challenge,
		allowCredentialIds: candidates.map((c) => fromB64url(c.credentialId)),
		title: `Confirm: ${purpose}`
	}, r.say);
	if (performance.now() - issuedAt > 12e4) throw new SecondFactorError("challenge-expired", "the challenge expired before the passkey answered");
	checkCeremonyAnswer(res, "get");
	const credential = candidates.find((c) => Buffer.compare(Buffer.from(fromB64url(c.credentialId)), Buffer.from(res.credentialId)) === 0);
	if (!credential) throw new SecondFactorError("unknown-key", "the passkey used is not enrolled on this install");
	if (!res.authenticatorData || !res.signature) throw new WebAuthnError("bad-authdata", "the passkey answer lacks authenticator data or a signature");
	return {
		credential,
		ceremony: {
			signCount: verifyAssertion({
				rpId: PASSKEY_RP_ID,
				clientDataHash: verifyClientData(res.clientDataJSON, {
					type: "webauthn.get",
					challenge,
					origin: res.origin
				}),
				authDataRaw: res.authenticatorData,
				signature: res.signature,
				credentialPublicKey: fromB64url(credential.publicKeyCose),
				storedSignCount: credential.signCount,
				counterPolicy: storedCounterPolicy(credential)
			}).signCount,
			clientDataJSON: res.clientDataJSON,
			authDataRaw: res.authenticatorData,
			signature: res.signature
		}
	};
}
async function bumpFailures(r, store) {
	const failures = store.failures + 1;
	const lockedUntil = failures >= FREE_FAILURES ? r.now() + Math.min(MAX_LOCKOUT_MS, 3e4 * 2 ** (failures - FREE_FAILURES)) : store.lockedUntil;
	const next = {
		...store,
		failures,
		lockedUntil
	};
	writeAuthStore(r.dir, next);
	return next;
}
/**
* The gate. Resolves when the person proved both factors (or, for a
* headless session start, presented a valid unlock ticket); throws
* SecondFactorError otherwise. Audits every outcome.
*/
async function assertSecondFactor(ctx, op) {
	const { via, credential, ticket } = await runGate(ctx, op, null);
	return {
		via,
		credential,
		...ticket ? { ticket } : {}
	};
}
/**
* A headless session start whose ticket may be signed by a device-unlock
* ticket signer (role "device-unlock-signer") in a device-factor store. For
* the framework's device activation only (session.ts activateSession): a
* result with `deviceUnlockSigner` authorizes nothing until the device-counted
* grant bound to its ticket is spent, which deviceActivation enforces.
*/
async function assertSessionStartForDeviceUnlock(ctx, op) {
	const { via, credential, ticket, deviceUnlockSigner } = await runGate(ctx, {
		purpose: "session-start",
		...op.detail ? { detail: op.detail } : {},
		allowTicket: true,
		deviceUnlockSigner: true
	}, null);
	return {
		via,
		credential,
		...ticket ? { ticket } : {},
		...deviceUnlockSigner ? { deviceUnlockSigner } : {}
	};
}
async function runGate(ctx, op, signing) {
	const r = resolve$1(ctx);
	const base = {
		purpose: op.purpose,
		...op.detail ? { detail: op.detail } : {},
		...op.legacyEnrollment ? { legacyAuthorization: true } : {}
	};
	return guarded(r, "auth.second-factor", base, () => runGateChecked(r, base, op, signing));
}
async function runGateChecked(r, base, op, signing) {
	const refuse = async (err, extra = {}) => {
		await record(r, "auth.second-factor", {
			...base,
			outcome: "refused",
			code: err.code,
			...extra
		});
		throw markAudited(err);
	};
	try {
		r.config();
	} catch (err) {
		return refuse(err);
	}
	return withAuthLock(r.dir, r.lockWaitMs, async () => {
		let store;
		let refused;
		let signers;
		try {
			const q = qualifiedStore(r, loadStore(r));
			refused = q.refused;
			signers = q.signers;
			store = op.legacyEnrollment ? {
				...q.store,
				credentials: q.legacy
			} : q.store;
		} catch (err) {
			return refuse(err);
		}
		if (op.deviceUnlockSigner && (op.purpose !== "session-start" || op.legacyEnrollment || signing)) return refuse(new SecondFactorError("internal-error", "a device-unlock ticket signer signs only a headless session start's ticket"));
		if (op.legacyEnrollment && (op.purpose !== "auth-change" || op.allowTicket !== false || signing)) return refuse(new SecondFactorError("internal-error", "a legacy packed credential authorizes only the enrollment of a replacement"));
		const deviceEnrolled = !op.legacyEnrollment && r.deviceFactor ? await r.deviceFactor.enrolled().catch(() => false) : false;
		if (store.credentials.length === 0 && !deviceEnrolled) return refuse(new SecondFactorError("not-enrolled", refused.length > 0 ? `${refused.join("\n")}\n${ENROLL_INSTRUCTIONS}` : ENROLL_INSTRUCTIONS));
		if (store.lockedUntil !== null && r.now() < store.lockedUntil) return refuse(new SecondFactorError("backoff", `too many failed second-factor attempts; try again after ${new Date(store.lockedUntil).toISOString()}`), { failures: store.failures });
		if (!r.interactive) {
			if (op.purpose !== "session-start" || op.allowTicket === false) return refuse(new SecondFactorError("headless", `${op.purpose} needs a person at a terminal with an enrolled security key; unlock tickets cover session starts only`));
			const binding = currentBinding();
			const signerAllowed = op.deviceUnlockSigner === true && store.credentials.length === 0 && deviceEnrolled;
			const spent = consumeTicket({
				dir: r.dir,
				binding,
				now: r.now(),
				rpId: r.rpId,
				origin: r.origin,
				credentials: signerAllowed ? [...store.credentials, ...signers] : store.credentials
			});
			if (!spent.ok) return refuse(new SecondFactorError(spent.reason === "unbindable-platform" ? "unbindable-platform" : "no-ticket", spent.reason === "unbindable-platform" ? "this platform exposes no boot id, so a headless start cannot be bound to this boot; start interactively" : `no valid unlock ticket (${spent.reason}); a person must run: enclawed auth unlock`), { ticket: spent.reason });
			const bySigner = signerAllowed && signers.some((c) => c.id === spent.ticket.credential);
			await record(r, "auth.second-factor", {
				...base,
				outcome: "verified",
				via: "ticket",
				credential: spent.ticket.credential,
				...bySigner ? {
					deviceUnlockSigner: true,
					needs: "the device-counted unlock grant"
				} : {},
				ticketExpiresAt: spent.ticket.expiresAt,
				ticketUsesLeft: spent.ticket.usesLeft
			});
			return {
				via: "ticket",
				credential: spent.ticket.credential,
				...bySigner ? { deviceUnlockSigner: true } : {},
				ticket: {
					digest: ticketDigest(spent.ticket),
					credentialId: spent.ticket.credentialId
				}
			};
		}
		const located = securityKeys(store).length > 0 ? locateEnrolledKey(r, store) : null;
		if (located && !(located instanceof SecondFactorError)) try {
			const ticketBody = signing ? signing.body(located.credential) : null;
			const ceremony = fido2Ceremony(r, located, ticketBody ? ticketChallenge(ticketBody) : void 0);
			const signCount = ceremony.signCount;
			const fresh = loadStore(r);
			const credentials = fresh.credentials.map((c) => c.id === located.credential.id ? {
				...c,
				signCount,
				lastUsedAt: r.now()
			} : c);
			writeAuthStore(r.dir, {
				...fresh,
				credentials,
				failures: 0,
				lockedUntil: null
			});
			await record(r, "auth.second-factor", {
				...base,
				outcome: "verified",
				via: "fido2",
				...credentialRef(located.credential),
				signCount
			});
			return {
				via: "fido2",
				credential: located.credential.id,
				...ticketBody ? { signedTicket: {
					body: ticketBody,
					ceremony
				} } : {}
			};
		} catch (err) {
			if (err instanceof SecondFactorError && err.code === "audit-unavailable") throw err;
			const { failures } = await countFailure(r);
			await record(r, "auth.second-factor", {
				...base,
				outcome: "refused",
				via: "fido2",
				code: failureCode(err),
				...credentialRef(located.credential),
				failures
			});
			throw markAudited(new SecondFactorError("verification-failed", `second-factor verification failed: ${err instanceof Error ? err.message : String(err)}`));
		}
		let passkeyUnavailable = null;
		if (passkeys(store).length > 0) {
			const signer = signing ? ticketPasskey(store) : null;
			const ticketBody = signing && signer ? signing.body(signer) : null;
			try {
				const done = await passkeyCeremony(r, signer ? [signer] : passkeys(store), op.detail ? `${op.purpose} (${op.detail})` : op.purpose, ticketBody ? ticketChallenge(ticketBody) : void 0);
				const signCount = done.ceremony.signCount;
				const fresh = loadStore(r);
				const credentials = fresh.credentials.map((c) => c.id === done.credential.id ? {
					...c,
					signCount,
					lastUsedAt: r.now()
				} : c);
				writeAuthStore(r.dir, {
					...fresh,
					credentials,
					failures: 0,
					lockedUntil: null
				});
				await record(r, "auth.second-factor", {
					...base,
					outcome: "verified",
					via: "passkey",
					...credentialRef(done.credential),
					signCount
				});
				return {
					via: "passkey",
					credential: done.credential.id,
					...ticketBody ? { signedTicket: {
						body: ticketBody,
						ceremony: done.ceremony
					} } : {}
				};
			} catch (err) {
				if (err instanceof SecondFactorError && err.code === "audit-unavailable") throw err;
				if (err instanceof PasskeyUnavailableError) passkeyUnavailable = new SecondFactorError("no-device", err.message);
				else {
					const { failures } = await countFailure(r);
					await record(r, "auth.second-factor", {
						...base,
						outcome: "refused",
						via: "passkey",
						code: failureCode(err),
						failures
					});
					throw markAudited(new SecondFactorError("verification-failed", `second-factor verification failed: ${err instanceof Error ? err.message : String(err)}`));
				}
			}
		}
		if (signing) return refuse(located instanceof SecondFactorError ? located : passkeyUnavailable ?? new SecondFactorError("no-device", "an unlock ticket must be signed by an enrolled FIDO2 security key or passkey"));
		if (deviceEnrolled && r.deviceFactor && r.readCode) {
			let verdict;
			try {
				const code = (await r.readCode(`${r.deviceFactor.label}: `)).trim();
				try {
					verdict = await r.deviceFactor.verify({
						purpose: op.purpose,
						code
					});
				} catch {
					verdict = {
						ok: false,
						code: "device-error"
					};
				}
			} catch {
				verdict = {
					ok: false,
					code: "cancelled"
				};
			}
			if (verdict.ok) {
				writeAuthStore(r.dir, {
					...loadStore(r),
					failures: 0,
					lockedUntil: null
				});
				await record(r, "auth.second-factor", {
					...base,
					outcome: "verified",
					via: "device-totp"
				});
				return {
					via: "device-totp",
					credential: null
				};
			}
			const { failures } = await countFailure(r);
			await record(r, "auth.second-factor", {
				...base,
				outcome: "refused",
				via: "device-totp",
				code: verdict.code,
				failures
			});
			throw markAudited(new SecondFactorError("verification-failed", verdict.code === "clock-disagrees" ? CLOCK_DISAGREES_TEXT : "the device refused the code"));
		}
		return refuse(passkeyUnavailable ?? (located instanceof SecondFactorError ? located : new SecondFactorError("no-device", "no enrolled second factor is available")));
	});
}
async function enrollSecurityKey(ctx, opts) {
	const r = resolve$1(ctx);
	return guarded(r, "auth.enroll", { label: opts.label }, async () => {
		const label = opts.label.trim();
		if (!/^[\w .@-]{1,64}$/.test(label)) throw new SecondFactorError("no-such-factor", "a label is 1-64 letters, digits, spaces or . _ @ -");
		const fail = async (code, err) => {
			await record(r, "auth.enroll", {
				outcome: "refused",
				code,
				label
			});
			throw markAudited(err instanceof SecondFactorError ? err : new SecondFactorError("verification-failed", `enrollment refused: ${err.message}`));
		};
		if (!r.interactive) return fail("headless", new SecondFactorError("headless", "enrolling a security key needs a person at the terminal"));
		const config = r.config();
		const authorizedBy = await proveExistingFactor(ctx, r, label);
		return withAuthLock(r.dir, r.lockWaitMs, async () => {
			const store = loadStore(r);
			const factors = qualifiedStore(r, store).store;
			let devices;
			try {
				devices = r.transport.listDevices();
			} catch (err) {
				return fail("tools-missing", err);
			}
			const usable = [];
			const refusals = [];
			for (const d of devices) {
				const why = deviceRefusal(d);
				if (why) {
					refusals.push(why.message);
					continue;
				}
				if (!securityKeys(factors).some((c) => r.transport.hasCredential({
					device: d,
					rpId: r.rpId,
					credentialId: fromB64url(c.credentialId)
				}))) usable.push(d);
			}
			if (usable.length !== 1) {
				const msg = usable.length === 0 ? refusals.length > 0 ? `no acceptable new security key: ${refusals.join("; ")}` : "plug in the new security key (keys already enrolled here are not enrolled twice)" : "more than one new security key is plugged in; plug in only the one to enroll";
				return fail(usable.length === 0 ? "no-device" : "ambiguous-device", new SecondFactorError(usable.length === 0 ? "no-device" : "ambiguous-device", msg));
			}
			const device = usable[0];
			const alg = opts.alg ?? (device.algorithms.includes("es256") ? "es256" : "eddsa");
			const challenge = randomBytes(32);
			const clientDataHash = verifyClientData(Buffer.from(JSON.stringify({
				type: "webauthn.create",
				challenge: b64url(challenge),
				origin: r.origin,
				crossOrigin: false
			})), {
				type: "webauthn.create",
				challenge,
				origin: r.origin
			});
			r.say(`Enrolling ${device.description || device.path}: touch the key and enter its PIN when asked.`);
			try {
				const issuedAt = performance.now();
				const made = r.transport.makeCredential({
					device,
					clientDataHash,
					rpId: r.rpId,
					userName: `enclawed@${r.rpId}`,
					userId: randomBytes(32),
					alg
				});
				if (performance.now() - issuedAt > 12e4) throw new SecondFactorError("challenge-expired", "the challenge expired before the key answered");
				if (made.rpId !== r.rpId || Buffer.compare(Buffer.from(made.clientDataHash), Buffer.from(clientDataHash)) !== 0) throw new WebAuthnError("client-data-hash-mismatch", "the authenticator answered a different challenge");
				const authDataRaw = unwrapCborByteString(made.authDataCbor);
				const reg = verifyRegistration({
					rpId: r.rpId,
					clientDataHash,
					fmt: made.fmt,
					authDataRaw,
					stmt: {
						sig: made.sig,
						x5c: made.x5c
					},
					credentialId: made.credentialId,
					policy: {
						allowedAuthenticators: config.allowedAuthenticators,
						now: r.now()
					},
					...r.packedTrust ? { packedTrust: r.packedTrust } : {}
				});
				if (device.aaguid && device.aaguid.replace(/-/g, "") !== reg.aaguid.replace(/-/g, "")) throw new WebAuthnError("attestation-invalid", "the attested AAGUID differs from the key's own report");
				const credential = {
					id: randomBytes(4).toString("hex"),
					label,
					credentialId: b64url(reg.credentialId),
					alg: reg.publicKey.alg,
					publicKeyCose: b64url(reg.publicKey.cose),
					signCount: reg.signCount,
					aaguid: reg.aaguid,
					attestation: reg.attestation,
					...reg.attestation.fmt === "packed" ? { packedEvidence: {
						authData: b64url(authDataRaw),
						clientDataHash: b64url(clientDataHash),
						sig: b64url(made.sig),
						x5c: made.x5c.map((c) => b64url(c))
					} } : {},
					enrolledAt: r.now(),
					lastUsedAt: null
				};
				const next = {
					...loadStore(r),
					credentials: [...store.credentials, credential]
				};
				writeAuthStore(r.dir, next);
				await record(r, "auth.enroll", {
					outcome: "enrolled",
					...credentialRef(credential),
					alg: credential.alg,
					publicKeySha256: Buffer.from(sha256(reg.publicKey.cose)).toString("hex"),
					attestationCertSha256: reg.attestation.certSha256,
					attestationSubject: reg.attestation.certSubject,
					allowedAs: reg.attestation.allowedAs,
					...authorizedBy ? { authorizedByLegacyCredential: authorizedBy.legacyCredential } : {},
					total: next.credentials.length,
					firstFactor: store.credentials.length === 0
				});
				return {
					credential,
					total: next.credentials.length
				};
			} catch (err) {
				if (err instanceof SecondFactorError && err.code === "audit-unavailable") throw err;
				return fail(failureCode(err), err);
			}
		});
	});
}
/**
* Adding a factor changes who can pass the gate: when any factor is
* enrolled (a key, a passkey or the device-verified code), prove one first.
*/
async function proveExistingFactor(ctx, r, label) {
	const { store: before, legacy } = qualifiedStore(r, loadStore(r));
	const deviceEnrolled = r.deviceFactor ? await r.deviceFactor.enrolled().catch(() => false) : false;
	if (before.credentials.length > 0 || deviceEnrolled) {
		await assertSecondFactor(ctx, {
			purpose: "auth-change",
			detail: `enroll ${label}`,
			allowTicket: false
		});
		return null;
	}
	if (legacy.length > 0) return { legacyCredential: (await runGate(ctx, {
		purpose: "auth-change",
		detail: `enroll ${label} (replaces a packed enrollment that no longer counts)`,
		allowTicket: false,
		legacyEnrollment: true
	}, null)).credential ?? "unknown" };
	return null;
}
/**
* Enroll this computer's device-bound platform passkey through the loopback
* page: a fresh challenge and user id, a "tpm", "apple" or "android-key"
* attestation (or a security key's "packed" one, when the person used a key
* through the browser) verified against its pinned vendor root, UP and UV
* set, not backup-eligible. The credential is kept with kind "passkey".
*/
async function enrollPasskey(ctx, opts) {
	const r = resolve$1(ctx);
	return guarded(r, "auth.enroll", {
		label: opts.label,
		kind: "passkey"
	}, async () => {
		const label = opts.label.trim();
		if (!/^[\w .@-]{1,64}$/.test(label)) throw new SecondFactorError("no-such-factor", "a label is 1-64 letters, digits, spaces or . _ @ -");
		const fail = async (code, err) => {
			await record(r, "auth.enroll", {
				outcome: "refused",
				code,
				label,
				kind: "passkey"
			});
			throw markAudited(err instanceof SecondFactorError ? err : new SecondFactorError(err instanceof PasskeyUnavailableError ? "no-device" : "verification-failed", `enrollment refused: ${err.message}`));
		};
		if (!r.interactive) return fail("headless", new SecondFactorError("headless", "enrolling a passkey needs a person at the terminal"));
		const config = r.config();
		const authorizedBy = await proveExistingFactor(ctx, r, label);
		return withAuthLock(r.dir, r.lockWaitMs, async () => {
			const store = loadStore(r);
			const challenge = randomBytes(32);
			try {
				const issuedAt = performance.now();
				const res = await r.passkey({
					kind: "create",
					challenge,
					userId: randomBytes(32),
					userName: `enclawed ${label}`,
					excludeCredentialIds: passkeys(store).map((c) => fromB64url(c.credentialId)),
					title: `Enroll this device's passkey as "${label}"`
				}, r.say);
				if (performance.now() - issuedAt > 12e4) throw new SecondFactorError("challenge-expired", "the challenge expired before the passkey answered");
				checkCeremonyAnswer(res, "create");
				if (!res.attestationObject) throw new WebAuthnError("attestation-format", "the passkey answer lacks an attestation");
				const clientDataHash = verifyClientData(res.clientDataJSON, {
					type: "webauthn.create",
					challenge,
					origin: res.origin
				});
				const att = decodeAttestationObject(res.attestationObject);
				const reg = verifyRegistration({
					rpId: PASSKEY_RP_ID,
					clientDataHash,
					fmt: att.fmt,
					authDataRaw: att.authDataRaw,
					stmt: att.stmt,
					credentialId: res.credentialId,
					policy: {
						allowedAuthenticators: config.allowedAuthenticators,
						now: r.now()
					},
					...r.packedTrust ? { packedTrust: r.packedTrust } : {}
				});
				const id = b64url(reg.credentialId);
				if (store.credentials.some((c) => c.credentialId === id)) throw new WebAuthnError("credential-id-mismatch", "this passkey is already enrolled");
				const credential = {
					id: randomBytes(4).toString("hex"),
					label,
					credentialId: id,
					kind: "passkey",
					...reg.attestation.fmt === "tpm" ? {
						counterPolicy: "tpm-non-exportable",
						tpmCounterEvidence: {
							attestationObject: b64url(res.attestationObject),
							clientDataHash: b64url(clientDataHash)
						}
					} : {},
					alg: reg.publicKey.alg,
					publicKeyCose: b64url(reg.publicKey.cose),
					signCount: reg.signCount,
					aaguid: reg.aaguid,
					attestation: reg.attestation,
					...reg.attestation.fmt === "packed" ? { packedEvidence: {
						authData: b64url(att.authDataRaw),
						clientDataHash: b64url(clientDataHash),
						sig: b64url(att.stmt.sig),
						x5c: att.stmt.x5c.map((c) => b64url(c)),
						...typeof att.stmt.alg === "number" ? { alg: att.stmt.alg } : {}
					} } : {},
					enrolledAt: r.now(),
					lastUsedAt: null
				};
				const next = {
					...loadStore(r),
					credentials: [...store.credentials, credential]
				};
				writeAuthStore(r.dir, next);
				await record(r, "auth.enroll", {
					outcome: "enrolled",
					...credentialRef(credential),
					alg: credential.alg,
					fmt: reg.attestation.fmt,
					attestationAlg: reg.attestation.alg ?? null,
					publicKeySha256: Buffer.from(sha256(reg.publicKey.cose)).toString("hex"),
					attestationCertSha256: reg.attestation.certSha256,
					attestationSubject: reg.attestation.certSubject,
					allowedAs: reg.attestation.allowedAs,
					...authorizedBy ? { authorizedByLegacyCredential: authorizedBy.legacyCredential } : {},
					total: next.credentials.length,
					firstFactor: store.credentials.length === 0
				});
				return {
					credential,
					total: next.credentials.length
				};
			} catch (err) {
				if (err instanceof SecondFactorError && err.code === "audit-unavailable") throw err;
				return fail(failureCode(err), err);
			}
		});
	});
}
async function removeSecurityKey(ctx, opts) {
	const r = resolve$1(ctx);
	return guarded(r, "auth.remove", { credential: opts.id }, async () => {
		const store = loadStore(r);
		const target = store.credentials.find((c) => c.id === opts.id);
		if (!target) {
			await record(r, "auth.remove", {
				outcome: "refused",
				code: "no-such-factor",
				credential: opts.id
			});
			throw markAudited(new SecondFactorError("no-such-factor", `no enrolled key has id ${opts.id} (see: enclawed auth status)`));
		}
		const deviceEnrolled = r.deviceFactor ? await r.deviceFactor.enrolled().catch(() => false) : false;
		const factors = qualifiedStore(r, store).store.credentials;
		const targetIsFactor = factors.some((c) => c.id === target.id);
		if (targetIsFactor && factors.length + (deviceEnrolled ? 1 : 0) <= 1) {
			await record(r, "auth.remove", {
				outcome: "refused",
				code: "last-factor",
				...credentialRef(target)
			});
			throw new SecondFactorError("last-factor", "refusing to remove the last enrolled second factor; enroll a replacement first (enclawed auth enroll)");
		}
		await assertSecondFactor(ctx, {
			purpose: "auth-change",
			detail: `remove ${target.id}`,
			allowTicket: false
		});
		return withAuthLock(r.dir, r.lockWaitMs, async () => {
			const fresh = loadStore(r);
			const credentials = fresh.credentials.filter((c) => c.id !== target.id);
			const left = qualifiedStore(r, {
				...fresh,
				credentials
			}).store.credentials;
			if (targetIsFactor && left.length + (deviceEnrolled ? 1 : 0) < 1) throw new SecondFactorError("last-factor", "refusing to remove the last enrolled second factor");
			writeAuthStore(r.dir, {
				...fresh,
				credentials
			});
			revokeTicket(r.dir);
			await record(r, "auth.remove", {
				outcome: "removed",
				...credentialRef(target),
				remaining: credentials.length
			});
			return { remaining: credentials.length };
		});
	});
}
async function unlockForHeadlessStart(ctx, opts) {
	const r = resolve$1(ctx);
	return guarded(r, "auth.ticket", { scope: "session-start" }, async () => {
		const config = r.config();
		const binding = currentBinding();
		if (!binding) {
			await record(r, "auth.ticket", {
				outcome: "refused",
				code: "unbindable-platform"
			});
			throw new SecondFactorError("unbindable-platform", "this platform exposes no boot id; unlock tickets are unavailable");
		}
		let minutes;
		try {
			minutes = ticketMinutes({
				requested: opts.minutes,
				configuredDefault: config.unlockMinutes,
				configuredMax: config.maxUnlockMinutes
			});
		} catch (err) {
			await record(r, "auth.ticket", {
				outcome: "refused",
				code: "config-invalid"
			});
			throw markAudited(new SecondFactorError("config-invalid", err.message));
		}
		const uses = opts.uses ?? 1;
		if (!Number.isInteger(uses) || uses < 1 || uses > 65535) {
			await record(r, "auth.ticket", {
				outcome: "refused",
				code: "config-invalid"
			});
			throw markAudited(new SecondFactorError("config-invalid", `--uses must be between 1 and ${TICKET_MAX_USES}`));
		}
		const signed = (await runGate(ctx, {
			purpose: "unlock",
			allowTicket: false
		}, { body: (credential) => newTicketBody({
			rpId: r.rpId,
			binding,
			minutes,
			uses,
			credential,
			now: r.now()
		}) })).signedTicket;
		if (!signed) throw new SecondFactorError("no-device", "an unlock ticket must be signed by an enrolled FIDO2 security key or passkey");
		return withAuthLock(r.dir, r.lockWaitMs, async () => {
			writeSignedTicket(r.dir, {
				body: signed.body,
				clientDataJSON: signed.ceremony.clientDataJSON,
				authDataRaw: signed.ceremony.authDataRaw,
				signature: signed.ceremony.signature
			});
			await record(r, "auth.ticket", {
				outcome: "issued",
				scope: signed.body.scope,
				credential: signed.body.credential,
				expiresAt: signed.body.expiresAt,
				uses: signed.body.uses,
				signCount: signed.ceremony.signCount
			});
			return {
				...signed.body,
				usesLeft: signed.body.uses
			};
		});
	});
}
async function revokeUnlockTicket(ctx) {
	const r = resolve$1(ctx);
	return guarded(r, "auth.ticket", { action: "revoke" }, async () => {
		const had = await withAuthLock(r.dir, r.lockWaitMs, async () => revokeTicket(r.dir));
		await record(r, "auth.ticket", {
			outcome: "revoked",
			existed: had
		});
		return had;
	});
}
async function secondFactorStatus(ctx) {
	const r = resolve$1(ctx);
	const store = loadStore(r);
	let config;
	try {
		const c = r.config();
		config = {
			unlockMinutes: c.unlockMinutes,
			maxUnlockMinutes: c.maxUnlockMinutes,
			allowlist: c.allowedAuthenticators.map((a) => a.description ?? a.aaguid)
		};
	} catch (err) {
		config = { error: err.message };
	}
	const deviceEnrolled = r.deviceFactor ? await r.deviceFactor.enrolled().catch(() => false) : false;
	const t = readTicket(r.dir);
	const binding = currentBinding();
	const { store: factors, refused } = qualifiedStore(r, store);
	const warnings = [...refused];
	if (factors.credentials.length + (deviceEnrolled ? 1 : 0) === 0) warnings.push("no second factor is enrolled: every gated command is refused until you run `enclawed auth enroll`");
	else if (factors.credentials.length === 1 && !deviceEnrolled) warnings.push("only one security key is enrolled: enroll a backup key (enclawed auth enroll --label backup)");
	return {
		rpId: r.rpId,
		dir: r.dir,
		credentials: store.credentials.map(({ publicKeyCose: _p, credentialId: _c, ...rest }) => rest),
		deviceFactor: r.deviceFactor ? {
			label: r.deviceFactor.label,
			enrolled: deviceEnrolled
		} : null,
		failures: store.failures,
		lockedUntil: store.lockedUntil,
		ticket: t ? {
			expiresAt: t.expiresAt,
			usesLeft: t.usesLeft,
			valid: ticketSignatureValid(r.dir, {
				rpId: r.rpId,
				origin: r.origin,
				credentials: store.credentials
			}) && binding !== null && t.bootId === binding.bootId && t.uid === binding.uid && r.now() < t.expiresAt && t.usesLeft > 0
		} : null,
		config,
		warnings
	};
}
//#endregion
export { assertSessionStartForDeviceUnlock as a, removeSecurityKey as c, unlockForHeadlessStart as d, loadAuthConfig as f, assertSecondFactor as i, revokeUnlockTicket as l, ticketDigest as m, ENROLL_INSTRUCTIONS as n, enrollPasskey as o, parseAuthConfig as p, SecondFactorError as r, enrollSecurityKey as s, DEFAULT_RP_ID as t, secondFactorStatus as u };
