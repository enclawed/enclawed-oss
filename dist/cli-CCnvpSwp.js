import { E as verifyChallenge, y as rawEd25519ToPem } from "./enclaweder-hid-B_ZViqzj.js";
import { G as HardwareRootGuard, a as closeHardwareRootSession, c as hardwareRootHealth, i as bootHardwareRoot, m as hardwareRootSigning, t as SOFTWARE_ONLY_NOTICE } from "./hardware-root-DQ2ym1zw.js";
import { n as parseLauncher } from "./launchers-9uLz9f2Z.js";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, timingSafeEqual, verify } from "node:crypto";
import net from "node:net";
import { performance } from "node:perf_hooks";
//#region src/enclawed/swarm/codec.ts
const PROTO_KEYS = new Set([
	"__proto__",
	"prototype",
	"constructor"
]);
/** Sorted-key JSON. Refuses values that have no single canonical form. */
function canonicalJson(value) {
	if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new TypeError("swarm codec: non-finite number");
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
	if (typeof value === "object") {
		const obj = value;
		return "{" + Object.keys(obj).filter((k) => !PROTO_KEYS.has(k) && obj[k] !== void 0).toSorted().map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
	}
	throw new TypeError(`swarm codec: cannot encode ${typeof value}`);
}
function digest(tag, value) {
	return createHash("sha256").update(tag).update("\0").update(canonicalJson(value)).digest();
}
function digestHex(tag, value) {
	return digest(tag, value).toString("hex");
}
const TAG = {
	genesis: "ENCLAWED-SWARM-GENESIS-01",
	block: "ENCLAWED-SWARM-BLOCK-01",
	txs: "ENCLAWED-SWARM-TXS-01",
	statement: "ENCLAWED-SWARM-STATEMENT-01",
	join: "ENCLAWED-SWARM-JOIN-01",
	approval: "ENCLAWED-SWARM-APPROVAL-01",
	heartbeat: "ENCLAWED-SWARM-HEARTBEAT-01",
	ready: "ENCLAWED-SWARM-READY-01",
	epoch: "ENCLAWED-SWARM-EPOCH-01"
};
"0".repeat(64);
const SOFTWARE_TAG = Buffer.from("ENCLAWED-SWARM-SW-01");
const HEX64 = /^[0-9a-f]{64}$/;
const HEX24 = /^[0-9a-f]{24}$/;
function rawPublicKey(pub) {
	const jwk = pub.export({ format: "jwk" });
	return Buffer.from(String(jwk.x), "base64url");
}
/** In-process Ed25519 signer. Development and tests only. */
function softwareSigner(id, privateKeyPem) {
	let priv;
	if (privateKeyPem) priv = createPrivateKey(privateKeyPem);
	else priv = generateKeyPairSync("ed25519").privateKey;
	return {
		key: {
			id,
			kind: "software",
			publicKey: rawPublicKey(createPublicKey(priv)).toString("hex")
		},
		privateKeyPem: priv.export({
			format: "pem",
			type: "pkcs8"
		}),
		async sign(digest32) {
			return sign(null, Buffer.concat([SOFTWARE_TAG, digest32]), priv).toString("hex");
		}
	};
}
/**
* Signer whose principal is every device of a fleet: the first member's key
* is the principal's primary key, the rest are its members, and each
* signature comes from whichever device the fleet dispatches it to. A
* signature by a member other than the primary carries that member's uid
* ("uid:sig") so a verifier knows which key to check.
*/
function fleetSigner(id, fleet) {
	const [primary, ...rest] = fleet.members;
	if (!primary) throw new Error("swarm fleet signer: the fleet has no members");
	if (rest.length > 16) throw new Error(`swarm fleet signer: more than 16 devices`);
	const known = new Set(fleet.members.map((m) => m.uid));
	return {
		key: {
			id,
			kind: "device",
			publicKey: primary.pubkey,
			uid: primary.uid,
			...rest.length > 0 ? { members: rest.map((m) => ({
				publicKey: m.pubkey,
				uid: m.uid
			})) } : {}
		},
		async sign(digest32) {
			const res = await fleet.run((dev) => dev.challenge(digest32));
			const uid = res.uid.toString("hex");
			if (!known.has(uid)) throw new Error("swarm fleet signer: a device outside the fleet answered");
			const sig = res.sig.toString("hex");
			return uid === primary.uid ? sig : `${uid}:${sig}`;
		}
	};
}
/** Shape check for a principal key read off the wire or out of a genesis file. */
function isPrincipalKey(value) {
	if (!value || typeof value !== "object") return false;
	const k = value;
	if (typeof k.id !== "string" || k.id.length === 0 || k.id.length > 128) return false;
	if (typeof k.publicKey !== "string" || !HEX64.test(k.publicKey)) return false;
	if (k.kind === "device") {
		if (typeof k.uid !== "string" || !HEX24.test(k.uid)) return false;
		if (k.members === void 0) return true;
		if (!Array.isArray(k.members) || k.members.length === 0 || k.members.length > 16) return false;
		const uids = new Set([k.uid]);
		for (const m of k.members) {
			const mm = m;
			if (!mm || typeof mm.publicKey !== "string" || !HEX64.test(mm.publicKey) || typeof mm.uid !== "string" || !HEX24.test(mm.uid) || uids.has(mm.uid)) return false;
			uids.add(mm.uid);
		}
		return true;
	}
	return k.kind === "software" && k.uid === void 0 && k.members === void 0;
}
function verifyDigest(key, digest32, sigHex) {
	if (typeof sigHex !== "string") return false;
	const tagged = /^([0-9a-f]{24}):([0-9a-f]{128})$/.exec(sigHex);
	if (!tagged && !/^[0-9a-f]{128}$/.test(sigHex)) return false;
	if (tagged && key.kind !== "device") return false;
	const sig = Buffer.from(tagged ? tagged[2] : sigHex, "hex");
	try {
		if (key.kind === "device") {
			const member = tagged ? [{
				publicKey: key.publicKey,
				uid: key.uid ?? ""
			}, ...key.members ?? []].find((m) => m.uid === tagged[1]) : {
				publicKey: key.publicKey,
				uid: key.uid ?? ""
			};
			if (!member) return false;
			return verifyChallenge(Buffer.from(member.publicKey, "hex"), digest32, Buffer.from(member.uid, "hex"), sig);
		}
		const pub = Buffer.from(key.publicKey, "hex");
		return verify(null, Buffer.concat([SOFTWARE_TAG, digest32]), createPublicKey(rawEd25519ToPem(pub)), sig);
	} catch {
		return false;
	}
}
//#endregion
//#region src/enclawed/swarm/heartbeat.ts
function heartbeatDigest(body) {
	return digest(TAG.heartbeat, body);
}
async function signHeartbeat(signer, body) {
	if (body.nodeId !== signer.key.id) throw new Error("swarm heartbeat: nodeId does not match the signing key");
	return {
		body,
		sig: await signer.sign(heartbeatDigest(body))
	};
}
function verifyHeartbeat(key, hb) {
	if (!hb || typeof hb !== "object" || !hb.body || hb.body.nodeId !== key.id) return false;
	const b = hb.body;
	if (!Number.isSafeInteger(b.seq) || b.seq < 0 || !Number.isSafeInteger(b.epoch) || !Number.isFinite(b.time) || b.status !== "CLEAN" && b.status !== "DIRTY") return false;
	return verifyDigest(key, heartbeatDigest(b), hb.sig);
}
const STATE_WINDOW = 64;
var ChainError = class extends Error {
	constructor(code, message) {
		super(`swarm chain: ${message}`);
		this.name = "ChainError";
		this.code = code;
	}
};
/** Largest f with 3f+1 <= n. */
function faultTolerance(n) {
	return Math.floor((n - 1) / 3);
}
/** Votes needed for a quorum certificate: n - f, which is 2f+1 when n = 3f+1. */
function quorumSize(n) {
	return n - faultTolerance(n);
}
function genesisHash(genesis) {
	return digestHex(TAG.genesis, genesis);
}
function txRoot(txs) {
	return digestHex(TAG.txs, txs);
}
function blockHash(header) {
	return digestHex(TAG.block, header);
}
function statementDigest(s) {
	const { sig: _sig, ...body } = s;
	return digest(TAG.statement, body);
}
function joinDigest(swarmId, node) {
	return digest(TAG.join, {
		swarmId,
		node
	});
}
function readyDigest(swarmId, nodeId, height) {
	return digest(TAG.ready, {
		swarmId,
		nodeId,
		height
	});
}
/**
* What an admin signs to approve a transaction. Joins and operator evictions
* cannot be replayed (the node then exists or is permanently evicted), so they
* bind only the transaction. A bundle publish binds the epoch too, or an old
* approval could roll the swarm back to an earlier policy. Coordinator adds and
* retirements bind the roster version, so an old approval cannot undo a later
* change.
*/
function approvalDigest(state, tx) {
	switch (tx.type) {
		case "node.join": return digest(TAG.approval, {
			swarmId: state.swarmId,
			type: tx.type,
			node: tx.node,
			coordinator: tx.coordinator ?? null,
			...tx.observer ? { observer: true } : {}
		});
		case "coordinator.add": return digest(TAG.approval, {
			swarmId: state.swarmId,
			type: tx.type,
			coordinator: tx.coordinator,
			address: tx.address,
			rosterVersion: state.rosterVersion
		});
		case "coordinator.retire": return digest(TAG.approval, {
			swarmId: state.swarmId,
			type: tx.type,
			coordinatorId: tx.coordinatorId,
			rosterVersion: state.rosterVersion
		});
		case "node.evict": return digest(TAG.approval, {
			swarmId: state.swarmId,
			type: tx.type,
			nodeId: tx.nodeId,
			reason: tx.reason
		});
		case "bundle.publish": return digest(TAG.approval, {
			swarmId: state.swarmId,
			type: tx.type,
			bundleHash: tx.bundleHash,
			epoch: state.epoch,
			epochHash: needEpochHash(state)
		});
		case "params.update": return digest(TAG.approval, {
			swarmId: state.swarmId,
			type: tx.type,
			leaseMs: tx.leaseMs,
			heartbeatMs: tx.heartbeatMs,
			...tx.expiryBlocks !== void 0 ? { expiryBlocks: tx.expiryBlocks } : {},
			epoch: state.epoch,
			epochHash: needEpochHash(state)
		});
		default: throw new ChainError("bad-tx", `${tx.type} takes no approval`);
	}
}
/** Policy approvals bind to the epoch's hash, not only its number. */
function needEpochHash(state) {
	if (!state.epochHash) throw new ChainError("bad-tx", "a policy approval binds to the epoch's hash");
	return state.epochHash;
}
function sortedById(keys) {
	return keys.toSorted((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function validateGenesis(g) {
	const fail = (m) => {
		throw new ChainError("bad-genesis", m);
	};
	if (!g || typeof g.swarmId !== "string" || g.swarmId.length === 0) fail("swarmId is required");
	if (!Array.isArray(g.coordinators) || g.coordinators.length < 2) fail(`need at least 2 coordinators (4 tolerates one faulty)`);
	if (!Array.isArray(g.admins) || g.admins.length === 0) fail("need at least one admin");
	const ids = /* @__PURE__ */ new Set();
	for (const k of [...g.coordinators, ...g.admins]) {
		if (!isPrincipalKey(k)) fail(`malformed principal key ${JSON.stringify(k?.id)}`);
		if (ids.has(k.id)) fail(`duplicate principal id ${k.id}`);
		ids.add(k.id);
		if (g.params?.requireDeviceKeys && k.kind !== "device") fail(`${k.id} is not an Enclaweder key and requireDeviceKeys is set`);
	}
	const p = g.params;
	if (!p || !Number.isSafeInteger(p.leaseMs) || p.leaseMs <= 0 || !Number.isSafeInteger(p.heartbeatMs) || p.heartbeatMs <= 0 || p.heartbeatMs >= p.leaseMs) fail("params need positive integer leaseMs > heartbeatMs");
	if (p.expiryBlocks !== void 0 && !validExpiry(p.expiryBlocks)) fail(`expiryBlocks must be an integer in ${PARAM_BOUNDS.expiryBlocks.min}..${PARAM_BOUNDS.expiryBlocks.max}`);
	if (p.growth !== void 0 && (!Number.isSafeInteger(p.growth.maxCoordinators) || p.growth.maxCoordinators < g.coordinators.length || !Number.isSafeInteger(p.growth.nodesPerCoordinator) || p.growth.nodesPerCoordinator < 1)) fail("growth needs integer maxCoordinators >= the genesis set and nodesPerCoordinator >= 1");
	if (typeof g.bundleHash !== "string" || !/^[0-9a-f]{64}$/.test(g.bundleHash)) fail("bundleHash must be a sha256 hex digest");
}
function genesisState(g) {
	validateGenesis(g);
	const hash = genesisHash(g);
	const s = genesisBody(g, hash);
	s.epochHash = epochHashOf(s, hash);
	return s;
}
function genesisBody(g, hash) {
	return {
		swarmId: g.swarmId,
		genesisHash: hash,
		height: 0,
		headHash: hash,
		headTime: g.createdAt,
		epoch: 0,
		params: {
			...g.params,
			...g.params.growth ? { growth: { ...g.params.growth } } : {}
		},
		bundleHash: g.bundleHash,
		coordinators: sortedById(g.coordinators),
		active: [],
		addresses: /* @__PURE__ */ new Map(),
		rosterVersion: 0,
		admins: sortedById(g.admins),
		nodes: /* @__PURE__ */ new Map(),
		leases: /* @__PURE__ */ new Map(),
		lastHeartbeatSeq: /* @__PURE__ */ new Map(),
		lastRenewed: /* @__PURE__ */ new Map(),
		observers: /* @__PURE__ */ new Set(),
		evicted: /* @__PURE__ */ new Set(),
		halted: null,
		epochHash: ""
	};
}
function cloneState(s) {
	return {
		...s,
		params: { ...s.params },
		nodes: new Map(s.nodes),
		addresses: new Map(s.addresses),
		leases: new Map(s.leases),
		lastHeartbeatSeq: new Map(s.lastHeartbeatSeq),
		lastRenewed: new Map(s.lastRenewed),
		observers: new Set(s.observers),
		evicted: new Set(s.evicted)
	};
}
/**
* Round 0 rotates over the coordinators that certified recently (the previous
* block's `active` list), so a crashed coordinator is skipped instead of
* costing a propose timeout at every n-th height. Later rounds rotate over the
* whole set, so a bad `active` list can delay a height by one round at most.
*/
function proposerFor(state, round) {
	if (round === 0 && state.active.length > 0) return state.active[(state.height + 1) % state.active.length];
	const n = state.coordinators.length;
	return state.coordinators[(state.height + 1 + round) % n].id;
}
/**
* What a proposer puts in `active` for the next block: the coordinators whose
* finals certified the block it builds on. Empty (whole-set rotation) when
* that is not a quorum of the current set, for example right after it grew.
*/
function activeFor(state, previous) {
	if (!previous) return [];
	const ids = new Set(state.coordinators.map((c) => c.id));
	const signers = [...new Set(previous.qc.votes.map((v) => v.signer))].filter((id) => ids.has(id)).toSorted();
	return signers.length >= quorumSize(state.coordinators.length) ? signers : [];
}
function validActive(state, active) {
	if (!Array.isArray(active)) return false;
	if (active.length === 0) return true;
	const ids = new Set(state.coordinators.map((c) => c.id));
	const sorted = [...active].toSorted((a, b) => a < b ? -1 : a > b ? 1 : 0);
	return active.every((id, i) => typeof id === "string" && ids.has(id) && id === sorted[i]) && new Set(active).size === active.length && active.length >= quorumSize(state.coordinators.length);
}
/** Limits on what params.update may set; genesis is checked against the same rule. */
const PARAM_BOUNDS = {
	leaseMs: {
		min: 1e3,
		max: 6e5
	},
	heartbeatMs: {
		min: 100,
		max: 6e4
	},
	expiryBlocks: {
		min: 3,
		max: 1e6
	}
};
function validExpiry(expiryBlocks) {
	return Number.isSafeInteger(expiryBlocks) && expiryBlocks >= PARAM_BOUNDS.expiryBlocks.min && expiryBlocks <= PARAM_BOUNDS.expiryBlocks.max;
}
/**
* Nodes that renewed no lease for more than the epoch's expiryBlocks, as of
* the block after the current head: a pure function of the chain state, so
* every coordinator reaches the same answer. Coordinators are excluded:
* their faults are consensus's to judge, by their own signatures.
*/
function expiredNodes(s) {
	const limit = s.params.expiryBlocks;
	if (limit === void 0) return [];
	const now = s.height + 1;
	return [...s.nodes.keys()].filter((id) => !s.coordinators.some((c) => c.id === id) && !s.observers.has(id)).filter((id) => now - (s.lastRenewed.get(id) ?? now) > limit).toSorted();
}
function validTiming(leaseMs, heartbeatMs) {
	return Number.isSafeInteger(leaseMs) && Number.isSafeInteger(heartbeatMs) && heartbeatMs >= PARAM_BOUNDS.heartbeatMs.min && heartbeatMs <= PARAM_BOUNDS.heartbeatMs.max && leaseMs >= PARAM_BOUNDS.leaseMs.min && leaseMs <= PARAM_BOUNDS.leaseMs.max && heartbeatMs < leaseMs;
}
/** Removes a coordinator from the roster, halting if too few would remain. */
function dropCoordinator(s, id, why) {
	s.coordinators = s.coordinators.filter((c) => c.id !== id);
	s.active = s.active.filter((a) => a !== id);
	s.addresses.delete(id);
	s.rosterVersion += 1;
	if (s.coordinators.length < 2) {
		const n = s.coordinators.length;
		s.halted = `only ${n} coordinator${n === 1 ? " remains" : "s remain"} after ${why}`;
	}
}
function addCoordinator(s, key, address) {
	s.coordinators = sortedById([...s.coordinators, key]);
	s.addresses.set(key.id, address);
	s.rosterVersion += 1;
}
function validAddress(a) {
	return typeof a === "string" && a.length <= 256 && /^[^\s:]+:\d{1,5}$/.test(a);
}
function coordinatorKey(state, id) {
	return state.coordinators.find((c) => c.id === id);
}
function verifyStatement(state, s) {
	if (!s || s.swarmId !== state.swarmId) return false;
	const key = coordinatorKey(state, s.signer);
	return !!key && verifyDigest(key, statementDigest(s), s.sig);
}
/** Checks a double-sign: same signer, same slot, different block, both genuine. */
function verifyEquivocation(state, proof) {
	const { a, b } = proof ?? {};
	if (!a || !b) return false;
	return a.signer === b.signer && a.kind === b.kind && a.height === b.height && a.round === b.round && a.blockHash !== b.blockHash && verifyStatement(state, a) && verifyStatement(state, b);
}
/** Verifies a QC against the coordinator set that was in force for that height. */
function verifyQc(state, hash, height, qc) {
	if (!qc || qc.blockHash !== hash || qc.height !== height || !Array.isArray(qc.votes)) return false;
	const seen = /* @__PURE__ */ new Set();
	for (const v of qc.votes) {
		if (v.kind !== "final" || v.height !== height || v.round !== 0 || v.blockHash !== hash || seen.has(v.signer) || !verifyStatement(state, v)) return false;
		seen.add(v.signer);
	}
	return seen.size >= quorumSize(state.coordinators.length);
}
function verifyApproval(state, tx) {
	const admin = state.admins.find((a) => a.id === tx.approval?.admin);
	return !!admin && verifyDigest(admin, approvalDigest(state, tx), tx.approval.sig);
}
function bumpEpoch(s) {
	s.epoch += 1;
	s.leases.clear();
	s.epochHash = epochHashOf(s, s.epochHash);
}
/**
* An epoch's hash: the previous epoch's hash, and everything this epoch
* starts with. Epochs thus form a chain from genesis, and every block's
* certificate signs the one it runs in (BlockHeader.epochHash): changing any
* past epoch's policy or membership changes every epoch hash after it.
*/
function epochHashOf(s, prev) {
	const keys = (m) => [...m].toSorted((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
	return digestHex(TAG.epoch, {
		prev,
		swarmId: s.swarmId,
		epoch: s.epoch,
		startsAt: s.height + 1,
		params: s.params,
		bundleHash: s.bundleHash,
		coordinators: keys(s.coordinators),
		admins: keys(s.admins),
		nodes: keys(s.nodes.values()),
		observers: [...s.observers].toSorted(),
		evicted: [...s.evicted].toSorted()
	});
}
/** Applies one transaction to `s` in place. Throws ChainError("bad-tx") if it is invalid. */
function applyTx(s, tx) {
	const bad = (m) => new ChainError("bad-tx", `${tx?.type ?? "tx"}: ${m}`);
	switch (tx?.type) {
		case "node.join": {
			const node = tx.node;
			if (!isPrincipalKey(node)) throw bad("malformed node key");
			if (tx.coordinator !== void 0 && !validAddress(tx.coordinator?.address)) throw bad("coordinator address must be host:port");
			if (s.nodes.has(node.id) || s.evicted.has(node.id) || coordinatorKey(s, node.id)) throw bad(`id ${node.id} is taken or was evicted`);
			if (s.params.requireDeviceKeys && node.kind !== "device") throw bad(`${node.id} is not an Enclaweder key`);
			if (!verifyDigest(node, joinDigest(s.swarmId, node), tx.pop)) throw bad("proof of possession does not verify");
			if (!verifyApproval(s, tx)) throw bad("admin approval does not verify");
			if (tx.observer !== void 0 && !tx.observer) throw bad("observer must be true or absent");
			if (tx.observer && tx.coordinator !== void 0) throw bad("an observer cannot be a coordinator candidate");
			s.nodes.set(node.id, node);
			if (tx.observer) s.observers.add(node.id);
			s.lastRenewed.set(node.id, s.height + 1);
			if (tx.coordinator) s.addresses.set(node.id, tx.coordinator.address);
			bumpEpoch(s);
			return;
		}
		case "node.evict": {
			const node = s.nodes.get(tx.nodeId);
			if (!node) throw bad(`unknown node ${tx.nodeId}`);
			if (tx.reason === "dirty") {
				if (!verifyHeartbeat(node, tx.evidence) || tx.evidence.body.status !== "DIRTY") throw bad("evidence is not a genuine DIRTY heartbeat from that node");
			} else if (tx.reason === "operator") {
				if (!verifyApproval(s, tx)) throw bad("admin approval does not verify");
			} else if (tx.reason === "expired") {
				if (!expiredNodes(s).includes(tx.nodeId)) throw bad(`${tx.nodeId} has not gone more than ${s.params.expiryBlocks ?? "any number of"} blocks unrenewed`);
			} else throw bad("unknown reason");
			s.nodes.delete(tx.nodeId);
			s.lastHeartbeatSeq.delete(tx.nodeId);
			s.lastRenewed.delete(tx.nodeId);
			s.observers.delete(tx.nodeId);
			s.addresses.delete(tx.nodeId);
			s.evicted.add(tx.nodeId);
			if (coordinatorKey(s, tx.nodeId)) dropCoordinator(s, tx.nodeId, `evicting node ${tx.nodeId}`);
			bumpEpoch(s);
			return;
		}
		case "coordinator.evict":
			if (tx.evidence?.a?.signer !== tx.coordinatorId || !verifyEquivocation(s, tx.evidence)) throw bad("evidence is not a genuine double-sign by that coordinator");
			dropCoordinator(s, tx.coordinatorId, `evicting ${tx.coordinatorId}`);
			s.evicted.add(tx.coordinatorId);
			if (s.nodes.delete(tx.coordinatorId)) s.lastHeartbeatSeq.delete(tx.coordinatorId);
			bumpEpoch(s);
			return;
		case "coordinator.add": {
			const key = tx.coordinator;
			if (!isPrincipalKey(key)) throw bad("malformed coordinator key");
			if (s.nodes.has(key.id) || s.evicted.has(key.id) || coordinatorKey(s, key.id) || s.admins.some((a) => a.id === key.id)) throw bad(`id ${key.id} is taken or was evicted`);
			if (s.params.requireDeviceKeys && key.kind !== "device") throw bad(`${key.id} is not an Enclaweder key`);
			if (!validAddress(tx.address)) throw bad("address must be host:port");
			if (!verifyDigest(key, joinDigest(s.swarmId, key), tx.pop)) throw bad("proof of possession does not verify");
			if (!verifyApproval(s, tx)) throw bad("admin approval does not verify for this roster");
			addCoordinator(s, key, tx.address);
			return;
		}
		case "coordinator.promote": {
			const g = s.params.growth;
			const node = s.nodes.get(tx.nodeId);
			const address = s.addresses.get(tx.nodeId);
			if (!g) throw bad("this swarm does not grow automatically");
			if (!node || !address || coordinatorKey(s, tx.nodeId)) throw bad(`${tx.nodeId} is not an eligible node`);
			if (s.leases.get(tx.nodeId)?.epoch !== s.epoch) throw bad(`${tx.nodeId} holds no lease for the current epoch`);
			const r = tx.ready;
			if (!r || !Number.isSafeInteger(r.height) || r.height > s.height || r.height < s.height - 32 || !verifyDigest(node, readyDigest(s.swarmId, tx.nodeId, r.height), r.sig)) throw bad(`${tx.nodeId} has not signed a recent readiness statement`);
			if (s.coordinators.length >= g.maxCoordinators) throw bad(`already at ${g.maxCoordinators} coordinators`);
			if (s.nodes.size < g.nodesPerCoordinator * (s.coordinators.length + 1)) throw bad(`${s.nodes.size} nodes do not yet warrant another coordinator`);
			addCoordinator(s, node, address);
			return;
		}
		case "coordinator.retire":
			if (!coordinatorKey(s, tx.coordinatorId)) throw bad(`unknown coordinator ${tx.coordinatorId}`);
			if (s.coordinators.length <= 2) throw bad(`cannot go below 2 coordinators`);
			if (!verifyApproval(s, tx)) throw bad("admin approval does not verify for this roster");
			dropCoordinator(s, tx.coordinatorId, `retiring ${tx.coordinatorId}`);
			return;
		case "bundle.publish":
			if (typeof tx.bundleHash !== "string" || !/^[0-9a-f]{64}$/.test(tx.bundleHash)) throw bad("bundleHash must be a sha256 hex digest");
			if (!verifyApproval(s, tx)) throw bad("admin approval does not verify for this epoch");
			s.bundleHash = tx.bundleHash;
			bumpEpoch(s);
			return;
		case "params.update":
			if (!validTiming(tx.leaseMs, tx.heartbeatMs)) throw bad(`need integers ${PARAM_BOUNDS.heartbeatMs.min} <= heartbeatMs < leaseMs <= ${PARAM_BOUNDS.leaseMs.max}`);
			if (!verifyApproval(s, tx)) throw bad("admin approval does not verify for this epoch");
			if (tx.expiryBlocks !== void 0 && !validExpiry(tx.expiryBlocks)) throw bad(`expiryBlocks must be an integer in ${PARAM_BOUNDS.expiryBlocks.min}..${PARAM_BOUNDS.expiryBlocks.max}`);
			s.params = {
				...s.params,
				leaseMs: tx.leaseMs,
				heartbeatMs: tx.heartbeatMs,
				...tx.expiryBlocks !== void 0 ? { expiryBlocks: tx.expiryBlocks } : {}
			};
			bumpEpoch(s);
			return;
		case "lease.grant": {
			if (!s.nodes.has(tx.nodeId)) throw bad(`unknown node ${tx.nodeId}`);
			if (s.observers.has(tx.nodeId)) throw bad(`${tx.nodeId} is an observer and holds no lease`);
			if (tx.epoch !== s.epoch) throw bad(`lease is for epoch ${tx.epoch}, current is ${s.epoch}`);
			if (!Number.isSafeInteger(tx.durationMs) || tx.durationMs <= 0 || tx.durationMs > s.params.leaseMs) throw bad(`duration must be 1..${s.params.leaseMs} ms`);
			const node = s.nodes.get(tx.nodeId);
			const hb = tx.heartbeat;
			if (!node || !verifyHeartbeat(node, hb) || hb.body.status !== "CLEAN") throw bad("heartbeat is not a genuine CLEAN heartbeat from that node");
			if (hb.body.swarmId !== s.swarmId || hb.body.epoch > s.epoch) throw bad("heartbeat is for another swarm or a future epoch");
			const prevSeq = s.lastHeartbeatSeq.get(tx.nodeId) ?? -1;
			if (hb.body.seq <= prevSeq) throw bad("heartbeat was already used for a lease");
			s.lastHeartbeatSeq.set(tx.nodeId, hb.body.seq);
			s.lastRenewed.set(tx.nodeId, s.height + 1);
			s.leases.set(tx.nodeId, {
				epoch: tx.epoch,
				durationMs: tx.durationMs,
				heartbeatSeq: hb.body.seq,
				height: s.height + 1
			});
			return;
		}
		default: throw bad("unknown transaction type");
	}
}
/**
* Validates `block` as the next block after `state` and returns the state after
* it. Does not check the QC (proposals have none yet); see applyCommitted.
*/
function applyBlock(state, block) {
	if (state.halted) throw new ChainError("halted", `chain is halted: ${state.halted}`);
	const h = block?.header;
	if (!h || h.swarmId !== state.swarmId) throw new ChainError("wrong-swarm", "block is for another swarm");
	if (h.height !== state.height + 1) throw new ChainError("wrong-height", `expected height ${state.height + 1}, got ${h.height}`);
	if (h.prevHash !== state.headHash) throw new ChainError("wrong-prev", `block ${h.height} does not extend our head`);
	if (h.epoch !== state.epoch) throw new ChainError("wrong-epoch", `block epoch ${h.epoch}, chain epoch ${state.epoch}`);
	if (h.epochHash !== state.epochHash) throw new ChainError("wrong-epoch", `block is for another history of epoch ${h.epoch}`);
	if (!Number.isSafeInteger(h.round) || h.round < 0 || h.proposer !== proposerFor(state, h.round)) throw new ChainError("wrong-proposer", `${h.proposer} may not propose round ${h.round}`);
	if (!Number.isFinite(h.time) || h.time < state.headTime) throw new ChainError("time-regressed", "block time is before its parent");
	if (!Array.isArray(block.txs) || h.txRoot !== txRoot(block.txs)) throw new ChainError("bad-tx-root", "transactions do not match the header");
	if (!validActive(state, h.active) || state.height === 0 && h.active.length > 0) throw new ChainError("bad-active", "active list is not a sorted quorum of coordinators");
	const next = cloneState(state);
	for (const tx of block.txs) applyTx(next, tx);
	next.height = h.height;
	next.headHash = blockHash(h);
	next.headTime = h.time;
	const ids = new Set(next.coordinators.map((c) => c.id));
	next.active = h.active.filter((id) => ids.has(id));
	if (next.active.length < quorumSize(next.coordinators.length)) next.active = [];
	return next;
}
function applyCommitted(state, cb) {
	const hash = blockHash(cb.block.header);
	if (cb.hash !== hash || !verifyQc(state, hash, cb.block.header.height, cb.qc)) throw new ChainError("bad-qc", `block ${cb.block?.header?.height} lacks a valid quorum certificate`);
	return applyBlock(state, cb.block);
}
function makeBlock(state, opts) {
	return {
		header: {
			swarmId: state.swarmId,
			height: state.height + 1,
			round: opts.round,
			prevHash: state.headHash,
			proposer: opts.proposer,
			epoch: state.epoch,
			epochHash: state.epochHash,
			time: Math.max(opts.time, state.headTime),
			txRoot: txRoot(opts.txs),
			active: opts.active ?? []
		},
		txs: opts.txs
	};
}
/** Pairs each coordinator's finals from two conflicting certificates. */
function forkProofs(a, b) {
	const theirs = new Map(b.votes.map((v) => [v.signer, v]));
	const out = [];
	for (const v of a.votes) {
		const w = theirs.get(v.signer);
		if (w && w.blockHash !== v.blockHash) out.push({
			a: v,
			b: w
		});
	}
	return out;
}
function memoryLedgerStore(initial = []) {
	const store = {
		blocks: [...initial],
		load: () => [...store.blocks],
		append: (cb) => {
			store.blocks.push(cb);
		},
		rewrite: (blocks) => {
			store.blocks = [...blocks];
		}
	};
	return store;
}
/** One committed block per line. */
function fileLedgerStore(path) {
	return {
		load() {
			let raw;
			try {
				raw = readFileSync(path, "utf8");
			} catch {
				return [];
			}
			const out = [];
			for (const line of raw.split("\n")) {
				if (!line.trim()) continue;
				try {
					out.push(JSON.parse(line));
				} catch {
					break;
				}
			}
			return out;
		},
		append(cb) {
			appendFileSync(path, JSON.stringify(cb) + "\n");
		},
		rewrite(blocks) {
			writeFileSync(path, blocks.map((b) => JSON.stringify(b) + "\n").join(""));
		}
	};
}
var SwarmLedger = class SwarmLedger {
	constructor(genesis, store) {
		this.chain = [];
		this.rosters = [];
		this.statesBase = 0;
		this.fork = null;
		this.genesis = genesis;
		this.store = store;
		this.states = [genesisState(genesis)];
	}
	/**
	* Loads the stored chain, keeping only the prefix that verifies from genesis.
	* Anything after the first bad block is dropped from the store, and the
	* coordinator then re-syncs that part from its peers.
	*/
	static restore(genesis, store = memoryLedgerStore()) {
		const ledger = new SwarmLedger(genesis, store);
		const stored = store.load();
		let truncatedAt = null;
		for (const cb of stored) try {
			ledger.push(cb, applyCommitted(ledger.state, cb));
		} catch {
			truncatedAt = ledger.chain.length + 1;
			break;
		}
		if (truncatedAt !== null) store.rewrite(ledger.chain);
		return {
			ledger,
			truncatedAt
		};
	}
	get state() {
		return this.states[this.states.length - 1];
	}
	get height() {
		return this.chain.length;
	}
	/** Set once a fork has been seen; the ledger then accepts nothing more. */
	get forkEvidence() {
		return this.fork;
	}
	/** State after block `height` (0 = genesis), while it is still in the recent window. */
	stateAt(height) {
		return this.states[height - this.statesBase];
	}
	push(cb, next) {
		this.rosters.push(this.state.coordinators);
		this.chain.push(cb);
		this.states.push(next);
		if (this.states.length > STATE_WINDOW) {
			this.states.shift();
			this.statesBase += 1;
		}
	}
	block(height) {
		return this.chain[height - 1];
	}
	blocksFrom(height, limit = 256) {
		return this.chain.slice(Math.max(0, height - 1), Math.max(0, height - 1) + limit);
	}
	commit(cb) {
		const h = cb?.block?.header?.height;
		if (!Number.isSafeInteger(h) || h < 1) return {
			ok: false,
			code: "invalid",
			error: "block has no height"
		};
		if (h > this.height + 1) return {
			ok: false,
			code: "gap",
			error: `have ${this.height}, got ${h}`
		};
		if (h <= this.height) {
			const ours = this.chain[h - 1];
			if (ours.hash === cb.hash) return {
				ok: true,
				applied: false
			};
			const parent = {
				swarmId: this.state.swarmId,
				coordinators: this.rosters[h - 1]
			};
			if (!verifyQc(parent, blockHash(cb.block.header), h, cb.qc) || cb.hash !== blockHash(cb.block.header)) return {
				ok: false,
				code: "invalid",
				error: `conflicting block ${h} without a valid QC`
			};
			const proofs = forkProofs(ours.qc, cb.qc).filter((p) => verifyEquivocation(parent, p));
			const fork = {
				height: h,
				ours,
				theirs: cb,
				doubleSigners: proofs.map((p) => p.a.signer),
				proofs
			};
			this.fork = fork;
			this.state.halted = `fork at height ${h}`;
			return {
				ok: false,
				code: "fork",
				fork
			};
		}
		if (this.fork) return {
			ok: false,
			code: "invalid",
			error: this.state.halted ?? "halted"
		};
		let next;
		try {
			next = applyCommitted(this.state, cb);
		} catch (err) {
			return {
				ok: false,
				code: "invalid",
				error: err.message
			};
		}
		this.store.append(cb);
		this.push(cb, next);
		return {
			ok: true,
			applied: true
		};
	}
	/** Applies a run of blocks from a peer, stopping at the first that does not verify. */
	sync(blocks) {
		let applied = 0;
		for (const cb of blocks) {
			const r = this.commit(cb);
			if (!r.ok) return {
				applied,
				stopped: r
			};
			if (r.applied) applied += 1;
		}
		return { applied };
	}
};
//#endregion
//#region src/enclawed/swarm/mempool.ts
/** Transactions waiting for a block, keyed so duplicates from several coordinators collapse. */
var Mempool = class {
	constructor() {
		this.txs = /* @__PURE__ */ new Map();
		this.heartbeats = /* @__PURE__ */ new Map();
	}
	add(tx) {
		if (tx.type === "lease.grant") {
			const prev = this.heartbeats.get(tx.nodeId);
			if (!prev || tx.heartbeat.body.seq > prev.body.seq) this.heartbeats.set(tx.nodeId, tx.heartbeat);
			return;
		}
		this.txs.set(mempoolKey(tx), tx);
	}
	/** Builds a block body: membership and evidence first, leases last at the resulting epoch. */
	build(state, leaseMs, maxTxs) {
		const order = [
			"coordinator.evict",
			"node.evict",
			"coordinator.retire",
			"coordinator.add",
			"coordinator.promote",
			"node.join",
			"bundle.publish",
			"params.update"
		];
		const candidates = [...this.txs.values()].toSorted((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
		const out = [];
		const scratch = cloneState(state);
		const tryAdd = (tx) => {
			if (out.length >= maxTxs) return;
			try {
				applyTx(scratch, tx);
				out.push(tx);
			} catch {}
		};
		for (const tx of candidates) tryAdd(tx);
		for (const nodeId of expiredNodes(scratch)) tryAdd({
			type: "node.evict",
			nodeId,
			reason: "expired"
		});
		for (const [nodeId, heartbeat] of [...this.heartbeats.entries()].toSorted(([a], [b]) => a < b ? -1 : 1)) tryAdd({
			type: "lease.grant",
			nodeId,
			epoch: scratch.epoch,
			durationMs: leaseMs,
			heartbeat
		});
		return out;
	}
	/** Drops what the new state has absorbed or made impossible. */
	prune(state) {
		const scratch = cloneState(state);
		for (const [key, tx] of this.txs) try {
			applyTx(scratch, tx);
		} catch {
			this.txs.delete(key);
		}
		for (const [nodeId, hb] of this.heartbeats) if (!state.nodes.has(nodeId) || hb.body.seq <= (state.lastHeartbeatSeq.get(nodeId) ?? -1)) this.heartbeats.delete(nodeId);
	}
	get size() {
		return this.txs.size + this.heartbeats.size;
	}
};
/** The growth rule's conditions for promoting `id` now, short of its readiness signature. */
function canPromote(state, id) {
	const g = state.params.growth;
	return !!g && state.coordinators.length < g.maxCoordinators && state.nodes.size >= g.nodesPerCoordinator * (state.coordinators.length + 1) && state.nodes.has(id) && state.addresses.has(id) && !coordinatorKey(state, id) && state.leases.get(id)?.epoch === state.epoch;
}
function mempoolKey(tx) {
	switch (tx.type) {
		case "node.join": return `join:${tx.node.id}`;
		case "node.evict": return `evict:${tx.nodeId}`;
		case "coordinator.evict": return `cevict:${tx.coordinatorId}`;
		case "bundle.publish": return `bundle:${tx.bundleHash}`;
		case "params.update": return `params:${tx.leaseMs}:${tx.heartbeatMs}`;
		case "lease.grant": return `lease:${tx.nodeId}`;
		case "coordinator.add": return `cadd:${tx.coordinator.id}`;
		case "coordinator.promote": return `cpromote:${tx.nodeId}`;
		case "coordinator.retire": return `cretire:${tx.coordinatorId}`;
		default: throw new Error(`swarm mempool: unknown transaction type`);
	}
}
//#endregion
//#region src/enclawed/swarm/sign-guard.ts
function memorySignGuardStore() {
	const store = {
		record: null,
		load: () => store.record,
		save: (r) => {
			store.record = structuredClone(r);
		}
	};
	return store;
}
function fileSignGuardStore(path) {
	return {
		load() {
			try {
				return JSON.parse(readFileSync(path, "utf8"));
			} catch {
				return null;
			}
		},
		save(record) {
			writeFileSync(`${path}.tmp`, JSON.stringify(record));
			renameSync(`${path}.tmp`, path);
		}
	};
}
const KIND_ORDER = {
	proposal: 0,
	prevote: 1,
	precommit: 2,
	final: 3
};
function roundOf(s) {
	return s.kind === "final" ? Number.MAX_SAFE_INTEGER : s.round;
}
function compare(a, b) {
	return a.height - b.height || roundOf(a) - roundOf(b) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
}
var SignGuard = class {
	constructor(store) {
		this.store = store;
		this.record = store.load();
	}
	get last() {
		return this.record;
	}
	/**
	* Records the intent to sign and says whether it is safe. Re-signing the
	* exact same statement is allowed (a restart may re-send it); anything at or
	* behind the last signed slot with a different block is refused.
	*/
	admit(next, lock) {
		const prev = this.record;
		if (prev) {
			const c = compare(next, prev);
			if (c < 0 || c === 0 && next.blockHash !== prev.blockHash) return false;
		}
		this.record = {
			...next,
			...lock
		};
		this.store.save(this.record);
		return true;
	}
};
//#endregion
//#region src/enclawed/swarm/consensus.ts
const systemClock = {
	now: () => Date.now(),
	setTimeout: (fn, ms) => {
		const t = setTimeout(fn, ms);
		t.unref?.();
		return t;
	},
	clearTimeout: (h) => clearTimeout(h)
};
const DEFAULT_TIMEOUTS = {
	proposeMs: 1e3,
	prevoteMs: 500,
	precommitMs: 500,
	roundStepMs: 250,
	blockIntervalMs: 1e3,
	maxClockSkewMs: 3e4,
	regossipMs: 1e3
};
var CoordinatorEngine = class {
	constructor(opts) {
		this.mempool = new Mempool();
		this.running = false;
		this.height = 0;
		this.round = 0;
		this.step = "propose";
		this.lockedRound = -1;
		this.lockedHash = null;
		this.validRound = -1;
		this.validBlock = null;
		this.proposals = /* @__PURE__ */ new Map();
		this.votes = /* @__PURE__ */ new Map();
		this.firedPrevoteTimeout = /* @__PURE__ */ new Set();
		this.firedPrecommitTimeout = /* @__PURE__ */ new Set();
		this.timers = /* @__PURE__ */ new Set();
		this.future = [];
		this.evidenceSeen = /* @__PURE__ */ new Set();
		this.own = [];
		this.gossipTimer = null;
		this.lastSyncRequest = Number.NEGATIVE_INFINITY;
		this.decision = null;
		this.committed = false;
		this.opts = opts;
		this.ledger = opts.ledger;
		this.signer = opts.signer;
		this.transport = opts.transport;
		this.clock = opts.clock ?? systemClock;
		this.timeouts = {
			...DEFAULT_TIMEOUTS,
			...opts.timeouts
		};
		this.maxTxs = opts.maxTxsPerBlock ?? 4096;
		this.guard = new SignGuard(opts.signGuard ?? memorySignGuardStore());
	}
	get id() {
		return this.signer.key.id;
	}
	/** Where consensus is right now, for status displays. */
	status() {
		return {
			height: this.height,
			round: this.round,
			step: this.step,
			mempool: this.mempool.size,
			halted: this.ledger.state.halted
		};
	}
	start() {
		if (this.running) return;
		if (!coordinatorKey(this.ledger.state, this.id)) throw new Error(`swarm: ${this.id} is not a coordinator of ${this.ledger.state.swarmId}`);
		this.running = true;
		this.transport.requestSync(this.ledger.height + 1);
		this.startHeight();
		this.regossip();
	}
	stop() {
		this.running = false;
		for (const t of this.timers) this.clock.clearTimeout(t);
		this.timers.clear();
		if (this.gossipTimer !== null) {
			this.clock.clearTimeout(this.gossipTimer);
			this.gossipTimer = null;
		}
	}
	regossip() {
		this.gossipTimer = this.clock.setTimeout(() => {
			if (!this.running) return;
			if (!this.committed) for (const msg of this.own) this.transport.broadcast(msg);
			this.regossip();
		}, this.timeouts.regossipMs);
	}
	requestSyncThrottled() {
		const now = this.clock.now();
		if (now - this.lastSyncRequest >= this.timeouts.regossipMs) {
			this.lastSyncRequest = now;
			this.transport.requestSync(this.ledger.height + 1);
		}
	}
	/**
	* A heartbeat from a node attached to this gateway. CLEAN renews the node's
	* lease; DIRTY is evidence that evicts it. Anything that does not verify
	* against the node's registered key is dropped.
	*/
	acceptHeartbeat(hb) {
		const state = this.ledger.state;
		const node = hb?.body ? state.nodes.get(hb.body.nodeId) : void 0;
		if (!node || hb.body.swarmId !== state.swarmId || !verifyHeartbeat(node, hb)) return "rejected";
		if (hb.body.status === "DIRTY") {
			this.submit({
				type: "node.evict",
				nodeId: node.id,
				reason: "dirty",
				evidence: hb
			});
			return "evict";
		}
		this.submit({
			type: "lease.grant",
			nodeId: node.id,
			epoch: state.epoch,
			durationMs: state.params.leaseMs,
			heartbeat: hb
		});
		return "lease";
	}
	/** Queue a transaction locally and gossip it to the other coordinators. */
	submit(tx) {
		this.mempool.add(tx);
		this.transport.broadcast({
			type: "tx",
			tx
		});
	}
	receive(msg) {
		if (!this.running || !msg) return;
		switch (msg.type) {
			case "tx":
				this.mempool.add(msg.tx);
				return;
			case "commit":
				this.onCommitMessage(msg.committed);
				return;
			case "proposal":
			case "vote": {
				const h = msg.statement?.height;
				if (h > this.height) {
					if (this.future.length < 4096) this.future.push(msg);
					this.requestSyncThrottled();
					return;
				}
				if (h === this.height) this.onStatement(msg);
				return;
			}
		}
	}
	startHeight() {
		if (!this.running) return;
		const state = this.ledger.state;
		if (state.halted) {
			this.opts.onAlert?.(`swarm chain halted: ${state.halted}`);
			return;
		}
		if (!coordinatorKey(state, this.id)) {
			this.opts.onAlert?.(`${this.id} is no longer a coordinator; stopping`);
			this.stop();
			return;
		}
		this.height = this.ledger.height + 1;
		this.lockedRound = -1;
		this.lockedHash = null;
		this.validRound = -1;
		this.validBlock = null;
		this.proposals.clear();
		this.votes.clear();
		this.firedPrevoteTimeout.clear();
		this.firedPrecommitTimeout.clear();
		this.own = [];
		this.decision = null;
		this.committed = false;
		const last = this.guard.last;
		let firstRound = 0;
		if (last && last.height === this.height && last.kind === "final" && last.validBlock) {
			this.step = "decided";
			this.decision = {
				round: last.validRound,
				block: last.validBlock,
				hash: last.blockHash ?? ""
			};
			this.signFinal();
			this.replayFuture();
			return;
		}
		if (last && last.height === this.height) {
			this.lockedRound = last.lockedRound;
			this.lockedHash = last.lockedHash;
			this.validRound = last.validRound;
			this.validBlock = last.validBlock;
			firstRound = last.round + 1;
		}
		this.startRound(firstRound);
		this.replayFuture();
	}
	replayFuture() {
		const pending = this.future.filter((m) => "statement" in m && m.statement.height === this.height);
		this.future = this.future.filter((m) => "statement" in m && m.statement.height > this.height);
		for (const m of pending) this.onStatement(m);
	}
	startRound(round) {
		this.round = round;
		this.step = "propose";
		const state = this.ledger.state;
		if (proposerFor(state, round) === this.id) {
			const block = this.validBlock ?? makeBlock(state, {
				proposer: this.id,
				round,
				time: this.clock.now(),
				txs: this.mempool.build(state, state.params.leaseMs, this.maxTxs),
				active: activeFor(state, this.ledger.block(this.ledger.height))
			});
			this.sign("proposal", round, blockHash(block.header), this.validRound).then((st) => {
				if (st) {
					const msg = {
						type: "proposal",
						statement: st,
						block
					};
					this.own.push(msg);
					this.transport.broadcast(msg);
					this.onStatement(msg);
				}
			});
		}
		this.schedule(this.timeouts.proposeMs + round * this.timeouts.roundStepMs, () => {
			if (this.round === round && this.step === "propose") this.vote("prevote", round, null);
		});
		this.evaluate();
	}
	onStatement(msg) {
		const st = msg.statement;
		const state = this.ledger.state;
		if (!st || st.height !== this.height || !Number.isSafeInteger(st.round) || st.round < 0 || !verifyStatement(state, st)) return;
		if (msg.type === "proposal") {
			if (st.kind !== "proposal" || st.signer !== proposerFor(state, st.round)) return;
			if (!this.recordStatement(st)) return;
			if (!msg.block || blockHash(msg.block.header) !== st.blockHash) return;
			if (!this.proposals.has(st.round)) this.proposals.set(st.round, {
				block: msg.block,
				hash: st.blockHash,
				validRound: st.validRound ?? -1
			});
		} else {
			if (st.kind === "final") {
				if (st.round !== 0 || st.blockHash === null) return;
			} else if (st.kind !== "prevote" && st.kind !== "precommit") return;
			if (!this.recordStatement(st)) return;
		}
		this.evaluate();
	}
	/**
	* Remembers the first statement per (kind, round, signer). A second one that
	* names a different block is a double-sign: keep the first, report both.
	* Returns false when the statement should not be counted.
	*/
	recordStatement(st) {
		const slotKey = `${st.kind}:${st.round}`;
		let slot = this.votes.get(slotKey);
		if (!slot) {
			slot = /* @__PURE__ */ new Map();
			this.votes.set(slotKey, slot);
		}
		const prev = slot.get(st.signer);
		if (!prev) {
			slot.set(st.signer, st);
			return true;
		}
		if (prev.blockHash !== st.blockHash) this.reportEquivocation({
			a: prev,
			b: st
		});
		return false;
	}
	reportEquivocation(proof) {
		const key = `${proof.a.signer}:${proof.a.kind}:${proof.a.height}:${proof.a.round}`;
		if (this.evidenceSeen.has(key) || !verifyEquivocation(this.ledger.state, proof)) return;
		this.evidenceSeen.add(key);
		this.opts.onEvidence?.(proof);
		this.submit({
			type: "coordinator.evict",
			coordinatorId: proof.a.signer,
			evidence: proof
		});
	}
	count(kind, round, hash) {
		const slot = this.votes.get(`${kind}:${round}`);
		if (!slot) return 0;
		if (hash === void 0) return slot.size;
		let n = 0;
		for (const v of slot.values()) if (v.blockHash === hash) n += 1;
		return n;
	}
	quorum() {
		return quorumSize(this.ledger.state.coordinators.length);
	}
	isValid(block) {
		if (Math.abs(block.header.time - this.clock.now()) > this.timeouts.maxClockSkewMs) return false;
		try {
			applyBlock(this.ledger.state, block);
			return true;
		} catch {
			return false;
		}
	}
	/** The Tendermint "upon" rules, re-checked after every event. */
	evaluate() {
		if (!this.running || this.committed) return;
		this.tryFinalize();
		if (this.committed || this.step === "decided") return;
		const q = this.quorum();
		const r = this.round;
		const prop = this.proposals.get(r);
		if (prop && this.step === "propose") {
			const vr = prop.validRound;
			if (vr < 0) {
				const ok = this.isValid(prop.block) && (this.lockedRound === -1 || this.lockedHash === prop.hash);
				this.vote("prevote", r, ok ? prop.hash : null);
			} else if (vr < r && this.count("prevote", vr, prop.hash) >= q) {
				const ok = this.isValid(prop.block) && (this.lockedRound <= vr || this.lockedHash === prop.hash);
				this.vote("prevote", r, ok ? prop.hash : null);
			}
		}
		if (this.step === "prevote" && this.count("prevote", r) >= q && !this.firedPrevoteTimeout.has(r)) {
			this.firedPrevoteTimeout.add(r);
			this.schedule(this.timeouts.prevoteMs + r * this.timeouts.roundStepMs, () => {
				if (this.round === r && this.step === "prevote") this.vote("precommit", r, null);
			});
		}
		if (prop && (this.step === "prevote" || this.step === "precommit") && this.count("prevote", r, prop.hash) >= q && this.validRound !== r) {
			if (this.isValid(prop.block)) {
				if (this.step === "prevote") {
					this.lockedRound = r;
					this.lockedHash = prop.hash;
					this.vote("precommit", r, prop.hash);
				}
				this.validRound = r;
				this.validBlock = prop.block;
			}
		}
		if (this.step === "prevote" && this.count("prevote", r, null) >= q) this.vote("precommit", r, null);
		if (this.count("precommit", r) >= q && !this.firedPrecommitTimeout.has(r)) {
			this.firedPrecommitTimeout.add(r);
			this.schedule(this.timeouts.precommitMs + r * this.timeouts.roundStepMs, () => {
				if (this.round === r && this.step !== "decided") this.startRound(r + 1);
			});
		}
		for (const [round, p] of this.proposals) if (this.count("precommit", round, p.hash) >= q) {
			this.decide(round, p.block, p.hash);
			return;
		}
		const f1 = faultTolerance(this.ledger.state.coordinators.length) + 1;
		let skipTo = -1;
		for (const key of this.votes.keys()) {
			const round = Number(key.split(":")[1]);
			if (round > r && this.signersInRound(round) >= f1) skipTo = Math.max(skipTo, round);
		}
		if (skipTo > r) this.startRound(skipTo);
	}
	signersInRound(round) {
		const ids = /* @__PURE__ */ new Set();
		for (const kind of [
			"proposal",
			"prevote",
			"precommit"
		]) for (const id of this.votes.get(`${kind}:${round}`)?.keys() ?? []) ids.add(id);
		return ids.size;
	}
	/**
	* Tendermint has decided `block`. Sign our final for it, and pass on what
	* convinced us (the proposal and the precommits), so that peers who missed
	* some of those messages can decide too and add their finals.
	*/
	decide(round, block, hash) {
		this.step = "decided";
		this.decision = {
			round,
			block,
			hash
		};
		const proposal = this.votes.get(`proposal:${round}`)?.values().next().value;
		if (proposal) this.own.push({
			type: "proposal",
			statement: proposal,
			block
		});
		for (const v of this.votes.get(`precommit:${round}`)?.values() ?? []) if (v.blockHash === hash && v.signer !== this.id) this.own.push({
			type: "vote",
			statement: v
		});
		this.signFinal();
	}
	async signFinal() {
		const d = this.decision;
		if (!d) return;
		const st = await this.sign("final", 0, d.hash, void 0, {
			lockedRound: this.lockedRound,
			lockedHash: this.lockedHash,
			validRound: d.round,
			validBlock: d.block
		});
		if (st) {
			const msg = {
				type: "vote",
				statement: st
			};
			this.own.push(msg);
			this.transport.broadcast(msg);
			this.onStatement(msg);
		}
	}
	/** Commits the height's block once a quorum of finals names one we hold. */
	tryFinalize() {
		const slot = this.votes.get("final:0");
		if (this.committed || !slot) return;
		const byHash = /* @__PURE__ */ new Map();
		for (const v of slot.values()) {
			const list = byHash.get(v.blockHash ?? "") ?? [];
			list.push(v);
			byHash.set(v.blockHash ?? "", list);
		}
		for (const [hash, finals] of byHash) {
			if (finals.length < this.quorum()) continue;
			const block = this.decision?.hash === hash ? this.decision.block : [...this.proposals.values()].find((p) => p.hash === hash)?.block;
			if (!block) {
				this.requestSyncThrottled();
				return;
			}
			const committed = {
				block,
				hash,
				qc: {
					height: this.height,
					round: this.decision?.round ?? block.header.round,
					blockHash: hash,
					votes: finals.toSorted((a, b) => a.signer < b.signer ? -1 : 1)
				}
			};
			const result = this.ledger.commit(committed);
			if (!result.ok) {
				this.onCommitRefused(result);
				return;
			}
			this.transport.broadcast({
				type: "commit",
				committed
			});
			this.afterCommit(committed);
			return;
		}
	}
	onCommitRefused(result) {
		if (result.code === "fork") {
			for (const proof of result.fork.proofs) this.opts.onEvidence?.(proof);
			this.opts.onAlert?.(`FORK at height ${result.fork.height}: double signers ${result.fork.doubleSigners.join(", ")}`);
			this.stop();
		} else if (result.code === "gap") this.requestSyncThrottled();
		else this.opts.onAlert?.(`block refused by ledger: ${result.error.slice(0, 200)}`);
	}
	onCommitMessage(cb) {
		const result = this.ledger.commit(cb);
		if (!result.ok) {
			if (result.code !== "invalid") this.onCommitRefused(result);
			return;
		}
		if (result.applied) this.afterCommit(cb);
	}
	afterCommit(cb) {
		this.mempool.prune(this.ledger.state);
		this.opts.onCommit?.(cb);
		for (const t of this.timers) this.clock.clearTimeout(t);
		this.timers.clear();
		this.step = "decided";
		this.committed = true;
		this.schedule(this.timeouts.blockIntervalMs, () => this.startHeight());
	}
	async vote(kind, round, hash) {
		this.step = kind;
		const st = await this.sign(kind, round, hash);
		if (st) {
			const msg = {
				type: "vote",
				statement: st
			};
			this.own.push(msg);
			this.transport.broadcast(msg);
			this.onStatement(msg);
		}
	}
	async sign(kind, round, hash, validRound, lockOverride) {
		const height = this.height;
		const body = {
			swarmId: this.ledger.state.swarmId,
			kind,
			height,
			round,
			blockHash: hash,
			...kind === "proposal" ? { validRound: validRound ?? -1 } : {},
			signer: this.id,
			sig: ""
		};
		const lock = lockOverride ?? {
			lockedRound: this.lockedRound,
			lockedHash: this.lockedHash,
			validRound: this.validRound,
			validBlock: this.validBlock
		};
		if (!this.guard.admit({
			height,
			round,
			kind,
			blockHash: hash
		}, lock)) {
			this.opts.onAlert?.(`refused to sign ${kind} h${height} r${round}: would contradict an earlier signature`);
			return null;
		}
		try {
			body.sig = await this.signer.sign(statementDigest(body));
		} catch (err) {
			this.opts.onAlert?.(`signing failed: ${err.message}`);
			return null;
		}
		return this.running && this.height === height ? body : null;
	}
	schedule(ms, fn) {
		const handle = this.clock.setTimeout(() => {
			this.timers.delete(handle);
			if (this.running) fn();
		}, ms);
		this.timers.add(handle);
	}
};
//#endregion
//#region src/enclawed/swarm/net.ts
/** Largest single message accepted; a block of thousands of leases fits easily. */
const MAX_LINE_BYTES = 8 * 1024 * 1024;
const SYNC_BATCH = 256;
var Peer = class {
	constructor(socket, onEnvelope, onClose) {
		this.socket = socket;
		this.onEnvelope = onEnvelope;
		this.onClose = onClose;
		this.buf = "";
		this.remoteId = null;
		this.role = null;
		socket.setEncoding("utf8");
		if (socket instanceof net.Socket) socket.setNoDelay(true);
		socket.on("data", (chunk) => this.onData(chunk));
		socket.on("close", () => this.onClose(this));
		socket.on("error", () => socket.destroy());
	}
	onData(chunk) {
		this.buf += chunk;
		if (this.buf.length > MAX_LINE_BYTES) {
			this.socket.destroy();
			return;
		}
		let nl;
		while ((nl = this.buf.indexOf("\n")) >= 0) {
			const line = this.buf.slice(0, nl);
			this.buf = this.buf.slice(nl + 1);
			if (!line) continue;
			let env;
			try {
				env = JSON.parse(line);
			} catch {
				continue;
			}
			if (env && typeof env === "object" && typeof env.kind === "string") {
				if (env.kind === "hello" && typeof env.from === "string") {
					this.remoteId = env.from;
					this.role = env.role;
				}
				this.onEnvelope(this, env);
			}
		}
	}
	send(env) {
		if (!this.socket.destroyed && this.socket.writable) this.socket.write(JSON.stringify(env) + "\n");
	}
};
/**
* One process's view of the swarm network: a listening socket for inbound
* peers, persistent outbound connections that redial on loss, and sync
* answers served straight from the local ledger.
*/
var SwarmHub = class {
	constructor(opts) {
		this.opts = opts;
		this.peers = /* @__PURE__ */ new Set();
		this.server = null;
		this.closed = false;
		this.redial = /* @__PURE__ */ new Map();
		this.targets = /* @__PURE__ */ new Map();
	}
	async start() {
		if (this.opts.listen) {
			const { host, port } = this.opts.listen;
			this.server = net.createServer((s) => this.adopt(s));
			await new Promise((resolve, reject) => {
				this.server.once("error", reject);
				this.server.listen(port, host, () => resolve());
			});
		}
		this.setTargets(this.opts.connect ?? []);
		for (const d of this.opts.dialers ?? []) this.dialStream(d);
	}
	dialStream(d) {
		if (this.closed) return;
		let stream;
		try {
			stream = d.open();
		} catch {
			this.retryStream(d);
			return;
		}
		const peer = this.adopt(stream);
		stream.once("close", () => this.retryStream(d));
		peer.send({
			kind: "sync",
			fromHeight: this.opts.ledger.height + 1
		});
	}
	retryStream(d) {
		const key = `stream:${d.key}`;
		if (this.closed || this.redial.has(key)) return;
		const t = setTimeout(() => {
			this.redial.delete(key);
			this.dialStream(d);
		}, 2e3);
		t.unref?.();
		this.redial.set(key, t);
	}
	/**
	* Keeps outbound connections to exactly these peers: dials new ones, and
	* drops ones no longer listed (a retired or evicted coordinator). Called as
	* the chain's coordinator set changes.
	*/
	setTargets(list) {
		const want = new Map(list.map((t) => [`${t.host}:${t.port}`, t]));
		for (const [key, socket] of this.targets) if (!want.has(key)) {
			this.targets.delete(key);
			clearTimeout(this.redial.get(key));
			this.redial.delete(key);
			socket?.destroy();
		}
		for (const [key, target] of want) if (!this.targets.has(key)) {
			this.targets.set(key, null);
			this.dial(target);
		}
	}
	get address() {
		const a = this.server?.address();
		return a && typeof a === "object" ? a : null;
	}
	adopt(socket) {
		const peer = new Peer(socket, (p, env) => this.onEnvelope(p, env), (p) => this.peers.delete(p));
		this.peers.add(peer);
		peer.send({
			kind: "hello",
			from: this.opts.id,
			role: this.opts.role
		});
		return peer;
	}
	dial(target) {
		const key = `${target.host}:${target.port}`;
		if (this.closed || !this.targets.has(key)) return;
		const socket = net.connect(target.port, target.host);
		this.targets.set(key, socket);
		const retry = () => {
			if (this.closed || this.redial.has(key) || !this.targets.has(key)) return;
			const t = setTimeout(() => {
				this.redial.delete(key);
				this.dial(target);
			}, 250);
			t.unref?.();
			this.redial.set(key, t);
		};
		socket.once("connect", () => {
			const peer = this.adopt(socket);
			socket.once("close", retry);
			peer.send({
				kind: "sync",
				fromHeight: this.opts.ledger.height + 1
			});
		});
		socket.once("error", () => {
			socket.destroy();
			retry();
		});
	}
	onEnvelope(peer, env) {
		switch (env.kind) {
			case "consensus":
				if (peer.role === "coordinator") this.opts.onConsensus?.(env.msg, peer);
				return;
			case "sync": {
				const from = env.fromHeight;
				if (typeof from !== "number" || !Number.isSafeInteger(from) || from < 1) return;
				for (const committed of this.opts.ledger.blocksFrom(from, SYNC_BATCH)) peer.send({
					kind: "commit",
					committed
				});
				return;
			}
			case "heartbeat":
				this.opts.onHeartbeat?.(env.hb, peer);
				return;
			case "commit":
				this.opts.onCommit?.(env.committed, peer);
				return;
			case "tx":
				this.opts.onTx?.(env.tx, peer);
				return;
			default: return;
		}
	}
	/** To every connected coordinator. */
	broadcastConsensus(msg) {
		for (const p of this.peers) if (p.role === "coordinator") p.send({
			kind: "consensus",
			msg
		});
	}
	/** New blocks go to everyone: coordinators, nodes and monitors. */
	publishCommit(committed) {
		for (const p of this.peers) p.send({
			kind: "commit",
			committed
		});
	}
	requestSync(fromHeight) {
		for (const p of this.peers) if (p.role === "coordinator") p.send({
			kind: "sync",
			fromHeight
		});
	}
	/** Hands a transaction to one coordinator, which gossips it on. */
	submitTx(tx) {
		for (const p of this.peers) if (p.role === "coordinator") {
			p.send({
				kind: "tx",
				tx
			});
			return true;
		}
		return false;
	}
	/** To one coordinator, which gossips it to the rest; with `all`, to every one. */
	sendHeartbeat(hb, opts) {
		for (const p of this.peers) if (p.role === "coordinator") {
			p.send({
				kind: "heartbeat",
				hb
			});
			if (!opts?.all) return;
		}
	}
	peerCount(role) {
		return [...this.peers].filter((p) => !role || p.role === role).length;
	}
	async close() {
		this.closed = true;
		for (const t of this.redial.values()) clearTimeout(t);
		for (const p of this.peers) p.socket.destroy();
		await new Promise((r) => this.server ? this.server.close(() => r()) : r());
	}
};
//#endregion
//#region src/enclawed/swarm/node.ts
var SwarmNode = class {
	constructor(opts) {
		this.sentAt = /* @__PURE__ */ new Map();
		this.leaseUntil = Number.NEGATIVE_INFINITY;
		this.leaseEpoch = -1;
		this.timer = null;
		this.timerMs = 0;
		this.opts = opts;
		this.ledger = opts.ledger;
		this.mono = opts.monotonicNow ?? (() => performance.now());
		this.seq = (this.ledger.state.lastHeartbeatSeq.get(this.id) ?? -1) + 1;
	}
	get id() {
		return this.opts.signer.key.id;
	}
	start() {
		if (this.timer) return;
		this.heartbeat();
		this.schedule();
	}
	schedule() {
		if (this.timer) clearInterval(this.timer);
		this.timerMs = this.ledger.state.params.heartbeatMs;
		this.timer = setInterval(() => void this.heartbeat(), this.timerMs);
		this.timer.unref?.();
	}
	stop() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
	/**
	* Signs and sends one heartbeat. Returns null, sending nothing, when the
	* device is UNAVAILABLE or the signature cannot be had: a missed heartbeat
	* only lets the lease lapse, while a thrown one would take this supervisor
	* down with an unhandled rejection.
	*/
	async heartbeat() {
		const state = this.ledger.state;
		const dev = this.opts.deviceStatus?.() ?? { status: "CLEAN" };
		if (dev.status === "UNAVAILABLE") return null;
		const seq = this.seq++;
		this.sentAt.set(seq, this.mono());
		for (const old of this.sentAt.keys()) if (old < seq - 64) this.sentAt.delete(old);
		let hb;
		try {
			hb = await signHeartbeat(this.opts.signer, {
				swarmId: state.swarmId,
				nodeId: this.id,
				epoch: state.epoch,
				seq,
				time: (this.opts.wallNow ?? Date.now)(),
				status: dev.status,
				...dev.reason ? { reason: dev.reason } : {}
			});
		} catch {
			return null;
		}
		const lapsing = this.mono() + 2 * state.params.heartbeatMs > this.leaseUntil;
		this.opts.sendHeartbeat(hb, { all: lapsing });
		return hb;
	}
	/** Feed a committed block from any coordinator; its certificate is checked here. */
	ingest(cb) {
		const r = this.ledger.commit(cb);
		if (!r.ok) {
			if (r.code === "gap") this.opts.requestSync?.(this.ledger.height + 1);
			return;
		}
		if (!r.applied) return;
		if (this.timer && this.ledger.state.params.heartbeatMs !== this.timerMs) this.schedule();
		const lease = this.ledger.state.leases.get(this.id);
		if (lease && lease.height === this.ledger.height) {
			const sent = this.sentAt.get(lease.heartbeatSeq);
			if (sent !== void 0) {
				this.leaseUntil = sent + lease.durationMs - (this.opts.safetyMarginMs ?? 1e3);
				this.leaseEpoch = lease.epoch;
			}
		}
	}
	check(action) {
		if (action === "reversible") return { allowed: true };
		const state = this.ledger.state;
		if (state.halted) return {
			allowed: false,
			code: "halted",
			reason: `swarm chain halted: ${state.halted}`
		};
		if (state.evicted.has(this.id)) return {
			allowed: false,
			code: "evicted",
			reason: "this node was evicted from the swarm"
		};
		if (!state.nodes.has(this.id)) return {
			allowed: false,
			code: "not-member",
			reason: "this node has not joined the swarm"
		};
		if (this.opts.deviceStatus?.().status === "DIRTY") return {
			allowed: false,
			code: "device-dirty",
			reason: "the Enclaweder on this node is DIRTY"
		};
		if (this.leaseEpoch < 0) return {
			allowed: false,
			code: "no-lease",
			reason: "no lease granted yet"
		};
		if (this.leaseEpoch !== state.epoch) return {
			allowed: false,
			code: "stale-epoch",
			reason: `lease is for epoch ${this.leaseEpoch}, swarm is at ${state.epoch}`
		};
		if (this.mono() >= this.leaseUntil) return {
			allowed: false,
			code: "expired",
			reason: "lease expired; waiting for renewal"
		};
		return { allowed: true };
	}
};
//#endregion
//#region src/enclawed/swarm/daemon.ts
/**
* Where to reach each current coordinator: genesis coordinators from the
* deployment's address list, later ones from the address recorded on chain
* when they were added or promoted.
*/
function coordinatorPeers(state, genesisAddrs, selfId) {
	const out = [];
	for (const c of state.coordinators) {
		if (c.id === selfId) continue;
		const onChain = state.addresses.get(c.id);
		const addr = onChain ? parseHostPorts(onChain)[0] : genesisAddrs.get(c.id);
		if (addr) out.push(addr);
	}
	return out;
}
function parseHostPorts(list) {
	return list.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
		const i = s.lastIndexOf(":");
		const port = Number(s.slice(i + 1));
		if (i <= 0 || !Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`not host:port: ${s}`);
		return {
			host: s.slice(0, i),
			port
		};
	});
}
async function runCoordinator(opts) {
	mkdirSync(opts.dataDir, { recursive: true });
	const id = opts.signer.key.id;
	const { ledger, truncatedAt } = SwarmLedger.restore(opts.genesis, fileLedgerStore(path.join(opts.dataDir, `ledger-${id}.jsonl`)));
	if (opts.seed) ledger.sync(opts.seed);
	let engine;
	const hub = new SwarmHub({
		id,
		role: "coordinator",
		listen: opts.listen,
		connect: opts.peers,
		ledger,
		onConsensus: (msg) => engine.receive(msg),
		onCommit: (committed) => engine.receive({
			type: "commit",
			committed
		}),
		onHeartbeat: (hb) => {
			engine.acceptHeartbeat(hb);
		},
		onTx: (tx) => engine.submit(tx)
	});
	engine = new CoordinatorEngine({
		ledger,
		signer: opts.signer,
		timeouts: opts.timeouts,
		signGuard: fileSignGuardStore(path.join(opts.dataDir, `guard-${id}.json`)),
		transport: {
			broadcast: (msg) => {
				if (msg.type !== "commit") hub.broadcastConsensus(msg);
			},
			requestSync: (from) => hub.requestSync(from)
		},
		onCommit: (cb) => {
			hub.publishCommit(cb);
			if (opts.genesisAddrs) hub.setTargets(coordinatorPeers(ledger.state, opts.genesisAddrs, id));
			opts.onCommit?.(cb);
		},
		onEvidence: opts.onEvidence,
		onAlert: opts.onAlert
	});
	await hub.start();
	engine.start();
	return {
		engine,
		hub,
		ledger,
		truncatedAt,
		async stop() {
			engine.stop();
			await hub.close();
		}
	};
}
async function runNode(opts) {
	const { ledger } = SwarmLedger.restore(opts.genesis);
	const id = opts.signer.key.id;
	let node;
	let coordinator = null;
	let starting = false;
	let stopped = false;
	let lastAsk = Number.NEGATIVE_INFINITY;
	const maybePromote = () => {
		const p = opts.promotion;
		if (!p || coordinator || starting || stopped || !opts.genesisAddrs) return;
		if (!ledger.state.coordinators.some((c) => c.id === id)) {
			const now = Date.now();
			if (canPromote(ledger.state, id) && now - lastAsk > 2 * ledger.state.params.heartbeatMs) {
				lastAsk = now;
				const height = ledger.height;
				opts.signer.sign(readyDigest(ledger.state.swarmId, id, height)).then((sig) => {
					hub.submitTx({
						type: "coordinator.promote",
						nodeId: id,
						ready: {
							height,
							sig
						}
					});
				});
			}
			return;
		}
		starting = true;
		runCoordinator({
			genesis: opts.genesis,
			signer: opts.signer,
			dataDir: p.dataDir,
			listen: p.listen,
			peers: coordinatorPeers(ledger.state, opts.genesisAddrs, id),
			genesisAddrs: opts.genesisAddrs,
			seed: ledger.blocksFrom(1, ledger.height),
			timeouts: p.timeouts,
			onCommit: p.onCommit,
			onAlert: p.onAlert
		}).then((h) => {
			coordinator = h;
			starting = false;
			p.onPromoted?.(ledger.height);
		}, (err) => {
			starting = false;
			p.onAlert?.(`could not start coordinator: ${err.message}`);
		});
	};
	const hub = new SwarmHub({
		id,
		role: "node",
		connect: opts.coordinators,
		ledger,
		onCommit: (cb) => {
			const before = ledger.height;
			node.ingest(cb);
			if (ledger.height > before) {
				if (opts.genesisAddrs) hub.setTargets(coordinatorPeers(ledger.state, opts.genesisAddrs, id));
				maybePromote();
				opts.onBlock?.(cb);
			}
		}
	});
	node = new SwarmNode({
		ledger,
		signer: opts.signer,
		sendHeartbeat: (hb, o) => hub.sendHeartbeat(hb, o),
		requestSync: (from) => hub.requestSync(from),
		deviceStatus: opts.deviceStatus,
		safetyMarginMs: opts.safetyMarginMs
	});
	await hub.start();
	node.start();
	return {
		node,
		hub,
		ledger,
		coordinator: () => coordinator,
		async stop() {
			stopped = true;
			node.stop();
			await coordinator?.stop();
			await hub.close();
		}
	};
}
function tokenMatches(given, expected) {
	const a = Buffer.from(given);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}
/**
* Serves lease decisions to the processes this node supervises, over a Unix
* socket only they can reach: the socket lives in a 0700 directory and every
* request carries a per-launch token passed in the child's environment.
* Answers come from memory, so a rank's check costs one local round trip.
*/
async function startDecisionServer(opts) {
	if (Buffer.byteLength(opts.socketPath) > 100) throw new Error(`decision socket path is too long for a Unix socket: ${opts.socketPath}`);
	const dir = path.dirname(opts.socketPath);
	mkdirSync(dir, {
		recursive: true,
		mode: 448
	});
	chmodSync(dir, 448);
	rmSync(opts.socketPath, { force: true });
	const server = net.createServer((socket) => {
		socket.setEncoding("utf8");
		let buf = "";
		socket.on("data", (chunk) => {
			buf += chunk;
			if (buf.length > 64 * 1024) {
				socket.destroy();
				return;
			}
			let nl;
			while ((nl = buf.indexOf("\n")) >= 0) {
				const line = buf.slice(0, nl);
				buf = buf.slice(nl + 1);
				let reply;
				let req = null;
				try {
					req = JSON.parse(line);
				} catch {
					req = null;
				}
				if (!req || typeof req.token !== "string" || !tokenMatches(req.token, opts.token)) reply = {
					allowed: false,
					code: "unauthorized",
					reason: "bad or missing token"
				};
				else if (req.class !== "reversible" && req.class !== "irreversible") reply = {
					allowed: false,
					code: "bad-request",
					reason: "class must be reversible or irreversible"
				};
				else {
					const d = opts.decide(req);
					reply = d.allowed ? { allowed: true } : {
						allowed: false,
						code: d.code,
						reason: d.reason
					};
					opts.onDecision?.(req, reply);
				}
				socket.write(JSON.stringify(reply) + "\n");
			}
		});
		socket.on("error", () => socket.destroy());
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(opts.socketPath, () => resolve());
	});
	chmodSync(opts.socketPath, 384);
	return { close: () => new Promise((r) => server.close(() => {
		rmSync(opts.socketPath, { force: true });
		r();
	})) };
}
//#endregion
//#region src/enclawed/swarm/device-broker.ts
/** This machine's Enclaweders, or null when none is present. */
async function localDevices() {
	if (!await bootHardwareRoot()) return null;
	const signing = hardwareRootSigning();
	if (!signing) return null;
	return {
		fleet: {
			members: signing.members,
			run: (fn) => signing.run(fn)
		},
		health: () => {
			const h = hardwareRootHealth();
			if (h.status === "CLEAN") return { status: "CLEAN" };
			return {
				status: h.status === "CHECKING" ? "UNAVAILABLE" : h.status,
				reason: h.reason
			};
		}
	};
}
//#endregion
//#region src/enclawed/swarm/mpi-env.ts
function int(v) {
	if (v === void 0 || !/^\d+$/.test(v)) return null;
	return Number(v);
}
function launchContext(env = process.env) {
	const pick = (source, rank, size, jobId, localRank) => {
		const r = int(rank);
		const s = int(size);
		if (r === null || s === null || r >= s) return null;
		return {
			rank: r,
			size: s,
			jobId: jobId ?? "local",
			source,
			localRank: int(localRank)
		};
	};
	const jobFallback = env.SLURM_JOB_ID ?? env.FLUX_JOB_ID ?? env.PMIX_NAMESPACE;
	return pick("flux", env.FLUX_TASK_RANK, env.FLUX_JOB_SIZE, env.FLUX_JOB_ID, env.FLUX_TASK_LOCAL_ID) ?? pick("slurm", env.SLURM_PROCID, env.SLURM_NTASKS ?? env.SLURM_NPROCS, env.SLURM_JOB_ID && env.SLURM_STEP_ID ? `${env.SLURM_JOB_ID}.${env.SLURM_STEP_ID}` : env.SLURM_JOB_ID, env.SLURM_LOCALID) ?? pick("pmix", env.PMIX_RANK, env.PMIX_SIZE ?? env.OMPI_COMM_WORLD_SIZE, env.PMIX_NAMESPACE, env.OMPI_COMM_WORLD_LOCAL_RANK) ?? pick("openmpi", env.OMPI_COMM_WORLD_RANK, env.OMPI_COMM_WORLD_SIZE, env.OMPI_MCA_ess_base_jobid ?? jobFallback, env.OMPI_COMM_WORLD_LOCAL_RANK) ?? pick("pmi", env.PMI_RANK, env.PMI_SIZE, env.PMI_JOBID ?? jobFallback, env.MPI_LOCALRANKID) ?? {
		rank: 0,
		size: 1,
		jobId: "local",
		source: "none",
		localRank: null
	};
}
//#endregion
//#region src/enclawed/swarm/proc-tree.ts
/** `root` and every live descendant, parents before children. */
function processTree(root) {
	let entries;
	try {
		entries = readdirSync("/proc");
	} catch {
		return [root];
	}
	const children = /* @__PURE__ */ new Map();
	for (const name of entries) {
		if (!/^\d+$/.test(name)) continue;
		let stat;
		try {
			stat = readFileSync(`/proc/${name}/stat`, "utf8");
		} catch {
			continue;
		}
		const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
		const list = children.get(ppid) ?? [];
		list.push(Number(name));
		children.set(ppid, list);
	}
	const out = [];
	const queue = [root];
	while (queue.length > 0) {
		const pid = queue.shift();
		out.push(pid);
		queue.push(...children.get(pid) ?? []);
	}
	return out;
}
/**
* Sends `sig` to `root` and every descendant. The tree is read before
* anything is signalled: once a parent dies, its children are reparented and
* no longer reachable through it. A kill first stops the whole tree and reads
* it again, so no process can start a child that escapes.
*/
function signalTree(root, sig) {
	let pids = processTree(root);
	if (sig === "SIGKILL") {
		send(pids, "SIGSTOP");
		pids = [...new Set([...pids, ...processTree(root)])];
	}
	send(pids, sig);
}
function send(pids, sig) {
	for (const pid of pids) try {
		process.kill(pid, sig);
	} catch {}
}
//#endregion
//#region src/enclawed/swarm/cli.ts
function parseArgs(argv) {
	const flags = /* @__PURE__ */ new Map();
	let i = 0;
	for (; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--") {
			i += 1;
			break;
		}
		if (!a.startsWith("--")) break;
		const eq = a.indexOf("=");
		if (eq > 0) flags.set(a.slice(2, eq), a.slice(eq + 1));
		else if (argv[i + 1] !== void 0 && !argv[i + 1].startsWith("--")) {
			flags.set(a.slice(2), argv[i + 1]);
			i += 1;
		} else flags.set(a.slice(2), "true");
	}
	return {
		flags,
		rest: argv.slice(i)
	};
}
function need(args, name) {
	const v = args.flags.get(name);
	if (!v) throw new Error(`--${name} is required`);
	return v;
}
function log(event, fields = {}) {
	process.stderr.write(JSON.stringify({
		t: Date.now(),
		event,
		...fields
	}) + "\n");
}
/** Says, every time, that these keys are software keys and what that exposes. */
function warnSoftwareKeys(what) {
	log("warning.software-keys", {
		what,
		notice: SOFTWARE_ONLY_NOTICE
	});
}
function writeSecret(file, content) {
	mkdirSync(path.dirname(file), {
		recursive: true,
		mode: 448
	});
	writeFileSync(file, content, { mode: 384 });
}
function loadSigner(dir, id, file = path.join(dir, "keys", `${id}.pem`)) {
	return softwareSigner(id, readFileSync(file, "utf8"));
}
function loadGenesis(dir) {
	return JSON.parse(readFileSync(path.join(dir, "genesis.json"), "utf8"));
}
function coordinatorAddrs(dir) {
	return parseHostPorts(readFileSync(path.join(dir, "coordinators.txt"), "utf8").trim());
}
/** coordinators.txt lists genesis coordinators in genesis order. */
function genesisAddrMap(dir) {
	const addrs = coordinatorAddrs(dir);
	return new Map(loadGenesis(dir).coordinators.map((c, i) => [c.id, addrs[i]]));
}
function parseGrowth(v) {
	if (!v) return;
	const m = /^(\d+):(\d+)$/.exec(v);
	if (!m) throw new Error("--growth is MAX_COORDINATORS:NODES_PER_COORDINATOR, e.g. 7:4");
	return {
		maxCoordinators: Number(m[1]),
		nodesPerCoordinator: Number(m[2])
	};
}
async function cmdInit(args) {
	const dir = need(args, "dir");
	const n = Number(args.flags.get("coordinators") ?? 4);
	const host = args.flags.get("host") ?? "127.0.0.1";
	const basePort = Number(args.flags.get("base-port") ?? 7700);
	const coords = Array.from({ length: n }, (_, i) => softwareSigner(`coord-${i}`));
	const admin = softwareSigner("admin-0");
	for (const s of [...coords, admin]) writeSecret(path.join(dir, "keys", `${s.key.id}.pem`), s.privateKeyPem);
	const extra = args.flags.get("admin-pub");
	const operator = extra ? JSON.parse(readFileSync(extra, "utf8")) : null;
	const leaseMs = Number(args.flags.get("lease-ms") ?? 15e3);
	const genesis = {
		swarmId: args.flags.get("swarm-id") ?? `swarm-${randomBytes(4).toString("hex")}`,
		createdAt: Date.now(),
		coordinators: coords.map((s) => s.key),
		admins: operator ? [admin.key, operator] : [admin.key],
		params: {
			leaseMs,
			heartbeatMs: Number(args.flags.get("heartbeat-ms") ?? 2e3),
			expiryBlocks: Number(args.flags.get("expiry-blocks") ?? Math.max(3, Math.ceil(2 * leaseMs / 1e3))),
			requireDeviceKeys: false,
			...args.flags.get("growth") ? { growth: parseGrowth(args.flags.get("growth")) } : {}
		},
		bundleHash: digestHex("ENCLAWED-POLICY-BUNDLE-01", args.flags.get("bundle") ?? "default")
	};
	writeFileSync(path.join(dir, "genesis.json"), JSON.stringify(genesis, null, 2));
	writeFileSync(path.join(dir, "coordinators.txt"), coords.map((_, i) => `${host}:${basePort + i}`).join(",") + "\n");
	log("swarm.init", {
		dir,
		swarmId: genesis.swarmId,
		coordinators: n
	});
	warnSoftwareKeys("the coordinators' keys and admin-0, kept in the swarm directory");
}
async function cmdCoordinator(args) {
	const dir = need(args, "dir");
	const index = Number(need(args, "index"));
	const addrs = coordinatorAddrs(dir);
	const signer = loadSigner(dir, `coord-${index}`);
	const handle = await runCoordinator({
		genesis: loadGenesis(dir),
		signer,
		dataDir: path.join(dir, "data"),
		listen: addrs[index],
		peers: addrs.filter((_, i) => i !== index),
		genesisAddrs: genesisAddrMap(dir),
		onCommit: (cb) => logBlock(signer.key.id, cb),
		onEvidence: (p) => log("evidence", {
			id: signer.key.id,
			against: p.a.signer,
			kind: p.a.kind
		}),
		onAlert: (m) => log("alert", {
			id: signer.key.id,
			message: m
		})
	});
	log("coordinator.up", {
		id: signer.key.id,
		height: handle.ledger.height,
		truncatedAt: handle.truncatedAt
	});
	const shutdown = () => void handle.stop().then(() => process.exit(0));
	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
}
function logBlock(id, cb) {
	log("block", {
		id,
		height: cb.block.header.height,
		round: cb.block.header.round,
		txs: cb.block.txs.map((t) => t.type),
		epoch: cb.block.header.epoch,
		finals: cb.qc.votes.length
	});
}
/**
* A long-lived host (a gateway or service node, never an MPI rank) that joins
* as a coordinator candidate. It runs as a node and holds a lease; once the
* growth rule promotes it on chain, it also starts a coordinator with the same
* key, listening at the address its admin-approved join recorded.
*/
async function cmdHost(args) {
	const dir = need(args, "dir");
	const id = need(args, "id");
	const listen = need(args, "listen");
	const [addr] = parseHostPorts(listen);
	const genesis = loadGenesis(dir);
	let signer;
	let deviceStatus;
	if (args.flags.get("device")) {
		const devices = await requireDevices("host");
		signer = fleetSigner(id, devices.fleet);
		deviceStatus = () => devices.health();
	} else {
		const keyFile = path.join(dir, "keys", `${id}.pem`);
		if (!existsSync(keyFile)) writeSecret(keyFile, softwareSigner(id).privateKeyPem);
		signer = loadSigner(dir, id);
	}
	const probe = SwarmLedger.restore(genesis).ledger;
	const admin = loadSigner(dir, "admin-0");
	const join = {
		type: "node.join",
		node: signer.key,
		pop: await signer.sign(joinDigest(genesis.swarmId, signer.key)),
		coordinator: { address: listen },
		approval: {
			admin: admin.key.id,
			sig: ""
		}
	};
	join.approval.sig = await admin.sign(approvalDigest(probe.state, join));
	await follow(dir, (l) => l.state.nodes.has(id), 12e4, (hub) => void hub.submitTx(join));
	log("host.joined", {
		id,
		listen,
		key: signer.key.kind
	});
	const handle = await runNode({
		genesis,
		signer,
		deviceStatus,
		coordinators: coordinatorAddrs(dir),
		genesisAddrs: genesisAddrMap(dir),
		promotion: {
			listen: addr,
			dataDir: path.join(dir, "data"),
			onCommit: (cb) => logBlock(id, cb),
			onAlert: (m) => log("alert", {
				id,
				message: m
			}),
			onPromoted: (height) => log("host.promoted", {
				id,
				height
			})
		}
	});
	const shutdown = () => {
		closeHardwareRootSession();
		handle.stop().then(() => process.exit(0));
	};
	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
}
/** Connects as a monitor and resolves once `until` holds on the followed chain. */
async function follow(dir, until, timeoutMs, onStart) {
	const { ledger } = SwarmLedger.restore(loadGenesis(dir));
	let tipSeen = 0;
	const hub = new SwarmHub({
		id: `monitor-${process.pid}`,
		role: "monitor",
		connect: coordinatorAddrs(dir),
		ledger,
		onCommit: (cb) => {
			tipSeen = Math.max(tipSeen, cb.block.header.height);
			const r = ledger.commit(cb);
			if (!r.ok && r.code === "gap") hub.requestSync(ledger.height + 1);
		}
	});
	await hub.start();
	const deadline = Date.now() + timeoutMs;
	let started = false;
	try {
		for (;;) {
			if (!started && hub.peerCount("coordinator") > 0) {
				started = true;
				onStart?.(hub);
			}
			if (started && until(ledger, tipSeen)) return ledger;
			if (Date.now() > deadline) throw new Error("timed out waiting for the chain");
			await new Promise((r) => setTimeout(r, 100));
		}
	} finally {
		await hub.close();
	}
}
async function cmdAdmit(args) {
	await admitJob(need(args, "dir"), need(args, "job"), Number(need(args, "ranks")));
}
/** One key per rank, joins approved by the admin key, committed on chain before return. */
async function admitJob(dir, job, ranks, devices = null) {
	if (!Number.isSafeInteger(ranks) || ranks < 1) throw new Error("admit: ranks must be a positive integer");
	const genesis = loadGenesis(dir);
	const admin = loadSigner(dir, "admin-0");
	const state = {
		swarmId: genesis.swarmId,
		epoch: 0,
		rosterVersion: 0
	};
	const txs = [];
	for (let r = 0; r < ranks; r++) {
		const id = `${job}.r${r}`;
		let s;
		if (!devices && r === 0) warnSoftwareKeys(`the ${ranks} ranks of ${job}, admitted with software keys`);
		if (devices) s = fleetSigner(id, devices.fleet);
		else {
			const sw = softwareSigner(id);
			writeSecret(path.join(dir, "jobs", job, `rank-${r}.pem`), sw.privateKeyPem);
			s = sw;
		}
		const pop = await s.sign(joinDigest(genesis.swarmId, s.key));
		const tx = {
			type: "node.join",
			node: s.key,
			pop,
			approval: {
				admin: admin.key.id,
				sig: ""
			}
		};
		tx.approval.sig = await admin.sign(approvalDigest(state, tx));
		txs.push(tx);
	}
	const t0 = Date.now();
	log("job.admitted", {
		job,
		ranks,
		height: (await follow(dir, (l) => txs.every((t) => t.type === "node.join" && l.state.nodes.has(t.node.id)), 12e4, (hub) => {
			for (const tx of txs) hub.submitTx(tx);
		})).height,
		ms: Date.now() - t0
	});
}
/**
* Runs a launcher with every program it starts wrapped in `swarm rank`:
*   swarm launch --dir D --rank-bin /path/to/swarm -- mpiexec -n 28 mpi-myapp -in run.in
* becomes, after admitting 28 ranks,
*   mpiexec -n 28 /path/to/swarm rank --dir D --job J -- mpi-myapp -in run.in
* Site shims named mpiexec/mpirun/srun call this, so agents cannot start an
* unsupervised rank by forgetting the wrapper.
*/
async function cmdLaunch(args) {
	const dir = need(args, "dir");
	const rankBin = args.flags.get("rank-bin") ?? process.env.ENCLAWED_SWARM_BIN;
	if (!rankBin) throw new Error("launch: --rank-bin or ENCLAWED_SWARM_BIN must name the swarm command");
	const [launcher, ...rest] = args.rest;
	if (!launcher) throw new Error("launch: give the launcher command after --");
	const words = rest.map((text) => ({
		text,
		dynamic: false
	}));
	const req = parseLauncher(path.basename(launcher), words, {
		inAllocation: Boolean(process.env.SLURM_JOB_ID),
		inFluxJob: Boolean(process.env.FLUX_JOB_ID),
		readScript: () => null
	});
	if (!req || req.kind !== "launch" || req.programs.length === 0) throw new Error(`launch: ${launcher} does not start ranks this command can wrap`);
	if (req.problems.length > 0 || req.ranks === null) throw new Error(`launch: ${[...req.problems, req.ranks === null ? "rank count unknown" : ""].filter(Boolean).join("; ")}`);
	const job = args.flags.get("job") ?? `job-${randomBytes(4).toString("hex")}`;
	await admitJob(dir, job, req.ranks, await deviceAccess());
	const wrapper = [
		rankBin,
		"rank",
		"--dir",
		dir,
		"--job",
		job
	];
	for (const flag of [
		"on-lease-loss",
		"device-file",
		"run-dir",
		"lease-timeout-ms"
	]) {
		const v = args.flags.get(flag);
		if (v) wrapper.push(`--${flag}`, v);
	}
	wrapper.push("--");
	const argv = [...rest];
	for (const p of req.programs.toSorted((a, b) => b.offset - a.offset)) argv.splice(p.offset, 0, ...wrapper);
	log("launch", {
		job,
		ranks: req.ranks,
		launcher
	});
	const child = spawn(launcher, argv, { stdio: "inherit" });
	return new Promise((resolve) => child.on("exit", (c, sig) => resolve(c ?? (sig ? 128 : 1))));
}
async function cmdRank(args) {
	const dir = need(args, "dir");
	const job = need(args, "job");
	const ctx = launchContext();
	const id = `${job}.r${ctx.rank}`;
	const keyFile = path.join(dir, "jobs", job, `rank-${ctx.rank}.pem`);
	const devices = existsSync(keyFile) ? null : await requireDevices("rank");
	const signer = devices ? fleetSigner(id, devices.fleet) : loadSigner(dir, id, keyFile);
	const onLoss = args.flags.get("on-lease-loss") ?? "pause";
	const deviceFile = args.flags.get("device-file")?.replaceAll("{rank}", String(ctx.rank));
	let dirty = null;
	const deviceStatus = () => {
		if (!dirty && deviceFile && !existsSync(deviceFile)) dirty = "Enclaweder removed";
		if (!dirty && devices) {
			const h = devices.health();
			if (h.status === "DIRTY") dirty = h.reason ?? "Enclaweder DIRTY";
			else if (h.status === "UNAVAILABLE") return h;
		}
		return dirty ? {
			status: "DIRTY",
			reason: dirty
		} : { status: "CLEAN" };
	};
	const t0 = Date.now();
	const handle = await runNode({
		genesis: loadGenesis(dir),
		signer,
		coordinators: coordinatorAddrs(dir),
		genesisAddrs: genesisAddrMap(dir),
		deviceStatus
	});
	const leaseWait = Number(args.flags.get("lease-timeout-ms") ?? 6e4);
	while (!handle.node.check("irreversible").allowed) {
		if (Date.now() - t0 > leaseWait) {
			log("rank.no-lease", {
				id,
				decision: handle.node.check("irreversible")
			});
			await handle.stop();
			return 3;
		}
		await new Promise((r) => setTimeout(r, 50));
	}
	log("rank.leased", {
		id,
		rank: ctx.rank,
		size: ctx.size,
		ms: Date.now() - t0,
		height: handle.ledger.height
	});
	const token = randomBytes(24).toString("hex");
	const runDir = args.flags.get("run-dir") ?? path.join(process.env.XDG_RUNTIME_DIR ?? "/tmp", `enclawed-${process.getuid?.() ?? "u"}`);
	const socketPath = path.join(runDir, `${job}.r${ctx.rank}.sock`);
	let decisions = 0;
	const server = await startDecisionServer({
		socketPath,
		token,
		decide: (req) => handle.node.check(req.class),
		onDecision: (req, reply) => {
			decisions += 1;
			if (!reply.allowed) log("rank.decision.deny", {
				id,
				action: req.action,
				code: reply.code
			});
		}
	});
	const [cmd, ...cmdArgs] = args.rest;
	if (!cmd) throw new Error("rank: give the program to run after --");
	const stdio = [
		"inherit",
		"inherit",
		"inherit"
	];
	const pmiFd = Number(process.env.PMI_FD);
	if (Number.isInteger(pmiFd) && pmiFd > 2) for (let fd = 3; fd <= pmiFd; fd++) stdio[fd] = fd === pmiFd ? pmiFd : "ignore";
	const child = spawn(cmd, cmdArgs, {
		stdio,
		env: {
			...process.env,
			ENCLAWED_DECISION_SOCKET: socketPath,
			ENCLAWED_DECISION_TOKEN: token,
			ENCLAWED_SWARM_NODE: id
		}
	});
	const signalProgram = (sig) => {
		if (child.pid === void 0) return;
		signalTree(child.pid, sig);
	};
	const forward = (sig) => () => {
		signalProgram("SIGCONT");
		signalProgram(sig);
	};
	const forwarders = [
		"SIGTERM",
		"SIGINT",
		"SIGHUP"
	].map((sig) => {
		const f = forward(sig);
		process.on(sig, f);
		return [sig, f];
	});
	let paused = false;
	let killed = false;
	const watch = setInterval(() => {
		const d = handle.node.check("irreversible");
		if (d.allowed) {
			if (paused) {
				paused = false;
				signalProgram("SIGCONT");
				log("rank.resumed", { id });
			}
			return;
		}
		if (d.code === "evicted" || d.code === "device-dirty" || d.code === "halted" || onLoss === "kill") {
			if (!killed) {
				killed = true;
				log("rank.killed", {
					id,
					code: d.code,
					reason: d.reason
				});
				signalProgram("SIGKILL");
			}
		} else if (!paused) {
			paused = true;
			signalProgram("SIGSTOP");
			log("rank.paused", {
				id,
				code: d.code
			});
		}
	}, 100);
	const code = await new Promise((resolve) => child.on("exit", (c, sig) => resolve(c ?? (sig ? 128 : 1))));
	clearInterval(watch);
	for (const [sig, f] of forwarders) process.off(sig, f);
	await server.close();
	if (dirty) {
		handle.node.heartbeat();
		const until = Date.now() + 2 * handle.ledger.state.params.leaseMs;
		while (!handle.ledger.state.evicted.has(id) && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
		log("rank.reported", {
			id,
			reason: dirty,
			evictedOnChain: handle.ledger.state.evicted.has(id),
			height: handle.ledger.height
		});
	}
	await handle.stop();
	const cpu = process.cpuUsage();
	log("rank.exit", {
		id,
		code,
		decisions,
		killed,
		supervisorCpuMs: Math.round((cpu.user + cpu.system) / 1e3),
		blocks: handle.ledger.height
	});
	return killed ? 137 : code;
}
/**
* Pipes this process's stdin and stdout to one address the swarm directory
* lists. It never takes an arbitrary destination: run over SSH it must not
* become the port forwarding a site has turned off.
*/
/** This machine's Enclaweders, through Enclawed's bootstrap; null when none is present. */
async function deviceAccess() {
	return localDevices();
}
/** As deviceAccess, but a device is required. */
async function requireDevices(what) {
	const access = await deviceAccess();
	if (!access) throw new Error(`${what}: no Enclaweder is bound`);
	if (access.health().status !== "CLEAN") throw new Error(`${what}: the Enclaweder is not CLEAN (${access.health().reason ?? ""})`);
	return access;
}
/**
* Holds this machine's Enclaweders for as long as it runs: Enclawed's
* bootstrap makes the first process that boots the hardware root their owner,
* so starting this first keeps ownership with a process that stays up.
*/
async function cmdDeviceBroker(_args) {
	const root = await bootHardwareRoot();
	if (!root) throw new Error("device-broker: no Enclaweder is present");
	if (!(root instanceof HardwareRootGuard)) throw new Error("device-broker: another process already owns this machine's Enclaweders");
	log("device-broker.up", { owner: true });
	const hold = setInterval(() => void 0, 1 << 30);
	const shutdown = () => {
		clearInterval(hold);
		closeHardwareRootSession();
		process.exit(0);
	};
	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
}
async function cmdKeygen(args) {
	const id = need(args, "id");
	if (args.flags.get("device")) {
		const devices = await requireDevices("keygen");
		try {
			process.stdout.write(JSON.stringify(fleetSigner(id, devices.fleet).key) + "\n");
		} finally {
			closeHardwareRootSession();
		}
		return;
	}
	const out = need(args, "out");
	if (existsSync(out)) throw new Error(`keygen: ${out} exists; refusing to overwrite a key`);
	const s = softwareSigner(id);
	writeSecret(out, s.privateKeyPem);
	process.stdout.write(JSON.stringify(s.key) + "\n");
}
async function cmdRelay(args) {
	const dir = need(args, "dir");
	let target;
	if (args.flags.get("model")) {
		const line = readFileSync(path.join(dir, "model.txt"), "utf8").trim();
		[target] = parseHostPorts(line);
	} else {
		const addrs = coordinatorAddrs(dir);
		const i = Number(need(args, "index"));
		if (!Number.isInteger(i) || !addrs[i]) throw new Error(`relay: no coordinator ${String(i)} in ${dir}`);
		target = addrs[i];
	}
	const sock = (await import("node:net")).connect(target.port, target.host);
	return new Promise((resolve) => {
		const done = (code) => {
			sock.destroy();
			resolve(code);
		};
		sock.once("connect", () => {
			process.stdin.pipe(sock);
			sock.pipe(process.stdout);
		});
		sock.once("error", () => done(1));
		sock.once("close", () => done(0));
		process.stdin.once("end", () => done(0));
	});
}
/**
* The one interactive step of working over SSH: log in to the login node (the
* site's prompts happen here) and leave an SSH master for later sessions.
*/
async function cmdAttach(args) {
	const ssh = await import("./ssh-BOa31jb0.js");
	const target = {
		host: need(args, "ssh"),
		jump: args.flags.get("jump"),
		sshBin: args.flags.get("ssh-bin"),
		remoteSwarm: (args.flags.get("remote-swarm") ?? "enclawed swarm").split(/\s+/),
		remoteDir: args.flags.get("remote-dir") ?? "/",
		...kerberosFlags(args)
	};
	const cp = await ssh.ensureMaster(target);
	log("attach.ready", {
		host: target.host,
		controlPath: cp.path,
		fromUserConfig: cp.fromUserConfig
	});
	if (!cp.fromUserConfig) process.stderr.write("To let your own ssh commands (and the agent's) share this session, add to ~/.ssh/config:\n\n" + ssh.controlPathSnippet(target) + "\n\n");
}
/** --kinit [principal] and --forward-ticket, for sites that need Kerberos first. */
function kerberosFlags(args) {
	const kinit = args.flags.get("kinit");
	if (kinit === void 0) return {};
	return { kerberos: {
		...kinit !== "true" ? { principal: kinit } : {},
		...args.flags.get("forward-ticket") ? { forwardTicket: true } : {}
	} };
}
async function cmdStatus(args) {
	const dir = need(args, "dir");
	const genesis = loadGenesis(dir);
	let lastHeight = -1;
	let stableSince = Date.now();
	const s = (await follow(dir, (l, tipSeen) => {
		if (l.height !== lastHeight) {
			lastHeight = l.height;
			stableSince = Date.now();
		}
		return tipSeen > 0 && l.height >= tipSeen || Date.now() - stableSince > 3e3;
	}, 6e4)).state;
	process.stdout.write(JSON.stringify({
		swarmId: genesis.swarmId,
		height: s.height,
		epoch: s.epoch,
		halted: s.halted,
		coordinators: s.coordinators.map((c) => c.id),
		evicted: [...s.evicted],
		nodes: s.nodes.size,
		leases: s.leases.size
	}, null, 2) + "\n");
}
async function main(argv) {
	const [sub, ...rest] = argv;
	const args = parseArgs(rest);
	switch (sub) {
		case "init":
			await cmdInit(args);
			return 0;
		case "coordinator":
			await cmdCoordinator(args);
			return -1;
		case "admit":
			await cmdAdmit(args);
			return 0;
		case "rank": return cmdRank(args);
		case "host":
			await cmdHost(args);
			return -1;
		case "launch": return cmdLaunch(args);
		case "relay": return cmdRelay(args);
		case "keygen":
			await cmdKeygen(args);
			return 0;
		case "attach":
			await cmdAttach(args);
			return 0;
		case "device-broker":
			await cmdDeviceBroker(args);
			return -1;
		case "genesis":
			process.stdout.write(JSON.stringify(loadGenesis(need(args, "dir"))) + "\n");
			return 0;
		case "status":
			await cmdStatus(args);
			return 0;
		default:
			process.stderr.write("usage: swarm <init|coordinator|admit|launch|rank|host|status|relay|genesis|keygen|attach|device-broker> [--flags] [-- cmd]\n");
			return 2;
	}
}
if (process.argv[1] && /swarm[\\/]cli\.(ts|js)$/.test(process.argv[1])) main(process.argv.slice(2)).then((code) => {
	if (code >= 0) process.exit(code);
}, (err) => {
	log("error", { message: err instanceof Error ? err.message : String(err) });
	process.exit(1);
});
//#endregion
export { main };
