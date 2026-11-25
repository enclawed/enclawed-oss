import { a as __require, n as __esmMin, o as __toCommonJS, r as __exportAll, t as __commonJSMin } from "./chunk-iyeSoAlh.js";
import { t as require_src$1 } from "./src-CEZCEBl6.js";
//#region node_modules/jose/dist/webapi/lib/buffer_utils.js
function concat(...buffers) {
	const size = buffers.reduce((acc, { length }) => acc + length, 0), buf = new Uint8Array(size);
	let i = 0;
	for (const buffer of buffers) buf.set(buffer, i), i += buffer.length;
	return buf;
}
function writeUInt32BE(buf, value, offset) {
	if (value < 0 || value >= UINT32_RANGE) throw new RangeError(`value must be >= 0 and <= ${UINT32_RANGE - 1}. Received ${value}`);
	buf.set([
		value >>> 24,
		value >>> 16,
		value >>> 8,
		value & 255
	], offset);
}
function uint64be(value) {
	const high = Math.floor(value / UINT32_RANGE), low = value % UINT32_RANGE, buf = new Uint8Array(8);
	return writeUInt32BE(buf, high, 0), writeUInt32BE(buf, low, 4), buf;
}
function uint32be(value) {
	const buf = new Uint8Array(4);
	return writeUInt32BE(buf, value), buf;
}
function encode$1(string) {
	if (typeof string == "string" && string.length >= 128) {
		if (NON_ASCII.test(string)) throw new TypeError("non-ASCII string encountered in encode()");
		return encoder.encode(string);
	}
	const bytes = new Uint8Array(string.length);
	for (let i = 0; i < string.length; i++) {
		const code = string.charCodeAt(i);
		if (code > 127) throw new TypeError("non-ASCII string encountered in encode()");
		bytes[i] = code;
	}
	return bytes;
}
function encodeBase64(input, url = !1) {
	if (Uint8Array.prototype.toBase64) return input.toBase64({
		alphabet: url ? "base64url" : "base64",
		omitPadding: url
	});
	const CHUNK_SIZE = 32768, arr = [];
	for (let i = 0; i < input.length; i += CHUNK_SIZE) arr.push(String.fromCharCode.apply(null, input.subarray(i, i + CHUNK_SIZE)));
	const encoded = btoa(arr.join(""));
	return url ? encoded.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_") : encoded;
}
function decodeBase64(encoded, url = !1) {
	if (Uint8Array.fromBase64) return Uint8Array.fromBase64(encoded, { alphabet: url ? "base64url" : "base64" });
	if (url) {
		if (encoded.includes("+") || encoded.includes("/")) throw new TypeError("Invalid base64url");
		encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
	}
	const binary = atob(encoded), bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
async function digest(algorithm, data) {
	const subtleDigest = `SHA-${algorithm.slice(-3)}`;
	return new Uint8Array(await crypto.subtle.digest(subtleDigest, data));
}
var encoder, decoder, strictDecoder, UINT32_RANGE, NON_ASCII;
var init_buffer_utils = __esmMin((() => {
	encoder = new TextEncoder(), decoder = new TextDecoder(), strictDecoder = new TextDecoder("utf-8", { fatal: !0 }), UINT32_RANGE = 2 ** 32;
	NON_ASCII = /[^\x00-\x7f]/;
}));
//#endregion
//#region node_modules/jose/dist/webapi/util/errors.js
var errors_exports = /* @__PURE__ */ __exportAll({
	JOSEAlgNotAllowed: () => JOSEAlgNotAllowed,
	JOSEError: () => JOSEError,
	JOSENotSupported: () => JOSENotSupported,
	JWEDecryptionFailed: () => JWEDecryptionFailed,
	JWEInvalid: () => JWEInvalid,
	JWKInvalid: () => JWKInvalid,
	JWKSInvalid: () => JWKSInvalid,
	JWKSMultipleMatchingKeys: () => JWKSMultipleMatchingKeys,
	JWKSNoMatchingKey: () => JWKSNoMatchingKey,
	JWKSTimeout: () => JWKSTimeout,
	JWSInvalid: () => JWSInvalid,
	JWSSignatureVerificationFailed: () => JWSSignatureVerificationFailed,
	JWTClaimValidationFailed: () => JWTClaimValidationFailed,
	JWTExpired: () => JWTExpired,
	JWTInvalid: () => JWTInvalid
});
var JOSEError, JWTClaimValidationFailed, JWTExpired, JOSEAlgNotAllowed, JOSENotSupported, JWEDecryptionFailed, JWEInvalid, JWSInvalid, JWTInvalid, JWKInvalid, JWKSInvalid, JWKSNoMatchingKey, JWKSMultipleMatchingKeys, JWKSTimeout, JWSSignatureVerificationFailed;
var init_errors = __esmMin((() => {
	JOSEError = class extends Error {
		static code = "ERR_JOSE_GENERIC";
		code = "ERR_JOSE_GENERIC";
		constructor(message, options) {
			super(message, options), this.name = this.constructor.name, Error.captureStackTrace?.(this, this.constructor);
		}
	};
	JWTClaimValidationFailed = class extends JOSEError {
		static code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
		code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
		claim;
		reason;
		payload;
		constructor(message, payload, claim = "unspecified", reason = "unspecified") {
			super(message, { cause: {
				claim,
				reason,
				payload
			} }), this.claim = claim, this.reason = reason, this.payload = payload;
		}
	};
	JWTExpired = class extends JOSEError {
		static code = "ERR_JWT_EXPIRED";
		code = "ERR_JWT_EXPIRED";
		claim;
		reason;
		payload;
		constructor(message, payload, claim = "unspecified", reason = "unspecified") {
			super(message, { cause: {
				claim,
				reason,
				payload
			} }), this.claim = claim, this.reason = reason, this.payload = payload;
		}
	};
	JOSEAlgNotAllowed = class extends JOSEError {
		static code = "ERR_JOSE_ALG_NOT_ALLOWED";
		code = "ERR_JOSE_ALG_NOT_ALLOWED";
	};
	JOSENotSupported = class extends JOSEError {
		static code = "ERR_JOSE_NOT_SUPPORTED";
		code = "ERR_JOSE_NOT_SUPPORTED";
	};
	JWEDecryptionFailed = class extends JOSEError {
		static code = "ERR_JWE_DECRYPTION_FAILED";
		code = "ERR_JWE_DECRYPTION_FAILED";
		constructor(message = "decryption operation failed", options) {
			super(message, options);
		}
	};
	JWEInvalid = class extends JOSEError {
		static code = "ERR_JWE_INVALID";
		code = "ERR_JWE_INVALID";
	};
	JWSInvalid = class extends JOSEError {
		static code = "ERR_JWS_INVALID";
		code = "ERR_JWS_INVALID";
	};
	JWTInvalid = class extends JOSEError {
		static code = "ERR_JWT_INVALID";
		code = "ERR_JWT_INVALID";
	};
	JWKInvalid = class extends JOSEError {
		static code = "ERR_JWK_INVALID";
		code = "ERR_JWK_INVALID";
	};
	JWKSInvalid = class extends JOSEError {
		static code = "ERR_JWKS_INVALID";
		code = "ERR_JWKS_INVALID";
	};
	JWKSNoMatchingKey = class extends JOSEError {
		static code = "ERR_JWKS_NO_MATCHING_KEY";
		code = "ERR_JWKS_NO_MATCHING_KEY";
		constructor(message = "no applicable key found in the JSON Web Key Set", options) {
			super(message, options);
		}
	};
	JWKSMultipleMatchingKeys = class extends JOSEError {
		[Symbol.asyncIterator] = async function* () {};
		static code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
		code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
		constructor(message = "multiple matching keys found in the JSON Web Key Set", options) {
			super(message, options);
		}
	};
	JWKSTimeout = class extends JOSEError {
		static code = "ERR_JWKS_TIMEOUT";
		code = "ERR_JWKS_TIMEOUT";
		constructor(message = "request timed out", options) {
			super(message, options);
		}
	};
	JWSSignatureVerificationFailed = class extends JOSEError {
		static code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
		code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
		constructor(message = "signature verification failed", options) {
			super(message, options);
		}
	};
}));
//#endregion
//#region node_modules/jose/dist/webapi/util/base64url.js
var base64url_exports = /* @__PURE__ */ __exportAll({
	decode: () => decode,
	encode: () => encode
});
function decode(input) {
	try {
		return decodeBase64(typeof input == "string" ? input : decoder.decode(input), !0);
	} catch (cause) {
		throw new TypeError(invalid, { cause });
	}
}
function encode(input) {
	return encodeBase64(typeof input == "string" ? encoder.encode(input) : input, !0);
}
var invalid;
var init_base64url = __esmMin((() => {
	init_buffer_utils();
	invalid = "The input to be decoded is not correctly encoded.";
}));
//#endregion
//#region node_modules/jose/dist/webapi/lib/validate.js
function assertUint8Array(input, label) {
	if (!(input instanceof Uint8Array)) throw new TypeError(`${label} must be an instance of Uint8Array`);
}
function isObject(input) {
	if (typeof input != "object" || input === null || Object.prototype.toString.call(input) !== "[object Object]") return !1;
	const prototype = Object.getPrototypeOf(input);
	return prototype === null || Object.getPrototypeOf(prototype) === null;
}
function isJwkSet(input) {
	return isObject(input) && Array.isArray(input.keys) && Array.from(input.keys).every(isObject);
}
function isDisjoint(...headers) {
	const parameters = /* @__PURE__ */ new Set();
	for (const header of headers) if (header) for (const parameter of Object.keys(header)) {
		if (parameters.has(parameter)) return !1;
		parameters.add(parameter);
	}
	return !0;
}
function assertNotSet(value, name) {
	if (value !== void 0) throw new TypeError(`${name} can only be called once`);
}
function decodeBase64url(value, label, ErrorClass) {
	try {
		return decode(value);
	} catch (cause) {
		throw new ErrorClass(`Failed to base64url decode the ${label}`, { cause });
	}
}
function encodeAsciiMember(value, label, ErrorClass) {
	try {
		return encode$1(value);
	} catch (cause) {
		throw new ErrorClass(`The ${label} is not a valid base64url string`, { cause });
	}
}
function parseJoseHeader(encodedProtectedHeader, ErrorClass, message) {
	let parsed;
	try {
		parsed = JSON.parse(strictDecoder.decode(decode(encodedProtectedHeader)));
	} catch (cause) {
		throw new ErrorClass(message, { cause });
	}
	if (!isObject(parsed)) throw new ErrorClass(message);
	return parsed;
}
function validateAlgorithms(option, algorithms) {
	if (algorithms !== void 0 && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s != "string"))) throw new TypeError(`"${option}" option must be an array of strings`);
	return algorithms === void 0 ? void 0 : new Set(algorithms);
}
function validateCritDuplicates(Err, protectedHeader) {
	const { crit } = protectedHeader ?? {};
	if (Array.isArray(crit) && new Set(crit).size !== crit.length) throw new Err("\"crit\" (Critical) Header Parameter MUST NOT contain duplicate values");
}
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
	if (joseHeader.crit !== void 0 && protectedHeader?.crit === void 0) throw new Err("\"crit\" (Critical) Header Parameter MUST be integrity protected");
	if (!protectedHeader || protectedHeader.crit === void 0) return [];
	if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input != "string" || input.length === 0)) throw new Err("\"crit\" (Critical) Header Parameter MUST be an array of non-empty strings when present");
	const recognized = recognizedOption === void 0 ? recognizedDefault : {
		__proto__: null,
		...recognizedOption,
		...recognizedDefault
	};
	for (const parameter of protectedHeader.crit) {
		if (!(parameter in recognized)) throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
		if (!Object.hasOwn(joseHeader, parameter) || joseHeader[parameter] === void 0) throw new Err(`Extension Header Parameter "${parameter}" is missing`);
		if (recognized[parameter] && (!Object.hasOwn(protectedHeader, parameter) || protectedHeader[parameter] === void 0)) throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
	}
	return protectedHeader.crit;
}
function validateB64(protectedHeader, extensions) {
	if (extensions.includes("b64")) {
		const b64 = protectedHeader.b64;
		if (typeof b64 != "boolean") throw new JWSInvalid("The \"b64\" (base64url-encode payload) Header Parameter must be a boolean");
		return b64;
	}
	return !0;
}
function serializeJoseHeader(Err, header) {
	let serialized, parsed;
	try {
		serialized = JSON.stringify(header), parsed = JSON.parse(serialized);
	} catch (cause) {
		throw new Err("JOSE Header is not valid JSON", { cause });
	}
	if (!isObject(parsed)) throw new Err("JOSE Header is not a JSON object");
	return [parsed, serialized];
}
var JWS_RECOGNIZED, JWE_RECOGNIZED;
var init_validate = __esmMin((() => {
	init_errors();
	init_base64url();
	init_buffer_utils();
	JWS_RECOGNIZED = {
		__proto__: null,
		b64: !0
	}, JWE_RECOGNIZED = { __proto__: null };
}));
//#endregion
//#region node_modules/jose/dist/webapi/lib/key.js
async function prepareKey(entry, key, usage) {
	const { alg, secret } = entry, requiresPrivateKey = usage === "decrypt" || usage === "sign";
	if (secret && key instanceof Uint8Array) return key;
	let normalized, keyObject;
	if (isObject(key)) {
		if (normalized = normalizeJwk(key), typeof normalized.kty != "string") throw invalidKeyType(alg, key, secret);
		if (!(secret ? normalized.kty === "oct" && typeof normalized.k == "string" : normalized.kty !== "oct" && (requiresPrivateKey ? normalized.kty === "AKP" && typeof normalized.priv == "string" || typeof normalized.d == "string" : normalized.d === void 0 && normalized.priv === void 0))) throw new TypeError(secret ? "JSON Web Key for symmetric algorithms must have JWK \"kty\" (Key Type) equal to \"oct\" and the JWK \"k\" (Key Value) present" : `JSON Web Key for this operation must be a ${requiresPrivateKey ? "private" : "public"} JWK`);
		if (jwkMatchesOp(entry, normalized, usage), normalized.kty === "oct") return decode(normalized.k);
		if (!Object.isFrozen(key)) {
			const { key_ops } = key;
			Array.isArray(key_ops) && Object.freeze(key_ops), Object.freeze(key);
		}
	} else {
		if (!isKeyLike(key)) throw invalidKeyType(alg, key, secret);
		const expectedType = secret ? "secret" : requiresPrivateKey ? "private" : "public";
		if (key.type !== expectedType && (secret || [
			"secret",
			"public",
			"private"
		].includes(key.type))) throw new TypeError(`${tag(key)} instances must be of type "${expectedType}" for the ${alg} algorithm`);
		if (isCryptoKey(key)) return key;
		if (keyObject = key, keyObject.type === "secret") return keyObject.export();
	}
	cache ||= /* @__PURE__ */ new WeakMap();
	const cacheKey = key;
	let cached = cache.get(cacheKey);
	if (cached?.[alg]) return cached[alg];
	if (cached || cache.set(cacheKey, cached = {}), keyObject && typeof keyObject.toCryptoKey == "function") {
		const isPublic = keyObject.type === "public", crv = nist[keyObject.asymmetricKeyDetails?.namedCurve], params = entry.resolve?.({
			crv,
			asymmetricKeyType: keyObject.asymmetricKeyType
		}) ?? entry.subtle;
		return cached[alg] = keyObject.toCryptoKey(params, isPublic, entry.usages[isPublic ? 0 : 1]);
	}
	return normalized ??= keyObject.export({ format: "jwk" }), normalized.alg = alg, cached[alg] = await jwkToKey(entry, normalized);
}
function assertCryptoKey(key) {
	if (!isCryptoKey(key)) throw new Error("CryptoKey instance expected");
}
function message(msg, actual, ...types) {
	if (types.length > 2) {
		const last = types.pop();
		msg += `one of type ${types.join(", ")}, or ${last}.`;
	} else types.length === 2 ? msg += `one of type ${types[0]} or ${types[1]}.` : msg += `of type ${types[0]}.`;
	return actual == null ? msg += ` Received ${actual}` : typeof actual == "function" && actual.name ? msg += ` Received function ${actual.name}` : typeof actual == "object" && actual != null && actual.constructor?.name && (msg += ` Received an instance of ${actual.constructor.name}`), msg;
}
function invalidKeyType(alg, actual, secret) {
	const types = [
		"CryptoKey",
		"KeyObject",
		"JSON Web Key"
	];
	return secret && types.push("Uint8Array"), new TypeError(message(`Key for the ${alg} algorithm must be `, actual, ...types));
}
function checkUsage(key, usage) {
	if (usage && !key.usages.includes(usage)) throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage}.`);
}
function checkModulusLength(alg, key) {
	const { modulusLength } = key.algorithm;
	if (typeof modulusLength != "number" || modulusLength < 2048) throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
}
function checkCryptoKey(key, expected, usage) {
	const algorithm = key.algorithm;
	if (algorithm.name !== expected.name) throw unusable(expected.name);
	if (expected.hash && algorithm.hash?.name !== expected.hash) throw unusable(expected.hash, "algorithm.hash");
	if (expected.namedCurve && algorithm.namedCurve !== expected.namedCurve) throw unusable(expected.namedCurve, "algorithm.namedCurve");
	if (expected.length !== void 0 && algorithm.length !== expected.length) throw unusable(expected.length, "algorithm.length");
	checkUsage(key, usage);
}
function snapshotJwk(jwk) {
	return {
		__proto__: null,
		...jwk
	};
}
function normalizeJwk(jwk) {
	const normalized = snapshotJwk(jwk);
	if (normalized.ext !== void 0 && typeof normalized.ext != "boolean") throw new TypeError("\"ext\" (Extractable) Parameter must be a boolean");
	if (normalized.key_ops !== void 0) {
		const value = normalized.key_ops, keyOps = Array.isArray(value) ? [...value] : void 0;
		if (!keyOps || keyOps.some((operation) => typeof operation != "string") || new Set(keyOps).size !== keyOps.length) throw new TypeError("\"key_ops\" (Key Operations) Parameter must be an array of unique strings");
		normalized.key_ops = keyOps;
	}
	return normalized;
}
function validateExtractableOption(extractable) {
	if (extractable !== void 0 && typeof extractable != "boolean") throw new TypeError("\"extractable\" option must be a boolean");
	return extractable;
}
async function jwkToKey(entry, jwk, extractable) {
	if (!entry.kty.includes(jwk.kty)) throw new JOSENotSupported("Invalid or unsupported JWK \"alg\" (Algorithm) Parameter value");
	const algorithm = entry.resolve?.({
		kty: jwk.kty,
		crv: jwk.crv
	}) ?? entry.subtle, isPrivate = !!(jwk.d || jwk.priv), keyData = {
		...jwk,
		ext: extractable ?? jwk.ext
	};
	return keyData.kty !== "AKP" && delete keyData.alg, delete keyData.use, crypto.subtle.importKey("jwk", keyData, algorithm, keyData.ext ?? !isPrivate, jwk.key_ops ?? entry.usages[isPrivate ? 1 : 0]);
}
async function rawKey(key, expected, usage, extractable = !1) {
	return key instanceof Uint8Array && (key = await crypto.subtle.importKey("raw", key, expected, extractable, [usage])), checkCryptoKey(key, expected, usage), key;
}
var tag, jwkMatchesOp, cache, nist, isCryptoKey, isKeyObject, isKeyLike, invalidKeyInput, unusable;
var init_key = __esmMin((() => {
	init_validate();
	init_base64url();
	init_errors();
	tag = (key) => key[Symbol.toStringTag], jwkMatchesOp = (entry, key, usage) => {
		const { alg } = entry;
		if (key.use !== void 0) {
			const expected = usage === "sign" || usage === "verify" ? "sig" : "enc";
			if (key.use !== expected) throw new TypeError(`Invalid key for this operation, its "use" must be "${expected}" when present`);
		}
		if (key.kty === "AKP" && key.alg === void 0) throw new TypeError("missing \"alg\" (Algorithm) Parameter value");
		if (key.alg !== void 0 && key.alg !== alg) throw new TypeError(`Invalid key for this operation, its "alg" must be "${alg}" when present`);
		if (Array.isArray(key.key_ops)) {
			const expectedKeyOp = usage === "encrypt" || usage === "decrypt" ? entry.ops?.[usage === "encrypt" ? 0 : 1] : usage;
			if (expectedKeyOp && !key.key_ops.includes(expectedKeyOp)) throw new TypeError(`Invalid key for this operation, its "key_ops" must include "${expectedKeyOp}" when present`);
		}
	};
	nist = {
		__proto__: null,
		prime256v1: "P-256",
		secp384r1: "P-384",
		secp521r1: "P-521"
	};
	isCryptoKey = (key) => {
		if (key?.[Symbol.toStringTag] === "CryptoKey") return !0;
		try {
			return key instanceof CryptoKey;
		} catch {
			return !1;
		}
	}, isKeyObject = (key) => key?.[Symbol.toStringTag] === "KeyObject", isKeyLike = (key) => isCryptoKey(key) || isKeyObject(key);
	invalidKeyInput = (actual, ...types) => message("Key must be ", actual, ...types);
	unusable = (name, prop = "algorithm.name") => /* @__PURE__ */ new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`);
}));
//#endregion
//#region node_modules/jose/dist/webapi/lib/content_encryption.js
function checkCekLength(cek, expected) {
	const actual = cek.byteLength << 3;
	if (actual !== expected) throw new JWEInvalid(`Invalid Content Encryption Key length. Expected ${expected} bits, got ${actual} bits`);
}
function checkIvLength(enc, iv) {
	if (iv.length << 3 !== enc.ivBits) throw new JWEInvalid("Invalid Initialization Vector length");
}
async function cbcKeySetup(enc, cek, usage) {
	if (!(cek instanceof Uint8Array)) throw new TypeError(invalidKeyInput(cek, "Uint8Array"));
	const keyLengthBits = enc.cekBits >> 1;
	return [
		await crypto.subtle.importKey("raw", cek.subarray(keyLengthBits >> 3), "AES-CBC", !1, [usage]),
		await crypto.subtle.importKey("raw", cek.subarray(0, keyLengthBits >> 3), {
			hash: `SHA-${keyLengthBits << 1}`,
			name: "HMAC"
		}, !1, ["sign"]),
		keyLengthBits
	];
}
async function cbcHmacTag(macKey, macData, keyLengthBits) {
	return new Uint8Array((await crypto.subtle.sign("HMAC", macKey, macData)).slice(0, keyLengthBits >> 3));
}
async function cbcEncrypt(enc, plaintext, cek, iv, aad) {
	const [encKey, macKey, keyLengthBits] = await cbcKeySetup(enc, cek, "encrypt"), ciphertext = new Uint8Array(await crypto.subtle.encrypt({
		iv,
		name: "AES-CBC"
	}, encKey, plaintext));
	return {
		ciphertext,
		tag: await cbcHmacTag(macKey, concat(aad, iv, ciphertext, uint64be(aad.length * 8)), keyLengthBits),
		iv
	};
}
async function timingSafeEqual(a, b) {
	const algorithm = {
		name: "HMAC",
		hash: "SHA-256"
	}, key = await crypto.subtle.generateKey(algorithm, !1, ["sign", "verify"]), aHmac = await crypto.subtle.sign(algorithm, key, a);
	return crypto.subtle.verify(algorithm, key, aHmac, b);
}
async function cbcDecrypt(enc, cek, ciphertext, iv, tag, aad) {
	const [encKey, macKey, keyLengthBits] = await cbcKeySetup(enc, cek, "decrypt"), expectedTag = await cbcHmacTag(macKey, concat(aad, iv, ciphertext, uint64be(aad.length * 8)), keyLengthBits);
	try {
		if (await timingSafeEqual(tag, expectedTag)) return new Uint8Array(await crypto.subtle.decrypt({
			iv,
			name: "AES-CBC"
		}, encKey, ciphertext));
	} catch {}
	throw new JWEDecryptionFailed();
}
async function encrypt(enc, plaintext, cek, iv, aad) {
	if (!isCryptoKey(cek) && !(cek instanceof Uint8Array)) throw new TypeError(invalidKeyInput(cek, "CryptoKey", "KeyObject", "Uint8Array", "JSON Web Key"));
	if (iv ? checkIvLength(enc, iv) : iv = generateIv(enc), cek instanceof Uint8Array && checkCekLength(cek, enc.cekBits), enc.cbc) return cbcEncrypt(enc, plaintext, cek, iv, aad);
	const encKey = await rawKey(cek, enc.subtle, "encrypt"), encrypted = new Uint8Array(await crypto.subtle.encrypt({
		additionalData: aad,
		iv,
		name: "AES-GCM",
		tagLength: 128
	}, encKey, plaintext));
	return {
		ciphertext: encrypted.subarray(0, -16),
		tag: encrypted.subarray(-16),
		iv
	};
}
async function decrypt(enc, cek, ciphertext, iv, tag, aad) {
	if (!isCryptoKey(cek) && !(cek instanceof Uint8Array)) throw new TypeError(invalidKeyInput(cek, "CryptoKey", "KeyObject", "Uint8Array", "JSON Web Key"));
	if (!iv) throw new JWEInvalid("JWE Initialization Vector missing");
	if (!tag) throw new JWEInvalid("JWE Authentication Tag missing");
	if (!enc.cbc && tag.length !== 16) throw new JWEInvalid("Invalid Authentication Tag length");
	if (checkIvLength(enc, iv), cek instanceof Uint8Array && checkCekLength(cek, enc.cekBits), enc.cbc) return cbcDecrypt(enc, cek, ciphertext, iv, tag, aad);
	const encKey = await rawKey(cek, enc.subtle, "decrypt");
	try {
		return new Uint8Array(await crypto.subtle.decrypt({
			additionalData: aad,
			iv,
			name: "AES-GCM",
			tagLength: 128
		}, encKey, concat(ciphertext, tag)));
	} catch {
		throw new JWEDecryptionFailed();
	}
}
var generateCek, generateIv;
var init_content_encryption = __esmMin((() => {
	init_buffer_utils();
	init_key();
	init_errors();
	generateCek = (enc) => crypto.getRandomValues(new Uint8Array(enc.cekBits >> 3));
	generateIv = (enc) => crypto.getRandomValues(new Uint8Array(enc.ivBits >> 3));
}));
//#endregion
//#region node_modules/jose/dist/webapi/lib/key_descriptor.js
function table(entries) {
	const out = { __proto__: null };
	for (const alg in entries) out[alg] = {
		...entries[alg],
		alg
	};
	return out;
}
var init_key_descriptor = __esmMin((() => {}));
//#endregion
//#region node_modules/jose/dist/webapi/lib/jwe_algorithms.js
function rsaes(bits) {
	return {
		kty: ["RSA"],
		mode: "key-encryption",
		subtle: {
			name: "RSA-OAEP",
			hash: `SHA-${bits}`
		},
		usages: wrap,
		ops: ["wrapKey", "unwrapKey"]
	};
}
function ecdh(mode) {
	return {
		kty: ["EC", "OKP"],
		mode,
		subtle: { name: "ECDH" },
		resolve: ({ kty, crv, asymmetricKeyType }) => {
			if (crv === "X25519" || asymmetricKeyType === "x25519") return { name: "X25519" };
			if (kty === "OKP") throw new JOSENotSupported("Invalid or unsupported JWK \"alg\" (Algorithm) Parameter value");
			return {
				name: "ECDH",
				namedCurve: crv
			};
		},
		usages: derive,
		ops: [void 0, "deriveBits"]
	};
}
function aeskw(bits, gcm = !1) {
	return {
		kty: ["oct"],
		mode: "key-wrapping",
		secret: !0,
		subtle: {
			name: gcm ? "AES-GCM" : "AES-KW",
			length: bits
		},
		usages: none,
		ops: gcm ? ["encrypt", "decrypt"] : ["wrapKey", "unwrapKey"]
	};
}
function pbes2() {
	return {
		kty: ["oct"],
		mode: "key-wrapping",
		secret: !0,
		subtle: { name: "PBKDF2" },
		usages: none,
		ops: ["deriveBits", "deriveBits"]
	};
}
function contentEncryption(bits, cbc = !1) {
	return {
		kty: ["oct"],
		secret: !0,
		subtle: {
			name: cbc ? "AES-CBC" : "AES-GCM",
			length: bits
		},
		usages: none,
		ops: contentOps,
		cekBits: bits,
		ivBits: cbc ? 128 : 96,
		cbc
	};
}
function unsupported(parameter, name) {
	throw new JOSENotSupported(`Invalid or unsupported "${parameter}" (JWE ${name}) header value`);
}
function jweAlgorithm(alg) {
	return (typeof alg == "string" ? JWE[alg] : void 0) ?? unsupported("alg", "Algorithm");
}
function isJWECEKTransport(algorithm) {
	return algorithm.mode === "key-wrapping" || algorithm.mode === "key-encryption" || algorithm.mode === "key-agreement-with-key-wrapping";
}
function jweEncryption(enc) {
	return (typeof enc == "string" ? ENC[enc] : void 0) ?? unsupported("enc", "Encryption Algorithm");
}
var wrap, derive, none, JWE, contentOps, ENC;
var init_jwe_algorithms = __esmMin((() => {
	init_errors();
	init_key_descriptor();
	wrap = [["encrypt", "wrapKey"], ["decrypt", "unwrapKey"]], derive = [[], ["deriveBits"]], none = [[], []];
	JWE = table({
		dir: {
			kty: ["oct"],
			mode: "direct-encryption",
			secret: !0,
			subtle: { name: "AES-GCM" },
			usages: none,
			ops: ["encrypt", "decrypt"]
		},
		"RSA-OAEP": rsaes(1),
		"RSA-OAEP-256": rsaes(256),
		"RSA-OAEP-384": rsaes(384),
		"RSA-OAEP-512": rsaes(512),
		"ECDH-ES": ecdh("direct-key-agreement"),
		"ECDH-ES+A128KW": ecdh("key-agreement-with-key-wrapping"),
		"ECDH-ES+A192KW": ecdh("key-agreement-with-key-wrapping"),
		"ECDH-ES+A256KW": ecdh("key-agreement-with-key-wrapping"),
		A128KW: aeskw(128),
		A192KW: aeskw(192),
		A256KW: aeskw(256),
		A128GCMKW: aeskw(128, !0),
		A192GCMKW: aeskw(192, !0),
		A256GCMKW: aeskw(256, !0),
		"PBES2-HS256+A128KW": pbes2(),
		"PBES2-HS384+A192KW": pbes2(),
		"PBES2-HS512+A256KW": pbes2()
	}), contentOps = ["encrypt", "decrypt"];
	ENC = table({
		A128GCM: contentEncryption(128),
		A192GCM: contentEncryption(192),
		A256GCM: contentEncryption(256),
		"A128CBC-HS256": contentEncryption(256, !0),
		"A192CBC-HS384": contentEncryption(384, !0),
		"A256CBC-HS512": contentEncryption(512, !0)
	});
}));
//#endregion
//#region node_modules/jose/dist/webapi/lib/key_management.js
function checkEcdhCryptoKey(key, usage) {
	if (key.algorithm.name !== "ECDH" && key.algorithm.name !== "X25519") throw new TypeError("CryptoKey does not support this operation, its algorithm.name must be ECDH or X25519");
	checkUsage(key, usage);
}
async function aeskwWrap(alg, key, cek) {
	const cryptoKey = await rawKey(key, jweAlgorithm(alg).subtle, "wrapKey", !0), cryptoKeyCek = await crypto.subtle.importKey("raw", cek, {
		hash: "SHA-256",
		name: "HMAC"
	}, !0, ["sign"]);
	return new Uint8Array(await crypto.subtle.wrapKey("raw", cryptoKeyCek, cryptoKey, "AES-KW"));
}
async function aeskwUnwrap(alg, key, encryptedKey) {
	const cryptoKey = await rawKey(key, jweAlgorithm(alg).subtle, "unwrapKey", !0), cryptoKeyCek = await crypto.subtle.unwrapKey("raw", encryptedKey, cryptoKey, "AES-KW", {
		hash: "SHA-256",
		name: "HMAC"
	}, !0, ["sign"]);
	return new Uint8Array(await crypto.subtle.exportKey("raw", cryptoKeyCek));
}
function checkRsaKey(alg, key, usage) {
	checkCryptoKey(key, jweAlgorithm(alg).subtle, usage), checkModulusLength(alg, key);
}
async function deriveKey(p2s, alg, p2c, key) {
	if (!(p2s instanceof Uint8Array) || p2s.length < 8) throw new JWEInvalid("PBES2 Salt Input must be 8 or more octets");
	if (!Number.isSafeInteger(p2c) || Math.sign(p2c) !== 1) throw new JWEInvalid("PBES2 Count Input must be a positive integer");
	const salt = concat(encode$1(alg), Uint8Array.of(0), p2s), keyLengthBits = parseInt(alg.slice(13, 16), 10), subtleAlg = {
		hash: `SHA-${alg.slice(8, 11)}`,
		iterations: p2c,
		name: "PBKDF2",
		salt
	}, cryptoKey = await rawKey(key, jweAlgorithm(alg).subtle, "deriveBits");
	return new Uint8Array(await crypto.subtle.deriveBits(subtleAlg, cryptoKey, keyLengthBits));
}
function lengthAndInput(input) {
	return concat(uint32be(input.length), input);
}
async function concatKdf(Z, keyDataLength, OtherInfo) {
	const dkLen = keyDataLength >> 3, hashLen = 32, reps = Math.ceil(dkLen / hashLen), dk = new Uint8Array(reps * hashLen);
	for (let i = 1; i <= reps; i++) {
		const hashResult = await digest("sha256", concat(uint32be(i), Z, OtherInfo));
		dk.set(hashResult, (i - 1) * hashLen);
	}
	return dk.slice(0, dkLen);
}
async function ecdhesDeriveKey(publicKey, privateKey, algorithmId, keyDataLength, apu = new Uint8Array(), apv = new Uint8Array()) {
	checkEcdhCryptoKey(publicKey), checkEcdhCryptoKey(privateKey, "deriveBits");
	const otherInfo = concat(lengthAndInput(encode$1(algorithmId)), lengthAndInput(apu), lengthAndInput(apv), uint32be(keyDataLength));
	return concatKdf(new Uint8Array(await crypto.subtle.deriveBits({
		name: publicKey.algorithm.name,
		public: publicKey
	}, privateKey, publicKey.algorithm.name === "X25519" ? 256 : Math.ceil(parseInt(publicKey.algorithm.namedCurve.slice(-3), 10) / 8) << 3)), keyDataLength, otherInfo);
}
function assertEcdhKey(key) {
	assertCryptoKey(key);
	const curve = key.algorithm.namedCurve;
	if (curve !== "P-256" && curve !== "P-384" && curve !== "P-521" && key.algorithm.name !== "X25519") throw new JOSENotSupported("ECDH with the provided key is not allowed or not supported by your javascript runtime");
}
function partyInfo(joseHeader, name) {
	const value = joseHeader[name];
	if (value !== void 0) {
		if (typeof value != "string") throw new JWEInvalid(`JOSE Header "${name}" (Agreement Party${name === "apu" ? "U" : "V"}Info) invalid`);
		return decodeBase64url(value, name, JWEInvalid);
	}
}
function checkPartyInfo(apu, apv) {
	if (!(apu === void 0 || apv === void 0 || apu.byteLength !== apv.byteLength)) {
		for (let i = 0; i < apu.byteLength; i++) if (apu[i] !== apv[i]) return;
		throw new JWEInvalid("JOSE Header \"apu\" and \"apv\" values must be distinct");
	}
}
function assertEncryptedKey(encryptedKey) {
	if (encryptedKey === void 0) throw new JWEInvalid("JWE Encrypted Key missing");
}
function assertNoEncryptedKey(encryptedKey) {
	if (encryptedKey !== void 0) throw new JWEInvalid("Encountered unexpected JWE Encrypted Key");
}
function validateMaxPBES2Count(value) {
	if (value !== void 0 && value !== Infinity && (!Number.isSafeInteger(value) || value < 1)) throw new TypeError("maxPBES2Count must be a positive safe integer or Infinity");
}
async function decryptKeyManagement(entry, enc, key, encryptedKey, joseHeader, maxPBES2Count) {
	const { alg } = entry, mode = entry.mode;
	if (mode === "direct-encryption") return assertNoEncryptedKey(encryptedKey), key;
	const direct = mode === "direct-key-agreement";
	switch (direct ? assertNoEncryptedKey(encryptedKey) : assertEncryptedKey(encryptedKey), entry.subtle.name) {
		case "ECDH": {
			const { epk } = joseHeader;
			if (!isObject(epk) || [
				"d",
				"k",
				"p",
				"q",
				"dp",
				"dq",
				"qi",
				"oth",
				"priv"
			].some((parameter) => Object.hasOwn(epk, parameter))) throw new JWEInvalid("JOSE Header \"epk\" (Ephemeral Public Key) missing or invalid");
			assertEcdhKey(key);
			const ephemeralPublicKey = await jwkToKey(entry, epk), partyUInfo = partyInfo(joseHeader, "apu"), partyVInfo = partyInfo(joseHeader, "apv");
			checkPartyInfo(partyUInfo, partyVInfo);
			const derivedKey = await ecdhesDeriveKey(ephemeralPublicKey, key, direct ? enc.alg : alg, direct ? enc.cekBits : parseInt(alg.slice(-5, -2), 10), partyUInfo, partyVInfo);
			if (direct) return derivedKey;
			key = derivedKey;
			break;
		}
		case "RSA-OAEP": return assertCryptoKey(key), checkRsaKey(alg, key, "decrypt"), new Uint8Array(await crypto.subtle.decrypt("RSA-OAEP", key, encryptedKey));
		case "PBKDF2": {
			if (typeof joseHeader.p2c != "number") throw new JWEInvalid("JOSE Header \"p2c\" (PBES2 Count) missing or invalid");
			const p2cLimit = maxPBES2Count ?? 1e4;
			if (joseHeader.p2c > p2cLimit) throw new JWEInvalid("JOSE Header \"p2c\" (PBES2 Count) out is of acceptable bounds");
			if (typeof joseHeader.p2s != "string") throw new JWEInvalid("JOSE Header \"p2s\" (PBES2 Salt) missing or invalid");
			key = await deriveKey(decodeBase64url(joseHeader.p2s, "p2s", JWEInvalid), alg, joseHeader.p2c, key);
			break;
		}
		case "AES-GCM": {
			if (typeof joseHeader.iv != "string") throw new JWEInvalid("JOSE Header \"iv\" (Initialization Vector) missing or invalid");
			if (typeof joseHeader.tag != "string") throw new JWEInvalid("JOSE Header \"tag\" (Authentication Tag) missing or invalid");
			const iv = decodeBase64url(joseHeader.iv, "iv", JWEInvalid), tag = decodeBase64url(joseHeader.tag, "tag", JWEInvalid);
			if (iv.byteLength !== 12) throw new JWEInvalid("Invalid Initialization Vector length");
			if (tag.byteLength !== 16) throw new JWEInvalid("Invalid Authentication Tag length");
			return decrypt(jweEncryption(alg.slice(0, -2)), key, encryptedKey, iv, tag, new Uint8Array());
		}
	}
	return aeskwUnwrap(alg.slice(-6), key, encryptedKey);
}
async function encryptKeyManagement(entry, enc, inputKey, joseHeader, providedCek, providedParameters = {}) {
	const { alg, mode } = entry, transport = isJWECEKTransport(entry);
	if (providedCek !== void 0 && !transport) throw new TypeError(`setContentEncryptionKey cannot be called with JWE "alg" (Algorithm) Header ${alg}`);
	let key = await prepareKey(mode === "direct-encryption" ? enc : entry, inputKey, "encrypt");
	if (mode === "direct-encryption") return [
		key,
		void 0,
		void 0
	];
	const cek = transport ? providedCek ?? generateCek(enc) : void 0;
	cek && checkCekLength(cek, enc.cekBits);
	let encryptedKey, parameters;
	switch (entry.subtle.name) {
		case "ECDH": {
			assertEcdhKey(key);
			const { apu: providedApu, apv: providedApv } = providedParameters;
			providedApu !== void 0 && assertUint8Array(providedApu, "\"apu\""), providedApv !== void 0 && assertUint8Array(providedApv, "\"apv\"");
			const apu = providedApu ?? partyInfo(joseHeader, "apu"), apv = providedApv ?? partyInfo(joseHeader, "apv");
			checkPartyInfo(apu, apv);
			let ephemeralPrivateKey;
			providedParameters.epk !== void 0 ? ephemeralPrivateKey = await prepareKey(entry, providedParameters.epk, "decrypt") : ephemeralPrivateKey = (await crypto.subtle.generateKey(key.algorithm, !0, ["deriveBits"])).privateKey;
			const subtle = crypto.subtle;
			let exportableEpk = ephemeralPrivateKey;
			if (!exportableEpk.extractable) {
				if (typeof subtle.getPublicKey != "function") throw new TypeError("CryptoKey for \"epk\" must be extractable");
				exportableEpk = await subtle.getPublicKey(ephemeralPrivateKey, []);
			}
			const { x, y, crv, kty } = await subtle.exportKey("jwk", exportableEpk), direct = mode === "direct-key-agreement", derivedKey = await ecdhesDeriveKey(key, ephemeralPrivateKey, direct ? enc.alg : alg, direct ? enc.cekBits : parseInt(alg.slice(-5, -2), 10), apu, apv), epk = {
				x,
				crv,
				kty
			};
			if (kty === "EC" && (epk.y = y), parameters = { epk }, providedApu !== void 0 && (parameters.apu = encode(providedApu)), providedApv !== void 0 && (parameters.apv = encode(providedApv)), direct) return [
				derivedKey,
				void 0,
				parameters
			];
			key = derivedKey;
			break;
		}
		case "RSA-OAEP":
			assertCryptoKey(key), checkRsaKey(alg, key, "encrypt"), encryptedKey = new Uint8Array(await crypto.subtle.encrypt("RSA-OAEP", key, cek));
			break;
		case "PBKDF2": {
			const { p2c = 2048, p2s = crypto.getRandomValues(new Uint8Array(16)) } = providedParameters;
			key = await deriveKey(p2s, alg, p2c, key), parameters = {
				p2c,
				p2s: encode(p2s)
			};
			break;
		}
		case "AES-GCM": {
			const iv = providedParameters.iv === void 0 ? crypto.getRandomValues(new Uint8Array(12)) : providedParameters.iv;
			if (!(iv instanceof Uint8Array)) throw new TypeError("\"iv\" must be an instance of Uint8Array");
			const wrapped = await encrypt(jweEncryption(alg.slice(0, -2)), cek, key, iv, new Uint8Array());
			encryptedKey = wrapped.ciphertext, parameters = {
				iv: encode(wrapped.iv),
				tag: encode(wrapped.tag)
			};
		}
	}
	if (encryptedKey ??= await aeskwWrap(alg.slice(-6), key, cek), !(encryptedKey instanceof Uint8Array) || !encryptedKey.byteLength) throw new TypeError("JWE key management algorithm did not produce an Encrypted Key");
	return [
		cek,
		encryptedKey,
		parameters
	];
}
var init_key_management = __esmMin((() => {
	init_base64url();
	init_key();
	init_jwe_algorithms();
	init_errors();
	init_validate();
	init_buffer_utils();
	init_content_encryption();
}));
//#endregion
//#region node_modules/jose/dist/webapi/lib/deflate.js
function validateZip(joseHeader, protectedHeader) {
	if (joseHeader.zip !== void 0 && joseHeader.zip !== "DEF") throw new JOSENotSupported("Unsupported JWE \"zip\" (Compression Algorithm) Header Parameter value.");
	if (joseHeader.zip !== void 0 && !protectedHeader?.zip) throw new JWEInvalid("JWE \"zip\" (Compression Algorithm) Header Parameter MUST be in a protected header.");
}
function supported(name) {
	if (typeof globalThis[name] > "u") throw new JOSENotSupported(`JWE "zip" (Compression Algorithm) Header Parameter requires the ${name} API.`);
}
async function transform(stream, input, maxLength = Infinity) {
	const writer = stream.writable.getWriter();
	writer.write(input).catch(() => {}), writer.close().catch(() => {});
	const chunks = [];
	let length = 0;
	const reader = stream.readable.getReader();
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		if (chunks.push(value), length += value.byteLength, maxLength !== Infinity && length > maxLength) throw await reader.cancel().catch(() => {}), new JWEInvalid("Decompressed plaintext exceeded the configured limit");
	}
	return concat(...chunks);
}
async function compress(input) {
	return supported("CompressionStream"), transform(new CompressionStream("deflate-raw"), input);
}
async function decompress(input, maxLength) {
	return supported("DecompressionStream"), transform(new DecompressionStream("deflate-raw"), input, maxLength);
}
var init_deflate = __esmMin((() => {
	init_errors();
	init_buffer_utils();
}));
//#endregion
//#region node_modules/jose/dist/webapi/lib/jwe_decrypt.js
function snapshotSharedJWE(jwe) {
	const { aad, ciphertext, iv, protected: encodedProtected, tag, unprotected } = jwe;
	if (iv !== void 0 && (typeof iv != "string" || !iv)) throw new JWEInvalid("JWE Initialization Vector incorrect type");
	if (typeof ciphertext != "string") throw new JWEInvalid("JWE Ciphertext missing or incorrect type");
	if (tag !== void 0 && (typeof tag != "string" || !tag)) throw new JWEInvalid("JWE Authentication Tag incorrect type");
	if (encodedProtected !== void 0 && typeof encodedProtected != "string") throw new JWEInvalid("JWE Protected Header incorrect type");
	if (aad !== void 0 && (typeof aad != "string" || !aad)) throw new JWEInvalid("JWE AAD incorrect type");
	if (unprotected !== void 0 && !isObject(unprotected)) throw new JWEInvalid("JWE Shared Unprotected Header incorrect type");
	return {
		aad,
		ciphertext,
		iv,
		protected: encodedProtected,
		tag,
		unprotected: unprotected === void 0 ? void 0 : { ...unprotected }
	};
}
function snapshotRecipientJWE(recipient) {
	let header, headerAlg;
	try {
		const { header: inputHeader } = recipient;
		if (isObject(inputHeader)) {
			headerAlg = inputHeader.alg;
			const parameters = Object.keys(inputHeader);
			parameters.includes("alg") || (headerAlg = void 0), header = Object.fromEntries(parameters.map((parameter) => [parameter, parameter === "alg" ? headerAlg : inputHeader[parameter]]));
		} else header = inputHeader;
		const { encrypted_key: encryptedKey } = recipient;
		return [{
			encrypted_key: encryptedKey,
			header
		}, headerAlg];
	} catch (error) {
		return [
			void 0,
			headerAlg,
			error
		];
	}
}
function checkRecipient(jwe) {
	const { encrypted_key: encryptedKey, header } = jwe;
	if (encryptedKey !== void 0 && typeof encryptedKey != "string") throw new JWEInvalid("JWE Encrypted Key incorrect type");
	if (header !== void 0 && !isObject(header)) throw new JWEInvalid("JWE Per-Recipient Unprotected Header incorrect type");
	if (jwe.protected === void 0 && header === void 0 && jwe.unprotected === void 0) throw new JWEInvalid("JOSE Header missing");
}
function shareJWE(jwe) {
	const { protected: encodedProtected, ciphertext, iv, tag, aad } = jwe;
	let protectedHeader;
	return encodedProtected !== void 0 && (protectedHeader = parseJoseHeader(encodedProtected, JWEInvalid, "JWE Protected Header is invalid")), [
		protectedHeader,
		decodeBase64url(ciphertext, "ciphertext", JWEInvalid),
		iv !== void 0 ? decodeBase64url(iv, "iv", JWEInvalid) : void 0,
		tag !== void 0 ? decodeBase64url(tag, "tag", JWEInvalid) : void 0,
		encodeAsciiMember((encodedProtected ?? "") + (aad !== void 0 ? `.${aad}` : ""), "aad", JWEInvalid)
	];
}
function prepareDecrypt(options) {
	const keyManagementAlgorithms = options && validateAlgorithms("keyManagementAlgorithms", options.keyManagementAlgorithms), contentEncryptionAlgorithms = options && validateAlgorithms("contentEncryptionAlgorithms", options.contentEncryptionAlgorithms), { crit, maxPBES2Count, maxDecompressedLength } = options ?? {};
	validateMaxPBES2Count(maxPBES2Count);
	const decompressionLimit = maxDecompressedLength ?? 25e4;
	if (decompressionLimit !== 0 && decompressionLimit !== Infinity && (!Number.isSafeInteger(decompressionLimit) || decompressionLimit < 1)) throw new TypeError("maxDecompressedLength must be 0, a positive safe integer, or Infinity");
	return [
		keyManagementAlgorithms,
		contentEncryptionAlgorithms,
		crit,
		maxPBES2Count,
		maxDecompressedLength
	];
}
async function decryptJWE(jwe, shared, key, token = shareJWE(jwe)) {
	const [protectedHeader, ciphertext, iv, tag, additionalAuthenticatedData] = token, { header, unprotected, aad } = jwe;
	let joseHeader;
	if (header !== void 0 || unprotected !== void 0) {
		if (!isDisjoint(protectedHeader, header, unprotected)) throw new JWEInvalid("JWE Protected, JWE Unprotected Header, and JWE Per-Recipient Unprotected Header Parameter names must be disjoint");
		joseHeader = {
			...protectedHeader,
			...header,
			...unprotected
		};
	} else joseHeader = protectedHeader ?? {};
	const [keyManagementAlgorithms, contentEncryptionAlgorithms, crit, maxPBES2Count, maxDecompressedLength] = shared, { encrypted_key: encodedKey } = jwe;
	validateCrit(JWEInvalid, JWE_RECOGNIZED, crit, protectedHeader, joseHeader), validateZip(joseHeader, protectedHeader);
	const { alg, enc } = joseHeader;
	if (typeof alg != "string" || !alg) throw new JWEInvalid("missing JWE Algorithm (alg) in JWE Header");
	const selected = JWE[alg];
	if (encodedKey === "" && (!selected || !isJWECEKTransport(selected))) throw new JWEInvalid("JWE Encrypted Key incorrect type");
	const integrated = selected?.mode === "integrated-encryption";
	if (!integrated && (typeof enc != "string" || !enc)) throw new JWEInvalid("missing JWE Encryption Algorithm (enc) in JWE Header");
	if (keyManagementAlgorithms && !keyManagementAlgorithms.has(alg) || !keyManagementAlgorithms && alg.startsWith("PBES2")) throw new JOSEAlgNotAllowed("\"alg\" (Algorithm) Header Parameter value not allowed");
	let encEntry;
	if (integrated) {
		if (enc !== void 0) throw new JWEInvalid("JWE \"enc\" (Encryption Algorithm) Header Parameter must not be present for integrated encryption");
		if (iv?.byteLength) throw new JWEInvalid("JWE Initialization Vector must be empty for integrated encryption");
		if (tag?.byteLength) throw new JWEInvalid("JWE Authentication Tag must be empty for integrated encryption");
	} else {
		if (contentEncryptionAlgorithms && !contentEncryptionAlgorithms.has(enc)) throw new JOSEAlgNotAllowed("\"enc\" (Encryption Algorithm) Header Parameter value not allowed");
		encEntry = jweEncryption(enc);
	}
	let encryptedKey;
	if (encodedKey !== void 0) try {
		encryptedKey = decodeBase64url(encodedKey, "encrypted_key", JWEInvalid);
	} catch (error) {
		if (!selected || !isJWECEKTransport(selected)) throw error;
		encryptedKey = new Uint8Array();
	}
	let resolvedKey = !1;
	typeof key == "function" && (key = await key(protectedHeader, jwe), resolvedKey = !0);
	const algEntry = selected ?? jweAlgorithm(alg);
	isJWECEKTransport(algEntry) && encryptedKey === void 0 && (encryptedKey = new Uint8Array());
	const k = await prepareKey(algEntry.mode === "direct-encryption" ? encEntry : algEntry, key, "decrypt");
	let plaintext;
	if (algEntry.mode === "integrated-encryption") plaintext = await algEntry.decrypt(k, encryptedKey, ciphertext, additionalAuthenticatedData, protectedHeader, joseHeader);
	else {
		const encryption = encEntry;
		let cek;
		try {
			cek = await decryptKeyManagement(algEntry, encryption, k, encryptedKey, joseHeader, maxPBES2Count), isJWECEKTransport(algEntry) && cek instanceof Uint8Array && cek.byteLength << 3 !== encryption.cekBits && (cek = generateCek(encryption));
		} catch (err) {
			if (err instanceof TypeError || err instanceof JWEInvalid || err instanceof JOSENotSupported) throw err;
			cek = generateCek(encryption);
		}
		plaintext = await decrypt(encryption, cek, ciphertext, iv, tag, additionalAuthenticatedData);
	}
	if (joseHeader.zip === "DEF") {
		const decompressionLimit = maxDecompressedLength ?? 25e4;
		if (decompressionLimit === 0) throw new JOSENotSupported("JWE \"zip\" (Compression Algorithm) Header Parameter is not supported.");
		plaintext = await decompress(plaintext, decompressionLimit).catch((cause) => {
			throw cause instanceof JWEInvalid || cause instanceof JOSENotSupported ? cause : new JWEInvalid("Failed to decompress plaintext", { cause });
		});
	}
	return {
		plaintext,
		...protectedHeader && { protectedHeader },
		...aad !== void 0 && { additionalAuthenticatedData: decodeBase64url(aad, "aad", JWEInvalid) },
		...unprotected && { sharedUnprotectedHeader: unprotected },
		...header && { unprotectedHeader: header },
		...resolvedKey && { key: k }
	};
}
async function decryptCompact(jwe, shared, key) {
	if (jwe instanceof Uint8Array && (jwe = decoder.decode(jwe)), typeof jwe != "string") throw new JWEInvalid("Compact JWE must be a string or Uint8Array");
	const { 0: protectedHeader, 1: encryptedKey, 2: iv, 3: ciphertext, 4: tag, length } = jwe.split(".");
	if (length !== 5) throw new JWEInvalid("Invalid Compact JWE");
	return decryptJWE({
		ciphertext,
		iv: iv || void 0,
		protected: protectedHeader,
		tag: tag || void 0,
		encrypted_key: encryptedKey || void 0
	}, shared, key);
}
var init_jwe_decrypt = __esmMin((() => {
	init_content_encryption();
	init_validate();
	init_errors();
	init_key_management();
	init_buffer_utils();
	init_key();
	init_jwe_algorithms();
	init_deflate();
}));
//#endregion
//#region node_modules/jose/dist/webapi/jwe/compact/decrypt.js
async function compactDecrypt(jwe, key, options) {
	return decryptCompact(jwe, prepareDecrypt(options), key);
}
var init_decrypt$3 = __esmMin((() => {
	init_jwe_decrypt();
}));
//#endregion
//#region node_modules/jose/dist/webapi/jwe/flattened/decrypt.js
async function flattenedDecrypt(jwe, key, options) {
	if (!isObject(jwe)) throw new JWEInvalid("Flattened JWE must be an object");
	const shared = snapshotSharedJWE(jwe), [recipient, , error] = snapshotRecipientJWE(jwe);
	if (!recipient) throw error;
	const snapshot = {
		...shared,
		...recipient
	};
	return checkRecipient(snapshot), decryptJWE(snapshot, prepareDecrypt(options), key);
}
var init_decrypt$2 = __esmMin((() => {
	init_errors();
	init_validate();
	init_jwe_decrypt();
}));
//#endregion
//#region node_modules/jose/dist/webapi/jwe/general/decrypt.js
async function generalDecrypt(jwe, key, options) {
	if (!isObject(jwe)) throw new JWEInvalid("General JWE must be an object");
	const inputRecipients = jwe.recipients;
	if (!Array.isArray(inputRecipients)) throw new JWEInvalid("JWE Recipients missing or incorrect type");
	const recipients = Array.from(inputRecipients);
	if (!recipients.every(isObject)) throw new JWEInvalid("JWE Recipients missing or incorrect type");
	if (!recipients.length) throw new JWEInvalid("JWE Recipients has no members");
	const shared = prepareDecrypt(options);
	let sharedJwe, token;
	try {
		sharedJwe = snapshotSharedJWE(jwe), token = shareJWE(sharedJwe);
	} catch {
		throw new JWEDecryptionFailed();
	}
	const recipientSnapshots = recipients.map((recipient) => snapshotRecipientJWE(recipient));
	if (recipients.length > 1) for (const [, headerAlg] of recipientSnapshots) {
		const alg = token[0]?.alg ?? headerAlg ?? sharedJwe.unprotected?.alg, algEntry = typeof alg == "string" ? JWE[alg] : void 0;
		if (algEntry && !isJWECEKTransport(algEntry)) throw new JWEInvalid(`"${alg}" alg may only have a single recipient`);
	}
	for (const [recipient] of recipientSnapshots) if (recipient) try {
		const flattened = {
			...sharedJwe,
			...recipient
		};
		return checkRecipient(flattened), await decryptJWE(flattened, shared, key, token);
	} catch {}
	throw new JWEDecryptionFailed();
}
var init_decrypt$1 = __esmMin((() => {
	init_jwe_decrypt();
	init_errors();
	init_validate();
	init_jwe_algorithms();
}));
//#endregion
//#region node_modules/jose/dist/webapi/lib/jwe_encrypt.js
function checkDisjoint(protectedHeader, unprotectedHeader, sharedUnprotectedHeader) {
	if (!isDisjoint(protectedHeader, unprotectedHeader, sharedUnprotectedHeader)) throw new JWEInvalid("JWE Protected, JWE Shared Unprotected and JWE Per-Recipient Header Parameter names must be disjoint");
}
function checkEncryptHeaders(input, options, sharedHeadersNormalized = !1) {
	if (!input[1] && !input[2] && !input[3]) throw new JWEInvalid("either setProtectedHeader, setUnprotectedHeader, or sharedUnprotectedHeader must be called before #encrypt()");
	options !== void 0 && (input[8] = options?.crit);
	let [, protectedHeader, unprotectedHeader, sharedUnprotectedHeader, aad, cek, iv, keyManagementParameters, crit] = input;
	if (aad !== void 0 && assertUint8Array(aad, "JWE Additional Authenticated Data"), cek !== void 0 && assertUint8Array(cek, "JWE Content Encryption Key"), iv !== void 0 && assertUint8Array(iv, "JWE Initialization Vector"), !sharedHeadersNormalized && protectedHeader !== void 0 && (protectedHeader = serializeJoseHeader(JWEInvalid, protectedHeader)[0], input[1] = protectedHeader), unprotectedHeader !== void 0 && (unprotectedHeader = serializeJoseHeader(JWEInvalid, unprotectedHeader)[0], input[2] = unprotectedHeader), !sharedHeadersNormalized && sharedUnprotectedHeader !== void 0 && (sharedUnprotectedHeader = serializeJoseHeader(JWEInvalid, sharedUnprotectedHeader)[0], input[3] = sharedUnprotectedHeader), keyManagementParameters !== void 0 && !isObject(keyManagementParameters)) throw new TypeError("JWE Key Management Parameters must be an object");
	checkDisjoint(protectedHeader, unprotectedHeader, sharedUnprotectedHeader);
	const joseHeader = {
		...protectedHeader,
		...unprotectedHeader,
		...sharedUnprotectedHeader
	};
	validateCritDuplicates(JWEInvalid, protectedHeader), validateCrit(JWEInvalid, JWE_RECOGNIZED, crit, protectedHeader, joseHeader), validateZip(joseHeader, protectedHeader);
	const { alg, enc } = joseHeader;
	if (typeof alg != "string" || !alg) throw new JWEInvalid("JWE \"alg\" (Algorithm) Header Parameter missing or invalid");
	const algEntry = JWE[alg];
	if (algEntry?.mode === "integrated-encryption") {
		if (enc !== void 0) throw new JWEInvalid("JWE \"enc\" (Encryption Algorithm) Header Parameter must not be present for integrated encryption");
		if (cek !== void 0) throw new TypeError(`setContentEncryptionKey cannot be called with JWE "alg" (Algorithm) Header ${alg}`);
		if (iv !== void 0) throw new TypeError(`setInitializationVector cannot be called with JWE "alg" (Algorithm) Header ${alg}`);
		return [
			joseHeader,
			void 0,
			algEntry
		];
	}
	if (typeof enc != "string" || !enc) throw new JWEInvalid("JWE \"enc\" (Encryption Algorithm) Header Parameter missing or invalid");
	return [
		joseHeader,
		jweEncryption(enc),
		algEntry
	];
}
async function encryptJWE(input, checked, key) {
	const [joseHeader, encEntry, selected] = checked, [inputPlaintext, inputProtectedHeader, inputUnprotectedHeader, sharedUnprotectedHeader, aad, providedCek, inputIv, keyManagementParameters, , unprotectedParameters] = input;
	let protectedHeader = inputProtectedHeader, unprotectedHeader = inputUnprotectedHeader;
	const algEntry = selected ?? jweAlgorithm(joseHeader.alg);
	let encryptedKey, parameters, cek;
	algEntry.mode === "integrated-encryption" ? cek = await prepareKey(algEntry, key, "encrypt") : [cek, encryptedKey, parameters] = await encryptKeyManagement(algEntry, encEntry, key, joseHeader, providedCek, keyManagementParameters), parameters && (unprotectedParameters ? unprotectedHeader = unprotectedHeader ? {
		...unprotectedHeader,
		...parameters
	} : parameters : protectedHeader = protectedHeader ? {
		...protectedHeader,
		...parameters
	} : parameters, checkDisjoint(protectedHeader, unprotectedHeader, sharedUnprotectedHeader));
	const encodedProtectedHeader = protectedHeader ? encode(JSON.stringify(protectedHeader)) : "", encodedAad = aad?.byteLength ? encode(aad) : void 0, additionalAuthenticatedData = encode$1(encodedAad ? `${encodedProtectedHeader}.${encodedAad}` : encodedProtectedHeader);
	let plaintext = inputPlaintext;
	joseHeader.zip === "DEF" && (plaintext = await compress(plaintext).catch((cause) => {
		throw cause instanceof JOSENotSupported ? cause : new JWEInvalid("Failed to compress plaintext", { cause });
	}));
	let ciphertext, tag, iv;
	algEntry.mode === "integrated-encryption" ? [encryptedKey, ciphertext] = await algEntry.encrypt(cek, plaintext, additionalAuthenticatedData, protectedHeader, joseHeader, keyManagementParameters) : {ciphertext, tag, iv} = await encrypt(encEntry, plaintext, cek, inputIv, additionalAuthenticatedData);
	const jwe = { ciphertext: encode(ciphertext) };
	return iv && (jwe.iv = encode(iv)), tag && (jwe.tag = encode(tag)), encryptedKey?.byteLength && (jwe.encrypted_key = encode(encryptedKey)), encodedAad && (jwe.aad = encodedAad), protectedHeader && (jwe.protected = encodedProtectedHeader), sharedUnprotectedHeader && (jwe.unprotected = sharedUnprotectedHeader), unprotectedHeader && (jwe.header = unprotectedHeader), jwe;
}
async function createJWE(input, key, options) {
	return encryptJWE(input, checkEncryptHeaders(input, options), key);
}
function compactJWE(jwe) {
	return [
		jwe.protected,
		jwe.encrypted_key,
		jwe.iv,
		jwe.ciphertext,
		jwe.tag
	].join(".");
}
var init_jwe_encrypt = __esmMin((() => {
	init_base64url();
	init_content_encryption();
	init_key_management();
	init_errors();
	init_validate();
	init_buffer_utils();
	init_key();
	init_jwe_algorithms();
	init_deflate();
}));
//#endregion
//#region node_modules/jose/dist/webapi/jwe/general/encrypt.js
var IndividualRecipient, GeneralEncrypt;
var init_encrypt$3 = __esmMin((() => {
	init_validate();
	init_errors();
	init_content_encryption();
	init_base64url();
	init_jwe_encrypt();
	init_key_management();
	init_jwe_algorithms();
	IndividualRecipient = class {
		#parent;
		state;
		constructor(enc, key, crit) {
			this.#parent = enc, this.state = [
				void 0,
				void 0,
				key,
				crit
			];
		}
		setUnprotectedHeader(unprotectedHeader) {
			return assertNotSet(this.state[0], "setUnprotectedHeader"), this.state[0] = unprotectedHeader, this;
		}
		setKeyManagementParameters(parameters) {
			return assertNotSet(this.state[1], "setKeyManagementParameters"), this.state[1] = parameters, this;
		}
		addRecipient(...args) {
			return this.#parent.addRecipient(...args);
		}
		encrypt(...args) {
			return this.#parent.encrypt(...args);
		}
		done() {
			return this.#parent;
		}
	};
	GeneralEncrypt = class {
		#plaintext;
		#recipients = [];
		#protectedHeader;
		#sharedUnprotectedHeader;
		#aad;
		constructor(plaintext) {
			this.#plaintext = plaintext;
		}
		addRecipient(key, options) {
			const recipient = new IndividualRecipient(this, key, options?.crit);
			return this.#recipients.push(recipient), recipient;
		}
		setProtectedHeader(protectedHeader) {
			return assertNotSet(this.#protectedHeader, "setProtectedHeader"), this.#protectedHeader = protectedHeader, this;
		}
		setSharedUnprotectedHeader(sharedUnprotectedHeader) {
			return assertNotSet(this.#sharedUnprotectedHeader, "setSharedUnprotectedHeader"), this.#sharedUnprotectedHeader = sharedUnprotectedHeader, this;
		}
		setAdditionalAuthenticatedData(aad) {
			return this.#aad = aad, this;
		}
		async encrypt() {
			if (!this.#recipients.length) throw new JWEInvalid("at least one recipient must be added");
			assertUint8Array(this.#plaintext, "plaintext");
			const multiple = this.#recipients.length > 1;
			let enc, protectedHeader = this.#protectedHeader, sharedUnprotectedHeader = this.#sharedUnprotectedHeader;
			const recipients = [];
			for (const recipient of this.#recipients) {
				const [unprotectedHeader, keyManagementParameters, key, crit] = recipient.state, input = [
					this.#plaintext,
					protectedHeader,
					unprotectedHeader,
					sharedUnprotectedHeader,
					this.#aad,
					void 0,
					void 0,
					keyManagementParameters,
					crit,
					multiple
				], headers = checkEncryptHeaders(input, void 0, recipients.length > 0);
				recipients.length || (protectedHeader = input[1], sharedUnprotectedHeader = input[3]), recipients.push([
					input,
					headers,
					key
				]);
				const [{ alg, enc: recipientEnc }, , algEntry] = headers;
				if (multiple && algEntry && !isJWECEKTransport(algEntry)) throw new JWEInvalid(`"${alg}" alg may only have a single recipient`);
				if (!enc) enc = recipientEnc;
				else if (enc !== recipientEnc) throw new JWEInvalid("JWE \"enc\" (Encryption Algorithm) Header Parameter must be the same for all recipients");
			}
			for (const [, headers] of recipients) headers[2] ??= jweAlgorithm(headers[0].alg);
			const [firstInput, firstHeaders, firstKey] = recipients[0], cek = multiple ? generateCek(firstHeaders[1]) : void 0;
			firstInput[5] = cek;
			const { encrypted_key, header, ...shared } = await encryptJWE(firstInput, firstHeaders, firstKey), jwe = {
				...shared,
				recipients: [{}]
			};
			encrypted_key && (jwe.recipients[0].encrypted_key = encrypted_key), header && (jwe.recipients[0].header = header);
			for (let i = 1; i < recipients.length; i++) {
				const [input, [joseHeader, encEntry, algEntry], key] = recipients[i], unprotectedHeader = input[2], [, encryptedKey, parameters] = await encryptKeyManagement(algEntry, encEntry, key, joseHeader, cek, input[7]), target = { encrypted_key: encode(encryptedKey) };
				if (unprotectedHeader || parameters) {
					const header2 = {
						...unprotectedHeader,
						...parameters
					};
					parameters && checkDisjoint(input[1], header2, input[3]), target.header = header2;
				}
				jwe.recipients.push(target);
			}
			return jwe;
		}
	};
}));
//#endregion
//#region node_modules/jose/dist/webapi/lib/jws_algorithms.js
function hmac(bits) {
	const subtle = {
		name: "HMAC",
		hash: `SHA-${bits}`
	};
	return {
		kty: ["oct"],
		secret: !0,
		subtle,
		signing: subtle,
		usages: sig
	};
}
function rsa(bits, saltLength) {
	const subtle = {
		name: saltLength ? "RSA-PSS" : "RSASSA-PKCS1-v1_5",
		hash: `SHA-${bits}`
	};
	return {
		kty: ["RSA"],
		subtle,
		signing: saltLength ? {
			...subtle,
			saltLength
		} : subtle,
		usages: sig,
		minRsaBits: 2048
	};
}
function ecdsa(crv, bits) {
	return {
		kty: ["EC"],
		crv,
		subtle: {
			name: "ECDSA",
			namedCurve: crv
		},
		signing: {
			name: "ECDSA",
			hash: `SHA-${bits}`
		},
		usages: sig
	};
}
function eddsa() {
	const subtle = { name: "Ed25519" };
	return {
		kty: ["OKP"],
		crv: "Ed25519",
		subtle,
		signing: subtle,
		usages: sig
	};
}
function mldsa(parameterSet) {
	const subtle = { name: `ML-DSA-${parameterSet}` };
	return {
		kty: ["AKP"],
		subtle,
		signing: subtle,
		usages: sig
	};
}
function jwsAlgorithm(alg) {
	const entry = typeof alg == "string" ? JWS[alg] : void 0;
	if (!entry) throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
	return entry;
}
var sig, JWS;
var init_jws_algorithms = __esmMin((() => {
	init_errors();
	init_key_descriptor();
	sig = [["verify"], ["sign"]];
	JWS = table({
		HS256: hmac(256),
		HS384: hmac(384),
		HS512: hmac(512),
		RS256: rsa(256),
		RS384: rsa(384),
		RS512: rsa(512),
		PS256: rsa(256, 32),
		PS384: rsa(384, 48),
		PS512: rsa(512, 64),
		ES256: ecdsa("P-256", 256),
		ES384: ecdsa("P-384", 384),
		ES512: ecdsa("P-521", 512),
		EdDSA: eddsa(),
		Ed25519: eddsa(),
		"ML-DSA-44": mldsa(44),
		"ML-DSA-65": mldsa(65),
		"ML-DSA-87": mldsa(87)
	});
}));
//#endregion
//#region node_modules/jose/dist/webapi/lib/jws_verify.js
function snapshotJws(jws, sharedPayload) {
	const encodedProtectedHeader = jws.protected, inputHeader = jws.header, header = isObject(inputHeader) ? { ...inputHeader } : inputHeader;
	let payload = sharedPayload ? sharedPayload[0] : jws.payload;
	!sharedPayload && payload instanceof Uint8Array && (payload = new Uint8Array(payload));
	const signature = jws.signature, snapshot = {
		payload,
		signature
	};
	if (encodedProtectedHeader !== void 0 && (snapshot.protected = encodedProtectedHeader), inputHeader !== void 0 && (snapshot.header = header), encodedProtectedHeader === void 0 && header === void 0) throw new JWSInvalid("Flattened JWS must have either of the \"protected\" or \"header\" members");
	if (encodedProtectedHeader !== void 0 && typeof encodedProtectedHeader != "string") throw new JWSInvalid("JWS Protected Header incorrect type");
	if (payload === void 0) throw new JWSInvalid("JWS Payload missing");
	if (typeof signature != "string") throw new JWSInvalid("JWS Signature missing or incorrect type");
	if (header !== void 0 && !isObject(header)) throw new JWSInvalid("JWS Unprotected Header incorrect type");
	return snapshot;
}
function prepareVerify(options) {
	return [options && validateAlgorithms("algorithms", options.algorithms), options?.crit];
}
function parseProtectedHeader(encodedProtectedHeader) {
	return encodedProtectedHeader === void 0 ? {} : parseJoseHeader(encodedProtectedHeader, JWSInvalid, "JWS Protected Header is invalid");
}
function encodeJsonUnencodedPayload(payload) {
	const invalid = /[\p{Cs}\p{Cn}]/u.exec(payload)?.[0];
	if (invalid !== void 0) throw new JWSInvalid(/\p{Cs}/u.test(invalid) ? "JWS Payload must be a well-formed Unicode string" : "JWS Payload must not contain unassigned Unicode code points");
	return encoder.encode(payload);
}
function encodeCompactUnencodedPayload(payload) {
	try {
		return encode$1(payload);
	} catch (cause) {
		throw new JWSInvalid("JWS Compact Serialization payload must use only ASCII characters", { cause });
	}
}
async function verifySignature(jws, shared, key, encodeUnencodedPayload, parsedProtected) {
	const { protected: encodedProtectedHeader, header, payload: inputPayload } = jws, protectedHeader = parsedProtected ?? parseProtectedHeader(encodedProtectedHeader);
	if (!isDisjoint(protectedHeader, header)) throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
	const joseHeader = {
		...protectedHeader,
		...header
	}, b64 = validateB64(protectedHeader, validateCrit(JWSInvalid, JWS_RECOGNIZED, shared[1], protectedHeader, joseHeader)), { alg } = joseHeader;
	if (typeof alg != "string" || !alg) throw new JWSInvalid("JWS \"alg\" (Algorithm) Header Parameter missing or invalid");
	if (shared[0] && !shared[0].has(alg)) throw new JOSEAlgNotAllowed("\"alg\" (Algorithm) Header Parameter value not allowed");
	if (b64) {
		if (typeof inputPayload != "string") throw new JWSInvalid("JWS Payload must be a string");
	} else if (typeof inputPayload != "string" && !(inputPayload instanceof Uint8Array)) throw new JWSInvalid("JWS Payload must be a string or an Uint8Array instance");
	const signingPayload = b64 || typeof inputPayload != "string" ? inputPayload : encodeUnencodedPayload(inputPayload);
	let resolvedKey = !1;
	typeof key == "function" && (key = await key(protectedHeader, jws), resolvedKey = !0);
	const entry = jwsAlgorithm(alg), signingInput = concat(encodedProtectedHeader !== void 0 ? encode$1(encodedProtectedHeader) : new Uint8Array(), encode$1("."), typeof signingPayload == "string" ? shared[2] ??= encodeAsciiMember(signingPayload, "payload", JWSInvalid) : signingPayload), signature = decodeBase64url(jws.signature, "signature", JWSInvalid), verificationKey = await prepareKey(entry, key, "verify"), cryptoKey = await rawKey(verificationKey, entry.subtle, "verify");
	entry.minRsaBits && checkModulusLength(entry.alg, cryptoKey);
	let verified = !1;
	try {
		verified = await crypto.subtle.verify(entry.signing, cryptoKey, signature, signingInput);
	} catch (cause) {
		throw new JWSSignatureVerificationFailed(void 0, { cause });
	}
	if (!verified) throw new JWSSignatureVerificationFailed();
	const result = { payload: typeof signingPayload == "string" ? decodeBase64url(signingPayload, "payload", JWSInvalid) : signingPayload };
	return encodedProtectedHeader !== void 0 && (result.protectedHeader = protectedHeader), header !== void 0 && (result.unprotectedHeader = header), resolvedKey ? [{
		...result,
		key: verificationKey
	}, b64] : [result, b64];
}
async function verifyCompact(jws, shared, key) {
	if (jws instanceof Uint8Array && (jws = decoder.decode(jws)), typeof jws != "string") throw new JWSInvalid("Compact JWS must be a string or Uint8Array");
	const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
	if (length !== 3) throw new JWSInvalid("Invalid Compact JWS");
	return verifySignature({
		payload,
		protected: protectedHeader,
		signature
	}, shared, key, encodeCompactUnencodedPayload);
}
var init_jws_verify = __esmMin((() => {
	init_jws_algorithms();
	init_errors();
	init_buffer_utils();
	init_validate();
	init_key();
}));
//#endregion
//#region node_modules/jose/dist/webapi/jws/compact/verify.js
async function compactVerify(jws, key, options) {
	const [result] = await verifyCompact(jws, prepareVerify(options), key);
	return result;
}
var init_verify$3 = __esmMin((() => {
	init_jws_verify();
}));
//#endregion
//#region node_modules/jose/dist/webapi/jws/flattened/verify.js
async function flattenedVerify(jws, key, options) {
	if (!isObject(jws)) throw new JWSInvalid("Flattened JWS must be an object");
	const [result] = await verifySignature(snapshotJws(jws), prepareVerify(options), key, encodeJsonUnencodedPayload);
	return result;
}
var init_verify$2 = __esmMin((() => {
	init_errors();
	init_validate();
	init_jws_verify();
}));
//#endregion
//#region node_modules/jose/dist/webapi/jws/general/verify.js
function snapshotSignature(signature, payload) {
	try {
		const jws = snapshotJws(signature, [payload]), protectedHeader = parseProtectedHeader(jws.protected), { b64, crit } = protectedHeader;
		return [
			jws,
			protectedHeader,
			Array.isArray(crit) && crit.includes("b64") ? typeof b64 == "boolean" ? b64 ? 1 : 2 : 0 : 1
		];
	} catch {
		return;
	}
}
async function generalVerify(jws, key, options) {
	if (!isObject(jws)) throw new JWSInvalid("General JWS must be an object");
	const { signatures, payload: inputPayload } = jws;
	if (!Array.isArray(signatures)) throw new JWSInvalid("JWS Signatures missing or incorrect type");
	const signatureEntries = Array.from(signatures);
	if (!signatureEntries.every(isObject)) throw new JWSInvalid("JWS Signatures missing or incorrect type");
	if (inputPayload === void 0) throw new JWSSignatureVerificationFailed();
	const shared = prepareVerify(options), payload = inputPayload instanceof Uint8Array ? new Uint8Array(inputPayload) : inputPayload, candidates = signatureEntries.map((signature) => snapshotSignature(signature, payload)).filter((candidate) => candidate !== void 0);
	let payloadEncodings = 0;
	for (const [, , payloadEncoding] of candidates) if (payloadEncodings |= payloadEncoding, payloadEncodings === 3) throw new JWSInvalid("inconsistent use of JWS Unencoded Payload (RFC7797)");
	for (const candidate of candidates) try {
		const [result] = await verifySignature(candidate[0], shared, key, encodeJsonUnencodedPayload, candidate[1]);
		return result;
	} catch {}
	throw new JWSSignatureVerificationFailed();
}
var init_verify$1 = __esmMin((() => {
	init_jws_verify();
	init_errors();
	init_validate();
}));
//#endregion
//#region node_modules/jose/dist/webapi/lib/jwt_claims_set.js
function invalidDuration() {
	throw new TypeError("Invalid time period format");
}
function secs(str) {
	typeof str != "string" && invalidDuration();
	const matched = REGEX.exec(str);
	(!matched || matched[4] && matched[1]) && invalidDuration();
	const value = parseFloat(matched[2]), durationSeconds = Math.round(value * multipliers[matched[3][0].toLowerCase()]);
	return Number.isFinite(durationSeconds) || invalidDuration(), matched[1] === "-" || matched[4]?.toLowerCase() === "ago" ? -durationSeconds : durationSeconds;
}
function validateInput(label, input) {
	if (!Number.isFinite(input)) throw new TypeError(`Invalid ${label} input`);
	return input;
}
function validateStringClaim(claim, value) {
	if (typeof value != "string") throw new TypeError(`"${claim}" claim must be a string`);
}
function validateAudienceClaim(value) {
	if (typeof value != "string" && (!Array.isArray(value) || Array.from(value).some((member) => typeof member != "string"))) throw new TypeError("\"aud\" claim must be a string or an array of strings");
}
function numericDate(value, label) {
	return typeof value == "number" ? validateInput(label, value) : value instanceof Date ? validateInput(label, epoch(value)) : epoch(/* @__PURE__ */ new Date()) + secs(value);
}
function validateNumericDate(claimsSet, claim, required = !1) {
	const value = claimsSet[claim];
	if (!(value === void 0 && !required)) {
		if (typeof value != "number") throw new JWTClaimValidationFailed(`"${claim}" claim must be a number`, claimsSet, claim, "invalid");
		return value;
	}
}
function unexpectedClaim(claimsSet, claim) {
	throw new JWTClaimValidationFailed(`unexpected "${claim}" claim value`, claimsSet, claim, checkFailed);
}
function validateClaimsSet(protectedHeader, claimsSetBytes, options = {}) {
	let claimsSet;
	try {
		claimsSet = JSON.parse(strictDecoder.decode(claimsSetBytes));
	} catch (cause) {
		throw new JWTInvalid("JWT Claims Set must be a top-level JSON object", { cause });
	}
	if (!isObject(claimsSet)) throw new JWTInvalid("JWT Claims Set must be a top-level JSON object");
	const { typ } = options;
	if (typ !== void 0 && (typeof protectedHeader.typ != "string" || normalizeTyp(protectedHeader.typ) !== normalizeTyp(typ))) throw new JWTClaimValidationFailed("unexpected \"typ\" JWT header value", claimsSet, "typ", checkFailed);
	const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options, presenceCheck = [...requiredClaims];
	maxTokenAge !== void 0 && presenceCheck.push("iat"), audience !== void 0 && presenceCheck.push("aud"), subject !== void 0 && presenceCheck.push("sub"), issuer !== void 0 && presenceCheck.push("iss");
	for (const claim of new Set(presenceCheck.reverse())) if (!Object.hasOwn(claimsSet, claim)) throw new JWTClaimValidationFailed(`missing required "${claim}" claim`, claimsSet, claim, "missing");
	issuer !== void 0 && !(Array.isArray(issuer) ? issuer : [issuer]).includes(claimsSet.iss) && unexpectedClaim(claimsSet, "iss"), subject !== void 0 && claimsSet.sub !== subject && unexpectedClaim(claimsSet, "sub"), audience !== void 0 && !checkAudiencePresence(claimsSet.aud, typeof audience == "string" ? [audience] : audience) && unexpectedClaim(claimsSet, "aud");
	const { clockTolerance } = options;
	let tolerance = 0;
	if (typeof clockTolerance == "string") tolerance = secs(clockTolerance);
	else if (clockTolerance !== void 0) {
		if (typeof clockTolerance != "number") throw new TypeError("Invalid clockTolerance option type");
		tolerance = clockTolerance;
	}
	if (validateInput("clockTolerance option", tolerance), tolerance < 0) throw new TypeError("Invalid clockTolerance option input");
	const { currentDate } = options, now = validateInput("currentDate option", epoch(currentDate === void 0 ? /* @__PURE__ */ new Date() : currentDate)), iat = validateNumericDate(claimsSet, "iat", maxTokenAge !== void 0), nbf = validateNumericDate(claimsSet, "nbf");
	if (nbf !== void 0 && nbf > now + tolerance) throw new JWTClaimValidationFailed("\"nbf\" claim timestamp check failed", claimsSet, "nbf", checkFailed);
	const exp = validateNumericDate(claimsSet, "exp");
	if (exp !== void 0 && exp <= now - tolerance) throw new JWTExpired("\"exp\" claim timestamp check failed", claimsSet, "exp", checkFailed);
	if (maxTokenAge !== void 0) {
		const age = now - iat, max = validateInput("maxTokenAge option", typeof maxTokenAge == "number" ? maxTokenAge : secs(maxTokenAge));
		if (max < 0) throw new TypeError("Invalid maxTokenAge option input");
		if (age - tolerance > max) throw new JWTExpired("\"iat\" claim timestamp check failed (too far in the past)", claimsSet, "iat", checkFailed);
		if (age < -tolerance) throw new JWTClaimValidationFailed("\"iat\" claim timestamp check failed (it should be in the past)", claimsSet, "iat", checkFailed);
	}
	return claimsSet;
}
function producerClaimsSet(producer) {
	return producerClaimsSets.get(producer);
}
function jwtClaimsSetBytes(producer) {
	const claimsSet = producerClaimsSet(producer);
	for (const claim of [
		"iat",
		"nbf",
		"exp"
	]) {
		const value = claimsSet[claim];
		if (typeof value == "number" && !Number.isFinite(value)) throw new TypeError(`"${claim}" claim must be a finite number`);
	}
	return encoder.encode(JSON.stringify(claimsSet));
}
function jwtClaim(producer, claim) {
	return producerClaimsSet(producer)[claim];
}
var epoch, multipliers, REGEX, checkFailed, normalizeTyp, checkAudiencePresence, producerClaimsSets, JWTClaimsBuilder;
var init_jwt_claims_set = __esmMin((() => {
	init_errors();
	init_buffer_utils();
	init_validate();
	epoch = (date) => Math.floor(date.getTime() / 1e3), multipliers = {
		s: 1,
		m: 60,
		h: 3600,
		d: 86400,
		w: 604800,
		y: 31557600
	}, REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i, checkFailed = "check_failed";
	normalizeTyp = (value) => {
		const normalized = value.toLowerCase();
		return value.includes("/") ? normalized : `application/${normalized}`;
	}, checkAudiencePresence = (audPayload, audOption) => typeof audPayload == "string" ? audOption.includes(audPayload) : Array.isArray(audPayload) ? audOption.some((aud) => audPayload.includes(aud)) : !1;
	JWTClaimsBuilder = class {
		constructor(claimsSet = {}) {
			if (!isObject(claimsSet)) throw new TypeError("JWT Claims Set MUST be an object");
			(producerClaimsSets ||= /* @__PURE__ */ new WeakMap()).set(this, structuredClone(claimsSet));
		}
		setIssuer(value) {
			return validateStringClaim("iss", value), producerClaimsSet(this).iss = value, this;
		}
		setSubject(value) {
			return validateStringClaim("sub", value), producerClaimsSet(this).sub = value, this;
		}
		setAudience(value) {
			return validateAudienceClaim(value), producerClaimsSet(this).aud = value, this;
		}
		setJti(value) {
			return validateStringClaim("jti", value), producerClaimsSet(this).jti = value, this;
		}
		setNotBefore(value) {
			return producerClaimsSet(this).nbf = numericDate(value, "setNotBefore"), this;
		}
		setExpirationTime(value) {
			return producerClaimsSet(this).exp = numericDate(value, "setExpirationTime"), this;
		}
		setIssuedAt(value) {
			const claimsSet = producerClaimsSet(this);
			return value === void 0 ? claimsSet.iat = epoch(/* @__PURE__ */ new Date()) : typeof value == "string" ? claimsSet.iat = validateInput("setIssuedAt", epoch(/* @__PURE__ */ new Date()) + secs(value)) : claimsSet.iat = numericDate(value, "setIssuedAt"), this;
		}
	};
}));
//#endregion
//#region node_modules/jose/dist/webapi/jwt/verify.js
async function jwtVerify(jwt, key, options) {
	const [verified, b64] = await verifyCompact(jwt, prepareVerify(options), key);
	if (!b64) throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
	const payload = validateClaimsSet(verified.protectedHeader, verified.payload, options);
	return {
		...verified,
		payload
	};
}
var init_verify = __esmMin((() => {
	init_jws_verify();
	init_jwt_claims_set();
	init_errors();
}));
//#endregion
//#region node_modules/jose/dist/webapi/jwt/decrypt.js
async function jwtDecrypt(jwt, key, options) {
	const { plaintext, ...result } = await decryptCompact(jwt, prepareDecrypt(options), key), { protectedHeader } = result, payload = validateClaimsSet(protectedHeader, plaintext, options);
	for (const claim of [
		"iss",
		"sub",
		"aud"
	]) if (protectedHeader[claim] !== void 0 && (claim === "aud" ? JSON.stringify(protectedHeader.aud) !== JSON.stringify(payload.aud) : protectedHeader[claim] !== payload[claim])) throw new JWTClaimValidationFailed(`replicated "${claim}" claim header parameter mismatch`, payload, claim, "mismatch");
	return {
		payload,
		...result
	};
}
var init_decrypt = __esmMin((() => {
	init_jwe_decrypt();
	init_jwt_claims_set();
	init_errors();
}));
//#endregion
//#region node_modules/jose/dist/webapi/jwe/compact/encrypt.js
var CompactEncrypt;
var init_encrypt$2 = __esmMin((() => {
	init_validate();
	init_jwe_encrypt();
	CompactEncrypt = class {
		#input;
		constructor(plaintext) {
			assertUint8Array(plaintext, "plaintext"), this.#input = [plaintext];
		}
		setContentEncryptionKey(cek) {
			return assertNotSet(this.#input[5], "setContentEncryptionKey"), this.#input[5] = cek, this;
		}
		setInitializationVector(iv) {
			return assertNotSet(this.#input[6], "setInitializationVector"), this.#input[6] = iv, this;
		}
		setProtectedHeader(protectedHeader) {
			return assertNotSet(this.#input[1], "setProtectedHeader"), this.#input[1] = protectedHeader, this;
		}
		setKeyManagementParameters(parameters) {
			return assertNotSet(this.#input[7], "setKeyManagementParameters"), this.#input[7] = parameters, this;
		}
		async encrypt(key, options) {
			return compactJWE(await createJWE([...this.#input], key, options));
		}
	};
}));
//#endregion
//#region node_modules/jose/dist/webapi/jwe/flattened/encrypt.js
var FlattenedEncrypt;
var init_encrypt$1 = __esmMin((() => {
	init_validate();
	init_jwe_encrypt();
	FlattenedEncrypt = class {
		#input;
		constructor(plaintext) {
			assertUint8Array(plaintext, "plaintext"), this.#input = [plaintext];
		}
		setKeyManagementParameters(parameters) {
			return assertNotSet(this.#input[7], "setKeyManagementParameters"), this.#input[7] = parameters, this;
		}
		setProtectedHeader(protectedHeader) {
			return assertNotSet(this.#input[1], "setProtectedHeader"), this.#input[1] = protectedHeader, this;
		}
		setSharedUnprotectedHeader(sharedUnprotectedHeader) {
			return assertNotSet(this.#input[3], "setSharedUnprotectedHeader"), this.#input[3] = sharedUnprotectedHeader, this;
		}
		setUnprotectedHeader(unprotectedHeader) {
			return assertNotSet(this.#input[2], "setUnprotectedHeader"), this.#input[2] = unprotectedHeader, this;
		}
		setAdditionalAuthenticatedData(aad) {
			return this.#input[4] = aad, this;
		}
		setContentEncryptionKey(cek) {
			return assertNotSet(this.#input[5], "setContentEncryptionKey"), this.#input[5] = cek, this;
		}
		setInitializationVector(iv) {
			return assertNotSet(this.#input[6], "setInitializationVector"), this.#input[6] = iv, this;
		}
		async encrypt(key, options) {
			return createJWE([...this.#input], key, options);
		}
	};
}));
//#endregion
//#region node_modules/jose/dist/webapi/lib/jws_sign.js
async function createSignature(input, key, rejectUnencoded) {
	let [payload, protectedHeader, unprotectedHeader, crit] = input, encodedProtectedHeader = "";
	if (protectedHeader !== void 0) {
		const normalized = serializeJoseHeader(JWSInvalid, protectedHeader);
		protectedHeader = normalized[0], encodedProtectedHeader = encode(normalized[1]);
	}
	if (unprotectedHeader !== void 0 && (unprotectedHeader = serializeJoseHeader(JWSInvalid, unprotectedHeader)[0]), !protectedHeader && !unprotectedHeader) throw new JWSInvalid("either setProtectedHeader or setUnprotectedHeader must be called before #sign()");
	if (!isDisjoint(protectedHeader, unprotectedHeader)) throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
	const joseHeader = {
		...protectedHeader,
		...unprotectedHeader
	};
	validateCritDuplicates(JWSInvalid, protectedHeader);
	const b64 = validateB64(protectedHeader, validateCrit(JWSInvalid, JWS_RECOGNIZED, crit, protectedHeader, joseHeader));
	b64 || rejectUnencoded?.();
	const { alg } = joseHeader;
	if (typeof alg != "string" || !alg) throw new JWSInvalid("JWS \"alg\" (Algorithm) Header Parameter missing or invalid");
	const entry = jwsAlgorithm(alg);
	let encodedPayload = "", signingPayload = payload, signingInput;
	if (b64) {
		const encodedPayloadCache = input[4];
		encodedPayloadCache ? (encodedPayload = encodedPayloadCache[0] ??= encode(payload), signingPayload = encodedPayloadCache[1] ??= encode$1(encodedPayload)) : (encodedPayload = encode(payload), signingInput = encoder.encode(`${encodedProtectedHeader}.${encodedPayload}`));
	}
	signingInput ??= concat(encode$1(encodedProtectedHeader), encode$1("."), signingPayload);
	const signingKey = await rawKey(await prepareKey(entry, key, "sign"), entry.subtle, "sign");
	entry.minRsaBits && checkModulusLength(entry.alg, signingKey);
	const jws = {
		signature: encode(new Uint8Array(await crypto.subtle.sign(entry.signing, signingKey, signingInput))),
		payload: encodedPayload
	};
	return protectedHeader && (jws.protected = encodedProtectedHeader), unprotectedHeader && (jws.header = unprotectedHeader), [jws, b64];
}
async function createCompactSignature(payload, protectedHeader, crit, key, rejectUnencoded) {
	const [jws] = await createSignature([
		payload,
		protectedHeader,
		void 0,
		crit
	], key, rejectUnencoded);
	return `${jws.protected}.${jws.payload}.${jws.signature}`;
}
var init_jws_sign = __esmMin((() => {
	init_base64url();
	init_jws_algorithms();
	init_validate();
	init_errors();
	init_buffer_utils();
	init_key();
}));
//#endregion
//#region node_modules/jose/dist/webapi/jws/compact/sign.js
var CompactSign;
var init_sign$3 = __esmMin((() => {
	init_jws_sign();
	init_validate();
	CompactSign = class {
		#payload;
		#protectedHeader;
		constructor(payload) {
			assertUint8Array(payload, "payload"), this.#payload = payload;
		}
		setProtectedHeader(protectedHeader) {
			return assertNotSet(this.#protectedHeader, "setProtectedHeader"), this.#protectedHeader = protectedHeader, this;
		}
		async sign(key, options) {
			return createCompactSignature(this.#payload, this.#protectedHeader, options?.crit, key, () => {
				throw new TypeError("use the flattened module for creating JWS with b64: false");
			});
		}
	};
}));
//#endregion
//#region node_modules/jose/dist/webapi/jws/flattened/sign.js
var FlattenedSign;
var init_sign$2 = __esmMin((() => {
	init_jws_sign();
	init_validate();
	FlattenedSign = class {
		#input;
		constructor(payload) {
			assertUint8Array(payload, "payload"), this.#input = [payload];
		}
		setProtectedHeader(protectedHeader) {
			return assertNotSet(this.#input[1], "setProtectedHeader"), this.#input[1] = protectedHeader, this;
		}
		setUnprotectedHeader(unprotectedHeader) {
			return assertNotSet(this.#input[2], "setUnprotectedHeader"), this.#input[2] = unprotectedHeader, this;
		}
		async sign(key, options) {
			const input = [...this.#input];
			input[3] = options?.crit;
			const [jws] = await createSignature(input, key);
			return jws;
		}
	};
}));
//#endregion
//#region node_modules/jose/dist/webapi/jws/general/sign.js
var IndividualSignature, GeneralSign;
var init_sign$1 = __esmMin((() => {
	init_jws_sign();
	init_errors();
	init_validate();
	IndividualSignature = class {
		#parent;
		state;
		constructor(sig, key, options) {
			this.#parent = sig, this.state = [
				void 0,
				void 0,
				key,
				options?.crit
			];
		}
		setProtectedHeader(protectedHeader) {
			return assertNotSet(this.state[0], "setProtectedHeader"), this.state[0] = protectedHeader, this;
		}
		setUnprotectedHeader(unprotectedHeader) {
			return assertNotSet(this.state[1], "setUnprotectedHeader"), this.state[1] = unprotectedHeader, this;
		}
		addSignature(...args) {
			return this.#parent.addSignature(...args);
		}
		sign(...args) {
			return this.#parent.sign(...args);
		}
		done() {
			return this.#parent;
		}
	};
	GeneralSign = class {
		#payload;
		#signatures = [];
		constructor(payload) {
			this.#payload = payload;
		}
		addSignature(key, options) {
			const signature = new IndividualSignature(this, key, options);
			return this.#signatures.push(signature), signature;
		}
		async sign() {
			if (!this.#signatures.length) throw new JWSInvalid("at least one signature must be added");
			assertUint8Array(this.#payload, "payload");
			const jws = {
				signatures: [],
				payload: ""
			}, encodedPayloadCache = [];
			let b64;
			for (const signature of this.#signatures) {
				const [protectedHeader, unprotectedHeader, key, crit] = signature.state, [{ payload, ...signatureMembers }, signatureB64] = await createSignature([
					this.#payload,
					protectedHeader,
					unprotectedHeader,
					crit,
					encodedPayloadCache
				], key);
				if (b64 === void 0) b64 = signatureB64, jws.payload = payload;
				else if (b64 !== signatureB64) throw new JWSInvalid("inconsistent use of JWS Unencoded Payload (RFC7797)");
				jws.signatures.push(signatureMembers);
			}
			return jws;
		}
	};
}));
//#endregion
//#region node_modules/jose/dist/webapi/jwt/sign.js
var SignJWT_base, SignJWT;
var init_sign = __esmMin((() => {
	init_jws_sign();
	init_errors();
	init_jwt_claims_set();
	init_validate();
	SignJWT_base = JWTClaimsBuilder;
	SignJWT = class extends SignJWT_base {
		#protectedHeader;
		setProtectedHeader(protectedHeader) {
			return assertNotSet(this.#protectedHeader, "setProtectedHeader"), this.#protectedHeader = protectedHeader, this;
		}
		async sign(key, options) {
			return createCompactSignature(jwtClaimsSetBytes(this), this.#protectedHeader, options?.crit, key, () => {
				throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
			});
		}
	};
}));
//#endregion
//#region node_modules/jose/dist/webapi/jwt/encrypt.js
var EncryptJWT_base, EncryptJWT;
var init_encrypt = __esmMin((() => {
	init_jwe_encrypt();
	init_jwt_claims_set();
	init_validate();
	EncryptJWT_base = JWTClaimsBuilder;
	EncryptJWT = class extends EncryptJWT_base {
		#input = [void 0];
		#replicateIssuerAsHeader;
		#replicateSubjectAsHeader;
		#replicateAudienceAsHeader;
		setProtectedHeader(protectedHeader) {
			return assertNotSet(this.#input[1], "setProtectedHeader"), this.#input[1] = protectedHeader, this;
		}
		setKeyManagementParameters(parameters) {
			return assertNotSet(this.#input[7], "setKeyManagementParameters"), this.#input[7] = parameters, this;
		}
		setContentEncryptionKey(cek) {
			return assertNotSet(this.#input[5], "setContentEncryptionKey"), this.#input[5] = cek, this;
		}
		setInitializationVector(iv) {
			return assertNotSet(this.#input[6], "setInitializationVector"), this.#input[6] = iv, this;
		}
		replicateIssuerAsHeader() {
			return this.#replicateIssuerAsHeader = !0, this;
		}
		replicateSubjectAsHeader() {
			return this.#replicateSubjectAsHeader = !0, this;
		}
		replicateAudienceAsHeader() {
			return this.#replicateAudienceAsHeader = !0, this;
		}
		async encrypt(key, options) {
			const input = [...this.#input];
			if (input[0] = jwtClaimsSetBytes(this), input[1] && (this.#replicateIssuerAsHeader || this.#replicateSubjectAsHeader || this.#replicateAudienceAsHeader)) {
				const header = { ...input[1] };
				this.#replicateIssuerAsHeader && (header.iss = jwtClaim(this, "iss")), this.#replicateSubjectAsHeader && (header.sub = jwtClaim(this, "sub")), this.#replicateAudienceAsHeader && (header.aud = jwtClaim(this, "aud")), input[1] = header;
			}
			return compactJWE(await createJWE(input, key, options));
		}
	};
}));
//#endregion
//#region node_modules/jose/dist/webapi/lib/key_algorithm.js
function unsupportedAlg(source = "JWK \"alg\" (Algorithm) Parameter") {
	throw new JOSENotSupported(`Invalid or unsupported ${source} value`);
}
function keyAlgorithm(alg, source) {
	return (typeof alg == "string" ? JWS[alg] ?? JWE[alg] : void 0) ?? unsupportedAlg(source);
}
var algArgument;
var init_key_algorithm = __esmMin((() => {
	init_errors();
	init_jws_algorithms();
	init_jwe_algorithms();
	algArgument = "\"alg\" (Algorithm)";
}));
//#endregion
//#region node_modules/jose/dist/webapi/lib/asn1.js
function parseKeyHeader(state, keyFormat) {
	if (expectTag(state, 48, `Invalid ${keyFormat === "spki" ? "SPKI" : "PKCS#8"} structure`), parseLength(state), keyFormat === "pkcs8") {
		expectTag(state, 2, "Expected version field");
		const length = parseLength(state);
		state.pos += length;
	}
	expectTag(state, 48, "Expected algorithm identifier"), parseLength(state);
}
function spkiFromX509(buf) {
	const state = createASN1State(buf);
	expectTag(state, 48, "Invalid certificate structure");
	const certificateLength = parseLength(state);
	if (certificateLength < 0 || state.pos + certificateLength > state.data.length) throw new Error("Unexpected end of ASN.1 input");
	expectTag(state, 48, "Invalid tbsCertificate structure"), parseLength(state), buf[state.pos] === 160 ? skipElement(state, 6) : skipElement(state, 5);
	const spkiStart = state.pos;
	expectTag(state, 48, "Invalid SPKI structure");
	const spkiContentLen = parseLength(state);
	return buf.subarray(spkiStart, spkiStart + spkiContentLen + (state.pos - spkiStart));
}
var formatPEM, genericExport, toSPKI, toPKCS8, bytesEqual, createASN1State, readByte, parseLength, skipElement, expectTag, getSubarray, parseAlgorithmOID, parseECAlgorithmIdentifier, genericImport, processPEMData, fromPKCS8, fromSPKI, fromX509;
var init_asn1 = __esmMin((() => {
	init_key();
	init_buffer_utils();
	init_errors();
	init_key_algorithm();
	formatPEM = (b64, descriptor) => {
		return `-----BEGIN ${descriptor}-----
${(b64.match(/.{1,64}/g) || []).join(`
`)}
-----END ${descriptor}-----`;
	}, genericExport = async (keyType, keyFormat, key) => {
		if (isKeyObject(key)) {
			if (key.type !== keyType) throw new TypeError(`key is not a ${keyType} key`);
			return key.export({
				format: "pem",
				type: keyFormat
			});
		}
		if (!isCryptoKey(key)) throw new TypeError(invalidKeyInput(key, "CryptoKey", "KeyObject"));
		if (!key.extractable) throw new TypeError("CryptoKey is not extractable");
		if (key.type !== keyType) throw new TypeError(`key is not a ${keyType} key`);
		return formatPEM(encodeBase64(new Uint8Array(await crypto.subtle.exportKey(keyFormat, key))), `${keyType.toUpperCase()} KEY`);
	}, toSPKI = (key) => genericExport("public", "spki", key), toPKCS8 = (key) => genericExport("private", "pkcs8", key), bytesEqual = (a, b) => {
		if (a.byteLength !== b.length) return !1;
		for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return !1;
		return !0;
	}, createASN1State = (data) => ({
		data,
		pos: 0
	}), readByte = (state) => {
		const byte = state.data[state.pos++];
		if (byte === void 0) throw new Error("Unexpected end of ASN.1 input");
		return byte;
	}, parseLength = (state) => {
		const first = readByte(state);
		if (first & 128) {
			const lengthOfLen = first & 127;
			let length = 0;
			for (let i = 0; i < lengthOfLen; i++) length = length << 8 | readByte(state);
			return length;
		}
		return first;
	}, skipElement = (state, count = 1) => {
		for (; count-- > 0;) {
			state.pos++;
			const length = parseLength(state);
			state.pos += length;
		}
	}, expectTag = (state, expectedTag, errorMessage) => {
		if (readByte(state) !== expectedTag) throw new Error(errorMessage);
	}, getSubarray = (state, length) => {
		if (length < 0 || state.pos + length > state.data.length) throw new Error("Unexpected end of ASN.1 input");
		const result = state.data.subarray(state.pos, state.pos + length);
		return state.pos += length, result;
	}, parseAlgorithmOID = (state) => {
		expectTag(state, 6, "Expected algorithm OID");
		return getSubarray(state, parseLength(state));
	};
	parseECAlgorithmIdentifier = (state) => {
		const algOid = parseAlgorithmOID(state);
		if (bytesEqual(algOid, [
			43,
			101,
			110
		])) return "X25519";
		if (!bytesEqual(algOid, [
			42,
			134,
			72,
			206,
			61,
			2,
			1
		])) throw new Error("Unsupported key algorithm");
		expectTag(state, 6, "Expected curve OID");
		const curveOid = getSubarray(state, parseLength(state));
		if (bytesEqual(curveOid, [
			42,
			134,
			72,
			206,
			61,
			3,
			1,
			7
		])) return "P-256";
		if (bytesEqual(curveOid, [
			43,
			129,
			4,
			0,
			34
		])) return "P-384";
		if (bytesEqual(curveOid, [
			43,
			129,
			4,
			0,
			35
		])) return "P-521";
		throw new Error("Unsupported named curve");
	}, genericImport = async (keyFormat, keyData, alg, options) => {
		const extractable = validateExtractableOption(options?.extractable), entry = keyAlgorithm(alg, algArgument);
		entry.secret && unsupportedAlg("\"alg\" (Algorithm)");
		const isPublic = keyFormat === "spki";
		let algorithm;
		if (entry.resolve) try {
			const state = createASN1State(keyData);
			parseKeyHeader(state, keyFormat), algorithm = entry.resolve({ crv: parseECAlgorithmIdentifier(state) });
		} catch (cause) {
			throw new JOSENotSupported("Invalid or unsupported key format", { cause });
		}
		else algorithm = entry.subtle;
		return crypto.subtle.importKey(keyFormat, keyData, algorithm, extractable ?? isPublic, entry.usages[isPublic ? 0 : 1]);
	}, processPEMData = (pem, pattern) => decodeBase64(pem.replace(pattern, "")), fromPKCS8 = (pem, alg, options) => {
		return genericImport("pkcs8", processPEMData(pem, /(?:-----(?:BEGIN|END) PRIVATE KEY-----|\s)/g), alg, options);
	}, fromSPKI = (pem, alg, options) => {
		return genericImport("spki", processPEMData(pem, /(?:-----(?:BEGIN|END) PUBLIC KEY-----|\s)/g), alg, options);
	};
	fromX509 = (pem, alg, options) => {
		let spki;
		try {
			spki = spkiFromX509(processPEMData(pem, /(?:-----(?:BEGIN|END) CERTIFICATE-----|\s)/g));
		} catch (cause) {
			throw new TypeError("Failed to parse the X.509 certificate", { cause });
		}
		return genericImport("spki", spki, alg, options);
	};
}));
//#endregion
//#region node_modules/jose/dist/webapi/key/export.js
function exportSPKI(key) {
	return toSPKI(key);
}
function exportPKCS8(key) {
	return toPKCS8(key);
}
async function exportJWK(key) {
	if (isKeyObject(key)) if (key.type === "secret") key = key.export();
	else return key.export({ format: "jwk" });
	if (key instanceof Uint8Array) return {
		kty: "oct",
		k: encode(key)
	};
	if (!isCryptoKey(key)) throw new TypeError(invalidKeyInput(key, "CryptoKey", "KeyObject", "Uint8Array"));
	if (!key.extractable) throw new TypeError("non-extractable CryptoKey cannot be exported as a JWK");
	const jwk = await crypto.subtle.exportKey("jwk", key);
	delete jwk.ext, delete jwk.key_ops, delete jwk.use, jwk.kty !== "AKP" && delete jwk.alg;
	for (const parameter of Object.keys(jwk)) jwk[parameter] === void 0 && delete jwk[parameter];
	return jwk;
}
var init_export = __esmMin((() => {
	init_asn1();
	init_key();
	init_base64url();
}));
//#endregion
//#region node_modules/jose/dist/webapi/jwk/thumbprint.js
async function calculateJwkThumbprint(key, digestAlgorithm) {
	let jwk;
	if (isObject(key)) {
		if (jwk = snapshotJwk(key), typeof jwk.kty != "string") throw new TypeError(invalidKeyInput(key, "CryptoKey", "KeyObject", "JSON Web Key"));
	} else if (isKeyLike(key)) jwk = snapshotJwk(await exportJWK(key));
	else throw new TypeError(invalidKeyInput(key, "CryptoKey", "KeyObject", "JSON Web Key"));
	if (digestAlgorithm ??= "sha256", digestAlgorithm !== "sha256" && digestAlgorithm !== "sha384" && digestAlgorithm !== "sha512") throw new TypeError("digestAlgorithm must one of \"sha256\", \"sha384\", or \"sha512\"");
	let requiredMembers;
	switch (jwk.kty) {
		case "AKP":
			check(jwk.alg, "\"alg\" (Algorithm) Parameter"), check(jwk.pub, "\"pub\" (Public key) Parameter"), requiredMembers = {
				alg: jwk.alg,
				kty: jwk.kty,
				pub: jwk.pub
			};
			break;
		case "EC":
			check(jwk.crv, "\"crv\" (Curve) Parameter"), check(jwk.x, "\"x\" (X Coordinate) Parameter"), check(jwk.y, "\"y\" (Y Coordinate) Parameter"), requiredMembers = {
				crv: jwk.crv,
				kty: jwk.kty,
				x: jwk.x,
				y: jwk.y
			};
			break;
		case "OKP":
			check(jwk.crv, "\"crv\" (Subtype of Key Pair) Parameter"), check(jwk.x, "\"x\" (Public Key) Parameter"), requiredMembers = {
				crv: jwk.crv,
				kty: jwk.kty,
				x: jwk.x
			};
			break;
		case "RSA":
			check(jwk.e, "\"e\" (Exponent) Parameter"), check(jwk.n, "\"n\" (Modulus) Parameter"), requiredMembers = {
				e: jwk.e,
				kty: jwk.kty,
				n: jwk.n
			};
			break;
		case "oct":
			if (typeof jwk.k != "string") throw new JWKInvalid("\"k\" (Key Value) Parameter missing or invalid");
			requiredMembers = {
				k: jwk.k,
				kty: jwk.kty
			};
			break;
		default: throw new JOSENotSupported("\"kty\" (Key Type) Parameter missing or unsupported");
	}
	const thumbprintInput = encode$1(JSON.stringify(requiredMembers));
	return encode(await digest(digestAlgorithm, thumbprintInput));
}
async function calculateJwkThumbprintUri(key, digestAlgorithm) {
	digestAlgorithm ??= "sha256";
	const thumbprint = await calculateJwkThumbprint(key, digestAlgorithm);
	return `urn:ietf:params:oauth:jwk-thumbprint:sha-${digestAlgorithm.slice(-3)}:${thumbprint}`;
}
var check;
var init_thumbprint = __esmMin((() => {
	init_buffer_utils();
	init_base64url();
	init_errors();
	init_key();
	init_validate();
	init_export();
	check = (value, description) => {
		if (typeof value != "string" || !value) throw new JWKInvalid(`${description} missing or invalid`);
	};
}));
//#endregion
//#region node_modules/jose/dist/webapi/jwk/embedded.js
async function EmbeddedJWK(protectedHeader, token) {
	const joseHeader = {
		...protectedHeader,
		...token?.header
	};
	if (!isObject(joseHeader.jwk)) throw new JWSInvalid("\"jwk\" (JSON Web Key) Header Parameter must be a JSON object");
	let jwk;
	try {
		jwk = normalizeJwk(joseHeader.jwk);
	} catch (cause) {
		throw new JWSInvalid("Invalid Embedded JWK", { cause });
	}
	const entry = jwsAlgorithm(joseHeader.alg);
	if (jwk.use !== void 0 && jwk.use !== "sig") throw new JWSInvalid("Invalid Embedded JWK, its \"use\" must be \"sig\" when present");
	if (jwk.alg !== void 0 && jwk.alg !== entry.alg) throw new JWSInvalid(`Invalid Embedded JWK, its "alg" must be "${entry.alg}" when present`);
	const key = await jwkToKey(entry, jwk, !0);
	if (key.type !== "public") throw new JWSInvalid("\"jwk\" (JSON Web Key) Header Parameter must be a public key");
	return key;
}
var init_embedded = __esmMin((() => {
	init_key();
	init_jws_algorithms();
	init_validate();
	init_errors();
}));
//#endregion
//#region node_modules/jose/dist/webapi/jwks/local.js
function isUsableJWK(jwk, entry, alg, kid) {
	const { kty, key_ops: keyOps, ext, kid: jwkKid, alg: jwkAlg, use, crv } = jwk;
	return (ext === void 0 || typeof ext == "boolean") && (keyOps === void 0 || Array.isArray(keyOps) && keyOps.every((operation, index) => typeof operation == "string" && keyOps.indexOf(operation) === index) && keyOps.includes("verify")) && entry.kty.includes(kty) && (kid === void 0 || typeof kid == "string" && kid === jwkKid) && (jwkAlg === void 0 ? kty !== "AKP" : alg === jwkAlg) && (use === void 0 || use === "sig") && (!entry.crv || crv === entry.crv);
}
async function importWithAlgCache(cache, jwk, entry) {
	const cached = cache.get(jwk) || cache.set(jwk, {}).get(jwk), { alg } = entry;
	if (cached[alg] === void 0) {
		const pending = jwkToKey(entry, jwk, !0).then((key) => {
			if (key.type !== "public") throw new JWKSInvalid("JSON Web Key Set members must be public keys");
			return cached[alg] = key, key;
		}).catch((error) => {
			throw cached[alg] === pending && delete cached[alg], error;
		});
		cached[alg] = pending;
	}
	return cached[alg];
}
function createLocalJWKSet(jwks) {
	let snapshot;
	try {
		snapshot = structuredClone(jwks);
	} catch (cause) {
		throw new JWKSInvalid("JSON Web Key Set malformed", { cause });
	}
	if (!isJwkSet(snapshot)) throw new JWKSInvalid("JSON Web Key Set malformed");
	const metadata = snapshot.keys.map((jwk) => {
		const normalized = snapshotJwk(jwk);
		return Array.isArray(normalized.key_ops) && (normalized.key_ops = [...normalized.key_ops]), normalized;
	}), cached = /* @__PURE__ */ new WeakMap();
	return Object.defineProperty(async (protectedHeader, token) => {
		const { alg, kid } = {
			...protectedHeader,
			...token?.header
		}, entry = typeof alg == "string" ? JWS[alg] : void 0;
		if (!entry || entry.secret) throw new JOSENotSupported("Unsupported \"alg\" value for a JSON Web Key Set");
		const candidates = snapshot.keys.filter((_, index) => isUsableJWK(metadata[index], entry, alg, kid)), { 0: jwk, length } = candidates;
		if (!length) throw new JWKSNoMatchingKey();
		if (length !== 1) {
			const error = new JWKSMultipleMatchingKeys();
			throw error[Symbol.asyncIterator] = async function* () {
				for (const jwk2 of candidates) try {
					yield await importWithAlgCache(cached, jwk2, entry);
				} catch {}
			}, error;
		}
		return importWithAlgCache(cached, jwk, entry);
	}, "jwks", { value: () => structuredClone(snapshot) });
}
var init_local = __esmMin((() => {
	init_key();
	init_jws_algorithms();
	init_errors();
	init_validate();
}));
//#endregion
//#region node_modules/jose/dist/webapi/jwks/remote.js
function isCloudflareWorkers() {
	return typeof WebSocketPair < "u" || typeof navigator < "u" && navigator.userAgent === "Cloudflare-Workers" || typeof EdgeRuntime < "u" && EdgeRuntime === "vercel";
}
async function fetchJwks(url, headers, signal, fetchImpl = fetch) {
	const response = await fetchImpl(url, {
		method: "GET",
		signal,
		redirect: "manual",
		headers
	}).catch((err) => {
		throw err.name === "TimeoutError" ? new JWKSTimeout(void 0, { cause: err }) : err;
	});
	if (response.status !== 200) throw new JOSEError("Expected 200 OK from the JSON Web Key Set HTTP response");
	try {
		return await response.json();
	} catch (cause) {
		throw signal.aborted ? new JWKSTimeout(void 0, { cause }) : new JOSEError("Failed to parse the JSON Web Key Set HTTP response as JSON", { cause });
	}
}
function isFreshFor(timestamp, duration) {
	return Number.isFinite(timestamp) && Date.now() < timestamp + duration;
}
function validateDuration(value, fallback, option) {
	if (Number.isNaN(value)) throw new TypeError(`"${option}" option must not be NaN`);
	if (typeof value == "number" && value < 0) throw new TypeError(`"${option}" option must not be negative`);
	return typeof value == "number" ? value : fallback;
}
function createRemoteJWKSet(url, options) {
	if (!(url instanceof URL)) throw new TypeError("url must be an instance of URL");
	const href = new URL(url.href).href, opts = options ?? {}, timeoutOption = opts.timeoutDuration;
	if (typeof timeoutOption == "number" && (!Number.isInteger(timeoutOption) || timeoutOption < 0)) throw new TypeError("\"timeoutDuration\" option must be a non-negative integer");
	const timeoutDuration = typeof timeoutOption == "number" ? timeoutOption : 5e3, cooldownDuration = validateDuration(opts.cooldownDuration, 3e4, "cooldownDuration"), cacheMaxAge = validateDuration(opts.cacheMaxAge, 6e5, "cacheMaxAge"), headers = new Headers(opts.headers);
	USER_AGENT && !headers.has("User-Agent") && headers.set("User-Agent", USER_AGENT), headers.has("accept") || headers.set("accept", "application/json, application/jwk-set+json");
	const fetchImpl = opts[customFetch], cache = opts[jwksCache];
	let jwksTimestamp, pendingFetch, reloadSequence = 0, appliedSequence = 0, local;
	if (cache && typeof cache == "object") {
		const { uat, jwks } = cache;
		isFreshFor(uat, cacheMaxAge) && isJwkSet(jwks) && (jwksTimestamp = uat, local = createLocalJWKSet(jwks));
	}
	const reload = async () => {
		if (pendingFetch && isCloudflareWorkers() && (pendingFetch = void 0), !pendingFetch) {
			const sequence = ++reloadSequence, current = pendingFetch = fetchJwks(href, headers, AbortSignal.timeout(timeoutDuration), fetchImpl).then((json) => {
				const next = createLocalJWKSet(json);
				if (sequence <= appliedSequence) return;
				local = next;
				const updatedAt = Date.now();
				cache && (cache.uat = updatedAt, cache.jwks = json), jwksTimestamp = updatedAt, appliedSequence = sequence;
			}).finally(() => {
				pendingFetch === current && (pendingFetch = void 0);
			});
		}
		await pendingFetch;
	};
	return Object.defineProperties(async (protectedHeader, token) => {
		(!local || !isFreshFor(jwksTimestamp, cacheMaxAge)) && await reload();
		try {
			return await local(protectedHeader, token);
		} catch (err) {
			if (err instanceof JWKSNoMatchingKey && !isFreshFor(jwksTimestamp, cooldownDuration)) return await reload(), local(protectedHeader, token);
			throw err;
		}
	}, {
		coolingDown: {
			get: () => isFreshFor(jwksTimestamp, cooldownDuration),
			enumerable: !0
		},
		fresh: {
			get: () => isFreshFor(jwksTimestamp, cacheMaxAge),
			enumerable: !0
		},
		reload: {
			value: reload,
			enumerable: !0
		},
		reloading: {
			get: () => !!pendingFetch,
			enumerable: !0
		},
		jwks: {
			value: () => local?.jwks(),
			enumerable: !0
		}
	});
}
var USER_AGENT, customFetch, jwksCache;
var init_remote = __esmMin((() => {
	init_errors();
	init_local();
	init_validate();
	(typeof navigator > "u" || !navigator.userAgent?.startsWith?.("Mozilla/5.0 ")) && (USER_AGENT = "jose/v6.2.18");
	customFetch = /* @__PURE__ */ Symbol();
	jwksCache = /* @__PURE__ */ Symbol();
}));
//#endregion
//#region node_modules/jose/dist/webapi/jwt/unsecured.js
var UnsecuredJWT_base, UnsecuredJWT;
var init_unsecured = __esmMin((() => {
	init_base64url();
	init_validate();
	init_errors();
	init_jwt_claims_set();
	UnsecuredJWT_base = JWTClaimsBuilder;
	UnsecuredJWT = class extends UnsecuredJWT_base {
		encode() {
			return `${encode(JSON.stringify({ alg: "none" }))}.${encode(jwtClaimsSetBytes(this))}.`;
		}
		static decode(jwt, options) {
			if (typeof jwt != "string") throw new JWTInvalid("Unsecured JWT must be a string");
			const { 0: encodedHeader, 1: encodedPayload, 2: signature, length } = jwt.split(".");
			if (length !== 3 || signature !== "") throw new JWTInvalid("Invalid Unsecured JWT");
			let header, b64;
			try {
				header = parseJoseHeader(encodedHeader, JWSInvalid, "JWS Protected Header is invalid");
				const extensions = validateCrit(JWSInvalid, JWS_RECOGNIZED, void 0, header, header);
				b64 = validateB64(header, extensions);
			} catch (cause) {
				throw cause instanceof JWSInvalid ? new JWTInvalid("Invalid Unsecured JWT", { cause }) : cause;
			}
			if (header.alg !== "none") throw new JWTInvalid("Invalid Unsecured JWT");
			if (!b64) throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
			return {
				payload: validateClaimsSet(header, decodeBase64url(encodedPayload, "payload", JWTInvalid), options),
				header
			};
		}
	};
}));
//#endregion
//#region node_modules/jose/dist/webapi/key/import.js
async function importSPKI(spki, alg, options) {
	if (typeof spki != "string" || spki.indexOf("-----BEGIN PUBLIC KEY-----") !== 0) throw new TypeError("\"spki\" must be SPKI formatted string");
	return fromSPKI(spki, alg, options);
}
async function importX509(x509, alg, options) {
	if (typeof x509 != "string" || x509.indexOf("-----BEGIN CERTIFICATE-----") !== 0) throw new TypeError("\"x509\" must be X.509 formatted string");
	return fromX509(x509, alg, options);
}
async function importPKCS8(pkcs8, alg, options) {
	if (typeof pkcs8 != "string" || pkcs8.indexOf("-----BEGIN PRIVATE KEY-----") !== 0) throw new TypeError("\"pkcs8\" must be PKCS#8 formatted string");
	return fromPKCS8(pkcs8, alg, options);
}
async function importJWK(jwk, alg, options) {
	if (!isObject(jwk)) throw new TypeError("JWK must be an object");
	const normalized = normalizeJwk(jwk), extractable = validateExtractableOption(options?.extractable), { alg: jwkAlg } = normalized;
	if (alg ??= jwkAlg, normalized.kty !== "oct" && !alg) throw new TypeError("\"alg\" argument is required when \"jwk.alg\" is not present");
	switch (normalized.kty) {
		case "oct":
			if (typeof normalized.k != "string") throw new TypeError("missing \"k\" (Key Value) Parameter value");
			return decode(normalized.k);
		case "AKP":
			if (typeof jwkAlg != "string" || !jwkAlg) throw new TypeError("missing \"alg\" (Algorithm) Parameter value");
			if (alg !== jwkAlg) throw new TypeError("JWK alg and alg option value mismatch");
			return jwkToKey(keyAlgorithm(alg), normalized, extractable);
		case "RSA":
		case "EC":
		case "OKP": return jwkToKey(keyAlgorithm(alg), normalized, extractable);
		default: throw new JOSENotSupported("Unsupported \"kty\" (Key Type) Parameter value");
	}
}
var init_import = __esmMin((() => {
	init_base64url();
	init_asn1();
	init_key();
	init_key_algorithm();
	init_errors();
	init_validate();
}));
//#endregion
//#region node_modules/jose/dist/webapi/util/decode_protected_header.js
function decodeProtectedHeader(token) {
	let encodedProtectedHeader;
	if (typeof token == "string") {
		const parts = token.split(".");
		(parts.length === 3 || parts.length === 5) && ([encodedProtectedHeader] = parts);
	} else if (typeof token == "object" && token) if ("protected" in token) encodedProtectedHeader = token.protected;
	else throw new TypeError("Token does not contain a Protected Header");
	const invalid = "Invalid Token or Protected Header formatting";
	if (typeof encodedProtectedHeader != "string" || !encodedProtectedHeader) throw new TypeError(invalid);
	return parseJoseHeader(encodedProtectedHeader, TypeError, invalid);
}
var init_decode_protected_header = __esmMin((() => {
	init_validate();
}));
//#endregion
//#region node_modules/jose/dist/webapi/util/decode_jwt.js
function decodeJwt(jwt) {
	if (typeof jwt != "string") throw new JWTInvalid("JWTs must use Compact JWS serialization, JWT must be a string");
	const { 1: encodedPayload, length } = jwt.split(".");
	if (length === 5) throw new JWTInvalid("Only JWTs using Compact JWS serialization can be decoded");
	if (length !== 3) throw new JWTInvalid("Invalid JWT");
	if (!encodedPayload) throw new JWTInvalid("JWTs must contain a payload");
	let claimsSetBytes;
	try {
		claimsSetBytes = decode(encodedPayload);
	} catch (cause) {
		throw new JWTInvalid("Failed to base64url decode the payload", { cause });
	}
	let claimsSet;
	try {
		claimsSet = JSON.parse(strictDecoder.decode(claimsSetBytes));
	} catch (cause) {
		throw new JWTInvalid("Failed to parse the decoded payload as JSON", { cause });
	}
	if (!isObject(claimsSet)) throw new JWTInvalid("Invalid JWT Claims Set");
	return claimsSet;
}
var init_decode_jwt = __esmMin((() => {
	init_base64url();
	init_buffer_utils();
	init_validate();
	init_errors();
}));
//#endregion
//#region node_modules/jose/dist/webapi/key/generate_key_pair.js
function getModulusLengthOption(options) {
	const modulusLength = options?.modulusLength ?? 2048;
	if (typeof modulusLength != "number" || !Number.isInteger(modulusLength) || modulusLength < 2048) throw new JOSENotSupported("Invalid or unsupported modulusLength option provided, 2048 bits or larger keys must be used");
	return modulusLength;
}
async function generateKeyPair(alg, options) {
	const extractable = validateExtractableOption(options?.extractable), entry = keyAlgorithm(alg, algArgument);
	entry.secret && unsupportedAlg("\"alg\" (Algorithm)");
	let algorithm;
	if (entry.resolve) {
		const crv = options?.crv ?? "P-256";
		if (![
			"P-256",
			"P-384",
			"P-521",
			"X25519"
		].includes(crv)) throw new JOSENotSupported("Invalid or unsupported crv option provided, supported values are P-256, P-384, P-521, and X25519");
		algorithm = entry.resolve({ crv });
	} else {
		if (entry.crv !== void 0 && options?.crv !== void 0 && options.crv !== entry.crv) throw new JOSENotSupported(`Invalid or unsupported crv option provided, the only supported value for ${alg} is ${entry.crv}`);
		algorithm = entry.kty[0] === "RSA" ? {
			...entry.subtle,
			publicExponent: Uint8Array.of(1, 0, 1),
			modulusLength: getModulusLengthOption(options)
		} : entry.subtle;
	}
	return crypto.subtle.generateKey(algorithm, extractable ?? !1, [...entry.usages[1], ...entry.usages[0]]);
}
var init_generate_key_pair = __esmMin((() => {
	init_errors();
	init_key();
	init_key_algorithm();
}));
//#endregion
//#region node_modules/jose/dist/webapi/key/generate_secret.js
async function generateSecret(alg, options) {
	const extractable = validateExtractableOption(options?.extractable);
	let keyLengthBits, algorithm, keyUsages;
	switch (alg) {
		case "HS256":
		case "HS384":
		case "HS512":
			keyLengthBits = +alg.slice(-3), algorithm = {
				name: "HMAC",
				hash: `SHA-${keyLengthBits}`,
				length: keyLengthBits
			}, keyUsages = ["sign", "verify"];
			break;
		case "A128CBC-HS256":
		case "A192CBC-HS384":
		case "A256CBC-HS512": return crypto.getRandomValues(new Uint8Array(+alg.slice(-3) >> 3));
		case "A128KW":
		case "A192KW":
		case "A256KW":
			keyLengthBits = +alg.slice(1, 4), algorithm = {
				name: "AES-KW",
				length: keyLengthBits
			}, keyUsages = ["wrapKey", "unwrapKey"];
			break;
		case "A128GCMKW":
		case "A192GCMKW":
		case "A256GCMKW":
		case "A128GCM":
		case "A192GCM":
		case "A256GCM":
			keyLengthBits = +alg.slice(1, 4), algorithm = {
				name: "AES-GCM",
				length: keyLengthBits
			}, keyUsages = ["encrypt", "decrypt"];
			break;
		default: unsupportedAlg(algArgument);
	}
	return crypto.subtle.generateKey(algorithm, extractable ?? !1, keyUsages);
}
var init_generate_secret = __esmMin((() => {
	init_key_algorithm();
	init_key();
}));
//#endregion
//#region node_modules/jose/dist/webapi/index.js
var webapi_exports = /* @__PURE__ */ __exportAll({
	CompactEncrypt: () => CompactEncrypt,
	CompactSign: () => CompactSign,
	EmbeddedJWK: () => EmbeddedJWK,
	EncryptJWT: () => EncryptJWT,
	FlattenedEncrypt: () => FlattenedEncrypt,
	FlattenedSign: () => FlattenedSign,
	GeneralEncrypt: () => GeneralEncrypt,
	GeneralSign: () => GeneralSign,
	SignJWT: () => SignJWT,
	UnsecuredJWT: () => UnsecuredJWT,
	base64url: () => base64url_exports,
	calculateJwkThumbprint: () => calculateJwkThumbprint,
	calculateJwkThumbprintUri: () => calculateJwkThumbprintUri,
	compactDecrypt: () => compactDecrypt,
	compactVerify: () => compactVerify,
	createLocalJWKSet: () => createLocalJWKSet,
	createRemoteJWKSet: () => createRemoteJWKSet,
	cryptoRuntime: () => cryptoRuntime,
	customFetch: () => customFetch,
	decodeJwt: () => decodeJwt,
	decodeProtectedHeader: () => decodeProtectedHeader,
	errors: () => errors_exports,
	exportJWK: () => exportJWK,
	exportPKCS8: () => exportPKCS8,
	exportSPKI: () => exportSPKI,
	flattenedDecrypt: () => flattenedDecrypt,
	flattenedVerify: () => flattenedVerify,
	generalDecrypt: () => generalDecrypt,
	generalVerify: () => generalVerify,
	generateKeyPair: () => generateKeyPair,
	generateSecret: () => generateSecret,
	importJWK: () => importJWK,
	importPKCS8: () => importPKCS8,
	importSPKI: () => importSPKI,
	importX509: () => importX509,
	jwksCache: () => jwksCache,
	jwtDecrypt: () => jwtDecrypt,
	jwtVerify: () => jwtVerify
});
var cryptoRuntime;
var init_webapi = __esmMin((() => {
	init_decrypt$3();
	init_decrypt$2();
	init_decrypt$1();
	init_encrypt$3();
	init_verify$3();
	init_verify$2();
	init_verify$1();
	init_verify();
	init_decrypt();
	init_encrypt$2();
	init_encrypt$1();
	init_sign$3();
	init_sign$2();
	init_sign$1();
	init_sign();
	init_encrypt();
	init_thumbprint();
	init_embedded();
	init_local();
	init_remote();
	init_unsecured();
	init_export();
	init_import();
	init_decode_protected_header();
	init_decode_jwt();
	init_errors();
	init_generate_key_pair();
	init_generate_secret();
	init_base64url();
	cryptoRuntime = "WebCryptoAPI";
}));
//#endregion
//#region node_modules/jwks-rsa/src/errors/JwksError.js
var require_JwksError = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	function JwksError(message) {
		Error.call(this, message);
		Error.captureStackTrace(this, this.constructor);
		this.name = "JwksError";
		this.message = message;
	}
	JwksError.prototype = Object.create(Error.prototype);
	JwksError.prototype.constructor = JwksError;
	module.exports = JwksError;
}));
//#endregion
//#region node_modules/jwks-rsa/src/utils.js
var require_utils = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const jose = (init_webapi(), __toCommonJS(webapi_exports));
	const JwksError = require_JwksError();
	function resolveAlg(jwk) {
		if (jwk.alg) return jwk.alg;
		if (jwk.kty === "RSA") return "RS256";
		if (jwk.kty === "EC") switch (jwk.crv) {
			case "P-256": return "ES256";
			case "P-384": return "ES384";
			case "P-521": return "ES512";
		}
		if (jwk.kty === "OKP") switch (jwk.crv) {
			case "Ed25519":
			case "Ed448": return "EdDSA";
		}
		throw new JwksError("Unsupported JWK");
	}
	async function retrieveSigningKeys(jwks) {
		const results = [];
		jwks = jwks.filter(({ use }) => use === "sig" || use === void 0).filter(({ kty }) => kty === "RSA" || kty === "EC" || kty === "OKP");
		for (const jwk of jwks) try {
			const key = await jose.importJWK({
				...jwk,
				ext: true
			}, resolveAlg(jwk));
			if (key.type !== "public") continue;
			let getSpki;
			switch (key[Symbol.toStringTag]) {
				case "CryptoKey": {
					const spki = await jose.exportSPKI(key);
					getSpki = () => spki;
					break;
				}
				default: getSpki = () => key.export({
					format: "pem",
					type: "spki"
				});
			}
			results.push({
				get publicKey() {
					return getSpki();
				},
				get rsaPublicKey() {
					return getSpki();
				},
				getPublicKey() {
					return getSpki();
				},
				...typeof jwk.kid === "string" && jwk.kid ? { kid: jwk.kid } : void 0,
				...typeof jwk.alg === "string" && jwk.alg ? { alg: jwk.alg } : void 0
			});
		} catch (err) {
			continue;
		}
		return results;
	}
	module.exports = { retrieveSigningKeys };
}));
//#endregion
//#region node_modules/jwks-rsa/src/errors/ArgumentError.js
var require_ArgumentError = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	function ArgumentError(message) {
		Error.call(this, message);
		Error.captureStackTrace(this, this.constructor);
		this.name = "ArgumentError";
		this.message = message;
	}
	ArgumentError.prototype = Object.create(Error.prototype);
	ArgumentError.prototype.constructor = ArgumentError;
	module.exports = ArgumentError;
}));
//#endregion
//#region node_modules/jwks-rsa/src/wrappers/request.js
var require_request = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const http = __require("http");
	const https = __require("https");
	const ArgumentError = require_ArgumentError();
	module.exports.default = (options) => {
		if (options.fetcher) return options.fetcher(options.uri);
		return new Promise((resolve, reject) => {
			let url;
			try {
				url = new URL(options.uri);
			} catch (err) {
				throw new ArgumentError("Invalid JWKS URI: The provided URI is not a valid URL.");
			}
			const { hostname, port, protocol, pathname, search } = url;
			const requestOptions = {
				hostname,
				path: pathname + search,
				port,
				method: "GET",
				...options.headers && { headers: { ...options.headers } },
				...options.timeout && { timeout: options.timeout },
				...options.agent && { agent: options.agent }
			};
			const httpRequest = (protocol === "https:" ? https : http).request(requestOptions, (res) => {
				let rawData = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => {
					rawData += chunk;
				});
				res.on("end", () => {
					if (res.statusCode < 200 || res.statusCode >= 300) reject({ errorMsg: res.body && (res.body.message || res.body) || res.statusMessage || `Http Error ${res.statusCode}` });
					else try {
						resolve(rawData && JSON.parse(rawData));
					} catch (error) {
						reject(error);
					}
				});
			});
			httpRequest.on("timeout", () => httpRequest.destroy()).on("error", (e) => reject(e)).end();
		});
	};
}));
//#endregion
//#region node_modules/lru-cache/dist/commonjs/node/index.min.js
var require_index_min = /* @__PURE__ */ __commonJSMin(((exports) => {
	var j = (u, t) => () => (t || u((t = { exports: {} }).exports, t), t.exports);
	var I = j((O) => {
		"use strict";
		Object.defineProperty(O, "__esModule", { value: !0 });
		O.tracing = O.metrics = void 0;
		var U = __require("node:diagnostics_channel");
		O.metrics = (0, U.channel)("lru-cache:metrics");
		O.tracing = (0, U.tracingChannel)("lru-cache");
	});
	var P = j((R) => {
		"use strict";
		Object.defineProperty(R, "__esModule", { value: !0 });
		R.defaultPerf = void 0;
		R.defaultPerf = typeof performance == "object" && performance && typeof performance.now == "function" ? performance : Date;
	});
	Object.defineProperty(exports, "__esModule", { value: !0 });
	exports.LRUCache = void 0;
	var g = I(), N = P(), C = () => g.metrics.hasSubscribers || g.tracing.hasSubscribers, k = /* @__PURE__ */ new Set(), G = typeof process == "object" && process ? process : {}, V = (u, t, e, i) => {
		typeof G.emitWarning == "function" ? G.emitWarning(u, t, e, i) : console.error(`[${e}] ${t}: ${u}`);
	}, q = (u) => !k.has(u);
	var T = (u) => !!u && u === Math.floor(u) && u > 0 && isFinite(u), H = (u) => T(u) ? u <= Math.pow(2, 8) ? Uint8Array : u <= Math.pow(2, 16) ? Uint16Array : u <= Math.pow(2, 32) ? Uint32Array : u <= Number.MAX_SAFE_INTEGER ? W : null : null, W = class extends Array {
		constructor(t) {
			super(t), this.fill(0);
		}
	}, L = class u {
		heap;
		length;
		static #o = !1;
		static create(t) {
			let e = H(t);
			if (!e) return [];
			u.#o = !0;
			let i = new u(t, e);
			return u.#o = !1, i;
		}
		constructor(t, e) {
			if (!u.#o) throw new TypeError("instantiate Stack using Stack.create(n)");
			this.heap = new e(t), this.length = 0;
		}
		push(t) {
			this.heap[this.length++] = t;
		}
		pop() {
			return this.heap[--this.length];
		}
	};
	exports.LRUCache = class u {
		#o;
		#c;
		#m;
		#W;
		#S;
		#x;
		#j;
		#w;
		get perf() {
			return this.#w;
		}
		ttl;
		ttlResolution;
		ttlAutopurge;
		updateAgeOnGet;
		updateAgeOnHas;
		allowStale;
		noDisposeOnSet;
		noUpdateTTL;
		maxEntrySize;
		sizeCalculation;
		noDeleteOnFetchRejection;
		noDeleteOnStaleGet;
		allowStaleOnFetchAbort;
		allowStaleOnFetchRejection;
		ignoreFetchAbort;
		backgroundFetchSize;
		#n;
		#b;
		#s;
		#i;
		#t;
		#l;
		#u;
		#a;
		#h;
		#_;
		#r;
		#y;
		#F;
		#d;
		#g;
		#T;
		#U;
		#f;
		#R;
		static unsafeExposeInternals(t) {
			return {
				starts: t.#F,
				ttls: t.#d,
				autopurgeTimers: t.#g,
				sizes: t.#y,
				keyMap: t.#s,
				keyList: t.#i,
				valList: t.#t,
				next: t.#l,
				prev: t.#u,
				get head() {
					return t.#a;
				},
				get tail() {
					return t.#h;
				},
				free: t.#_,
				isBackgroundFetch: (e) => t.#e(e),
				backgroundFetch: (e, i, s, n) => t.#G(e, i, s, n),
				moveToTail: (e) => t.#M(e),
				indexes: (e) => t.#A(e),
				rindexes: (e) => t.#z(e),
				isStale: (e) => t.#p(e)
			};
		}
		get max() {
			return this.#o;
		}
		get maxSize() {
			return this.#c;
		}
		get calculatedSize() {
			return this.#b;
		}
		get size() {
			return this.#n;
		}
		get fetchMethod() {
			return this.#x;
		}
		get memoMethod() {
			return this.#j;
		}
		get dispose() {
			return this.#m;
		}
		get onInsert() {
			return this.#W;
		}
		get disposeAfter() {
			return this.#S;
		}
		constructor(t) {
			let { max: e = 0, ttl: i, ttlResolution: s = 1, ttlAutopurge: n, updateAgeOnGet: o, updateAgeOnHas: l, allowStale: h, dispose: r, onInsert: c, disposeAfter: w, noDisposeOnSet: y, noUpdateTTL: d, maxSize: p = 0, maxEntrySize: f = 0, sizeCalculation: _, fetchMethod: a, memoMethod: S, noDeleteOnFetchRejection: F, noDeleteOnStaleGet: b, allowStaleOnFetchRejection: m, allowStaleOnFetchAbort: A, ignoreFetchAbort: z, backgroundFetchSize: x = 1, perf: v } = t;
			if (this.backgroundFetchSize = x, v !== void 0 && typeof v?.now != "function") throw new TypeError("perf option must have a now() method if specified");
			if (this.#w = v ?? N.defaultPerf, e !== 0 && !T(e)) throw new TypeError("max option must be a nonnegative integer");
			let E = e ? H(e) : Array;
			if (!E) throw new Error("invalid max value: " + e);
			if (this.#o = e, this.#c = p, this.maxEntrySize = f || this.#c, this.sizeCalculation = _, this.sizeCalculation) {
				if (!this.#c && !this.maxEntrySize) throw new TypeError("cannot set sizeCalculation without setting maxSize or maxEntrySize");
				if (typeof this.sizeCalculation != "function") throw new TypeError("sizeCalculation set to non-function");
			}
			if (S !== void 0 && typeof S != "function") throw new TypeError("memoMethod must be a function if defined");
			if (this.#j = S, a !== void 0 && typeof a != "function") throw new TypeError("fetchMethod must be a function if specified");
			if (this.#x = a, this.#U = !!a, this.#s = /* @__PURE__ */ new Map(), this.#i = Array.from({ length: e }).fill(void 0), this.#t = Array.from({ length: e }).fill(void 0), this.#l = new E(e), this.#u = new E(e), this.#a = 0, this.#h = 0, this.#_ = L.create(e), this.#n = 0, this.#b = 0, typeof r == "function" && (this.#m = r), typeof c == "function" && (this.#W = c), typeof w == "function" ? (this.#S = w, this.#r = []) : (this.#S = void 0, this.#r = void 0), this.#T = !!this.#m, this.#R = !!this.#W, this.#f = !!this.#S, this.noDisposeOnSet = !!y, this.noUpdateTTL = !!d, this.noDeleteOnFetchRejection = !!F, this.allowStaleOnFetchRejection = !!m, this.allowStaleOnFetchAbort = !!A, this.ignoreFetchAbort = !!z, this.maxEntrySize !== 0) {
				if (this.#c !== 0 && !T(this.#c)) throw new TypeError("maxSize must be a positive integer if specified");
				if (!T(this.maxEntrySize)) throw new TypeError("maxEntrySize must be a positive integer if specified");
				this.#X();
			}
			if (this.allowStale = !!h, this.noDeleteOnStaleGet = !!b, this.updateAgeOnGet = !!o, this.updateAgeOnHas = !!l, this.ttlResolution = T(s) || s === 0 ? s : 1, this.ttlAutopurge = !!n, this.ttl = i || 0, this.ttl) {
				if (!T(this.ttl)) throw new TypeError("ttl must be a positive integer if specified");
				this.#k();
			}
			if (this.#o === 0 && this.ttl === 0 && this.#c === 0) throw new TypeError("At least one of max, maxSize, or ttl is required");
			if (!this.ttlAutopurge && !this.#o && !this.#c) {
				let D = "LRU_CACHE_UNBOUNDED";
				q(D) && (k.add(D), V("TTL caching without ttlAutopurge, max, or maxSize can result in unbounded memory consumption.", "UnboundedCacheWarning", D, u));
			}
		}
		getRemainingTTL(t) {
			return this.#s.has(t) ? Infinity : 0;
		}
		#k() {
			let t = new W(this.#o), e = new W(this.#o);
			this.#d = t, this.#F = e;
			let i = this.ttlAutopurge ? Array.from({ length: this.#o }) : void 0;
			this.#g = i, this.#H = (h, r, c = this.#w.now()) => {
				e[h] = r !== 0 ? c : 0, t[h] = r, s(h, r);
			}, this.#D = (h) => {
				e[h] = t[h] !== 0 ? this.#w.now() : 0, s(h, t[h]);
			};
			let s = this.ttlAutopurge ? (h, r) => {
				if (i?.[h] && (clearTimeout(i[h]), i[h] = void 0), r && r !== 0 && i) {
					let c = setTimeout(() => {
						this.#p(h) ? (this.#v(this.#i[h], "expire"), i[h] = void 0) : s(h, l(h));
					}, r + 1);
					c.unref && c.unref(), i[h] = c;
				}
			} : () => {};
			this.#E = (h, r) => {
				if (t[r]) {
					let c = t[r], w = e[r];
					if (!c || !w) return;
					h.ttl = c, h.start = w, h.now = n || o();
					h.remainingTTL = c - (h.now - w);
				}
			};
			let n = 0, o = () => {
				let h = this.#w.now();
				if (this.ttlResolution > 0) {
					n = h;
					let r = setTimeout(() => n = 0, this.ttlResolution);
					r.unref && r.unref();
				}
				return h;
			};
			this.getRemainingTTL = (h) => {
				let r = this.#s.get(h);
				return r === void 0 ? 0 : l(r);
			};
			let l = (h) => {
				let r = t[h], c = e[h];
				if (!r || !c) return Infinity;
				return r - ((n || o()) - c);
			};
			this.#p = (h) => {
				let r = e[h], c = t[h];
				return !!c && !!r && (n || o()) - r > c;
			};
		}
		#D = () => {};
		#E = () => {};
		#H = () => {};
		#p = () => !1;
		#X() {
			let t = new W(this.#o);
			this.#b = 0, this.#y = t, this.#C = (e) => {
				this.#b -= t[e], t[e] = 0;
			}, this.#N = (e, i, s, n) => {
				if (!T(s)) {
					if (this.#e(i)) return this.backgroundFetchSize;
					if (n) {
						if (typeof n != "function") throw new TypeError("sizeCalculation must be a function");
						if (s = n(i, e), !T(s)) throw new TypeError("sizeCalculation return invalid (expect positive integer)");
					} else throw new TypeError("invalid size value (must be positive integer). When maxSize or maxEntrySize is used, sizeCalculation or size must be set.");
				}
				return s;
			}, this.#I = (e, i, s) => {
				if (t[e] = i, this.#c) {
					let n = this.#c - t[e];
					for (; this.#b > n;) this.#P(!0);
				}
				this.#b += t[e], s && (s.entrySize = i, s.totalCalculatedSize = this.#b);
			};
		}
		#C = (t) => {};
		#I = (t, e, i) => {};
		#N = (t, e, i, s) => {
			if (i || s) throw new TypeError("cannot set size without setting maxSize or maxEntrySize on cache");
			return 0;
		};
		*#A({ allowStale: t = this.allowStale } = {}) {
			if (this.#n) for (let e = this.#h; this.#V(e) && ((t || !this.#p(e)) && (yield e), e !== this.#a);) e = this.#u[e];
		}
		*#z({ allowStale: t = this.allowStale } = {}) {
			if (this.#n) for (let e = this.#a; this.#V(e) && ((t || !this.#p(e)) && (yield e), e !== this.#h);) e = this.#l[e];
		}
		#V(t) {
			return t !== void 0 && this.#s.get(this.#i[t]) === t;
		}
		*entries() {
			for (let t of this.#A()) this.#t[t] !== void 0 && this.#i[t] !== void 0 && !this.#e(this.#t[t]) && (yield [this.#i[t], this.#t[t]]);
		}
		*rentries() {
			for (let t of this.#z()) this.#t[t] !== void 0 && this.#i[t] !== void 0 && !this.#e(this.#t[t]) && (yield [this.#i[t], this.#t[t]]);
		}
		*keys() {
			for (let t of this.#A()) {
				let e = this.#i[t];
				e !== void 0 && !this.#e(this.#t[t]) && (yield e);
			}
		}
		*rkeys() {
			for (let t of this.#z()) {
				let e = this.#i[t];
				e !== void 0 && !this.#e(this.#t[t]) && (yield e);
			}
		}
		*values() {
			for (let t of this.#A()) this.#t[t] !== void 0 && !this.#e(this.#t[t]) && (yield this.#t[t]);
		}
		*rvalues() {
			for (let t of this.#z()) this.#t[t] !== void 0 && !this.#e(this.#t[t]) && (yield this.#t[t]);
		}
		[Symbol.iterator]() {
			return this.entries();
		}
		[Symbol.toStringTag] = "LRUCache";
		find(t, e = {}) {
			for (let i of this.#A()) {
				let s = this.#t[i], n = this.#e(s) ? s.__staleWhileFetching : s;
				if (n !== void 0 && t(n, this.#i[i], this)) return this.#L(this.#i[i], e);
			}
		}
		forEach(t, e = this) {
			for (let i of this.#A()) {
				let s = this.#t[i], n = this.#e(s) ? s.__staleWhileFetching : s;
				n !== void 0 && t.call(e, n, this.#i[i], this);
			}
		}
		rforEach(t, e = this) {
			for (let i of this.#z()) {
				let s = this.#t[i], n = this.#e(s) ? s.__staleWhileFetching : s;
				n !== void 0 && t.call(e, n, this.#i[i], this);
			}
		}
		purgeStale() {
			let t = !1;
			for (let e of this.#z({ allowStale: !0 })) this.#p(e) && (this.#v(this.#i[e], "expire"), t = !0);
			return t;
		}
		info(t) {
			let e = this.#s.get(t);
			if (e === void 0) return;
			let i = this.#t[e], s = this.#e(i) ? i.__staleWhileFetching : i;
			if (s === void 0) return;
			let n = { value: s };
			if (this.#d && this.#F) {
				let o = this.#d[e], l = this.#F[e];
				if (o && l) n.ttl = o - (this.#w.now() - l), n.start = Date.now();
			}
			return this.#y && (n.size = this.#y[e]), n;
		}
		dump() {
			let t = [];
			for (let e of this.#A({ allowStale: !0 })) {
				let i = this.#i[e], s = this.#t[e], n = this.#e(s) ? s.__staleWhileFetching : s;
				if (n === void 0 || i === void 0) continue;
				let o = { value: n };
				if (this.#d && this.#F) {
					o.ttl = this.#d[e];
					let l = this.#w.now() - this.#F[e];
					o.start = Math.floor(Date.now() - l);
				}
				this.#y && (o.size = this.#y[e]), t.unshift([i, o]);
			}
			return t;
		}
		load(t) {
			this.clear();
			for (let [e, i] of t) {
				if (i.start) {
					let s = Date.now() - i.start;
					i.start = this.#w.now() - s;
				}
				this.#O(e, i.value, i);
			}
		}
		set(t, e, i = {}) {
			let { status: s = g.metrics.hasSubscribers ? {} : void 0 } = i;
			i.status = s, s && (s.op = "set", s.key = t, e !== void 0 && (s.value = e), s.cache = this);
			let n = this.#O(t, e, i);
			return s && g.metrics.hasSubscribers && g.metrics.publish(s), n;
		}
		#O(t, e, i, s) {
			let { ttl: n = this.ttl, start: o, noDisposeOnSet: l = this.noDisposeOnSet, sizeCalculation: h = this.sizeCalculation, status: r } = i, c = this.#e(e);
			if (e === void 0) return r && (r.set = "deleted"), this.delete(t), this;
			let { noUpdateTTL: w = this.noUpdateTTL } = i;
			r && !c && (r.value = e);
			let y = this.#N(t, e, i.size || 0, h, r);
			if (this.maxEntrySize && y > this.maxEntrySize) return this.#v(t, "set"), r && (r.set = "miss", r.maxEntrySizeExceeded = !0), this;
			let d = this.#n === 0 ? void 0 : this.#s.get(t);
			if (d === void 0) d = this.#n === 0 ? this.#h : this.#_.length !== 0 ? this.#_.pop() : this.#n === this.#o ? this.#P(!1) : this.#n, this.#i[d] = t, this.#t[d] = e, this.#s.set(t, d), this.#l[this.#h] = d, this.#u[d] = this.#h, this.#h = d, this.#n++, this.#I(d, y, r), r && (r.set = "add"), w = !1, this.#R && !c && this.#W?.(e, t, "add");
			else {
				this.#M(d);
				let p = this.#t[d];
				if (e !== p) {
					if (!l) if (this.#e(p)) {
						p !== s && p.__abortController.abort(/* @__PURE__ */ new Error("replaced"));
						let { __staleWhileFetching: f } = p;
						f !== void 0 && f !== e && (this.#T && this.#m?.(f, t, "set"), this.#f && this.#r?.push([
							f,
							t,
							"set"
						]));
					} else this.#T && this.#m?.(p, t, "set"), this.#f && this.#r?.push([
						p,
						t,
						"set"
					]);
					if (this.#C(d), this.#I(d, y, r), this.#t[d] = e, !c) {
						let f = p && this.#e(p) ? p.__staleWhileFetching : p, _ = f === void 0 ? "add" : e !== f ? "replace" : "update";
						r && (r.set = _, f !== void 0 && (r.oldValue = f)), this.#R && this.onInsert?.(e, t, _);
					}
				} else c || (r && (r.set = "update"), this.#R && this.onInsert?.(e, t, "update"));
			}
			if (n !== 0 && !this.#d && this.#k(), this.#d && (w || this.#H(d, n, o), r && this.#E(r, d)), !l && this.#f && this.#r) {
				let p = this.#r, f;
				for (; f = p?.shift();) this.#S?.(...f);
			}
			return this;
		}
		pop() {
			try {
				for (; this.#n;) {
					let t = this.#t[this.#a];
					if (this.#P(!0), this.#e(t)) {
						if (t.__staleWhileFetching) return t.__staleWhileFetching;
					} else if (t !== void 0) return t;
				}
			} finally {
				if (this.#f && this.#r) {
					let t = this.#r, e;
					for (; e = t?.shift();) this.#S?.(...e);
				}
			}
		}
		#P(t) {
			let e = this.#a, i = this.#i[e], s = this.#t[e], n = this.#e(s);
			n && s.__abortController.abort(/* @__PURE__ */ new Error("evicted"));
			let o = n ? s.__staleWhileFetching : s;
			return (this.#T || this.#f) && o !== void 0 && (this.#T && this.#m?.(o, i, "evict"), this.#f && this.#r?.push([
				o,
				i,
				"evict"
			])), this.#C(e), this.#g?.[e] && (clearTimeout(this.#g[e]), this.#g[e] = void 0), t && (this.#i[e] = void 0, this.#t[e] = void 0, this.#_.push(e)), this.#n === 1 ? (this.#a = this.#h = 0, this.#_.length = 0) : this.#a = this.#l[e], this.#s.delete(i), this.#n--, e;
		}
		has(t, e = {}) {
			let { status: i = g.metrics.hasSubscribers ? {} : void 0 } = e;
			e.status = i, i && (i.op = "has", i.key = t, i.cache = this);
			let s = this.#Y(t, e);
			return g.metrics.hasSubscribers && g.metrics.publish(i), s;
		}
		#Y(t, e = {}) {
			let { updateAgeOnHas: i = this.updateAgeOnHas, status: s } = e, n = this.#s.get(t);
			if (n !== void 0) {
				let o = this.#t[n];
				if (this.#e(o) && o.__staleWhileFetching === void 0) return !1;
				if (this.#p(n)) s && (s.has = "stale", this.#E(s, n));
				else return i && this.#D(n), s && (s.has = "hit", this.#E(s, n)), !0;
			} else s && (s.has = "miss");
			return !1;
		}
		peek(t, e = {}) {
			let { status: i = C() ? {} : void 0 } = e;
			i && (i.op = "peek", i.key = t, i.cache = this), e.status = i;
			let s = this.#J(t, e);
			return g.metrics.hasSubscribers && g.metrics.publish(i), s;
		}
		#J(t, e) {
			let { status: i, allowStale: s = this.allowStale } = e, n = this.#s.get(t);
			if (n === void 0 || !s && this.#p(n)) {
				i && (i.peek = n === void 0 ? "miss" : "stale");
				return;
			}
			let o = this.#t[n], l = this.#e(o) ? o.__staleWhileFetching : o;
			return i && (l !== void 0 ? (i.peek = "hit", i.value = l) : i.peek = "miss"), l;
		}
		#G(t, e, i, s) {
			let n = e === void 0 ? void 0 : this.#t[e];
			if (this.#e(n)) return n;
			let o = new AbortController(), { signal: l } = i;
			l?.addEventListener("abort", () => o.abort(l.reason), { signal: o.signal });
			let h = {
				signal: o.signal,
				options: i,
				context: s
			}, r = (f, _ = !1) => {
				let { aborted: a } = o.signal, S = i.ignoreFetchAbort && f !== void 0, F = i.ignoreFetchAbort || !!(i.allowStaleOnFetchAbort && f !== void 0);
				if (i.status && (a && !_ ? (i.status.fetchAborted = !0, i.status.fetchError = o.signal.reason, S && (i.status.fetchAbortIgnored = !0)) : i.status.fetchResolved = !0), a && !S && !_) return w(o.signal.reason, F);
				let b = d, m = this.#t[e];
				return (m === d || m === void 0 && S && _) && (f === void 0 ? b.__staleWhileFetching !== void 0 ? this.#t[e] = b.__staleWhileFetching : this.#v(t, "fetch") : (i.status && (i.status.fetchUpdated = !0), this.#O(t, f, h.options, b))), f;
			}, c = (f) => (i.status && (i.status.fetchRejected = !0, i.status.fetchError = f), w(f, !1)), w = (f, _) => {
				let { aborted: a } = o.signal, S = a && i.allowStaleOnFetchAbort, F = S || i.allowStaleOnFetchRejection, b = F || i.noDeleteOnFetchRejection, m = d;
				if (this.#t[e] === d && (!b || !_ && m.__staleWhileFetching === void 0 ? this.#v(t, "fetch") : S || (this.#t[e] = m.__staleWhileFetching)), F) return i.status && m.__staleWhileFetching !== void 0 && (i.status.returnedStale = !0), m.__staleWhileFetching;
				if (m.__returned === m) throw f;
			}, y = (f, _) => {
				let a = this.#x?.(t, n, h);
				o.signal.addEventListener("abort", () => {
					(!i.ignoreFetchAbort || i.allowStaleOnFetchAbort) && (f(void 0), i.allowStaleOnFetchAbort && (f = (S) => r(S, !0)));
				}), a && a instanceof Promise ? a.then((S) => f(S === void 0 ? void 0 : S), _) : a !== void 0 && f(a);
			};
			i.status && (i.status.fetchDispatched = !0);
			let d = new Promise(y).then(r, c), p = Object.assign(d, {
				__abortController: o,
				__staleWhileFetching: n,
				__returned: void 0
			});
			return e === void 0 ? (this.#O(t, p, {
				...h.options,
				status: void 0
			}), e = this.#s.get(t)) : this.#t[e] = p, p;
		}
		#e(t) {
			if (!this.#U) return !1;
			let e = t;
			return !!e && e instanceof Promise && e.hasOwnProperty("__staleWhileFetching") && e.__abortController instanceof AbortController;
		}
		fetch(t, e = {}) {
			let i = g.tracing.hasSubscribers, { status: s = C() ? {} : void 0 } = e;
			e.status = s, s && e.context && (s.context = e.context);
			let n = this.#q(t, e);
			return s && i && (s.trace = !0, g.tracing.tracePromise(() => n, s).catch(() => {})), n;
		}
		async #q(t, e = {}) {
			let { allowStale: i = this.allowStale, updateAgeOnGet: s = this.updateAgeOnGet, noDeleteOnStaleGet: n = this.noDeleteOnStaleGet, ttl: o = this.ttl, noDisposeOnSet: l = this.noDisposeOnSet, size: h = 0, sizeCalculation: r = this.sizeCalculation, noUpdateTTL: c = this.noUpdateTTL, noDeleteOnFetchRejection: w = this.noDeleteOnFetchRejection, allowStaleOnFetchRejection: y = this.allowStaleOnFetchRejection, ignoreFetchAbort: d = this.ignoreFetchAbort, allowStaleOnFetchAbort: p = this.allowStaleOnFetchAbort, context: f, forceRefresh: _ = !1, status: a, signal: S } = e;
			if (a && (a.op = "fetch", a.key = t, _ && (a.forceRefresh = !0), a.cache = this), !this.#U) return a && (a.fetch = "get"), this.#L(t, {
				allowStale: i,
				updateAgeOnGet: s,
				noDeleteOnStaleGet: n,
				status: a
			});
			let F = {
				allowStale: i,
				updateAgeOnGet: s,
				noDeleteOnStaleGet: n,
				ttl: o,
				noDisposeOnSet: l,
				size: h,
				sizeCalculation: r,
				noUpdateTTL: c,
				noDeleteOnFetchRejection: w,
				allowStaleOnFetchRejection: y,
				allowStaleOnFetchAbort: p,
				ignoreFetchAbort: d,
				status: a,
				signal: S
			}, b = this.#s.get(t);
			if (b === void 0) {
				a && (a.fetch = "miss");
				let m = this.#G(t, b, F, f);
				return m.__returned = m;
			} else {
				let m = this.#t[b];
				if (this.#e(m)) {
					let E = i && m.__staleWhileFetching !== void 0;
					return a && (a.fetch = "inflight", E && (a.returnedStale = !0)), E ? m.__staleWhileFetching : m.__returned = m;
				}
				let A = this.#p(b);
				if (!_ && !A) return a && (a.fetch = "hit"), this.#M(b), s && this.#D(b), a && this.#E(a, b), m;
				let z = this.#G(t, b, F, f), v = z.__staleWhileFetching !== void 0 && i;
				return a && (a.fetch = A ? "stale" : "refresh", v && A && (a.returnedStale = !0)), v ? z.__staleWhileFetching : z.__returned = z;
			}
		}
		forceFetch(t, e = {}) {
			let i = g.tracing.hasSubscribers, { status: s = C() ? {} : void 0 } = e;
			e.status = s, s && e.context && (s.context = e.context);
			let n = this.#K(t, e);
			return s && i && (s.trace = !0, g.tracing.tracePromise(() => n, s).catch(() => {})), n;
		}
		async #K(t, e = {}) {
			let i = await this.#q(t, e);
			if (i === void 0) throw new Error("fetch() returned undefined");
			return i;
		}
		memo(t, e = {}) {
			let { status: i = g.metrics.hasSubscribers ? {} : void 0 } = e;
			e.status = i, i && (i.op = "memo", i.key = t, e.context && (i.context = e.context), i.cache = this);
			let s = this.#Q(t, e);
			return i && (i.value = s), g.metrics.hasSubscribers && g.metrics.publish(i), s;
		}
		#Q(t, e = {}) {
			let i = this.#j;
			if (!i) throw new Error("no memoMethod provided to constructor");
			let { context: s, status: n, forceRefresh: o, ...l } = e;
			n && o && (n.forceRefresh = !0);
			let h = this.#L(t, l), r = o || h === void 0;
			if (n && (n.memo = r ? "miss" : "hit", r || (n.value = h)), !r) return h;
			let c = i(t, h, {
				options: l,
				context: s
			});
			return n && (n.value = c), this.#O(t, c, l), c;
		}
		get(t, e = {}) {
			let { status: i = g.metrics.hasSubscribers ? {} : void 0 } = e;
			e.status = i, i && (i.op = "get", i.key = t, i.cache = this);
			let s = this.#L(t, e);
			return i && (s !== void 0 && (i.value = s), g.metrics.hasSubscribers && g.metrics.publish(i)), s;
		}
		#L(t, e = {}) {
			let { allowStale: i = this.allowStale, updateAgeOnGet: s = this.updateAgeOnGet, noDeleteOnStaleGet: n = this.noDeleteOnStaleGet, status: o } = e, l = this.#s.get(t);
			if (l === void 0) {
				o && (o.get = "miss");
				return;
			}
			let h = this.#t[l], r = this.#e(h);
			return o && this.#E(o, l), this.#p(l) ? r ? (o && (o.get = "stale-fetching"), i && h.__staleWhileFetching !== void 0 ? (o && (o.returnedStale = !0), h.__staleWhileFetching) : void 0) : (n || this.#v(t, "expire"), o && (o.get = "stale"), i ? (o && (o.returnedStale = !0), h) : void 0) : (o && (o.get = r ? "fetching" : "hit"), this.#M(l), s && this.#D(l), r ? h.__staleWhileFetching : h);
		}
		#B(t, e) {
			this.#u[e] = t, this.#l[t] = e;
		}
		#M(t) {
			t !== this.#h && (t === this.#a ? this.#a = this.#l[t] : this.#B(this.#u[t], this.#l[t]), this.#B(this.#h, t), this.#h = t);
		}
		delete(t) {
			return this.#v(t, "delete");
		}
		#v(t, e) {
			g.metrics.hasSubscribers && g.metrics.publish({
				op: "delete",
				delete: e,
				key: t,
				cache: this
			});
			let i = !1;
			if (this.#n !== 0) {
				let s = this.#s.get(t);
				if (s !== void 0) if (this.#g?.[s] && (clearTimeout(this.#g[s]), this.#g[s] = void 0), i = !0, this.#n === 1) this.#$(e);
				else {
					this.#C(s);
					let n = this.#t[s];
					if (this.#e(n) ? n.__abortController.abort(/* @__PURE__ */ new Error("deleted")) : (this.#T || this.#f) && (this.#T && this.#m?.(n, t, e), this.#f && this.#r?.push([
						n,
						t,
						e
					])), this.#s.delete(t), this.#i[s] = void 0, this.#t[s] = void 0, s === this.#h) this.#h = this.#u[s];
					else if (s === this.#a) this.#a = this.#l[s];
					else {
						let o = this.#u[s];
						this.#l[o] = this.#l[s];
						let l = this.#l[s];
						this.#u[l] = this.#u[s];
					}
					this.#n--, this.#_.push(s);
				}
			}
			if (this.#f && this.#r?.length) {
				let s = this.#r, n;
				for (; n = s?.shift();) this.#S?.(...n);
			}
			return i;
		}
		clear() {
			return this.#$("delete");
		}
		#$(t) {
			for (let e of this.#z({ allowStale: !0 })) {
				let i = this.#t[e];
				if (this.#e(i)) i.__abortController.abort(/* @__PURE__ */ new Error("deleted"));
				else {
					let s = this.#i[e];
					this.#T && this.#m?.(i, s, t), this.#f && this.#r?.push([
						i,
						s,
						t
					]);
				}
			}
			if (this.#s.clear(), this.#t.fill(void 0), this.#i.fill(void 0), this.#d && this.#F) {
				this.#d.fill(0), this.#F.fill(0);
				for (let e of this.#g ?? []) e !== void 0 && clearTimeout(e);
				this.#g?.fill(void 0);
			}
			if (this.#y && this.#y.fill(0), this.#a = 0, this.#h = 0, this.#_.length = 0, this.#b = 0, this.#n = 0, this.#f && this.#r) {
				let e = this.#r, i;
				for (; i = e?.shift();) this.#S?.(...i);
			}
		}
	};
}));
//#endregion
//#region node_modules/lodash.clonedeep/index.js
var require_lodash_clonedeep = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* lodash (Custom Build) <https://lodash.com/>
	* Build: `lodash modularize exports="npm" -o ./`
	* Copyright jQuery Foundation and other contributors <https://jquery.org/>
	* Released under MIT license <https://lodash.com/license>
	* Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
	* Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
	*/
	/** Used as the size to enable large array optimizations. */
	var LARGE_ARRAY_SIZE = 200;
	/** Used to stand-in for `undefined` hash values. */
	var HASH_UNDEFINED = "__lodash_hash_undefined__";
	/** Used as references for various `Number` constants. */
	var MAX_SAFE_INTEGER = 9007199254740991;
	/** `Object#toString` result references. */
	var argsTag = "[object Arguments]", arrayTag = "[object Array]", boolTag = "[object Boolean]", dateTag = "[object Date]", errorTag = "[object Error]", funcTag = "[object Function]", genTag = "[object GeneratorFunction]", mapTag = "[object Map]", numberTag = "[object Number]", objectTag = "[object Object]", promiseTag = "[object Promise]", regexpTag = "[object RegExp]", setTag = "[object Set]", stringTag = "[object String]", symbolTag = "[object Symbol]", weakMapTag = "[object WeakMap]";
	var arrayBufferTag = "[object ArrayBuffer]", dataViewTag = "[object DataView]", float32Tag = "[object Float32Array]", float64Tag = "[object Float64Array]", int8Tag = "[object Int8Array]", int16Tag = "[object Int16Array]", int32Tag = "[object Int32Array]", uint8Tag = "[object Uint8Array]", uint8ClampedTag = "[object Uint8ClampedArray]", uint16Tag = "[object Uint16Array]", uint32Tag = "[object Uint32Array]";
	/**
	* Used to match `RegExp`
	* [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
	*/
	var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
	/** Used to match `RegExp` flags from their coerced string values. */
	var reFlags = /\w*$/;
	/** Used to detect host constructors (Safari). */
	var reIsHostCtor = /^\[object .+?Constructor\]$/;
	/** Used to detect unsigned integer values. */
	var reIsUint = /^(?:0|[1-9]\d*)$/;
	/** Used to identify `toStringTag` values supported by `_.clone`. */
	var cloneableTags = {};
	cloneableTags[argsTag] = cloneableTags[arrayTag] = cloneableTags[arrayBufferTag] = cloneableTags[dataViewTag] = cloneableTags[boolTag] = cloneableTags[dateTag] = cloneableTags[float32Tag] = cloneableTags[float64Tag] = cloneableTags[int8Tag] = cloneableTags[int16Tag] = cloneableTags[int32Tag] = cloneableTags[mapTag] = cloneableTags[numberTag] = cloneableTags[objectTag] = cloneableTags[regexpTag] = cloneableTags[setTag] = cloneableTags[stringTag] = cloneableTags[symbolTag] = cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] = cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
	cloneableTags[errorTag] = cloneableTags[funcTag] = cloneableTags[weakMapTag] = false;
	/** Detect free variable `global` from Node.js. */
	var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
	/** Detect free variable `self`. */
	var freeSelf = typeof self == "object" && self && self.Object === Object && self;
	/** Used as a reference to the global object. */
	var root = freeGlobal || freeSelf || Function("return this")();
	/** Detect free variable `exports`. */
	var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
	/** Detect free variable `module`. */
	var freeModule = freeExports && typeof module == "object" && module && !module.nodeType && module;
	/** Detect the popular CommonJS extension `module.exports`. */
	var moduleExports = freeModule && freeModule.exports === freeExports;
	/**
	* Adds the key-value `pair` to `map`.
	*
	* @private
	* @param {Object} map The map to modify.
	* @param {Array} pair The key-value pair to add.
	* @returns {Object} Returns `map`.
	*/
	function addMapEntry(map, pair) {
		map.set(pair[0], pair[1]);
		return map;
	}
	/**
	* Adds `value` to `set`.
	*
	* @private
	* @param {Object} set The set to modify.
	* @param {*} value The value to add.
	* @returns {Object} Returns `set`.
	*/
	function addSetEntry(set, value) {
		set.add(value);
		return set;
	}
	/**
	* A specialized version of `_.forEach` for arrays without support for
	* iteratee shorthands.
	*
	* @private
	* @param {Array} [array] The array to iterate over.
	* @param {Function} iteratee The function invoked per iteration.
	* @returns {Array} Returns `array`.
	*/
	function arrayEach(array, iteratee) {
		var index = -1, length = array ? array.length : 0;
		while (++index < length) if (iteratee(array[index], index, array) === false) break;
		return array;
	}
	/**
	* Appends the elements of `values` to `array`.
	*
	* @private
	* @param {Array} array The array to modify.
	* @param {Array} values The values to append.
	* @returns {Array} Returns `array`.
	*/
	function arrayPush(array, values) {
		var index = -1, length = values.length, offset = array.length;
		while (++index < length) array[offset + index] = values[index];
		return array;
	}
	/**
	* A specialized version of `_.reduce` for arrays without support for
	* iteratee shorthands.
	*
	* @private
	* @param {Array} [array] The array to iterate over.
	* @param {Function} iteratee The function invoked per iteration.
	* @param {*} [accumulator] The initial value.
	* @param {boolean} [initAccum] Specify using the first element of `array` as
	*  the initial value.
	* @returns {*} Returns the accumulated value.
	*/
	function arrayReduce(array, iteratee, accumulator, initAccum) {
		var index = -1, length = array ? array.length : 0;
		if (initAccum && length) accumulator = array[++index];
		while (++index < length) accumulator = iteratee(accumulator, array[index], index, array);
		return accumulator;
	}
	/**
	* The base implementation of `_.times` without support for iteratee shorthands
	* or max array length checks.
	*
	* @private
	* @param {number} n The number of times to invoke `iteratee`.
	* @param {Function} iteratee The function invoked per iteration.
	* @returns {Array} Returns the array of results.
	*/
	function baseTimes(n, iteratee) {
		var index = -1, result = Array(n);
		while (++index < n) result[index] = iteratee(index);
		return result;
	}
	/**
	* Gets the value at `key` of `object`.
	*
	* @private
	* @param {Object} [object] The object to query.
	* @param {string} key The key of the property to get.
	* @returns {*} Returns the property value.
	*/
	function getValue(object, key) {
		return object == null ? void 0 : object[key];
	}
	/**
	* Checks if `value` is a host object in IE < 9.
	*
	* @private
	* @param {*} value The value to check.
	* @returns {boolean} Returns `true` if `value` is a host object, else `false`.
	*/
	function isHostObject(value) {
		var result = false;
		if (value != null && typeof value.toString != "function") try {
			result = !!(value + "");
		} catch (e) {}
		return result;
	}
	/**
	* Converts `map` to its key-value pairs.
	*
	* @private
	* @param {Object} map The map to convert.
	* @returns {Array} Returns the key-value pairs.
	*/
	function mapToArray(map) {
		var index = -1, result = Array(map.size);
		map.forEach(function(value, key) {
			result[++index] = [key, value];
		});
		return result;
	}
	/**
	* Creates a unary function that invokes `func` with its argument transformed.
	*
	* @private
	* @param {Function} func The function to wrap.
	* @param {Function} transform The argument transform.
	* @returns {Function} Returns the new function.
	*/
	function overArg(func, transform) {
		return function(arg) {
			return func(transform(arg));
		};
	}
	/**
	* Converts `set` to an array of its values.
	*
	* @private
	* @param {Object} set The set to convert.
	* @returns {Array} Returns the values.
	*/
	function setToArray(set) {
		var index = -1, result = Array(set.size);
		set.forEach(function(value) {
			result[++index] = value;
		});
		return result;
	}
	/** Used for built-in method references. */
	var arrayProto = Array.prototype, funcProto = Function.prototype, objectProto = Object.prototype;
	/** Used to detect overreaching core-js shims. */
	var coreJsData = root["__core-js_shared__"];
	/** Used to detect methods masquerading as native. */
	var maskSrcKey = function() {
		var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
		return uid ? "Symbol(src)_1." + uid : "";
	}();
	/** Used to resolve the decompiled source of functions. */
	var funcToString = funcProto.toString;
	/** Used to check objects for own properties. */
	var hasOwnProperty = objectProto.hasOwnProperty;
	/**
	* Used to resolve the
	* [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
	* of values.
	*/
	var objectToString = objectProto.toString;
	/** Used to detect if a method is native. */
	var reIsNative = RegExp("^" + funcToString.call(hasOwnProperty).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$");
	/** Built-in value references. */
	var Buffer = moduleExports ? root.Buffer : void 0, Symbol = root.Symbol, Uint8Array = root.Uint8Array, getPrototype = overArg(Object.getPrototypeOf, Object), objectCreate = Object.create, propertyIsEnumerable = objectProto.propertyIsEnumerable, splice = arrayProto.splice;
	var nativeGetSymbols = Object.getOwnPropertySymbols, nativeIsBuffer = Buffer ? Buffer.isBuffer : void 0, nativeKeys = overArg(Object.keys, Object);
	var DataView = getNative(root, "DataView"), Map = getNative(root, "Map"), Promise = getNative(root, "Promise"), Set = getNative(root, "Set"), WeakMap = getNative(root, "WeakMap"), nativeCreate = getNative(Object, "create");
	/** Used to detect maps, sets, and weakmaps. */
	var dataViewCtorString = toSource(DataView), mapCtorString = toSource(Map), promiseCtorString = toSource(Promise), setCtorString = toSource(Set), weakMapCtorString = toSource(WeakMap);
	/** Used to convert symbols to primitives and strings. */
	var symbolProto = Symbol ? Symbol.prototype : void 0, symbolValueOf = symbolProto ? symbolProto.valueOf : void 0;
	/**
	* Creates a hash object.
	*
	* @private
	* @constructor
	* @param {Array} [entries] The key-value pairs to cache.
	*/
	function Hash(entries) {
		var index = -1, length = entries ? entries.length : 0;
		this.clear();
		while (++index < length) {
			var entry = entries[index];
			this.set(entry[0], entry[1]);
		}
	}
	/**
	* Removes all key-value entries from the hash.
	*
	* @private
	* @name clear
	* @memberOf Hash
	*/
	function hashClear() {
		this.__data__ = nativeCreate ? nativeCreate(null) : {};
	}
	/**
	* Removes `key` and its value from the hash.
	*
	* @private
	* @name delete
	* @memberOf Hash
	* @param {Object} hash The hash to modify.
	* @param {string} key The key of the value to remove.
	* @returns {boolean} Returns `true` if the entry was removed, else `false`.
	*/
	function hashDelete(key) {
		return this.has(key) && delete this.__data__[key];
	}
	/**
	* Gets the hash value for `key`.
	*
	* @private
	* @name get
	* @memberOf Hash
	* @param {string} key The key of the value to get.
	* @returns {*} Returns the entry value.
	*/
	function hashGet(key) {
		var data = this.__data__;
		if (nativeCreate) {
			var result = data[key];
			return result === HASH_UNDEFINED ? void 0 : result;
		}
		return hasOwnProperty.call(data, key) ? data[key] : void 0;
	}
	/**
	* Checks if a hash value for `key` exists.
	*
	* @private
	* @name has
	* @memberOf Hash
	* @param {string} key The key of the entry to check.
	* @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	*/
	function hashHas(key) {
		var data = this.__data__;
		return nativeCreate ? data[key] !== void 0 : hasOwnProperty.call(data, key);
	}
	/**
	* Sets the hash `key` to `value`.
	*
	* @private
	* @name set
	* @memberOf Hash
	* @param {string} key The key of the value to set.
	* @param {*} value The value to set.
	* @returns {Object} Returns the hash instance.
	*/
	function hashSet(key, value) {
		var data = this.__data__;
		data[key] = nativeCreate && value === void 0 ? HASH_UNDEFINED : value;
		return this;
	}
	Hash.prototype.clear = hashClear;
	Hash.prototype["delete"] = hashDelete;
	Hash.prototype.get = hashGet;
	Hash.prototype.has = hashHas;
	Hash.prototype.set = hashSet;
	/**
	* Creates an list cache object.
	*
	* @private
	* @constructor
	* @param {Array} [entries] The key-value pairs to cache.
	*/
	function ListCache(entries) {
		var index = -1, length = entries ? entries.length : 0;
		this.clear();
		while (++index < length) {
			var entry = entries[index];
			this.set(entry[0], entry[1]);
		}
	}
	/**
	* Removes all key-value entries from the list cache.
	*
	* @private
	* @name clear
	* @memberOf ListCache
	*/
	function listCacheClear() {
		this.__data__ = [];
	}
	/**
	* Removes `key` and its value from the list cache.
	*
	* @private
	* @name delete
	* @memberOf ListCache
	* @param {string} key The key of the value to remove.
	* @returns {boolean} Returns `true` if the entry was removed, else `false`.
	*/
	function listCacheDelete(key) {
		var data = this.__data__, index = assocIndexOf(data, key);
		if (index < 0) return false;
		if (index == data.length - 1) data.pop();
		else splice.call(data, index, 1);
		return true;
	}
	/**
	* Gets the list cache value for `key`.
	*
	* @private
	* @name get
	* @memberOf ListCache
	* @param {string} key The key of the value to get.
	* @returns {*} Returns the entry value.
	*/
	function listCacheGet(key) {
		var data = this.__data__, index = assocIndexOf(data, key);
		return index < 0 ? void 0 : data[index][1];
	}
	/**
	* Checks if a list cache value for `key` exists.
	*
	* @private
	* @name has
	* @memberOf ListCache
	* @param {string} key The key of the entry to check.
	* @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	*/
	function listCacheHas(key) {
		return assocIndexOf(this.__data__, key) > -1;
	}
	/**
	* Sets the list cache `key` to `value`.
	*
	* @private
	* @name set
	* @memberOf ListCache
	* @param {string} key The key of the value to set.
	* @param {*} value The value to set.
	* @returns {Object} Returns the list cache instance.
	*/
	function listCacheSet(key, value) {
		var data = this.__data__, index = assocIndexOf(data, key);
		if (index < 0) data.push([key, value]);
		else data[index][1] = value;
		return this;
	}
	ListCache.prototype.clear = listCacheClear;
	ListCache.prototype["delete"] = listCacheDelete;
	ListCache.prototype.get = listCacheGet;
	ListCache.prototype.has = listCacheHas;
	ListCache.prototype.set = listCacheSet;
	/**
	* Creates a map cache object to store key-value pairs.
	*
	* @private
	* @constructor
	* @param {Array} [entries] The key-value pairs to cache.
	*/
	function MapCache(entries) {
		var index = -1, length = entries ? entries.length : 0;
		this.clear();
		while (++index < length) {
			var entry = entries[index];
			this.set(entry[0], entry[1]);
		}
	}
	/**
	* Removes all key-value entries from the map.
	*
	* @private
	* @name clear
	* @memberOf MapCache
	*/
	function mapCacheClear() {
		this.__data__ = {
			"hash": new Hash(),
			"map": new (Map || ListCache)(),
			"string": new Hash()
		};
	}
	/**
	* Removes `key` and its value from the map.
	*
	* @private
	* @name delete
	* @memberOf MapCache
	* @param {string} key The key of the value to remove.
	* @returns {boolean} Returns `true` if the entry was removed, else `false`.
	*/
	function mapCacheDelete(key) {
		return getMapData(this, key)["delete"](key);
	}
	/**
	* Gets the map value for `key`.
	*
	* @private
	* @name get
	* @memberOf MapCache
	* @param {string} key The key of the value to get.
	* @returns {*} Returns the entry value.
	*/
	function mapCacheGet(key) {
		return getMapData(this, key).get(key);
	}
	/**
	* Checks if a map value for `key` exists.
	*
	* @private
	* @name has
	* @memberOf MapCache
	* @param {string} key The key of the entry to check.
	* @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	*/
	function mapCacheHas(key) {
		return getMapData(this, key).has(key);
	}
	/**
	* Sets the map `key` to `value`.
	*
	* @private
	* @name set
	* @memberOf MapCache
	* @param {string} key The key of the value to set.
	* @param {*} value The value to set.
	* @returns {Object} Returns the map cache instance.
	*/
	function mapCacheSet(key, value) {
		getMapData(this, key).set(key, value);
		return this;
	}
	MapCache.prototype.clear = mapCacheClear;
	MapCache.prototype["delete"] = mapCacheDelete;
	MapCache.prototype.get = mapCacheGet;
	MapCache.prototype.has = mapCacheHas;
	MapCache.prototype.set = mapCacheSet;
	/**
	* Creates a stack cache object to store key-value pairs.
	*
	* @private
	* @constructor
	* @param {Array} [entries] The key-value pairs to cache.
	*/
	function Stack(entries) {
		this.__data__ = new ListCache(entries);
	}
	/**
	* Removes all key-value entries from the stack.
	*
	* @private
	* @name clear
	* @memberOf Stack
	*/
	function stackClear() {
		this.__data__ = new ListCache();
	}
	/**
	* Removes `key` and its value from the stack.
	*
	* @private
	* @name delete
	* @memberOf Stack
	* @param {string} key The key of the value to remove.
	* @returns {boolean} Returns `true` if the entry was removed, else `false`.
	*/
	function stackDelete(key) {
		return this.__data__["delete"](key);
	}
	/**
	* Gets the stack value for `key`.
	*
	* @private
	* @name get
	* @memberOf Stack
	* @param {string} key The key of the value to get.
	* @returns {*} Returns the entry value.
	*/
	function stackGet(key) {
		return this.__data__.get(key);
	}
	/**
	* Checks if a stack value for `key` exists.
	*
	* @private
	* @name has
	* @memberOf Stack
	* @param {string} key The key of the entry to check.
	* @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	*/
	function stackHas(key) {
		return this.__data__.has(key);
	}
	/**
	* Sets the stack `key` to `value`.
	*
	* @private
	* @name set
	* @memberOf Stack
	* @param {string} key The key of the value to set.
	* @param {*} value The value to set.
	* @returns {Object} Returns the stack cache instance.
	*/
	function stackSet(key, value) {
		var cache = this.__data__;
		if (cache instanceof ListCache) {
			var pairs = cache.__data__;
			if (!Map || pairs.length < LARGE_ARRAY_SIZE - 1) {
				pairs.push([key, value]);
				return this;
			}
			cache = this.__data__ = new MapCache(pairs);
		}
		cache.set(key, value);
		return this;
	}
	Stack.prototype.clear = stackClear;
	Stack.prototype["delete"] = stackDelete;
	Stack.prototype.get = stackGet;
	Stack.prototype.has = stackHas;
	Stack.prototype.set = stackSet;
	/**
	* Creates an array of the enumerable property names of the array-like `value`.
	*
	* @private
	* @param {*} value The value to query.
	* @param {boolean} inherited Specify returning inherited property names.
	* @returns {Array} Returns the array of property names.
	*/
	function arrayLikeKeys(value, inherited) {
		var result = isArray(value) || isArguments(value) ? baseTimes(value.length, String) : [];
		var length = result.length, skipIndexes = !!length;
		for (var key in value) if ((inherited || hasOwnProperty.call(value, key)) && !(skipIndexes && (key == "length" || isIndex(key, length)))) result.push(key);
		return result;
	}
	/**
	* Assigns `value` to `key` of `object` if the existing value is not equivalent
	* using [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
	* for equality comparisons.
	*
	* @private
	* @param {Object} object The object to modify.
	* @param {string} key The key of the property to assign.
	* @param {*} value The value to assign.
	*/
	function assignValue(object, key, value) {
		var objValue = object[key];
		if (!(hasOwnProperty.call(object, key) && eq(objValue, value)) || value === void 0 && !(key in object)) object[key] = value;
	}
	/**
	* Gets the index at which the `key` is found in `array` of key-value pairs.
	*
	* @private
	* @param {Array} array The array to inspect.
	* @param {*} key The key to search for.
	* @returns {number} Returns the index of the matched value, else `-1`.
	*/
	function assocIndexOf(array, key) {
		var length = array.length;
		while (length--) if (eq(array[length][0], key)) return length;
		return -1;
	}
	/**
	* The base implementation of `_.assign` without support for multiple sources
	* or `customizer` functions.
	*
	* @private
	* @param {Object} object The destination object.
	* @param {Object} source The source object.
	* @returns {Object} Returns `object`.
	*/
	function baseAssign(object, source) {
		return object && copyObject(source, keys(source), object);
	}
	/**
	* The base implementation of `_.clone` and `_.cloneDeep` which tracks
	* traversed objects.
	*
	* @private
	* @param {*} value The value to clone.
	* @param {boolean} [isDeep] Specify a deep clone.
	* @param {boolean} [isFull] Specify a clone including symbols.
	* @param {Function} [customizer] The function to customize cloning.
	* @param {string} [key] The key of `value`.
	* @param {Object} [object] The parent object of `value`.
	* @param {Object} [stack] Tracks traversed objects and their clone counterparts.
	* @returns {*} Returns the cloned value.
	*/
	function baseClone(value, isDeep, isFull, customizer, key, object, stack) {
		var result;
		if (customizer) result = object ? customizer(value, key, object, stack) : customizer(value);
		if (result !== void 0) return result;
		if (!isObject(value)) return value;
		var isArr = isArray(value);
		if (isArr) {
			result = initCloneArray(value);
			if (!isDeep) return copyArray(value, result);
		} else {
			var tag = getTag(value), isFunc = tag == funcTag || tag == genTag;
			if (isBuffer(value)) return cloneBuffer(value, isDeep);
			if (tag == objectTag || tag == argsTag || isFunc && !object) {
				if (isHostObject(value)) return object ? value : {};
				result = initCloneObject(isFunc ? {} : value);
				if (!isDeep) return copySymbols(value, baseAssign(result, value));
			} else {
				if (!cloneableTags[tag]) return object ? value : {};
				result = initCloneByTag(value, tag, baseClone, isDeep);
			}
		}
		stack || (stack = new Stack());
		var stacked = stack.get(value);
		if (stacked) return stacked;
		stack.set(value, result);
		if (!isArr) var props = isFull ? getAllKeys(value) : keys(value);
		arrayEach(props || value, function(subValue, key) {
			if (props) {
				key = subValue;
				subValue = value[key];
			}
			assignValue(result, key, baseClone(subValue, isDeep, isFull, customizer, key, value, stack));
		});
		return result;
	}
	/**
	* The base implementation of `_.create` without support for assigning
	* properties to the created object.
	*
	* @private
	* @param {Object} prototype The object to inherit from.
	* @returns {Object} Returns the new object.
	*/
	function baseCreate(proto) {
		return isObject(proto) ? objectCreate(proto) : {};
	}
	/**
	* The base implementation of `getAllKeys` and `getAllKeysIn` which uses
	* `keysFunc` and `symbolsFunc` to get the enumerable property names and
	* symbols of `object`.
	*
	* @private
	* @param {Object} object The object to query.
	* @param {Function} keysFunc The function to get the keys of `object`.
	* @param {Function} symbolsFunc The function to get the symbols of `object`.
	* @returns {Array} Returns the array of property names and symbols.
	*/
	function baseGetAllKeys(object, keysFunc, symbolsFunc) {
		var result = keysFunc(object);
		return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
	}
	/**
	* The base implementation of `getTag`.
	*
	* @private
	* @param {*} value The value to query.
	* @returns {string} Returns the `toStringTag`.
	*/
	function baseGetTag(value) {
		return objectToString.call(value);
	}
	/**
	* The base implementation of `_.isNative` without bad shim checks.
	*
	* @private
	* @param {*} value The value to check.
	* @returns {boolean} Returns `true` if `value` is a native function,
	*  else `false`.
	*/
	function baseIsNative(value) {
		if (!isObject(value) || isMasked(value)) return false;
		return (isFunction(value) || isHostObject(value) ? reIsNative : reIsHostCtor).test(toSource(value));
	}
	/**
	* The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
	*
	* @private
	* @param {Object} object The object to query.
	* @returns {Array} Returns the array of property names.
	*/
	function baseKeys(object) {
		if (!isPrototype(object)) return nativeKeys(object);
		var result = [];
		for (var key in Object(object)) if (hasOwnProperty.call(object, key) && key != "constructor") result.push(key);
		return result;
	}
	/**
	* Creates a clone of  `buffer`.
	*
	* @private
	* @param {Buffer} buffer The buffer to clone.
	* @param {boolean} [isDeep] Specify a deep clone.
	* @returns {Buffer} Returns the cloned buffer.
	*/
	function cloneBuffer(buffer, isDeep) {
		if (isDeep) return buffer.slice();
		var result = new buffer.constructor(buffer.length);
		buffer.copy(result);
		return result;
	}
	/**
	* Creates a clone of `arrayBuffer`.
	*
	* @private
	* @param {ArrayBuffer} arrayBuffer The array buffer to clone.
	* @returns {ArrayBuffer} Returns the cloned array buffer.
	*/
	function cloneArrayBuffer(arrayBuffer) {
		var result = new arrayBuffer.constructor(arrayBuffer.byteLength);
		new Uint8Array(result).set(new Uint8Array(arrayBuffer));
		return result;
	}
	/**
	* Creates a clone of `dataView`.
	*
	* @private
	* @param {Object} dataView The data view to clone.
	* @param {boolean} [isDeep] Specify a deep clone.
	* @returns {Object} Returns the cloned data view.
	*/
	function cloneDataView(dataView, isDeep) {
		var buffer = isDeep ? cloneArrayBuffer(dataView.buffer) : dataView.buffer;
		return new dataView.constructor(buffer, dataView.byteOffset, dataView.byteLength);
	}
	/**
	* Creates a clone of `map`.
	*
	* @private
	* @param {Object} map The map to clone.
	* @param {Function} cloneFunc The function to clone values.
	* @param {boolean} [isDeep] Specify a deep clone.
	* @returns {Object} Returns the cloned map.
	*/
	function cloneMap(map, isDeep, cloneFunc) {
		return arrayReduce(isDeep ? cloneFunc(mapToArray(map), true) : mapToArray(map), addMapEntry, new map.constructor());
	}
	/**
	* Creates a clone of `regexp`.
	*
	* @private
	* @param {Object} regexp The regexp to clone.
	* @returns {Object} Returns the cloned regexp.
	*/
	function cloneRegExp(regexp) {
		var result = new regexp.constructor(regexp.source, reFlags.exec(regexp));
		result.lastIndex = regexp.lastIndex;
		return result;
	}
	/**
	* Creates a clone of `set`.
	*
	* @private
	* @param {Object} set The set to clone.
	* @param {Function} cloneFunc The function to clone values.
	* @param {boolean} [isDeep] Specify a deep clone.
	* @returns {Object} Returns the cloned set.
	*/
	function cloneSet(set, isDeep, cloneFunc) {
		return arrayReduce(isDeep ? cloneFunc(setToArray(set), true) : setToArray(set), addSetEntry, new set.constructor());
	}
	/**
	* Creates a clone of the `symbol` object.
	*
	* @private
	* @param {Object} symbol The symbol object to clone.
	* @returns {Object} Returns the cloned symbol object.
	*/
	function cloneSymbol(symbol) {
		return symbolValueOf ? Object(symbolValueOf.call(symbol)) : {};
	}
	/**
	* Creates a clone of `typedArray`.
	*
	* @private
	* @param {Object} typedArray The typed array to clone.
	* @param {boolean} [isDeep] Specify a deep clone.
	* @returns {Object} Returns the cloned typed array.
	*/
	function cloneTypedArray(typedArray, isDeep) {
		var buffer = isDeep ? cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
		return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
	}
	/**
	* Copies the values of `source` to `array`.
	*
	* @private
	* @param {Array} source The array to copy values from.
	* @param {Array} [array=[]] The array to copy values to.
	* @returns {Array} Returns `array`.
	*/
	function copyArray(source, array) {
		var index = -1, length = source.length;
		array || (array = Array(length));
		while (++index < length) array[index] = source[index];
		return array;
	}
	/**
	* Copies properties of `source` to `object`.
	*
	* @private
	* @param {Object} source The object to copy properties from.
	* @param {Array} props The property identifiers to copy.
	* @param {Object} [object={}] The object to copy properties to.
	* @param {Function} [customizer] The function to customize copied values.
	* @returns {Object} Returns `object`.
	*/
	function copyObject(source, props, object, customizer) {
		object || (object = {});
		var index = -1, length = props.length;
		while (++index < length) {
			var key = props[index];
			var newValue = customizer ? customizer(object[key], source[key], key, object, source) : void 0;
			assignValue(object, key, newValue === void 0 ? source[key] : newValue);
		}
		return object;
	}
	/**
	* Copies own symbol properties of `source` to `object`.
	*
	* @private
	* @param {Object} source The object to copy symbols from.
	* @param {Object} [object={}] The object to copy symbols to.
	* @returns {Object} Returns `object`.
	*/
	function copySymbols(source, object) {
		return copyObject(source, getSymbols(source), object);
	}
	/**
	* Creates an array of own enumerable property names and symbols of `object`.
	*
	* @private
	* @param {Object} object The object to query.
	* @returns {Array} Returns the array of property names and symbols.
	*/
	function getAllKeys(object) {
		return baseGetAllKeys(object, keys, getSymbols);
	}
	/**
	* Gets the data for `map`.
	*
	* @private
	* @param {Object} map The map to query.
	* @param {string} key The reference key.
	* @returns {*} Returns the map data.
	*/
	function getMapData(map, key) {
		var data = map.__data__;
		return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
	}
	/**
	* Gets the native function at `key` of `object`.
	*
	* @private
	* @param {Object} object The object to query.
	* @param {string} key The key of the method to get.
	* @returns {*} Returns the function if it's native, else `undefined`.
	*/
	function getNative(object, key) {
		var value = getValue(object, key);
		return baseIsNative(value) ? value : void 0;
	}
	/**
	* Creates an array of the own enumerable symbol properties of `object`.
	*
	* @private
	* @param {Object} object The object to query.
	* @returns {Array} Returns the array of symbols.
	*/
	var getSymbols = nativeGetSymbols ? overArg(nativeGetSymbols, Object) : stubArray;
	/**
	* Gets the `toStringTag` of `value`.
	*
	* @private
	* @param {*} value The value to query.
	* @returns {string} Returns the `toStringTag`.
	*/
	var getTag = baseGetTag;
	if (DataView && getTag(new DataView(/* @__PURE__ */ new ArrayBuffer(1))) != dataViewTag || Map && getTag(new Map()) != mapTag || Promise && getTag(Promise.resolve()) != promiseTag || Set && getTag(new Set()) != setTag || WeakMap && getTag(new WeakMap()) != weakMapTag) getTag = function(value) {
		var result = objectToString.call(value), Ctor = result == objectTag ? value.constructor : void 0, ctorString = Ctor ? toSource(Ctor) : void 0;
		if (ctorString) switch (ctorString) {
			case dataViewCtorString: return dataViewTag;
			case mapCtorString: return mapTag;
			case promiseCtorString: return promiseTag;
			case setCtorString: return setTag;
			case weakMapCtorString: return weakMapTag;
		}
		return result;
	};
	/**
	* Initializes an array clone.
	*
	* @private
	* @param {Array} array The array to clone.
	* @returns {Array} Returns the initialized clone.
	*/
	function initCloneArray(array) {
		var length = array.length, result = array.constructor(length);
		if (length && typeof array[0] == "string" && hasOwnProperty.call(array, "index")) {
			result.index = array.index;
			result.input = array.input;
		}
		return result;
	}
	/**
	* Initializes an object clone.
	*
	* @private
	* @param {Object} object The object to clone.
	* @returns {Object} Returns the initialized clone.
	*/
	function initCloneObject(object) {
		return typeof object.constructor == "function" && !isPrototype(object) ? baseCreate(getPrototype(object)) : {};
	}
	/**
	* Initializes an object clone based on its `toStringTag`.
	*
	* **Note:** This function only supports cloning values with tags of
	* `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
	*
	* @private
	* @param {Object} object The object to clone.
	* @param {string} tag The `toStringTag` of the object to clone.
	* @param {Function} cloneFunc The function to clone values.
	* @param {boolean} [isDeep] Specify a deep clone.
	* @returns {Object} Returns the initialized clone.
	*/
	function initCloneByTag(object, tag, cloneFunc, isDeep) {
		var Ctor = object.constructor;
		switch (tag) {
			case arrayBufferTag: return cloneArrayBuffer(object);
			case boolTag:
			case dateTag: return new Ctor(+object);
			case dataViewTag: return cloneDataView(object, isDeep);
			case float32Tag:
			case float64Tag:
			case int8Tag:
			case int16Tag:
			case int32Tag:
			case uint8Tag:
			case uint8ClampedTag:
			case uint16Tag:
			case uint32Tag: return cloneTypedArray(object, isDeep);
			case mapTag: return cloneMap(object, isDeep, cloneFunc);
			case numberTag:
			case stringTag: return new Ctor(object);
			case regexpTag: return cloneRegExp(object);
			case setTag: return cloneSet(object, isDeep, cloneFunc);
			case symbolTag: return cloneSymbol(object);
		}
	}
	/**
	* Checks if `value` is a valid array-like index.
	*
	* @private
	* @param {*} value The value to check.
	* @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
	* @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
	*/
	function isIndex(value, length) {
		length = length == null ? MAX_SAFE_INTEGER : length;
		return !!length && (typeof value == "number" || reIsUint.test(value)) && value > -1 && value % 1 == 0 && value < length;
	}
	/**
	* Checks if `value` is suitable for use as unique object key.
	*
	* @private
	* @param {*} value The value to check.
	* @returns {boolean} Returns `true` if `value` is suitable, else `false`.
	*/
	function isKeyable(value) {
		var type = typeof value;
		return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
	}
	/**
	* Checks if `func` has its source masked.
	*
	* @private
	* @param {Function} func The function to check.
	* @returns {boolean} Returns `true` if `func` is masked, else `false`.
	*/
	function isMasked(func) {
		return !!maskSrcKey && maskSrcKey in func;
	}
	/**
	* Checks if `value` is likely a prototype object.
	*
	* @private
	* @param {*} value The value to check.
	* @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
	*/
	function isPrototype(value) {
		var Ctor = value && value.constructor;
		return value === (typeof Ctor == "function" && Ctor.prototype || objectProto);
	}
	/**
	* Converts `func` to its source code.
	*
	* @private
	* @param {Function} func The function to process.
	* @returns {string} Returns the source code.
	*/
	function toSource(func) {
		if (func != null) {
			try {
				return funcToString.call(func);
			} catch (e) {}
			try {
				return func + "";
			} catch (e) {}
		}
		return "";
	}
	/**
	* This method is like `_.clone` except that it recursively clones `value`.
	*
	* @static
	* @memberOf _
	* @since 1.0.0
	* @category Lang
	* @param {*} value The value to recursively clone.
	* @returns {*} Returns the deep cloned value.
	* @see _.clone
	* @example
	*
	* var objects = [{ 'a': 1 }, { 'b': 2 }];
	*
	* var deep = _.cloneDeep(objects);
	* console.log(deep[0] === objects[0]);
	* // => false
	*/
	function cloneDeep(value) {
		return baseClone(value, true, true);
	}
	/**
	* Performs a
	* [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
	* comparison between two values to determine if they are equivalent.
	*
	* @static
	* @memberOf _
	* @since 4.0.0
	* @category Lang
	* @param {*} value The value to compare.
	* @param {*} other The other value to compare.
	* @returns {boolean} Returns `true` if the values are equivalent, else `false`.
	* @example
	*
	* var object = { 'a': 1 };
	* var other = { 'a': 1 };
	*
	* _.eq(object, object);
	* // => true
	*
	* _.eq(object, other);
	* // => false
	*
	* _.eq('a', 'a');
	* // => true
	*
	* _.eq('a', Object('a'));
	* // => false
	*
	* _.eq(NaN, NaN);
	* // => true
	*/
	function eq(value, other) {
		return value === other || value !== value && other !== other;
	}
	/**
	* Checks if `value` is likely an `arguments` object.
	*
	* @static
	* @memberOf _
	* @since 0.1.0
	* @category Lang
	* @param {*} value The value to check.
	* @returns {boolean} Returns `true` if `value` is an `arguments` object,
	*  else `false`.
	* @example
	*
	* _.isArguments(function() { return arguments; }());
	* // => true
	*
	* _.isArguments([1, 2, 3]);
	* // => false
	*/
	function isArguments(value) {
		return isArrayLikeObject(value) && hasOwnProperty.call(value, "callee") && (!propertyIsEnumerable.call(value, "callee") || objectToString.call(value) == argsTag);
	}
	/**
	* Checks if `value` is classified as an `Array` object.
	*
	* @static
	* @memberOf _
	* @since 0.1.0
	* @category Lang
	* @param {*} value The value to check.
	* @returns {boolean} Returns `true` if `value` is an array, else `false`.
	* @example
	*
	* _.isArray([1, 2, 3]);
	* // => true
	*
	* _.isArray(document.body.children);
	* // => false
	*
	* _.isArray('abc');
	* // => false
	*
	* _.isArray(_.noop);
	* // => false
	*/
	var isArray = Array.isArray;
	/**
	* Checks if `value` is array-like. A value is considered array-like if it's
	* not a function and has a `value.length` that's an integer greater than or
	* equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
	*
	* @static
	* @memberOf _
	* @since 4.0.0
	* @category Lang
	* @param {*} value The value to check.
	* @returns {boolean} Returns `true` if `value` is array-like, else `false`.
	* @example
	*
	* _.isArrayLike([1, 2, 3]);
	* // => true
	*
	* _.isArrayLike(document.body.children);
	* // => true
	*
	* _.isArrayLike('abc');
	* // => true
	*
	* _.isArrayLike(_.noop);
	* // => false
	*/
	function isArrayLike(value) {
		return value != null && isLength(value.length) && !isFunction(value);
	}
	/**
	* This method is like `_.isArrayLike` except that it also checks if `value`
	* is an object.
	*
	* @static
	* @memberOf _
	* @since 4.0.0
	* @category Lang
	* @param {*} value The value to check.
	* @returns {boolean} Returns `true` if `value` is an array-like object,
	*  else `false`.
	* @example
	*
	* _.isArrayLikeObject([1, 2, 3]);
	* // => true
	*
	* _.isArrayLikeObject(document.body.children);
	* // => true
	*
	* _.isArrayLikeObject('abc');
	* // => false
	*
	* _.isArrayLikeObject(_.noop);
	* // => false
	*/
	function isArrayLikeObject(value) {
		return isObjectLike(value) && isArrayLike(value);
	}
	/**
	* Checks if `value` is a buffer.
	*
	* @static
	* @memberOf _
	* @since 4.3.0
	* @category Lang
	* @param {*} value The value to check.
	* @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
	* @example
	*
	* _.isBuffer(new Buffer(2));
	* // => true
	*
	* _.isBuffer(new Uint8Array(2));
	* // => false
	*/
	var isBuffer = nativeIsBuffer || stubFalse;
	/**
	* Checks if `value` is classified as a `Function` object.
	*
	* @static
	* @memberOf _
	* @since 0.1.0
	* @category Lang
	* @param {*} value The value to check.
	* @returns {boolean} Returns `true` if `value` is a function, else `false`.
	* @example
	*
	* _.isFunction(_);
	* // => true
	*
	* _.isFunction(/abc/);
	* // => false
	*/
	function isFunction(value) {
		var tag = isObject(value) ? objectToString.call(value) : "";
		return tag == funcTag || tag == genTag;
	}
	/**
	* Checks if `value` is a valid array-like length.
	*
	* **Note:** This method is loosely based on
	* [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
	*
	* @static
	* @memberOf _
	* @since 4.0.0
	* @category Lang
	* @param {*} value The value to check.
	* @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
	* @example
	*
	* _.isLength(3);
	* // => true
	*
	* _.isLength(Number.MIN_VALUE);
	* // => false
	*
	* _.isLength(Infinity);
	* // => false
	*
	* _.isLength('3');
	* // => false
	*/
	function isLength(value) {
		return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
	}
	/**
	* Checks if `value` is the
	* [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
	* of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
	*
	* @static
	* @memberOf _
	* @since 0.1.0
	* @category Lang
	* @param {*} value The value to check.
	* @returns {boolean} Returns `true` if `value` is an object, else `false`.
	* @example
	*
	* _.isObject({});
	* // => true
	*
	* _.isObject([1, 2, 3]);
	* // => true
	*
	* _.isObject(_.noop);
	* // => true
	*
	* _.isObject(null);
	* // => false
	*/
	function isObject(value) {
		var type = typeof value;
		return !!value && (type == "object" || type == "function");
	}
	/**
	* Checks if `value` is object-like. A value is object-like if it's not `null`
	* and has a `typeof` result of "object".
	*
	* @static
	* @memberOf _
	* @since 4.0.0
	* @category Lang
	* @param {*} value The value to check.
	* @returns {boolean} Returns `true` if `value` is object-like, else `false`.
	* @example
	*
	* _.isObjectLike({});
	* // => true
	*
	* _.isObjectLike([1, 2, 3]);
	* // => true
	*
	* _.isObjectLike(_.noop);
	* // => false
	*
	* _.isObjectLike(null);
	* // => false
	*/
	function isObjectLike(value) {
		return !!value && typeof value == "object";
	}
	/**
	* Creates an array of the own enumerable property names of `object`.
	*
	* **Note:** Non-object values are coerced to objects. See the
	* [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
	* for more details.
	*
	* @static
	* @since 0.1.0
	* @memberOf _
	* @category Object
	* @param {Object} object The object to query.
	* @returns {Array} Returns the array of property names.
	* @example
	*
	* function Foo() {
	*   this.a = 1;
	*   this.b = 2;
	* }
	*
	* Foo.prototype.c = 3;
	*
	* _.keys(new Foo);
	* // => ['a', 'b'] (iteration order is not guaranteed)
	*
	* _.keys('hi');
	* // => ['0', '1']
	*/
	function keys(object) {
		return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
	}
	/**
	* This method returns a new empty array.
	*
	* @static
	* @memberOf _
	* @since 4.13.0
	* @category Util
	* @returns {Array} Returns the new empty array.
	* @example
	*
	* var arrays = _.times(2, _.stubArray);
	*
	* console.log(arrays);
	* // => [[], []]
	*
	* console.log(arrays[0] === arrays[1]);
	* // => false
	*/
	function stubArray() {
		return [];
	}
	/**
	* This method returns `false`.
	*
	* @static
	* @memberOf _
	* @since 4.13.0
	* @category Util
	* @returns {boolean} Returns `false`.
	* @example
	*
	* _.times(2, _.stubFalse);
	* // => [false, false]
	*/
	function stubFalse() {
		return false;
	}
	module.exports = cloneDeep;
}));
//#endregion
//#region node_modules/lru-memoizer/lib/freeze.js
var require_freeze = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.deepFreeze = void 0;
	function deepFreeze(o) {
		if (o) {
			Object.freeze(o);
			Object.getOwnPropertyNames(o).forEach(function(prop) {
				if (o.hasOwnProperty(prop) && o[prop] !== null && (typeof o[prop] === "object" || typeof o[prop] === "function") && o[prop].constructor !== Buffer && !Object.isFrozen(o[prop])) deepFreeze(o[prop]);
			});
		}
		return o;
	}
	exports.deepFreeze = deepFreeze;
}));
//#endregion
//#region node_modules/lru-memoizer/lib/sync.js
var require_sync = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.syncMemoizer = void 0;
	const lru_cache_1 = require_index_min();
	const events_1$1 = __require("events");
	const lodash_clonedeep_1 = __importDefault(require_lodash_clonedeep());
	const freeze_1 = require_freeze();
	function syncMemoizer(options) {
		const cache = new lru_cache_1.LRUCache(options);
		const load = options.load;
		const hash = options.hash;
		const bypass = options.bypass;
		const itemTTL = options.itemTTL;
		const freeze = options.freeze;
		const clone = options.clone;
		const emitter = new events_1$1.EventEmitter();
		const defaultResult = Object.assign({
			del,
			reset: () => cache.clear(),
			keys: () => [...cache.keys()],
			on: emitter.on.bind(emitter),
			once: emitter.once.bind(emitter)
		}, options);
		if (options.disable) return Object.assign(load, defaultResult);
		function del() {
			const key = hash(...arguments);
			cache.delete(key);
		}
		function emit(event, ...parameters) {
			emitter.emit(event, ...parameters);
		}
		function isPromise(result) {
			return result && result.then && typeof result.then === "function";
		}
		function processResult(result) {
			let res = result;
			if (clone) if (isPromise(res)) res = res.then(lodash_clonedeep_1.default);
			else res = (0, lodash_clonedeep_1.default)(res);
			if (freeze) if (isPromise(res)) res = res.then(freeze_1.deepFreeze);
			else (0, freeze_1.deepFreeze)(res);
			return res;
		}
		const result = function(...args) {
			if (bypass && bypass(...args)) {
				emit("miss", ...args);
				return load(...args);
			}
			var key = hash(...args);
			var fromCache = cache.get(key);
			if (fromCache) {
				emit("hit", ...args);
				return processResult(fromCache);
			}
			emit("miss", ...args);
			const result = load(...args);
			if (itemTTL) cache.set(key, result, { ttl: itemTTL(...args.concat([result])) });
			else cache.set(key, result);
			return processResult(result);
		};
		return Object.assign(result, defaultResult);
	}
	exports.syncMemoizer = syncMemoizer;
}));
//#endregion
//#region node_modules/lru-memoizer/lib/async.js
var require_async = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.asyncMemoizer = void 0;
	const lru_cache_1 = require_index_min();
	const events_1 = __require("events");
	const lodash_clonedeep_1 = __importDefault(require_lodash_clonedeep());
	const freeze_1 = require_freeze();
	const sync_1 = require_sync();
	function asyncMemoizer(options) {
		const cache = new lru_cache_1.LRUCache(options);
		const load = options.load;
		const hash = options.hash;
		const bypass = options.bypass;
		const itemTTL = options.itemTTL;
		const freeze = options.freeze;
		const clone = options.clone;
		const queueTTL = options.queueTTL || 1e3;
		const loading = /* @__PURE__ */ new Map();
		const emitter = new events_1.EventEmitter();
		const memoizerMethods = Object.assign({
			del,
			reset: () => cache.clear(),
			keys: () => [...cache.keys()],
			on: emitter.on.bind(emitter),
			once: emitter.once.bind(emitter)
		}, options);
		if (options.disable) return Object.assign(load, memoizerMethods);
		function del(...args) {
			const key = hash(...args);
			cache.delete(key);
		}
		function add(key, parameters, result) {
			if (freeze) result.forEach(freeze_1.deepFreeze);
			if (itemTTL) cache.set(key, result, { ttl: itemTTL(...parameters.concat(result)) });
			else cache.set(key, result);
		}
		function runCallbacks(callbacks, args) {
			for (const callback of callbacks) if (clone) setImmediate(callback, ...args.map(lodash_clonedeep_1.default));
			else setImmediate(callback, ...args);
		}
		function emit(event, ...parameters) {
			emitter.emit(event, ...parameters);
		}
		function memoizedFunction(...args) {
			const parameters = args.slice(0, -1);
			const callback = args.slice(-1).pop();
			let key;
			if (bypass && bypass(...parameters)) {
				emit("miss", ...parameters);
				return load(...args);
			}
			if (parameters.length === 0 && !hash) key = "_";
			else key = hash(...parameters);
			const fromCache = cache.get(key);
			if (fromCache) {
				emit("hit", ...parameters);
				return runCallbacks([callback], [null].concat(fromCache));
			}
			const pendingLoad = loading.get(key);
			if (pendingLoad && pendingLoad.expiresAt > Date.now()) {
				pendingLoad.queue.push(callback);
				emit("queue", ...parameters);
				return;
			}
			emit("miss", ...parameters);
			const started = Date.now();
			const queue = [callback];
			loading.set(key, {
				queue,
				expiresAt: started + queueTTL
			});
			const loadHandler = (...args) => {
				if (!args[0]) add(key, parameters, args.slice(1));
				loading.delete(key);
				emit("loaded", Date.now() - started, ...parameters);
				runCallbacks(queue, args);
			};
			load(...parameters, loadHandler);
		}
		return Object.assign(memoizedFunction, memoizerMethods);
	}
	exports.asyncMemoizer = asyncMemoizer;
	asyncMemoizer.sync = sync_1.syncMemoizer;
}));
//#endregion
//#region node_modules/lru-memoizer/lib/index.js
var require_lib = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = require_async().asyncMemoizer;
}));
//#endregion
//#region node_modules/jwks-rsa/src/wrappers/cache.js
var require_cache = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const logger = require_src$1()("jwks");
	const memoizer = require_lib();
	const { LRUCache } = require_index_min();
	const { promisify, callbackify: callbackify$1 } = __require("util");
	function cacheWrapper(client, { cacheMaxEntries = 5, cacheMaxAge = 6e5, cacheMaxAgeFallback, onStaleCacheFallback }) {
		logger(`Configured caching of signing keys. Max: ${cacheMaxEntries} / Age: ${cacheMaxAge}${cacheMaxAgeFallback ? ` / Fallback: ${cacheMaxAgeFallback}` : ""}`);
		/**
		* cacheMaxAgeFallback: when the JWKS endpoint is unreachable and cacheMaxAge has expired,
		* rather than immediately failing to return a signing key, the lib can continue serving
		* the last known good key for an additional window (cacheMaxAgeFallback ms). This prevents
		* callers from failing on every getSigningKey call during a transient JWKS endpoint downtime.
		*
		* Two load variants: with cacheMaxAgeFallback, maintain a stale-key store so a failed
		* refresh can fall back to the last known good key within the window. Without it, skip
		* the extra cache entirely to avoid any overhead.
		*/
		let load;
		if (cacheMaxAgeFallback) {
			const staleCache = new LRUCache({ max: cacheMaxEntries });
			const getSigningKey = client.getSigningKey.bind(client);
			load = callbackify$1(async (kid) => {
				try {
					const key = await getSigningKey(kid);
					staleCache.set(kid, {
						key,
						fetchedAt: Date.now()
					});
					return key;
				} catch (err) {
					if (err.isEndpointUnavailable) {
						const stale = staleCache.get(kid);
						if (stale && Date.now() - stale.fetchedAt < cacheMaxAge + cacheMaxAgeFallback) {
							logger(`JWKS endpoint unavailable, serving stale signing key for '${kid}': ${err.message}`);
							if (onStaleCacheFallback) onStaleCacheFallback(err, kid, stale.key);
							return stale.key;
						}
						logger(`JWKS endpoint unavailable and no valid stale entry for '${kid}', fallback window expired or key never fetched`);
					}
					throw err;
				}
			});
		} else load = callbackify$1(client.getSigningKey.bind(client));
		return promisify(memoizer({
			hash: (kid) => kid,
			load,
			ttl: cacheMaxAge,
			max: cacheMaxEntries
		}));
	}
	module.exports.default = cacheWrapper;
}));
//#endregion
//#region node_modules/limiter/lib/tokenBucket.js
var require_tokenBucket = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* A hierarchical token bucket for rate limiting. See
	* http://en.wikipedia.org/wiki/Token_bucket for more information.
	* @author John Hurliman <jhurliman@cull.tv>
	*
	* @param {Number} bucketSize Maximum number of tokens to hold in the bucket.
	*  Also known as the burst rate.
	* @param {Number} tokensPerInterval Number of tokens to drip into the bucket
	*  over the course of one interval.
	* @param {String|Number} interval The interval length in milliseconds, or as
	*  one of the following strings: 'second', 'minute', 'hour', day'.
	* @param {TokenBucket} parentBucket Optional. A token bucket that will act as
	*  the parent of this bucket.
	*/
	var TokenBucket = function(bucketSize, tokensPerInterval, interval, parentBucket) {
		this.bucketSize = bucketSize;
		this.tokensPerInterval = tokensPerInterval;
		if (typeof interval === "string") switch (interval) {
			case "sec":
			case "second":
				this.interval = 1e3;
				break;
			case "min":
			case "minute":
				this.interval = 1e3 * 60;
				break;
			case "hr":
			case "hour":
				this.interval = 1e3 * 60 * 60;
				break;
			case "day":
				this.interval = 1e3 * 60 * 60 * 24;
				break;
			default: throw new Error("Invaid interval " + interval);
		}
		else this.interval = interval;
		this.parentBucket = parentBucket;
		this.content = 0;
		this.lastDrip = +/* @__PURE__ */ new Date();
	};
	TokenBucket.prototype = {
		bucketSize: 1,
		tokensPerInterval: 1,
		interval: 1e3,
		parentBucket: null,
		content: 0,
		lastDrip: 0,
		removeTokens: function(count, callback) {
			var self = this;
			if (!this.bucketSize) {
				process.nextTick(callback.bind(null, null, count, Number.POSITIVE_INFINITY));
				return true;
			}
			if (count > this.bucketSize) {
				process.nextTick(callback.bind(null, "Requested tokens " + count + " exceeds bucket size " + this.bucketSize, null));
				return false;
			}
			this.drip();
			if (count > this.content) return comeBackLater();
			if (this.parentBucket) return this.parentBucket.removeTokens(count, function(err, remainingTokens) {
				if (err) return callback(err, null);
				if (count > self.content) return comeBackLater();
				self.content -= count;
				callback(null, Math.min(remainingTokens, self.content));
			});
			else {
				this.content -= count;
				process.nextTick(callback.bind(null, null, this.content));
				return true;
			}
			function comeBackLater() {
				var waitInterval = Math.ceil((count - self.content) * (self.interval / self.tokensPerInterval));
				setTimeout(function() {
					self.removeTokens(count, callback);
				}, waitInterval);
				return false;
			}
		},
		tryRemoveTokens: function(count) {
			if (!this.bucketSize) return true;
			if (count > this.bucketSize) return false;
			this.drip();
			if (count > this.content) return false;
			if (this.parentBucket && !this.parentBucket.tryRemoveTokens(count)) return false;
			this.content -= count;
			return true;
		},
		drip: function() {
			if (!this.tokensPerInterval) {
				this.content = this.bucketSize;
				return;
			}
			var now = +/* @__PURE__ */ new Date();
			var deltaMS = Math.max(now - this.lastDrip, 0);
			this.lastDrip = now;
			var dripAmount = deltaMS * (this.tokensPerInterval / this.interval);
			this.content = Math.min(this.content + dripAmount, this.bucketSize);
		}
	};
	module.exports = TokenBucket;
}));
//#endregion
//#region node_modules/limiter/lib/clock.js
var require_clock = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var getMilliseconds = function() {
		if (typeof process !== "undefined" && process.hrtime) {
			var hrtime = process.hrtime();
			var seconds = hrtime[0];
			var nanoseconds = hrtime[1];
			return seconds * 1e3 + Math.floor(nanoseconds / 1e6);
		}
		return (/* @__PURE__ */ new Date()).getTime();
	};
	module.exports = getMilliseconds;
}));
//#endregion
//#region node_modules/limiter/lib/rateLimiter.js
var require_rateLimiter = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var TokenBucket = require_tokenBucket();
	var getMilliseconds = require_clock();
	/**
	* A generic rate limiter. Underneath the hood, this uses a token bucket plus
	* an additional check to limit how many tokens we can remove each interval.
	* @author John Hurliman <jhurliman@jhurliman.org>
	*
	* @param {Number} tokensPerInterval Maximum number of tokens that can be
	*  removed at any given moment and over the course of one interval.
	* @param {String|Number} interval The interval length in milliseconds, or as
	*  one of the following strings: 'second', 'minute', 'hour', day'.
	* @param {Boolean} fireImmediately Optional. Whether or not the callback
	*  will fire immediately when rate limiting is in effect (default is false).
	*/
	var RateLimiter = function(tokensPerInterval, interval, fireImmediately) {
		this.tokenBucket = new TokenBucket(tokensPerInterval, tokensPerInterval, interval, null);
		this.tokenBucket.content = tokensPerInterval;
		this.curIntervalStart = getMilliseconds();
		this.tokensThisInterval = 0;
		this.fireImmediately = fireImmediately;
	};
	RateLimiter.prototype = {
		tokenBucket: null,
		curIntervalStart: 0,
		tokensThisInterval: 0,
		fireImmediately: false,
		removeTokens: function(count, callback) {
			if (count > this.tokenBucket.bucketSize) {
				process.nextTick(callback.bind(null, "Requested tokens " + count + " exceeds maximum tokens per interval " + this.tokenBucket.bucketSize, null));
				return false;
			}
			var self = this;
			var now = getMilliseconds();
			if (now < this.curIntervalStart || now - this.curIntervalStart >= this.tokenBucket.interval) {
				this.curIntervalStart = now;
				this.tokensThisInterval = 0;
			}
			if (count > this.tokenBucket.tokensPerInterval - this.tokensThisInterval) {
				if (this.fireImmediately) process.nextTick(callback.bind(null, null, -1));
				else {
					var waitInterval = Math.ceil(this.curIntervalStart + this.tokenBucket.interval - now);
					setTimeout(function() {
						self.tokenBucket.removeTokens(count, afterTokensRemoved);
					}, waitInterval);
				}
				return false;
			}
			return this.tokenBucket.removeTokens(count, afterTokensRemoved);
			function afterTokensRemoved(err, tokensRemaining) {
				if (err) return callback(err, null);
				self.tokensThisInterval += count;
				callback(null, tokensRemaining);
			}
		},
		tryRemoveTokens: function(count) {
			if (count > this.tokenBucket.bucketSize) return false;
			var now = getMilliseconds();
			if (now < this.curIntervalStart || now - this.curIntervalStart >= this.tokenBucket.interval) {
				this.curIntervalStart = now;
				this.tokensThisInterval = 0;
			}
			if (count > this.tokenBucket.tokensPerInterval - this.tokensThisInterval) return false;
			var removed = this.tokenBucket.tryRemoveTokens(count);
			if (removed) this.tokensThisInterval += count;
			return removed;
		},
		getTokensRemaining: function() {
			this.tokenBucket.drip();
			return this.tokenBucket.content;
		}
	};
	module.exports = RateLimiter;
}));
//#endregion
//#region node_modules/limiter/index.js
var require_limiter = /* @__PURE__ */ __commonJSMin(((exports) => {
	exports.RateLimiter = require_rateLimiter();
	exports.TokenBucket = require_tokenBucket();
}));
//#endregion
//#region node_modules/jwks-rsa/src/errors/JwksRateLimitError.js
var require_JwksRateLimitError = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	function JwksRateLimitError(message) {
		Error.call(this, message);
		Error.captureStackTrace(this, this.constructor);
		this.name = "JwksRateLimitError";
		this.message = message;
	}
	JwksRateLimitError.prototype = Object.create(Error.prototype);
	JwksRateLimitError.prototype.constructor = JwksRateLimitError;
	module.exports = JwksRateLimitError;
}));
//#endregion
//#region node_modules/jwks-rsa/src/wrappers/rateLimit.js
var require_rateLimit = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const logger = require_src$1()("jwks");
	const { RateLimiter } = require_limiter();
	const JwksRateLimitError = require_JwksRateLimitError();
	function rateLimitWrapper(client, { jwksRequestsPerMinute = 10 }) {
		const getSigningKey = client.getSigningKey.bind(client);
		const limiter = new RateLimiter(jwksRequestsPerMinute, "minute", true);
		logger(`Configured rate limiting to JWKS endpoint at ${jwksRequestsPerMinute}/minute`);
		return async (kid) => await new Promise((resolve, reject) => {
			limiter.removeTokens(1, async (err, remaining) => {
				if (err) reject(err);
				logger("Requests to the JWKS endpoint available for the next minute:", remaining);
				if (remaining < 0) {
					logger("Too many requests to the JWKS endpoint");
					reject(new JwksRateLimitError("Too many requests to the JWKS endpoint"));
				} else try {
					resolve(await getSigningKey(kid));
				} catch (error) {
					reject(error);
				}
			});
		});
	}
	module.exports.default = rateLimitWrapper;
}));
//#endregion
//#region node_modules/jwks-rsa/src/wrappers/interceptor.js
var require_interceptor = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const retrieveSigningKeys = require_utils().retrieveSigningKeys;
	/**
	* Uses getKeysInterceptor to allow users to retrieve keys from a file,
	* external cache, or provided object before falling back to the jwksUri endpoint
	*/
	function getKeysInterceptor(client, { getKeysInterceptor }) {
		const getSigningKey = client.getSigningKey.bind(client);
		return async (kid) => {
			const keys = await getKeysInterceptor();
			let signingKeys;
			if (keys && keys.length) signingKeys = await retrieveSigningKeys(keys);
			if (signingKeys && signingKeys.length) {
				const key = signingKeys.find((k) => !kid || k.kid === kid);
				if (key) return key;
			}
			return getSigningKey(kid);
		};
	}
	module.exports.default = getKeysInterceptor;
}));
//#endregion
//#region node_modules/jwks-rsa/src/wrappers/callbackSupport.js
var require_callbackSupport = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { callbackify } = __require("util");
	const callbackSupport = (client) => {
		const getSigningKey = client.getSigningKey.bind(client);
		return (kid, cb) => {
			if (cb) return callbackify(getSigningKey)(kid, cb);
			return getSigningKey(kid);
		};
	};
	module.exports.default = callbackSupport;
}));
//#endregion
//#region node_modules/jwks-rsa/src/wrappers/index.js
var require_wrappers = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		request: require_request().default,
		cacheSigningKey: require_cache().default,
		rateLimitSigningKey: require_rateLimit().default,
		getKeysInterceptor: require_interceptor().default,
		callbackSupport: require_callbackSupport().default
	};
}));
//#endregion
//#region node_modules/jwks-rsa/src/errors/SigningKeyNotFoundError.js
var require_SigningKeyNotFoundError = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	function SigningKeyNotFoundError(message) {
		Error.call(this, message);
		Error.captureStackTrace(this, this.constructor);
		this.name = "SigningKeyNotFoundError";
		this.message = message;
	}
	SigningKeyNotFoundError.prototype = Object.create(Error.prototype);
	SigningKeyNotFoundError.prototype.constructor = SigningKeyNotFoundError;
	module.exports = SigningKeyNotFoundError;
}));
//#endregion
//#region node_modules/jwks-rsa/src/JwksClient.js
var require_JwksClient = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const logger = require_src$1()("jwks");
	const { retrieveSigningKeys } = require_utils();
	const { request, cacheSigningKey, rateLimitSigningKey, getKeysInterceptor, callbackSupport } = require_wrappers();
	const JwksError = require_JwksError();
	const SigningKeyNotFoundError = require_SigningKeyNotFoundError();
	var JwksClient = class {
		constructor(options) {
			this.options = {
				rateLimit: false,
				cache: true,
				timeout: 3e4,
				...options
			};
			if (this.options.getKeysInterceptor) this.getSigningKey = getKeysInterceptor(this, options);
			if (this.options.rateLimit) this.getSigningKey = rateLimitSigningKey(this, options);
			if (this.options.cache) this.getSigningKey = cacheSigningKey(this, options);
			this.getSigningKey = callbackSupport(this, options);
		}
		async getKeys() {
			logger(`Fetching keys from '${this.options.jwksUri}'`);
			try {
				const res = await request({
					uri: this.options.jwksUri,
					headers: this.options.requestHeaders,
					agent: this.options.requestAgent,
					timeout: this.options.timeout,
					fetcher: this.options.fetcher
				});
				logger("Keys:", res.keys);
				return res.keys;
			} catch (err) {
				const { errorMsg } = err;
				logger("Failure:", errorMsg || err);
				const error = errorMsg ? new JwksError(errorMsg) : err;
				error.isEndpointUnavailable = true;
				throw error;
			}
		}
		async getSigningKeys() {
			const keys = await this.getKeys();
			if (!keys || !keys.length) throw new JwksError("The JWKS endpoint did not contain any keys");
			const signingKeys = await retrieveSigningKeys(keys);
			if (!signingKeys.length) throw new JwksError("The JWKS endpoint did not contain any signing keys");
			logger("Signing Keys:", signingKeys);
			return signingKeys;
		}
		async getSigningKey(kid) {
			logger(`Fetching signing key for '${kid}'`);
			const keys = await this.getSigningKeys();
			const kidDefined = kid !== void 0 && kid !== null;
			if (!kidDefined && keys.length > 1) {
				logger("No KID specified and JWKS endpoint returned more than 1 key");
				throw new SigningKeyNotFoundError("No KID specified and JWKS endpoint returned more than 1 key");
			}
			const key = keys.find((k) => !kidDefined || k.kid === kid);
			if (key) return key;
			else {
				logger(`Unable to find a signing key that matches '${kid}'`);
				throw new SigningKeyNotFoundError(`Unable to find a signing key that matches '${kid}'`);
			}
		}
	};
	module.exports = { JwksClient };
}));
//#endregion
//#region node_modules/jwks-rsa/src/errors/index.js
var require_errors = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		ArgumentError: require_ArgumentError(),
		JwksError: require_JwksError(),
		JwksRateLimitError: require_JwksRateLimitError(),
		SigningKeyNotFoundError: require_SigningKeyNotFoundError()
	};
}));
//#endregion
//#region node_modules/jwks-rsa/src/integrations/config.js
var require_config = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = [
		"RS256",
		"RS384",
		"RS512",
		"PS256",
		"PS384",
		"PS512",
		"ES256",
		"ES384",
		"ES512",
		"EdDSA"
	];
}));
//#endregion
//#region node_modules/jwks-rsa/src/integrations/hapi.js
var require_hapi = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { ArgumentError } = require_errors();
	const { JwksClient } = require_JwksClient();
	const supportedAlg = require_config();
	const handleSigningKeyError = (err, cb) => {
		if (err && err.name === "SigningKeyNotFoundError") return cb(err, null, null);
		if (err) return cb(err, null, null);
	};
	/**
	* Call hapiJwt2Key as a Promise
	* @param {object} options 
	* @returns {Promise}
	*/
	module.exports.hapiJwt2KeyAsync = (options) => {
		const secretProvider = module.exports.hapiJwt2Key(options);
		return function(decoded) {
			return new Promise((resolve, reject) => {
				const cb = (err, key) => {
					!key || err ? reject(err) : resolve({ key });
				};
				secretProvider(decoded, cb);
			});
		};
	};
	module.exports.hapiJwt2Key = function(options) {
		if (options === null || options === void 0) throw new ArgumentError("An options object must be provided when initializing hapiJwt2Key");
		const client = new JwksClient(options);
		const onError = options.handleSigningKeyError || handleSigningKeyError;
		return function secretProvider(decoded, cb) {
			if (!decoded || !decoded.header) return cb(/* @__PURE__ */ new Error("Cannot find a signing certificate if there is no header"), null, null);
			if (!supportedAlg.includes(decoded.header.alg)) return cb(/* @__PURE__ */ new Error("Unsupported algorithm " + decoded.header.alg + " supplied."), null, null);
			client.getSigningKey(decoded.header.kid).then((key) => {
				return cb(null, key.publicKey || key.rsaPublicKey, key);
			}).catch((err) => {
				return onError(err, (newError) => cb(newError, null, null));
			});
		};
	};
}));
//#endregion
//#region node_modules/jwks-rsa/src/integrations/express.js
var require_express = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { ArgumentError } = require_errors();
	const { JwksClient } = require_JwksClient();
	const supportedAlg = require_config();
	const handleSigningKeyError = (err, cb) => {
		if (err && err.name === "SigningKeyNotFoundError") return cb(null);
		if (err) return cb(err);
	};
	module.exports.expressJwtSecret = function(options) {
		if (options === null || options === void 0) throw new ArgumentError("An options object must be provided when initializing expressJwtSecret");
		const client = new JwksClient(options);
		const onError = options.handleSigningKeyError || handleSigningKeyError;
		const expressJwt7Provider = async (req, token) => {
			if (!token) return;
			const header = token.header;
			if (!header || !supportedAlg.includes(header.alg)) return;
			try {
				const key = await client.getSigningKey(header.kid);
				return key.publicKey || key.rsaPublicKey;
			} catch (err) {
				return new Promise((resolve, reject) => {
					onError(err, (newError) => {
						if (!newError) return resolve();
						reject(newError);
					});
				});
			}
		};
		return function secretProvider(req, header, payload, cb) {
			if (arguments.length === 4) {
				expressJwt7Provider(req, { header }).then((key) => {
					setImmediate(cb, null, key);
				}).catch((err) => {
					setImmediate(cb, err);
				});
				return;
			}
			return expressJwt7Provider(req, arguments[1]);
		};
	};
}));
//#endregion
//#region node_modules/jwks-rsa/src/integrations/koa.js
var require_koa = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { ArgumentError } = require_errors();
	const { JwksClient } = require_JwksClient();
	const supportedAlg = require_config();
	module.exports.koaJwtSecret = function(options = {}) {
		if (!options.jwksUri) throw new ArgumentError("No JWKS provided. Please provide a jwksUri");
		const client = new JwksClient(options);
		return function secretProvider({ alg, kid } = {}) {
			return new Promise((resolve, reject) => {
				if (!supportedAlg.includes(alg)) return reject(/* @__PURE__ */ new Error("Missing / invalid token algorithm"));
				client.getSigningKey(kid).then((key) => {
					resolve(key.publicKey || key.rsaPublicKey);
				}).catch((err) => {
					if (options.handleSigningKeyError) return options.handleSigningKeyError(err).then(reject);
					return reject(err);
				});
			});
		};
	};
}));
//#endregion
//#region node_modules/jwks-rsa/src/integrations/passport.js
var require_passport = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const jose = (init_webapi(), __toCommonJS(webapi_exports));
	const { ArgumentError } = require_errors();
	const { JwksClient } = require_JwksClient();
	const supportedAlg = require_config();
	const handleSigningKeyError = (err, cb) => {
		if (err && err.name === "SigningKeyNotFoundError") return cb(null);
		if (err) return cb(err);
	};
	module.exports.passportJwtSecret = function(options) {
		if (options === null || options === void 0) throw new ArgumentError("An options object must be provided when initializing passportJwtSecret");
		if (!options.jwksUri) throw new ArgumentError("No JWKS provided. Please provide a jwksUri");
		const client = new JwksClient(options);
		const onError = options.handleSigningKeyError || handleSigningKeyError;
		return function secretProvider(req, rawJwtToken, cb) {
			let decoded;
			try {
				decoded = {
					payload: jose.decodeJwt(rawJwtToken),
					header: jose.decodeProtectedHeader(rawJwtToken)
				};
			} catch (err) {
				decoded = null;
			}
			if (!decoded || !supportedAlg.includes(decoded.header.alg)) return cb(null, null);
			client.getSigningKey(decoded.header.kid).then((key) => {
				cb(null, key.publicKey || key.rsaPublicKey);
			}).catch((err) => {
				onError(err, (newError) => cb(newError, null));
			});
		};
	};
}));
//#endregion
//#region node_modules/jwks-rsa/src/index.js
var require_src = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { JwksClient } = require_JwksClient();
	const errors = require_errors();
	const { hapiJwt2Key, hapiJwt2KeyAsync } = require_hapi();
	const { expressJwtSecret } = require_express();
	const { koaJwtSecret } = require_koa();
	const { passportJwtSecret } = require_passport();
	module.exports = (options) => {
		return new JwksClient(options);
	};
	module.exports.JwksClient = JwksClient;
	module.exports.ArgumentError = errors.ArgumentError;
	module.exports.JwksError = errors.JwksError;
	module.exports.JwksRateLimitError = errors.JwksRateLimitError;
	module.exports.SigningKeyNotFoundError = errors.SigningKeyNotFoundError;
	module.exports.expressJwtSecret = expressJwtSecret;
	module.exports.hapiJwt2Key = hapiJwt2Key;
	module.exports.hapiJwt2KeyAsync = hapiJwt2KeyAsync;
	module.exports.koaJwtSecret = koaJwtSecret;
	module.exports.passportJwtSecret = passportJwtSecret;
}));
//#endregion
export { require_src as t };
