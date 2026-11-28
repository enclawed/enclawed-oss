import { E as verifyChallenge, T as verifyCert } from "./enclaweder-hid-B_ZViqzj.js";
import { d as setActiveAdminPolicy, l as getActiveAdminPolicyLoad } from "./flavor-CPDBgn8D.js";
import { r as parseHardwareRootMode, t as HardwareRootModeError } from "./root-mode-CIk3nj2e.js";
import { C as decideSessionAnchor, T as relayedAnchorDevice, Y as RootAttestError, et as verifyRootAttestation, tt as verifyRootMembers, w as RelayedAnchorReadError } from "./hardware-root-DQ2ym1zw.js";
import { n as checkHardwareRootForToolCall } from "./agent-tool-guard-CAhgsJQb.js";
import { a as unregisterServer, c as isTrustRootLocked, d as signManifest, h as parseManifest, i as registerServer, l as setTrustRoot, m as canonicalManifestBytes, o as verifyServerClearance, r as QClearedMcpClient, s as getTrustRoot, u as generateEd25519KeyPair } from "./src-jNYIxu5X.js";
import { n as decideAnchorGate } from "./launch-gates-DI7SAIxW.js";
import { i as withEnv, n as expectThat, r as installSandboxRuntime } from "./types-CPFzDBXk.js";
import { n as findRefusedEscapeHatches, r as assertSecurityStagePluginsLoaded } from "./enclaved-escape-hatches-BLUzPQT7.js";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
//#region src/enclawed/conformance/checks-platform.ts
const securityStage = {
	id: "security-stage-fail-closed",
	title: "Fail-closed security plugins",
	proves: "the gateway refuses to start when a security plugin fails to load",
	remedy: "do not start the gateway on this installation; reinstall it and report the failure to your Enclawed contact",
	async run() {
		const failed = { plugins: [{
			id: "conformance-security",
			securityStage: true,
			status: "error",
			error: "x"
		}] };
		let refused = false;
		try {
			assertSecurityStagePluginsLoaded(failed);
		} catch {
			refused = true;
		}
		expectThat(refused, "startup went ahead with a security plugin that failed to load");
		assertSecurityStagePluginsLoaded({ plugins: [{
			id: "conformance-plain",
			securityStage: false,
			status: "error",
			error: "x"
		}, {
			id: "conformance-ok",
			securityStage: true,
			status: "loaded"
		}] });
	}
};
const escapeHatches = {
	id: "escape-hatch-gate",
	title: "Escape-hatch gate",
	proves: "in the enclaved edition every setting that weakens a protection is refused unless the administrator's policy allows it",
	remedy: "do not change security settings on this installation until it is reinstalled; report the failure to your Enclawed contact",
	async run() {
		const saved = getActiveAdminPolicyLoad();
		setActiveAdminPolicy({
			admin: null,
			ignored: [],
			invalid: null
		});
		try {
			const refused = new Set(findRefusedEscapeHatches({
				gateway: { controlUi: { allowInsecureAuth: true } },
				tools: { exec: { security: "full" } }
			}, { flavor: "enclaved" }).map((r) => r.flag));
			expectThat(refused.has("gateway.controlUi.allowInsecureAuth=true") && refused.has("tools.exec.security=full"), "a weakening setting was accepted in the enclaved edition");
			expectThat(findRefusedEscapeHatches({}, {
				flavor: "enclaved",
				authMode: "none"
			}).length > 0, "turning gateway authentication off was accepted in the enclaved edition");
			expectThat(findRefusedEscapeHatches({}, { flavor: "enclaved" }).length === 0, "a configuration with no weakening settings was refused");
		} finally {
			setActiveAdminPolicy(saved);
		}
	}
};
function edKey() {
	const k = generateKeyPairSync("ed25519");
	const jwk = k.publicKey.export({ format: "jwk" });
	return {
		privateKey: k.privateKey,
		raw: Buffer.from(jwk.x, "base64url")
	};
}
const CHECKS = [
	securityStage,
	escapeHatches,
	{
		id: "hardware-root-host-checks",
		title: "Hardware root, host side",
		proves: "the host refuses a device certificate that is forged or belongs to another device, a challenge answer from the wrong device, a forged status report and an ambiguous hardware-root setting; with the hardware root required and none bound, every tool call is refused",
		remedy: "do not rely on the hardware root on this installation; reinstall it and report the failure to your Enclawed contact",
		async run() {
			const root = edKey();
			const dev = edKey();
			const uid = randomBytes(12);
			const body = Buffer.concat([
				Buffer.from([1]),
				uid,
				dev.raw,
				Buffer.from([1, 0]),
				Buffer.alloc(4),
				createHash("sha256").update(root.raw).digest().subarray(0, 4)
			]);
			const cert = Buffer.concat([body, sign(null, body, root.privateKey)]);
			expectThat(verifyCert(cert, uid, dev.raw, root.raw), "a genuine test certificate was refused");
			expectThat(verifyCert(cert, randomBytes(12), dev.raw, root.raw) === null, "a certificate for another device was accepted");
			const forged = Buffer.from(cert);
			forged[100] ^= 1;
			expectThat(verifyCert(forged, uid, dev.raw, root.raw) === null, "a forged certificate was accepted");
			const nonce = randomBytes(32);
			const answer = sign(null, Buffer.concat([
				Buffer.from("ECW-CHALLENGE-01"),
				nonce,
				uid
			]), dev.privateKey);
			expectThat(verifyChallenge(dev.raw, nonce, uid, answer), "a genuine challenge answer was refused");
			expectThat(!verifyChallenge(dev.raw, nonce, randomBytes(12), answer), "a challenge answer from another device was accepted");
			const member = {
				uid: uid.toString("hex"),
				pubkey: dev.raw.toString("hex")
			};
			let forgedMember = false;
			try {
				verifyRootMembers([{
					...member,
					cert: forged.toString("hex")
				}], root.raw);
			} catch (err) {
				forgedMember = err instanceof RootAttestError;
			}
			expectThat(forgedMember, "a device with a forged certificate was accepted as a member");
			const members = verifyRootMembers([{
				...member,
				cert: cert.toString("hex")
			}], root.raw);
			let forgedStatus = false;
			try {
				verifyRootAttestation(members, nonce, {
					nonces: [randomBytes(32).toString("hex")],
					members: [{
						uid: uid.toString("hex"),
						latch: "00"
					}]
				});
			} catch (err) {
				forgedStatus = err instanceof RootAttestError;
			}
			expectThat(forgedStatus, "a forged device status report was accepted");
			for (const bad of [
				"Required",
				" required",
				"1",
				"true",
				"off"
			]) {
				let refused = false;
				try {
					parseHardwareRootMode(bad);
				} catch (err) {
					refused = err instanceof HardwareRootModeError;
				}
				expectThat(refused, `the ambiguous hardware-root setting ${JSON.stringify(bad)} was accepted`);
			}
			installSandboxRuntime("enclaved");
			await withEnv({ ENCLAWEDER_ROOT: "required" }, async () => {
				const decision = checkHardwareRootForToolCall("read");
				expectThat(!decision.allowed && decision.code === "hardware-required-missing", "a tool call ran with the hardware root required and none bound");
			});
		}
	},
	{
		id: "hardware-root-session-anchor",
		title: "A session bound to the hardware root anchors with authentication or does not start",
		proves: "a session bound to a hardware root whose device can only anchor without authentication, or not at all, is refused, and so is a launch with the root required and no device; the anchor relayed through the machine's owner opens only against the certified primary key, refuses on a root that is not CLEAN, and never reports a relayed read as fresh",
		remedy: "do not start sessions on this installation; reinstall it and report the failure to your Enclawed contact",
		async run() {
			const pub = randomBytes(32);
			const bare = decideSessionAnchor({
				bound: true,
				device: {
					anchorSet: async () => null,
					anchorGet: async () => null
				},
				devicePublicKey: pub
			});
			expectThat(!bare.ok && bare.code === "anchor-unauthenticated", "a bound session was allowed to anchor without authentication");
			expectThat(!decideSessionAnchor({
				bound: true,
				device: null,
				devicePublicKey: pub
			}).ok, "a bound session with no anchor at all was allowed");
			const af = "/conformance/audit.jsonl.enclaweder-anchor";
			expectThat(!decideAnchorGate({
				device: { canAnchor: false },
				rootRequired: false,
				anchorFile: af,
				anchorFilePresent: false
			}).ok, "a launch with a device that cannot anchor was allowed");
			expectThat(!decideAnchorGate({
				device: null,
				rootRequired: true,
				anchorFile: af,
				anchorFilePresent: false
			}).ok, "a launch with the hardware root required and no device was allowed");
			const member = {
				uid: randomBytes(12).toString("hex"),
				pubkey: pub.toString("hex"),
				serial: "conformance",
				cert: "00",
				sku: "base"
			};
			let health = { status: "CLEAN" };
			let relayed = 0;
			const root = {
				members: [member],
				relayAnchor: async () => {
					relayed++;
					return Buffer.from([0]);
				}
			};
			const dev = relayedAnchorDevice(root, () => health);
			expectThat(dev !== null, "the relayed anchor was not offered on a CLEAN root");
			let otherKey = false;
			try {
				await dev.anchorOpen(randomBytes(32));
			} catch {
				otherKey = true;
			}
			expectThat(otherKey && relayed === 0, "a relayed anchor session opened against an uncertified key");
			let stale = false;
			try {
				await dev.anchorGet();
			} catch (err) {
				stale = err instanceof RelayedAnchorReadError;
			}
			expectThat(stale, "a relayed anchor read was reported as fresh");
			health = {
				status: "DIRTY",
				reason: "conformance"
			};
			let dirty = false;
			try {
				await dev.anchorOpen(pub);
			} catch {
				dirty = true;
			}
			expectThat(dirty && relayed === 0, "a relayed anchor session opened on a DIRTY root");
			expectThat(relayedAnchorDevice(root, () => health) === null, "the relayed anchor was offered on a DIRTY root");
		}
	},
	{
		id: "hardware-root-device",
		title: "Hardware root, device side",
		proves: "the attached Enclaweder itself behaves as specified",
		remedy: "contact your Enclawed representative",
		async run() {
			return { skip: "not checked here: this command never opens a hardware device; device-side guarantees are verified with the device's own test procedure" };
		}
	},
	{
		id: "mcp-attested-admission",
		title: "MCP server admission",
		proves: "an MCP server whose clearance statement is unsigned, forged or signed by an unknown signer is not admitted, and a tool outside a server's admitted list is refused without any network call",
		remedy: "do not connect MCP servers to this installation until it is reinstalled; report the failure to your Enclawed contact",
		async run() {
			const { publicKey, privateKey } = generateEd25519KeyPair();
			const base = {
				v: 1,
				id: "conformance.server",
				publisher: "conformance",
				version: "1.0.0",
				clearance: "restricted-plus",
				capabilities: ["mcp-server"],
				signerKeyId: "conformance-signer"
			};
			const signed = {
				...base,
				signature: signManifest(canonicalManifestBytes(parseManifest(base)), privateKey)
			};
			const serve = (doc) => async () => ({
				ok: true,
				status: 200,
				json: async () => doc
			});
			const url = "https://conformance.invalid";
			expectThat(!(await verifyServerClearance(url, "restricted-plus", serve(base))).ok, "an unsigned clearance statement was accepted");
			expectThat(!(await verifyServerClearance(url, "restricted-plus", serve(signed))).ok, "a statement from a signer outside the trust root was accepted");
			if (!isTrustRootLocked()) {
				const saved = getTrustRoot();
				setTrustRoot([{
					keyId: "conformance-signer",
					publicKeyPem: publicKey,
					approvedClearance: [
						"public",
						"internal",
						"confidential",
						"restricted",
						"restricted-plus"
					],
					description: "conformance"
				}]);
				try {
					expectThat((await verifyServerClearance(url, "restricted-plus", serve(signed))).ok, "a correctly signed clearance statement was refused");
					expectThat(!(await verifyServerClearance(url, "restricted-plus", serve({
						...signed,
						clearance: "restricted"
					}))).ok, "a tampered clearance statement was accepted");
				} finally {
					setTrustRoot(saved);
				}
			}
			installSandboxRuntime("enclaved");
			let calls = 0;
			const id = `conformance.mcp.${process.pid}`;
			registerServer({
				id,
				bridge: "conformance",
				endpoint: `${url}/mcp`,
				requiredClearance: "internal",
				allowedTools: ["list_labels"],
				transport: { call: async () => {
					calls += 1;
					return {
						ok: true,
						result: {}
					};
				} }
			});
			try {
				expectThat(!(await new QClearedMcpClient({
					requiredClearance: "internal",
					override: { ok: true }
				}).invoke({
					serverUrl: `${url}/mcp`,
					toolName: "delete_everything",
					arguments: {}
				})).ok && calls === 0, "a tool outside the admitted list was called");
			} finally {
				unregisterServer(id);
			}
		}
	}
];
//#endregion
export { CHECKS };
