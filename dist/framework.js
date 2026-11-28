import { r as __exportAll } from "./chunk-iyeSoAlh.js";
import { n as resolveDefaultConfigPath } from "./workspace-dir-CwLpjIOc.js";
import { n as scan, t as redact } from "./dlp-scanner-CAEHT3p2.js";
import { r as setRuntime, t as clearRuntime } from "./runtime-Dt7e6nAN.js";
import { C as verifyAnchorV2, E as verifyChallenge, O as LIVE_DEVICE_TEST_ACK, S as verifyAnchorRecord, T as verifyCert, a as ANCHOR_OPEN_TIMEOUT_MS, c as AnchorAuthError, g as busyWaitMs, j as underTestRunner, k as LIVE_DEVICE_TEST_ENV, l as AnchorSession, n as ANCHOR_KEEPALIVE_INTERVAL_MS, o as ANCHOR_STATUS, r as ANCHOR_LEASE_MS, v as parseAnchor, x as verifyAnchor } from "./enclaweder-hid-B_ZViqzj.js";
import { c as proveCommandSet05, i as deviceFactorActivations, l as spendActivation, n as CS05_REFLASH_RUNBOOK, o as parseBinding, r as bindingNames, s as peekActivation, u as verifyAnchorRead } from "./activation-CjSFhqw4.js";
import { t as CLOCK_DISAGREES_TEXT } from "./clock-disagrees-text-B9EMsSXG.js";
import { i as deviceTotpVerdict, o as verifyVerdictRecord, r as deviceTotpEnrolled } from "./totp-verify-Dcx-evp7.js";
import { o as checkRootOwnedFile, r as SYSTEM_POLICY_DIR, t as getFlavor } from "./flavor-CPDBgn8D.js";
import { A as gitTrackingOf, B as untrustedBinaryReason, C as repositoryEnvMessage, D as execConfigInodeMatch, E as comparablePath, F as pathWords, H as writeProtectedInodeIndex, I as protectedInodeIndex, L as realpathNearestSync, N as isProtectedPath, O as expandHome, P as nodeFsProbe, R as systemBinaryUids, S as referencedFilesIn, T as staleHookGrants, U as gitCommandStarts, W as gitProgramsOf, _ as expandHookWords, b as hostEnvExtra, c as LOADER_INJECTION_ENV, d as changesShellCommands, f as classifyEnv, g as decideRepositoryEnv, h as decideHooks, j as isInside, k as gitConfigRiskOf, l as REFUSED_ENV_CLASSES, m as credentialLike, o as secretContentOf, s as KNOWN_HOST_ENV, u as canonicalOf, v as hookDigest, w as scrubLoaderEnv, x as recordableEnvValue, y as hooksMessage, z as trustedBinary } from "./audit-redact-C28uLnOv.js";
import { a as COVERED, c as cleanText, i as textOf, n as sanitizeText, r as showPath, s as WITHHELD_MARKER, t as quoteUntrusted, u as neutralizeNotices } from "./untrusted-CVKPzaNH.js";
import { a as verifyHistory, i as verifyChain, n as buildRecord, t as AuditLogger } from "./audit-log-B0xJdvPI.js";
import { a as createPolicy, d as makeLabel, o as defaultEnclavedPolicy, s as defaultOpenPolicy, u as format } from "./policy-B_YSjRFl.js";
import { c as extractPolicyBlock, l as loadPolicyFromJson, s as tightenPolicy, u as parsePolicyJson } from "./boot-posture-916uQMBO.js";
import { i as verifyManifestSignature, n as generateEd25519KeyPair, r as signManifest, t as bootstrapEnclawed } from "./bootstrap-D6lzXmyI.js";
import { i as installRawSocketGuard, r as installEgressGuard, t as EgressDeniedError } from "./egress-guard-BhEVaiEm.js";
import { $ as connectRoot, A as grantUnlock, B as sealedTotpVerdict, C as decideSessionAnchor, D as deriveDeviceKey, E as KEY_DERIVE_RESIDUAL, F as readDeviceEntropy, H as takeoverByFactors, I as readIdentityLog, J as verifyForensicLog, K as setForensicAuditSink, L as readUnlock, M as openSeal, N as parseIdentityLog, O as FactorError, P as parseUnlockBody, Q as brokerSocketPath, R as revokeUnlock, S as SessionAnchorRefused, U as takeoverFidoChallenge, V as spendUnlock, W as verifyUnlockReceipt, X as RootHaltError, Y as RootAttestError, Z as brokerDisabled, _ as hardwareRootTotpDevice, a as closeHardwareRootSession, et as verifyRootAttestation, g as hardwareRootStatusStandalone, h as hardwareRootSigningDevice, i as bootHardwareRoot, j as identityFingerprint, k as TakenSession, l as hardwareRootInfo, m as hardwareRootSigning, n as assertHardwareClean, o as closeHardwareRootSessionAsync, p as hardwareRootSessionAnchor, r as attestHardwareRoot, s as hardwareRootCommandSet, tt as verifyRootMembers, u as hardwareRootKeyDerivation, v as recoverHardwareRootStandalone, y as requireHardwareRootSessionAnchor, z as sealFrame } from "./hardware-root-DQ2ym1zw.js";
import { a as CAPABILITY, c as isReversible, d as projectionKey, f as canonicalEgressTarget, g as urlWithinEgressTarget, h as parseEgressTarget, i as ALL_CAPABILITIES, l as makeCall, m as egressTargetString, p as egressTargetDestination, s as isIrreversible, u as makeEgressCall } from "./tool-capability-map-BAuf7O3V.js";
import { a as diagnoseHardwareRoot, i as typedSerialUid, n as hardwareRootRecoverCli, o as renderHardwareRootDiagnosis, r as hardwareRootStatusCli } from "./recover-cli-DafhZFzQ.js";
import { i as wslUsbSetupCli, n as isWslHost } from "./wsl-usb-cli-B8v7K8Ve.js";
import { a as launchRootClaimsInFiles, i as launchRootClaims, n as decideAuditAnchorVerdict, r as deviceFactorActivationsInFiles, t as boundAnchorRefusal } from "./audit-anchor-verdict-bw0fMcvY.js";
import { i as resolveHistoryDir, n as HistoryTamperedError, t as HistoryStore } from "./history-store-BftDQjow.js";
import { n as checkHardwareRootForToolCall, s as prepareFsWriteHistory } from "./agent-tool-guard-CAhgsJQb.js";
import { n as restoreSnapshot, t as RestoreError } from "./history-restore-CIxBK1-H.js";
import { a as mcpToolDefinitionDigest, i as describeMcpToolDrift, n as canonicalJson, o as pinMcpToolDefinitions, r as checkMcpToolDefinitions, t as McpToolPinSet } from "./mcp-tool-pins-5oKDb46g.js";
import { a as resolveUrlResource, i as resolveFsResource, n as approvalArgsDigest, r as describeResourceChange, t as ApprovalGrantLedger } from "./approval-binding-DJpS6Wuh.js";
import { f as signManifest$1, i as registerServer, n as HttpJsonRpcTransport, p as verifyManifestSignature$1, r as QClearedMcpClient } from "./src-jNYIxu5X.js";
import { r as loadGoogleWorkspaceBridge, t as GOOGLE_WORKSPACE_ENDPOINTS } from "./src-DGrLXQQb.js";
import { n as loadImapSmtpBridge, t as IMAP_SMTP_TOOLS } from "./src-DmBAU2Et.js";
import { n as loadCalDavBridge, t as CALDAV_TOOLS } from "./src-Dym0MuIB.js";
import { n as loadCardDavBridge, t as CARDDAV_TOOLS } from "./src-DGdypva0.js";
import { $ as createEgressRunner, F as mediateMediaBatch, c as createActionBatcher, dt as getEgressStages, et as runEgressPipeline, f as resolveActionBatcherOptions, ft as registerEgressStage, lt as createLedgerStore, nt as STAGE_IDS, ot as resolveStageMode, tt as DEFAULT_STAGE_MODES, y as classifyActionIdempotency } from "./src-Bv_GP2Sj.js";
import { t as buildCanonicalizerStage } from "./stage-jNiIyhjX.js";
import "./api-CqhWkA5V.js";
import { a as sharedTaintStore, i as createTaintStore, n as buildTaintTrackerStage, o as tagSensitiveValue, r as TAINT_SCOPE_ALL } from "./config-LnNnllfP.js";
import "./api-Dos50wTN.js";
import { t as buildEntropyScannerStage } from "./stage-TI2baWQU.js";
import "./api-CK0pu8n7.js";
import { t as buildReplaySentinelStage } from "./stage-D3ulpsht.js";
import "./api-OZFKehRl.js";
import { t as buildNoiseInjectorStage } from "./stage-ylDcVxOU.js";
import "./api-DOZJwBjd.js";
import { t as buildSemanticScramblerStage } from "./stage-Ctba9jJL.js";
import "./api-D847m7VJ.js";
import { t as buildTimingScramblerStage } from "./stage-D0_TfKl3.js";
import "./api-Cdmze72B.js";
import { t as buildBehavioralInvariantsStage } from "./stage-Iej9KRC9.js";
import "./api-B7lJKn1J.js";
import { c as removeSecurityKey, d as unlockForHeadlessStart, f as loadAuthConfig, i as assertSecondFactor, l as revokeUnlockTicket, n as ENROLL_INSTRUCTIONS, o as enrollPasskey, p as parseAuthConfig, r as SecondFactorError, s as enrollSecurityKey, t as DEFAULT_RP_ID, u as secondFactorStatus } from "./gate-DSRB75ux.js";
import "./auth-DTwOVaH5.js";
import { $ as EXEC_CONFIG_NAMES, J as memoryVenvTrustStore, Q as venvTrustFile, Z as venvFingerprint, at as isExecConfigPath, lt as REASON_PREFIX, q as fileVenvTrustStore, rt as isBuildFilePath } from "./exec-caches-FmW8zVgK.js";
import { $ as personUrlsOf, $n as watchProject, $t as loadMcpProgram, A as resolveShellDefinitions, An as projectDigest, Ar as CommitmentFieldError, At as canonical, B as SECRET_LINE_PLACEHOLDER, Bn as FileIntegrityLedger, Br as verifyCallChain, Bt as uvEnvironmentSynced, C as simpleWords, Cn as deviceSecondFactor, Cr as classifyShellCommand, Ct as localCodeProblem, D as NO_SHELL_DEFINITIONS, Dn as haltOutcome, Dr as conservativeShellClassifier, Dt as parseEnvFile, E as contentDigest, En as frameworkEnv, Er as parseOptions, Et as packageRootOf, F as completeConflictResolution, Fn as unlockJobDigest, Fr as evidenceCovers, Ft as normName, G as secretFilesBelow, Gn as execClassOf, Gt as sha256File, H as projectSecretValues, Hn as bracketsAuditedAction, Hr as parseCompound, Ht as verifySitePackages, I as fileHoldStore, In as unlockScope, Ir as policyDigestOf, It as parseRecord, J as unverifiedProgramIn, Jn as fileIntegrityLedger, Jt as REFERENCE_ARGUMENT_ROLES, K as secretValuesOf, Kn as fileIntegrityAskRule, Kt as treeDigest, L as handleRepoConfigEvent, Ln as unlockTicketBinding, Lr as recordCall, Lt as readJson$1, M as shadowedCommandIn, Mn as shellFlavor, Mr as canonicalPolicy, Mt as denoLockedNpm, N as approveConflictResolution, Nn as spendDeviceUnlock, Nr as commitmentFields, Nt as denoLockedRemote, O as containedCommandLine, On as issueDeviceUnlock, Or as historyAgentId, Ot as pythonModuleFiles, P as askConflictResolution, Pn as stricterFlavor, Pr as encodeCallCommitment, Pt as denoRemoteCacheFile, Q as normalizePersonUrl, Qn as snapshotProject, Qt as MCP_ARGUMENT_ROLES, R as memoryHoldStore, Rn as FILE_CHANGED_CODE, Rr as replayDecision, Rt as sha256$2, S as selectWorkflow, Sn as deviceActivation, Sr as classifyPowerShellCommand, St as localCodeOf, T as attributeSkillCall, Tn as frameworkDeviceTotp, Tr as strictShellClassifier, Tt as measureLocalCode, U as redactProjectSecrets, Un as changeSummary, Ut as cachedSha256, V as SECRET_VALUE_PLACEHOLDER, Vn as GIT_COMMIT_ACCEPTS_CODE, Vr as auditedActionScope, Vt as uvLockPackages, W as redactProjectSecretsIn, Wn as entryOf, Wt as filesDigest, X as isPersonNamedCurl, Xn as memoryFileIntegrityLedger, Xt as isArgumentRoles, Y as unverifiedProgramOf, Yn as inIntegrityScope, Yt as checkArgumentRoles, Z as isPersonNamedUrl, Zn as sameEntry, Zt as untrackedOverwrite, _ as parseProfile, _n as HALT_SEQUENCE, _r as programOf, _t as pinnedCopy, a as containedWriteRefused, an as hostPromptHold, ar as downloadedFiles, at as mcpRecordProblems, b as pathGlobRegExp, bn as bindHardwareRoot, br as classifyArgv, bt as admitHost, c as summarizeAction, cn as compareHostMode, cr as runsTainted, ct as CLEANER_MODES$1, d as READ_ONLY, dn as HANDLE_PLACEHOLDER, dr as taintViewOf, dt as cleanerNotice, en as mcpCallEffects, er as MAX_KEPT_BYTES, et as McpSession, f as TOOL_CLASSES, fn as commandNamesHandle, fr as archiveMembers, ft as codePinProblem, g as describeProfile, gn as FRAMEWORK_ENV_ALLOW, gr as WRAPPERS$1, gt as npxInstalls, h as commandMatches, hn as redactHandles, hr as execProvenance, ht as npmCacheDir, i as auditText, in as hostMaySelfApprove, ir as TaintView, it as mcpDefinitionDigest, j as shadowOf, jn as resolveHardwareRootMode, jr as callCommitment, jt as denoLockOf, k as exportedFunctionNames, kn as launchContained, kr as CALL_COMMITMENT_DOMAIN, kt as resolveCommand, l as validatePreAction, ln as isPersonHeldMode, lr as settleTaint, lt as NOTICE_CONTEXT, m as boundWorkflow, mn as hostEnvironment, mr as AGENT_HOSTS, mt as measureNpxPackage, n as MalformedEventError, nn as askAtHostPrompt, nr as dirContentStore, nt as defaultMcpNormalizer, o as decidePreAction, on as hostSelfApproval, or as fileTaintStore, ot as mcpServerInfoProblem, p as allProfiles, pn as destinationAllowed, pr as fileDigest, pt as codeResolution, q as programWords, qn as fileIntegrityDenyRule, qt as treeHashCache, r as auditDigest, rn as completeHostPromptAsk, rr as memoryContentStore, rt as inspectMcpToolDefinition, s as inputDigest, sn as revertibleTargets, sr as memoryTaintStore, st as mcpToolSetProblems, t as DecisionEngine, tn as mcpEffectVerdict, tr as MAX_KEPT_FILE_BYTES, tt as admitMcpServers, u as BUILTIN_WORKFLOWS, un as personHeldModes, ur as taintEffects, ut as cleanToolResult, v as parseWorkflowOptions, vn as activateSession, vr as segments, vt as pythonRunnerForm, w as workflowVerdict, wn as eraseCredentials, wr as splitSimpleCommand, wt as measureHostBinary, x as profileDigest, xn as decideHaltNets, xr as classifyCompound, xt as localCodeLaunch, y as pathAllowed, yn as assessContainment, yr as abbreviatesRefused, yt as TREE_INTEGRITY_PREFIX, z as repoConfigHoldReason, zn as FILE_CHANGED_EXEC_CODE, zr as signatureLink, zt as sitePackagesIn } from "./engine-YHHWrBt2.js";
import { _ as createRemoteMcpClient, a as bindingMatches, c as decisionViolation, d as approvalEffect, f as effectWord, g as checkServerUrl, h as checkOAuthEndpoint, i as askWithinTimeout, l as approvalCode, m as RemoteMcpError, n as ApprovalLedger, o as bindingOf, p as normalizeConfirmation, r as approvalHookTimeoutS, s as callDigest, t as APPROVAL_TIMEOUT_MS, u as approvalConfirmation } from "./approval-eg59vk1u.js";
import { a as commandReachesCredential, c as dumpsEnvironment, d as privateKeyShaped, i as SHAPE_CHECKED_EXT, m as redactCredentialsIn, n as HOME_CREDENTIAL_PATHS, o as credentialFindings, p as redactCredentials, r as KEY_DIRECTORIES, s as credentialPathOf, t as CREDENTIAL_FORMATS } from "./credentials-CHO-pQ-F.js";
import { S as createContainerCa, a as containProjectScript, i as containPackageInstall, o as containSkillRun, p as containmentSupport, r as containMcpServer } from "./mcp-DCNWYsrE.js";
import { t as privateSocketDir } from "./unix-socket-dir-Dvuh8bE0.js";
import { t as containment_exports } from "./containment-Dr0Oif3o.js";
import { a as findHostOperatorKeys, c as parseOfflineSignature, d as watchErased, i as eraseWatchSchedule, l as reachableHidrawNodes, n as decideAnchorGate, o as isEd25519PrivateKeyFile, r as decideOperatorAuthorization, s as offlineSignerCount, t as anchorGateMessage, u as userNamespaceDeviceRisk } from "./launch-gates-DI7SAIxW.js";
import { a as correctOutcomes, c as reviewOf, i as REVIEW_TRUTH_CLASS, l as reviewPrompt, n as REVIEW_LABELS, o as parseReviewAnswer, r as REVIEW_MAX_TEXT, s as prepareReviewText, t as REVIEW_DEFINITIONS, u as runReview } from "./review-judge-DKXcdnfZ.js";
import { n as runConformanceChecks, t as renderConformanceReport } from "./conformance-BRfkmXTV.js";
import { n as adapterChecks, r as loadConformanceAdapter, t as ADAPTER_CASE_IDS } from "./checks-adapter-D47OsEfo.js";
import fs, { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import { readFile, rename, writeFile } from "node:fs/promises";
import { createCipheriv, createDecipheriv, createHash, createHmac, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import net from "node:net";
import { Duplex } from "node:stream";
import http from "node:http";
import https from "node:https";
import { inflateRawSync } from "node:zlib";
import tls from "node:tls";
import YAML from "yaml";
//#region src/enclawed/skill-manifest.ts
const VERIFICATION = Object.freeze({
	UNVERIFIED: "unverified",
	DECLARED: "declared",
	TESTED: "tested",
	FORMAL: "formal"
});
Object.freeze({
	unverified: 0,
	declared: 1,
	tested: 2,
	formal: 3
});
//#endregion
//#region src/enclawed/skill-gate.ts
var TransactionBuffer = class {
	constructor() {
		this.entries = [];
	}
	record(entry) {
		this.entries.push(entry);
	}
	async rollbackAll() {
		while (this.entries.length > 0) {
			const e = this.entries.pop();
			if (!e) break;
			try {
				await e.rollback();
			} catch {}
		}
	}
	size() {
		return this.entries.length;
	}
};
var SkillGate = class {
	constructor(opts) {
		this.active = /* @__PURE__ */ new Map();
		this.declaredKeys = /* @__PURE__ */ new Map();
		this.audit = opts.audit;
		this.broker = opts.broker;
		this.txn = opts.txn ?? new TransactionBuffer();
	}
	loadSkill(manifest) {
		this.active.set(manifest.id, manifest);
		const keys = /* @__PURE__ */ new Set();
		for (const c of manifest.caps) keys.add(c);
		this.declaredKeys.set(manifest.id, keys);
	}
	unloadAll() {
		this.active.clear();
		this.declaredKeys.clear();
	}
	isLoaded(skillId) {
		return this.active.has(skillId);
	}
	async dispatch(input) {
		assertHardwareClean();
		const manifest = this.active.get(input.skillId);
		if (!manifest) return this.denied(input.call, "skill not loaded");
		const declared = this.declaredKeys.get(input.skillId);
		const requestId = randomUUID();
		if (isReversible(input.call.cap)) return this.executeReversible(requestId, manifest, input);
		const v = manifest.verification;
		const inDeclared = declared.has(input.call.cap);
		if (v === VERIFICATION.UNVERIFIED) return this.executeIrreversibleViaBroker(requestId, manifest, input);
		if ((v === VERIFICATION.DECLARED || v === VERIFICATION.TESTED || v === VERIFICATION.FORMAL) && inDeclared) return this.executeIrreversibleDirect(requestId, manifest, input);
		return this.executeIrreversibleViaBroker(requestId, manifest, input);
	}
	async executeReversible(requestId, manifest, input) {
		await this.audit.append({
			type: "reversible.request",
			actor: input.skillId,
			level: format(manifest.label),
			payload: {
				requestId,
				call: callPayload(input.call),
				projection: projectionKey(input.call)
			}
		});
		try {
			const res = await input.execute(input.call);
			if (res.ok) {
				if (input.rollback) this.txn.record({
					requestId,
					call: input.call,
					rollback: input.rollback
				});
				await this.audit.append({
					type: "reversible.executed",
					actor: input.skillId,
					level: format(manifest.label),
					payload: {
						requestId,
						call: callPayload(input.call),
						projection: projectionKey(input.call),
						ok: true,
						hardwareRoot: hardwareRootInfo()
					}
				});
				return {
					kind: "executed",
					requestId,
					call: input.call
				};
			}
			await this.audit.append({
				type: "reversible.error",
				actor: input.skillId,
				level: format(manifest.label),
				payload: {
					requestId,
					call: callPayload(input.call),
					reason: res.reason
				}
			});
			return {
				kind: "error",
				requestId,
				call: input.call,
				reason: res.reason
			};
		} catch (err) {
			const reason = err.message;
			await this.audit.append({
				type: "reversible.error",
				actor: input.skillId,
				level: format(manifest.label),
				payload: {
					requestId,
					call: callPayload(input.call),
					reason
				}
			});
			return {
				kind: "error",
				requestId,
				call: input.call,
				reason
			};
		}
	}
	async executeIrreversibleViaBroker(requestId, manifest, input) {
		await this.audit.append({
			type: "irreversible.request",
			actor: input.skillId,
			level: format(manifest.label),
			payload: {
				requestId,
				call: callPayload(input.call),
				projection: projectionKey(input.call)
			}
		});
		const brokerReq = Object.freeze({
			requestId,
			call: input.call,
			skillId: input.skillId,
			ts: Date.now()
		});
		const decision = await this.broker.decide(brokerReq);
		await this.audit.append({
			type: "irreversible.decision",
			actor: input.skillId,
			level: format(manifest.label),
			payload: {
				requestId,
				call: callPayload(input.call),
				decision: decision.decision,
				broker: this.broker.id,
				reason: decision.reason ?? null
			}
		});
		if (decision.decision === "deny") return {
			kind: "denied",
			requestId,
			call: input.call,
			reason: decision.reason ?? "denied"
		};
		return this.runIrreversible(requestId, manifest, input);
	}
	async executeIrreversibleDirect(requestId, manifest, input) {
		await this.audit.append({
			type: "irreversible.request",
			actor: input.skillId,
			level: format(manifest.label),
			payload: {
				requestId,
				call: callPayload(input.call),
				projection: projectionKey(input.call),
				path: "verified-declared"
			}
		});
		await this.audit.append({
			type: "irreversible.decision",
			actor: input.skillId,
			level: format(manifest.label),
			payload: {
				requestId,
				call: callPayload(input.call),
				decision: "approve",
				broker: "verification:" + manifest.verification,
				reason: "covered by manifest caps at verification level " + manifest.verification
			}
		});
		return this.runIrreversible(requestId, manifest, input);
	}
	async runIrreversible(requestId, manifest, input) {
		try {
			const res = await input.execute(input.call);
			if (res.ok) {
				await this.audit.append({
					type: "irreversible.executed",
					actor: input.skillId,
					level: format(manifest.label),
					payload: {
						requestId,
						call: callPayload(input.call),
						projection: projectionKey(input.call),
						ok: true,
						hardwareRoot: hardwareRootInfo()
					}
				});
				return {
					kind: "executed",
					requestId,
					call: input.call
				};
			}
			await this.audit.append({
				type: "irreversible.error",
				actor: input.skillId,
				level: format(manifest.label),
				payload: {
					requestId,
					call: callPayload(input.call),
					reason: res.reason,
					ok: false
				}
			});
			return {
				kind: "error",
				requestId,
				call: input.call,
				reason: res.reason
			};
		} catch (err) {
			const reason = err.message;
			await this.audit.append({
				type: "irreversible.error",
				actor: input.skillId,
				level: format(manifest.label),
				payload: {
					requestId,
					call: callPayload(input.call),
					reason,
					ok: false
				}
			});
			return {
				kind: "error",
				requestId,
				call: input.call,
				reason
			};
		}
	}
	async denied(call, reason) {
		const requestId = randomUUID();
		await this.audit.append({
			type: "irreversible.decision",
			actor: "gate",
			level: null,
			payload: {
				requestId,
				call: callPayload(call),
				decision: "deny",
				broker: "gate",
				reason
			}
		});
		return {
			kind: "denied",
			requestId,
			call,
			reason
		};
	}
	txnBuffer() {
		return this.txn;
	}
	classify(call) {
		return isIrreversible(call.cap) ? "irreversible" : "reversible";
	}
};
function callPayload(call) {
	return {
		cap: call.cap,
		target: call.target,
		args: call.args ?? null
	};
}
//#endregion
//#region src/enclawed/hardware-root/head-anchor.ts
var HeadAnchorAlarm = class extends Error {
	constructor(code, detail, waitMs = null) {
		super(`audit anchor alarm (${code === "ANCHOR_SESSION_BUSY" ? "session busy" : "session hijacked"}): ${detail}`);
		this.name = "HeadAnchorAlarm";
		this.code = code;
		this.waitMs = waitMs;
	}
};
function busyAlarm(waitMs) {
	return new HeadAnchorAlarm("ANCHOR_SESSION_BUSY", `the device already has an anchor session open: something else on this host holds the audit anchor, or a previous run crashed without closing; ${waitMs === null ? "this firmware has no session lease: replug the device to clear a crashed holder" : `its lease ends in ${Math.ceil(waitMs / 1e3)} s if the holder stops renewing (a crashed logger is cleared then, no replug); to recover now, an operator quorum can take the channel over`}`, waitMs);
}
var HeadAnchorTampered = class extends Error {
	constructor(reason, code = "invalid") {
		super(`head anchor failed verification: ${reason}`);
		this.name = "HeadAnchorTampered";
		this.code = code;
	}
};
const HEX64$3 = /^[0-9a-f]{64}$/;
const DEC$1 = /^\d{1,20}$/;
function decode(raw) {
	let stored;
	try {
		stored = JSON.parse(raw);
	} catch {
		throw new HeadAnchorTampered("not valid JSON");
	}
	if (typeof stored.head !== "string" || !HEX64$3.test(stored.head)) throw new HeadAnchorTampered("head is not a 64-char hex hash");
	if (typeof stored.counter !== "string" || !DEC$1.test(stored.counter)) throw new HeadAnchorTampered("counter is missing or not a decimal integer");
	if (stored.version !== void 0 && stored.version !== 1 && stored.version !== 2 && stored.version !== 3) throw new HeadAnchorTampered("unknown record version");
	if (stored.version === 3 && (typeof stored.bind !== "string" || !HEX64$3.test(stored.bind))) throw new HeadAnchorTampered("v3 record is missing its binding");
	if (stored.version === 2 || stored.version === 3) {
		if (typeof stored.sess !== "string" || !DEC$1.test(stored.sess) || typeof stored.opens !== "string" || !DEC$1.test(stored.opens)) throw new HeadAnchorTampered("v2 record is missing its session or open count");
	}
	if (stored.sessions !== void 0 && (!Array.isArray(stored.sessions) || !stored.sessions.every((x) => typeof x === "string" && DEC$1.test(x)))) throw new HeadAnchorTampered("session list is malformed");
	return stored;
}
/** How many of this logger's session ids the stored copy remembers. */
const MAX_REMEMBERED_SESSIONS = 64;
const slots = /* @__PURE__ */ new WeakMap();
const openSlots = /* @__PURE__ */ new Set();
let exitHookInstalled = false;
function slotFor(device) {
	let slot = slots.get(device);
	if (!slot) {
		slot = {
			device,
			session: null,
			opening: null,
			sids: [],
			dropped: null
		};
		slots.set(device, slot);
	}
	return slot;
}
function installExitHook() {
	if (exitHookInstalled) return;
	exitHookInstalled = true;
	process.once("exit", () => {
		for (const slot of openSlots) {
			try {
				slot.session?.closeSync?.();
			} catch {}
			slot.session = null;
		}
		openSlots.clear();
	});
}
function isAnchorError(err, code) {
	return err instanceof AnchorAuthError && err.code === code;
}
/** Mark `s` as dropped by the device, so the next open is held to the sid+1 rule. */
function drop(slot, s) {
	s.stopKeepalive?.();
	if (slot.session === s) {
		slot.session = null;
		slot.dropped = s.sid;
	}
}
/**
* Renew the lease while the process lives. A refused renewal (ERR_AUTH: the lease ran out, or
* an operator takeover) drops the session so the next write reopens under the sid+1 rule. Any
* other failure (no answer, the limiter's cooldown) leaves it in place: the session may well
* still be live, and reopening over it would raise a false BUSY alarm; the next write's SET
* settles it and restarts the renewal. Firmware 0.1 answers "unsupported" and the renewal
* stops silently there (no lease).
*/
function keepAlive(slot, s) {
	s.startKeepalive?.(ANCHOR_KEEPALIVE_INTERVAL_MS, (err) => {
		if (isAnchorError(err, "auth") || isAnchorError(err, "closed")) drop(slot, s);
	});
}
/** After an open: if a dropped session is being replaced, the new sid must be the next one. */
function reopenCheck(slot, s) {
	const old = slot.dropped;
	if (old === null || slot.session !== s) return null;
	slot.dropped = null;
	if (s.sid === old + 1n) return null;
	return new HeadAnchorAlarm("ANCHOR_SESSION_HIJACKED", `the device dropped anchor session ${old} and the reopen got session ${s.sid}, not ${old + 1n}: another session was opened in between`);
}
/**
* Command set 0.5: open bound to this launch's activation when one is held and the device can.
* Null = open plainly (no activation held, firmware before 0.5, or the device no longer holds the
* activation: it expired or a reset forgot it). A bound session whose binding does not name the
* activation presented is not this launch's and is refused.
*/
async function openBound(slot, devicePublicKey) {
	const pubHex = devicePublicKey.toString("hex");
	const act = slot.device.anchorOpenBound ? peekActivation(pubHex, "anchor") : null;
	if (!act || !slot.device.anchorOpenBound) return null;
	let s;
	try {
		s = await slot.device.anchorOpenBound(devicePublicKey, act.nonce);
	} catch (err) {
		if (isAnchorError(err, "unsupported") || isAnchorError(err, "auth")) {
			spendActivation(pubHex, act, "anchor");
			return null;
		}
		throw err;
	} finally {
		act.nonce.fill(0);
	}
	spendActivation(pubHex, act, "anchor");
	if (!bindingNames(s.binding, act.facts)) {
		await s.close().catch(() => void 0);
		throw new HeadAnchorTampered("the device bound the anchor session to another activation than the one this launch presented");
	}
	return s;
}
async function openSession(slot, devicePublicKey) {
	if (slot.session && !slot.session.binding && !slot.opening && slot.device.anchorOpenBound) {
		const held = slot.session;
		if (peekActivation(devicePublicKey.toString("hex"), "anchor")) {
			slot.opening = (async () => {
				try {
					const s = await openBound(slot, devicePublicKey);
					if (!s) return held;
					held.stopKeepalive?.();
					slot.session = s;
					slot.sids.push(s.sid);
					keepAlive(slot, s);
					return s;
				} finally {
					slot.opening = null;
				}
			})();
			return slot.opening;
		}
	}
	if (slot.session) return slot.session;
	if (!slot.opening) slot.opening = (async () => {
		try {
			const s = await openBound(slot, devicePublicKey) ?? await slot.device.anchorOpen(devicePublicKey);
			slot.session = s;
			slot.sids.push(s.sid);
			openSlots.add(slot);
			installExitHook();
			keepAlive(slot, s);
			return s;
		} catch (err) {
			if (err instanceof AnchorAuthError && err.code === "busy") throw busyAlarm(err.waitMs);
			throw err;
		} finally {
			slot.opening = null;
		}
	})();
	return slot.opening;
}
/**
* Close every anchor session this process holds (authenticated ANCHOR_CLOSE). Call at a
* graceful shutdown; process exit falls back to a best-effort close that is not awaited.
*/
async function closeHeadAnchorSessions() {
	const pending = [...openSlots];
	openSlots.clear();
	await Promise.all(pending.map(async (slot) => {
		const s = slot.session;
		slot.session = null;
		await s?.close().catch(() => void 0);
	}));
}
/**
* Head anchor attested by the enclaweder's monotonic counter.
*
* @param devicePublicKey raw Ed25519 public key from the device's identity,
*   which the guard has already checked against the signed birth certificate.
*   Verification is against THAT key, not one read back from the anchor file,
*   or an attacker would simply supply their own key alongside their own
*   signature.
*/
function enclawederHeadAnchor(opts) {
	const slot = slotFor(opts.device);
	/** sids this sink has already recorded in its stored copy. */
	const registered = /* @__PURE__ */ new Set();
	async function readStored() {
		let raw;
		try {
			raw = await readFile(opts.path, "utf8");
		} catch {
			return null;
		}
		const stored = decode(raw);
		let uid;
		let sig;
		try {
			uid = Buffer.from(stored.uid, "hex");
			sig = Buffer.from(stored.sig, "base64");
		} catch {
			throw new HeadAnchorTampered("uid or signature is not decodable");
		}
		if (!verifyAnchorRecord(opts.devicePublicKey, {
			version: stored.version === 2 || stored.version === 3 ? stored.version : 1,
			counter: BigInt(stored.counter),
			head: Buffer.from(stored.head, "hex"),
			uid,
			sig,
			sess: stored.sess === void 0 ? void 0 : BigInt(stored.sess),
			opens: stored.opens === void 0 ? void 0 : BigInt(stored.opens),
			bind: stored.bind === void 0 ? void 0 : Buffer.from(stored.bind, "hex")
		})) throw new HeadAnchorTampered("stored signature does not cover this head and counter, or is from another device");
		return stored;
	}
	/**
	* The sessions this logger can PROVE it held (finding H12): the ones this process opened
	* itself, and the session in the stored copy's device-SIGNED record (readStored verified its
	* signature over counter|head|uid|sess|opens). The stored `sessions` list is not evidence:
	* no device signature covers it, so any same-user process can append its own sid to it.
	* The cost is honest and fail-closed: a crash after ANCHOR_SET under a NEW session but before
	* the file write reads as foreign-session until an operator accepts it.
	*/
	function knownSessions(stored) {
		const known = new Set(slot.sids);
		if ((stored?.version === 2 || stored?.version === 3) && stored.sess !== void 0) known.add(BigInt(stored.sess));
		return known;
	}
	/** The informational (untrusted) session list kept in the stored copy. */
	function mergedSessions(stored) {
		return [...new Set([...knownSessions(stored), ...(stored?.sessions ?? []).map((x) => BigInt(x))])].filter((x) => x !== 0n).toSorted((a, b) => a < b ? -1 : a > b ? 1 : 0).slice(-MAX_REMEMBERED_SESSIONS).map((x) => x.toString());
	}
	async function persist(stored) {
		const tmp = `${opts.path}.${process.pid}.tmp`;
		await writeFile(tmp, `${JSON.stringify(stored)}\n`, "utf8");
		await rename(tmp, opts.path);
	}
	async function storedOrNull() {
		try {
			return await readStored();
		} catch {
			return null;
		}
	}
	/**
	* Record a newly opened session in the stored copy BEFORE anchoring under it, so a crash
	* between the device's ANCHOR_SET and the file write cannot leave a live head whose session
	* the stored copy does not know.
	*/
	async function register(sid) {
		if (registered.has(sid)) return;
		const stored = await storedOrNull();
		if (stored !== null) await persist({
			...stored,
			sessions: mergedSessions(stored)
		});
		registered.add(sid);
	}
	/**
	* Command set 0.5: ANCHOR_READ over a nonce of this process. Null when the device cannot (older
	* firmware answers ERR_UNSUPPORTED) or has no anchor yet (`anchored: false`); throws when it
	* cannot be reached, and HeadAnchorTampered when the answer does not verify for our nonce.
	*/
	async function freshRead() {
		if (!opts.device.anchorRead) return "unsupported";
		const nonce = randomBytes(32);
		const p = await opts.device.anchorRead(nonce);
		if (p.length === 1 && p[0] === 8) return "unsupported";
		const r = verifyAnchorRead(opts.devicePublicKey, nonce, p);
		if (!r) throw new HeadAnchorTampered("the device's anchor read is not signed over this process's nonce by the certified key (a replayed or relayed-and-altered read, or another device)");
		return r;
	}
	/** The binding of the record that set the device's current head, from a fresh read. */
	function headBinding(fresh, stored) {
		if (stored !== null && (stored.version === 2 || stored.version === 3) && BigInt(stored.counter) === fresh.counter && stored.sess === fresh.sess.toString() && stored.head === fresh.head.toString("hex")) return {
			version: stored.version,
			bind: stored.version === 3 ? stored.bind ?? null : null
		};
		if (fresh.headByLive) return {
			version: fresh.liveBind ? 3 : 2,
			bind: fresh.liveBind?.toString("hex") ?? null
		};
		return {
			version: null,
			bind: null
		};
	}
	async function readAttested() {
		let live;
		let fresh = "unsupported";
		try {
			fresh = await freshRead();
		} catch (err) {
			if (err instanceof HeadAnchorTampered) throw err;
			fresh = "unsupported";
		}
		if (fresh !== "unsupported") return readFresh(fresh);
		try {
			live = await opts.device.anchorGet();
		} catch {
			const stored = await readStored();
			return stored === null ? {
				head: null,
				attested: "none"
			} : {
				head: stored.head,
				attested: "offline"
			};
		}
		const stored = await readStored();
		if (live === null) {
			if (stored !== null) throw new HeadAnchorTampered("an anchor file exists but the device has never anchored");
			return {
				head: null,
				attested: "none"
			};
		}
		if (!verifyAnchorRecord(opts.devicePublicKey, live)) throw new HeadAnchorTampered("device response failed signature verification (wrong device, or altered in transit)");
		if (stored !== null) {
			const s = BigInt(stored.counter);
			if (s > live.counter) throw new HeadAnchorTampered(`anchor file is ahead of the device (file ${s}, device ${live.counter}): the device has been replaced or rolled back`);
		}
		if (live.version === 1) {
			if (stored?.version === 2) throw new HeadAnchorTampered("the device answers with a v1 record after this log was anchored under record v2", "downgrade");
		} else if (live.sess === 0n) {
			if (stored?.version === 2 || slot.sids.length > 0) throw new HeadAnchorTampered("the device's head predates authenticated anchoring, but this log was anchored since", "downgrade");
		} else if (!knownSessions(stored).has(live.sess)) throw new HeadAnchorTampered(`the device's head was set under anchor session ${live.sess}, which this logger never held: something else anchored the device`, "foreign-session");
		return {
			head: live.head.toString("hex"),
			attested: "device"
		};
	}
	/** readAttested over a fresh read (command set 0.5): the same rules, provably not a replay. */
	async function readFresh(fresh) {
		const stored = await readStored();
		if (!fresh.anchored) {
			if (stored !== null) throw new HeadAnchorTampered("an anchor file exists but the device has never anchored");
			return {
				head: null,
				attested: "none"
			};
		}
		if (stored !== null && BigInt(stored.counter) > fresh.counter) throw new HeadAnchorTampered(`anchor file is ahead of the device (file ${stored.counter}, device ${fresh.counter}): the device has been replaced or rolled back`);
		if (fresh.sess === 0n) {
			if (stored?.version === 2 || stored?.version === 3 || slot.sids.length > 0) throw new HeadAnchorTampered("the device's head predates authenticated anchoring, but this log was anchored since", "downgrade");
		} else if (!knownSessions(stored).has(fresh.sess)) throw new HeadAnchorTampered(`the device's head was set under anchor session ${fresh.sess}, which this logger never held: something else anchored the device`, "foreign-session");
		return {
			head: fresh.head.toString("hex"),
			attested: "device",
			anchor: {
				fresh: true,
				counter: fresh.counter.toString(),
				sess: fresh.sess.toString(),
				...headBinding(fresh, stored)
			}
		};
	}
	async function anchorUnder(s, head) {
		await register(s.sid);
		return s.set(head);
	}
	return {
		id: "enclaweder",
		async write(head) {
			if (!HEX64$3.test(head)) throw new Error(`head anchor: expected a 64-char hex hash, got ${head.length} chars`);
			const h = Buffer.from(head, "hex");
			let s = await openSession(slot, opts.devicePublicKey);
			let alarm = reopenCheck(slot, s);
			let a;
			try {
				a = await anchorUnder(s, h);
			} catch (err) {
				if (!isAnchorError(err, "auth")) throw err;
				drop(slot, s);
				s = await openSession(slot, opts.devicePublicKey);
				alarm = reopenCheck(slot, s) ?? alarm;
				a = await anchorUnder(s, h);
			}
			keepAlive(slot, s);
			if (!verifyAnchorRecord(opts.devicePublicKey, a)) throw new HeadAnchorTampered("device response failed signature verification");
			const prev = await storedOrNull();
			await persist({
				version: a.version,
				head,
				counter: a.counter.toString(),
				uid: a.uid.toString("hex"),
				sig: a.sig.toString("base64"),
				...a.version === 2 || a.version === 3 ? {
					sess: a.sess.toString(),
					opens: a.opens.toString(),
					sessions: mergedSessions(prev)
				} : {},
				...a.version === 3 && a.bind ? { bind: a.bind.toString("hex") } : {},
				...opts.serial ? { serial: opts.serial } : {}
			});
			if (alarm) throw alarm;
		},
		async read() {
			return (await readAttested()).head;
		},
		readAttested
	};
}
//#endregion
//#region src/enclawed/hardware-root/anchor-history.ts
/** The logger's signed copy of the device's anchor, beside the log. */
function anchorFilePath(auditLog) {
	return `${auditLog}.enclaweder-anchor.json`;
}
/** The anchor history (one device-signed line per anchor), beside the log. */
function anchorHistoryPath(auditLog) {
	return `${auditLog}.enclaweder-anchors.jsonl`;
}
const HEX64$2 = /^[0-9a-f]{64}$/;
const HEX24 = /^[0-9a-f]{24}$/;
const DEC = /^(0|[1-9]\d{0,19})$/;
const B64_SIG = /^[A-Za-z0-9+/]{86}==$/;
/** The fields each record version signs (besides head, counter, uid, sig). */
const SIGNED_EXTRA = {
	1: [],
	2: [
		"version",
		"sess",
		"opens"
	],
	3: [
		"version",
		"sess",
		"opens",
		"bind"
	]
};
const BASE = [
	"head",
	"counter",
	"uid",
	"sig"
];
/** Unsigned fields a history line may carry. */
const HISTORY_UNSIGNED = new Set(["ts"]);
/** Unsigned fields the anchor file may carry (head-anchor.ts StoredAnchor). */
const FILE_UNSIGNED = new Set(["sessions", "serial"]);
function isObject$3(v) {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}
/**
* Parse and verify one stored record against `devicePublicKey`, strictly: the version (absent: a
* v1 record written before record v2; otherwise exactly the number 1, 2 or 3) decides which
* fields must be present and the one signature domain they are checked under. Null when any
* signed field is missing, malformed or does not belong to that version, when an unsigned field
* is not one `unsigned` allows, or when the signature does not verify.
*/
function verifySignedAnchorRecord(o, devicePublicKey, unsigned = HISTORY_UNSIGNED) {
	if (!isObject$3(o) || devicePublicKey.length !== 32) return null;
	const v = o.version;
	if (v !== void 0 && v !== 1 && v !== 2 && v !== 3) return null;
	const version = v === void 0 ? 1 : v;
	const allowed = new Set([
		...BASE,
		...SIGNED_EXTRA[version],
		...unsigned
	]);
	if (version === 1) allowed.add("version");
	for (const k of Object.keys(o)) if (!allowed.has(k)) return null;
	if (unsigned.has("ts") && o.ts !== void 0 && typeof o.ts !== "number") return null;
	const { head, counter, uid, sig } = o;
	if (typeof head !== "string" || !HEX64$2.test(head) || typeof counter !== "string" || !DEC.test(counter) || typeof uid !== "string" || !HEX24.test(uid) || typeof sig !== "string" || !B64_SIG.test(sig)) return null;
	let sess = null;
	let opens = null;
	let bind = null;
	if (version >= 2) {
		if (typeof o.sess !== "string" || !DEC.test(o.sess)) return null;
		if (typeof o.opens !== "string" || !DEC.test(o.opens)) return null;
		sess = BigInt(o.sess);
		opens = BigInt(o.opens);
	}
	if (version === 3) {
		if (typeof o.bind !== "string" || !HEX64$2.test(o.bind)) return null;
		bind = o.bind;
	}
	const sigBuf = Buffer.from(sig, "base64");
	if (sigBuf.length !== 64) return null;
	if (!verifyAnchorRecord(devicePublicKey, {
		version,
		counter: BigInt(counter),
		head: Buffer.from(head, "hex"),
		uid: Buffer.from(uid, "hex"),
		sig: sigBuf,
		...version >= 2 ? {
			sess,
			opens
		} : {},
		...version === 3 ? { bind: Buffer.from(bind, "hex") } : {}
	})) return null;
	return {
		version,
		head,
		counter: BigInt(counter),
		uid,
		sig,
		sess,
		opens,
		bind
	};
}
/** The logger's anchor file (head-anchor.ts), verified against the device's key; null when it is not. */
function verifyAnchorFileRecord(stored, devicePublicKey) {
	return verifySignedAnchorRecord(stored, devicePublicKey, FILE_UNSIGNED);
}
/** The history line for a verified record: exactly the fields its version signs, and `ts`. */
function anchorHistoryLine(r, ts) {
	return JSON.stringify({
		...r.version >= 2 ? { version: r.version } : {},
		head: r.head,
		counter: r.counter.toString(),
		uid: r.uid,
		sig: r.sig,
		...r.version >= 2 ? {
			sess: String(r.sess),
			opens: String(r.opens)
		} : {},
		...r.version === 3 ? { bind: r.bind } : {},
		ts
	});
}
/**
* Append the anchor the logger just wrote (its anchor file) to the history. The record is
* verified against the device's key first and the line carries exactly what that record's version
* signs, so it verifies on its own later; an anchor file that does not verify is not recorded
* (throws: the caller reports it, and the next comparison fails on the missing line).
*/
function appendAnchorHistory(o) {
	let stored;
	try {
		stored = JSON.parse(fs.readFileSync(o.anchorPath, "utf8"));
	} catch (err) {
		throw new Error(`the anchor file cannot be read: ${err.message}`, { cause: err });
	}
	const r = verifyAnchorFileRecord(stored, o.devicePublicKey);
	if (!r) throw new Error("the anchor file is not a record signed by this device; not recording it");
	const line = anchorHistoryLine(r, o.now ?? Date.now());
	const back = verifySignedAnchorRecord(JSON.parse(line), o.devicePublicKey);
	if (!back || back.version !== r.version || back.counter !== r.counter || back.head !== r.head) throw new Error("the anchor history line does not verify as the record it records");
	fs.appendFileSync(o.historyPath, `${line}\n`, { mode: 384 });
	return r;
}
/** The history's lines, each verified on its own (`bad`: lines that are not records of this device). */
function parseAnchorHistory(text, devicePublicKey) {
	const entries = [];
	let bad = 0;
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		let o;
		try {
			o = JSON.parse(line);
		} catch {
			bad++;
			continue;
		}
		const r = verifySignedAnchorRecord(o, devicePublicKey);
		if (r) entries.push(r);
		else bad++;
	}
	return {
		entries,
		bad
	};
}
/** The history file (absent: no entries). */
function readAnchorHistory(historyPath, devicePublicKey) {
	let text;
	try {
		text = fs.readFileSync(historyPath, "utf8");
	} catch {
		return {
			entries: [],
			bad: 0
		};
	}
	return parseAnchorHistory(text, devicePublicKey);
}
/** Why a bound record does not name one of `activations`, or null when it does (or is not bound). */
function unboundHistoryRecord(r, activations) {
	if (r.version !== 3) return null;
	const bind = Buffer.from(r.bind, "hex");
	if (activations.some((f) => bindingNames(bind, f))) return null;
	return `the anchor at counter ${r.counter} was set by anchor session ${r.sess}, bound to a device activation that none of this log's own auth.device-factor records names: it is not one of this log's launches`;
}
/** Firmware without the anchor commands answers ST_UNSUPPORTED (status 8). */
const UNSUPPORTED = /status 8\b/;
/** decideAnchorGate (adapter launch-gates.ts) recognizes this wording. */
const FIRMWARE_NO_ANCHOR = "the attached Enclaweder's firmware does not support audit anchoring (ANCHOR_SET/ANCHOR_GET answer ST_UNSUPPORTED); the log is anchored on the host only";
/**
* Compare the device's anchor with a log as found: the device's head (a fresh read over this
* process's nonce on command set 0.5), its counter and open count, the logger's anchor file and
* the anchor history, against the log's record hashes (sealed segments first). `activations`
* (the log's own launch activations, deviceFactorActivations) is optional: given, every bound
* history line, and a bound anchor file, must name one of them. "MISMATCH" and "superseded" fail.
*/
async function compareAnchoredLog(o) {
	const r = await compareOnce(o);
	if (r.deviceHasAnchors !== void 0) return r;
	let has = null;
	try {
		const live = await o.device.anchorGet();
		has = live ? live.counter > 0n : false;
	} catch {
		has = null;
	}
	return {
		...r,
		deviceHasAnchors: has
	};
}
async function compareOnce(o) {
	const anchorPath = anchorFilePath(o.auditLog);
	const historyPath = anchorHistoryPath(o.auditLog);
	const pub = o.devicePublicKey;
	const hashes = o.recordHashes;
	try {
		await o.device.anchorGet();
	} catch (err) {
		if (UNSUPPORTED.test(err?.message ?? "")) return {
			status: "unavailable",
			detail: FIRMWARE_NO_ANCHOR
		};
	}
	const sink = enclawederHeadAnchor({
		device: o.device,
		devicePublicKey: pub,
		path: anchorPath
	});
	if (!sink.readAttested) return {
		status: "unavailable",
		detail: "this head-anchor sink cannot read the device's attested head"
	};
	let r;
	try {
		r = await sink.readAttested();
	} catch (err) {
		const e = err;
		if (e?.code === "foreign-session") return {
			status: "MISMATCH",
			code: "foreign-session",
			detail: `${e.message}. The device's head was anchored by another process or another log, not by this logger's sessions: the log cannot be proven complete, and a forged log may have been anchored`
		};
		if (e?.code === "downgrade") return {
			status: "MISMATCH",
			code: "downgrade",
			detail: `${e.message}. The device answers with an older anchor record format than this log was anchored with: the firmware or the device was rolled back or replaced`
		};
		return {
			status: "MISMATCH",
			code: e?.code ?? "invalid",
			detail: String(e?.message ?? err)
		};
	}
	if (r.attested !== "device" || r.head === null) return {
		status: "unavailable",
		detail: r.attested === "offline" ? "only the offline copy could be read" : "the device has never anchored this log"
	};
	const live = await o.device.anchorGet().catch(() => null);
	if (live && !verifyAnchorRecord(pub, live)) return {
		status: "MISMATCH",
		code: "invalid",
		detail: "the device's anchor record does not verify under its certified key"
	};
	const counter = live ? live.counter.toString() : null;
	const hist = readAnchorHistory(historyPath, pub);
	if (hist.bad > 0) return {
		status: "MISMATCH",
		code: "history-invalid",
		counter,
		detail: `${hist.bad} line(s) of the anchor history (${historyPath}) are not anchors signed by this device: the history was altered`
	};
	let storedRaw = null;
	try {
		storedRaw = JSON.parse(fs.readFileSync(anchorPath, "utf8"));
	} catch {
		storedRaw = null;
	}
	const stored = storedRaw === null ? null : verifyAnchorFileRecord(storedRaw, pub);
	if (o.activations) for (const e of [...hist.entries, ...stored ? [stored] : []]) {
		const why = unboundHistoryRecord(e, o.activations);
		if (why) return {
			status: "MISMATCH",
			code: "history-unbound",
			counter,
			detail: why
		};
	}
	const newest = hist.entries.reduce((m, e) => m === null || e.counter > m.counter ? e : m, null);
	if (newest && live && newest.counter > live.counter) return {
		status: "MISMATCH",
		code: "history-ahead",
		counter,
		detail: `the anchor history has counter ${newest.counter}, ahead of the device's ${live.counter}: the device was replaced or rolled back`
	};
	if (newest && storedRaw !== null && stored && stored.counter < newest.counter) return {
		status: "MISMATCH",
		code: "anchor-file-older",
		counter,
		detail: `the anchor file holds counter ${stored.counter}, older than this log's newest anchor (counter ${newest.counter}): an older anchor copy was restored`
	};
	const known = new Set([...hist.entries, ...stored ? [stored] : []].filter((e) => e.version >= 2 && e.sess !== null).map((e) => e.sess));
	known.delete(0n);
	if (live && live.version >= 2 && known.size > 0) {
		const mine = [...known].reduce((a, b) => b > a ? b : a);
		if (live.opens > mine) return {
			status: "MISMATCH",
			code: "foreign-open",
			counter,
			detail: `the device's anchor channel was opened ${live.opens - mine} more time(s) after this logger's newest session (${mine}; device opens ${live.opens}): another process or log held it since`
		};
	}
	const lost = hist.entries.find((e) => !hashes.includes(e.head));
	if (lost) return {
		status: "MISMATCH",
		code: "records-removed",
		counter,
		detail: `the record anchored at counter ${lost.counter} (head ${lost.head.slice(0, 16)}…) is no longer in the log: records were removed`
	};
	const at = hashes.lastIndexOf(r.head);
	if (at < 0) {
		if (stored && counter && stored.counter < BigInt(counter) && hashes.includes(stored.head)) return {
			status: "superseded",
			counter,
			detail: `the device was anchored again since this log's last anchor (counter ${stored.counter} -> ${counter}), by another log on this device or after records were removed; records after record ${hashes.lastIndexOf(stored.head) + 1} are not proven complete`
		};
		return {
			status: "MISMATCH",
			code: "head-not-in-log",
			counter,
			detail: `the device's anchored head ${r.head.slice(0, 16)}… (counter ${counter}) is not a record of this log: records were removed, or the log was replaced`
		};
	}
	if (!newest) return {
		status: "MISMATCH",
		code: "no-history",
		counter,
		detail: `the device anchors record ${at + 1} of this log, but the anchor history (${historyPath}) is missing or empty: the log cannot be shown to extend the device-signed chain (a deleted history is how a replaced log is laundered)`
	};
	if (newest.head !== r.head || live && newest.counter !== live.counter) return {
		status: "MISMATCH",
		code: "history-behind",
		counter,
		detail: `the anchor history ends at counter ${newest.counter} (head ${newest.head.slice(0, 16)}…), not at the device's anchor (counter ${counter}, head ${r.head.slice(0, 16)}…): the device's head was set outside this log's history`
	};
	const ordered = [...hist.entries].toSorted((x, y) => x.counter < y.counter ? -1 : x.counter > y.counter ? 1 : 0);
	for (let k = 1; k < ordered.length; k++) if (hashes.indexOf(ordered[k].head) < hashes.indexOf(ordered[k - 1].head)) return {
		status: "MISMATCH",
		code: "history-order",
		counter,
		detail: `the anchor at counter ${ordered[k].counter} names an earlier record than the anchor at counter ${ordered[k - 1].counter}: the anchored heads do not follow the log`
	};
	return {
		status: "matched",
		counter,
		detail: `device ${o.label ?? "Enclaweder"} anchors record ${at + 1} of ${hashes.length} (counter ${counter})`,
		unanchoredTail: hashes.length - 1 - at,
		attestation: r.anchor ?? null
	};
}
//#endregion
//#region src/enclawed/adapter/sealed-box.ts
const PKCS8_X25519 = Buffer.from("302e020100300506032b656e04220420", "hex");
const SPKI_X25519 = Buffer.from("302a300506032b656e032100", "hex");
const BOX_INFO$1 = "enclawed.adapter.sealed-box.v1";
const rawPublic = (k) => Buffer.from(k.export({
	format: "der",
	type: "spki"
}).subarray(SPKI_X25519.length));
const publicFromRaw = (raw) => createPublicKey({
	key: Buffer.concat([SPKI_X25519, raw]),
	format: "der",
	type: "spki"
});
/** The fingerprint a box id carries: SHA-256 of the purpose and the public key, 16 hex digits. */
function boxFingerprint(publicKey) {
	return createHash("sha256").update(BOX_INFO$1).update(publicKey).digest("hex").slice(0, 16);
}
function boxKey(shared, epk, pub) {
	return Buffer.from(hkdfSync("sha256", shared, Buffer.concat([epk, pub]), BOX_INFO$1, 32));
}
/**
* The box of a 32-byte seed (derived by the caller from a device key; the seed is not kept: the
* caller wipes it). `idPrefix` names the device and purpose; the id ends in the key's fingerprint.
*/
function sealBoxFromSeed(seed32, idPrefix) {
	if (seed32.length !== 32) throw new Error("a sealed-box seed is 32 bytes");
	const der = Buffer.concat([PKCS8_X25519, seed32]);
	let priv = createPrivateKey({
		key: der,
		format: "der",
		type: "pkcs8"
	});
	der.fill(0);
	const publicKey = rawPublic(createPublicKey(priv));
	const id = `${idPrefix}:${boxFingerprint(publicKey)}`;
	return {
		id,
		publicKey,
		canOpen: () => priv !== null,
		open(rec, aad) {
			if (!priv || rec.key !== id) return null;
			try {
				const epk = Buffer.from(rec.epk, "base64");
				if (epk.length !== 32) return null;
				const shared = diffieHellman({
					privateKey: priv,
					publicKey: publicFromRaw(epk)
				});
				const key = boxKey(shared, epk, publicKey);
				shared.fill(0);
				const d = createDecipheriv("aes-256-gcm", key, Buffer.from(rec.iv, "base64"));
				d.setAAD(aad);
				d.setAuthTag(Buffer.from(rec.tag, "base64"));
				const out = Buffer.concat([d.update(Buffer.from(rec.data, "base64")), d.final()]);
				key.fill(0);
				return out;
			} catch {
				return null;
			}
		},
		close() {
			priv = null;
		}
	};
}
/** A box that only seals (its public key known, never its private key): what a closed box is. */
function sealOnlyBox(id, publicKey) {
	if (publicKey.length !== 32 || !id.endsWith(`:${boxFingerprint(publicKey)}`)) throw new Error("the box id does not name this public key");
	return {
		id,
		publicKey,
		canOpen: () => false,
		open: () => null,
		close: () => {}
	};
}
/** Seal `plain` to the box (public key only), with `aad` bound. */
function sealToBox(box, plain, aad) {
	const eph = generateKeyPairSync("x25519");
	const epk = rawPublic(eph.publicKey);
	const shared = diffieHellman({
		privateKey: eph.privateKey,
		publicKey: publicFromRaw(box.publicKey)
	});
	const key = boxKey(shared, epk, box.publicKey);
	shared.fill(0);
	const iv = randomBytes(12);
	const c = createCipheriv("aes-256-gcm", key, iv);
	c.setAAD(aad);
	const data = Buffer.concat([c.update(plain), c.final()]);
	key.fill(0);
	return {
		key: box.id,
		epk: epk.toString("base64"),
		iv: iv.toString("base64"),
		tag: c.getAuthTag().toString("base64"),
		data: data.toString("base64")
	};
}
/** Whether `x` has the shape of a box record. */
function isBoxRecord(x) {
	const r = x;
	return !!r && typeof r === "object" && [
		"key",
		"epk",
		"iv",
		"tag",
		"data"
	].every((k) => typeof r[k] === "string");
}
//#endregion
//#region src/enclawed/adapter/credential-keys.ts
const KEY_TAG = "enclawed.adapter.credential-key.v1";
const fingerprint = (key) => createHash("sha256").update(KEY_TAG).update(key).digest("hex").slice(0, 16);
/** A device key id: `device:<uid>:<fingerprint>` (CHALLENGE) or `device:<uid>:kd:<fingerprint>` (KEY_DERIVE). */
function deviceKeyIdForm(id) {
	if (/^device:[^:]+:kd:[0-9a-f]{16}$/.test(id)) return "key-derive";
	return /^device:[^:]+:[0-9a-f]{16}$/.test(id) ? "challenge" : null;
}
/** The KEY_DERIVE label of the credential key: SHA3-256 of its purpose and the device's uid. */
function credentialKeyLabel(uid) {
	return createHash("sha3-256").update(`${KEY_TAG_V2}\0${uid}`).digest();
}
const KEY_TAG_V2 = "enclawed.adapter.credential-key.v2";
/**
* The launch's derived keys, by certified device key: KEY_DERIVE answers once per activation, and
* the login seal and the credential store share one key, so it is derived once and held in this
* process's memory (never on disk) for the launch.
*/
const launchKeys = /* @__PURE__ */ new Map();
/** The launch's sealed boxes, by certified device key, derived with the key (never on disk). */
const launchBoxes = /* @__PURE__ */ new Map();
/** The purposes of the boxes: an HKDF info each, so no box's key follows from another's or the key's. */
const BOX_INFO = Object.freeze({
	login: "enclawed.adapter.login-box.v1",
	context: "enclawed.adapter.session-context-box.v1",
	tools: "enclawed.adapter.session-tool-credentials-box.v1"
});
/**
* Forget the launch's derived keys and close its boxes (the end of a launch's start, once what it
* needs is open; tests). A key derived again needs a new activation of the launch.
*/
function forgetLaunchCredentialKeys() {
	for (const k of launchKeys.values()) k.fill(0);
	launchKeys.clear();
	for (const b of launchBoxes.values()) {
		b.login.close();
		b.context.close();
		b.tools.close();
	}
	launchBoxes.clear();
}
function boxesOf(raw, uid) {
	const make = (purpose) => {
		const seed = Buffer.from(hkdfSync("sha256", raw, Buffer.from(uid, "utf8"), BOX_INFO[purpose], 32));
		try {
			return sealBoxFromSeed(seed, `device:${uid}:box:${purpose}`);
		} finally {
			seed.fill(0);
		}
	};
	return {
		login: make("login"),
		context: make("context"),
		tools: make("tools")
	};
}
const KEY_DERIVE_TEXT = {
	"no-activation": "this launch holds no fresh device-verified activation (an unlock use or a session-start code verified by the device in the last 120 s), and the key is derived only on one",
	refused: "the Enclaweder holds no such activation (it expired, was spent, or the device restarted)",
	unsupported: "the Enclaweder refused KEY_DERIVE although it proved command set 0.5 (something between this process and the device altered the request)",
	zeroized: "the Enclaweder was zeroized and must be recovered first",
	locked: "the Enclaweder's halt latch is set",
	"bad-response": "the Enclaweder's KEY_DERIVE answer did not verify under this request's seal"
};
/**
* The device key: KEY_DERIVE on command set 0.5 (proven by the device), else the CHALLENGE key of
* older firmware (never when the root is required, and never when the command set is unproven).
*/
async function deviceKeyFor(device, rootRequired) {
	const none = (problem) => ({
		key: null,
		state: {
			derivation: null,
			residual: null,
			problem,
			legacy: null
		}
	});
	const kd = device.keyDerivation ?? null;
	const proof = kd ? await kd.commandSet().catch((err) => ({
		status: "unproven",
		reason: err?.message ?? String(err)
	})) : {
		status: "older",
		reason: "the device seam offers no command set 0.5"
	};
	if (proof.status === "proven" && kd) {
		let key = launchKeys.get(kd.pubkey) ?? null;
		if (!key) {
			const r = await kd.derive(credentialKeyLabel(device.uid)).catch(() => ({
				ok: false,
				code: "bad-response"
			}));
			if (!r.ok) return none(`the device key is not derived: ${KEY_DERIVE_TEXT[r.code] ?? r.code} (KEY_DERIVE ${r.code})`);
			key = Buffer.from(hkdfSync("sha256", r.key, Buffer.from(device.uid, "utf8"), KEY_TAG_V2, 32));
			launchBoxes.set(kd.pubkey, boxesOf(r.key, device.uid));
			r.key.fill(0);
			launchKeys.set(kd.pubkey, key);
		}
		return {
			key: {
				id: `device:${device.uid}:kd:${fingerprint(key)}`,
				source: "device",
				key
			},
			state: {
				derivation: "key-derive",
				residual: null,
				problem: null,
				legacy: () => challengeKey(device),
				boxes: launchBoxes.get(kd.pubkey) ?? null
			}
		};
	}
	if (proof.status === "unproven") return none(`the Enclaweder's command set is not proven (${proof.reason})`);
	if (rootRequired) return none(`the hardware root is required and the Enclaweder does not prove command set 0.5 (${"reason" in proof ? proof.reason : "no KEY_DERIVE seam"}); its key is derived only by KEY_DERIVE`);
	const key = await challengeKey(device);
	return key ? {
		key,
		state: {
			derivation: "challenge",
			residual: KEY_DERIVE_RESIDUAL,
			problem: null,
			legacy: null
		}
	} : none("the Enclaweder's signature over the key message varies or failed");
}
/** The key a device derives: it signs a fixed, purpose-bound message twice; differing answers are not a key. */
async function challengeKey(device) {
	const message = createHash("sha256").update(`${KEY_TAG}\0${device.uid}`).digest();
	let a;
	let b;
	try {
		a = await device.sign(message);
		b = await device.sign(message);
	} catch {
		return null;
	}
	if (a.length < 32 || a.length !== b.length || !timingSafeEqual(a, b)) return null;
	const key = Buffer.from(hkdfSync("sha256", a, Buffer.from(device.uid, "utf8"), KEY_TAG, 32));
	return {
		id: `device:${device.uid}:${fingerprint(key)}`,
		source: "device",
		key
	};
}
function readKeyFile(file) {
	let text;
	try {
		const st = fs.lstatSync(file);
		if (!st.isFile() || process.platform !== "win32" && (st.mode & 63) !== 0) return null;
		text = fs.readFileSync(file, "utf8").trim();
	} catch {
		return null;
	}
	return /^[0-9a-f]{64}$/.test(text) ? Buffer.from(text, "hex") : null;
}
function createKeyFile(file) {
	fs.mkdirSync(path.dirname(file), {
		recursive: true,
		mode: 448
	});
	const key = randomBytes(32);
	const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
	fs.writeFileSync(tmp, `${key.toString("hex")}\n`, { mode: 384 });
	try {
		fs.linkSync(tmp, file);
	} catch {} finally {
		fs.rmSync(tmp, { force: true });
	}
	const k = readKeyFile(file);
	if (!k) throw new Error(`the credential key file ${file} is not a protected key file`);
	return k;
}
/**
* The credential store's keys. `device`: the bound Enclaweder (null without
* one); `keyring`: the OS keyring (null when none is reachable); `keyFile`:
* the key file in the adapter's protected state (used, and made, only when
* neither of the others seals).
*/
async function credentialStoreKeys(o) {
	const keys = [];
	const outcome = o.device ? await deviceKeyFor(o.device, o.rootRequired === true) : null;
	const dev = outcome?.key ?? null;
	if (dev) keys.push(dev);
	const account = `credential-key:${createHash("sha256").update(path.resolve(o.keyFile)).digest("hex").slice(0, 16)}`;
	const fromRing = (hex) => typeof hex === "string" && /^[0-9a-f]{64}$/.test(hex) ? (() => {
		const key = Buffer.from(hex, "hex");
		return {
			id: `keyring:${fingerprint(key)}`,
			source: "keyring",
			key
		};
	})() : null;
	let ring = null;
	try {
		ring = o.keyring ? fromRing(o.keyring.get(account)) : null;
	} catch {
		ring = null;
	}
	if (!dev && !ring && o.keyring) {
		const hex = randomBytes(32).toString("hex");
		try {
			ring = o.keyring.set(account, hex) ? fromRing(o.keyring.get(account)) : null;
		} catch {
			ring = null;
		}
	}
	if (ring) keys.push(ring);
	let fileKey = readKeyFile(o.keyFile);
	if (!fileKey && keys.length === 0) fileKey = createKeyFile(o.keyFile);
	if (fileKey) keys.push({
		id: `file:${fingerprint(fileKey)}`,
		source: "file",
		key: fileKey
	});
	return {
		write: keys[0],
		read: (id) => keys.find((k) => k.id === id)?.key ?? null,
		keyFile: path.resolve(o.keyFile),
		...outcome ? { device: outcome.state } : {}
	};
}
/**
* The bound Enclaweder as a key device (the framework's hardware-root signing seam, its command-set
* proof and KEY_DERIVE on the primary member), or null.
*/
function frameworkCredentialKeyDevice() {
	const signing = hardwareRootSigning();
	const member = signing?.members[0];
	if (!signing || !member) return null;
	const kd = hardwareRootKeyDerivation();
	return {
		uid: member.uid,
		sign: (message32) => signing.run(async (dev) => (await dev.challenge(message32)).sig),
		keyDerivation: kd && kd.uid === member.uid ? {
			pubkey: kd.pubkey,
			commandSet: hardwareRootCommandSet,
			derive: (l) => kd.derive(l)
		} : {
			pubkey: member.pubkey,
			commandSet: async () => ({
				status: "unproven",
				reason: "the hardware root offers no key derivation here (it is not CLEAN)"
			}),
			derive: async () => ({
				ok: false,
				code: "no-activation"
			})
		}
	};
}
const SERVICE = "enclawed";
/** The OS keyring through its command-line tool (secret-tool, security), or null when none is reachable. */
function osKeyring(env = process.env, platform = process.platform) {
	const run = (cmd, args, input) => spawnSync(cmd, args, {
		input,
		encoding: "utf8",
		timeout: 1e4,
		env: {
			...process.env,
			...env
		},
		windowsHide: true
	});
	if (platform === "linux") {
		if (!env.DBUS_SESSION_BUS_ADDRESS || run("secret-tool", ["--version"]).error) return null;
		return {
			get: (account) => {
				const r = run("secret-tool", [
					"lookup",
					"service",
					SERVICE,
					"account",
					account
				]);
				return r.status === 0 && r.stdout ? r.stdout.trim() : null;
			},
			set: (account, secret) => run("secret-tool", [
				"store",
				"--label=Enclawed credential key",
				"service",
				SERVICE,
				"account",
				account
			], secret).status === 0
		};
	}
	if (platform === "darwin") {
		if (run("security", ["list-keychains"]).status !== 0) return null;
		return {
			get: (account) => {
				const r = run("security", [
					"find-generic-password",
					"-s",
					SERVICE,
					"-a",
					account,
					"-w"
				]);
				return r.status === 0 && r.stdout ? r.stdout.trim() : null;
			},
			set: (account, secret) => run("security", [
				"add-generic-password",
				"-U",
				"-s",
				SERVICE,
				"-a",
				account,
				"-w",
				secret
			]).status === 0
		};
	}
	return null;
}
//#endregion
//#region src/enclawed/adapter/login-seal.ts
const KIND$1 = "enclawed.adapter.login-seal.v1";
/** A login file larger than this is not a login (a fixed bound, not a setting). */
const LOGIN_MAX_BYTES = 1024 * 1024;
const fail$1 = (code, message) => ({
	ok: false,
	code,
	message
});
const aad$2 = (label, key) => Buffer.from(`${KIND$1}\0${label}\0${key}`, "utf8");
/** A key wiped by forgetLaunchCredentialKeys (all zeros). */
const forgotten = (k) => k.every((b) => b === 0);
/** With a device bound, only the device key seals (a launch's box is the device's by construction). */
function sealingKeyProblem(keys, deviceBound, box = null) {
	if (box) return box.publicKey?.length === 32 && box.id.startsWith("device:") ? null : fail$1("key-unavailable", "the login box is not a device box");
	if (!keys?.write?.key || keys.write.key.length !== 32 || forgotten(keys.write.key)) return fail$1("key-unavailable", "no key to seal the login with");
	if (deviceBound && keys.write.source !== "device") return fail$1("device-key-required", `an Enclaweder is bound, but its key could not be derived (the best key here is the ${keys.write.source} key); the login is sealed only under the device`);
	return null;
}
/** Overwrite once, then remove; never follows a link. True when nothing is left at `file`. */
function eraseFile$1(file) {
	let st = null;
	try {
		st = fs.lstatSync(file);
	} catch {
		return true;
	}
	if (st.isFile()) try {
		const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW);
		try {
			const n = Math.max(st.size, 1);
			fs.writeSync(fd, randomBytes(n), 0, n, 0);
			fs.fsyncSync(fd);
		} finally {
			fs.closeSync(fd);
		}
	} catch {}
	try {
		fs.rmSync(file, {
			force: true,
			recursive: st.isDirectory()
		});
	} catch {}
	try {
		fs.lstatSync(file);
		return false;
	} catch {
		return true;
	}
}
/** The login file's bytes: a regular file (never a link), not empty, within the bound. */
function readLogin(file) {
	let st;
	try {
		st = fs.lstatSync(file);
	} catch {
		return fail$1("no-login", `there is no login at ${file}`);
	}
	if (!st.isFile()) return fail$1("login-not-a-file", `${file} is not a regular file (a link or a directory is not read)`);
	if (st.size === 0 || st.size > 1048576) return fail$1("login-too-large", `${file} is ${st.size === 0 ? "empty" : "larger than a login"}`);
	const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
	try {
		return fs.readFileSync(fd);
	} finally {
		fs.closeSync(fd);
	}
}
function sealBytes(plain, label, keys, box = null) {
	if (box) return {
		v: 2,
		kind: KIND$1,
		label,
		...sealToBox(box, plain, aad$2(label, box.id))
	};
	const iv = randomBytes(12);
	const c = createCipheriv("aes-256-gcm", keys.write.key, iv);
	c.setAAD(aad$2(label, keys.write.id));
	const data = Buffer.concat([c.update(plain), c.final()]);
	return {
		v: 1,
		kind: KIND$1,
		label,
		key: keys.write.id,
		iv: iv.toString("base64"),
		tag: c.getAuthTag().toString("base64"),
		data: data.toString("base64")
	};
}
/**
* Written atomically (a temp file renamed in), 0600, in a 0700 directory; the record it replaces
* is overwritten through a descriptor held on it, so no earlier record is left in its file.
*/
function writeSealed(file, rec) {
	const dir = path.dirname(file);
	fs.mkdirSync(dir, {
		recursive: true,
		mode: 448
	});
	fs.chmodSync(dir, 448);
	let old = null;
	try {
		old = fs.lstatSync(file).isFile() ? fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW) : null;
	} catch {
		old = null;
	}
	try {
		const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(rec), {
			mode: 384,
			flag: "wx"
		});
		fs.renameSync(tmp, file);
		if (old !== null) {
			const n = Math.max(fs.fstatSync(old).size, 1);
			fs.writeSync(old, randomBytes(n), 0, n, 0);
			fs.fsyncSync(old);
		}
	} finally {
		if (old !== null) fs.closeSync(old);
	}
}
function readSealed(file) {
	let text;
	try {
		if (!fs.lstatSync(file).isFile()) return fail$1("sealed-unreadable", `${file} is not a regular file`);
		text = fs.readFileSync(file, "utf8");
	} catch {
		return null;
	}
	let raw;
	try {
		raw = JSON.parse(text);
	} catch {
		return fail$1("sealed-unreadable", `${file} is not a sealed login`);
	}
	if (raw?.v === 2 && raw.kind === KIND$1 && typeof raw.label === "string" && isBoxRecord(raw)) return raw;
	if (raw?.v !== 1 || raw.kind !== KIND$1 || typeof raw.label !== "string" || typeof raw.key !== "string" || typeof raw.iv !== "string" || typeof raw.tag !== "string" || typeof raw.data !== "string") return fail$1("sealed-unreadable", `${file} is not a sealed login`);
	return raw;
}
const isFailure = (x) => typeof x === "object" && x !== null && x.ok === false;
/** Open a sealed record: the key it names, its label, and (device bound) a device key only. */
function openSealed(rec, o) {
	if (rec.label !== o.label) return fail$1("sealed-does-not-open", `the sealed login is for "${rec.label}", not "${o.label}"`);
	if (rec.v === 2) {
		if (!o.box || o.box.id !== rec.key || !o.box.canOpen()) return fail$1("key-unavailable", "the login is sealed to the Enclaweder's login box, which opens only at the start of a launch with a device-verified activation");
		return o.box.open(rec, aad$2(rec.label, rec.key)) ?? fail$1("sealed-does-not-open", "the sealed login does not open with its box (changed after it was sealed)");
	}
	if (o.deviceBound && !rec.key.startsWith("device:")) return fail$1("not-device-sealed", `an Enclaweder is bound, and this login was sealed with a ${rec.key.split(":")[0]} key, which a process of this user can read; it is not used`);
	const key = o.keys.read(rec.key);
	if (!key) return fail$1("key-unavailable", `the login is sealed with a key that is not available here (${rec.key.split(":")[0]}); bind that key's device`);
	try {
		const d = createDecipheriv("aes-256-gcm", key, Buffer.from(rec.iv, "base64"));
		d.setAAD(aad$2(rec.label, rec.key));
		d.setAuthTag(Buffer.from(rec.tag, "base64"));
		return Buffer.concat([d.update(Buffer.from(rec.data, "base64")), d.final()]);
	} catch {
		return fail$1("sealed-does-not-open", "the sealed login does not open with its key (changed after it was sealed)");
	}
}
/**
* A fresh record opens to `plain`: checked with the record's own key, or, for a box that no longer
* opens (the launch closed it), taken as sealed (the box's construction is checked by its tests).
*/
function verifyOpen(rec, o, plain) {
	if (rec.v === 2 && !o.box?.canOpen()) return true;
	const back = openSealed(rec, o);
	if (isFailure(back)) return false;
	const same = back.equals(plain);
	back.fill(0);
	return same;
}
/**
* Seal the plaintext login at `plainFile` into `sealedFile`, check that it
* opens to the same bytes, then erase the plaintext. A failure leaves the
* plaintext and any earlier sealed login as they were.
*/
function sealLoginFile(o) {
	const label = o.label ?? "login";
	const box = o.box ?? null;
	const problem = sealingKeyProblem(o.keys, o.deviceBound, box);
	if (problem) return problem;
	const plain = readLogin(o.plainFile);
	if (isFailure(plain)) return plain;
	const rec = sealBytes(plain, label, o.keys, box);
	if (!verifyOpen(rec, {
		keys: o.keys,
		label,
		deviceBound: o.deviceBound,
		box
	}, plain)) return fail$1("sealed-does-not-open", "the login did not open again after sealing; nothing was changed");
	writeSealed(o.sealedFile, rec);
	return {
		ok: true,
		keyId: rec.key,
		plaintextErased: eraseFile$1(o.plainFile)
	};
}
/**
* Open the sealed login into `sessionFile`, whose directory is made fresh for
* it (0700; it must not exist yet) and dedicated to it: the file is created
* exclusively, 0600. No sealed login: only the directory is made (the host
* logs in there, and the end of the session seals what it wrote).
*/
function unsealLoginInto(o) {
	const label = o.label ?? "login";
	const rec = readSealed(o.sealedFile);
	if (isFailure(rec)) return rec;
	let plain = null;
	if (rec) {
		const opened = openSealed(rec, {
			keys: o.keys,
			label,
			deviceBound: o.deviceBound,
			box: o.box
		});
		if (isFailure(opened)) return opened;
		plain = opened;
	}
	const dir = path.dirname(o.sessionFile);
	try {
		fs.mkdirSync(dir, { mode: 448 });
	} catch {
		return fail$1("session-dir-exists", `${dir} already exists or cannot be made; the login is not opened there`);
	}
	fs.chmodSync(dir, 448);
	if (!plain) return {
		ok: true,
		unsealed: false,
		keyId: null
	};
	let fd = null;
	try {
		fd = fs.openSync(o.sessionFile, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 384);
		fs.writeSync(fd, plain);
		fs.fsyncSync(fd);
	} catch (err) {
		eraseSessionLogin({ sessionFile: o.sessionFile });
		return fail$1("session-write-failed", `the login could not be opened into ${o.sessionFile} (${err.message})`);
	} finally {
		if (fd !== null) fs.closeSync(fd);
		plain.fill(0);
	}
	return {
		ok: true,
		unsealed: true,
		keyId: rec.key
	};
}
/**
* Erase the session's plaintext: every regular file of `sessionFile`'s
* (dedicated) directory is overwritten and removed (a host's half-written
* temp file holds the login too), then the directory.
*/
function eraseSessionLogin(o) {
	const dir = path.dirname(o.sessionFile);
	const erased = [];
	const remaining = [];
	let names = [];
	try {
		if (fs.lstatSync(dir).isDirectory()) names = fs.readdirSync(dir);
	} catch {
		names = [];
	}
	const files = new Set([o.sessionFile, ...names.map((n) => path.join(dir, n))]);
	for (const f of [...files].toSorted()) {
		let present = false;
		try {
			fs.lstatSync(f);
			present = true;
		} catch {
			present = false;
		}
		if (!present) continue;
		(eraseFile$1(f) ? erased : remaining).push(f);
	}
	try {
		fs.rmdirSync(dir);
	} catch {}
	return {
		erased,
		remaining
	};
}
/**
* The end of a session: seal what the host left in `sessionFile` (a token it
* refreshed during the session) into `sealedFile`, then erase the session's
* plaintext. No login left (the host logged out): the sealed login is erased
* too. A login that cannot be sealed is erased all the same, and the earlier
* sealed login is kept.
*/
function resealFromSession(o) {
	const label = o.label ?? "login";
	const plain = readLogin(o.sessionFile);
	let out;
	if (isFailure(plain)) if (plain.code === "no-login") {
		eraseFile$1(o.sealedFile);
		out = {
			ok: true,
			action: "removed",
			keyId: null
		};
	} else out = plain;
	else {
		const box = o.box ?? null;
		const problem = sealingKeyProblem(o.keys, o.deviceBound, box);
		if (problem) out = problem;
		else {
			const rec = sealBytes(plain, label, o.keys, box);
			if (!verifyOpen(rec, {
				keys: o.keys,
				label,
				deviceBound: o.deviceBound,
				box
			}, plain)) out = fail$1("sealed-does-not-open", "the session's login did not open again after sealing; the earlier sealed login is kept");
			else {
				writeSealed(o.sealedFile, rec);
				out = {
					ok: true,
					action: "resealed",
					keyId: rec.key
				};
			}
		}
		plain.fill(0);
	}
	return {
		...out,
		...eraseSessionLogin({ sessionFile: o.sessionFile })
	};
}
/**
* Open the sealed login into memory only (the caller holds it, never writes
* it): the same checks as unsealLoginInto. No sealed login: "no-login".
*/
function unsealLoginToMemory(o) {
	const label = o.label ?? "login";
	const rec = readSealed(o.sealedFile);
	if (isFailure(rec)) return rec;
	if (!rec) return fail$1("no-login", `there is no sealed login at ${o.sealedFile}`);
	const opened = openSealed(rec, {
		keys: o.keys,
		label,
		deviceBound: o.deviceBound,
		box: o.box
	});
	return isFailure(opened) ? opened : {
		ok: true,
		plain: opened,
		keyId: rec.key
	};
}
/**
* Seal a login held in memory (a token renewed during the session) into
* `sealedFile`, after checking that it opens to the same bytes.
*/
function sealLoginBytes(o) {
	const label = o.label ?? "login";
	const box = o.box ?? null;
	const problem = sealingKeyProblem(o.keys, o.deviceBound, box);
	if (problem) return problem;
	if (o.plain.length === 0 || o.plain.length > 1048576) return fail$1("login-too-large", "the login is empty or larger than a login");
	const rec = sealBytes(o.plain, label, o.keys, box);
	if (!verifyOpen(rec, {
		keys: o.keys,
		label,
		deviceBound: o.deviceBound,
		box
	}, o.plain)) return fail$1("sealed-does-not-open", "the login did not open again after sealing; the earlier sealed login is kept");
	writeSealed(o.sealedFile, rec);
	return {
		ok: true,
		keyId: rec.key
	};
}
/** Erase the sealed login (a halt whose adapter asks for a fresh login). */
function eraseSealedLogin(o) {
	return eraseFile$1(o.sealedFile);
}
/** What is there: the sealed login (never opened) and any plaintext login files. Never returns secret values. */
function loginSealStatus(o) {
	const rec = readSealed(o.sealedFile);
	const present = rec !== null;
	const ok = rec !== null && !isFailure(rec);
	const plaintext = [...new Set(o.plainFiles.map((f) => path.resolve(f)))].filter((f) => {
		try {
			fs.lstatSync(f);
			return true;
		} catch {
			return false;
		}
	});
	return {
		sealed: {
			present,
			keyId: ok ? rec.key : null,
			keySource: ok ? rec.key.split(":")[0] : null,
			readable: ok
		},
		plaintext: plaintext.toSorted()
	};
}
/**
* What a launch does with the login. No device and no sealed login: the host
* runs as it always did ("pass"). Device bound and no plaintext login: the
* sealed login (or none: a fresh login) goes into the session ("unseal").
* Device bound, no sealed login yet, and one plaintext login: the login the
* host would have used anyway is sealed first, so no plaintext outlives a
* launch with the device ("seal-then-unseal"). Refused: a plaintext login next
* to a sealed one (a copy that bypasses the seal, or a login someone else put
* there: never adopted silently; a person seals it in place of the sealed one,
* or removes it), two plaintext logins (which one is the login is not
* guessed), and a sealed login with no device to open it.
*/
function loginLaunchDecision(o) {
	const plain = o.status.plaintext;
	if (!o.deviceBound) return o.status.sealed.present ? {
		action: "refuse",
		code: "device-required",
		message: "the login is sealed under an Enclaweder, and none is bound to this launch; attach the device the login was sealed with"
	} : { action: "pass" };
	if (plain.length > 0) return o.status.sealed.present ? {
		action: "refuse",
		code: "plaintext-beside-seal",
		message: `a plaintext login (${plain.join(", ")}) is present next to the sealed one: it is a copy that bypasses the seal, or a login someone else put there, and it is not used. Remove it, or seal it in place of the sealed login`
	} : plain.length === 1 ? {
		action: "seal-then-unseal",
		plainFile: plain[0]
	} : {
		action: "refuse",
		code: "plaintext-unsealed",
		message: `an Enclaweder is bound and there are ${plain.length} plaintext logins (${plain.join(", ")}); seal the one in use under the device and remove the others`
	};
	return { action: "unseal" };
}
/**
* Command set 0.5: move a login sealed under the CHALLENGE-derived device key (earlier versions,
* credential-keys.ts) to the KEY_DERIVE key `keys.write`. The old record is opened once with the
* CHALLENGE key (computed now, only for this), the login sealed again and checked to open, the new
* record renamed into place, and the old record's bytes overwritten in place (through a descriptor
* held on it, so nothing of the old form is left at the path or in its file), then `audit`ed
* ("auth.login-seal.migrated", key kinds and ids only, never a secret). Nothing to do ("migrated:
* false"): no sealed login, one already under KEY_DERIVE, or no KEY_DERIVE key here. An audit that
* fails is "audit-failed" (the migration stands; the adapter does not start the session).
*/
async function migrateLegacyLoginSeal(o) {
	const label = o.label ?? "login";
	const rec = readSealed(o.sealedFile);
	if (isFailure(rec)) return rec;
	if (!rec || deviceKeyIdForm(rec.key) !== "challenge") return {
		ok: true,
		migrated: false
	};
	if (deviceKeyIdForm(o.keys?.write?.id ?? "") !== "key-derive" || !o.keys.device?.legacy) return {
		ok: true,
		migrated: false
	};
	const old = await o.keys.device.legacy().catch(() => null);
	if (!old || old.id !== rec.key) {
		old?.key.fill(0);
		return fail$1("key-unavailable", "the login is sealed under the Enclaweder's earlier key, which this device does not give (another device, or the signature failed); it is not moved");
	}
	const opened = openSealed(rec, {
		keys: {
			write: old,
			read: (id) => id === old.id ? old.key : null,
			keyFile: o.keys.keyFile
		},
		label,
		deviceBound: true
	});
	old.key.fill(0);
	if (isFailure(opened)) return opened;
	const next = sealBytes(opened, label, o.keys, o.box ?? null);
	const same = verifyOpen(next, {
		keys: o.keys,
		label,
		deviceBound: true,
		box: o.box ?? null
	}, opened);
	opened.fill(0);
	if (!same) return fail$1("sealed-does-not-open", "the login did not open again after sealing under the new key; the earlier sealed login is kept");
	let fd = null;
	try {
		fd = fs.openSync(o.sealedFile, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW);
	} catch {
		fd = null;
	}
	try {
		writeSealed(o.sealedFile, next);
		if (fd !== null) {
			const n = Math.max(fs.fstatSync(fd).size, 1);
			fs.writeSync(fd, randomBytes(n), 0, n, 0);
			fs.fsyncSync(fd);
		}
	} finally {
		if (fd !== null) fs.closeSync(fd);
	}
	const out = {
		ok: true,
		migrated: true,
		from: rec.key,
		to: next.key
	};
	if (o.audit) try {
		await o.audit({
			type: "auth.login-seal.migrated",
			payload: {
				label,
				from: "device-challenge",
				to: "device-key-derive",
				fromKey: rec.key,
				toKey: next.key
			}
		});
	} catch (err) {
		return fail$1("audit-failed", `the login was moved to the Enclaweder's derived key, but the move could not be audited (${err?.message ?? String(err)})`);
	}
	return out;
}
//#endregion
//#region src/enclawed/adapter/command-set-pin.ts
const UPDATE = `update the Enclaweder to firmware 0.3.3 (command set 0.5) with ${CS05_REFLASH_RUNBOOK}`;
/** The decision, from the device's proof. Pure. */
function decideCommandSetPin(o) {
	if (!o.deviceBound) return {
		ok: true,
		proof: null,
		residual: null
	};
	const proof = o.proof ?? {
		status: "unproven",
		reason: "the device's command set was not asked"
	};
	if (proof.status === "proven") return {
		ok: true,
		proof,
		residual: null
	};
	if (!o.rootRequired) return {
		ok: true,
		proof,
		residual: proof.status === "older" ? KEY_DERIVE_RESIDUAL : `the Enclaweder's command set is not proven (${proof.reason}); its command set 0.5 protections are not in force`
	};
	return proof.status === "older" ? {
		ok: false,
		code: "firmware-too-old",
		proof,
		message: `the hardware root is required, and the Enclaweder answers as firmware before command set 0.5 (${proof.reason}): with it a relayed unlock would cross the owner in the clear, the credential key could be had by any process of this user, and the audit anchor would open unbound. Not starting; ${UPDATE}`
	} : {
		ok: false,
		code: "firmware-unproven",
		proof,
		message: `the hardware root is required, and the Enclaweder did not prove command set 0.5 (${proof.reason}); a version only something in between asserts is never taken. Not starting; check the device, or ${UPDATE}`
	};
}
/**
* The pin for a launch: asks the device (`prove`, default the framework's hardwareRootCommandSet)
* when a device is bound, and decides. Run it before the launch's activation, so nothing is spent
* on a device that cannot keep the activation sealed.
*/
async function commandSetPin(o) {
	if (!o.deviceBound) return decideCommandSetPin({
		...o,
		proof: null
	});
	const proof = await (o.prove ?? hardwareRootCommandSet)().catch((err) => ({
		status: "unproven",
		reason: err?.message ?? String(err)
	}));
	return decideCommandSetPin({
		...o,
		proof
	});
}
//#endregion
//#region src/enclawed/adapter/auth-relay.ts
/** A request body larger than this is refused (a fixed bound, not a setting). */
const AUTH_RELAY_MAX_BODY = 64 * 1024 * 1024;
/** Headers never forwarded: hop-by-hop, any credential the host sent, and the host name. */
const DROP_HEADERS = new Set([
	"connection",
	"keep-alive",
	"proxy-connection",
	"proxy-authorization",
	"proxy-authenticate",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"host",
	"authorization",
	"x-api-key",
	"cookie",
	"content-length"
]);
/** `c` as a plain duplex stream that starts with `first`. */
function asStream(c, first) {
	const d = new Duplex({
		read() {
			c.resume();
		},
		write(chunk, _enc, cb) {
			c.write(chunk, cb);
		},
		final(cb) {
			c.end();
			cb();
		},
		destroy(err, cb) {
			c.destroy();
			cb(err);
		}
	});
	d.push(first);
	c.on("data", (x) => {
		if (!d.push(x)) c.pause();
	});
	c.on("end", () => d.push(null));
	c.on("close", () => d.destroy());
	return d;
}
function routeOf(routes, method, url) {
	const p = url.split("?")[0] ?? "";
	if (!p.startsWith("/") || p.includes("..") || p.includes("//") || p.includes("%")) return null;
	return routes.find((r) => r.method === method && r.path.test(p)) ?? null;
}
/** Start the relay. Refuses a socket directory others can enter. */
async function startAuthRelay(o) {
	const dir = path.dirname(o.socketPath);
	const st = fs.lstatSync(dir);
	if (!st.isDirectory() || process.platform !== "win32" && (st.mode & 63) !== 0) throw new Error(`the relay's directory ${dir} is not private to this user (0700)`);
	const host = o.upstreamHost.toLowerCase();
	const port = o.upstreamPort ?? 443;
	const ca = createContainerCa("session auth relay", [host]);
	const leaf = ca.leafFor(host);
	const emit = (kind, method, p, status, reason) => {
		try {
			o.onEvent?.({
				kind,
				method,
				path: p.split("?")[0]?.slice(0, 200) ?? "",
				status,
				...reason ? { reason } : {}
			});
		} catch {}
	};
	let closed = false;
	const forward = (body, req, token) => new Promise((resolve, reject) => {
		const headers = {};
		for (const [k, v] of Object.entries(req.headers)) if (v !== void 0 && !DROP_HEADERS.has(k.toLowerCase())) headers[k] = v;
		headers.host = port === 443 ? host : `${host}:${port}`;
		headers["content-length"] = String(body.length);
		if (token !== null) headers[o.credentialHeader.header.toLowerCase()] = `${o.credentialHeader.prefix}${token}`;
		const target = o.upstreamAddressForTest ?? {
			host,
			port
		};
		const up = https.request({
			host: target.host,
			port: target.port,
			servername: host,
			method: req.method,
			path: req.url,
			headers,
			rejectUnauthorized: true,
			checkServerIdentity: (_h, cert) => tls.checkServerIdentity(host, cert),
			...o.upstreamTrustForTest ? { ca: o.upstreamTrustForTest } : {},
			agent: false
		});
		up.on("response", (res) => resolve({
			status: res.statusCode ?? 502,
			headers: res.headers,
			res
		}));
		up.on("error", reject);
		up.end(body);
	});
	const handle = async (req, res, sni) => {
		const method = req.method ?? "";
		const url = req.url ?? "";
		const refuse = (status, kind) => {
			emit(kind, method, url, status);
			res.writeHead(status, { "content-type": "application/json" });
			res.end(JSON.stringify({ error: {
				type: "enclawed_relay",
				message: `refused (${kind})`
			} }));
		};
		if (sni !== null && sni.toLowerCase() !== host) {
			refuse(421, "refused-host");
			return;
		}
		const route = routeOf(o.routes, method, url);
		if (!route) {
			refuse(403, "refused-route");
			return;
		}
		if (route.credential) {
			if (sni === null) {
				refuse(403, "refused-route");
				return;
			}
			if (req.headers[o.placeholder.header.toLowerCase()] !== o.placeholder.value) {
				refuse(401, "refused-placeholder");
				return;
			}
		}
		const chunks = [];
		let size = 0;
		for await (const c of req) {
			size += c.length;
			if (size > 67108864) {
				refuse(413, "refused-size");
				return;
			}
			chunks.push(c);
		}
		const body = Buffer.concat(chunks);
		if (route.credential && o.credential.expiresSoon()) if (await o.credential.refresh("expiry").catch(() => false)) emit("refreshed", method, url, 0, "expiry");
		else emit("refresh-failed", method, url, 0, "expiry");
		const token = route.credential ? o.credential.current() : null;
		if (route.credential && !token) {
			refuse(401, "no-credential");
			return;
		}
		try {
			let r = await forward(body, req, token);
			if (r.status === 401 && route.credential) {
				r.res.resume();
				const again = await o.credential.refresh("rejected").catch(() => false) ? o.credential.current() : null;
				if (again) {
					emit("refreshed", method, url, 401, "rejected");
					r = await forward(body, req, again);
				} else {
					emit("refresh-failed", method, url, 401, "rejected");
					r = await forward(body, req, token);
				}
			}
			const out = {};
			for (const [k, v] of Object.entries(r.headers)) if (v !== void 0 && !DROP_HEADERS.has(k.toLowerCase()) && k.toLowerCase() !== "set-cookie") out[k] = v;
			res.writeHead(r.status, out);
			r.res.pipe(res);
			emit("forwarded", method, url, r.status);
		} catch {
			refuse(502, "upstream-error");
		}
	};
	const plain = http.createServer((req, res) => {
		const s = req.socket;
		handle(req, res, s.encrypted ? typeof s.servername === "string" ? s.servername : "" : null).catch(() => res.destroy());
	});
	const secure = tls.createServer({
		key: leaf.keyPem,
		cert: leaf.certPem,
		ALPNProtocols: ["http/1.1"]
	}, (t) => plain.emit("connection", t));
	const sockets = /* @__PURE__ */ new Set();
	const front = net.createServer((c) => {
		sockets.add(c);
		c.on("close", () => sockets.delete(c));
		c.on("error", () => c.destroy());
		c.once("data", (first) => {
			if (closed) {
				c.destroy();
				return;
			}
			const d = asStream(c, first);
			if (first[0] === 22) secure.emit("connection", d);
			else plain.emit("connection", d);
		});
	});
	fs.rmSync(o.socketPath, { force: true });
	await new Promise((resolve, reject) => {
		front.once("error", reject);
		front.listen(o.socketPath, () => resolve());
	});
	fs.chmodSync(o.socketPath, 384);
	return {
		caCertPem: ca.certPem,
		socketPath: o.socketPath,
		async close() {
			closed = true;
			o.credential.drop();
			for (const s of sockets) s.destroy();
			await new Promise((r) => front.close(() => r()));
			plain.close();
			secure.close();
			fs.rmSync(o.socketPath, { force: true });
		}
	};
}
/** An OAuth login as the relay keeps it (in memory only). */
/** The audit record type of each refresh event (an adapter may prefix it with its own name). */
const AUTH_RELAY_REFRESH_RECORD = Object.freeze({
	refreshed: "auth.relay.token-refreshed",
	"refresh-failed": "auth.relay.token-refresh-failed"
});
/**
* The relay's onEvent for an adapter's tamper-evident audit log: every token refresh and failed
* refresh is appended as its own record (`AUTH_RELAY_REFRESH_RECORD`) carrying the reason, method,
* path and status only: no token, header, body or query string reaches the log. Other events go
* to `other` (default: not recorded). `settled()` resolves when every append so far has finished;
* `failures()` counts appends that threw (an adapter treats any as a broken audit).
*/
function auditedAuthRelayEvents(append, other) {
	let chain = Promise.resolve();
	let failed = 0;
	return {
		onEvent: (e) => {
			const kind = e.kind;
			if (kind !== "refreshed" && kind !== "refresh-failed") {
				other?.(e);
				return;
			}
			const type = AUTH_RELAY_REFRESH_RECORD[kind];
			const payload = {
				reason: e.reason === "expiry" || e.reason === "rejected" ? e.reason : null,
				method: e.method.slice(0, 16),
				path: e.path.split("?")[0].slice(0, 200),
				status: Number.isInteger(e.status) ? e.status : 0
			};
			chain = chain.then(() => append({
				type,
				payload
			})).then(() => void 0, () => {
				failed++;
			});
		},
		settled: () => chain,
		failures: () => failed
	};
}
const REFRESH_AAD = Buffer.from("enclawed.adapter.auth-relay.refresh-token.v1", "utf8");
/**
* A refresh vault over the launch's login box (credential-keys.ts boxes.login): the token is sealed
* to the box's public key in memory; `reopen` obtains the box again with its private key (a new
* device-verified activation and KEY_DERIVE, the adapter's), which is closed again at once.
*/
function boxRefreshVault(o) {
	return {
		seal: (token) => {
			const plain = Buffer.from(token, "utf8");
			try {
				return sealToBox(o.box, plain, REFRESH_AAD);
			} finally {
				plain.fill(0);
			}
		},
		open: async (sealed) => {
			const box = await o.reopen().catch(() => null);
			if (!box) return null;
			try {
				if (box.id !== o.box.id) return null;
				const plain = box.open(sealed, REFRESH_AAD);
				if (!plain) return null;
				const token = plain.toString("utf8");
				plain.fill(0);
				return token;
			} finally {
				box.close();
				o.forget?.();
			}
		}
	};
}
/** Renew a token early by this much (a fixed margin, not a setting). */
const REFRESH_MARGIN_MS = 300 * 1e3;
/**
* The relay's credential for an OAuth login: refresh_token grants against
* the provider's token endpoint (pinned https URL, JSON body), each rotation
* handed to `onRotate` to be sealed again before the new token is used.
*/
function oauthRelayCredential(o) {
	const url = new URL(o.tokenUrl);
	if (url.protocol !== "https:") throw new Error("the token endpoint must be https");
	const vault = o.refreshVault ?? null;
	let sealedRefresh = vault && o.login.refreshToken ? vault.seal(o.login.refreshToken) : null;
	let login = {
		...o.login,
		refreshToken: vault ? null : o.login.refreshToken,
		scopes: [...o.login.scopes]
	};
	let inFlight = null;
	const now = o.now ?? Date.now;
	const post = (body) => new Promise((resolve, reject) => {
		const target = o.addressForTest ?? {
			host: url.hostname,
			port: Number(url.port) || 443
		};
		const r = https.request({
			host: target.host,
			port: target.port,
			servername: url.hostname,
			method: "POST",
			path: `${url.pathname}${url.search}`,
			headers: {
				"content-type": "application/json",
				"content-length": Buffer.byteLength(body),
				host: url.host
			},
			rejectUnauthorized: true,
			checkServerIdentity: (_h, cert) => tls.checkServerIdentity(url.hostname, cert),
			...o.trustForTest ? { ca: o.trustForTest } : {},
			agent: false,
			timeout: 3e4
		}, (res) => {
			let text = "";
			res.setEncoding("utf8");
			res.on("data", (d) => {
				text += d;
				if (text.length > 1024 * 1024) res.destroy();
			});
			res.on("end", () => resolve({
				status: res.statusCode ?? 0,
				text
			}));
		});
		r.on("timeout", () => r.destroy(/* @__PURE__ */ new Error("token endpoint timed out")));
		r.on("error", reject);
		r.end(body);
	});
	const refreshOnce = async () => {
		const cur = login;
		const sealedNow = sealedRefresh;
		const refreshToken = vault ? cur && sealedNow !== null ? await vault.open(sealedNow) : null : cur?.refreshToken ?? null;
		if (!cur || !refreshToken || login !== cur) return false;
		const r = await post(JSON.stringify({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: o.clientId,
			...cur.scopes.length ? { scope: cur.scopes.join(" ") } : {}
		}));
		if (r.status !== 200) return false;
		let j;
		try {
			j = JSON.parse(r.text);
		} catch {
			return false;
		}
		if (typeof j.access_token !== "string" || j.access_token === "" || login !== cur) return false;
		const next = {
			accessToken: j.access_token,
			refreshToken: typeof j.refresh_token === "string" && j.refresh_token ? j.refresh_token : refreshToken,
			expiresAt: typeof j.expires_in === "number" ? now() + j.expires_in * 1e3 : null,
			scopes: typeof j.scope === "string" && j.scope ? j.scope.split(" ") : cur.scopes
		};
		o.onRotate(next);
		if (vault) {
			sealedRefresh = next.refreshToken ? vault.seal(next.refreshToken) : null;
			login = {
				...next,
				refreshToken: null
			};
		} else login = next;
		return true;
	};
	return {
		current: () => login?.accessToken ?? null,
		expiresSoon: () => login?.expiresAt != null && login.expiresAt - now() < 3e5,
		refresh: () => {
			inFlight ??= refreshOnce().finally(() => {
				inFlight = null;
			});
			return inFlight;
		},
		drop: () => {
			login = null;
			sealedRefresh = null;
		}
	};
}
/**
* Turn core dumps of this process off (RLIMIT_CORE 0, soft and hard), before a login is opened
* into its memory: a dump written at a crash would be a plaintext copy of the token at rest
* (/var/lib/systemd/coredump, a core file). Node has no setrlimit; util-linux `prlimit` lowers this
* process's own limit (no privilege needed to lower it). Checked by reading /proc/self/limits back.
*/
function processCoreDumpsOff(run = (cmd, args) => spawnSync(cmd, args, {
	stdio: "ignore",
	timeout: 1e4
}), read = (p) => fs.readFileSync(p, "utf8"), platform = process.platform) {
	if (platform !== "linux") return {
		off: false,
		reason: `core dumps are not turned off on ${platform}`
	};
	run("prlimit", ["--core=0:0", `--pid=${process.pid}`]);
	let line = "";
	try {
		line = read("/proc/self/limits").split("\n").find((l) => l.startsWith("Max core file size")) ?? "";
	} catch {
		line = "";
	}
	const [soft, hard] = line.replace("Max core file size", "").trim().split(/\s+/);
	return soft === "0" && hard === "0" ? {
		off: true,
		reason: "RLIMIT_CORE is 0"
	} : {
		off: false,
		reason: `core dumps of this process could not be turned off (${line.trim() || "no limits"}); a crash could write the token to disk`
	};
}
/**
* Whether a process of the same user can read this process's memory: Linux's
* Yama ptrace_scope 1 or more restricts reading another process's memory to
* its ancestors (and CAP_SYS_PTRACE); 0, or no Yama, allows any process of
* the same user. Root is never kept out.
*/
function processMemoryShielded(read = (p) => fs.readFileSync(p, "utf8"), platform = process.platform) {
	if (platform !== "linux") return {
		shielded: false,
		reason: `no Yama ptrace restriction on ${platform}`
	};
	let scope;
	try {
		scope = Number(read("/proc/sys/kernel/yama/ptrace_scope").trim());
	} catch {
		return {
			shielded: false,
			reason: "the kernel has no Yama ptrace restriction"
		};
	}
	return scope >= 1 && Number.isInteger(scope) ? {
		shielded: true,
		reason: `kernel.yama.ptrace_scope=${scope}`
	} : {
		shielded: false,
		reason: `kernel.yama.ptrace_scope=${scope} lets any process of this user read another's memory`
	};
}
//#endregion
//#region src/enclawed/adapter/context-seal.ts
const KIND = "enclawed.adapter.context-seal.v1";
const SET_TAG = "enclawed.adapter.context-seal.set.v1";
const MANIFEST = ".enclawed-context.json";
const LOCK = ".lock";
const BLOB = /^[0-9a-f]{32}\.ctx$/;
/** A context file larger than this is not sealed (it is erased all the same; a fixed bound). */
const CONTEXT_FILE_MAX = 256 * 1024 * 1024;
/** The audit record types of the context seal (an adapter may prefix them with its own name). */
const CONTEXT_SEAL_RECORD = Object.freeze({
	sealed: "context.sealed",
	adopted: "context.adopted",
	discarded: "context.discarded",
	refused: "context.refused"
});
const fail = (code, message) => ({
	ok: false,
	code,
	message
});
const sha256$1 = (b) => createHash("sha256").update(b).digest("hex");
const aad$1 = (label, key, blob) => Buffer.from(`${KIND}\0${label}\0${key}\0${blob}`, "utf8");
function layoutProblem(layout) {
	const names = [
		...layout.context,
		...Object.keys(layout.linked),
		...Object.keys(layout.copied)
	];
	const ok = (n) => n !== "" && n !== "." && n !== ".." && !n.includes("/") && !n.includes("\\") && !n.includes("\0");
	if (!names.every(ok) || names.includes(MANIFEST) || names.includes(LOCK)) return "a layout name is not a plain name";
	if (new Set(names).size !== names.length) return "a name is in two parts of the layout";
	for (const p of [...Object.values(layout.linked), ...Object.values(layout.copied)]) if (!path.isAbsolute(p)) return `${p} is not an absolute path`;
	return null;
}
/** A relative path of a context file: plain segments under one of the context's names. */
function validRel(rel, layout) {
	if (typeof rel !== "string" || rel.length === 0 || rel.length > 4096 || rel.includes("\0")) return false;
	const segs = rel.split("/");
	return segs.length <= 33 && segs.every((s) => s !== "" && s !== "." && s !== ".." && !s.includes("\\")) && layout.context.includes(segs[0]);
}
/** Overwrite once, then remove; a link or anything else is unlinked, never followed. */
function eraseFile(file) {
	let st;
	try {
		st = fs.lstatSync(file);
	} catch {
		return true;
	}
	if (st.isFile()) try {
		const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW);
		try {
			const n = Math.max(st.size, 1);
			const chunk = randomBytes(Math.min(n, 1024 * 1024));
			for (let off = 0; off < n; off += chunk.length) fs.writeSync(fd, chunk, 0, Math.min(chunk.length, n - off), off);
			fs.fsyncSync(fd);
		} finally {
			fs.closeSync(fd);
		}
	} catch {}
	try {
		if (st.isDirectory()) fs.rmdirSync(file);
		else fs.unlinkSync(file);
	} catch {}
	try {
		fs.lstatSync(file);
		return false;
	} catch {
		return true;
	}
}
/** Erase a directory tree: files overwritten, links unlinked (never followed), then the directories. */
function eraseTree(dir) {
	let erased = 0;
	const remaining = [];
	const walk = (p, depth) => {
		let st;
		try {
			st = fs.lstatSync(p);
		} catch {
			return;
		}
		if (st.isDirectory() && depth <= 34) {
			let names = [];
			try {
				names = fs.readdirSync(p);
			} catch {
				names = [];
			}
			for (const n of names.toSorted()) walk(path.join(p, n), depth + 1);
		}
		if (eraseFile(p)) erased++;
		else remaining.push(p);
	};
	walk(dir, 0);
	return {
		erased,
		remaining
	};
}
/** The blobs of the store (regular files named as records) and anything else found there. */
function listStore(sealedDir) {
	let entries;
	try {
		if (!fs.lstatSync(sealedDir).isDirectory()) return null;
		entries = fs.readdirSync(sealedDir, { withFileTypes: true });
	} catch (err) {
		return err?.code === "ENOENT" ? {
			blobs: [],
			foreign: []
		} : null;
	}
	const blobs = [];
	const foreign = [];
	for (const e of entries) {
		if (e.name === LOCK) continue;
		if (e.isFile() && BLOB.test(e.name)) blobs.push(e.name);
		else if (!e.name.endsWith(".tmp")) foreign.push(e.name);
	}
	return {
		blobs: blobs.toSorted(),
		foreign: foreign.toSorted()
	};
}
/**
* The digest of the sealed set: SHA-256 over the tag and every record's name and the SHA-256 of
* its bytes, in name order. An empty or absent store has the digest of the tag alone; a store
* holding anything that is not a record has none (null).
*/
function sealedContextDigest(sealedDir) {
	const s = listStore(sealedDir);
	if (!s || s.foreign.length > 0) return null;
	const h = createHash("sha256").update(`${SET_TAG}\n`);
	for (const b of s.blobs) {
		let bytes;
		try {
			bytes = fs.readFileSync(path.join(sealedDir, b));
		} catch {
			return null;
		}
		h.update(`${b} ${sha256$1(bytes)}\n`);
	}
	return h.digest("hex");
}
/** The digest of an empty store. */
const EMPTY_CONTEXT_DIGEST = createHash("sha256").update(`${SET_TAG}\n`).digest("hex");
/**
* The digest the audit log last recorded for `label` (records of CONTEXT_SEAL_RECORD's sealed,
* adopted and discarded types, any adapter's prefix), or null when the log records none.
*/
function lastRecordedContextDigest(records, label) {
	let last = null;
	const types = new Set([
		CONTEXT_SEAL_RECORD.sealed,
		CONTEXT_SEAL_RECORD.adopted,
		CONTEXT_SEAL_RECORD.discarded
	]);
	for (const r of records) {
		const rec = r;
		if (!rec || typeof rec.type !== "string" || !rec.payload || typeof rec.payload !== "object") continue;
		const base = [...types].find((t) => rec.type === t || rec.type.endsWith(`.${t}`));
		const p = rec.payload;
		if (base && p.label === label && typeof p.digest === "string" && /^[0-9a-f]{64}$/.test(p.digest)) last = p.digest;
	}
	return last;
}
/**
* Whether the sealed set may be opened: it must be exactly the set the log last recorded. No
* record and an empty store is a first launch; no record and a non-empty store is refused (records
* the log never saw sealed).
*/
function contextSealVerdict(o) {
	const found = sealedContextDigest(o.sealedDir);
	if (found === null) return fail("store-invalid", `${o.sealedDir} holds something that is not a sealed context record; it is not opened`);
	if (o.recorded === null) return found === EMPTY_CONTEXT_DIGEST ? {
		ok: true,
		digest: found,
		empty: true
	} : fail("unrecorded", "sealed context records are present that the audit log never recorded; they are not opened");
	return found === o.recorded ? {
		ok: true,
		digest: found,
		empty: found === EMPTY_CONTEXT_DIGEST
	} : fail("not-as-recorded", "the sealed context is not the one the audit log last recorded (a record was added, removed, replaced or rolled back outside Enclawed); it is not opened");
}
/** Hold the store's lock (an exclusive lock file; one left by a process that is gone is taken over). */
async function withContextLock(sealedDir, fn) {
	fs.mkdirSync(sealedDir, {
		recursive: true,
		mode: 448
	});
	const lock = path.join(sealedDir, LOCK);
	const deadline = Date.now() + 3e4;
	for (;;) try {
		fs.writeFileSync(lock, String(process.pid), {
			flag: "wx",
			mode: 384
		});
		break;
	} catch (err) {
		if (err?.code !== "EEXIST") throw err;
		const holder = Number(fs.readFileSync(lock, "utf8").trim());
		let alive = false;
		try {
			process.kill(holder, 0);
			alive = Number.isInteger(holder) && holder > 0 && holder !== process.pid;
		} catch {
			alive = false;
		}
		if (!alive) {
			fs.rmSync(lock, { force: true });
			continue;
		}
		if (Date.now() > deadline) throw new Error(`the sealed context store ${sealedDir} is locked by process ${holder}`, { cause: err });
		await new Promise((r) => setTimeout(r, 50));
	}
	try {
		return await fn();
	} finally {
		fs.rmSync(lock, { force: true });
	}
}
function readBlob(file, label) {
	try {
		const st = fs.lstatSync(file);
		if (!st.isFile() || st.size > 268435456 * 2) return null;
		const raw = JSON.parse(fs.readFileSync(file, "utf8"));
		return raw?.v === 1 && raw.kind === KIND && raw.label === label && isBoxRecord(raw) ? raw : null;
	} catch {
		return null;
	}
}
/** One context file as a record's plaintext: a header (path, time) and the file's bytes. */
function framePlain(rel, at, bytes) {
	const head = Buffer.from(JSON.stringify({
		path: rel,
		at
	}), "utf8");
	const len = Buffer.alloc(4);
	len.writeUInt32BE(head.length);
	return Buffer.concat([
		len,
		head,
		bytes
	]);
}
function unframePlain(plain) {
	if (plain.length < 4) return null;
	const n = plain.readUInt32BE(0);
	if (n > 8192 || 4 + n > plain.length) return null;
	try {
		const h = JSON.parse(plain.subarray(4, 4 + n).toString("utf8"));
		return {
			rel: h.path,
			at: h.at,
			bytes: plain.subarray(4 + n)
		};
	} catch {
		return null;
	}
}
function writeBlob(sealedDir, box, label, rel, bytes) {
	const name = `${randomBytes(16).toString("hex")}.ctx`;
	const plain = framePlain(rel, Date.now(), bytes);
	const rec = {
		v: 1,
		kind: KIND,
		label,
		...sealToBox(box, plain, aad$1(label, box.id, name))
	};
	plain.fill(0);
	const file = path.join(sealedDir, name);
	const tmp = `${file}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(rec), {
		mode: 384,
		flag: "wx"
	});
	fs.renameSync(tmp, file);
	return name;
}
/**
* Make the session's directory: fresh under `parent` (0700), with the layout's linked
* configuration (a link to each path that exists) and copied files (regular files only, 0600).
*/
function prepareContextDir(o) {
	const problem = layoutProblem(o.layout);
	if (problem) return fail("layout-invalid", problem);
	let dir;
	try {
		dir = fs.mkdtempSync(path.join(o.parent, "c-"));
		fs.chmodSync(dir, 448);
	} catch (err) {
		return fail("dir-failed", `the session's context directory could not be made (${err.message})`);
	}
	for (const [name, from] of Object.entries(o.layout.linked)) {
		try {
			fs.lstatSync(from);
		} catch {
			continue;
		}
		fs.symlinkSync(from, path.join(dir, name));
	}
	for (const [name, from] of Object.entries(o.layout.copied)) {
		let bytes;
		try {
			const st = fs.lstatSync(from);
			if (!st.isFile() || st.size > 268435456) continue;
			bytes = fs.readFileSync(from);
		} catch {
			continue;
		}
		fs.writeFileSync(path.join(dir, name), bytes, {
			mode: 384,
			flag: "wx"
		});
		bytes.fill(0);
	}
	return {
		ok: true,
		dir
	};
}
/**
* Open the sealed context into the session's directory (prepareContextDir's): the verdict first
* (contextSealVerdict against the digest the log last recorded), then every record with the open
* context box. Returns what was opened (the baseline the end of the session seals against), also
* written to the directory's manifest so a session that ended without sealing can be sealed later
* (recoverContextDirs). Call it under withContextLock.
*/
function openContextInto(o) {
	const problem = layoutProblem(o.layout);
	if (problem) return fail("layout-invalid", problem);
	const verdict = contextSealVerdict({
		sealedDir: o.sealedDir,
		recorded: o.recorded
	});
	if (!verdict.ok) return verdict;
	const store = listStore(o.sealedDir);
	if (!store) return fail("store-invalid", `${o.sealedDir} is not a sealed context store`);
	if (store.blobs.length > 0 && !o.box.canOpen()) return fail("box-closed", "the context box no longer opens (the launch closed it)");
	const best = /* @__PURE__ */ new Map();
	const superseded = [];
	for (const b of store.blobs) {
		const rec = readBlob(path.join(o.sealedDir, b), o.label);
		if (!rec || rec.key !== o.box.id) return fail("record-invalid", `the sealed context record ${b} is not one of this box's`);
		const plain = o.box.open(rec, aad$1(o.label, rec.key, b));
		const f = plain ? unframePlain(plain) : null;
		if (!plain || !f || !validRel(f.rel, o.layout) || typeof f.at !== "number") {
			plain?.fill(0);
			return fail("does-not-open", `the sealed context record ${b} does not open (changed after it was sealed)`);
		}
		const prev = best.get(f.rel);
		const cur = {
			blob: b,
			at: f.at,
			bytes: Buffer.from(f.bytes)
		};
		plain.fill(0);
		if (!prev || prev.at < cur.at || prev.at === cur.at && prev.blob < cur.blob) {
			if (prev) {
				superseded.push(prev.blob);
				prev.bytes.fill(0);
			}
			best.set(f.rel, cur);
		} else {
			superseded.push(b);
			cur.bytes.fill(0);
		}
	}
	const files = {};
	try {
		for (const [rel, v] of [...best.entries()].toSorted(([a], [b]) => a < b ? -1 : 1)) {
			const target = path.join(o.dir, ...rel.split("/"));
			let parent = o.dir;
			for (const seg of rel.split("/").slice(0, -1)) {
				parent = path.join(parent, seg);
				try {
					fs.mkdirSync(parent, { mode: 448 });
				} catch (err) {
					if (err?.code !== "EEXIST" || !fs.lstatSync(parent).isDirectory()) throw new Error(`${rel} has no directory to be opened into`, { cause: err });
				}
			}
			const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 384);
			try {
				fs.writeSync(fd, v.bytes);
			} finally {
				fs.closeSync(fd);
			}
			files[rel] = {
				sha256: sha256$1(v.bytes),
				blob: v.blob
			};
			v.bytes.fill(0);
		}
	} catch (err) {
		eraseTree(o.dir);
		return fail("dir-failed", `the context could not be opened into ${o.dir} (${err.message})`);
	}
	const baseline = {
		files,
		superseded
	};
	fs.writeFileSync(path.join(o.dir, MANIFEST), JSON.stringify({
		v: 1,
		pid: process.pid,
		label: o.label,
		sealedDir: o.sealedDir,
		baseline
	}), {
		mode: 384,
		flag: "wx"
	});
	return {
		ok: true,
		baseline,
		files: Object.keys(files).length,
		digest: verdict.digest
	};
}
/** The regular files under the context's names in `dir`, and what was not sealed (links, devices, too large). */
function contextFiles(dir, layout) {
	const files = [];
	const skipped = [];
	const walk = (rel, depth) => {
		const p = path.join(dir, ...rel.split("/"));
		let st;
		try {
			st = fs.lstatSync(p);
		} catch {
			return;
		}
		if (st.isDirectory() && depth < 32) for (const n of fs.readdirSync(p).toSorted()) walk(`${rel}/${n}`, depth + 1);
		else if (st.isFile() && st.size <= 268435456 && validRel(rel, layout)) files.push(rel);
		else skipped.push(rel);
	};
	for (const name of layout.context) walk(name, 0);
	return {
		files,
		skipped
	};
}
/**
* The end of a session: seal what the host left under the context's names in `dir` to the box's
* public key (no private key, and no device, is needed), against the launch's baseline, then erase
* `dir` entirely. Returns the store's new digest, for the adapter to record in its audit log.
* Call it under withContextLock (the digest is the store as this call left it).
*/
function sealContextFrom(o) {
	const problem = layoutProblem(o.layout);
	if (problem) {
		const e = eraseTree(o.dir);
		return {
			...fail("layout-invalid", problem),
			erased: e.erased,
			remaining: e.remaining
		};
	}
	fs.mkdirSync(o.sealedDir, {
		recursive: true,
		mode: 448
	});
	const { files, skipped } = contextFiles(o.dir, o.layout);
	let sealed = 0;
	let kept = 0;
	let removed = 0;
	const stale = new Set(o.baseline.superseded);
	const seen = /* @__PURE__ */ new Set();
	for (const rel of files) {
		seen.add(rel);
		const p = path.join(o.dir, ...rel.split("/"));
		let bytes;
		try {
			const fd = fs.openSync(p, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
			try {
				bytes = fs.readFileSync(fd);
			} finally {
				fs.closeSync(fd);
			}
		} catch {
			skipped.push(rel);
			continue;
		}
		const base = o.baseline.files[rel];
		if (base && base.sha256 === sha256$1(bytes)) kept++;
		else {
			writeBlob(o.sealedDir, o.box, o.label, rel, bytes);
			sealed++;
			if (base) stale.add(base.blob);
		}
		bytes.fill(0);
	}
	for (const [rel, base] of Object.entries(o.baseline.files)) if (!seen.has(rel)) stale.add(base.blob);
	for (const b of stale) if (BLOB.test(b) && fs.existsSync(path.join(o.sealedDir, b))) {
		eraseFile(path.join(o.sealedDir, b));
		removed++;
	}
	const e = eraseTree(o.dir);
	return {
		ok: true,
		sealed,
		kept,
		removed,
		skipped: skipped.toSorted(),
		digest: sealedContextDigest(o.sealedDir) ?? "",
		erased: e.erased,
		remaining: e.remaining
	};
}
/** The context's names that hold plaintext in the person's own directory `sourceDir`. */
function plaintextContextAt(o) {
	return o.layout.context.filter((n) => {
		try {
			fs.lstatSync(path.join(o.sourceDir, n));
			return true;
		} catch {
			return false;
		}
	}).toSorted();
}
/**
* Adopt the context the person's own directory holds in plaintext (a person's step, with the
* launch's box): each file is sealed into the store, then the plaintext erased. Call it under
* withContextLock, with the store's verdict checked first; record the returned digest.
*/
function adoptPlaintextContext(o) {
	const problem = layoutProblem(o.layout);
	if (problem) return fail("layout-invalid", problem);
	fs.mkdirSync(o.sealedDir, {
		recursive: true,
		mode: 448
	});
	const { files, skipped } = contextFiles(o.sourceDir, o.layout);
	let sealed = 0;
	for (const rel of files) {
		const p = path.join(o.sourceDir, ...rel.split("/"));
		const fd = fs.openSync(p, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
		let bytes;
		try {
			bytes = fs.readFileSync(fd);
		} finally {
			fs.closeSync(fd);
		}
		writeBlob(o.sealedDir, o.box, o.label, rel, bytes);
		bytes.fill(0);
		sealed++;
	}
	let erased = 0;
	const remaining = [];
	for (const n of plaintextContextAt({
		sourceDir: o.sourceDir,
		layout: o.layout
	})) {
		const e = eraseTree(path.join(o.sourceDir, n));
		erased += e.erased;
		remaining.push(...e.remaining);
	}
	return {
		ok: true,
		sealed,
		kept: 0,
		removed: 0,
		skipped: skipped.toSorted(),
		digest: sealedContextDigest(o.sealedDir) ?? "",
		erased,
		remaining
	};
}
/** Erase every sealed record (a person's discard of a context the log does not vouch for). Record the empty digest. */
function discardSealedContext(sealedDir) {
	const s = listStore(sealedDir);
	let erased = 0;
	const remaining = [];
	for (const n of [...s?.blobs ?? [], ...s?.foreign ?? []]) {
		const e = eraseTree(path.join(sealedDir, n));
		erased += e.erased;
		remaining.push(...e.remaining);
	}
	return {
		erased,
		remaining
	};
}
/**
* Session directories under `parent` whose launcher is gone (it ended without sealing: killed, or
* the computer stopped): each is sealed with its manifest's baseline and erased. `onSealed` (under
* the store's lock) records each new digest. A directory without a readable manifest is erased.
*/
async function recoverContextDirs(o) {
	let names = [];
	try {
		names = fs.readdirSync(o.parent).filter((n) => n.startsWith("c-"));
	} catch {
		return 0;
	}
	let n = 0;
	for (const name of names.toSorted()) {
		const dir = path.join(o.parent, name);
		let m = null;
		try {
			if (!fs.lstatSync(dir).isDirectory()) continue;
			m = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), "utf8"));
		} catch {
			m = null;
		}
		const pid = typeof m?.pid === "number" ? m.pid : null;
		let alive = false;
		if (pid !== null) try {
			process.kill(pid, 0);
			alive = pid !== process.pid;
		} catch {
			alive = false;
		}
		if (alive) continue;
		if (m?.label !== o.label || m?.sealedDir !== o.sealedDir || !m?.baseline?.files) {
			if (m === null && plaintextContextAt({
				sourceDir: dir,
				layout: o.layout
			}).length === 0) eraseTree(dir);
			continue;
		}
		const baseline = m.baseline;
		await withContextLock(o.sealedDir, async () => {
			const r = sealContextFrom({
				dir,
				sealedDir: o.sealedDir,
				box: o.box,
				label: o.label,
				layout: o.layout,
				baseline
			});
			if (r.ok) {
				await o.onSealed(r, dir);
				n++;
			}
		});
	}
	return n;
}
//#endregion
//#region src/enclawed/adapter/tool-credentials.ts
/** The tools and their documented variables. */
const TOOL_REDIRECTS = [
	{
		tool: "gh",
		env: "GH_CONFIG_DIR",
		rel: ".config/gh",
		seed: [".config/gh"]
	},
	{
		tool: "npm",
		env: "NPM_CONFIG_USERCONFIG",
		rel: ".npmrc",
		seed: [".npmrc"]
	},
	{
		tool: "aws",
		env: "AWS_SHARED_CREDENTIALS_FILE",
		rel: ".aws/credentials",
		seed: [".aws/credentials"]
	},
	{
		tool: "aws",
		env: "AWS_CONFIG_FILE",
		rel: ".aws/config",
		seed: [".aws/config"]
	},
	{
		tool: "gcloud",
		env: "CLOUDSDK_CONFIG",
		rel: ".config/gcloud",
		seed: [".config/gcloud"]
	},
	{
		tool: "az",
		env: "AZURE_CONFIG_DIR",
		rel: ".azure",
		seed: [".azure"]
	},
	{
		tool: "docker",
		env: "DOCKER_CONFIG",
		rel: ".docker",
		seed: [".docker/config.json"]
	},
	{
		tool: "kubectl",
		env: "KUBECONFIG",
		rel: ".kube/config",
		seed: [".kube/config"]
	},
	{
		tool: "huggingface",
		env: "HF_TOKEN_PATH",
		rel: ".cache/huggingface/token",
		seed: [".cache/huggingface/token"]
	},
	{
		tool: "terraform",
		env: "TF_CLI_CONFIG_FILE",
		rel: ".terraformrc",
		seed: [".terraformrc"]
	},
	{
		tool: "vault",
		env: "VAULT_CONFIG_PATH",
		rel: ".vault",
		seed: [".vault"]
	}
];
/** Git: a global config of the session's own that includes the person's, with a store of the session's. */
const GIT_CREDENTIALS = ".git-credentials";
const GIT_CONFIG = ".gitconfig-session";
/** The variables removed from the session's environment: the OS keyring (secret service) and the agent's own git config overrides. */
const TOOL_ENV_REMOVED = [
	"DBUS_SESSION_BUS_ADDRESS",
	"GIT_CONFIG_GLOBAL",
	"GNOME_KEYRING_CONTROL"
];
/** The tools store's layout (context-seal.ts): the mirrored names, and what the sweep found elsewhere. */
const SWEPT = "swept";
function toolCredentialLayout() {
	const tops = new Set([SWEPT, GIT_CREDENTIALS]);
	for (const r of TOOL_REDIRECTS) tops.add(r.rel.split("/")[0]);
	return {
		context: [...tops].toSorted(),
		linked: {},
		copied: {}
	};
}
const SEED_FILE_MAX = 16 * 1024 * 1024;
const SEED_FILES_MAX = 2e3;
/**
* Seed the session's directory (opened by context-seal.ts openContextInto) with a copy of the
* person's own configuration of each redirected tool: a path already opened from the store wins.
* Returns the baseline extended by the seed, so that only what the session makes or changes is
* sealed. Regular files only; links are not followed.
*/
function seedToolCredentials(o) {
	const files = { ...o.baseline.files };
	let count = 0;
	const copy = (rel, depth) => {
		const src = path.join(o.home, ...rel.split("/"));
		let st;
		try {
			st = fs.lstatSync(src);
		} catch {
			return;
		}
		if (st.isDirectory() && depth < 8) {
			for (const n of fs.readdirSync(src).toSorted()) copy(`${rel}/${n}`, depth + 1);
			return;
		}
		if (!st.isFile() || st.size > SEED_FILE_MAX || count >= SEED_FILES_MAX) return;
		const dst = path.join(o.dir, ...rel.split("/"));
		if (fs.existsSync(dst)) return;
		fs.mkdirSync(path.dirname(dst), {
			recursive: true,
			mode: 448
		});
		const bytes = fs.readFileSync(src);
		fs.writeFileSync(dst, bytes, {
			mode: 384,
			flag: "wx"
		});
		files[rel] = {
			sha256: createHash("sha256").update(bytes).digest("hex"),
			blob: ""
		};
		bytes.fill(0);
		count++;
	};
	for (const r of TOOL_REDIRECTS) for (const s of r.seed) copy(s, 0);
	copy(GIT_CREDENTIALS, 0);
	const baseline = {
		files,
		superseded: o.baseline.superseded
	};
	const manifest = path.join(o.dir, ".enclawed-context.json");
	try {
		const m = JSON.parse(fs.readFileSync(manifest, "utf8"));
		fs.writeFileSync(manifest, JSON.stringify({
			...m,
			baseline
		}), { mode: 384 });
	} catch {}
	return baseline;
}
/**
* The session's environment for its tools: each redirected variable pointed into `dir`, git's
* global config replaced by the session's own (which includes the person's, then keeps
* credentials only in the session's store), and the OS keyring removed.
*/
function toolCredentialEnv(o) {
	const out = { ...o.env };
	for (const name of TOOL_ENV_REMOVED) delete out[name];
	for (const r of TOOL_REDIRECTS) out[r.env] = path.join(o.dir, ...r.rel.split("/"));
	const gitconfig = path.join(o.dir, GIT_CONFIG);
	if (!fs.existsSync(gitconfig)) {
		const includes = [path.join(o.home, ".gitconfig"), path.join(o.home, ".config", "git", "config")].filter((p) => fs.existsSync(p)).map((p) => `[include]\n\tpath = ${JSON.stringify(p)}\n`).join("");
		const store = path.join(o.dir, GIT_CREDENTIALS);
		fs.writeFileSync(gitconfig, `${includes}[credential]\n\thelper =\n\thelper = ${JSON.stringify(`store --file=${store}`)}\n`, {
			mode: 384,
			flag: "wx"
		});
	}
	out.GIT_CONFIG_GLOBAL = gitconfig;
	return out;
}
/** Dot-entries never indexed: caches and stores of other kinds, and the host's own state (never touched). */
const INDEX_SKIP = new Set([
	".cache",
	".npm",
	".pnpm-store",
	".local",
	".vscode-server",
	".vscode",
	".cursor-server",
	".rustup",
	".nvm",
	".bun",
	".deno",
	".gradle",
	".m2",
	".cargo",
	".pyenv",
	".conda",
	".mozilla",
	".java",
	".dotnet"
]);
const INDEX_MAX = 2e4;
const INDEX_DEPTH = 4;
const RESTORE_MAX = 4 * 1024 * 1024;
/**
* The floor's locations: HOME_CREDENTIAL_PATHS without the stores that change on their own in
* ordinary use (gpg's state, the desktop keyrings, password managers' stores): restoring those to
* their bytes at launch would undo the person's own work, and the session cannot reach the keyring
* (its bus is removed) or is not given them.
*/
const FLOOR_PATHS = HOME_CREDENTIAL_PATHS.filter((p) => ![
	".gnupg",
	".local/share/keyrings",
	".password-store",
	".config/op"
].includes(p));
function walkFiles(root, rel, depth, out) {
	let st;
	try {
		st = fs.lstatSync(path.join(root, ...rel.split("/")));
	} catch {
		return;
	}
	if (st.isDirectory()) {
		if (depth >= INDEX_DEPTH) return;
		let names = [];
		try {
			names = fs.readdirSync(path.join(root, ...rel.split("/")));
		} catch {
			return;
		}
		for (const n of names.toSorted()) {
			if (n === "node_modules" || n === ".git") continue;
			walkFiles(root, `${rel}/${n}`, depth + 1, out);
		}
	} else if (st.isFile()) out(rel, st);
}
/**
* Snapshot the floor at launch. `excluded`: names at the top of the home directory that are never
* indexed or swept (the host's own state directories, Enclawed's state).
*/
function snapshotCredentialFloor(o) {
	const floor = /* @__PURE__ */ new Map();
	const index = /* @__PURE__ */ new Map();
	const floorTops = new Set(FLOOR_PATHS);
	for (const fp of FLOOR_PATHS) walkFiles(o.home, fp, 0, (rel, st) => {
		const bytes = fs.readFileSync(path.join(o.home, ...rel.split("/")));
		floor.set(rel, {
			sha256: createHash("sha256").update(bytes).digest("hex"),
			bytes: st.size <= RESTORE_MAX ? bytes : null
		});
		return true;
	});
	let names = [];
	try {
		names = fs.readdirSync(o.home);
	} catch {
		names = [];
	}
	for (const n of names.toSorted()) {
		if (!n.startsWith(".") || INDEX_SKIP.has(n) || o.excluded.includes(n)) continue;
		walkFiles(o.home, n, 0, (rel, st) => {
			if (index.size >= INDEX_MAX || floorTops.has(rel)) return false;
			index.set(rel, {
				mtimeMs: st.mtimeMs,
				size: st.size,
				ino: st.ino
			});
			return true;
		});
	}
	return {
		home: o.home,
		floor,
		index
	};
}
/** Whether `rel` is below one of the floor's locations. */
const underFloor = (rel) => HOME_CREDENTIAL_PATHS.some((fp) => rel === fp || rel.startsWith(`${fp}/`));
const underSweptFloor = (rel) => FLOOR_PATHS.some((fp) => rel === fp || rel.startsWith(`${fp}/`));
/**
* At the end of the session: what appeared in the floor or the dot-entries that is a credential
* (by location, name or content), and the floor files that changed. Each new one is copied into
* `into` (the session's tools directory, under `swept/`, to be sealed with it) and erased from the
* home directory; each changed floor file is copied likewise and restored to its bytes at launch
* (one too large to have been kept is reported, never erased). Nothing that existed at launch is
* removed. `excluded` as for the snapshot.
*/
function sweepCredentialFloor(o) {
	const home = o.snapshot.home;
	const found = [];
	const keep = (rel, bytes) => {
		const dst = path.join(o.into, SWEPT, ...rel.split("/"));
		fs.mkdirSync(path.dirname(dst), {
			recursive: true,
			mode: 448
		});
		fs.writeFileSync(dst, bytes, { mode: 384 });
	};
	const eraseOne = (abs) => {
		try {
			const st = fs.lstatSync(abs);
			if (st.isFile()) {
				const fd = fs.openSync(abs, fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW);
				try {
					fs.writeSync(fd, Buffer.alloc(Math.max(st.size, 1)), 0, Math.max(st.size, 1), 0);
				} finally {
					fs.closeSync(fd);
				}
			}
			fs.unlinkSync(abs);
		} catch {}
	};
	const credentialWhy = (rel, abs) => {
		if (underSweptFloor(rel)) return "a credential location";
		const byName = credentialPathOf(abs, home);
		if (byName) return byName.what;
		return secretContentOf(abs, credentialFindings);
	};
	for (const fp of FLOOR_PATHS) walkFiles(home, fp, 0, (rel) => {
		const abs = path.join(home, ...rel.split("/"));
		let bytes;
		try {
			const fd = fs.openSync(abs, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
			try {
				bytes = fs.readFileSync(fd);
			} finally {
				fs.closeSync(fd);
			}
		} catch {
			return true;
		}
		const was = o.snapshot.floor.get(rel);
		const sha = createHash("sha256").update(bytes).digest("hex");
		if (!was) {
			keep(rel, bytes);
			eraseOne(abs);
			found.push({
				rel,
				change: "new",
				why: "a credential location"
			});
		} else if (was.sha256 !== sha) {
			keep(rel, bytes);
			if (was.bytes) {
				fs.writeFileSync(abs, was.bytes);
				found.push({
					rel,
					change: "changed",
					why: "a credential location"
				});
			} else found.push({
				rel,
				change: "changed-unrestorable",
				why: "a credential location"
			});
		}
		bytes.fill(0);
		return true;
	});
	let names = [];
	try {
		names = fs.readdirSync(home);
	} catch {
		names = [];
	}
	for (const n of names.toSorted()) {
		if (!n.startsWith(".") || INDEX_SKIP.has(n) || o.excluded.includes(n)) continue;
		walkFiles(home, n, 0, (rel, st) => {
			if (underFloor(rel) || o.snapshot.index.has(rel)) {
				const was = o.snapshot.index.get(rel);
				if (was && (was.mtimeMs !== st.mtimeMs || was.size !== st.size)) {
					const abs = path.join(home, ...rel.split("/"));
					const why = !underFloor(rel) ? secretContentOf(abs, credentialFindings) : null;
					if (why) found.push({
						rel,
						change: "changed-unrestorable",
						why
					});
				}
				return true;
			}
			const abs = path.join(home, ...rel.split("/"));
			const why = credentialWhy(rel, abs);
			if (why) {
				const bytes = fs.readFileSync(abs);
				keep(rel, bytes);
				bytes.fill(0);
				eraseOne(abs);
				found.push({
					rel,
					change: "new",
					why
				});
			}
			return true;
		});
	}
	return found.toSorted((a, b) => a.rel < b.rel ? -1 : 1);
}
/** The identities the ssh agent at `env.SSH_AUTH_SOCK` holds (public key lines), or null (no agent). */
function sshAgentIdentities(env) {
	if (!env.SSH_AUTH_SOCK) return null;
	const r = spawnSync("ssh-add", ["-L"], {
		env: {
			PATH: env.PATH ?? process.env.PATH,
			SSH_AUTH_SOCK: env.SSH_AUTH_SOCK
		},
		encoding: "utf8",
		timeout: 1e4
	});
	if (r.error || r.status !== 0 && r.status !== 1) return null;
	return (r.stdout ?? "").split("\n").map((l) => l.trim()).filter((l) => /^(ssh-|ecdsa-|sk-)/.test(l)).toSorted();
}
/**
* Remove from the agent the identities it holds now that it did not hold at launch (`before`).
* Returns the removed key types and fingerprints (never key material), and those it could not remove.
*/
function removeAddedSshIdentities(env, before) {
	const now = sshAgentIdentities(env);
	if (!now || before === null) return {
		removed: [],
		failed: []
	};
	const had = new Set(before);
	const removed = [];
	const failed = [];
	for (const line of now.filter((l) => !had.has(l))) {
		const [type, b64] = line.split(/\s+/);
		const fp = `${type} SHA256:${createHash("sha256").update(Buffer.from(b64 ?? "", "base64")).digest("base64").replace(/=+$/, "")}`;
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-ssh-"));
		const pub = path.join(tmp, "k.pub");
		fs.writeFileSync(pub, `${type} ${b64}\n`, { mode: 384 });
		const r = spawnSync("ssh-add", ["-d", pub], {
			env: {
				PATH: env.PATH ?? process.env.PATH,
				SSH_AUTH_SOCK: env.SSH_AUTH_SOCK
			},
			encoding: "utf8",
			timeout: 1e4
		});
		fs.rmSync(tmp, {
			recursive: true,
			force: true
		});
		(r.status === 0 ? removed : failed).push(fp);
	}
	return {
		removed,
		failed
	};
}
//#endregion
//#region src/enclawed/adapter/digest-approval.ts
const DOMAIN = Object.freeze({
	measurement: "enclawed.measurement.v1",
	policy: "enclawed.policy.v1",
	credential: "enclawed.credential.v1"
});
const PURPOSE = Object.freeze({
	measurement: "admin",
	policy: "policy-change",
	credential: "auth-change"
});
const HEX32 = /^[0-9a-f]{64}$/;
/** The 32-byte nonce the device signs its verdict over, for `kind` and `digest`. */
function approvalNonce(kind, digest) {
	if (!Object.hasOwn(DOMAIN, kind)) throw new Error(`unknown approval kind ${JSON.stringify(kind)}`);
	return createHash("sha256").update(DOMAIN[kind]).update("\0").update(digestBytes(digest)).digest();
}
function digestBytes(d) {
	if (typeof d !== "string" || !HEX32.test(d)) throw new Error("an approved digest is 64 lowercase hex digits");
	return Buffer.from(d, "hex");
}
/**
* Ask the bound device to approve `digest` for `kind` with the authenticator
* code the person typed. Only a passing verdict, signed by the bound device
* over this digest's nonce for the kind's purpose, is returned.
*/
async function approveDigest(o) {
	const seam = o.device ?? frameworkDeviceTotp;
	const access = seam.access();
	if (!access) return {
		ok: false,
		code: "no-device",
		message: "no Enclaweder that this process can use is bound and CLEAN"
	};
	let nonce;
	try {
		nonce = approvalNonce(o.kind, o.digest);
	} catch (err) {
		return {
			ok: false,
			code: "malformed",
			message: err.message
		};
	}
	const purpose = PURPOSE[o.kind];
	let r;
	try {
		r = await seam.verdict(access, {
			code: o.code.trim(),
			purpose,
			nonce
		});
	} catch (err) {
		return {
			ok: false,
			code: "device-error",
			message: `the Enclaweder did not answer (${err.message})`
		};
	}
	if (!r.ok) return {
		ok: false,
		code: r.code,
		message: r.code === "rejected" ? "the Enclaweder did not accept the authenticator code" : r.code === "clock-disagrees" ? CLOCK_DISAGREES_TEXT : `the Enclaweder refused (${r.code})`
	};
	const v = seam.verifyRecord(r.record, {
		purpose,
		nonce,
		pubkeyRaw: access.pubkeyRaw,
		uid: access.uid
	});
	if (!v.ok) return {
		ok: false,
		code: "bad-record",
		message: `the Enclaweder's verdict does not verify (${v.reason})`
	};
	return {
		ok: true,
		approval: {
			v: 1,
			kind: o.kind,
			digest: o.digest,
			verdict: r.record,
			note: o.note ?? null
		}
	};
}
/**
* Check a stored approval offline: for this kind and digest, a passing
* verdict for the kind's purpose over the digest's nonce, signed by one of
* `devices`. null when it approves, else why not.
*/
function checkDigestApproval(approval, expect, verifyRecord = frameworkDeviceTotp.verifyRecord) {
	const a = approval;
	if (!a || typeof a !== "object" || a.v !== 1) return "no approval";
	if (a.kind !== expect.kind || a.digest !== expect.digest) return `the approval is for another ${a.kind === expect.kind ? "digest" : "kind"}`;
	let nonce;
	try {
		nonce = approvalNonce(expect.kind, expect.digest);
	} catch (err) {
		return err.message;
	}
	const reasons = [];
	for (const d of expect.devices) {
		if (!HEX32.test(d.pub) || !/^[0-9a-f]{24}$/.test(d.uid)) continue;
		const v = verifyRecord(a.verdict, {
			purpose: PURPOSE[expect.kind],
			nonce,
			pubkeyRaw: Buffer.from(d.pub, "hex"),
			uid: Buffer.from(d.uid, "hex")
		});
		if (v.ok) return null;
		reasons.push(v.reason);
	}
	return reasons.length ? `the approval does not verify (${reasons[0]})` : "no device to check the approval against";
}
const MAX_KEPT = 32;
/** Read the approvals file (missing or unreadable: none). */
function readApprovals(file) {
	try {
		const doc = JSON.parse(fs.readFileSync(file, "utf8"));
		return doc?.v === 1 && Array.isArray(doc.approvals) ? doc.approvals : [];
	} catch {
		return [];
	}
}
/** Add an approval (newest first, at most 32 kept; the same kind and digest replaced). Atomic, 0600. */
function storeApproval(file, approval) {
	const doc = {
		v: 1,
		approvals: [approval, ...readApprovals(file).filter((a) => !(a.kind === approval.kind && a.digest === approval.digest))].slice(0, MAX_KEPT)
	};
	fs.mkdirSync(path.dirname(file), {
		recursive: true,
		mode: 448
	});
	const tmp = `${file}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, { mode: 384 });
	fs.renameSync(tmp, file);
}
/** The approval in `file` that approves `kind`/`digest` for one of `devices`, or why none does. */
function findApproval(file, expect, verifyRecord) {
	const candidates = readApprovals(file).filter((a) => a?.kind === expect.kind && a?.digest === expect.digest);
	if (!candidates.length) return {
		ok: false,
		reason: `no device-signed approval for this ${expect.kind}`
	};
	let last = "";
	for (const a of candidates) {
		const why = checkDigestApproval(a, expect, verifyRecord);
		if (!why) return {
			ok: true,
			approval: a
		};
		last = why;
	}
	return {
		ok: false,
		reason: last
	};
}
function stampOf(p) {
	const st = fs.statSync(p, { bigint: true });
	return {
		path: p,
		dev: Number(st.dev),
		ino: Number(st.ino),
		size: Number(st.size),
		ctimeNs: st.ctimeNs.toString()
	};
}
/**
* Measure the files that decide a session (`entries`: a stable name for each,
* and its path). Throws if one cannot be read: a launch whose code cannot be
* measured is refused by the caller.
*/
function measureFiles(entries) {
	const names = /* @__PURE__ */ new Set();
	const files = entries.map((e) => {
		if (names.has(e.name)) throw new Error(`measured twice: ${e.name}`);
		names.add(e.name);
		return {
			name: e.name,
			path: e.path,
			sha256: createHash("sha256").update(fs.readFileSync(e.path)).digest("hex")
		};
	}).toSorted((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	const h = createHash("sha256").update("enclawed.measurement.v1\0");
	for (const f of files) h.update(`${f.name}\0${f.sha256}\n`);
	return {
		digest: h.digest("hex"),
		files,
		stamps: entries.map((e) => stampOf(e.path))
	};
}
/**
* Whether the measured files are still the ones measured, by their stat
* identity (cheap enough to check before every committed call): null when
* unchanged, else the first changed path. A file written and restored
* reads as changed (its change time moved).
*/
function measurementChanged(stamps) {
	for (const s of stamps) {
		let now;
		try {
			now = stampOf(s.path);
		} catch {
			return s.path;
		}
		if (now.dev !== s.dev || now.ino !== s.ino || now.size !== s.size || now.ctimeNs !== s.ctimeNs) return s.path;
	}
	return null;
}
/**
* With the hardware root required, a launch needs a device-signed approval
* of its measurement, and of its effective policy unless that policy is the
* managed (root-owned) one or the built-in default (`policyNeedsApproval`
* false). Without the root required, nothing is asked.
*/
function decideApprovalGate(o) {
	if (!o.rootRequired) return {
		ok: true,
		measurement: null,
		policy: null
	};
	const m = findApproval(o.approvalsFile, {
		kind: "measurement",
		digest: o.measurementDigest,
		devices: o.devices
	}, o.verifyRecord);
	if (!m.ok) return {
		ok: false,
		code: "measurement-not-approved",
		reason: m.reason,
		digest: o.measurementDigest
	};
	if (!o.policyNeedsApproval) return {
		ok: true,
		measurement: m.approval,
		policy: null
	};
	const p = findApproval(o.approvalsFile, {
		kind: "policy",
		digest: o.policyDigest,
		devices: o.devices
	}, o.verifyRecord);
	if (!p.ok) return {
		ok: false,
		code: "policy-not-approved",
		reason: p.reason,
		digest: o.policyDigest
	};
	return {
		ok: true,
		measurement: m.approval,
		policy: p.approval
	};
}
/**
* Whether an effective policy (policy-layers.ts layerPolicies) needs a
* person's device approval: when a policy file the user can write was read
* into it. The managed (root-owned) policy and the built-in defaults need
* none, and neither does a user file that was not read (`note`).
*/
function policyNeedsApproval(layered) {
	return layered.kind !== null && layered.kind !== "managed" && layered.note === null;
}
//#endregion
//#region src/enclawed/adapter/host.ts
/**
* Assess a host. R1 is necessary: without a pre-tool hook that can deny
* every call there is no reference monitor, and the host is not supported.
* Every other shortfall is a gap the adapter must cover, said in plain words.
*/
function assessHost(c) {
	const met = [];
	const gaps = [];
	const h = c.preToolHook;
	const r1 = h.canDeny && h.coversAllTools;
	if (r1) {
		met.push("R1");
		if (h.onFailure !== "blocks" && h.onFailure !== "blocks-when-configured") gaps.push("a hook that crashes or times out lets the call run: keep the hook bounded and linear-time, and stop the session at the first call the transcript shows without a decision");
		else if (h.onFailure === "blocks-when-configured") gaps.push("the hook fails closed only when configured to: the adapter must always set that option");
		if (h.coversSubagents !== "yes") gaps.push("the hook is not documented to see subagents' calls: refuse to start subagents, or confirm coverage with a test against the host");
		if (h.delivery === "in-process-plugin") gaps.push("the hook is a plugin inside the host process: forward each call to Enclawed's external hook, and refuse at launch any project plugin, which would share that process");
	} else gaps.push(h.canDeny ? "the pre-tool hook does not see every kind of call (built-in, shell, file and MCP), so some calls would run unchecked" : "the host has no pre-tool hook that can deny a call, so it cannot be governed without modifying it");
	const cleanerApplies = c.outputRewrite === "full";
	if (cleanerApplies) met.push("R2");
	else gaps.push("the host cannot replace a tool's result before the model reads it, so hidden instructions in results cannot be removed (the action gate still decides every call)");
	const s = c.settingsInjection;
	if ((s.channel === "flag" || s.channel === "environment") && s.ranksAboveRepository === "yes" && s.projectHooksVisible === "yes") met.push("R3");
	else gaps.push("a repository can add or outrank hooks and command settings: the launcher must find and refuse them before every start");
	const t = c.transcript;
	if (t.onDisk === "yes" && t.stableCallIds === "yes") {
		met.push("R4");
		if (t.formatStable !== "yes") gaps.push("the transcript format may change between host versions: pin the versions the adapter's parser was tested with");
	} else gaps.push("there is no transcript with stable call ids: a call that ran without a decision, or a forged decision, is detected later or not at all");
	return {
		supported: r1,
		met,
		gaps,
		cleanerApplies
	};
}
//#endregion
//#region src/enclawed/adapter/launch-refusals.ts
/**
* Does the project directory overlap one of the protected roots? null: the
* launch may go on. `realpath` resolves a path (default: the nearest existing
* prefix's realpath); it is a seam for tests only.
*/
function decideProjectOverlap(o) {
	const real = o.realpath ?? realpathNearestSync;
	const project = real(path.resolve(o.projectDir));
	for (const r of o.roots) {
		if (typeof r.path !== "string" || r.path === "") continue;
		const prot = real(path.resolve(r.path));
		const contains = isInside(project, prot);
		const inside = isInside(prot, project);
		if (!contains && !inside) continue;
		const code = contains && inside ? "project-is-protected" : contains ? "project-contains-protected" : "project-inside-protected";
		const relation = code === "project-is-protected" ? `is ${r.label}` : code === "project-contains-protected" ? `contains ${r.label} (${prot})` : `is inside ${r.label} (${prot})`;
		return {
			code,
			label: r.label,
			project,
			protectedPath: prot,
			message: `the project directory ${project} ${relation}; run it in a project directory`
		};
	}
	return null;
}
/**
* The first host option in `args` that turns the on-disk transcript off, or
* null. `flags` are the host's flag names (adapter data); `--flag=value` counts
* too. Arguments after `--` are the prompt, not options.
*/
function transcriptDisablingFlag(args, flags) {
	const end = args.indexOf("--");
	for (const a of end < 0 ? args : args.slice(0, end)) {
		if (typeof a !== "string") continue;
		const name = a.startsWith("--") && a.includes("=") ? a.slice(0, a.indexOf("=")) : a;
		if (flags.includes(name)) return a;
	}
	return null;
}
/** The launch decision for R4: null, or the refusal (with `host` naming the plain command to run instead). */
function decideTranscriptFlags(args, flags, host) {
	const flag = transcriptDisablingFlag(args, flags);
	if (flag === null) return null;
	return {
		code: "transcript-disabled",
		flag,
		message: `${flag} stops ${host} from writing the transcript Enclawed watches to detect a tool call that ran without Enclawed's hook; run plain \`${host} ${flag}\` if you mean to work without it`
	};
}
/**
* The launch decision for R1: a flag among the host's options (before `--`)
* that turns off the settings hooks would switch Enclawed off for the whole
* session, so the launch is refused. `flags` is the host's list (data).
*/
function decideHookFlags(args, flags, host) {
	const flag = transcriptDisablingFlag(args, flags);
	if (flag === null) return null;
	return {
		code: "hooks-disabled",
		flag,
		message: `${flag} turns off settings hooks, which would switch Enclawed off; run plain \`${host} ${flag}\` if you mean to work without it`
	};
}
/**
* What to do when the deadline passes without a handshake. Headless (no
* person watching): stop the host. Interactive: warn; every call waits for
* the hooks and is refused without them, and a call that runs anyway stops
* the session (transcript watch).
*/
function handshakeTimeoutAction(o) {
	const refused = o.refused ? ` (refused: ${o.refused})` : "";
	return o.headless ? {
		action: "stop-host",
		code: "no-handshake-headless",
		reason: `Enclawed's hooks did not start within 30 s (no verified session-start handshake${refused}); stopping the host`
	} : {
		action: "warn",
		code: "no-handshake-interactive",
		reason: `Enclawed's hooks have not started after 30 s${refused}; every tool call waits for them and is refused without them, and a call that runs anyway stops the session`
	};
}
/**
* The end-of-session verdict. null: a handshake was expected and done, or none
* was expected (no session channel). Otherwise the session fails when the
* launcher stopped the host for the timeout or the host exited 0 (it worked
* unchecked); a host that failed by itself keeps its own exit, still recorded.
*/
function noHandshakeVerdict(o) {
	if (!o.expected || o.done) return null;
	return {
		code: "no-handshake",
		failSession: o.stoppedForTimeout || o.hostExitCode === 0,
		reason: "Enclawed's hooks never reported in this session; treat anything it did as unchecked (reconcile the audit log)"
	};
}
//#endregion
//#region src/enclawed/adapter/transport.ts
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
var SessionFileError = class extends Error {
	constructor(..._args) {
		super(..._args);
		this.name = "SessionFileError";
	}
};
const myUid = () => typeof process.getuid === "function" ? process.getuid() : null;
/** A directory of this user's own that no other user may enter. Throws otherwise. */
function ownedPrivateDir(dir) {
	const st = fs.lstatSync(dir);
	if (!st.isDirectory()) throw new Error(`${dir} is not a directory`);
	const uid = myUid();
	if (uid !== null && st.uid !== uid) throw new Error(`${dir} belongs to another user`);
	if (process.platform !== "win32" && (st.mode & 63) !== 0) throw new Error(`${dir} is open to other users (mode ${(st.mode & 511).toString(8)})`);
}
/** Launcher side: write the session file (0600, never over an existing file) and return its digest. */
function writeSessionFile(dir, session) {
	ownedPrivateDir(dir);
	const file = path.join(dir, "session.json");
	const text = `${JSON.stringify({
		...session,
		v: 1
	}, null, 2)}\n`;
	fs.writeFileSync(file, text, {
		mode: 384,
		flag: "wx"
	});
	return {
		file,
		digest: sha256(text)
	};
}
/** Launcher side: replace the session file atomically; the new digest goes on the next hook command line. */
function rewriteSessionFile(file, session) {
	const text = `${JSON.stringify({
		...session,
		v: 1
	}, null, 2)}\n`;
	const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
	fs.writeFileSync(tmp, text, {
		mode: 384,
		flag: "wx"
	});
	fs.renameSync(tmp, file);
	return sha256(text);
}
/**
* Hook side: read the session file named on the command line, and accept it
* only when it is a regular file (no symlink), this user's, not open to other
* users, in a private directory, with exactly the digest the launcher recorded.
*/
function readSessionFile(file, digest) {
	if (typeof file !== "string" || !path.isAbsolute(file)) throw new SessionFileError("no session file on the hook command line");
	if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) throw new SessionFileError("no session digest on the hook command line");
	let fd;
	try {
		fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
	} catch (err) {
		throw new SessionFileError(`cannot open the session file ${file}: ${err.message}`);
	}
	try {
		const st = fs.fstatSync(fd);
		if (!st.isFile()) throw new SessionFileError(`${file} is not a regular file`);
		const uid = myUid();
		if (uid !== null && st.uid !== uid) throw new SessionFileError(`${file} belongs to another user`);
		if (process.platform !== "win32" && (st.mode & 63) !== 0) throw new SessionFileError(`${file} is readable or writable by other users`);
		try {
			ownedPrivateDir(path.dirname(file));
		} catch (err) {
			throw new SessionFileError(`session directory: ${err.message}`);
		}
		const buf = fs.readFileSync(fd);
		if (sha256(buf) !== digest) throw new SessionFileError(`${file} does not match the digest recorded at launch; it was changed`);
		let s;
		try {
			s = JSON.parse(buf.toString("utf8"));
		} catch {
			throw new SessionFileError(`${file} is not valid JSON`);
		}
		if (s?.v !== 1) throw new SessionFileError(`${file} has an unsupported version`);
		return s;
	} finally {
		fs.closeSync(fd);
	}
}
/**
* Variables that make node (or the dynamic loader) run other code: every
* NODE_*, the loader's LD_PRELOAD / LD_AUDIT / LD_LIBRARY_PATH, and macOS
* DYLD_*. The genuine hook starts with an emptied environment, so its
* environment has none of them.
*/
const CODE_LOADING_ENV = /^(NODE_[A-Z0-9_]*|LD_PRELOAD|LD_AUDIT|LD_LIBRARY_PATH|DYLD_[A-Z_]*)$/;
/**
* The first code-loading variable in a process's initial environment (the
* NUL-separated /proc/<pid>/environ bytes, or a record), or null. An
* environment that could not be read (null) counts as a risk: fail closed.
*/
function envCodeLoadingRisk(environ) {
	if (environ === null) return "an unreadable environment";
	return (typeof environ === "string" || Buffer.isBuffer(environ) ? Buffer.from(environ).toString("latin1").split("\0").map((e) => e.indexOf("=") < 0 ? e : e.slice(0, e.indexOf("="))) : Object.keys(environ)).find((n) => CODE_LOADING_ENV.test(n)) ?? null;
}
/** The variables a hook needs from the launcher's environment, on every host. */
const HOOK_PASS_ENV = [
	"HOME",
	"USERPROFILE",
	"PATH",
	"LANG",
	"LC_ALL",
	"XDG_RUNTIME_DIR",
	"SYSTEMROOT",
	"COMSPEC",
	"PATHEXT",
	"WINDIR"
];
const FRAMEWORK_ENV_DROP = new Set(["ENCLAWED_CONFIG_PATH", "ENCLAWED_TEST_FAST"]);
/**
* The environment the hook (and so the framework) runs with: only what the
* launcher resolved. The pass list (HOOK_PASS_ENV plus the host's own, such
* as its config directory), the allowlisted framework variables, then the
* launcher's fixed values. A temporary directory inside the project would be
* agent-writable scratch, so TMPDIR falls back to the session directory.
*/
function hookEnvironment(env, o) {
	const out = {};
	for (const k of [...HOOK_PASS_ENV, ...o.pass ?? []]) {
		const v = env[k];
		if (typeof v === "string" && v !== "" && !CODE_LOADING_ENV.test(k)) out[k] = v;
	}
	for (const [k, v] of Object.entries(env)) if (typeof v === "string" && FRAMEWORK_ENV_ALLOW.has(k) && !FRAMEWORK_ENV_DROP.has(k)) out[k] = v;
	Object.assign(out, o.fixed ?? {});
	const tmp = env.TMPDIR;
	out.TMPDIR = tmp && !isInside(o.projectDir, realpathNearestSync(path.resolve(tmp))) ? tmp : o.sessionDir;
	return out;
}
/** Replace this process's environment wholesale (before the framework is loaded). */
function replaceProcessEnv(next, target = process.env) {
	for (const k of Object.keys(target)) delete target[k];
	Object.assign(target, next);
}
const quotePosix = (s) => /^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
/**
* The shell command line that starts the hook with an emptied environment:
* `env -i NAME="$NAME"... <node> <hook> <args...>`, keeping only the named
* host variables (for example the host's project directory). `envProgram`
* should be a trusted system binary (trustedBinary("env")). With no `env`
* program the environment cannot be emptied, and null is returned: the
* adapter must say so and must not fall back silently.
*/
function emptyEnvCommand(argv, o = {}) {
	const envBin = o.envProgram !== void 0 ? o.envProgram : trustedBinary("env");
	if (!envBin) return null;
	const keep = (o.keep ?? []).filter((k) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k));
	return [
		quotePosix(envBin),
		"-i",
		...keep.map((k) => `${k}="$${k}"`),
		...argv.map(quotePosix)
	].join(" ");
}
function isDescendant(pid, ancestor, parents) {
	let p = pid;
	for (let i = 0; i < 256 && p !== void 0 && p > 1; i++) {
		p = parents.get(p);
		if (p === ancestor) return true;
	}
	return false;
}
/**
* Launcher side: may this connection speak for the hook? The peer must be a
* descendant of the host process the launcher started, run `exe` (this Node,
* real path), have exactly the hook command line, and carry no code-loading
* variable. Where the platform cannot tell who the peer is, the connection is
* accepted UNVERIFIED (`verified: false`): the adapter must record that and
* say it to the person; it never counts as verified.
*/
function verifyHookPeer(peer, expect, probe) {
	if (!peer.available) return {
		ok: true,
		verified: false,
		reason: peer.reason
	};
	if (expect.hostPid === null) return {
		ok: false,
		reason: "the agent CLI has not started"
	};
	if (peer.pid === null) return {
		ok: false,
		reason: peer.reason ?? "unknown peer"
	};
	if (!isDescendant(peer.pid, expect.hostPid, probe.parents())) return {
		ok: false,
		reason: `peer ${peer.pid} is not a process of this session's agent CLI`
	};
	const exe = probe.exe(peer.pid);
	if (exe !== expect.exe) return {
		ok: false,
		reason: `peer ${peer.pid} runs ${exe ?? "(unknown)"}, not this Node`
	};
	const argv = probe.argv(peer.pid);
	if (!argv || argv.length !== expect.argv.length || argv.some((a, i) => a !== expect.argv[i])) return {
		ok: false,
		reason: `peer ${peer.pid} is not running Enclawed's hook command for this session`
	};
	const risk = envCodeLoadingRisk(probe.environ(peer.pid));
	if (risk) return {
		ok: false,
		reason: `peer ${peer.pid} carries ${risk} in its environment, which can load other code into node`
	};
	return {
		ok: true,
		verified: true,
		pid: peer.pid
	};
}
/** Hook side: is the control socket served by the launcher named in the session file? */
function verifyLauncherPeer(peer, launcherPid) {
	if (!peer.available) return {
		ok: true,
		verified: false,
		reason: peer.reason
	};
	return peer.pid === launcherPid ? {
		ok: true,
		verified: true,
		reason: null
	} : {
		ok: false,
		verified: true,
		reason: `the control socket is not served by the launcher (pid ${launcherPid})`
	};
}
/** The Linux process probe (/proc). */
function linuxProcessProbe() {
	return {
		exe(pid) {
			try {
				return fs.readlinkSync(`/proc/${pid}/exe`);
			} catch {
				return null;
			}
		},
		argv(pid) {
			try {
				return fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").slice(0, -1);
			} catch {
				return null;
			}
		},
		environ(pid) {
			try {
				return fs.readFileSync(`/proc/${pid}/environ`);
			} catch {
				return null;
			}
		},
		parents() {
			const map = /* @__PURE__ */ new Map();
			let names = [];
			try {
				names = fs.readdirSync("/proc");
			} catch {
				return map;
			}
			for (const n of names) {
				if (!/^\d+$/.test(n)) continue;
				try {
					const stat = fs.readFileSync(`/proc/${n}/stat`, "utf8");
					const rest = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
					map.set(Number(n), Number(rest[1]));
				} catch {}
			}
			return map;
		}
	};
}
/**
* Linux: the process holding the other end of a unix socket with local inode
* `localInode`, from the kernel's sock_diag answer (`ss -xnH`, a trusted
* system binary) and /proc/<pid>/fd. Elsewhere: unavailable.
*/
function linuxPeerLookup(localInode, o = {}) {
	const ss = process.platform === "linux" ? trustedBinary("ss") : null;
	if (!ss || !fs.existsSync("/proc/self/fd")) return {
		available: false,
		reason: process.platform === "linux" ? "ss (iproute2) is not installed" : `no peer-credential lookup on ${process.platform}`
	};
	if (!localInode) return {
		available: true,
		pid: null,
		reason: "cannot read this end's socket inode"
	};
	const r = spawnSync(ss, o.socketPath ? [
		"-xnH",
		"src",
		o.socketPath
	] : ["-xnH"], {
		encoding: "utf8",
		timeout: 3e3,
		maxBuffer: 32 * 1024 * 1024
	});
	let peerIno = null;
	if (r.status === 0 && typeof r.stdout === "string") for (const line of r.stdout.split("\n")) {
		const t = line.trim().split(/\s+/);
		if (t.length >= 4 && t[t.length - 3] === localInode) {
			peerIno = t[t.length - 1];
			break;
		}
	}
	if (!peerIno) return {
		available: true,
		pid: null,
		reason: "the kernel reports no peer for this connection"
	};
	const want = `socket:[${peerIno}]`;
	const holds = (pid) => {
		try {
			return fs.readdirSync(`/proc/${pid}/fd`).some((fd) => {
				try {
					return fs.readlinkSync(`/proc/${pid}/fd/${fd}`) === want;
				} catch {
					return false;
				}
			});
		} catch {
			return false;
		}
	};
	const pid = (o.candidates ?? [...(o.probe ?? linuxProcessProbe()).parents().keys()]).find(holds) ?? null;
	return {
		available: true,
		pid,
		reason: pid === null ? "no expected process holds the other end" : null
	};
}
/** Recompute an audit record's hash (the framework's buildRecord). */
function recordHashOf$1(rec) {
	return buildRecord({
		prevHash: rec.prevHash,
		type: rec.type,
		actor: rec.actor,
		level: rec.level,
		payload: rec.payload,
		ts: rec.ts
	}).recordHash;
}
/**
* Find the record with `hash` among the audit log's lines and check it is a
* genuine link of the chain: its own hash recomputes, it links to the record
* before it, and every record from `fromHash` (when present) to it links.
*/
function verifyChainedRecord(lines, hash, o = {}) {
	const recs = lines.filter((l) => l.trim() !== "").map((l) => {
		try {
			return JSON.parse(l);
		} catch {
			return null;
		}
	});
	const at = recs.findLastIndex((r) => r?.recordHash === hash);
	if (at < 0) return {
		ok: false,
		reason: "the record is not in the audit log"
	};
	let start = at;
	if (o.fromHash) {
		const f = recs.findIndex((r) => r?.recordHash === o.fromHash);
		if (f >= 0 && f < at) start = f;
	}
	for (let i = start; i <= at; i++) {
		const r = recs[i];
		if (!r || recordHashOf$1(r) !== r.recordHash) return {
			ok: false,
			reason: `audit record ${i + 1} does not hash to its recordHash`
		};
		if (i > 0 && recs[i - 1]?.recordHash !== r.prevHash) return {
			ok: false,
			reason: `audit record ${i + 1} does not link to the record before it`
		};
	}
	return {
		ok: true,
		record: recs[at]
	};
}
/**
* The launcher's half of the handshake. The key lives only in this object
* (the launcher's memory); nothing the session's processes can read holds it.
* A raw line with the nonce counts for nothing: only a chained record of
* `recordType` carrying this launch's nonce and an issued, unused challenge.
*/
var HookHandshake = class {
	constructor(o) {
		this.o = o;
		this.key = randomBytes(32);
		this.counter = 0;
		this.issued = /* @__PURE__ */ new Set();
		this.doneRecord = null;
		this.waiters = /* @__PURE__ */ new Set();
	}
	get done() {
		return this.doneRecord !== null;
	}
	get record() {
		return this.doneRecord;
	}
	/** A challenge for a VERIFIED hook connection (verifyHookPeer). */
	challenge() {
		const c = createHmac("sha256", this.key).update(`challenge|${this.o.nonce}|${this.counter++}`).digest("hex");
		this.issued.add(c);
		return c;
	}
	/** The hook says it wrote its record (with `challenge`) and gives its hash. */
	accept(challenge, recordHash, auditLines) {
		if (!this.issued.has(challenge)) return {
			ok: false,
			reason: "no such challenge was issued, or it was already used"
		};
		const v = verifyChainedRecord(auditLines, recordHash, { fromHash: this.o.launchHash?.() });
		if (!v.ok) return v;
		const p = v.record.payload ?? {};
		if (v.record.type !== this.o.recordType || p.launcherNonce !== this.o.nonce || p.handshake !== challenge) return {
			ok: false,
			reason: "the session-start record does not carry this launch's nonce and challenge"
		};
		this.issued.delete(challenge);
		this.doneRecord = recordHash;
		for (const w of this.waiters) w(true);
		return { ok: true };
	}
	/** Resolves true once the handshake is done, false after `ms` (default: the kit's HANDSHAKE_TIMEOUT_S). */
	wait(ms = 30 * 1e3) {
		if (this.done) return Promise.resolve(true);
		return new Promise((resolve) => {
			const w = (v) => {
				clearTimeout(t);
				this.waiters.delete(w);
				resolve(v);
			};
			const t = setTimeout(() => w(false), ms);
			this.waiters.add(w);
		});
	}
	/**
	* The launch-time deadline: when the handshake is not done HANDSHAKE_TIMEOUT_S
	* after this call, `onTimeout` gets the kit's decision (headless: stop the
	* host; interactive: warn). Returns a cancel function. `setTimer` is a seam
	* for tests (it gets the constant's milliseconds); it is not a way to change
	* the timeout.
	*/
	watchDeadline(o) {
		if (this.done) return () => {};
		let cancelled = false;
		const fire = () => {
			if (cancelled || this.done) return;
			cancelled = true;
			o.onTimeout(handshakeTimeoutAction({
				headless: o.headless,
				refused: o.refused?.() ?? null
			}));
		};
		const cancelTimer = (o.setTimer ?? ((fn, ms) => {
			const t = setTimeout(fn, ms);
			t.unref?.();
			return () => clearTimeout(t);
		}))(fire, 30 * 1e3);
		return () => {
			cancelled = true;
			cancelTimer();
		};
	}
	/** Stop waiting (the session ends): every waiter gets false. */
	close() {
		for (const w of this.waiters) w(false);
	}
};
/**
* Does the reported context match what the launcher knows? The decision
* depends on all of it (a relative path resolves against cwd; a bypass mode
* turns an ask into a deny; a write in the scratchpad is a scratch write), so
* a forged context must not change what a decision means.
*/
function contextMatches(reported, seen, launch) {
	const bad = (reason) => ({
		ok: false,
		code: "context-mismatch",
		reason
	});
	const r = reported ?? {
		cwd: null,
		mode: null,
		scratchpadDir: null,
		sessionId: null
	};
	const real = launch.realpath ?? realpathNearestSync;
	if (typeof r.cwd !== "string" || !path.isAbsolute(r.cwd)) return bad("the hook reported no absolute working directory");
	const want = typeof seen?.cwd === "string" && path.isAbsolute(seen.cwd) ? seen.cwd : launch.cwd;
	if (real(path.normalize(r.cwd)) !== real(path.normalize(want))) return bad(`the hook decided in working directory ${JSON.stringify(r.cwd.slice(0, 200))}, but the call runs in ${JSON.stringify(want.slice(0, 200))}`);
	if (seen?.sessionId && r.sessionId !== seen.sessionId) return bad("the hook's session id differs from the transcript's");
	const mode = r.mode;
	if (typeof mode !== "string" || !launch.modes.includes(mode)) return bad(`the hook reported an unknown permission mode ${JSON.stringify(String(mode).slice(0, 40))}`);
	if (launch.bypassMode && mode === launch.bypassMode && !launch.bypassAvailable) return bad(`the hook reported ${mode}, which this session was not started with`);
	let downgraded = null;
	if (launch.headless && launch.launchedMode && mode !== launch.launchedMode && !(launch.planMode && launch.launchedMode === launch.planMode && mode !== launch.bypassMode)) {
		if (!(launch.modeOrder && compareHostMode(mode, launch.launchedMode, {
			...launch.modeOrder,
			planMode: launch.modeOrder.planMode ?? launch.planMode ?? null,
			bypassMode: launch.modeOrder.bypassMode ?? launch.bypassMode ?? null
		}, { bypassAvailable: launch.bypassAvailable }) === "narrower")) return bad(`the hook reported permission mode ${JSON.stringify(mode)}, but this headless session runs in ${JSON.stringify(launch.launchedMode)}`);
		downgraded = {
			launched: launch.launchedMode,
			reported: mode
		};
	}
	if (r.scratchpadDir !== null && r.scratchpadDir !== void 0) {
		const sid = seen?.sessionId ?? r.sessionId;
		const allowed = typeof sid === "string" ? launch.scratchpadFor?.(sid) ?? null : null;
		if (!allowed || !allowed.some((p) => path.normalize(p) === path.normalize(r.scratchpadDir))) return bad(`the hook reported scratchpad ${JSON.stringify(r.scratchpadDir.slice(0, 200))}, which is not this session's scratchpad`);
	}
	return downgraded ? {
		ok: true,
		downgraded
	} : { ok: true };
}
/**
* The launcher's ledger of calls: which tool calls the transcript showed,
* which the verified hook decided, what it decided (first report only),
* which ran, which were put to the person and approved there.
*/
var CallLedger = class {
	constructor(o) {
		this.o = o;
		this.seen = /* @__PURE__ */ new Map();
		this.decisions = /* @__PURE__ */ new Map();
		this.posts = /* @__PURE__ */ new Set();
		this.prompted = /* @__PURE__ */ new Set();
		this.approved = /* @__PURE__ */ new Set();
		this.mismatches = [];
		this.downgrades = [];
		this.deferred = /* @__PURE__ */ new Map();
		this.firstMode = null;
	}
	check(id, report, call) {
		const m = bindingMatches({
			tool: report.tool,
			binding: report.binding
		}, call, {
			cwd: this.o.cwd,
			home: this.o.home
		});
		let bad = m.ok ? null : {
			id,
			code: m.code,
			reason: m.reason
		};
		if (!bad && this.o.context) {
			const launch = this.o.context();
			const c = contextMatches(report.context, call, {
				...launch,
				launchedMode: launch.launchedMode ?? (launch.headless ? this.firstMode : null)
			});
			if (!c.ok) bad = {
				id,
				code: c.code,
				reason: c.reason
			};
			else {
				this.firstMode ??= report.context?.mode ?? null;
				if (c.downgraded) this.downgrades.push({
					id,
					...c.downgraded
				});
			}
		}
		if (bad) this.mismatches.push(bad);
		return bad;
	}
	/** A call the transcript showed. Returns the mismatch of a deferred report for it, if any. */
	noteUse(call) {
		if (typeof call?.id !== "string" || this.seen.has(call.id)) return null;
		this.seen.set(call.id, call);
		const pending = this.deferred.get(call.id);
		if (!pending) return null;
		this.deferred.delete(call.id);
		return this.check(call.id, pending, call);
	}
	/**
	* The verified hook is deciding call `id`. Accepted only for a call the
	* transcript shows with the same tool, input and context. With `defer`
	* (a host that writes the call to its transcript only after the hook
	* answered), an unseen call is kept and checked as soon as it appears.
	*/
	pre(id, report, o = {}) {
		if (!id) return {
			ok: false,
			reason: "the hook reported no call id"
		};
		const call = this.seen.get(id);
		if (!call) {
			if (!o.defer) return {
				ok: false,
				reason: `the transcript shows no tool call ${id}; a decision is accepted only for a call the agent CLI wrote there`
			};
			if (!this.deferred.has(id)) this.deferred.set(id, report);
			this.decisions.set(id, this.decisions.get(id) ?? "pending");
			return { ok: "deferred" };
		}
		const bad = this.check(id, report, call);
		if (bad) return {
			ok: false,
			reason: `${bad.reason}; this decision is not for that call`,
			mismatch: bad
		};
		if (!this.decisions.has(id)) this.decisions.set(id, "pending");
		return { ok: true };
	}
	/** The hook's decision for a call that passed `pre`. Only the first one counts. */
	decision(id, d) {
		if (!id || this.decisions.get(id) !== "pending" || ![
			"allow",
			"ask",
			"deny"
		].includes(String(d))) return {
			ok: false,
			reason: id && this.decisions.has(id) && this.decisions.get(id) !== "pending" ? `a decision for ${id} was already reported` : "no pending call for this decision"
		};
		this.decisions.set(id, d);
		return {
			ok: true,
			reason: null
		};
	}
	/** May call `id` be put to the person? Only a call decided "ask", once. */
	mayPrompt(id) {
		if (!id || this.decisions.get(id) !== "ask") return {
			ok: false,
			reason: "no call decided ask matches this request"
		};
		if (this.prompted.has(id)) return {
			ok: false,
			reason: `call ${id} was already put to the person`
		};
		this.prompted.add(id);
		return {
			ok: true,
			reason: null
		};
	}
	/** The person approved call `id` at the launcher's own prompt. */
	approve(id) {
		if (this.prompted.has(id)) this.approved.add(id);
	}
	/** A tool result for a decided call the transcript shows, with the same input. */
	post(id, report) {
		const call = id ? this.seen.get(id) : void 0;
		if (!id || !call || !this.decisions.has(id)) return false;
		const m = bindingMatches({
			tool: report.tool,
			binding: report.binding
		}, call, {
			cwd: this.o.cwd,
			home: this.o.home
		});
		if (m.ok) this.posts.add(id);
		return m.ok;
	}
};
/**
* Reconcile the audit log against itself and against the host's transcripts:
* sessions without a start or end, calls that ran without a recorded
* decision or despite a deny, inputs changed after the decision, launches
* whose hooks never reported in, and transcript calls the log never saw or
* that do not match the recorded decision. Record types are the engine's,
* prefixed with the host id (`<host>.tool.pre`, ...). `readTranscript`
* parses the host's transcript (null when it is missing); `transcriptsOf`
* adds the host's subagent transcripts.
*/
async function reconcile(records, o) {
	const pre = `${o.host}.`;
	const sessions = /* @__PURE__ */ new Map();
	const get = (id) => {
		const key = typeof id === "string" && id ? id : "(none)";
		let s = sessions.get(key);
		if (!s) {
			s = {
				id: key,
				start: null,
				end: false,
				transcripts: /* @__PURE__ */ new Set(),
				pre: /* @__PURE__ */ new Map(),
				post: /* @__PURE__ */ new Set(),
				postDigest: /* @__PURE__ */ new Map()
			};
			sessions.set(key, s);
		}
		return s;
	};
	const launches = /* @__PURE__ */ new Map();
	const nonces = /* @__PURE__ */ new Set();
	const findings = [];
	const iso = (ts) => typeof ts === "number" ? new Date(ts).toISOString() : "(unknown time)";
	for await (const raw of records) {
		const r = raw;
		if (typeof r?.type !== "string" || !r.type.startsWith(pre)) continue;
		const t = r.type.slice(pre.length);
		const p = r.payload ?? {};
		const callId = p.callId ?? p.toolUseId;
		switch (t) {
			case "launch":
				if (typeof p.nonce === "string" && !p.managed && !p.background) launches.set(p.nonce, {
					ts: r.ts,
					cwd: p.cwd
				});
				continue;
			case "audit.gap":
				findings.push({
					session: "(log)",
					severity: "error",
					code: "audit-gap",
					detail: `${String(p.reason)} at ${iso(r.ts)}`
				});
				continue;
			case "launch.decision-violated":
				findings.push({
					session: "(launch)",
					severity: "error",
					code: "decision-violated",
					detail: `${String(p.callId ?? p.toolUseId)} ran although Enclawed decided ${String(p.decision)}`
				});
				continue;
			case "launch.anchor-tamper":
				findings.push({
					session: "(launch)",
					severity: "error",
					code: "anchor-tamper",
					detail: textOf(p.reason ?? "the audit log or its anchor changed during a session")
				});
				continue;
			case "launch.settings-dropped":
				findings.push({
					session: "(launch)",
					severity: "error",
					code: "settings-dropped",
					detail: textOf(p.detail ?? "the agent CLI did not load Enclawed's settings")
				});
				continue;
			default: break;
		}
		if (/^(launch|auth|policy|history|hardware)\./.test(t)) continue;
		const s = get(p.sessionId);
		switch (t) {
			case "session.start":
				s.start ??= typeof r.ts === "number" ? r.ts : 0;
				if (typeof p.transcriptPath === "string") s.transcripts.add(p.transcriptPath);
				if (typeof p.launcherNonce === "string") nonces.add(p.launcherNonce);
				break;
			case "subagent.stop":
				if (typeof p.agentTranscriptPath === "string") s.transcripts.add(p.agentTranscriptPath);
				break;
			case "session.end":
				s.end = true;
				break;
			case "tool.pre":
			case "hook.error":
				if (typeof callId === "string") s.pre.set(callId, {
					decision: p.answered ?? p.decision,
					tool: p.tool,
					inputDigest: typeof p.inputDigest === "string" ? p.inputDigest : null,
					binding: p.binding ?? null,
					projectDir: typeof p.projectDir === "string" ? p.projectDir : null
				});
				break;
			case "tool.post":
			case "tool.failure":
				if (typeof callId === "string") {
					s.post.add(callId);
					if (typeof p.inputDigest === "string") s.postDigest.set(callId, p.inputDigest);
				}
				break;
			default: break;
		}
	}
	for (const [nonce, l] of launches) if (!nonces.has(nonce)) findings.push({
		session: "(launch)",
		severity: "error",
		code: "launch-without-hooks",
		detail: `the agent CLI was launched in ${String(l.cwd)} at ${iso(l.ts)} but its hooks never reported in`
	});
	for (const s of sessions.values()) {
		if (s.start === null) findings.push({
			session: s.id,
			severity: "warn",
			code: "no-session-start",
			detail: "tool calls recorded without a session start"
		});
		if (!s.end) findings.push({
			session: s.id,
			severity: "info",
			code: "no-session-end",
			detail: "still running, or ended without its end hook"
		});
		for (const id of s.post) {
			const d = s.pre.get(id);
			if (!d) findings.push({
				session: s.id,
				severity: "error",
				code: "ran-without-decision",
				detail: id
			});
			else if (d.decision === "deny") findings.push({
				session: s.id,
				severity: "error",
				code: "ran-despite-deny",
				detail: id
			});
			else if (d.inputDigest && s.postDigest.has(id) && s.postDigest.get(id) !== d.inputDigest) findings.push({
				session: s.id,
				severity: "error",
				code: "input-changed-after-decision",
				detail: `${id} (${String(d.tool)})`
			});
		}
		for (const [id, d] of s.pre) if (d.decision === "allow" && !s.post.has(id)) findings.push({
			session: s.id,
			severity: "info",
			code: "allowed-no-result",
			detail: `${id} (${String(d.tool)})`
		});
		if (!o.readTranscript) continue;
		const files = o.transcriptsOf ? o.transcriptsOf([...s.transcripts]) : [...s.transcripts];
		for (const f of files) {
			const calls = await o.readTranscript(f);
			if (calls === null) {
				findings.push({
					session: s.id,
					severity: "warn",
					code: "transcript-missing",
					detail: f
				});
				continue;
			}
			for (const call of calls) {
				const d = s.pre.get(call.id);
				if (!d) {
					findings.push({
						session: s.id,
						severity: "error",
						code: "transcript-call-without-decision",
						detail: call.id
					});
					continue;
				}
				if (call.ran && (d.decision === "deny" || d.decision === "ask" && !s.post.has(call.id))) findings.push({
					session: s.id,
					severity: "error",
					code: "ran-despite-decision",
					detail: `${call.id} (${String(call.name)}) ran although Enclawed decided ${d.decision}`
				});
				if (d.tool !== call.name) findings.push({
					session: s.id,
					severity: "error",
					code: "tool-name-mismatch",
					detail: `${call.id}: the log records ${String(d.tool)}, the transcript ${String(call.name)}`
				});
				else if (d.binding) {
					const m = bindingMatches({
						tool: d.tool,
						binding: d.binding
					}, call, {
						cwd: d.projectDir,
						home: o.home ?? null
					});
					if (!m.ok) findings.push({
						session: s.id,
						severity: "error",
						code: "tool-input-mismatch",
						detail: `${call.id} (${String(call.name)}): ${m.reason}`
					});
				}
			}
		}
	}
	return {
		sessions: sessions.size,
		launches: launches.size,
		findings
	};
}
//#endregion
//#region src/enclawed/adapter/scratch.ts
/** May `dir` be treated as scratch (no history)? See the header. */
function isSafeScratchDir(dir, o) {
	if (typeof dir !== "string" || !path.isAbsolute(dir)) return false;
	const norm = path.resolve(dir);
	if (norm === path.parse(norm).root) return false;
	if (isInside(norm, path.resolve(o.home))) return false;
	for (const p of [o.projectDir ?? null, ...o.protectedPaths ?? []]) if (p && (isInside(norm, p) || isInside(p, norm))) return false;
	return true;
}
/** The policy with the host's scratch candidates that are safe added to its scratch paths. */
function withScratchPaths(policy, candidates, o) {
	const add = candidates.filter((d) => isSafeScratchDir(d, o)).map((d) => path.resolve(d));
	if (add.length === 0) return policy;
	return createPolicy({
		enforceAllowlists: policy.enforceAllowlists,
		allowedChannels: policy.allowedChannels,
		allowedProviders: policy.allowedProviders,
		allowedTools: policy.allowedTools,
		allowedHosts: policy.allowedHosts,
		commandNetwork: policy.commandNetwork,
		preApprovedIrreversibleTools: policy.preApprovedIrreversibleTools,
		scratchPaths: [...policy.scratchPaths, ...add],
		history: {
			maxFileBytes: policy.history.maxFileBytes,
			maxTotalBytes: policy.history.maxTotalBytes,
			maxAgeDays: policy.history.maxAgeDays,
			noHistoryPaths: policy.history.noHistoryPaths,
			noHistoryTools: policy.history.noHistoryTools
		},
		maxOutputClearance: policy.maxOutputClearance,
		defaultDataLabel: policy.defaultDataLabel
	});
}
/**
* The adapter's private session root (see the header), created if needed.
* `name`: the adapter's directory name (`<name>-<uid>` under the base);
* `stateDir`: its state directory, the last resort. Throws when every base is
* inside the project or unusable.
*
* The adapter's Unix sockets (its control, relay and auth-relay sockets) live
* in directories under this root, and a Unix socket path is limited (108 bytes
* on Linux, 104 on macOS, counting the terminating NUL). A base whose root
* leaves too little room (a long TMPDIR) is skipped for the next one (the
* system's /tmp), so a socket never fails to start for its length.
*/
function privateSessionRoot(o) {
	if (!/^[A-Za-z0-9._-]+$/.test(o.name)) throw new Error(`privateSessionRoot: ${JSON.stringify(o.name)} is not a directory name`);
	const uid = process.getuid?.() ?? "u";
	const project = realpathNearestSync(path.resolve(o.projectDir));
	const bases = [
		o.env.XDG_RUNTIME_DIR,
		o.env.TMPDIR,
		process.platform === "win32" ? os.tmpdir() : "/tmp",
		o.stateDir
	].filter((b) => typeof b === "string" && b.trim() !== "");
	for (const base of bases) {
		const realBase = realpathNearestSync(path.resolve(base));
		const root = path.join(realBase, `${o.name}-${uid}`);
		if (isInside(project, realBase) || isInside(project, root)) continue;
		if (Buffer.byteLength(root) > 72) continue;
		try {
			fs.mkdirSync(root, {
				recursive: true,
				mode: 448
			});
			ownedPrivateDir(root);
			return root;
		} catch {}
	}
	throw new Error(`found no private directory outside the project for ${o.name}'s session files (XDG_RUNTIME_DIR, TMPDIR, the system temp directory and the state directory are all inside it, unusable, or longer than 72 bytes, too long for the Unix sockets the session creates under it)`);
}
//#endregion
//#region src/enclawed/adapter/remote-launch.ts
/** Longest delay the egress pipeline may impose on one call (the relay's cap). */
const MAX_PIPELINE_DELAY_MS = 3e4;
const TRANSPORTS = new Set(["streamable-http", "sse"]);
/** Is `v` a well-formed remote part of an admission record? */
function isRemoteRecord(v) {
	if (!v || typeof v !== "object" || Array.isArray(v)) return false;
	const r = v;
	return typeof r.url === "string" && /^https?:\/\//i.test(r.url) && typeof r.transport === "string" && TRANSPORTS.has(r.transport) && (r.authorizationOrigins === void 0 || Array.isArray(r.authorizationOrigins) && r.authorizationOrigins.every((o) => typeof o === "string" && /^https:\/\//i.test(o))) && (r.oauth === void 0 || isOAuthPart(r.oauth));
}
function isOAuthPart(v) {
	if (!v || typeof v !== "object" || Array.isArray(v)) return false;
	const o = v;
	return Object.keys(o).every((k) => k === "clientId" || k === "scope") && (o.clientId === void 0 || typeof o.clientId === "string" && /^[\x21-\x7e]{1,512}$/.test(o.clientId)) && (o.scope === void 0 || typeof o.scope === "string" && /^[\x20-\x7e]{1,1000}$/.test(o.scope));
}
/** The transport a host definition asks for ("http" and "streamable-http" are the same; "sse" is the older one). */
function remoteTransportOf(def) {
	const t = (def.type ?? "").toLowerCase();
	if (t === "http" || t === "streamable-http") return "streamable-http";
	return t === "sse" ? "sse" : null;
}
/** Thrown by callTool when Enclawed's egress pipeline refuses the call body. */
var RemoteCallRefused = class extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "RemoteCallRefused";
	}
};
/**
* Connect an admitted remote MCP server through Enclawed's transport, or
* refuse. `record` is the verified record's remote part.
*/
function connectRemoteMcpServer(def, record, o = {}) {
	const transport = remoteTransportOf(def);
	if (!transport || typeof def.url !== "string") return {
		ok: false,
		code: "mcp-remote-not-admitted",
		message: `${def.name} is not a remote server`
	};
	if (!record || !isRemoteRecord(record)) return {
		ok: false,
		code: "mcp-remote-not-admitted",
		message: `${def.name} is not connected: its signed admission record names no remote server`
	};
	if (record.url !== def.url || record.transport !== transport) return {
		ok: false,
		code: "mcp-remote-url-mismatch",
		message: `${def.name} is not connected: the definition's URL or transport is not the one its admission record signed`
	};
	const cred = o.credentials ?? null;
	let raw;
	try {
		if (cred && cred.origin !== new URL(record.url).origin) return {
			ok: false,
			code: "remote-credential-mismatch",
			message: `${def.name} is not connected: its credentials are bound to ${cred.origin}`
		};
		raw = createRemoteMcpClient({
			url: record.url,
			transport: record.transport,
			...record.authorizationOrigins ? { authorizationOrigins: record.authorizationOrigins } : {},
			...o.connect ? { connect: o.connect } : {},
			...o.timeoutMs ? { timeoutMs: o.timeoutMs } : {},
			...cred ? { requestHeaders: () => cred.headers() } : {}
		});
	} catch (err) {
		return {
			ok: false,
			code: err instanceof RemoteMcpError ? err.code : "remote-url-invalid",
			message: err instanceof Error ? err.message : String(err)
		};
	}
	const client = withCredentials(raw, cred);
	const runner = o.egressRunner ?? createEgressRunner();
	return {
		ok: true,
		client,
		async callTool(call) {
			let args = call.arguments;
			if (runner) {
				const body = JSON.stringify({
					name: call.tool,
					arguments: call.arguments ?? {}
				});
				let result;
				try {
					result = await runner(body, {
						kind: "tool-call",
						id: `remote-mcp:${def.name}`,
						toolName: call.tool
					});
				} catch (err) {
					throw new RemoteCallRefused("egress-pipeline-error", `egress pipeline failed: ${err instanceof Error ? err.message : String(err)}`);
				}
				if (result.cancelled) throw new RemoteCallRefused("egress-pipeline-cancelled", `egress pipeline refused the call: ${result.reason}`);
				if (result.content !== body) {
					let parsed;
					try {
						parsed = JSON.parse(result.content);
					} catch {
						throw new RemoteCallRefused("egress-pipeline-error", "egress pipeline rewrote the call into something that is not JSON");
					}
					args = parsed?.arguments ?? {};
				}
				if (result.delayMs > 0) await new Promise((r) => setTimeout(r, Math.min(result.delayMs, MAX_PIPELINE_DELAY_MS)));
			}
			return client.callTool(call.tool, args);
		}
	};
}
/** Every string in `v` with the credentials' values removed. */
function redactDeep(v, handles, depth = 0) {
	if (typeof v === "string") return redactHandles(v, handles).text;
	if (depth > 64 || !v || typeof v !== "object") return v;
	if (Array.isArray(v)) return v.map((x) => redactDeep(x, handles, depth + 1));
	return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactDeep(x, handles, depth + 1)]));
}
/**
* The client with its credentials applied: an expired access token is
* refreshed before a request, a request refused for authorization is retried
* once after a refresh, and no answer carries a credential's value.
*/
function withCredentials(client, cred) {
	if (!cred) return client;
	const run = async (fn) => {
		await cred.refresh();
		let out;
		try {
			out = await fn();
		} catch (err) {
			if (!(err instanceof RemoteMcpError) || err.code !== "oauth-required" || !await cred.refresh(true)) throw err;
			out = await fn();
		}
		return redactDeep(out, cred.handles());
	};
	return {
		...client,
		initialize: () => run(() => client.initialize()),
		request: (method, params) => run(() => client.request(method, params)),
		listTools: () => run(() => client.listTools()),
		callTool: (name, args) => run(() => client.callTool(name, args))
	};
}
/** Most tools/list pages a probe reads. */
const MAX_LIST_PAGES = 50;
/**
* Read a remote server's identity and tools once, through Enclawed's remote
* transport with the remote part the operator is about to sign (its URL,
* transport and authorization origins): what an adapter pins. Throws a
* RemoteMcpError (closed code) or an Error with the refusal.
*/
async function probeRemoteMcpServer(def, record, o = {}) {
	const c = connectRemoteMcpServer(def, record, o);
	if (!c.ok) throw new Error(`${c.message} (${c.code})`);
	try {
		const init = await c.client.initialize() ?? {};
		const tools = [];
		let cursor;
		for (let page = 0; page < MAX_LIST_PAGES; page++) {
			const r = await c.client.request("tools/list", cursor ? { cursor } : {});
			tools.push(...Array.isArray(r?.tools) ? r.tools : []);
			cursor = r?.nextCursor;
			if (!cursor) break;
		}
		const str = (v) => typeof v === "string" ? v : null;
		return {
			serverInfo: {
				name: str(init.serverInfo?.name),
				version: str(init.serverInfo?.version)
			},
			protocolVersion: str(init.protocolVersion),
			tools
		};
	} finally {
		c.client.close();
	}
}
//#endregion
//#region src/enclawed/adapter/trust.ts
const sha256Hex = (s) => createHash("sha256").update(s).digest("hex");
/** The files of a trust directory. `localKey` is a secret path; the whole dir is a protected path. */
function trustPaths(dir) {
	return {
		dir,
		signers: path.join(dir, "signers.json"),
		localKey: path.join(dir, "local-signer.key.pem")
	};
}
/** Write a file atomically (temporary file in the same directory, then rename), mode 0600. */
function writeFileAtomic(file, text) {
	const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
	fs.writeFileSync(tmp, text, {
		mode: 384,
		flag: "wx"
	});
	try {
		fs.renameSync(tmp, file);
	} catch (err) {
		fs.rmSync(tmp, { force: true });
		throw err;
	}
}
function keyIdOf(publicKeyPem) {
	return `local-${sha256Hex(publicKeyPem.trim()).slice(0, 16)}`;
}
/** The trust list; a missing or unreadable list is empty (nobody is trusted). */
function readSigners(dir) {
	try {
		const d = JSON.parse(fs.readFileSync(trustPaths(dir).signers, "utf8"));
		return Array.isArray(d?.signers) ? d.signers.filter((s) => typeof s?.keyId === "string" && typeof s?.publicKeyPem === "string") : [];
	} catch {
		return [];
	}
}
function findSigner(dir, keyId) {
	return readSigners(dir).find((s) => s.keyId === keyId) ?? null;
}
function writeSigners(dir, list) {
	fs.mkdirSync(dir, {
		recursive: true,
		mode: 448
	});
	writeFileAtomic(trustPaths(dir).signers, `${JSON.stringify({
		v: 1,
		signers: list
	}, null, 2)}\n`);
}
/**
* The framework's two-factor gate for trust changes: purpose "policy-change",
* at a terminal only (an unlock ticket never authorizes one).
*/
function twoFactorAuthorizer(ctx) {
	return (detail) => assertSecondFactor(ctx, {
		purpose: "policy-change",
		detail,
		allowTicket: false
	});
}
/** Add (or replace) a trusted signer, after the person is verified. */
async function addSigner(dir, s, authorize) {
	if (!/^[A-Za-z0-9._-]{1,80}$/.test(s.keyId)) throw new Error(`signer key id ${JSON.stringify(s.keyId)} must be 1-80 letters, digits, ".", "_" or "-"`);
	if (!s.publicKeyPem.trim().startsWith("-----BEGIN PUBLIC KEY-----")) throw new Error("the signer's public key must be a PEM (SPKI) Ed25519 public key");
	await authorize(`trust add ${s.keyId}`);
	const list = readSigners(dir).filter((x) => x.keyId !== s.keyId);
	list.push({
		keyId: s.keyId,
		publicKeyPem: `${s.publicKeyPem.trim()}\n`,
		label: s.label ?? "",
		origin: s.origin ?? "imported",
		addedAt: Date.now()
	});
	writeSigners(dir, list);
}
/** Remove a signer, after the person is verified. Returns whether it was there. */
async function removeSigner(dir, keyId, authorize) {
	const list = readSigners(dir);
	const next = list.filter((s) => s.keyId !== keyId);
	if (next.length === list.length) return false;
	await authorize(`trust remove ${keyId}`);
	writeSigners(dir, next);
	return true;
}
/** The local signer, made with the framework's Ed25519 primitive on first use, after the person is verified. */
async function ensureLocalSigner(dir, authorize) {
	const t = trustPaths(dir);
	if (fs.existsSync(t.localKey)) {
		const privateKeyPem = fs.readFileSync(t.localKey, "utf8");
		const local = readSigners(dir).find((s) => s.origin === "local");
		if (local) return {
			keyId: local.keyId,
			privateKeyPem,
			publicKeyPem: local.publicKeyPem,
			created: false
		};
	}
	const { publicKey, privateKey } = generateEd25519KeyPair();
	const keyId = keyIdOf(publicKey);
	await addSigner(dir, {
		keyId,
		publicKeyPem: publicKey,
		label: "this installation",
		origin: "local"
	}, authorize);
	fs.mkdirSync(dir, {
		recursive: true,
		mode: 448
	});
	fs.rmSync(t.localKey, { force: true });
	fs.writeFileSync(t.localKey, privateKey, {
		mode: 384,
		flag: "wx"
	});
	fs.chmodSync(t.localKey, 384);
	return {
		keyId,
		privateKeyPem: privateKey,
		publicKeyPem: publicKey,
		created: true
	};
}
/** Sign a record (every field but `signature`), naming the signer. */
function signRecord(record, signer) {
	const body = {
		...record,
		signerKeyId: signer.keyId
	};
	delete body.signature;
	return {
		...body,
		signature: signManifest(Buffer.from(canonicalJson(body), "utf8"), signer.privateKeyPem)
	};
}
/** Verify a signed record against the trust list. */
function verifyRecord(record, dir) {
	const r = record;
	if (!r || typeof r !== "object" || typeof r.signature !== "string" || typeof r.signerKeyId !== "string") return {
		ok: false,
		reason: "unsigned"
	};
	const signer = findSigner(dir, r.signerKeyId);
	if (!signer) return {
		ok: false,
		reason: `signer ${JSON.stringify(r.signerKeyId)} is not on the trust list`
	};
	const body = { ...r };
	delete body.signature;
	let good = false;
	try {
		good = verifyManifestSignature(Buffer.from(canonicalJson(body), "utf8"), r.signature, signer.publicKeyPem);
	} catch {
		good = false;
	}
	if (!good) return {
		ok: false,
		reason: `the signature by ${signer.keyId} does not verify (the record was changed after it was signed)`
	};
	return {
		ok: true,
		signer
	};
}
const MCP_ADMISSION_KIND = "enclawed-mcp-admission";
/** The (unsigned) admission record for a probed server: identity, and one digest per tool. */
function mcpPinRecord(p, kind = MCP_ADMISSION_KIND) {
	const tools = p.tools.map((t) => [String(t.name), mcpToolDefinitionDigest(t)]).toSorted((a, b) => a[0] < b[0] ? -1 : 1);
	return {
		v: 1,
		kind,
		name: p.name,
		scope: p.scope,
		source: p.source,
		identity: {
			type: p.remote ? p.remote.transport : "stdio",
			definitionDigest: p.definitionDigest,
			executable: p.executable,
			executableSha256: p.executableSha256,
			serverInfo: p.serverInfo
		},
		tools: Object.fromEntries(tools),
		...p.code ? { code: p.code } : {},
		...p.args ? { args: p.args } : {},
		...p.containment ? { containment: p.containment } : {},
		...p.remote ? { remote: p.remote } : {},
		pinnedAt: Date.now()
	};
}
const HEX64$1 = /^[0-9a-f]{64}$/;
const strList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
const absPath = (v) => typeof v === "string" && v.startsWith("/") && !v.includes("\0");
/** The shape of a signed containment declaration (the planner checks what it means). */
function isContainmentRecord(v) {
	if (!v || typeof v !== "object" || Array.isArray(v)) return false;
	const r = v;
	const known = new Set([
		"roots",
		"packageRoot",
		"programs",
		"cwd",
		"env",
		"secrets",
		"destinations",
		"execConfigWritable"
	]);
	if (Object.keys(r).some((k) => !known.has(k))) return false;
	if (!Array.isArray(r.roots) || !r.roots.every((x) => {
		const o = x;
		return !!o && absPath(o.path) && (o.access === "ro" || o.access === "rw") && (o.exec === void 0 || typeof o.exec === "boolean");
	})) return false;
	if (r.packageRoot !== void 0 && r.packageRoot !== null && !absPath(r.packageRoot)) return false;
	if (r.cwd !== void 0 && r.cwd !== null && !absPath(r.cwd)) return false;
	for (const k of [
		"programs",
		"env",
		"execConfigWritable"
	]) if (r[k] !== void 0 && !strList(r[k])) return false;
	if (r.secrets !== void 0 && !(Array.isArray(r.secrets) && r.secrets.every((x) => {
		const o = x;
		return !!o && typeof o.variable === "string" && typeof o.id === "string" && strList(o.destinations);
	}))) return false;
	if (r.destinations !== void 0 && !(Array.isArray(r.destinations) && r.destinations.every((x) => {
		const o = x;
		return !!o && typeof o.host === "string" && typeof o.port === "number" && Number.isInteger(o.port) && o.port > 0 && o.port < 65536 && (o.mode === "inspect" || o.mode === "http" || o.mode === "opaque");
	}))) return false;
	return true;
}
/** The record as the kit's McpAdmissionRecord, or why it is not one. */
function asAdmissionRecord(r) {
	const id = r.identity;
	const tools = r.tools;
	if (typeof r.name !== "string" || r.name === "") return {
		ok: false,
		reason: "it names no server"
	};
	if (!id || typeof id !== "object" || typeof id.definitionDigest !== "string") return {
		ok: false,
		reason: "it has no server identity"
	};
	if (id.executableSha256 !== void 0 && id.executableSha256 !== null && !(typeof id.executableSha256 === "string" && HEX64$1.test(id.executableSha256))) return {
		ok: false,
		reason: "its executable digest is malformed"
	};
	if (!tools || typeof tools !== "object" || Array.isArray(tools) || Object.values(tools).some((d) => typeof d !== "string" || !HEX64$1.test(d))) return {
		ok: false,
		reason: "its tool pins are malformed"
	};
	const code = r.code;
	if (code !== void 0 && code !== null && !([
		"npm",
		"pypi",
		"oci",
		"tree"
	].includes(code.kind) && typeof code.name === "string" && typeof code.version === "string" && typeof code.integrity === "string" && code.integrity.length > 0 && [
		"lockDigest",
		"treeDigest",
		"bin"
	].every((f) => code[f] === void 0 || typeof code[f] === "string" && code[f] !== ""))) return {
		ok: false,
		reason: "its code pin is malformed"
	};
	if (r.args !== void 0 && r.args !== null && !isArgumentRoles(r.args)) return {
		ok: false,
		reason: "its argument roles are malformed"
	};
	if (r.containment !== void 0 && r.containment !== null && !isContainmentRecord(r.containment)) return {
		ok: false,
		reason: "its containment declaration is malformed"
	};
	if (r.remote !== void 0 && r.remote !== null && !isRemoteRecord(r.remote)) return {
		ok: false,
		reason: "its remote server part is malformed"
	};
	const info = id.serverInfo;
	return {
		ok: true,
		record: {
			name: r.name,
			identity: {
				type: typeof id.type === "string" ? id.type : null,
				definitionDigest: id.definitionDigest,
				executableSha256: id.executableSha256 ?? null,
				serverInfo: info ? {
					name: typeof info.name === "string" ? info.name : null,
					version: typeof info.version === "string" ? info.version : null
				} : null
			},
			tools,
			code: code ?? null,
			args: r.args ?? null,
			containment: r.containment ?? null,
			remote: r.remote ?? null,
			signerKeyId: typeof r.signerKeyId === "string" ? r.signerKeyId : null
		}
	};
}
/** Every stored record with its verdict. */
function readMcpPins(o) {
	const kinds = o.kinds ?? ["enclawed-mcp-admission"];
	let names = [];
	try {
		names = fs.readdirSync(o.dir).filter((f) => f.endsWith(".json"));
	} catch {
		names = [];
	}
	return names.toSorted().map((f) => {
		const file = path.join(o.dir, f);
		let raw = null;
		try {
			raw = JSON.parse(fs.readFileSync(file, "utf8"));
		} catch {
			raw = null;
		}
		if (!raw || typeof raw !== "object") return {
			file,
			ok: false,
			reason: "not valid JSON",
			record: null,
			signer: null
		};
		const v = verifyRecord(raw, o.trustDir);
		if (!v.ok) return {
			file,
			ok: false,
			reason: v.reason,
			record: null,
			signer: null
		};
		if (typeof raw.kind !== "string" || !kinds.includes(raw.kind)) return {
			file,
			ok: false,
			reason: "not an MCP admission record",
			record: null,
			signer: v.signer.keyId
		};
		if (raw.v !== 1) return {
			file,
			ok: false,
			reason: "an unsupported record version",
			record: null,
			signer: v.signer.keyId
		};
		const a = asAdmissionRecord(raw);
		if (!a.ok) return {
			file,
			ok: false,
			reason: a.reason,
			record: null,
			signer: v.signer.keyId
		};
		return {
			file,
			ok: true,
			reason: null,
			record: a.record,
			signer: v.signer.keyId
		};
	});
}
/** The signed pin store as the kit's AdmissionRecordSource. */
function signedMcpPinStore(o) {
	return { load() {
		const records = [];
		const broken = [];
		for (const p of readMcpPins(o)) if (p.ok && p.record) records.push(p.record);
		else broken.push({
			name: path.basename(p.file, ".json"),
			reason: p.reason ?? "invalid"
		});
		return {
			records,
			broken
		};
	} };
}
function pinFile(o, name) {
	return path.join(o.dir, `${(o.normalize ?? defaultMcpNormalizer)(name)}.json`);
}
function writeRecordFile(o, name, rec) {
	fs.mkdirSync(o.dir, {
		recursive: true,
		mode: 448
	});
	const file = pinFile(o, name);
	writeFileAtomic(file, `${JSON.stringify(rec, null, 2)}\n`);
	return file;
}
/**
* Pin a probed server: refused when its tool set has problems (no names,
* duplicates, shadowing, definitions with hidden content or instructions
* aimed at the model); otherwise, after the person is verified, signed with
* the local signer and stored.
*/
async function pinMcpServer(o, p) {
	const problems = mcpToolSetProblems(p.name, p.tools, o.builtinToolNames, o.normalize);
	if (p.tools.length === 0) problems.push("it offers no tools");
	if (problems.length) return {
		ok: false,
		problems
	};
	await o.authorize(`mcp pin ${p.name}`);
	const signer = await ensureLocalSigner(o.trustDir, async () => {});
	const signed = signRecord(mcpPinRecord(p, o.kind), signer);
	return {
		ok: true,
		file: writeRecordFile(o, p.name, signed),
		record: signed
	};
}
/** Import a record another trusted signer attested, after the person is verified. */
async function importMcpRecord(o, record) {
	const r = record;
	const v = verifyRecord(r, o.trustDir);
	if (!v.ok) return {
		ok: false,
		problems: [v.reason]
	};
	const kinds = o.kinds ?? ["enclawed-mcp-admission"];
	if (typeof r?.kind !== "string" || !kinds.includes(r.kind) || r.v !== 1) return {
		ok: false,
		problems: ["not an MCP admission record"]
	};
	const a = asAdmissionRecord(r);
	if (!a.ok) return {
		ok: false,
		problems: [a.reason]
	};
	if (Object.keys(a.record.tools).length === 0) return {
		ok: false,
		problems: ["it pins no tools"]
	};
	await o.authorize(`mcp import ${a.record.name}`);
	return {
		ok: true,
		file: writeRecordFile(o, a.record.name, r),
		record: r
	};
}
/** Remove a server's record (it no longer starts), after the person is verified. */
async function unpinMcpServer(o, name) {
	const f = pinFile(o, name);
	if (!fs.existsSync(f)) return false;
	await o.authorize(`mcp unpin ${name}`);
	fs.rmSync(f, { force: true });
	return true;
}
//#endregion
//#region enclawed/src/skill-formal-types.mjs
const ALL_CAPS = new Set([
	"net.egress",
	"fs.read",
	"fs.write.rev",
	"fs.write.irrev",
	"tool.invoke",
	"spawn.proc",
	"publish",
	"pay",
	"mutate.schema"
]);
var RefinementError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "RefinementError";
	}
};
/**
* Validate a manifest's declared capabilities are well-formed: every
* entry is a known capability token. Returns the normalised
* (deduplicated, sorted) set.
*
* Throws RefinementError on any unknown token. This is the type-level
* obligation that "M.caps : Set<CapabilityToken>" — at the JS surface
* we discharge it dynamically.
*/
function normaliseDeclaredCaps(caps) {
	if (!Array.isArray(caps) && !(caps instanceof Set)) throw new RefinementError("manifest.caps must be an array or Set of capability tokens");
	const out = /* @__PURE__ */ new Set();
	for (const c of caps) {
		if (typeof c !== "string") throw new RefinementError("manifest.caps entries must be strings");
		if (!ALL_CAPS.has(c)) throw new RefinementError(`manifest.caps: unknown capability token "${c}"`);
		out.add(c);
	}
	return Object.freeze([...out].toSorted((a, b) => a < b ? -1 : a > b ? 1 : 0));
}
/**
* Build a dispatch refinement gate for a specific manifest. The
* returned function is the .mjs analogue of the type signature
*
*   dispatch_M : { e : Envelope | cap(e) ∈ M.caps } -> Result
*
* Calling it with an envelope whose capability is outside M.caps
* throws RefinementError synchronously — the same semantics the
* type-level refinement would impose at compile time. Calling it
* with an in-manifest envelope returns the envelope unchanged so
* the surrounding gate can proceed.
*
* @param {{ caps: Iterable<string>, id?: string }} manifest
* @returns {(envelope: { capability: string, [k:string]: unknown }) => typeof envelope}
*/
function buildRefinedDispatch(manifest) {
	if (!manifest || typeof manifest !== "object") throw new RefinementError("buildRefinedDispatch: manifest required");
	const declared = new Set(normaliseDeclaredCaps(manifest.caps ?? []));
	const skillId = typeof manifest.id === "string" ? manifest.id : "<anonymous>";
	return Object.freeze(function refinedDispatch(envelope) {
		if (envelope === null || typeof envelope !== "object") throw new RefinementError(`dispatch_M(${skillId}): envelope must be an object`);
		const cap = envelope.capability;
		if (typeof cap !== "string") throw new RefinementError(`dispatch_M(${skillId}): envelope.capability must be a string`);
		if (!ALL_CAPS.has(cap)) throw new RefinementError(`dispatch_M(${skillId}): unknown capability "${cap}" — not in the schema vocabulary`);
		if (!declared.has(cap)) throw new RefinementError(`dispatch_M(${skillId}): out-of-manifest envelope rejected at refinement boundary; capability "${cap}" not in declared caps [${[...declared].toSorted((a, b) => a < b ? -1 : a > b ? 1 : 0).join(",")}]`);
		return envelope;
	});
}
/**
* Method-B verdict object suitable for inclusion in a PCC bundle
* (paper §8). The verdict pins:
*   - the manifest's capability set, normalised
*   - the skill id and version
*   - the (algorithm, bound) the dispatch was discharged under
*
* The bundle re-checker (skill-formal-bundle.verifyFormalBundle)
* re-builds the refinement gate from the manifest at bootstrap and
* tests it against an enumerated probe envelope set; if the probe
* outcomes match the bundle's, the verdict is reproduced.
*
* @param {{ caps: Iterable<string>, id?: string, version?: number }} manifest
*/
function methodB({ manifest }) {
	if (!manifest) throw new RefinementError("methodB: manifest required");
	const declared = normaliseDeclaredCaps(manifest.caps ?? []);
	const probe = [];
	const declaredSet = new Set(declared);
	for (const c of [...ALL_CAPS].toSorted()) probe.push({
		capability: c,
		expected: declaredSet.has(c) ? "admit" : "deny"
	});
	const refined = buildRefinedDispatch(manifest);
	for (const p of probe) {
		try {
			refined({ capability: p.capability });
			p.actual = "admit";
		} catch (err) {
			if (!(err instanceof RefinementError)) throw err;
			p.actual = "deny";
		}
		p.match = p.actual === p.expected;
	}
	const allMatch = probe.every((p) => p.match);
	return {
		method: "B",
		contained: allMatch,
		skillId: manifest.id ?? null,
		skillVersion: manifest.version ?? null,
		declaredCaps: declared,
		schemaVocabulary: [...ALL_CAPS].toSorted(),
		probe,
		reason: allMatch ? "refined-dispatch-rejects-out-of-manifest-envelopes" : "refined-dispatch-disagreed-with-spec-on-probe-set"
	};
}
//#endregion
//#region enclawed/src/skill-formal-bmc.mjs
const OUT_OF_MANIFEST = "__OUT__";
/**
* Reference biconditional invariant — the property the search
* verifies. Given a trace, returns { ok, violation? }.
*
* The biconditional (parent paper §5): every world-state change has a
* corresponding admitted-envelope record in the audit log, and every
* admitted envelope produces a world-state change (modulo runtime
* errors which are themselves audited). The .ok=false branch returns
* a structured `violation` describing where the trace breaks the
* invariant.
*
* In the abstract model used here, a trace is an array of records:
*   { envelopeCap, gateVerdict, executed, audited }
* with the obvious meanings. The simulator (`simulateTrace`)
* constructs traces that are well-formed by construction; this
* function is the spec.
*
* @param {Array<{envelopeCap:string, gateVerdict:string, executed:bool, audited:bool}>} trace
* @returns {{ ok: bool, violation?: Object }}
*/
function biconditionalHolds(trace) {
	for (let i = 0; i < trace.length; i += 1) {
		const r = trace[i];
		if (r.executed && (!r.audited || r.gateVerdict !== "admit")) return {
			ok: false,
			violation: {
				step: i,
				kind: "world-change-without-admitted-record",
				envelopeCap: r.envelopeCap,
				gateVerdict: r.gateVerdict,
				executed: r.executed,
				audited: r.audited
			}
		};
		if (r.gateVerdict === "admit" && !r.audited) return {
			ok: false,
			violation: {
				step: i,
				kind: "admitted-record-without-audit-entry",
				envelopeCap: r.envelopeCap
			}
		};
	}
	return { ok: true };
}
/**
* Reference gate model (paper §4 + §5). Given a manifest's capability
* set and a single envelope, returns a complete trace record:
*   { envelopeCap, gateVerdict, executed, audited }
*
* Behaviour:
*   - in-manifest envelope: gateVerdict='admit', executed=true, audited=true
*   - out-of-manifest envelope (cap == __OUT__): gateVerdict='deny',
*     executed=false, audited=true (the deny IS the audited event)
*
* The runtime gate in the framework (skill-gate.ts) implements this
* deterministically; the simulator below uses this reference model to
* make BMC tractable.
*
* @param {Set<string>} declared
* @param {string} envelopeCap
*/
function referenceGate(declared, envelopeCap) {
	if (envelopeCap === OUT_OF_MANIFEST || !declared.has(envelopeCap)) return {
		envelopeCap,
		gateVerdict: "deny",
		executed: false,
		audited: true
	};
	return {
		envelopeCap,
		gateVerdict: "admit",
		executed: true,
		audited: true
	};
}
/**
* Simulate a single concrete trace under the reference gate.
*
* @param {Set<string>} declared    — manifest capability set
* @param {Array<string>} envelopes — sequence of envelope capabilities
* @returns {Array<{envelopeCap:string, gateVerdict:string, executed:bool, audited:bool}>}
*/
function simulateTrace(declared, envelopes) {
	return envelopes.map((cap) => referenceGate(declared, cap));
}
/**
* Bounded model checker. Exhaustively enumerates every envelope
* sequence of length 0..bound where each envelope is drawn from
* (M.caps ∪ {__OUT__}), simulates it under the reference gate, and
* checks the biconditional invariant on the resulting trace.
*
* Returns
*   { verdict: 'unsat', exploredTraces, bound }            on success, or
*   { verdict: 'sat', counterExample, exploredTraces, bound } on a
*   biconditional violation. The counter-example is the smallest
*   envelope sequence that breaks the invariant.
*
* Soundness: the reference gate above is the runtime's documented
* behaviour; if the simulator's traces match the runtime's then any
* counter-example surfaces as such. The runtime SHOULD test
* referenceGate() ↔ skill-gate.ts at deployment via skill-formal-bundle's
* bootstrap re-check.
*
* Complexity: (|caps|+1)^bound traces, fully enumerated. The default
* bound is intentionally low (8) to keep the worst case quick; the
* paper's K_max ≈ 100 is achievable in practice because the runtime's
* transaction-buffer horizon is the bound that matters and the
* abstract domain is much smaller than the concrete envelope space.
*
* @param {Object} args
* @param {Iterable<string>} args.declaredCaps
* @param {number} [args.bound=8]
* @returns {{verdict:'sat'|'unsat', counterExample?:Object, exploredTraces:number, bound:number, abstractDomain:string[]}}
*/
function bmcBiconditional({ declaredCaps, bound = 8 }) {
	if (!Number.isInteger(bound) || bound < 0) throw new TypeError("bmcBiconditional: bound must be a non-negative integer");
	const declared = new Set(declaredCaps);
	for (const c of declared) if (!ALL_CAPS.has(c)) throw new TypeError(`bmcBiconditional: unknown capability "${c}"`);
	const domain = [...declared].toSorted();
	domain.push(OUT_OF_MANIFEST);
	let explored = 0;
	for (let len = 0; len <= bound; len += 1) {
		const result = enumerate(Array.from({ length: len }), 0, len, domain, declared);
		explored += result.explored;
		if (result.counterExample) return {
			verdict: "sat",
			counterExample: result.counterExample,
			exploredTraces: explored,
			bound,
			abstractDomain: domain
		};
	}
	return {
		verdict: "unsat",
		exploredTraces: explored,
		bound,
		abstractDomain: domain
	};
}
function enumerate(seq, pos, len, domain, declared) {
	if (pos === len) {
		const trace = simulateTrace(declared, seq);
		const result = biconditionalHolds(trace);
		if (!result.ok) return {
			explored: 1,
			counterExample: {
				envelopes: seq.slice(),
				trace,
				violation: result.violation
			}
		};
		return { explored: 1 };
	}
	let explored = 0;
	for (const cap of domain) {
		seq[pos] = cap;
		const r = enumerate(seq, pos + 1, len, domain, declared);
		explored += r.explored;
		if (r.counterExample) return {
			explored,
			counterExample: r.counterExample
		};
	}
	return { explored };
}
/**
* Method-C verdict object suitable for inclusion in a PCC bundle
* (paper §8).
*
* The verdict pins:
*   - the manifest's normalised capability set
*   - the bound K_max under which UNSAT was established
*   - the abstract domain (caps ∪ {__OUT__}) the search ranged over
*   - the number of traces explored (audit witness)
*   - a SHA-256 of (declaredCaps, bound) so the bundle re-checker can
*     trivially confirm it's discharging the same instance
*
* @param {{ declaredCaps: Iterable<string>, bound?: number }} args
*/
function methodC({ declaredCaps, bound = 8 }) {
	const declared = [...new Set(declaredCaps)].toSorted();
	const r = bmcBiconditional({
		declaredCaps: declared,
		bound
	});
	const instanceHash = createHash("sha256").update(JSON.stringify({
		declaredCaps: declared,
		bound
	})).digest("hex");
	return {
		method: "C",
		contained: r.verdict === "unsat",
		declaredCaps: declared,
		bound,
		abstractDomain: r.abstractDomain,
		exploredTraces: r.exploredTraces,
		instanceHash,
		...r.counterExample ? { counterExample: r.counterExample } : {},
		reason: r.verdict === "unsat" ? `bmc-unsat-up-to-bound-${bound}` : "bmc-found-biconditional-violation"
	};
}
//#endregion
//#region enclawed/src/skill-formal-static.mjs
const CAPABILITY$1 = Object.freeze({
	NET_EGRESS: "net.egress",
	FS_READ: "fs.read",
	FS_WRITE_REV: "fs.write.rev",
	FS_WRITE_IRREV: "fs.write.irrev",
	TOOL_INVOKE: "tool.invoke",
	SPAWN_PROC: "spawn.proc",
	PUBLISH: "publish",
	PAY: "pay",
	MUTATE_SCHEMA: "mutate.schema"
});
const TOP_EFFECT_SET = Object.freeze(new Set(Object.values(CAPABILITY$1)));
const PY_PATTERNS = Object.freeze([
	{
		re: /\brequests\.(?:get|post|put|delete|patch|head)\s*\(\s*([^,)]+)/g,
		cap: CAPABILITY$1.NET_EGRESS,
		extract: (m) => extractArgValue(m[1]) ? urlHost(extractArgValue(m[1])) : "*"
	},
	{
		re: /\bhttpx\.(?:get|post|put|delete|patch)\s*\(\s*([^,)]+)/g,
		cap: CAPABILITY$1.NET_EGRESS,
		extract: (m) => extractArgValue(m[1]) ? urlHost(extractArgValue(m[1])) : "*"
	},
	{
		re: /\burllib\.request\.urlopen\s*\(\s*([^,)]+)/g,
		cap: CAPABILITY$1.NET_EGRESS,
		extract: (m) => extractArgValue(m[1]) ? urlHost(extractArgValue(m[1])) : "*"
	},
	{
		re: /\bhttp\.client\.HTTPSConnection\s*\(\s*([^,)]+)/g,
		cap: CAPABILITY$1.NET_EGRESS,
		extract: (m) => extractArgValue(m[1]) ?? "*"
	},
	{
		re: /\bsocket\.create_connection\s*\(/g,
		cap: CAPABILITY$1.NET_EGRESS,
		extract: () => "*"
	},
	{
		re: /\bopen\s*\(\s*([^,)]+)\s*,\s*['"](w|wb|w\+|a|ab|a\+|x|xb)['"]/g,
		cap: CAPABILITY$1.FS_WRITE_REV,
		extract: (m) => extractArgValue(m[1]) ?? "*"
	},
	{
		re: /\bopen\s*\(([^\n]*?,[^\n]*?)['"](?:w|wb|w\+|wb\+|a|ab|a\+|ab\+|x|xb|r\+|rb\+)['"]/g,
		cap: CAPABILITY$1.FS_WRITE_REV,
		extract: (m) => extractArgValue(m[1]) ?? "*"
	},
	{
		re: /\bopen\s*\(\s*[^,()\n]*(?:\([^()\n]*\))?[^,()\n]*,\s*(?:[A-Za-z_][\w.]*\s*[,)]|\*)/g,
		cap: CAPABILITY$1.FS_WRITE_REV,
		extract: () => "*"
	},
	{
		re: /\.(?:write_text|write_bytes|touch|mkdir)\s*\(|\bos\.(?:makedirs|mkdir)\s*\(|\bshutil\.(?:copy|copy2|copyfile|copytree)\s*\(/g,
		cap: CAPABILITY$1.FS_WRITE_REV,
		extract: () => "*"
	},
	{
		re: /\bshutil\.move\s*\(|\bos\.(?:rename|replace|rmdir|removedirs)\s*\(|\.rename\s*\(|\.rmdir\s*\(/g,
		cap: CAPABILITY$1.FS_WRITE_IRREV,
		extract: () => "*"
	},
	{
		re: /\bopen\s*\(\s*([^,)]+)\s*\)/g,
		cap: CAPABILITY$1.FS_READ,
		extract: (m) => extractArgValue(m[1]) ?? "*"
	},
	{
		re: /\bopen\s*\(\s*([^,)]+)\s*,\s*['"]r/g,
		cap: CAPABILITY$1.FS_READ,
		extract: (m) => extractArgValue(m[1]) ?? "*"
	},
	{
		re: /\b(?:os\.remove|os\.unlink|shutil\.rmtree)\s*\(\s*([^,)]+)/g,
		cap: CAPABILITY$1.FS_WRITE_IRREV,
		extract: (m) => extractArgValue(m[1]) ?? "*"
	},
	{
		re: /\b\.unlink\s*\(\s*\)/g,
		cap: CAPABILITY$1.FS_WRITE_IRREV,
		extract: () => "*"
	},
	{
		re: /\bsubprocess\.(?:run|call|check_call|check_output|Popen)\s*\(\s*\[?\s*([^,)\]]+)/g,
		cap: CAPABILITY$1.SPAWN_PROC,
		extract: (m) => extractArgValue(m[1]) ?? "*"
	},
	{
		re: /\bos\.system\s*\(\s*([^,)]+)/g,
		cap: CAPABILITY$1.SPAWN_PROC,
		extract: (m) => {
			const v = extractArgValue(m[1]);
			return v ? v.split(/\s+/)[0] : "*";
		}
	},
	{
		re: /\b(?:session|tx|txn|transaction|cursor|cur|conn|connection|graph|db|client|engine)\.(?:run|execute|executemany|executescript|query|cypher|write_transaction|execute_write)\s*\(\s*('[^'\n]*'|"[^"\n]*"|[^,)]*)/g,
		cap: "__DB__",
		extract: (m) => extractArgValue(m[1])
	},
	{
		re: /\b(?:exec|eval|compile)\s*\(/g,
		cap: "__TOP__",
		extract: () => "reflective"
	},
	{
		re: /\b__import__\s*\(/g,
		cap: "__TOP__",
		extract: () => "reflective"
	},
	{
		re: /\bimportlib\.import_module\s*\(\s*[^'")\s]/g,
		cap: "__TOP__",
		extract: () => "dynamic-import"
	},
	{
		re: /\bgetattr\s*\(\s*[^,]+,\s*[^'"\s)]/g,
		cap: "__TOP__",
		extract: () => "computed-attribute"
	},
	{
		re: /\b(?:pickle|cPickle|_pickle|dill|cloudpickle|marshal|shelve|jsonpickle)\.(?:load|loads|Unpickler|open|decode)\b/g,
		cap: "__TOP__",
		extract: () => "deserialization-into-live-objects"
	},
	{
		re: /\byaml\.(?:load|load_all|unsafe_load|full_load)\s*\((?![^)]*SafeLoader)/g,
		cap: "__TOP__",
		extract: () => "deserialization-into-live-objects"
	},
	{
		re: /\btorch\.load\s*\((?![^)]*weights_only\s*=\s*True)/g,
		cap: "__TOP__",
		extract: () => "deserialization-into-live-objects"
	}
]);
function extractArgValue(expr) {
	if (typeof expr !== "string") return null;
	const trimmed = expr.trim();
	const m = trimmed.match(/^['"]([^'"]+)['"]/);
	if (m) return m[1];
	const f = trimmed.match(/^f['"]([^{'"]*)/);
	if (f && f[1].length > 0) return f[1];
	return null;
}
const SH_PATTERNS = Object.freeze([
	{
		re: /\b(?:curl|wget|http|httpie)\s+[^|;&\n]*?(https?:\/\/[^\s|;&'"]+)/g,
		cap: CAPABILITY$1.NET_EGRESS,
		extract: (m) => urlHost(m[1])
	},
	{
		re: /\bnc(?:at)?\s+([^\s|;&]+)/g,
		cap: CAPABILITY$1.NET_EGRESS,
		extract: (m) => m[1]
	},
	{
		re: />\s*([^\s|;&]+)/g,
		cap: CAPABILITY$1.FS_WRITE_REV,
		extract: (m) => m[1]
	},
	{
		re: />>\s*([^\s|;&]+)/g,
		cap: CAPABILITY$1.FS_WRITE_REV,
		extract: (m) => m[1]
	},
	{
		re: /\b(?:rm|rmdir)\s+(?:-[a-z]+\s+)*([^\s|;&]+)/g,
		cap: CAPABILITY$1.FS_WRITE_IRREV,
		extract: (m) => m[1]
	},
	{
		re: /\bmv\s+(?:[^\s|;&]+\s+)+?([^\s|;&]+)/g,
		cap: CAPABILITY$1.FS_WRITE_IRREV,
		extract: (m) => m[1]
	},
	{
		re: /\b(?:bash|sh|zsh|fish|python3?|node|npm|npx|pip|pnpm|yarn)\s/g,
		cap: CAPABILITY$1.SPAWN_PROC,
		extract: () => null
	},
	{
		re: /(?:^|[\s;&|(`])(?:cat|head|tail|less|more|grep|egrep|fgrep|awk|sed|cut|sort|uniq|wc|od|xxd|base64|strings)\s+(?:-[A-Za-z0-9]+\s+)*([^\s|;&<>-][^\s|;&<>]*)/gm,
		cap: CAPABILITY$1.FS_READ,
		extract: (m) => m[1]
	},
	{
		re: /<\s*([^\s|;&<>(]+)/g,
		cap: CAPABILITY$1.FS_READ,
		extract: (m) => m[1]
	},
	{
		re: /(?:^|[\s;&|(`])(?:tee|cp|install|touch|mkdir|ln)\s+(?:-[A-Za-z]+\s+)*(?:[^\s|;&]+\s+)*?([^\s|;&-][^\s|;&]*)\s*(?=$|[|;&\n])/gm,
		cap: CAPABILITY$1.FS_WRITE_REV,
		extract: (m) => m[1]
	},
	{
		re: /(?:^|[\s;&|(`])sed\s+(?:-[A-Za-z]*\s+)*-i/gm,
		cap: CAPABILITY$1.FS_WRITE_REV,
		extract: () => "*"
	},
	{
		re: /(?:^|[\s;&|(`])(?:dd|truncate|shred|chmod|chown)\s/gm,
		cap: CAPABILITY$1.FS_WRITE_IRREV,
		extract: () => "*"
	},
	{
		re: /(?:^|[\s;&|(`])(?:ssh|scp|sftp|rsync|ftp|telnet|socat)\s/gm,
		cap: CAPABILITY$1.NET_EGRESS,
		extract: () => "*"
	},
	{
		re: /\/dev\/(?:tcp|udp)\//g,
		cap: CAPABILITY$1.NET_EGRESS,
		extract: () => "*"
	},
	{
		re: /\beval\s+/g,
		cap: "__TOP__",
		extract: () => "reflective"
	},
	{
		re: /(?:^|[\s;&|(])(?:source|\.)\s+["']?\$/gm,
		cap: "__TOP__",
		extract: () => "source-of-a-variable"
	}
]);
function extractJsArg(expr) {
	if (typeof expr !== "string") return null;
	const m = expr.trim().match(/^['"`]([^'"`]+)['"`]/);
	return m ? m[1] : null;
}
const JS_PATTERNS = Object.freeze([
	{
		re: /\bfetch\s*\(\s*([^,)]+)/g,
		cap: CAPABILITY$1.NET_EGRESS,
		extract: (m) => {
			const v = extractJsArg(m[1]);
			return v ? urlHost(v) : "*";
		}
	},
	{
		re: /\b(?:http|https)\.(?:get|request)\s*\(\s*([^,)]+)/g,
		cap: CAPABILITY$1.NET_EGRESS,
		extract: (m) => {
			const v = extractJsArg(m[1]);
			return v ? urlHost(v) : "*";
		}
	},
	{
		re: /\b(?:fs|fsp|fsPromises)\.(?:writeFile|appendFile|writeFileSync|appendFileSync)\s*\(\s*([^,)]+)/g,
		cap: CAPABILITY$1.FS_WRITE_REV,
		extract: (m) => extractJsArg(m[1]) ?? "*"
	},
	{
		re: /\b(?:fs|fsp|fsPromises)\.(?:unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync)\s*\(\s*([^,)]+)/g,
		cap: CAPABILITY$1.FS_WRITE_IRREV,
		extract: (m) => extractJsArg(m[1]) ?? "*"
	},
	{
		re: /\b(?:fs|fsp|fsPromises)\.(?:readFile|readFileSync|readdir|readdirSync)\s*\(\s*([^,)]+)/g,
		cap: CAPABILITY$1.FS_READ,
		extract: (m) => extractJsArg(m[1]) ?? "*"
	},
	{
		re: /\bchild_process\.(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(\s*([^,)]+)/g,
		cap: CAPABILITY$1.SPAWN_PROC,
		extract: (m) => extractJsArg(m[1]) ?? "*"
	},
	{
		re: /\brequire\s*\(\s*['"`]child_process['"`]\s*\)\s*\.\s*(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(\s*([^,)]+)/g,
		cap: CAPABILITY$1.SPAWN_PROC,
		extract: (m) => extractJsArg(m[1]) ?? "*"
	},
	{
		re: /\bimport\s*\(\s*['"`]child_process['"`]\s*\)\s*\.\s*(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(\s*([^,)]+)/g,
		cap: CAPABILITY$1.SPAWN_PROC,
		extract: (m) => extractJsArg(m[1]) ?? "*"
	},
	{
		re: /\b(?:session|tx|txn|transaction|client|pool|db|conn|connection|graph|driver|knex|sequelize|prisma)\.(?:run|query|execute|executeRead|executeWrite|raw|\$queryRawUnsafe|\$executeRawUnsafe|cypher)\s*\(\s*('[^'\n]*'|"[^"\n]*"|`[^`$]*`|[^,)]*)/g,
		cap: "__DB__",
		extract: (m) => extractJsArg(m[1])
	},
	{
		re: /\beval\s*\(/g,
		cap: "__TOP__",
		extract: () => "reflective"
	},
	{
		re: /\bnew Function\s*\(/g,
		cap: "__TOP__",
		extract: () => "reflective"
	},
	{
		re: /(?<![.\w$])Function\s*\(\s*['"`]/g,
		cap: "__TOP__",
		extract: () => "reflective"
	},
	{
		re: /\bvm\.(?:runIn\w*|compileFunction|Script)\b/g,
		cap: "__TOP__",
		extract: () => "reflective"
	},
	{
		re: /\bReflect\.construct\s*\(/g,
		cap: "__TOP__",
		extract: () => "deserialization-into-live-objects"
	},
	{
		re: /\bnew(?:\s+|\s*\(\s*)[\w$.]+\s*\[[^\]]+\]/g,
		cap: "__TOP__",
		extract: () => "deserialization-into-live-objects"
	},
	{
		re: /\b(?:unserialize|deserialize)\s*\(/g,
		cap: "__TOP__",
		extract: () => "deserialization-into-live-objects"
	},
	{
		re: /\byaml\.load\s*\([^)]*(?:schema\s*:\s*\w*(?:UNSAFE|unsafe|Unsafe)|DEFAULT_FULL_SCHEMA)/g,
		cap: "__TOP__",
		extract: () => "deserialization-into-live-objects"
	},
	{
		re: /\b(?:require|import)\s*\(\s*[a-zA-Z_$]/g,
		cap: "__TOP__",
		extract: () => "dynamic-import"
	}
]);
const FS_WRITE_NAMES = new Set([
	"writeFile",
	"writeFileSync",
	"appendFile",
	"appendFileSync",
	"createWriteStream",
	"copyFile",
	"copyFileSync",
	"cp",
	"cpSync",
	"mkdir",
	"mkdirSync",
	"open",
	"openSync"
]);
const FS_IRREV_NAMES = new Set([
	"unlink",
	"unlinkSync",
	"rm",
	"rmSync",
	"rmdir",
	"rmdirSync",
	"rename",
	"renameSync",
	"truncate",
	"truncateSync"
]);
const FS_READ_NAMES = new Set([
	"readFile",
	"readFileSync",
	"readdir",
	"readdirSync",
	"createReadStream"
]);
/** Local name -> imported name of every binding taken from fs / fs/promises. */
function fsImports(src) {
	const out = /* @__PURE__ */ new Map();
	const lists = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](?:node:)?fs(?:\/promises)?['"]/g), ...src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:require\s*\(\s*['"](?:node:)?fs(?:\/promises)?['"]\s*\)|await\s+import\s*\(\s*['"](?:node:)?fs(?:\/promises)?['"]\s*\))/g)];
	for (const m of lists) for (const part of m[1].split(",")) {
		const t = part.trim();
		const as = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(t) ?? /^([\w$]+)\s*:\s*([\w$]+)$/.exec(t);
		if (as) out.set(as[2], as[1]);
		else if (/^[\w$]+$/.test(t)) out.set(t, t);
	}
	return out;
}
const QUERY_WRITE = /\b(?:CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|INSERT|UPDATE|ALTER|TRUNCATE|REPLACE|GRANT|REVOKE|CALL|LOAD|COPY|ATTACH|VACUUM|UPSERT)\b/i;
const QUERY_DDL = /\b(?:CREATE\s+(?:TABLE|INDEX|CONSTRAINT|DATABASE|SCHEMA|VIEW|TRIGGER)|DROP|ALTER|TRUNCATE)\b/i;
function queryCapabilities(literal) {
	if (typeof literal !== "string") return [
		CAPABILITY$1.FS_READ,
		CAPABILITY$1.FS_WRITE_IRREV,
		CAPABILITY$1.MUTATE_SCHEMA
	];
	if (QUERY_DDL.test(literal)) return [CAPABILITY$1.MUTATE_SCHEMA];
	return QUERY_WRITE.test(literal) ? [CAPABILITY$1.FS_WRITE_IRREV] : [CAPABILITY$1.FS_READ];
}
function urlHost(s) {
	try {
		if (s.startsWith("http://") || s.startsWith("https://")) return new URL(s).hostname || "*";
	} catch {}
	return "*";
}
/** The source as the pattern packs read it (comments removed), for a second analysis. */
function stripForAnalysis(src, ext) {
	const c = LANG_PATTERNS[ext];
	return c ? c.stripComments(src) : src;
}
const LANG_PATTERNS = Object.freeze({
	".py": {
		name: "python",
		patterns: PY_PATTERNS,
		stripComments: stripPythonComments
	},
	".sh": {
		name: "sh",
		patterns: SH_PATTERNS,
		stripComments: stripShellComments
	},
	".bash": {
		name: "sh",
		patterns: SH_PATTERNS,
		stripComments: stripShellComments
	},
	".mjs": {
		name: "javascript",
		patterns: JS_PATTERNS,
		stripComments: stripCStyleComments
	},
	".cjs": {
		name: "javascript",
		patterns: JS_PATTERNS,
		stripComments: stripCStyleComments
	},
	".js": {
		name: "javascript",
		patterns: JS_PATTERNS,
		stripComments: stripCStyleComments
	},
	".ts": {
		name: "typescript",
		patterns: JS_PATTERNS,
		stripComments: stripCStyleComments
	},
	".tsx": {
		name: "typescript",
		patterns: JS_PATTERNS,
		stripComments: stripCStyleComments
	},
	".jsx": {
		name: "javascript",
		patterns: JS_PATTERNS,
		stripComments: stripCStyleComments
	}
});
function stripPythonComments(src) {
	return src.replace(/"""[\s\S]*?"""/g, "\"\"").replace(/'''[\s\S]*?'''/g, "''").replace(/(^|[^\\])#[^\n]*/g, "$1");
}
function stripShellComments(src) {
	return src.replace(/(^|[^\\])#[^\n]*/g, "$1");
}
function stripCStyleComments(src) {
	return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
/**
* Analyse a single source string under a chosen language. Returns
*   { effects: Array<{cap, abstractValue, location}>, top: bool, language }
* where `top` is true iff a reflective construct lifted the analysis
* to TOP (the program may produce any effect; capability containment
* cannot be established by static means).
*/
function analyzeSource(src, language) {
	const langConfig = LANG_PATTERNS[language];
	if (!langConfig) return {
		effects: [],
		top: true,
		language,
		reason: "unknown-language"
	};
	const stripped = langConfig.stripComments(src);
	const effects = [];
	if (langConfig.patterns === JS_PATTERNS) for (const m of stripped.matchAll(/(?:const|let|var)\s+([\w$]+)\s*=\s*(?:[\w$.]+\s*\[[^\]]+\]|[\w$.]+\.get\s*\(|Reflect\.get\s*\()/g)) {
		const id = m[1].replace(/\$/g, "\\$");
		if (new RegExp(`\\bnew\\s+${id}\\s*\\(`).test(stripped)) return {
			effects: [],
			top: true,
			language: langConfig.name,
			reason: "reflective-construct: deserialization-into-live-objects"
		};
	}
	if (langConfig.patterns === JS_PATTERNS) for (const [local, imported] of fsImports(stripped)) {
		const cap = FS_WRITE_NAMES.has(imported) ? CAPABILITY$1.FS_WRITE_REV : FS_IRREV_NAMES.has(imported) ? CAPABILITY$1.FS_WRITE_IRREV : FS_READ_NAMES.has(imported) ? CAPABILITY$1.FS_READ : null;
		if (!cap) continue;
		const re = new RegExp(`(?<![\\w$.])${local.replace(/\$/g, "\\$")}\\s*\\(\\s*([^,)]+)`, "g");
		let m;
		while ((m = re.exec(stripped)) !== null) effects.push({
			capability: cap,
			abstractValue: extractJsArg(m[1]) ?? "*",
			location: {
				offset: m.index,
				snippet: m[0].slice(0, 80)
			}
		});
	}
	let top = false;
	let topReason = null;
	for (const pat of langConfig.patterns) {
		pat.re.lastIndex = 0;
		let m;
		while ((m = pat.re.exec(stripped)) !== null) {
			if (pat.cap === "__TOP__") {
				top = true;
				topReason = topReason ?? pat.extract(m);
				continue;
			}
			if (pat.cap === "__DB__") {
				for (const cap of queryCapabilities(pat.extract(m))) effects.push({
					capability: cap,
					abstractValue: "query",
					location: {
						offset: m.index,
						snippet: m[0].slice(0, 80)
					}
				});
				continue;
			}
			const abstractValue = pat.extract(m);
			const offset = m.index;
			effects.push({
				capability: pat.cap,
				abstractValue: abstractValue ?? null,
				location: {
					offset,
					snippet: m[0].slice(0, 80)
				}
			});
		}
	}
	return {
		effects,
		top,
		language: langConfig.name,
		...top ? { reason: "reflective-construct: " + (topReason ?? "unknown") } : {}
	};
}
const DATA_EXTENSIONS = new Set([
	".md",
	".markdown",
	".txt",
	".rst",
	".json",
	".jsonc",
	".yaml",
	".yml",
	".toml",
	".ini",
	".cfg",
	".csv",
	".tsv",
	".xml",
	".lock",
	".map",
	".png",
	".jpg",
	".jpeg",
	".gif",
	".svg",
	".ico",
	".webp",
	".bmp",
	".woff",
	".woff2",
	".ttf",
	".otf",
	".eot",
	".pdf",
	".css",
	".license",
	".gitignore",
	".npmignore",
	".editorconfig"
]);
/** The language of an extensionless file run directly, or null when it is not a script. */
function shebangLanguage(fp) {
	let head = "";
	let exec = false;
	let fd = -1;
	try {
		fd = openSync(fp, "r");
		exec = (fstatSync(fd).mode & 73) !== 0;
		const buf = Buffer.alloc(256);
		const n = readSync(fd, buf, 0, 256, 0);
		head = buf.subarray(0, n).toString("latin1");
	} catch {
		return ".opaque";
	} finally {
		if (fd >= 0) try {
			closeSync(fd);
		} catch {}
	}
	const m = /^#!\s*(\S+)(?:\s+(\S+))?/.exec(head);
	if (!m) return exec ? ".opaque" : null;
	const interp = path.basename(m[1]) === "env" ? m[2] ?? "" : path.basename(m[1]);
	if (/^(sh|bash|dash|zsh)$/.test(interp)) return ".sh";
	if (/^python[0-9.]*$/.test(interp)) return ".py";
	if (/^(node|nodejs)$/.test(interp)) return ".js";
	return ".opaque";
}
/**
* Analyse a directory tree of skill content. Walks every regular file,
* dispatches by extension, returns:
*   {
*     perScript: Record<scriptPath, { language, top, reason?, effects[] }>,
*     unionEffects: Set<capability-token>,
*     opaqueFiles: string[],   // files whose extension has no analyser
*     anyTop: bool,
*     stats: { scriptsAnalysed, scriptsOpaque, totalEffects }
*   }
*
* @param {string} dir
* @returns {Object}
*/
function analyzeSkillDirectory(dir, { onScript } = {}) {
	const perScript = {};
	const unionEffects = /* @__PURE__ */ new Set();
	const opaqueFiles = [];
	let anyTop = false;
	let totalEffects = 0;
	let scriptsAnalysed = 0;
	let scriptsOpaque = 0;
	const walk = (root) => {
		let entries;
		try {
			entries = readdirSync(root, { withFileTypes: true });
		} catch {
			return;
		}
		for (const ent of entries) {
			if (ent.isDirectory()) {
				if (ent.name === ".git") {
					opaqueFiles.push(path.relative(dir, path.join(root, ent.name)) + "/");
					scriptsOpaque += 1;
					continue;
				}
				walk(path.join(root, ent.name));
				continue;
			}
			if (!ent.isFile()) {
				opaqueFiles.push(path.relative(dir, path.join(root, ent.name)));
				scriptsOpaque += 1;
				continue;
			}
			const fp = path.join(root, ent.name);
			let ext = path.extname(ent.name).toLowerCase();
			if (ent.name === "SKILL.md") continue;
			if (DATA_EXTENSIONS.has(ext)) continue;
			if (ext === "") {
				const lang = shebangLanguage(fp);
				if (lang === null) continue;
				ext = lang;
			}
			if (!LANG_PATTERNS[ext]) {
				opaqueFiles.push(path.relative(dir, fp));
				scriptsOpaque += 1;
				continue;
			}
			let src;
			let fd = -1;
			try {
				fd = openSync(fp, "r");
				if (fstatSync(fd).size > 5 * 1024 * 1024) {
					opaqueFiles.push(path.relative(dir, fp));
					scriptsOpaque += 1;
					continue;
				}
				src = readFileSync(fd, "utf8");
			} catch {
				opaqueFiles.push(path.relative(dir, fp));
				scriptsOpaque += 1;
				continue;
			} finally {
				if (fd >= 0) try {
					closeSync(fd);
				} catch {}
			}
			const r = analyzeSource(src, ext);
			perScript[path.relative(dir, fp)] = r;
			onScript?.({
				src,
				ext,
				file: fp,
				rel: path.relative(dir, fp)
			});
			if (r.top) anyTop = true;
			for (const e of r.effects) unionEffects.add(e.capability);
			totalEffects += r.effects.length;
			scriptsAnalysed += 1;
		}
	};
	walk(dir);
	return {
		perScript,
		unionEffects,
		opaqueFiles,
		anyTop,
		stats: {
			scriptsAnalysed,
			scriptsOpaque,
			totalEffects
		}
	};
}
/**
* Soundness check: report whether the analysed effect union is
* contained in M.caps. Returns
*   { contained: bool, escapingCapabilities: string[], reason: string }
*
* If `anyTop` is true the analyser cannot conclude containment by
* static means — return contained=false with reason="reflective".
*
* @param {Object} analysis  — output of analyzeSkillDirectory
* @param {Array<string>}  declaredCaps  — manifest M.caps
* @returns {{ contained: bool, escapingCapabilities: string[], reason: string }}
*/
function checkContainment(analysis, declaredCaps) {
	if (analysis.anyTop) return {
		contained: false,
		escapingCapabilities: [...TOP_EFFECT_SET].toSorted(),
		reason: "reflective-construct-tainted-program-to-TOP"
	};
	const declared = new Set(declaredCaps);
	const escaping = [];
	for (const cap of analysis.unionEffects) if (!declared.has(cap)) escaping.push(cap);
	if (escaping.length > 0) return {
		contained: false,
		escapingCapabilities: escaping.toSorted((a, b) => a < b ? -1 : a > b ? 1 : 0),
		reason: "effects-outside-manifest-caps"
	};
	return {
		contained: true,
		escapingCapabilities: [],
		reason: "sound-static-effect-containment"
	};
}
/**
* Convenience: run analyzeSkillDirectory + checkContainment and return
* a single Method-A verdict object suitable for inclusion in a PCC
* bundle (\\S 8 of the paper).
*
* @param {string} dir
* @param {Array<string>} declaredCaps
*/
function methodA({ dir, declaredCaps, writeRoots }) {
	const analysis = analyzeSkillDirectory(dir);
	let containment = checkContainment(analysis, declaredCaps);
	const roots = Array.isArray(writeRoots) && writeRoots.length ? [...writeRoots].toSorted((a, b) => a < b ? -1 : a > b ? 1 : 0) : null;
	const escapingWrites = roots ? writesOutside(analysis, roots) : [];
	if (containment.contained && escapingWrites.length) containment = {
		contained: false,
		escapingCapabilities: [],
		reason: "write-path-may-leave-declared-folders"
	};
	return {
		method: "A",
		contained: containment.contained,
		declaredCaps: [...declaredCaps].toSorted((a, b) => a < b ? -1 : a > b ? 1 : 0),
		unionEffects: [...analysis.unionEffects].toSorted((a, b) => a < b ? -1 : a > b ? 1 : 0),
		escapingCapabilities: containment.escapingCapabilities,
		anyTop: analysis.anyTop,
		perScript: Object.fromEntries(Object.entries(analysis.perScript).map(([k, v]) => [k, {
			language: v.language,
			top: !!v.top,
			...v.reason ? { reason: v.reason } : {},
			effects: v.effects.map((e) => ({
				capability: e.capability,
				abstractValue: e.abstractValue
			}))
		}])),
		opaqueFiles: analysis.opaqueFiles.toSorted(),
		stats: analysis.stats,
		reason: containment.reason,
		...roots ? {
			writeRoots: roots,
			escapingWrites
		} : {}
	};
}
/** Every write effect whose path is not a literal inside a declared root: { script, value }. */
function writesOutside(analysis, roots) {
	const norm = (p) => path.posix.normalize(String(p).replace(/^\.\//, "")).replace(/\/+$/, "");
	const inside = (v) => typeof v === "string" && v !== "*" && !path.isAbsolute(v) && !norm(v).split("/").includes("..") && roots.some((r) => norm(v) === norm(r) || norm(v).startsWith(`${norm(r)}/`));
	const out = [];
	for (const [script, r] of Object.entries(analysis.perScript)) for (const e of r.effects) if ((e.capability === CAPABILITY$1.FS_WRITE_REV || e.capability === CAPABILITY$1.FS_WRITE_IRREV) && !inside(e.abstractValue)) out.push({
		script,
		value: e.abstractValue ?? "*"
	});
	return out.toSorted((a, b) => a.script + a.value < b.script + b.value ? -1 : 1);
}
//#endregion
//#region enclawed/src/skill-formal-bundle.mjs
const TOOLCHAIN = Object.freeze({
	methodA: {
		name: "enclawed-skill-formal-static",
		version: "1.0.0"
	},
	methodB: {
		name: "enclawed-skill-formal-types",
		version: "1.0.0"
	},
	methodC: {
		name: "enclawed-skill-formal-bmc",
		version: "1.0.0"
	}
});
const ATTESTATION_VERIFICATION_LEVEL = "formal";
function canonicalize$1(value) {
	if (value === void 0) throw new TypeError("cannot canonicalize undefined");
	if (value === null) return "null";
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new TypeError("cannot canonicalize non-finite number");
		return JSON.stringify(value);
	}
	if (typeof value === "string") return JSON.stringify(value);
	if (Array.isArray(value)) return "[" + value.map((v) => canonicalize$1(v === void 0 ? null : v)).join(",") + "]";
	if (typeof value === "object") return "{" + Object.keys(value).filter((k) => value[k] !== void 0).toSorted().map((k) => JSON.stringify(k) + ":" + canonicalize$1(value[k])).join(",") + "}";
	throw new TypeError("cannot canonicalize value of type " + typeof value);
}
function sha256OfCanonical$1(value) {
	return createHash("sha256").update(canonicalize$1(value), "utf8").digest("hex");
}
/**
* Produce a formal-verification bundle for the given skill, manifest,
* and BMC bound.
*
* @param {Object} args
* @param {string}   args.skillDir       — directory containing the skill
*                                          (SKILL.md + scripts).
* @param {Object}   args.manifest       — the parsed skill manifest
*                                          ({id, version, caps, ...}).
* @param {string}   [args.signerKeyId]  — id of the signer producing the
*                                          attestation; mandatory for a
*                                          publishable bundle but
*                                          omittable in tests.
* @param {string}   [args.privateKeyPem]
*                                       — PEM private key of the signer;
*                                          mandatory iff signerKeyId is
*                                          set.
* @param {number}   [args.bound=8]      — Method-C BMC bound.
* @returns {Object}                     — the bundle (a JSON object).
*/
function produceFormalBundle({ skillDir, manifest, signerKeyId, privateKeyPem, bound = 8 }) {
	if (!skillDir) throw new TypeError("produceFormalBundle: skillDir required");
	if (!manifest) throw new TypeError("produceFormalBundle: manifest required");
	if (!Array.isArray(manifest.caps) && !(manifest.caps instanceof Set)) throw new TypeError("produceFormalBundle: manifest.caps required");
	if (signerKeyId && !privateKeyPem) throw new TypeError("produceFormalBundle: privateKeyPem required when signerKeyId is set");
	if (privateKeyPem && !signerKeyId) throw new TypeError("produceFormalBundle: signerKeyId required when privateKeyPem is set");
	const declared = [...new Set(manifest.caps)].toSorted((a, b) => a < b ? -1 : a > b ? 1 : 0);
	const a = methodA({
		dir: skillDir,
		declaredCaps: declared,
		writeRoots: manifest.writeRoots
	});
	const b = methodB({ manifest });
	const c = methodC({
		declaredCaps: declared,
		bound
	});
	const allContained = a.contained && b.contained && c.contained;
	const evidence = {
		static: a,
		types: b,
		smt_unsat: c
	};
	const manifestHash = sha256OfCanonical$1(manifest);
	const evidenceHashes = {
		static: sha256OfCanonical$1(a),
		types: sha256OfCanonical$1(b),
		smt_unsat: sha256OfCanonical$1(c)
	};
	const attestation = {
		schemaVersion: 1,
		verificationLevel: ATTESTATION_VERIFICATION_LEVEL,
		skillId: manifest.id ?? null,
		skillVersion: manifest.version ?? null,
		manifestHash,
		evidenceHashes,
		toolchain: TOOLCHAIN,
		bound,
		contained: allContained,
		producedAt: (/* @__PURE__ */ new Date()).toISOString(),
		signerKeyId: signerKeyId ?? null
	};
	if (signerKeyId && privateKeyPem) attestation.signature = signManifest$1(Buffer.from(canonicalize$1(attestation), "utf8"), privateKeyPem);
	return {
		schemaVersion: 1,
		evidence,
		attestation
	};
}
/**
* Persist a bundle to disk under bundleDir, one file per evidence
* artefact plus the attestation. The shape matches paper §8:
*   <bundleDir>/static.json
*   <bundleDir>/types.proof.json
*   <bundleDir>/smt.unsat.json
*   <bundleDir>/manifest.attest.json
*
* @param {Object} bundle  — a value returned by produceFormalBundle
* @param {string} bundleDir
*/
function writeFormalBundle(bundle, bundleDir) {
	if (!existsSync(bundleDir)) mkdirSync(bundleDir, { recursive: true });
	writeFileSync(path.join(bundleDir, "static.json"), JSON.stringify(bundle.evidence.static, null, 2) + "\n");
	writeFileSync(path.join(bundleDir, "types.proof.json"), JSON.stringify(bundle.evidence.types, null, 2) + "\n");
	writeFileSync(path.join(bundleDir, "smt.unsat.json"), JSON.stringify(bundle.evidence.smt_unsat, null, 2) + "\n");
	writeFileSync(path.join(bundleDir, "manifest.attest.json"), JSON.stringify(bundle.attestation, null, 2) + "\n");
}
/**
* Load a bundle from disk. Inverse of writeFormalBundle.
*/
function readFormalBundle(bundleDir) {
	const evidence = {
		static: JSON.parse(readFileSync(path.join(bundleDir, "static.json"), "utf8")),
		types: JSON.parse(readFileSync(path.join(bundleDir, "types.proof.json"), "utf8")),
		smt_unsat: JSON.parse(readFileSync(path.join(bundleDir, "smt.unsat.json"), "utf8"))
	};
	const attestation = JSON.parse(readFileSync(path.join(bundleDir, "manifest.attest.json"), "utf8"));
	return {
		schemaVersion: attestation.schemaVersion ?? 1,
		evidence,
		attestation
	};
}
/**
* Bootstrap-time re-check of a formal-verification bundle.
*
* Discharges the four checks of paper §8:
*   1. Verify the bundle's attestation signature against the trust
*      root (caller supplies the signer's public key).
*   2. Re-run Method A on the skill directory and confirm the
*      verdict is reproduced byte-for-byte (modulo per-script effect
*      ordering, which is canonicalised before comparison).
*   3. Re-run Method B against the same manifest and confirm the
*      probe outcomes reproduce.
*   4. Re-run Method C at the bundle's pinned bound and confirm
*      UNSAT.
*
* Returns
*   { admit: bool, verificationLevel: 'formal'|'declared',
*     reasons: string[], evidence: {...}, freshlyComputed: {...} }
*
* On any reproduction mismatch the verdict drops to 'declared' (the
* runtime's safe degraded level) with a human-readable reason. The
* runtime never trusts the producer's say-so; the bundle is a
* pre-computed cache and the runtime is the verifier.
*
* @param {Object} args
* @param {string} args.skillDir
* @param {Object} args.manifest
* @param {Object} args.bundle
* @param {string} [args.signerPublicKeyPem]  — required if the bundle
*                                                carries a signature.
* @param {Set<string>|Array<string>} [args.authorisedFormalSigners]
*                                                — optional set of
*                                                signer keyIds the
*                                                runtime trusts to
*                                                attest at level
*                                                FORMAL. If supplied,
*                                                an attestation by
*                                                a non-listed signer
*                                                is rejected.
*/
function verifyFormalBundle({ skillDir, manifest, bundle, signerPublicKeyPem, authorisedFormalSigners }) {
	const reasons = [];
	let admit = true;
	if (bundle.attestation?.signature) if (!signerPublicKeyPem) {
		admit = false;
		reasons.push("attestation-signed-but-no-public-key-provided");
	} else {
		const attestationCopy = { ...bundle.attestation };
		const sig = attestationCopy.signature;
		delete attestationCopy.signature;
		if (!verifyManifestSignature$1(Buffer.from(canonicalize$1(attestationCopy), "utf8"), sig, signerPublicKeyPem)) {
			admit = false;
			reasons.push("attestation-signature-failed");
		}
	}
	else reasons.push("attestation-unsigned-warning-only");
	if (authorisedFormalSigners) {
		const authorised = authorisedFormalSigners instanceof Set ? authorisedFormalSigners : new Set(authorisedFormalSigners);
		if (!bundle.attestation?.signerKeyId || !authorised.has(bundle.attestation.signerKeyId)) {
			admit = false;
			reasons.push(`attestation-signer-not-authorised-for-formal: ${bundle.attestation?.signerKeyId ?? "(none)"}`);
		}
	}
	const declared = [...new Set(manifest.caps ?? [])].toSorted((a, b) => a < b ? -1 : a > b ? 1 : 0);
	const freshA = methodA({
		dir: skillDir,
		declaredCaps: declared,
		writeRoots: manifest.writeRoots
	});
	const cachedA = bundle.evidence.static;
	const aHashFresh = sha256OfCanonical$1(freshA);
	const aHashCached = sha256OfCanonical$1(cachedA);
	if (aHashFresh !== aHashCached) {
		admit = false;
		reasons.push("method-A-cache-miss-effect-summary-drifted");
	} else if (!freshA.contained) {
		admit = false;
		reasons.push("method-A-not-contained: " + freshA.reason);
	}
	const freshB = methodB({ manifest });
	const cachedB = bundle.evidence.types;
	const bHashFresh = sha256OfCanonical$1(freshB);
	const bHashCached = sha256OfCanonical$1(cachedB);
	if (bHashFresh !== bHashCached) {
		admit = false;
		reasons.push("method-B-cache-miss-refinement-probe-drifted");
	} else if (!freshB.contained) {
		admit = false;
		reasons.push("method-B-not-contained: " + freshB.reason);
	}
	const freshC = methodC({
		declaredCaps: declared,
		bound: bundle.evidence.smt_unsat.bound ?? 8
	});
	const cachedC = bundle.evidence.smt_unsat;
	if (freshC.instanceHash !== cachedC.instanceHash) {
		admit = false;
		reasons.push("method-C-cache-miss-instance-hash-drifted");
	} else if (freshC.contained !== cachedC.contained) {
		admit = false;
		reasons.push("method-C-cache-miss-verdict-drifted");
	} else if (!freshC.contained) {
		admit = false;
		reasons.push("method-C-not-contained: " + freshC.reason);
	}
	if (bundle.attestation?.evidenceHashes) {
		const eh = bundle.attestation.evidenceHashes;
		if (eh.static !== aHashCached) {
			admit = false;
			reasons.push("attestation-static-hash-mismatch");
		}
		if (eh.types !== bHashCached) {
			admit = false;
			reasons.push("attestation-types-hash-mismatch");
		}
		if (eh.smt_unsat !== sha256OfCanonical$1(cachedC)) {
			admit = false;
			reasons.push("attestation-smt-hash-mismatch");
		}
	}
	return {
		admit,
		verificationLevel: admit ? "formal" : "declared",
		reasons,
		evidence: bundle.evidence,
		freshlyComputed: {
			static: freshA,
			types: freshB,
			smt_unsat: freshC
		}
	};
}
//#endregion
//#region enclawed/src/skill-formal-shell.mjs
/** A set of words given as one space-separated string. */
const words$1 = (text) => new Set(text.split(/\s+/).filter(Boolean));
const READ$1 = "fs.read";
const REV$1 = "fs.write.rev";
const IRREV$1 = "fs.write.irrev";
const NET$1 = "net.egress";
const SPAWN$1 = "spawn.proc";
/**
* Split shell source into simple commands. Each: { words: [{text, computed}],
* end } where `end` is the separator that ended it. Command substitutions
* ($(...), `...`, <(...), >(...)) and the substitutions inside unquoted
* here-documents are returned in `subs` (analysed as scripts of their own);
* a word that holds an expansion is `computed`.
*/
function shellCommands(src) {
	const commands = [];
	const subs = [];
	let words = [];
	let w = null;
	let redirectNext = false;
	const heredocs = [];
	let i = 0;
	const n = src.length;
	const flushWord = () => {
		if (w) {
			if (redirectNext) redirectNext = false;
			else words.push(w);
			w = null;
		}
	};
	const endCommand = (sep) => {
		flushWord();
		commands.push({
			words,
			end: sep
		});
		words = [];
	};
	const word = () => w ??= {
		text: "",
		computed: false
	};
	const matchParen = (j) => {
		let depth = 1;
		let q = null;
		for (; j < n; j++) {
			const c = src[j];
			if (q) {
				if (c === "\\" && q === "\"") j++;
				else if (c === q) q = null;
				continue;
			}
			if (c === "\\") j++;
			else if (c === "'" || c === "\"" || c === "`") q = c;
			else if (c === "(") depth++;
			else if (c === ")") {
				depth--;
				if (depth === 0) return j;
			}
		}
		return n;
	};
	const matchBrace = (j) => {
		let depth = 1;
		for (; j < n; j++) if (src[j] === "\\") j++;
		else if (src[j] === "{") depth++;
		else if (src[j] === "}") {
			if (--depth === 0) return j;
		}
		return n;
	};
	const dollar = () => {
		const nx = src[i + 1];
		if (nx === "(" && src[i + 2] === "(") {
			const close = matchParen(i + 3);
			const body = src.slice(i + 3, close);
			for (const m of body.matchAll(/\$\(([^()]*)\)/g)) subs.push(m[1]);
			i = src[close + 1] === ")" ? close + 2 : close + 1;
		} else if (nx === "(") {
			const close = matchParen(i + 2);
			subs.push(src.slice(i + 2, close));
			i = close + 1;
		} else if (nx === "{") {
			const close = matchBrace(i + 2);
			const inner = src.slice(i + 2, close);
			for (const m of inner.matchAll(/\$\(|`/g)) {
				const at = i + 2 + m.index;
				if (m[0] === "`") {
					const e = src.indexOf("`", at + 1);
					subs.push(src.slice(at + 1, e < 0 ? n : e));
				} else subs.push(src.slice(at + 2, matchParen(at + 2)));
			}
			i = close + 1;
		} else {
			i++;
			while (i < n && /[A-Za-z0-9_@*#?$!-]/.test(src[i])) {
				i++;
				if (!/[A-Za-z0-9_]/.test(src[i - 1])) break;
			}
		}
		word().computed = true;
	};
	const backtick = () => {
		const e = src.indexOf("`", i + 1);
		subs.push(src.slice(i + 1, e < 0 ? n : e));
		i = e < 0 ? n : e + 1;
		word().computed = true;
	};
	const readHeredocs = () => {
		for (const h of heredocs.splice(0)) {
			const lines = [];
			while (i < n) {
				let e = src.indexOf("\n", i);
				if (e < 0) e = n;
				const line = src.slice(i, e);
				i = e + 1;
				if ((h.strip ? line.replace(/^\t+/, "") : line) === h.delim) break;
				lines.push(line);
			}
			if (!h.quoted) {
				const body = lines.join("\n");
				for (const m of body.matchAll(/\$\(/g)) {
					const s = m.index + 2;
					let depth = 1;
					let j = s;
					for (; j < body.length && depth; j++) if (body[j] === "(") depth++;
					else if (body[j] === ")") depth--;
					subs.push(body.slice(s, j - 1));
				}
				for (const m of body.matchAll(/`([^`]*)`/g)) subs.push(m[1]);
			}
		}
	};
	while (i < n) {
		const c = src[i];
		if (c === "\\") {
			if (src[i + 1] === "\n") {
				i += 2;
				continue;
			}
			word().text += src[i + 1] ?? "";
			i += 2;
			continue;
		}
		if (c === "'") {
			const e = src.indexOf("'", i + 1);
			word().text += src.slice(i + 1, e < 0 ? n : e);
			i = e < 0 ? n : e + 1;
			continue;
		}
		if (c === "\"") {
			word();
			i++;
			while (i < n && src[i] !== "\"") if (src[i] === "\\") {
				w.text += src[i + 1] ?? "";
				i += 2;
			} else if (src[i] === "$") dollar();
			else if (src[i] === "`") backtick();
			else w.text += src[i++];
			i++;
			continue;
		}
		if (c === "$") {
			dollar();
			continue;
		}
		if (c === "`") {
			backtick();
			continue;
		}
		if (c === "#" && !w) {
			while (i < n && src[i] !== "\n") i++;
			continue;
		}
		if (c === "\n") {
			endCommand("\n");
			i++;
			readHeredocs();
			continue;
		}
		if (c === " " || c === "	" || c === "\r") {
			flushWord();
			i++;
			continue;
		}
		if ((c === "<" || c === ">") && src[i + 1] === "(") {
			flushWord();
			const close = matchParen(i + 2);
			subs.push(src.slice(i + 2, close));
			i = close + 1;
			continue;
		}
		if (c === "<" && src[i + 1] === "<" && src[i + 2] !== "<") {
			if (w && /^\d+$/.test(w.text) && !w.computed) w = null;
			flushWord();
			i += 2;
			let strip = false;
			if (src[i] === "-") {
				strip = true;
				i++;
			}
			while (src[i] === " " || src[i] === "	") i++;
			const m = /^(?:'([^']*)'|"([^"]*)"|\\?([^\s;&|<>()]+))/.exec(src.slice(i));
			if (m) {
				const quoted = m[1] !== void 0 || m[2] !== void 0 || m[0].startsWith("\\");
				heredocs.push({
					delim: (m[1] ?? m[2] ?? m[3]).replace(/['"]/g, ""),
					quoted: quoted || /['"]/.test(m[3] ?? ""),
					strip
				});
				i += m[0].length;
			}
			continue;
		}
		if (c === "<" || c === ">") {
			if (w && /^\d+$/.test(w.text) && !w.computed) w = null;
			flushWord();
			i++;
			while (i < n && /[<>&|]/.test(src[i])) i++;
			if (/^\d+|^-/.test(src.slice(i)) && src[i - 1] === "&") {
				while (i < n && /[\d-]/.test(src[i])) i++;
				continue;
			}
			redirectNext = true;
			continue;
		}
		if (c === "&" && src[i + 1] === ">") {
			flushWord();
			i += src[i + 2] === ">" ? 3 : 2;
			redirectNext = true;
			continue;
		}
		if (c === "(" && src[i + 1] === "(") {
			flushWord();
			let depth = 2;
			let j = i + 2;
			for (; j < n && depth; j++) if (src[j] === "(") depth++;
			else if (src[j] === ")") depth--;
			for (const m of src.slice(i + 2, j).matchAll(/\$\(([^()]*)\)/g)) subs.push(m[1]);
			i = j;
			continue;
		}
		if (c === ";" || c === "&" || c === "|" || c === "(" || c === ")") {
			let sep = c;
			if (c === ";" && src[i + 1] === ";" || c === "&" && src[i + 1] === "&") sep = c + c;
			else if (c === "|" && (src[i + 1] === "|" || src[i + 1] === "&")) sep = c + src[i + 1];
			endCommand(sep);
			i += sep.length;
			continue;
		}
		word().text += c;
		i++;
	}
	endCommand("eof");
	return {
		commands: commands.filter((x) => x.words.length || x.end === "("),
		subs
	};
}
const KEYWORDS = words$1("if then else elif fi do done while until ! { } time esac in");
const NO_EFFECT = words$1("echo printf true false test [ [[ ]] cd pwd export unset local readonly declare typeset read set shift return exit : wait sleep basename dirname seq tr expr getopts shopt break continue let type hash umask id whoami uname hostname date tty nproc printenv pushd popd dirs");
const READERS = words$1("cat head tail less more grep egrep fgrep rg cut wc od xxd base64 strings diff cmp comm ls stat file du df readlink realpath md5sum sha1sum sha256sum sha512sum cksum shasum jq nl tac rev paste fold column iconv hexdump which");
const WRITERS = {
	rm: [IRREV$1, "all"],
	rmdir: [IRREV$1, "all"],
	unlink: [IRREV$1, "all"],
	shred: [IRREV$1, "all"],
	truncate: [IRREV$1, "all"],
	chmod: [IRREV$1, "rest"],
	chown: [IRREV$1, "rest"],
	chgrp: [IRREV$1, "rest"],
	mv: [IRREV$1, "all"],
	touch: [REV$1, "all"],
	mkdir: [REV$1, "all"],
	tee: [REV$1, "all"],
	mktemp: [REV$1, "star"],
	cp: [REV$1, "last"],
	install: [REV$1, "last"],
	ln: [REV$1, "last"],
	dd: [IRREV$1, "star"]
};
const INTERPRETERS = words$1("sh bash dash zsh ksh ash python python2 python3 node nodejs perl ruby php deno bun tsx ts-node");
const NETWORK = words$1("curl wget nc ncat netcat ssh scp sftp rsync ftp telnet socat openssl http https httpie dig nslookup host ping");
const RUNS_CONFIGURED_CODE = words$1("npm npx pnpm yarn pip pip3 pipx uv poetry make cmake cargo go java mvn gradle docker podman sudo doas su kill pkill killall crontab at systemctl launchctl service eval exec source . trap alias xdg-open open");
const GIT_READ = words$1("status log diff show ls-files ls-tree rev-parse cat-file blame describe shortlog rev-list name-rev merge-base show-ref for-each-ref check-ignore check-attr count-objects version --version");
const GIT_NET = words$1("fetch pull push clone ls-remote submodule remote");
const ARCHIVERS = words$1("tar unzip zip gzip gunzip bzip2 xz unxz 7z");
const WRAPPERS = {
	nohup: 0,
	nice: 0,
	ionice: 0,
	stdbuf: 0,
	setsid: 0,
	chronic: 0,
	command: 0
};
/** The effects of one simple command's words (after assignments), as [capability, value] or "TOP:<why>". */
function classifyCommand(argv, fns) {
	const out = [];
	let w = argv;
	for (let guard = 0; guard < 8 && w.length; guard++) {
		const p = w[0].text;
		if (w[0].computed) break;
		if (p === "env") {
			w = w.slice(1);
			while (w.length && (w[0].text.startsWith("-") || /^[A-Za-z_]\w*=/.test(w[0].text))) w = w.slice(1);
			continue;
		}
		if (p === "timeout") {
			w = w.slice(1);
			while (w.length && w[0].text.startsWith("-")) w = w.slice(1);
			w = w.slice(1);
			continue;
		}
		if (p === "xargs") {
			w = w.slice(1);
			while (w.length && w[0].text.startsWith("-")) w = w.slice(/^-[IdLnPsE]$/.test(w[0].text) ? 2 : 1);
			w = [...w, {
				text: "*",
				computed: true
			}];
			continue;
		}
		if (p === "command" && w[1] && /^-[vV]$/.test(w[1].text)) return out;
		if (Object.hasOwn(WRAPPERS, p)) {
			w = w.slice(1);
			while (w.length && w[0].text.startsWith("-")) w = w.slice(p === "nice" && w[0].text === "-n" ? 2 : 1);
			continue;
		}
		if (p === "time") {
			w = w.slice(1);
			continue;
		}
		break;
	}
	if (!w.length) return out;
	const prog = w[0];
	if (prog.computed) return [`TOP:computed-command`];
	let name = prog.text;
	if (name.includes("/")) if (/^\/(?:usr\/(?:local\/)?)?s?bin\/[^/]+$/.test(name)) name = path.posix.basename(name);
	else if (!path.posix.isAbsolute(name) && !name.split("/").includes("..")) return [[SPAWN$1, name]];
	else return [`TOP:runs-a-file-outside-the-skill: ${name}`];
	const args = w.slice(1);
	const operands = args.filter((a) => a.computed || !a.text.startsWith("-") || a.text === "-");
	const value = (a) => a.computed ? "*" : a.text;
	if (fns.has(name) || NO_EFFECT.has(name)) return out;
	if (READERS.has(name)) return [[READ$1, "*"]];
	if (Object.hasOwn(WRITERS, name)) {
		const [cap, which] = WRITERS[name];
		if (which === "star") return [[cap, "*"]];
		let targets = operands;
		if (which === "rest") targets = operands.slice(1);
		else if (which === "last") {
			const t = args.findIndex((a) => a.text === "-t" || a.text.startsWith("--target-directory"));
			if (t >= 0) {
				const v = args[t].text.includes("=") ? args[t] : args[t + 1];
				targets = v ? [{
					...v,
					text: v.text.replace(/^--target-directory=/, "")
				}] : [];
			} else targets = operands.slice(-1);
			if (operands.length > 1) out.push([READ$1, "*"]);
		}
		if (!targets.length) return [...out, [cap, "*"]];
		return [...out, ...targets.map((a) => [cap, value(a)])];
	}
	if (name === "sed") {
		const inPlace = args.some((a) => /^-[A-Za-z]*i|^--in-place/.test(a.text));
		const script = args.find((a) => !a.text.startsWith("-"));
		if (script && /(?:^|[;\n{}]\s*)[ewW](?:\s|$)|s(.)(?:\\.|(?!\1).)*\1(?:\\.|(?!\1).)*\1[gpIiMm0-9]*[ewW]/.test(script.text)) return [`TOP:sed-runs-or-writes`];
		return inPlace ? [[READ$1, "*"], [REV$1, "*"]] : [[READ$1, "*"]];
	}
	if (name === "awk" || name === "gawk" || name === "mawk" || name === "nawk") {
		const prog2 = args.find((a) => !a.text.startsWith("-"));
		if (!prog2 || prog2.computed || /\bsystem\s*\(|\|\s*getline|\bgetline\b[^;]*<|print[^;]*[>|]|printf[^;]*[>|]/.test(prog2.text)) return [`TOP:awk-runs-or-writes`];
		return [[READ$1, "*"]];
	}
	if (name === "sort") return args.some((a) => /^-o|^--output/.test(a.text)) ? [[READ$1, "*"], [REV$1, "*"]] : [[READ$1, "*"]];
	if (name === "uniq") return operands.length > 1 ? [[READ$1, "*"], [REV$1, value(operands[1])]] : [[READ$1, "*"]];
	if (name === "tree") return args.some((a) => a.text === "-o") ? [[READ$1, "*"], [REV$1, "*"]] : [[READ$1, "*"]];
	if (name === "find") {
		const caps = [[READ$1, "*"]];
		for (let k = 0; k < args.length; k++) {
			const a = args[k].text;
			if (a === "-delete") caps.push([IRREV$1, "*"]);
			else if (/^-(?:fprint0?|fprintf|fls)$/.test(a)) caps.push([REV$1, "*"]);
			else if (/^-(?:exec|execdir|ok|okdir)$/.test(a)) {
				let e = k + 1;
				while (e < args.length && args[e].text !== ";" && args[e].text !== "+") e++;
				const sub = args.slice(k + 1, e).map((x) => x.text === "{}" ? {
					text: "*",
					computed: true
				} : x);
				if (!sub.length) return [`TOP:find-exec`];
				for (const r of classifyCommand(sub, fns)) {
					if (typeof r === "string") return [r];
					caps.push(r);
				}
				caps.push([SPAWN$1, sub[0].text]);
				k = e;
			}
		}
		return caps;
	}
	if (name === "git") {
		let k = 0;
		while (k < args.length && args[k].text.startsWith("-")) {
			const a = args[k].text;
			if (a === "-c" || a.startsWith("--config-env") || a.startsWith("--exec-path")) return [`TOP:git-sets-a-program`];
			k += a === "-C" || a === "--git-dir" || a === "--work-tree" ? 2 : 1;
		}
		const sub = args[k];
		if (!sub || sub.computed) return [`TOP:computed-git-command`];
		if (GIT_READ.has(sub.text)) return [[READ$1, "*"], [SPAWN$1, "git"]];
		if (sub.text === "grep" && !args.some((a) => /^-O|^--open-files-in-pager/.test(a.text))) return [[READ$1, "*"], [SPAWN$1, "git"]];
		const caps = [
			[READ$1, "*"],
			[IRREV$1, "*"],
			[SPAWN$1, "git"]
		];
		if (GIT_NET.has(sub.text)) caps.push([NET$1, "*"]);
		return caps;
	}
	if (INTERPRETERS.has(name)) {
		const file = args.find((a) => !a.text.startsWith("-"));
		if (!file || file.computed || args.some((a) => /^-(?:[A-Za-z]*[cemp]|-eval|-print|-command|-input-type|-require|-import|-loader)/.test(a.text)) || path.posix.isAbsolute(file.text) || file.text.split("/").includes("..") || file.text === "-") return [`TOP:${name}-runs-code-the-analysis-does-not-read`];
		return [[SPAWN$1, file.text]];
	}
	if (NETWORK.has(name)) return [[NET$1, "*"], [READ$1, "*"]];
	if (ARCHIVERS.has(name)) return [
		[READ$1, "*"],
		[REV$1, "*"],
		[IRREV$1, "*"]
	];
	if (RUNS_CONFIGURED_CODE.has(name)) return [`TOP:${name}-runs-code-the-analysis-does-not-read`];
	return [`TOP:unknown-program: ${name}`];
}
/** Effects of a shell script: { effects: [[cap, value]], top: reason | null }. */
function shellUses(src, depth = 0) {
	if (depth > 8) return {
		effects: [],
		top: "nesting-too-deep"
	};
	const { commands, subs } = shellCommands(src);
	const fns = /* @__PURE__ */ new Set();
	for (const m of src.matchAll(/(?:^|[\n;&|{(]\s*)(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\s*\)/g)) fns.add(m[1]);
	for (const m of src.matchAll(/(?:^|[\n;&|]\s*)function\s+([A-Za-z_][\w-]*)/g)) fns.add(m[1]);
	const effects = [];
	let top = null;
	let inCase = 0;
	let prevEnd = "\n";
	let last = "start";
	for (const c of commands) {
		let argv = c.words;
		while (argv.length && /^[A-Za-z_]\w*(?:\[[^\]]*\])?\+?=/.test(argv[0].text)) argv = argv.slice(1);
		if (c.end === "(" && argv.length === 1 && fns.has(argv[0].text)) {
			prevEnd = c.end;
			continue;
		}
		while (argv.length && !argv[0].computed && KEYWORDS.has(argv[0].text)) argv = argv.slice(1);
		const head = argv[0]?.text;
		if (head === "case" && !argv[0].computed) {
			inCase++;
			prevEnd = c.end;
			last = "case";
			continue;
		}
		if (c.words.some((x) => x.text === "esac" && !x.computed)) inCase = Math.max(0, inCase - 1);
		if (inCase && (c.end === ")" || c.end === "|") && (last === "case" || prevEnd === ";;" || prevEnd === ";&" || last === "pattern" && prevEnd === "|")) {
			prevEnd = c.end;
			last = c.end === "|" ? "pattern" : "pattern-end";
			continue;
		}
		prevEnd = c.end;
		last = "command";
		if (!argv.length) continue;
		if ((head === "for" || head === "select") && !argv[0].computed) continue;
		for (const r of classifyCommand(argv, fns)) if (typeof r === "string") top ??= r.slice(4);
		else effects.push(r);
	}
	for (const s of subs) {
		const r = shellUses(s, depth + 1);
		effects.push(...r.effects);
		top ??= r.top;
	}
	return {
		effects,
		top
	};
}
const BT = "`";
const STR = `(?:'((?:\\\\.|[^'\\\\\\n])*)'|"((?:\\\\.|[^"\\\\\\n])*)"|${BT}([^${BT}$\\\\]*)${BT})`;
const STR_RE = new RegExp(`^\\s*${STR}`);
const LIST_RE = new RegExp(`^\\s*\\[\\s*((?:${STR}\\s*,?\\s*)*)\\]`);
/** The program a call starts, from the text right after its "(": effects, or a TOP reason. */
function spawnedBy(argText, form) {
	const out = {
		effects: [[SPAWN$1, "*"]],
		top: null
	};
	const str = STR_RE.exec(argText);
	const list = LIST_RE.exec(argText);
	const words = (inner) => [...inner.matchAll(new RegExp(STR, "g"))].map((m) => ({
		text: m[1] ?? m[2] ?? m[3] ?? "",
		computed: false
	}));
	if (form === "shell" && str) {
		const r = shellUses(str[1] ?? str[2] ?? str[3] ?? "");
		out.effects.push(...r.effects);
		out.top = r.top;
		return out;
	}
	if (form === "argv" && str) {
		const after = argText.slice(str[0].length).replace(/^\s*,/, "");
		const arr = LIST_RE.exec(after);
		const argv = [{
			text: str[1] ?? str[2] ?? str[3] ?? "",
			computed: false
		}];
		if (arr) argv.push(...words(arr[1]));
		else if (!/^\s*\)/.test(after) && !/^\s*\{/.test(after)) {
			out.top = "starts a program with arguments the code computes";
			return out;
		}
		return classifiedInto(out, argv);
	}
	if (form === "py" && list) return classifiedInto(out, words(list[1]));
	if (form === "py" && str) {
		const text = str[1] ?? str[2] ?? str[3] ?? "";
		if (/\bshell\s*=\s*True\b/.test(argText.split(/\n/)[0])) {
			const r = shellUses(text);
			out.effects.push(...r.effects);
			out.top = r.top;
			return out;
		}
		return classifiedInto(out, [{
			text,
			computed: false
		}]);
	}
	out.top = "starts a program the code computes";
	return out;
}
function classifiedInto(out, argv) {
	if (!argv.length) {
		out.top = "starts no program it names";
		return out;
	}
	for (const r of classifyCommand(argv, /* @__PURE__ */ new Set())) if (typeof r === "string") out.top ??= r.slice(4);
	else out.effects.push(r);
	return out;
}
//#endregion
//#region enclawed/src/skill-formal-uses.mjs
/** A set of words given as one space-separated string. */
const words = (text) => new Set(text.split(/\s+/).filter(Boolean));
const READ = "fs.read";
const REV = "fs.write.rev";
const IRREV = "fs.write.irrev";
const NET = "net.egress";
const SPAWN = "spawn.proc";
const SCHEMA = "mutate.schema";
const PY_PURE = new Set("json re math string textwrap collections collections.abc itertools functools dataclasses typing typing_extensions enum datetime time random hashlib hmac base64 binascii struct decimal fractions statistics difflib fnmatch argparse copy pprint unicodedata uuid heapq bisect operator contextlib abc numbers html html.parser csv tomllib platform locale getpass traceback warnings types weakref threading queue secrets zlib shlex keyword calendar colorsys array errno stat signal select selectors atexit __future__ urllib.parse email email.message email.utils string.templatelib textwrap graphlib zoneinfo ipaddress quopri".split(/\s+/));
const PY_READ_MODULES = words("glob linecache configparser posixpath ntpath os.path filecmp mimetypes");
const PY_NET = new Set("socket ssl urllib urllib.request http http.client http.server http.cookiejar requests httpx aiohttp ftplib smtplib poplib imaplib telnetlib xmlrpc xmlrpc.client websocket websockets paramiko urllib3 socketserver".split(/\s+/));
const PY_SPAWN = new Set([
	"multiprocessing",
	"concurrent.futures",
	"webbrowser",
	"pty"
]);
const PY_DB = new Set(["sqlite3", "dbm"]);
const PY_ARCHIVE = words("zipfile tarfile gzip bz2 lzma shutil._ codecs");
const PY_TOP = new Set("ctypes cffi importlib imp pickle cPickle _pickle dill cloudpickle marshal shelve code codeop runpy builtins __builtin__ pdb bdb unittest doctest jsonpickle inspect gc sys._ os._".split(/\s+/));
/** A member table from space-separated names per classification. */
function memberTable(groups) {
	const as = {
		none: [],
		read: [READ],
		rev: [REV],
		irrev: [IRREV],
		readRev: [READ, REV],
		revIrrev: [REV, IRREV],
		spawn: [SPAWN],
		top: null,
		shell: "shell",
		py: "py",
		osPath: "os.path"
	};
	const t = {};
	for (const [kind, names] of Object.entries(groups)) for (const k of words(names)) t[k] = as[kind];
	return t;
}
const OS_MEMBERS = memberTable({
	osPath: "path",
	none: "getcwd getcwdb environ environb getenv getenvb putenv unsetenv sep altsep linesep pathsep extsep curdir pardir devnull name cpu_count getpid getppid getuid geteuid getgid getegid getlogin uname fspath fsencode fsdecode get_terminal_size terminal_size urandom isatty strerror error PathLike DirEntry stat_result chdir umask times getloadavg supports_follow_symlinks O_RDONLY O_WRONLY O_RDWR O_CREAT O_TRUNC O_APPEND O_EXCL F_OK R_OK W_OK X_OK SEEK_SET SEEK_CUR SEEK_END close fsync dup dup2 pipe wait waitpid WEXITSTATUS WIFEXITED P_WAIT P_NOWAIT",
	read: "listdir scandir walk stat lstat access readlink read",
	rev: "mkdir makedirs link symlink utime write",
	readRev: "open fdopen",
	irrev: "remove unlink rmdir removedirs rename renames replace truncate ftruncate chmod lchmod fchmod chown lchown fchown",
	shell: "system popen",
	top: "posix_spawn posix_spawnp fork forkpty"
});
for (const k of [
	"execl",
	"execle",
	"execlp",
	"execlpe",
	"execv",
	"execve",
	"execvp",
	"execvpe"
]) OS_MEMBERS[k] = null;
for (const k of [
	"spawnl",
	"spawnle",
	"spawnlp",
	"spawnlpe",
	"spawnv",
	"spawnve",
	"spawnvp",
	"spawnvpe"
]) OS_MEMBERS[k] = null;
const SHUTIL_MEMBERS = memberTable({
	readRev: "copy copy2 copyfile copytree make_archive",
	none: "copyfileobj get_terminal_size ignore_patterns Error SameFileError",
	rev: "copymode copystat",
	irrev: "move rmtree chown",
	revIrrev: "unpack_archive",
	read: "which disk_usage"
});
const SUBPROCESS_MEMBERS = memberTable({
	py: "run call check_call check_output Popen",
	shell: "getoutput getstatusoutput",
	none: "PIPE STDOUT DEVNULL CalledProcessError TimeoutExpired CompletedProcess SubprocessError"
});
const TEMPFILE_MEMBERS = memberTable({
	none: "gettempdir gettempdirb mktemp tempdir",
	rev: "mkstemp mkdtemp TemporaryFile SpooledTemporaryFile",
	revIrrev: "NamedTemporaryFile TemporaryDirectory"
});
const IO_MEMBERS = memberTable({
	readRev: "open FileIO",
	none: "StringIO BytesIO TextIOWrapper BufferedReader BufferedWriter IOBase TextIOBase RawIOBase BufferedIOBase UnsupportedOperation DEFAULT_BUFFER_SIZE SEEK_SET SEEK_CUR SEEK_END"
});
const LOGGING_WRITERS = words("FileHandler basicConfig RotatingFileHandler TimedRotatingFileHandler WatchedFileHandler handlers config");
const SYS_TOP = words("modules settrace setprofile _getframe meta_path path_hooks addaudithook breakpointhook displayhook excepthook __dict__");
const PATHLIB_NAMES = words("Path PurePath PosixPath WindowsPath PurePosixPath PureWindowsPath");
const ASYNCIO_SPAWN = new Set(["create_subprocess_exec", "create_subprocess_shell"]);
const ASYNCIO_NET = new Set([
	"open_connection",
	"open_unix_connection",
	"start_server",
	"start_unix_server"
]);
/** The capabilities of `module.member` ([] none; null unknown -> TOP), or a sub-module name to continue with. */
function pyMember(mod, member) {
	if (mod === "os") return Object.hasOwn(OS_MEMBERS, member) ? OS_MEMBERS[member] : void 0;
	if (mod === "os.path" || PY_READ_MODULES.has(mod)) return [READ];
	if (mod === "shutil") return Object.hasOwn(SHUTIL_MEMBERS, member) ? SHUTIL_MEMBERS[member] : null;
	if (mod === "subprocess") return Object.hasOwn(SUBPROCESS_MEMBERS, member) ? SUBPROCESS_MEMBERS[member] : null;
	if (mod === "tempfile") return Object.hasOwn(TEMPFILE_MEMBERS, member) ? TEMPFILE_MEMBERS[member] : null;
	if (mod === "io") return Object.hasOwn(IO_MEMBERS, member) ? IO_MEMBERS[member] : null;
	if (mod === "logging" || mod.startsWith("logging.")) return LOGGING_WRITERS.has(member) || mod !== "logging" ? [REV] : [];
	if (mod === "sys") return SYS_TOP.has(member) ? null : [];
	if (mod === "pathlib") return [];
	if (mod === "asyncio") return ASYNCIO_SPAWN.has(member) ? [SPAWN] : ASYNCIO_NET.has(member) ? [NET] : [];
	return moduleCaps(mod);
}
const PY_MEMBER_TABLES = words("os os.path shutil subprocess tempfile io logging sys pathlib asyncio");
/** Capabilities of any use of a whole module ([] none, null TOP), for modules without a member table. */
function moduleCaps(mod) {
	const root = mod.split(".")[0];
	if (PY_TOP.has(mod) || PY_TOP.has(root)) return null;
	if (PY_NET.has(mod) || PY_NET.has(root)) return mod === "urllib.parse" ? [] : [NET];
	if (PY_SPAWN.has(mod) || PY_SPAWN.has(root)) return [SPAWN];
	if (PY_DB.has(mod)) return [
		READ,
		IRREV,
		SCHEMA
	];
	if (PY_ARCHIVE.has(mod)) return [
		READ,
		REV,
		IRREV
	];
	if (PY_READ_MODULES.has(mod)) return [READ];
	if (PY_PURE.has(mod) || PY_PURE.has(root)) return [];
}
/** The literal first argument of a call starting right after `open` (index of "("), or "*". */
function literalArg(src, at) {
	const m = /^\(\s*(?:[rbuRBU]{0,2})(['"`])([^'"`\n$]+)\1\s*[,)]/.exec(src.slice(at));
	return m ? m[2] : "*";
}
/**
* Effects of a Python source: imports and the uses of their names.
* `local(name)` says whether a module name is a file of the skill.
*/
function pythonUses(src, local = () => false) {
	const effects = [];
	let top = null;
	const bind = /* @__PURE__ */ new Map();
	const lines = src.replace(/\\\n/g, " ");
	const importSpans = [];
	for (const m of lines.matchAll(/^[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]+(\([^)]*\)|[^\n#;]+)/gm)) {
		importSpans.push([m.index, m.index + m[0].length]);
		const mod = m[1];
		const list = m[2].replace(/[()]/g, "");
		if (mod.startsWith(".")) continue;
		for (const part of list.split(",")) {
			const t = part.trim();
			if (!t) continue;
			if (t === "*") {
				const c = PY_MEMBER_TABLES.has(mod) ? null : moduleCaps(mod);
				if (c === null || c === void 0 && !local(mod)) top ??= `star-import-of ${mod}`;
				else if (c) for (const cap of c) effects.push([cap, "*"]);
				continue;
			}
			const as = /^([\w]+)(?:\s+as\s+([\w]+))?$/.exec(t);
			if (!as) {
				top ??= `unreadable-import ${t}`;
				continue;
			}
			bind.set(as[2] ?? as[1], {
				mod,
				member: as[1]
			});
		}
	}
	for (const m of lines.matchAll(/^[ \t]*import[ \t]+([^\n#;]+)/gm)) {
		importSpans.push([m.index, m.index + m[0].length]);
		for (const part of m[1].split(",")) {
			const as = /^\s*([\w.]+)(?:\s+as\s+(\w+))?\s*$/.exec(part);
			if (!as) {
				top ??= `unreadable-import ${part.trim()}`;
				continue;
			}
			if (as[2]) bind.set(as[2], { mod: as[1] });
			else {
				bind.set(as[1].split(".")[0], {
					mod: as[1].split(".")[0],
					full: as[1]
				});
				if (as[1].includes(".")) {
					if (moduleCaps(as[1]) === null) top ??= `module ${as[1]}`;
				}
			}
		}
	}
	const inImport = (idx) => importSpans.some(([a, b]) => idx >= a && idx < b);
	const add = (caps, value) => {
		for (const cap of caps) effects.push([cap, value]);
	};
	const useAt = (r, after, what) => {
		if (r === "shell" || r === "py") {
			if (src[after] !== "(") {
				top ??= `${what} (it starts programs) is used as a value`;
				return;
			}
			const sp = spawnedBy(src.slice(after + 1), r);
			for (const [cap, v] of sp.effects) effects.push([cap, v]);
			top ??= sp.top;
			return;
		}
		add(r === "os.path" ? [READ] : r, src[after] === "(" ? literalArg(src, after) : "*");
	};
	for (const [name, b] of bind) {
		const esc = name.replace(/[$]/g, "\\$");
		if (b.member !== void 0) {
			const mod = b.mod;
			let caps;
			if (PY_MEMBER_TABLES.has(mod) || moduleCaps(mod) !== void 0) {
				caps = pyMember(mod, b.member);
				if (mod === "pathlib" && PATHLIB_NAMES.has(b.member)) caps = [];
			} else if (local(mod) || local(mod.split(".")[0])) continue;
			else {
				top ??= `unknown-module ${mod}`;
				continue;
			}
			if (caps === null || caps === void 0) {
				top ??= `unmodeled ${mod}.${b.member}`;
				continue;
			}
			if (Array.isArray(caps) && !caps.length) continue;
			for (const u of src.matchAll(new RegExp(`(?<![\\w.])${esc}\\b`, "g"))) if (!inImport(u.index)) useAt(caps, u.index + u[0].length, `${mod}.${b.member}`);
			continue;
		}
		const mod = b.mod;
		if (!(PY_MEMBER_TABLES.has(mod) || moduleCaps(mod) !== void 0)) {
			if (!local(mod)) top ??= `unknown-module ${b.full ?? mod}`;
			continue;
		}
		if (!PY_MEMBER_TABLES.has(mod)) {
			const c = moduleCaps(mod);
			if (c === null) top ??= `module ${mod}`;
			else if (c.length && new RegExp(`(?<![\\w.])${esc}\\b`).test(stripImports(src, importSpans))) add(c, "*");
			continue;
		}
		for (const u of src.matchAll(new RegExp(`(?<![\\w.])${esc}\\b(\\s*\\.\\s*(\\w+)(?:\\s*\\.\\s*(\\w+))?)?`, "g"))) {
			if (inImport(u.index)) continue;
			if (!u[1]) {
				if (/^\s*\[/.test(src.slice(u.index + u[0].length))) top ??= `computed-member-of ${mod}`;
				else top ??= `the module ${mod} is used as a value`;
				continue;
			}
			const r = pyMember(mod, u[2]);
			if (r === null || r === void 0) {
				top ??= `unmodeled ${mod}.${u[2]}`;
				continue;
			}
			useAt(r, u.index + u[0].length, `${mod}.${u[2]}`);
		}
	}
	if ([...bind.values()].some((b) => b.mod === "pathlib")) {
		for (const u of src.matchAll(/\.(unlink|rmdir|rename|chmod|lchmod|symlink_to|hardlink_to|link_to)\s*\(/g)) add([IRREV], "*");
		for (const u of src.matchAll(/\.replace\s*\(([^(),]*(?:\([^()]*\))?[^(),]*)\)/g)) add([IRREV], "*");
		for (const u of src.matchAll(/\.(write_text|write_bytes|touch|mkdir)\s*\(/g)) add([REV], "*");
		for (const u of src.matchAll(/\.open\s*\(([^)]*)\)/g)) if (!/^\s*(?:mode\s*=\s*)?['"]r?b?t?['"]?\s*(?:,|$)/.test(u[1]) || /[wax+]/.test(u[1])) add([REV], "*");
	}
	if (/(?<![\w.])(?:globals|vars|locals)\s*\(\s*\)\s*\[|(?<![\w.])breakpoint\s*\(/.test(src)) top ??= "computed-global";
	if (/(?<![\w.])(?:setattr|delattr)\s*\(/.test(src)) top ??= "computed-attribute-assignment";
	return {
		effects,
		top
	};
}
function stripImports(src, spans) {
	let out = "";
	let last = 0;
	for (const [a, b] of spans.toSorted((x, y) => x[0] - y[0])) {
		out += src.slice(last, a);
		last = b;
	}
	return out + src.slice(last);
}
const FS_TABLE = {};
for (const k of [
	"readFile",
	"readdir",
	"stat",
	"lstat",
	"exists",
	"access",
	"realpath",
	"readlink",
	"createReadStream",
	"opendir",
	"watch",
	"watchFile",
	"unwatchFile",
	"read",
	"readv",
	"fstat",
	"statfs",
	"glob"
]) {
	FS_TABLE[k] = [READ];
	FS_TABLE[`${k}Sync`] = [READ];
}
for (const k of [
	"writeFile",
	"appendFile",
	"mkdir",
	"mkdtemp",
	"copyFile",
	"cp",
	"createWriteStream",
	"open",
	"write",
	"writev",
	"symlink",
	"link",
	"utimes",
	"futimes",
	"lutimes"
]) {
	FS_TABLE[k] = [REV];
	FS_TABLE[`${k}Sync`] = [REV];
}
for (const k of [
	"unlink",
	"rm",
	"rmdir",
	"rename",
	"truncate",
	"ftruncate",
	"chmod",
	"fchmod",
	"lchmod",
	"chown",
	"fchown",
	"lchown"
]) {
	FS_TABLE[k] = [IRREV];
	FS_TABLE[`${k}Sync`] = [IRREV];
}
for (const k of [
	"close",
	"fsync",
	"fdatasync",
	"closeSync",
	"fsyncSync",
	"fdatasyncSync"
]) FS_TABLE[k] = [];
for (const k of [
	"constants",
	"Dirent",
	"Stats",
	"ReadStream",
	"WriteStream",
	"Dir",
	"F_OK",
	"R_OK",
	"W_OK",
	"X_OK"
]) FS_TABLE[k] = [];
FS_TABLE.promises = "module";
FS_TABLE.default = "module";
const CP_TABLE = {
	exec: "shell",
	execSync: "shell",
	execFile: "argv",
	execFileSync: "argv",
	spawn: "argv",
	spawnSync: "argv",
	fork: "fork",
	ChildProcess: [],
	default: "module"
};
const JS_UNIFORM = {
	cluster: [SPAWN],
	worker_threads: [SPAWN],
	net: [NET],
	tls: [NET],
	http: [NET],
	https: [NET],
	http2: [NET],
	dgram: [NET],
	dns: [NET],
	"dns/promises": [NET],
	sqlite: [
		READ,
		IRREV,
		SCHEMA
	]
};
const JS_TOP = words("vm module v8 inspector repl wasi trace_events");
const JS_PURE = new Set("os path path/posix path/win32 url util util/types crypto events stream stream/promises stream/web buffer string_decoder querystring assert assert/strict zlib readline readline/promises timers timers/promises perf_hooks test async_hooks diagnostics_channel tty punycode constants console process".split(/\s+/));
function jsModule(spec) {
	const s = spec.replace(/^node:/, "");
	if (s === "fs" || s === "fs/promises") return {
		kind: "table",
		table: FS_TABLE
	};
	if (s === "child_process") return {
		kind: "table",
		table: CP_TABLE
	};
	if (Object.hasOwn(JS_UNIFORM, s)) return {
		kind: "uniform",
		caps: JS_UNIFORM[s]
	};
	if (JS_TOP.has(s)) return { kind: "top" };
	if (JS_PURE.has(s)) return { kind: "pure" };
	return null;
}
/**
* Effects of a JavaScript / TypeScript source. `local(spec)` says whether a
* module specifier resolves to a file of the skill (a relative path inside it,
* or a package in its own node_modules).
*/
function jsUses(src, local = () => false) {
	const effects = [];
	let top = null;
	const names = /* @__PURE__ */ new Map();
	const add = (caps, value) => {
		for (const cap of caps) effects.push([cap, value]);
	};
	const spans = [];
	const bindAll = (table, bindingText) => {
		const b = (bindingText ?? "").trim();
		const brace = /\{([^}]*)\}/.exec(b);
		if (brace) for (const part of brace[1].split(",")) {
			const t = part.trim();
			if (!t) continue;
			const as = /^([\w$]+)\s*(?:as|:)\s*([\w$]+)$/.exec(t) ?? /^([\w$]+)$/.exec(t);
			if (!as) {
				top ??= `unreadable binding ${t}`;
				continue;
			}
			names.set(as[2] ?? as[1], {
				table,
				member: as[1]
			});
		}
		const rest = b.replace(/\{[^}]*\}/, "").replace(/\*\s*as\s+/, "");
		for (const t of rest.split(",")) {
			const id = t.trim();
			if (/^[\w$]+$/.test(id)) names.set(id, {
				table,
				member: null
			});
			else if (id) top ??= `unreadable binding ${id}`;
		}
	};
	const onModule = (spec, bindingText, at, len, member = null) => {
		spans.push([at, at + len]);
		const m = jsModule(spec);
		if (!m) {
			if (!local(spec)) top ??= `module ${spec} is not part of the skill`;
			return;
		}
		if (m.kind === "top") {
			top ??= `module ${spec}`;
			return;
		}
		if (m.kind === "pure") return;
		if (m.kind === "uniform") {
			add(m.caps, "*");
			return;
		}
		if (member !== null) {
			const c = m.table[member];
			if (c === void 0) top ??= `unmodeled ${String(spec)}.${String(member)}`;
			else if (bindingText && /^[\w$]+$/.test(bindingText.trim())) names.set(bindingText.trim(), {
				table: m.table,
				member: typeof c === "string" ? null : member
			});
			else if (typeof c !== "string") useAt(c, at + len, `${String(spec)}.${String(member)}`);
			return;
		}
		bindAll(m.table, bindingText);
	};
	const useAt = (c, after, what) => {
		if (c === "shell" || c === "argv" || c === "fork") {
			if (src[after] !== "(") {
				top ??= `${what} (it starts programs) is used as a value`;
				return;
			}
			const arg = src.slice(after + 1);
			const sp = c === "fork" ? spawnedBy(`"node", [${(STR_RE.exec(arg) ?? [""])[0]}]`, "argv") : spawnedBy(arg, c);
			for (const [cap, v] of sp.effects) effects.push([cap, v]);
			top ??= sp.top;
			return;
		}
		add(c, src[after] === "(" ? literalArg(src, after) : "*");
	};
	for (const m of src.matchAll(/\bimport\s+(?:type\s+)?([\w$*{}\s,]+?)\s+from\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bexport\s+(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g)) onModule(m[2] ?? m[3] ?? m[4], m[1], m.index, m[0].length);
	for (const m of src.matchAll(/(?:(?:const|let|var)\s+([\w$]+|\{[^}]*\})\s*=\s*)?(?:await\s+)?(?:require|import)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)(\s*\.\s*[\w$]+)?/g)) onModule(m[2], m[1], m.index, m[0].length, m[3] ? m[3].replace(/[\s.]/g, "") : null);
	const inSpan = (i) => spans.some(([x, y]) => i >= x && i < y);
	for (const [name, { table, member }] of names) {
		const esc = name.replace(/\$/g, "\\$");
		if (member !== null) {
			const c = table[member];
			if (c === void 0) {
				top ??= `unmodeled member ${member}`;
				continue;
			}
			if (typeof c === "string" && c === "module") {
				names.set(name, {
					table,
					member: null
				});
				continue;
			}
			if (Array.isArray(c) && !c.length) continue;
			for (const u of src.matchAll(new RegExp(`(?<![\\w$.])${esc}\\b`, "g"))) if (!inSpan(u.index)) useAt(c, u.index + u[0].length, member);
		}
	}
	for (const [name, { table, member }] of names) {
		if (member !== null) continue;
		const esc = name.replace(/\$/g, "\\$");
		for (const u of src.matchAll(new RegExp(`(?<![\\w$.])${esc}\\b(\\s*\\??\\.\\s*([\\w$]+)(?:\\s*\\??\\.\\s*([\\w$]+))?)?`, "g"))) {
			if (inSpan(u.index)) continue;
			if (!u[1]) {
				top ??= `the module bound to ${name} is used as a value`;
				continue;
			}
			let c = table[u[2]];
			let member = u[2];
			let end = u.index + u[0].length;
			if (c === "module") {
				member = u[3];
				c = member === void 0 ? void 0 : table[member];
			} else if (u[3] !== void 0) end = u.index + u[1].indexOf(u[2]) + u[2].length;
			if (c === void 0 || c === "module") {
				top ??= `unmodeled member ${member ?? u[2]}`;
				continue;
			}
			useAt(c, end, member);
		}
	}
	if (/\bprocess\s*\??\.\s*(?:binding|_linkedBinding|dlopen|kill|mainModule|reallyExit)\b|\bprocess\s*\[|(?<![\w$.])(?:Bun|Deno)\s*\.|\b(?:globalThis|global|self|window)\s*\[|\bmodule\s*\.\s*(?:constructor|require|_load|createRequire)\b|\brequire\s*\.\s*(?:cache|extensions|main)\b|(?<![\w$.])require(?!\s*\(|\s*\.\s*resolve)\b|\bcreateRequire\b/.test(src)) top ??= "reaches-the-runtime-outside-the-analysed-calls";
	if (/\bnew\s+(?:WebSocket|EventSource)\s*\(|\bXMLHttpRequest\b|\bsendBeacon\s*\(/.test(src)) add([NET], "*");
	return {
		effects,
		top
	};
}
/**
* The second pass for one file. `file` is its absolute path and `root` the
* skill directory (to resolve which modules are the skill's own).
*/
function usesOf(src, language, { file = null, root = null } = {}) {
	if (language === ".sh" || language === ".bash") return shellUses(src);
	if (language === ".py") {
		const local = (mod) => {
			if (!root) return false;
			const top = mod.split(".")[0];
			return pyLocalModules(root).has(top);
		};
		return pythonUses(src, local);
	}
	const local = (spec) => {
		if (!root) return false;
		if (spec.startsWith(".") || spec.startsWith("/")) {
			if (!file) return false;
			const p = path.resolve(path.dirname(file), spec);
			const rel = path.relative(root, p);
			return !rel.startsWith("..") && !path.isAbsolute(rel);
		}
		const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
		for (let d = file ? path.dirname(file) : root;; d = path.dirname(d)) {
			if (existsSync(path.join(d, "node_modules", pkg))) return true;
			if (d === root || path.relative(root, d).startsWith("..") || d === path.dirname(d)) return false;
		}
	};
	return jsUses(src, local);
}
const pyLocalCache = /* @__PURE__ */ new Map();
/** Top-level Python module names a skill provides itself (any .py file or package directory in it). */
function pyLocalModules(root) {
	const hit = pyLocalCache.get(root);
	if (hit) return hit;
	const names = /* @__PURE__ */ new Set();
	const walk = (d, depth) => {
		let ents = [];
		try {
			ents = readdirSafe(d);
		} catch {
			return;
		}
		for (const e of ents) if (e.isDirectory()) {
			if (existsSync(path.join(d, e.name, "__init__.py"))) names.add(e.name);
			if (depth < 12 && e.name !== ".git") walk(path.join(d, e.name), depth + 1);
		} else if (e.isFile() && e.name.endsWith(".py")) names.add(e.name.slice(0, -3));
	};
	walk(root, 0);
	pyLocalCache.set(root, names);
	return names;
}
function readdirSafe(d) {
	return readdirSync(d, { withFileTypes: true });
}
/** Drop cached per-skill facts (one analysis of a directory clears them first). */
function clearUsesCache() {
	pyLocalCache.clear();
}
/**
* The second pass over a whole skill directory: the same files Method A
* reads (analyzeSkillDirectory), each through usesOf. Returns the effects it
* finds (capability tokens, sorted), the scripts whose effects it cannot bound
* ({ script, reason }), and, when write folders are declared, every write
* whose path is not a literal inside one ({ script, value }).
*/
function analyzeSkillUses(dir, writeRoots = null) {
	clearUsesCache();
	const effects = /* @__PURE__ */ new Set();
	const unbounded = [];
	const writes = [];
	analyzeSkillDirectory(dir, { onScript: ({ src, ext, file, rel }) => {
		const u = usesOf(ext === ".sh" || ext === ".bash" ? src : stripForAnalysis(src, ext), ext, {
			file,
			root: dir
		});
		for (const [cap, value] of u.effects) {
			effects.add(cap);
			if (cap === REV || cap === IRREV) writes.push({
				script: rel,
				value: value ?? "*"
			});
		}
		if (u.top) unbounded.push({
			script: rel,
			reason: u.top
		});
	} });
	clearUsesCache();
	const roots = Array.isArray(writeRoots) && writeRoots.length ? writeRoots : null;
	const norm = (p) => path.posix.normalize(String(p).replace(/^\.\//, "")).replace(/\/+$/, "");
	const inside = (v) => typeof v === "string" && v !== "*" && !path.posix.isAbsolute(v) && !norm(v).split("/").includes("..") && roots.some((r) => norm(v) === norm(r) || norm(v).startsWith(`${norm(r)}/`));
	const escapingWrites = roots ? writes.filter((w) => !inside(w.value)) : [];
	const key = (w) => `${w.script}\0${w.value}`;
	return {
		unionEffects: [...effects].toSorted((a, b) => a < b ? -1 : a > b ? 1 : 0),
		unbounded: unbounded.toSorted((a, b) => a.script < b.script ? -1 : 1),
		escapingWrites: [...new Map(escapingWrites.map((w) => [key(w), w])).values()].toSorted((a, b) => key(a) < key(b) ? -1 : 1)
	};
}
//#endregion
//#region src/enclawed/adapter/skills.ts
const SKILL_CAPS = ALL_CAPABILITIES;
const frameworkFormal = {
	produceFormalBundle,
	readFormalBundle,
	verifyFormalBundle,
	writeFormalBundle
};
function canonicalize(value) {
	if (value === void 0) throw new TypeError("cannot canonicalize undefined");
	if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new TypeError("cannot canonicalize non-finite number");
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v === void 0 ? null : v)).join(",")}]`;
	if (typeof value === "object") {
		const o = value;
		return `{${Object.keys(o).filter((k) => o[k] !== void 0).toSorted().map((k) => `${JSON.stringify(k)}:${canonicalize(o[k])}`).join(",")}}`;
	}
	throw new TypeError(`cannot canonicalize value of type ${typeof value}`);
}
/** SHA-256 of the bundle's canonical form: what an attestation's manifestHash is. */
function sha256OfCanonical(value) {
	return sha256Hex(Buffer.from(canonicalize(value), "utf8"));
}
/** The SKILL.md frontmatter as flat key -> string | string[] (the small YAML subset skills use). */
function parseFrontmatter(text) {
	const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text ?? "");
	const out = {};
	if (!m) return out;
	const lines = m[1].split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const kv = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(lines[i]);
		if (!kv) continue;
		const [, key, rawValue] = kv;
		const value = rawValue.trim();
		if (value.startsWith("[")) out[key] = value.replace(/^\[|\]$/g, "").split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
		else if (value === "") {
			const list = [];
			while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) list.push(lines[++i].replace(/^\s+-\s+/, "").trim().replace(/^["']|["']$/g, ""));
			out[key] = list.length ? list : "";
		} else out[key] = value.replace(/^["']|["']$/g, "");
	}
	return out;
}
/** The declared capability set of a skill (sorted, validated). Throws on an unknown capability. */
function declaredCaps(front) {
	const raw = front["enclawed-capabilities"];
	const list = raw === void 0 || raw === "" ? [] : Array.isArray(raw) ? raw : [raw];
	for (const c of list) if (!SKILL_CAPS.includes(c)) throw new Error(`unknown capability ${JSON.stringify(c)} in enclawed-capabilities (known: ${SKILL_CAPS.join(", ")})`);
	return [...new Set(list)].toSorted();
}
/**
* The declared egress targets of a skill (`enclawed-egress: [...]`), each a
* destination profile in canonical form (../egress-target.ts), sorted. A
* bare host still parses (https, 443, no request shape). Throws on a target
* that does not parse, or on targets declared without net.egress.
*/
function declaredEgress(front, caps) {
	const raw = front["enclawed-egress"];
	const out = [...new Set((raw === void 0 || raw === "" ? [] : Array.isArray(raw) ? raw : [raw]).map((t) => canonicalEgressTarget(t)))].toSorted();
	if (out.length && !caps.includes(CAPABILITY.NET_EGRESS)) throw new Error("enclawed-egress names targets, but enclawed-capabilities does not declare net.egress");
	return out;
}
function isDir(p) {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}
function childSkills(root) {
	const out = [];
	let names;
	try {
		names = fs.readdirSync(root.dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const d of names) {
		const dir = path.join(root.dir, d.name);
		if (!(d.isDirectory() || d.isSymbolicLink() && isDir(dir))) continue;
		const file = path.join(dir, "SKILL.md");
		if (!fs.existsSync(file)) continue;
		let front = {};
		try {
			front = parseFrontmatter(fs.readFileSync(file, "utf8"));
		} catch {
			front = {};
		}
		const base = typeof front.name === "string" && front.name ? front.name : d.name;
		out.push({
			name: `${root.prefix ?? ""}${base}`,
			scope: root.scope,
			dir: realpathNearestSync(dir),
			linkedDir: d.isSymbolicLink(),
			root: realpathNearestSync(root.dir),
			skillFile: file
		});
	}
	return out;
}
/**
* Directories named `segs` (one name, or a directory and a child) below
* `base`, up to `depth` levels, skipping node_modules and .git (an adapter
* uses it to find nested skill roots, such as `.claude/skills` below a project).
*/
function findNestedDirs(base, segs, depth, out = [], budget = { n: 2e4 }) {
	let names;
	try {
		names = fs.readdirSync(base, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const d of names) {
		if (budget.n-- <= 0 || !d.isDirectory() || d.name === "node_modules" || d.name === ".git") continue;
		const p = path.join(base, d.name);
		if (segs.length === 2 && d.name === segs[0] && isDir(path.join(p, segs[1]))) out.push(path.join(p, segs[1]));
		else if (segs.length === 1 && d.name === segs[0]) out.push(p);
		if (depth > 0) findNestedDirs(p, segs, depth - 1, out, budget);
	}
	return out;
}
/** Every skill under the given roots, one entry per (name, real directory), sorted. */
function discoverSkills(roots) {
	const realRoots = [];
	const skills = [];
	for (const r of roots) {
		if (!isDir(r.dir)) continue;
		realRoots.push(realpathNearestSync(r.dir));
		skills.push(...childSkills(r));
	}
	const seen = /* @__PURE__ */ new Set();
	return {
		skills: skills.filter((s) => {
			const k = `${s.name}\0${comparablePath(s.dir)}`;
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		}).toSorted((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : a.dir < b.dir ? -1 : 1),
		roots: [...new Set(realRoots)].toSorted()
	};
}
/** The manifest of a skill as it is on disk now: what a bundle attests. Throws when SKILL.md is unreadable or declares an unknown capability. */
function skillManifest(skill) {
	const front = parseFrontmatter(fs.readFileSync(path.join(skill.dir, "SKILL.md"), "utf8"));
	const caps = declaredCaps(front);
	const egress = declaredEgress(front, caps);
	const rawRoots = front["enclawed-write-roots"];
	const writeRoots = [...new Set((rawRoots === void 0 || rawRoots === "" ? [] : Array.isArray(rawRoots) ? rawRoots : [rawRoots]).map((r) => {
		if (path.isAbsolute(r) || r.split(/[\\/]/).includes("..")) throw new Error(`enclawed-write-roots: ${JSON.stringify(r)} must be a relative folder without ..`);
		return r.replace(/^\.\//, "").replace(/\/+$/, "");
	}))].toSorted();
	const c = contentDigest(skill.dir);
	return {
		manifest: {
			id: skill.name,
			version: typeof front.version === "string" && front.version ? front.version : "0",
			caps,
			scope: skill.scope,
			dir: skill.dir,
			contentDigest: c.digest,
			files: c.files,
			spec: "SKILL.md frontmatter enclawed-capabilities",
			...egress.length ? { egress } : {},
			...writeRoots.length ? { writeRoots } : {}
		},
		problems: c.problems
	};
}
/**
* The biconditional on a fresh Method-A result: implementation effects ==
* declared capabilities. `uses` is the second pass over the same files
* (enclawed/src/skill-formal-uses.mjs: every program a script runs and every
* library member it names, with what it cannot bound): its effects join the
* implementation's, a script it cannot bound fails the (=>) direction, and its
* writes are held to the declared write folders like Method A's.
*/
function biconditional(methodA, declared, uses = null) {
	const effects = new Set([...methodA.unionEffects ?? [], ...uses?.unionEffects ?? []]);
	const decl = new Set(declared);
	const escaping = [...effects].filter((c) => !decl.has(c)).toSorted();
	const unrealized = [...decl].filter((c) => !effects.has(c)).toSorted();
	const opaque = [...methodA.opaqueFiles ?? []];
	const top = methodA.anyTop === true;
	const reasons = [];
	if (top) {
		const where = Object.entries(methodA.perScript ?? {}).filter(([, r]) => r.top).map(([f, r]) => `${f}: ${r.reason ?? "reflective"}`);
		reasons.push(`a script uses a reflective construct (eval, exec, dynamic import, deserialization into live objects), so its effects cannot be bounded${where.length ? ` (${where.slice(0, 4).join("; ")})` : ""}`);
	}
	const unbounded = uses?.unbounded ?? [];
	if (unbounded.length) reasons.push(`a script reaches effects the analysis cannot bound (${unbounded.slice(0, 4).map((u) => `${u.script}: ${u.reason}`).join("; ")}${unbounded.length > 4 ? "; ..." : ""})`);
	if (opaque.length) reasons.push(`files the analysis cannot read, so their effects are unknown: ${opaque.slice(0, 8).join(", ")}${opaque.length > 8 ? ", ..." : ""}`);
	const writes = [...methodA.escapingWrites ?? [], ...uses?.escapingWrites ?? []].filter((w, i, all) => all.findIndex((x) => x.script === w.script && x.value === w.value) === i);
	if (writes.length) reasons.push(`a write can leave the declared folders: ${writes.slice(0, 4).map((w) => `${w.script} writes ${w.value === "*" ? "a path it computes" : JSON.stringify(w.value)}`).join(", ")}`);
	if (escaping.length) reasons.push(`the implementation produces effects the specification does not declare: ${escaping.join(", ")}`);
	if (unrealized.length) reasons.push(`the specification declares capabilities the implementation does not have: ${unrealized.join(", ")}`);
	return {
		pass: reasons.length === 0,
		escaping,
		unrealized,
		opaque,
		top: top || unbounded.length > 0,
		reasons
	};
}
/** Where a skill's bundle is kept: one directory per (scope, real directory, name). */
function bundleDirFor(skill, storeDir) {
	return path.join(storeDir, sha256Hex(`${skill.scope}\0${comparablePath(skill.dir)}\0${skill.name}`).slice(0, 32));
}
function readJson(f) {
	try {
		return JSON.parse(fs.readFileSync(f, "utf8"));
	} catch {
		return null;
	}
}
/** Verify one discovered skill against its bundle. */
function verifySkill(store, skill) {
	const formal = store.formal ?? frameworkFormal;
	const base = {
		name: skill.name,
		scope: skill.scope,
		dir: skill.dir
	};
	if (skill.linkedDir) return {
		...base,
		status: "failed",
		reasons: ["the skill directory is a symbolic link; its content is not pinned to one place"]
	};
	let now;
	try {
		now = skillManifest(skill);
	} catch (err) {
		return {
			...base,
			status: "failed",
			reasons: [`its specification cannot be read: ${err.message}`]
		};
	}
	if (now.problems.length) return {
		...base,
		status: "failed",
		reasons: now.problems.map((p) => `content not pinnable: ${p}`)
	};
	const bdir = bundleDirFor(skill, store.storeDir);
	const stored = readJson(path.join(bdir, "manifest.json"));
	let bundle = null;
	try {
		bundle = stored ? formal.readFormalBundle(bdir) : null;
	} catch {
		bundle = null;
	}
	if (!stored || !bundle) return {
		...base,
		status: "unverified",
		reasons: ["no signed formal bundle (a person signs it after review)"],
		caps: now.manifest.caps,
		contentDigest: now.manifest.contentDigest
	};
	let storedHash;
	try {
		storedHash = sha256OfCanonical(stored);
	} catch {
		storedHash = null;
	}
	if (storedHash === null || bundle.attestation?.manifestHash !== storedHash) return {
		...base,
		status: "tampered",
		reasons: ["the bundle's manifest does not match the attestation's manifest hash (the bundle was edited)"]
	};
	if (stored.contentDigest !== now.manifest.contentDigest) {
		const storedFiles = stored.files ?? {};
		const changed = [...new Set([...Object.keys(storedFiles), ...Object.keys(now.manifest.files)])].filter((f) => storedFiles[f] !== now.manifest.files[f]).toSorted();
		return {
			...base,
			status: "tampered",
			reasons: [`its files changed after it was signed: ${changed.slice(0, 8).join(", ")}${changed.length > 8 ? ", ..." : ""}`]
		};
	}
	if (canonicalJson(stored) !== canonicalJson(now.manifest)) return {
		...base,
		status: "tampered",
		reasons: ["its manifest (name, version, scope, directory or declared capabilities) changed after it was signed"]
	};
	const keyId = bundle.attestation?.signerKeyId ?? null;
	const signer = keyId ? findSigner(store.trustDir, keyId) : null;
	if (!bundle.attestation?.signature) return {
		...base,
		status: "failed",
		reasons: ["the bundle's attestation is not signed"]
	};
	if (!signer) return {
		...base,
		status: "failed",
		reasons: [`the bundle is signed by ${JSON.stringify(keyId)}, which is not on the trust list`]
	};
	let v;
	try {
		v = formal.verifyFormalBundle({
			skillDir: skill.dir,
			manifest: stored,
			bundle,
			signerPublicKeyPem: signer.publicKeyPem,
			authorisedFormalSigners: readSigners(store.trustDir).map((s) => s.keyId)
		});
	} catch (err) {
		return {
			...base,
			status: "failed",
			reasons: [`the bundle cannot be checked: ${err.message}`]
		};
	}
	if (!v.admit) {
		const drift = v.reasons.some((r) => /cache-miss|drifted/.test(r));
		return {
			...base,
			status: drift ? "drifted" : "failed",
			reasons: v.reasons.filter((r) => r !== "attestation-unsigned-warning-only")
		};
	}
	const bi = biconditional(v.freshlyComputed?.static ?? {}, stored.caps, analyzeSkillUses(skill.dir, stored.writeRoots ?? null));
	if (!bi.pass) return {
		...base,
		status: "failed",
		reasons: bi.reasons
	};
	return {
		...base,
		status: "verified",
		reasons: [],
		caps: stored.caps,
		contentDigest: stored.contentDigest,
		files: stored.files,
		egress: stored.egress ?? [],
		signer: signer.keyId
	};
}
/**
* Produce, verify and store a skill's signed formal bundle, after the person
* is verified. Refuses a skill that does not satisfy the biconditional, and
* removes a bundle that does not verify once written.
*/
async function signSkill(store, skill, signer, authorize) {
	const formal = store.formal ?? frameworkFormal;
	if (skill.linkedDir) throw new Error(`${skill.name}: the skill directory is a symbolic link; sign the real directory`);
	const { manifest, problems } = skillManifest(skill);
	if (problems.length) throw new Error(`${skill.name}: content not pinnable: ${problems.join("; ")}`);
	const bundle = formal.produceFormalBundle({
		skillDir: skill.dir,
		manifest,
		signerKeyId: signer.keyId,
		privateKeyPem: signer.privateKeyPem
	});
	const a = bundle.evidence?.static ?? {};
	const uses = analyzeSkillUses(skill.dir, manifest.writeRoots ?? null);
	const bi = biconditional(a, manifest.caps, uses);
	if (!bi.pass) throw new Error(`${skill.name} does not satisfy the biconditional criterion, so it is not signed: ${bi.reasons.join("; ")}`);
	if (!bundle.attestation.contained) throw new Error(`${skill.name}: the formal bundle does not establish containment (Methods A/B/C), so it is not signed`);
	await authorize(`skills sign ${skill.name}`);
	const dir = bundleDirFor(skill, store.storeDir);
	fs.rmSync(dir, {
		recursive: true,
		force: true
	});
	fs.mkdirSync(dir, {
		recursive: true,
		mode: 448
	});
	formal.writeFormalBundle(bundle, dir);
	fs.writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 384 });
	const check = verifySkill(store, skill);
	if (check.status !== "verified") {
		fs.rmSync(dir, {
			recursive: true,
			force: true
		});
		throw new Error(`${skill.name}: the bundle just written does not verify (${check.reasons.join("; ")})`);
	}
	return {
		manifest,
		bundleDir: dir,
		effects: [...new Set([...a.unionEffects ?? [], ...uses.unionEffects])].toSorted()
	};
}
/** Remove a skill's bundle (it is unverified again), after the person is verified. */
async function unsignSkill(store, skill, authorize) {
	const dir = bundleDirFor(skill, store.storeDir);
	if (!fs.existsSync(dir)) return false;
	await authorize(`skills unsign ${skill.name}`);
	fs.rmSync(dir, {
		recursive: true,
		force: true
	});
	return true;
}
/**
* The launch's skill decision. "refuse" (the default): any skill that is not
* verified refuses the launch. "exclude": unverified skills are listed in
* `excluded`, for the adapter to switch off, and the rest start.
*/
function admitSkills(store, discovered, mode = "refuse") {
	const results = discovered.skills.map((s) => verifySkill(store, s));
	const bad = results.filter((r) => r.status !== "verified");
	if (bad.length && mode !== "exclude") {
		const list = bad.slice(0, 5).map((r) => `${r.name} (${r.scope}, ${r.status}: ${r.reasons[0] ?? ""})`).join("; ");
		return {
			ok: false,
			results,
			message: `${bad.length} skill(s) the agent CLI would load are not admissible, so the session is not started: ${list}${bad.length > 5 ? "; ..." : ""}. A skill is admitted only when its implementation does exactly what its declared specification states, in both directions, and a trusted signer attested it. After review, a person signs it, or removes it`
		};
	}
	const verified = results.filter((r) => r.status === "verified");
	return {
		ok: true,
		results,
		warnings: bad.map((r) => `skill ${r.name} (${r.scope}) is ${r.status} and is switched off for this session: ${r.reasons[0] ?? ""}`),
		session: {
			verified: verified.map((r) => ({
				name: r.name,
				scope: r.scope,
				dir: r.dir,
				contentDigest: r.contentDigest ?? "",
				caps: r.caps ?? [],
				files: r.files ?? {},
				egress: r.egress ?? []
			})),
			excluded: bad.map((r) => ({
				name: r.name,
				scope: r.scope,
				dir: r.dir,
				status: r.status
			})),
			roots: discovered.roots
		}
	};
}
/**
* Has the session's set of skills drifted? A verified skill whose files
* changed, or a skill that appeared (or reappeared) that was not seen at
* launch. Returns the reason, or null. `rediscover` re-reads the host's
* skill roots.
*/
function skillDrift(session, rediscover) {
	for (const s of session.verified) {
		let d;
		try {
			d = contentDigest(s.dir);
		} catch {
			d = {
				digest: null,
				problems: ["gone"]
			};
		}
		if (d.digest !== s.contentDigest || d.problems.length) return `the files of the verified skill ${s.name} changed during the session`;
	}
	const known = new Set([...session.verified, ...session.excluded].map((s) => `${s.name}\0${comparablePath(s.dir)}`));
	const added = rediscover().skills.find((s) => !known.has(`${s.name}\0${comparablePath(s.dir)}`));
	return added ? `a skill appeared during the session that was not verified at launch: ${added.name} (${added.scope}, ${added.dir})` : null;
}
/** Poll skillDrift; `onDrift(reason)` once. */
function watchSkills(session, rediscover, onDrift, intervalMs = 1e3) {
	let fired = false;
	const check = () => {
		if (fired) return null;
		const why = skillDrift(session, rediscover);
		if (why) fired = true;
		return why;
	};
	const t = setInterval(() => {
		const why = check();
		if (why) {
			clearInterval(t);
			onDrift(why);
		}
	}, intervalMs);
	t.unref?.();
	return {
		check,
		stop: () => clearInterval(t)
	};
}
//#endregion
//#region src/enclawed/adapter/runner-config.ts
const readText = (p) => {
	try {
		return fs.readFileSync(p, "utf8");
	} catch {
		return null;
	}
};
/** `${VAR}` from the environment, as npm and pnpm expand config values. */
const expandVars = (v, env) => v.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k) => env[k] ?? "");
/** An npmrc / pip.conf style file: `key = value` per section ("" before any section). */
function parseIni(text) {
	const out = new Map([["", /* @__PURE__ */ new Map()]]);
	let section = out.get("");
	let last = null;
	for (const raw of text.split(/\r?\n/)) {
		if (/^\s*[#;]/.test(raw) || !raw.trim()) {
			last = raw.trim() ? last : null;
			continue;
		}
		if (/^\s+\S/.test(raw) && last !== null && !raw.includes("=")) {
			section.set(last, `${section.get(last) ?? ""}\n${raw.trim()}`);
			continue;
		}
		const sec = /^\s*\[([^\]]+)\]\s*$/.exec(raw);
		if (sec) {
			const name = sec[1].trim().toLowerCase();
			section = out.get(name) ?? /* @__PURE__ */ new Map();
			out.set(name, section);
			last = null;
			continue;
		}
		const kv = /^\s*([^=]+?)\s*[=:]\s*(.*?)\s*$/.exec(raw);
		if (kv) {
			let v = kv[2];
			if (/^"(.*)"$/.test(v) || /^'(.*)'$/.test(v)) v = v.slice(1, -1);
			last = kv[1].toLowerCase().replace(/_/g, "-");
			section.set(last, v);
		}
	}
	return out;
}
function tomlString(v) {
	const t = v.trim();
	if (t.startsWith("\"")) {
		const m = /^"((?:[^"\\]|\\.)*)"/.exec(t);
		return m ? m[1].replace(/\\(["\\/bfnrt])/g, (_, c) => c === "n" ? "\n" : c === "t" ? "	" : c === "b" || c === "f" || c === "r" ? "" : c) : null;
	}
	if (t.startsWith("'")) {
		const m = /^'([^']*)'/.exec(t);
		return m ? m[1] : null;
	}
	return null;
}
/**
* The string and boolean values of a TOML document by dotted key (tables,
* dotted keys, one-line inline tables); `[[name]]` tables come back as
* `name[i].key`. Enough for the runners' config files, which are only read.
*/
function parseTomlStrings(text) {
	const out = /* @__PURE__ */ new Map();
	const counts = /* @__PURE__ */ new Map();
	let prefix = "";
	const put = (key, value) => {
		const s = tomlString(value);
		if (s !== null) {
			out.set(key, s);
			return;
		}
		const t = value.trim();
		if (t === "true" || t === "false") {
			out.set(key, t === "true");
			return;
		}
		const inline = /^\{(.*)\}\s*(#.*)?$/.exec(t);
		if (inline) for (const part of inline[1].split(/,(?=(?:[^"']*["'][^"']*["'])*[^"']*$)/)) {
			const kv = /^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+?)\s*$/.exec(part);
			if (kv) put(`${key}.${kv[1]}`, kv[2]);
		}
	};
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const arr = /^\[\[\s*([A-Za-z0-9_.-]+)\s*\]\]/.exec(line);
		if (arr) {
			const n = counts.get(arr[1]) ?? 0;
			counts.set(arr[1], n + 1);
			prefix = `${arr[1]}[${n}].`;
			continue;
		}
		const tbl = /^\[\s*([A-Za-z0-9_."-]+)\s*\]/.exec(line);
		if (tbl) {
			prefix = `${tbl[1].replace(/"/g, "")}.`;
			continue;
		}
		const kv = /^([A-Za-z0-9_."-]+)\s*=\s*(.+)$/.exec(line);
		if (kv) put(`${prefix}${kv[1].replace(/"/g, "")}`, kv[2]);
	}
	return out;
}
/** A runner option's value in the definition's arguments (`--opt X` or `--opt=X`). */
function optionValue(args, names) {
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (a === "--") break;
		for (const n of names) {
			if (a === n && args[i + 1] !== void 0) return args[i + 1];
			if (a.startsWith(`${n}=`)) return a.slice(n.length + 1);
		}
	}
	return null;
}
function optionValues(args, names) {
	const out = [];
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (a === "--") break;
		for (const n of names) if (a === n && args[i + 1] !== void 0) out.push(args[i + 1]);
		else if (a.startsWith(`${n}=`)) out.push(a.slice(n.length + 1));
	}
	return out;
}
/** The directories from `dir` up to the filesystem root. */
function upward(dir, p) {
	const out = [];
	let d = p.resolve(dir);
	for (;;) {
		out.push(d);
		const up = p.dirname(d);
		if (up === d) return out;
		d = up;
	}
}
/** The platform's base directories (Windows: %LOCALAPPDATA% / %APPDATA%; macOS: ~/Library). */
function baseDirs(env, home, platform) {
	const p = platform === "win32" ? path.win32 : path.posix;
	return {
		p,
		localAppData: env.LOCALAPPDATA || p.join(home, "AppData", "Local"),
		appData: env.APPDATA || p.join(home, "AppData", "Roaming"),
		xdgCache: env.XDG_CACHE_HOME || p.join(home, ".cache"),
		xdgConfig: env.XDG_CONFIG_HOME || p.join(home, ".config"),
		xdgData: env.XDG_DATA_HOME || p.join(home, ".local", "share")
	};
}
const uniq = (xs) => [...new Set(xs.filter((x) => typeof x === "string" && x !== ""))];
/** A config value naming a directory: `~` is home, `${VAR}` expands, a relative path is against `rel`. */
function dirValue(v, env, home, rel, p) {
	if (typeof v !== "string" || !v.trim()) return null;
	const x = expandVars(v.trim(), env);
	if (x === "~" || x.startsWith("~/") || x.startsWith("~\\")) return p.join(home, x.slice(1));
	return p.resolve(rel, x);
}
/** npm's project directory: the nearest directory up from cwd with a package.json or node_modules. */
function npmLocalPrefix(cwd, p) {
	for (const d of upward(cwd, p)) if (fs.existsSync(p.join(d, "package.json")) || fs.existsSync(p.join(d, "node_modules"))) return d;
	return cwd;
}
function npmrcValue(file, key) {
	if (!file) return null;
	const t = readText(file);
	return t === null ? null : parseIni(t).get("")?.get(key) ?? null;
}
function envAny(env, ...names) {
	for (const n of names) {
		const v = env[n];
		if (typeof v === "string" && v !== "") return v;
	}
	const lower = new Set(names.map((n) => n.toLowerCase()));
	for (const [k, v] of Object.entries(env).toSorted(([a], [b]) => a < b ? -1 : 1)) if (lower.has(k.toLowerCase()) && typeof v === "string" && v !== "") return v;
	return null;
}
function npmCaches(env, home, platform, cwd, args) {
	const { p, localAppData } = baseDirs(env, home, platform);
	const prefix = npmLocalPrefix(cwd, p);
	const userrc = envAny(env, "npm_config_userconfig", "NPM_CONFIG_USERCONFIG") ?? p.join(home, ".npmrc");
	const globalPrefix = envAny(env, "npm_config_prefix", "NPM_CONFIG_PREFIX") ?? (platform === "win32" ? p.dirname(process.execPath) : p.dirname(p.dirname(process.execPath)));
	const globalrc = envAny(env, "npm_config_globalconfig", "NPM_CONFIG_GLOBALCONFIG") ?? p.join(globalPrefix, "etc", "npmrc");
	const files = [
		p.join(prefix, ".npmrc"),
		userrc,
		globalrc
	];
	return {
		p,
		prefix,
		files,
		dirs: uniq([
			dirValue(optionValue(args, ["--cache"]), env, home, cwd, p),
			dirValue(envAny(env, "npm_config_cache", "NPM_CONFIG_CACHE"), env, home, cwd, p),
			...files.map((f) => dirValue(npmrcValue(f, "cache"), env, home, cwd, p)),
			platform === "win32" ? p.join(localAppData, "npm-cache") : p.join(home, ".npm")
		])
	};
}
function pnpmCaches(env, home, platform, cwd, args) {
	const { p, localAppData, xdgCache, xdgConfig } = baseDirs(env, home, platform);
	const npm = npmCaches(env, home, platform, cwd, []);
	let workspace = null;
	for (const d of upward(cwd, p)) {
		const t = readText(p.join(d, "pnpm-workspace.yaml"));
		if (t !== null) {
			try {
				const y = YAML.parse(t);
				workspace = dirValue(typeof y?.cacheDir === "string" ? y.cacheDir : null, env, home, d, p);
			} catch {}
			break;
		}
	}
	const globalRc = platform === "win32" ? p.join(localAppData, "pnpm", "config", "rc") : platform === "darwin" ? p.join(home, "Library", "Preferences", "pnpm", "rc") : p.join(xdgConfig, "pnpm", "rc");
	return uniq([
		dirValue(optionValue(args, ["--cache-dir"]), env, home, cwd, p),
		dirValue(envAny(env, "pnpm_config_cache_dir", "npm_config_cache_dir", "NPM_CONFIG_CACHE_DIR", "PNPM_CACHE_DIR"), env, home, cwd, p),
		workspace,
		dirValue(npmrcValue(npm.files[0], "cache-dir"), env, home, cwd, p),
		dirValue(npmrcValue(globalRc, "cache-dir"), env, home, cwd, p),
		dirValue(npmrcValue(npm.files[1], "cache-dir"), env, home, cwd, p),
		platform === "win32" ? p.join(localAppData, "pnpm-cache") : platform === "darwin" ? p.join(home, "Library", "Caches", "pnpm") : p.join(xdgCache, "pnpm")
	]);
}
function bunfigCacheDir(file, env, home, p) {
	const t = readText(file);
	if (t === null) return null;
	const v = parseTomlStrings(t);
	const dir = v.get("install.cache.dir") ?? v.get("install.cache");
	return typeof dir === "string" ? dirValue(dir, env, home, p.dirname(file), p) : null;
}
function bunCaches(env, home, platform, cwd) {
	const { p, xdgCache } = baseDirs(env, home, platform);
	const bunInstall = env.BUN_INSTALL || p.join(home, ".bun");
	const tmp = env.TMPDIR || env.TEMP || env.TMP || (platform === process.platform ? os.tmpdir() : null);
	return uniq([
		dirValue(env.BUN_INSTALL_CACHE_DIR, env, home, cwd, p),
		bunfigCacheDir(p.join(cwd, "bunfig.toml"), env, home, p),
		bunfigCacheDir(p.join(env.XDG_CONFIG_HOME || home, ".bunfig.toml"), env, home, p),
		p.join(bunInstall, "install", "cache"),
		p.join(xdgCache, ".bun", "install", "cache"),
		tmp
	]);
}
function yarnCaches(env, home, platform, cwd) {
	const { p, localAppData } = baseDirs(env, home, platform);
	const fromFiles = [];
	let globalFolder = null;
	for (const d of uniq([...upward(cwd, p), home])) {
		const t = readText(p.join(d, ".yarnrc.yml"));
		if (t === null) continue;
		try {
			const y = YAML.parse(t);
			fromFiles.push(dirValue(typeof y?.cacheFolder === "string" ? y.cacheFolder : null, env, home, d, p));
			globalFolder ??= dirValue(typeof y?.globalFolder === "string" ? y.globalFolder : null, env, home, d, p);
		} catch {}
	}
	const global = dirValue(env.YARN_GLOBAL_FOLDER, env, home, cwd, p) ?? globalFolder ?? (platform === "win32" ? p.join(localAppData, "Yarn", "Berry") : p.join(home, ".yarn", "berry"));
	return uniq([
		dirValue(env.YARN_CACHE_FOLDER, env, home, cwd, p),
		...fromFiles,
		p.join(global, "cache")
	]);
}
/** A uv tool run (uvx, uv tool run): uv reads no project configuration for it. */
function isUvTool(def) {
	const cmd = typeof def?.command === "string" ? (def.command.split(/[\\/]/).pop() ?? "").replace(/\.(cmd|exe|bat)$/i, "") : "";
	const a = (def?.args ?? []).map(String);
	return cmd === "uvx" || cmd === "uv" && a[0] === "tool" && a[1] === "run";
}
/** uv's config files in its precedence order (project, unless a tool run; user; system), unless switched off. */
function uvConfigFiles(env, home, platform, cwd, args, tool) {
	const { p, appData, xdgConfig } = baseDirs(env, home, platform);
	if (args.includes("--no-config") || /^(1|true)$/i.test(env.UV_NO_CONFIG ?? "")) return [];
	const named = optionValue(args, ["--config-file"]) ?? env.UV_CONFIG_FILE;
	if (named) return [{
		file: p.resolve(cwd, named),
		table: ""
	}];
	const out = [];
	for (const d of tool ? [] : upward(cwd, p)) {
		if (fs.existsSync(p.join(d, "uv.toml"))) {
			out.push({
				file: p.join(d, "uv.toml"),
				table: ""
			});
			break;
		}
		const py = readText(p.join(d, "pyproject.toml"));
		if (py !== null && /^\s*\[tool\.uv(\.|\])/m.test(py)) {
			out.push({
				file: p.join(d, "pyproject.toml"),
				table: "tool.uv."
			});
			break;
		}
	}
	out.push({
		file: platform === "win32" ? p.join(appData, "uv", "uv.toml") : p.join(xdgConfig, "uv", "uv.toml"),
		table: ""
	});
	if (platform === "win32") out.push({
		file: p.join(env.PROGRAMDATA || "C:\\ProgramData", "uv", "uv.toml"),
		table: ""
	});
	else {
		for (const d of (env.XDG_CONFIG_DIRS || "/etc/xdg").split(":").filter(Boolean)) out.push({
			file: p.join(d, "uv", "uv.toml"),
			table: ""
		});
		out.push({
			file: "/etc/uv/uv.toml",
			table: ""
		});
	}
	return out;
}
function tomlOf(file) {
	const t = readText(file);
	return t === null ? null : parseTomlStrings(t);
}
function uvCaches(env, home, platform, cwd, args, tool) {
	const { p, localAppData, xdgCache } = baseDirs(env, home, platform);
	const fromFiles = uvConfigFiles(env, home, platform, cwd, args, tool).map(({ file, table }) => {
		const v = tomlOf(file)?.get(`${table}cache-dir`);
		return typeof v === "string" ? dirValue(v, env, home, p.dirname(file), p) : null;
	});
	return uniq([
		dirValue(optionValue(args, ["--cache-dir"]), env, home, cwd, p),
		dirValue(env.UV_CACHE_DIR, env, home, cwd, p),
		...fromFiles,
		platform === "win32" ? p.join(localAppData, "uv", "cache") : p.join(xdgCache, "uv")
	]);
}
function pipxCaches(env, home, platform) {
	const { p, localAppData, xdgCache, xdgData } = baseDirs(env, home, platform);
	const homes = env.PIPX_HOME ? [env.PIPX_HOME] : platform === "win32" ? [p.join(home, "pipx"), p.join(localAppData, "pipx", "pipx")] : platform === "darwin" ? [p.join(home, ".local", "pipx"), p.join(home, "Library", "Application Support", "pipx")] : [p.join(home, ".local", "pipx"), p.join(xdgData, "pipx")];
	return uniq([platform === "win32" ? p.join(localAppData, "pipx", "pipx", "Cache") : platform === "darwin" ? p.join(home, "Library", "Caches", "pipx") : p.join(xdgCache, "pipx"), ...homes.map((h) => p.join(h, ".cache"))]);
}
function denoDir(env, home, platform, cwd) {
	const { p, localAppData, xdgCache } = baseDirs(env, home, platform);
	return dirValue(env.DENO_DIR, env, home, cwd, p) ?? (platform === "win32" ? p.join(localAppData, "deno") : platform === "darwin" ? p.join(home, "Library", "Caches", "deno") : p.join(xdgCache, "deno"));
}
const argsOf$1 = (o) => (o.def?.args ?? []).map(String);
/** The runners' cache directories for a server, from its environment, its options and the runners' config files. */
function runnerCacheDirs(env, home, platform = process.platform, o = {}) {
	const p = platform === "win32" ? path.win32 : path.posix;
	const cwd = o.cwd ? p.resolve(o.cwd) : home;
	const args = argsOf$1(o);
	return {
		npm: npmCaches(env, home, platform, cwd, args).dirs,
		pnpm: pnpmCaches(env, home, platform, cwd, args),
		bun: bunCaches(env, home, platform, cwd),
		yarn: yarnCaches(env, home, platform, cwd),
		uv: uvCaches(env, home, platform, cwd, args, isUvTool(o.def)),
		pipx: pipxCaches(env, home, platform),
		deno: denoDir(env, home, platform, cwd),
		uid: typeof process.getuid === "function" ? process.getuid() : 0
	};
}
const PYPI = "https://pypi.org/simple/";
/** pip's config files, lowest precedence first (global, user, site, PIP_CONFIG_FILE). */
function pipConfigFiles(env, home, platform) {
	const { p, appData, xdgConfig } = baseDirs(env, home, platform);
	if (env.PIP_CONFIG_FILE && /^(os\.devnull|nul|\/dev\/null)$/i.test(env.PIP_CONFIG_FILE)) return [];
	const global = platform === "win32" ? [p.join(env.PROGRAMDATA || "C:\\ProgramData", "pip", "pip.ini")] : platform === "darwin" ? ["/Library/Application Support/pip/pip.conf", "/etc/pip.conf"] : [...(env.XDG_CONFIG_DIRS || "/etc/xdg").split(":").filter(Boolean).map((d) => p.join(d, "pip", "pip.conf")), "/etc/pip.conf"];
	const user = platform === "win32" ? [p.join(home, "pip", "pip.ini"), p.join(appData, "pip", "pip.ini")] : platform === "darwin" ? [
		p.join(home, ".pip", "pip.conf"),
		p.join(home, "Library", "Application Support", "pip", "pip.conf"),
		p.join(xdgConfig, "pip", "pip.conf")
	] : [p.join(home, ".pip", "pip.conf"), p.join(xdgConfig, "pip", "pip.conf")];
	const site = env.VIRTUAL_ENV ? [p.join(env.VIRTUAL_ENV, platform === "win32" ? "pip.ini" : "pip.conf")] : [];
	return [
		...global,
		...user,
		...site,
		...env.PIP_CONFIG_FILE ? [env.PIP_CONFIG_FILE] : []
	];
}
const asIndex = (u) => u.trim().replace(/\/?$/, "/");
/**
* The package indexes a Python runner would read for a definition, most
* preferred first (uv's extra indexes come before its default one; pip
* merges all, so any one may serve the release). The adapter reads them at
* pin time only.
*/
function pythonIndexUrls(def, env, home, platform = process.platform, o = {}) {
	const args = (def.args ?? []).map(String);
	const cmd = typeof def.command === "string" ? (def.command.split(/[\\/]/).pop() ?? "").replace(/\.(cmd|exe|bat)$/i, "") : "";
	const p = platform === "win32" ? path.win32 : path.posix;
	const cwd = o.cwd ? p.resolve(o.cwd) : home;
	const split = (v) => (v ?? "").split(/\s+/).filter(Boolean);
	if (cmd === "pipx") {
		let index = optionValue(args, ["--index-url", "-i"]) ?? env.PIP_INDEX_URL ?? null;
		let extras = [...optionValues(args, ["--extra-index-url"]), ...split(env.PIP_EXTRA_INDEX_URL)];
		if (!index || extras.length === 0) {
			let fileIndex = null;
			let fileExtras = [];
			for (const f of pipConfigFiles(env, home, platform)) {
				const t = readText(f);
				if (t === null) continue;
				const ini = parseIni(t);
				for (const sec of ["global", "install"]) {
					const s = ini.get(sec);
					fileIndex = s?.get("index-url") ?? fileIndex;
					fileExtras = s?.has("extra-index-url") ? split(s.get("extra-index-url")) : fileExtras;
				}
			}
			index ??= fileIndex;
			extras = extras.length ? extras : fileExtras;
		}
		return uniq([asIndex(index ?? PYPI), ...extras.map(asIndex)]);
	}
	const cliDefault = optionValue(args, [
		"--default-index",
		"--index-url",
		"-i"
	]);
	const cliExtra = [...optionValues(args, ["--index"]), ...optionValues(args, ["--extra-index-url"])];
	const envDefault = env.UV_DEFAULT_INDEX || env.UV_INDEX_URL || null;
	const envExtra = [...split(env.UV_INDEX), ...split(env.UV_EXTRA_INDEX_URL)].map((x) => x.includes("=") && !/^[a-z]+:/i.test(x) ? x.slice(x.indexOf("=") + 1) : x);
	let fileDefault = null;
	const fileExtra = [];
	for (const { file, table } of uvConfigFiles(env, home, platform, cwd, args, true)) {
		const v = tomlOf(file);
		if (!v) continue;
		const idx = v.get(`${table}index-url`);
		if (typeof idx === "string") fileDefault ??= idx;
		const extra = v.get(`${table}extra-index-url`);
		if (typeof extra === "string") fileExtra.push(extra);
		for (let i = 0; v.has(`${table}index[${i}].url`); i++) {
			const url = v.get(`${table}index[${i}].url`);
			if (typeof url === "string") if (v.get(`${table}index[${i}].default`) === true) fileDefault ??= url;
			else fileExtra.push(url);
		}
	}
	return uniq([
		...cliExtra,
		...envExtra,
		...fileExtra,
		cliDefault ?? envDefault ?? fileDefault ?? PYPI
	].map(asIndex));
}
//#endregion
//#region src/enclawed/adapter/runner-pins.ts
const runnerOf = (def) => typeof def.command === "string" ? (def.command.split(/[\\/]/).pop() ?? "").replace(/\.(cmd|exe|bat)$/i, "") : "";
const argsOf = (def) => (def.args ?? []).map(String);
/** The bin a package names for `name` (package.json `bin`), relative to the package. */
function npmBin(pkgDir, name) {
	const bin = readJson$1(path.join(pkgDir, "package.json"))?.bin;
	if (typeof bin === "string") return bin;
	if (bin && typeof bin === "object" && !Array.isArray(bin)) {
		const b = bin;
		const keys = Object.keys(b);
		const short = name.replace(/^@[^/]+\//, "");
		const v = keys.length === 1 ? b[keys[0]] : Object.hasOwn(b, short) ? b[short] : null;
		return typeof v === "string" ? v : null;
	}
	return null;
}
const PNPM_STATE = new Set([".modules.yaml", ".pnpm-workspace-state-v1.json"]);
function measuredInstall(dir, name, integrity, lockView, skipState = false, cache) {
	let pkgDir;
	try {
		pkgDir = fs.realpathSync(path.join(dir, "node_modules", name));
	} catch {
		return null;
	}
	const bin = npmBin(pkgDir, name);
	if (!bin || path.relative(pkgDir, path.resolve(pkgDir, bin)).startsWith("..")) return null;
	let tree;
	try {
		tree = treeDigest(path.join(dir, "node_modules"), {
			cache,
			...skipState ? { skip: (rel) => PNPM_STATE.has(rel) } : {}
		}).digest;
	} catch {
		return null;
	}
	return {
		dir,
		pkgDir,
		integrity,
		lockDigest: sha256$2(canonical(lockView)),
		treeDigest: tree,
		bin
	};
}
/** pnpm dlx installs of exactly name@version (each `dlx/<hash>/pkg`). */
function pnpmDlxInstalls(name, version, cacheDir, cache) {
	const root = path.join(cacheDir, "dlx");
	let hashes;
	try {
		hashes = fs.readdirSync(root).toSorted();
	} catch {
		return [];
	}
	const out = [];
	for (const h of hashes) {
		let dir;
		try {
			dir = fs.realpathSync(path.join(root, h, "pkg"));
		} catch {
			continue;
		}
		const deps = readJson$1(path.join(dir, "package.json"))?.dependencies;
		if (!deps || typeof deps[name] !== "string") continue;
		let lock;
		try {
			lock = YAML.parse(fs.readFileSync(path.join(dir, "pnpm-lock.yaml"), "utf8"));
		} catch {
			continue;
		}
		const pkgs = lock?.packages ?? {};
		const entry = pkgs[`${name}@${version}`];
		const importer = lock.importers?.["."];
		if (typeof entry?.resolution?.integrity !== "string" || importer?.dependencies?.[name]?.version !== version) continue;
		const view = Object.fromEntries(Object.entries(pkgs).map(([k, v]) => [k, {
			integrity: v?.resolution?.integrity ?? null,
			tarball: v?.resolution?.tarball ?? null
		}]));
		const m = measuredInstall(dir, name, entry.resolution.integrity, {
			snapshots: lock.snapshots ?? null,
			packages: view
		}, true, cache);
		if (m) out.push(m);
	}
	return out;
}
/** bunx installs of exactly name@version (bun's `.bunx-<uid>/<spec>`, or the older `<tmp>/bunx-<uid>-<spec>`). */
function bunxInstalls(name, version, roots, uid, cache) {
	const spec = `${name}@${version}`;
	const dirs = roots.flatMap((r) => [path.join(r, `.bunx-${uid}`, spec), path.join(r, `bunx-${uid}-${spec}`)]);
	const out = [];
	for (const dir of new Set(dirs)) {
		const deps = readJson$1(path.join(dir, "package.json"))?.dependencies;
		if (!deps || typeof deps[name] !== "string") continue;
		const pkgs = readJson$1(path.join(dir, "bun.lock"), true)?.packages;
		const entry = pkgs?.[name];
		if (!Array.isArray(entry) || entry[0] !== spec || typeof entry[3] !== "string") continue;
		const view = Object.fromEntries(Object.entries(pkgs ?? {}).map(([k, v]) => [k, Array.isArray(v) ? [
			v[0] ?? null,
			v[1] ?? null,
			v[3] ?? null
		] : null]));
		const m = measuredInstall(dir, name, entry[3], view, false, cache);
		if (m) out.push(m);
	}
	return out;
}
function npmRunner(def) {
	const cmd = runnerOf(def);
	const a = argsOf(def);
	if (cmd === "npx" || cmd === "npm" && (a[0] === "exec" || a[0] === "x")) return "npx";
	if (cmd === "pnpx" || cmd === "pnpm" && a[0] === "dlx") return "pnpm";
	if (cmd === "bunx" || cmd === "bun" && a[0] === "x") return "bun";
	return cmd === "yarn" && a[0] === "dlx" ? "yarn" : null;
}
const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
/** The first cache (in the runner's precedence) holding the release, each install measured. */
function firstInstalls(dirs, find) {
	for (const d of dirs) {
		const found = find(d);
		if (found.length > 0) return found;
	}
	return [];
}
function measureNpm(def, caches, o) {
	const runner = npmRunner(def);
	const r = codeResolution(def);
	if (!runner || r.kind !== "pinned-form" || r.expected.kind !== "npm") return {
		ok: false,
		code: "unpinned-form",
		reason: r.kind === "unpinned" ? `${r.reason}; to pin it, ${r.howToPin}` : "the runner names no exact package"
	};
	const { name, version } = r.expected;
	if (!NPM_NAME.test(name)) return {
		ok: false,
		code: "unpinned-form",
		reason: `${JSON.stringify(name)} is not a registry package name`
	};
	const cache = o.hashCache;
	const installs = pinnedCopy(runner === "pnpm" ? firstInstalls(caches.pnpm, (d) => pnpmDlxInstalls(name, version, d, cache)) : runner === "bun" ? bunxInstalls(name, version, caches.bun, caches.uid, cache) : firstInstalls(caches.npm, (d) => npxInstalls(name, version, d, cache).map((i) => ({
		...i,
		pkgDir: path.join(i.dir, "node_modules", name)
	}))), o.pinned);
	const where = runner === "pnpm" ? "pnpm's dlx cache" : runner === "bun" ? "bunx's cache" : "npx's cache";
	if (installs.length === 0) return {
		ok: false,
		code: "not-installed",
		reason: `${name}@${version} is not installed in ${where}${runner === "yarn" ? " (yarn dlx keeps no installed tree, so the same release is installed through npx at pin time: yarnDlxInstallCommand)" : ""}, so what would run cannot be checked`
	};
	if (new Set(installs.map((i) => `${i.integrity} ${i.lockDigest} ${i.treeDigest} ${i.bin}`)).size > 1) return {
		ok: false,
		code: "inconsistent-copies",
		reason: `${where} holds different copies of ${name}@${version}; clear them and pin again`
	};
	const i = installs[0];
	const args = argsOf(def);
	const at = args.indexOf(`${name}@${version}`);
	const bunRuntime = runner === "bun" && args.slice(0, Math.max(at, 0)).includes("--bun");
	return {
		ok: true,
		pin: {
			kind: "npm",
			name,
			version,
			integrity: i.integrity,
			lockDigest: i.lockDigest,
			treeDigest: i.treeDigest,
			bin: i.bin
		},
		launch: {
			dir: i.dir,
			runtime: bunRuntime ? "bun" : "node",
			script: path.join(i.pkgDir, i.bin),
			args: at >= 0 ? args.slice(at + 1).filter((a, k) => !(k === 0 && a === "--")) : []
		}
	};
}
/**
* yarn dlx removes its project after every run, so the same release is
* installed into npx's cache (and measured there): the command the adapter
* runs once at pin time (no install scripts run; npx's cache key is the same
* as `npx NAME@VERSION`'s). null: not a pinned yarn dlx form.
*/
function yarnDlxInstallCommand(def) {
	const r = codeResolution(def);
	if (npmRunner(def) !== "yarn" || r.kind !== "pinned-form" || r.expected.kind !== "npm") return null;
	const spec = `${r.expected.name}@${r.expected.version}`;
	if (!NPM_NAME.test(r.expected.name)) return null;
	return {
		command: "npm",
		args: [
			"exec",
			"--yes",
			"--ignore-scripts",
			`--package=${spec}`,
			"--",
			"node",
			"-e",
			""
		]
	};
}
/** The files of a zip archive by name (a wheel), stored or deflated; only `want` is extracted. */
function zipEntry(file, want) {
	const buf = fs.readFileSync(file);
	const eocd = buf.lastIndexOf(Buffer.from([
		80,
		75,
		5,
		6
	]));
	if (eocd < 0) throw new Error(`${path.basename(file)} is not a zip archive`);
	const count = buf.readUInt16LE(eocd + 10);
	let off = buf.readUInt32LE(eocd + 16);
	for (let i = 0; i < count; i++) {
		if (buf.readUInt32LE(off) !== 33639248) throw new Error(`${path.basename(file)} has a malformed central directory`);
		const method = buf.readUInt16LE(off + 10);
		const csize = buf.readUInt32LE(off + 20);
		const nlen = buf.readUInt16LE(off + 28);
		const elen = buf.readUInt16LE(off + 30);
		const clen = buf.readUInt16LE(off + 32);
		const local = buf.readUInt32LE(off + 42);
		const name = buf.subarray(off + 46, off + 46 + nlen).toString("utf8");
		off += 46 + nlen + elen + clen;
		if (!want(name)) continue;
		const lnlen = buf.readUInt16LE(local + 26);
		const lelen = buf.readUInt16LE(local + 28);
		const start = local + 30 + lnlen + lelen;
		const raw = buf.subarray(start, start + csize);
		if (method === 0) return {
			name,
			data: Buffer.from(raw)
		};
		if (method === 8) return {
			name,
			data: inflateRawSync(raw)
		};
		throw new Error(`${name} in ${path.basename(file)} uses an unsupported compression`);
	}
	return null;
}
/**
* The sha256 hashes a simple repository index (PEP 503 HTML or PEP 691 JSON)
* lists for the distribution files of name==version, sorted.
*/
function simpleIndexHashes(page, name, version) {
	const n = normName(name);
	const fileMatches = (f) => {
		const base = decodeURIComponent(f.split(/[?#]/)[0].split("/").pop() ?? "");
		const m = /^([A-Za-z0-9_.]+?)-([^-]+?)(?:-|\.tar\.gz$|\.zip$)/.exec(base);
		return !!m && normName(m[1]) === n && m[2] === version;
	};
	const out = /* @__PURE__ */ new Set();
	const t = page.trim();
	if (t.startsWith("{")) {
		const j = JSON.parse(t);
		for (const f of j.files ?? []) if (typeof f.filename === "string" && fileMatches(f.filename) && /^[0-9a-f]{64}$/.test(f.hashes?.sha256 ?? "")) out.add(`sha256:${f.hashes.sha256}`);
	} else for (const m of t.matchAll(/href="([^"]+)"/g)) {
		const href = m[1].replaceAll("&amp;", "&");
		const h = /#sha256=([0-9a-f]{64})/.exec(href);
		if (h && fileMatches(href)) out.add(`sha256:${h[1]}`);
	}
	return [...out].toSorted();
}
/** The runner environments (a pyvenv.cfg and site-packages) under `roots` holding exactly name==version. */
function pythonEnvs(name, version, roots) {
	const n = normName(name);
	for (const root of roots) {
		let dirs;
		try {
			dirs = fs.readdirSync(root).toSorted();
		} catch {
			continue;
		}
		const out = [];
		for (const d of dirs) {
			const dir = path.join(root, d);
			let mtime;
			try {
				mtime = fs.statSync(path.join(dir, "pyvenv.cfg")).mtimeMs;
			} catch {
				continue;
			}
			const site = sitePackagesIn(dir);
			if (site && fs.readdirSync(site).some((x) => x.toLowerCase() === `${n}-${version}.dist-info`.toLowerCase())) out.push({
				dir,
				site,
				mtime
			});
		}
		if (out.length > 0) return out;
	}
	return [];
}
/** The console script `bin/<name>` of an environment and the interpreter it runs. */
function pythonEntry(env, command) {
	const bin = fs.existsSync(path.join(env, "bin")) ? path.join(env, "bin") : path.join(env, "Scripts");
	const script = path.join(bin, command);
	const interpreter = ["python3", "python"].map((p) => path.join(bin, p)).find((p) => fs.existsSync(p));
	return fs.existsSync(script) && interpreter && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(command) ? {
		script,
		interpreter
	} : null;
}
/** An environment's interpreter identity: its real file and SHA-256 (the venv links to it). */
function interpreterIdentity(interpreter, cache) {
	const real = fs.realpathSync(interpreter);
	return {
		real,
		sha256: cachedSha256(real, cache)
	};
}
function measurePyEnv(e, cache) {
	const dists = verifySitePackages(e.site, cache);
	const entry = pythonEntry(e.dir, "python3") ?? pythonEntry(e.dir, "python");
	const interp = entry ? interpreterIdentity(entry.script, cache) : null;
	const cfg = fs.readFileSync(path.join(e.dir, "pyvenv.cfg"), "utf8");
	return {
		...e,
		dists,
		lockDigest: sha256$2(canonical({
			dists,
			interpreter: interp,
			pyvenv: cfg
		})),
		treeDigest: treeDigest(e.dir, { cache }).digest
	};
}
/** The release's integrity: the index's hashes at pin time (wheels checked), the record's at launch. */
function pythonIntegrity(name, version, o) {
	const pinned = o.pinned && o.pinned.kind === "pypi" && o.pinned.name === name && o.pinned.version === version && /^sha256:[0-9a-f]{64}(,sha256:[0-9a-f]{64})*$/.test(o.pinned.integrity) && typeof o.pinned.lockDigest === "string" && typeof o.pinned.treeDigest === "string" ? o.pinned : null;
	if (o.index) {
		const hashes = simpleIndexHashes(o.index.page, name, version);
		if (hashes.length === 0) return {
			ok: false,
			reason: `the index lists no hashed file of ${name}==${version}`
		};
		if (!o.index.wheels && !pinned) return {
			ok: false,
			reason: `the wheels of ${name}==${version} were not checked against the index and the installed files; pin it again`
		};
		return {
			ok: true,
			hashes
		};
	}
	if (pinned) return {
		ok: true,
		hashes: pinned.integrity.split(",")
	};
	return {
		ok: false,
		reason: `neither the index entry of ${name}==${version} (pin time) nor its admission record (launch) was given, so its release cannot be checked`
	};
}
function measurePython(def, caches, o) {
	const r = codeResolution(def);
	const form = pythonRunnerForm(def);
	if (r.kind !== "pinned-form" || r.expected.kind !== "pypi" || !form?.command) return {
		ok: false,
		code: "unpinned-form",
		reason: r.kind === "unpinned" ? `${r.reason}; to pin it, ${r.howToPin}` : "the runner names no exact package"
	};
	const { name, version } = r.expected;
	const command = form.command === form.spec ? name : form.command;
	const integrity = pythonIntegrity(name, version, o);
	if (!integrity.ok) return {
		ok: false,
		code: "index-mismatch",
		reason: integrity.reason
	};
	const cmd = runnerOf(def);
	const uvRoots = caches.uv.map((d) => path.join(d, "archive-v0"));
	const found = pythonEnvs(name, version, cmd === "pipx" ? [...caches.pipx, ...uvRoots] : [...uvRoots, ...caches.pipx]);
	if (found.length === 0) return {
		ok: false,
		code: "not-installed",
		reason: `${name}==${version} is not installed in uv's or pipx's cache, so what would run cannot be checked (run it once with the runner, then pin)`
	};
	const envs = [];
	let broken = null;
	for (const e of found) try {
		envs.push({
			...measurePyEnv(e, o.hashCache),
			mtime: e.mtime
		});
	} catch (err) {
		broken ??= err.message;
	}
	if (envs.length === 0) return {
		ok: false,
		code: "tree-changed",
		reason: `the installed ${name}==${version} is not what was installed: ${broken}`
	};
	const env = o.pinned && envs.find((e) => e.lockDigest === o.pinned.lockDigest && e.treeDigest === o.pinned.treeDigest) || envs.toSorted((x, y) => y.mtime - x.mtime)[0];
	if (o.index?.wheels) {
		const problem = wheelChainProblem(o.index.wheels, integrity.hashes, env, name, version);
		if (problem) return {
			ok: false,
			code: "index-mismatch",
			reason: problem
		};
	}
	const entry = pythonEntry(env.dir, command) ?? pythonEntry(env.dir, normName(command).replace(/_/g, "-"));
	if (!entry) return {
		ok: false,
		code: "not-installed",
		reason: `the environment of ${name}==${version} has no command ${command}`
	};
	const args = argsOf(def);
	return {
		ok: true,
		pin: {
			kind: "pypi",
			name: name.toLowerCase(),
			version,
			integrity: integrity.hashes.join(","),
			lockDigest: env.lockDigest,
			treeDigest: env.treeDigest,
			bin: path.relative(env.dir, entry.script)
		},
		launch: {
			dir: env.dir,
			runtime: "python",
			interpreter: entry.interpreter,
			script: entry.script,
			args: args.slice(form.rest).filter((a, k) => !(k === 0 && a === "--"))
		}
	};
}
/** The wheels downloaded at pin time: each listed by the index, and the top distribution's files are the installed ones. */
function wheelChainProblem(wheels, hashes, env, name, version) {
	const n = normName(name);
	const installed = fs.readdirSync(env.site).find((x) => x.toLowerCase() === `${n}-${version}.dist-info`.toLowerCase());
	if (!installed) return `${name}==${version} is not in the environment`;
	const have = new Map(parseRecord(fs.readFileSync(path.join(env.site, installed, "RECORD"), "utf8")).map((e) => [e.rel, e]));
	let matched = false;
	for (const w of wheels) {
		const h = `sha256:${sha256$2(fs.readFileSync(w))}`;
		if (!hashes.includes(h)) return `the wheel ${path.basename(w)} is not one the index lists for ${name}==${version}`;
		const rec = zipEntry(w, (x) => /^[^/]+\.dist-info\/RECORD$/.test(x));
		if (!rec) return `the wheel ${path.basename(w)} has no RECORD`;
		if (parseRecord(rec.data.toString("utf8")).filter((e) => e.hash).every((e) => have.get(e.rel)?.hash === e.hash && have.get(e.rel)?.algo === e.algo)) matched = true;
	}
	return matched ? null : `the installed ${name}==${version} is not the content of the wheel the index lists (RECORD differs)`;
}
/**
* Measure what a package-runner definition (other than docker / podman, and
* other than npx, which measureNpxPackage still serves) would run. Pin time
* (Python runners): `index` with the downloaded wheels. Launch: `pinned`, the
* record's pin (no index is read, so a launch needs no network).
*/
function measurePackageRunner(def, caches, o = {}) {
	if (npmRunner(def)) return measureNpm(def, caches, o);
	if (pythonRunnerForm(def)) return measurePython(def, caches, o);
	return {
		ok: false,
		code: "not-a-runner",
		reason: "the definition is not started with a package runner"
	};
}
//#endregion
//#region src/enclawed/adapter/managed-hooks.ts
/** The documents the host would read: `mainFile`, then the drop-ins in `dropInDir` alphabetically. */
function readManagedDocs(o) {
	const files = [o.mainFile];
	if (o.dropInDir) try {
		for (const f of fs.readdirSync(o.dropInDir).toSorted()) if (f.endsWith(".json") && !f.startsWith(".")) files.push(path.join(o.dropInDir, f));
	} catch {}
	const docs = [];
	for (const file of files) {
		let text;
		try {
			text = fs.readFileSync(file, "utf8");
		} catch {
			continue;
		}
		try {
			docs.push({
				file,
				doc: JSON.parse(text)
			});
		} catch {
			docs.push({
				file,
				doc: null,
				invalid: true
			});
		}
	}
	return docs;
}
/** JSON with sorted keys, so key order does not matter. */
function canon(v) {
	if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
	if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
	const o = v;
	return `{${Object.keys(o).toSorted().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
}
function commandWords(command) {
	const out = [];
	for (const m of command.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)) out.push(m[1] ?? m[2] ?? m[3] ?? "");
	return out;
}
const fileName = (p) => p.split(/[\\/]/).pop() ?? p;
/**
* Does `command` run an existing copy of the hook script with the managed
* arguments right after it? Exposed for the adapter's own diagnostics.
*/
function runsManagedHook(command, spec) {
	const words = commandWords(command);
	const at = words.findIndex((w) => spec.hookScriptNames.includes(fileName(w)));
	if (at < 0) return false;
	const script = words[at];
	if (!path.isAbsolute(script) && !path.win32.isAbsolute(script)) return false;
	if (!(spec.exists ?? fs.existsSync)(script)) return false;
	const after = words.slice(at + 1, at + 1 + spec.managedArgs.length);
	return spec.managedArgs.every((a, i) => after[i] === a);
}
function isRecord$1(v) {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}
/** The managed-hooks decision over the documents the adapter read (readManagedDocs). */
function managedHooksStatus(docs, spec) {
	const files = docs.map((d) => d.file);
	if (docs.length === 0) return {
		installed: false,
		code: "no-managed-settings",
		reason: "no managed settings",
		files
	};
	const bad = docs.find((d) => d.invalid);
	if (bad) return {
		installed: false,
		code: "invalid-document",
		reason: `${bad.file} is not valid JSON`,
		files,
		file: bad.file
	};
	const hooks = {};
	let locked = false;
	for (const { doc } of docs) {
		if (!isRecord$1(doc)) continue;
		if (doc[spec.lockKey] === true) locked = true;
		if (!isRecord$1(doc.hooks)) continue;
		for (const [event, list] of Object.entries(doc.hooks)) hooks[event] = [...hooks[event] ?? [], ...Array.isArray(list) ? list : []];
	}
	for (const [event, wanted] of Object.entries(spec.expected)) {
		const want = wanted[0];
		if (!(hooks[event] ?? []).some((entry) => {
			if (!isRecord$1(entry) || !Array.isArray(entry.hooks) || entry.hooks.length !== 1) return false;
			const handler = entry.hooks[0];
			if (!isRecord$1(handler) || typeof handler.command !== "string") return false;
			if (!runsManagedHook(handler.command, spec)) return false;
			return canon({
				...entry,
				hooks: [{
					...handler,
					command: spec.placeholder
				}]
			}) === canon(want);
		})) return {
			installed: false,
			code: "hook-missing",
			reason: `the managed settings do not run the adapter's hook (managed mode, matching the expected block) for ${event}`,
			files,
			event
		};
	}
	if (!locked) return {
		installed: false,
		code: "lock-missing",
		reason: `the managed settings do not set ${spec.lockKey}`,
		files
	};
	return {
		installed: true,
		code: "installed",
		reason: "the managed settings run the adapter's hook on every event",
		files
	};
}
function valueAt(doc, p) {
	let cur = doc;
	for (const k of p) {
		if (!isRecord$1(cur) || !Object.hasOwn(cur, k)) return {
			found: false,
			value: void 0
		};
		cur = cur[k];
	}
	return {
		found: true,
		value: cur
	};
}
/**
* Why something other than the person may answer the host's prompt, over the
* managed documents the adapter read (readManagedDocs); null when only the
* person can.
*/
function hostPromptAnswerer(docs, spec) {
	if (docs.length === 0) return `no managed settings set ${spec.lockKey}, so hooks from other settings files can answer it`;
	const bad = docs.find((d) => d.invalid);
	if (bad) return `${bad.file} is not valid JSON, so the host may not apply the managed settings`;
	if (!docs.some((d) => isRecord$1(d.doc) && d.doc[spec.lockKey] === true)) return `the managed settings do not set ${spec.lockKey}, so hooks from other settings files can answer it`;
	for (const { file, doc } of docs) {
		if (!isRecord$1(doc)) continue;
		for (const ev of spec.answerEvents) {
			const list = isRecord$1(doc.hooks) ? doc.hooks[ev] : void 0;
			if (Array.isArray(list) && list.length > 0) return `${file} sets ${ev} hooks, which answer it`;
		}
		const plugins = doc[spec.pluginsKey];
		if (isRecord$1(plugins) && Object.values(plugins).some((v) => v !== false && v !== null)) return `${file} enables plugins (${spec.pluginsKey}), whose hooks can answer it`;
	}
	for (const pin of spec.pinned) {
		const named = docs.map((d) => valueAt(d.doc, pin.path)).filter((v) => v.found);
		if (named.length === 0 || named.some((v) => canon(v.value) !== canon(pin.value))) return `the managed settings do not pin ${pin.path.join(".")} to ${JSON.stringify(pin.value)}, so the host may allow calls by itself`;
	}
	return null;
}
//#endregion
//#region src/enclawed/adapter/settings-drop.ts
/** How long the one-shot prevalidation run may take before the adapter kills it (internal constant). */
const PREVALIDATE_RUN_MS = 2e4;
const BUFFER_CHARS = 65536;
/**
* A stderr reader: call it with each chunk; `onDrop(line)` fires once, for the
* first line after the host's header (`header` matches the header text) that
* names `settingsDir`. Returns whether a drop was seen (so far).
*/
function settingsDropWatcher(o) {
	let buf = "";
	let afterHeader = null;
	let fired = false;
	const header = new RegExp(o.header.source, o.header.flags.replace(/[gy]/g, ""));
	return (chunk) => {
		if (fired) return true;
		buf += chunk;
		let dropFront = 0;
		if (buf.length > BUFFER_CHARS) {
			dropFront = buf.length - BUFFER_CHARS;
			buf = buf.slice(dropFront);
		}
		if (afterHeader !== null) afterHeader = Math.max(0, afterHeader - dropFront);
		else {
			const m = header.exec(buf);
			if (m) {
				const nl = buf.indexOf("\n", m.index + m[0].length);
				afterHeader = nl < 0 ? buf.length : nl + 1;
			}
		}
		if (afterHeader === null || o.settingsDir === "") return false;
		const line = buf.slice(afterHeader).split("\n").find((l) => l.includes(o.settingsDir));
		if (line === void 0) return false;
		fired = true;
		o.onDrop(line.trim());
		return true;
	};
}
function isRecord(v) {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}
/**
* A copy of a host `hooks` block (event -> groups -> hooks) whose command
* hooks all run `neutral` instead: the structure the host validates is the
* same, and nothing the block names runs. Anything not of that shape is kept
* as it is (the host validates it the same way).
*/
function neutralizeHookCommands(hooks, neutral) {
	if (!isRecord(hooks)) return hooks;
	const out = {};
	for (const [event, groups] of Object.entries(hooks)) out[event] = Array.isArray(groups) ? groups.map((g) => isRecord(g) && Array.isArray(g.hooks) ? {
		...g,
		hooks: g.hooks.map((h) => isRecord(h) && h.type === "command" ? {
			...h,
			command: neutral
		} : h)
	} : g) : groups;
	return out;
}
/**
* The interactive guard's decision. `run` starts the host once headless on the
* neutralized copy and feeds its stderr to `onStderr`; when `onStderr` returns
* true (a drop was seen) the adapter kills the run at once. `run` must kill it
* after PREVALIDATE_RUN_MS. It resolves true when the host ran, false when it
* could not start. A drop refuses the launch; a host that could not be run
* leaves the launch to the live guards (the transcript watch stops the
* session at its first unchecked call).
*/
async function prevalidateSettings(o) {
	const seen = { line: null };
	const watch = settingsDropWatcher({
		settingsDir: o.settingsDir,
		header: o.header,
		onDrop: (line) => {
			seen.line = line;
		}
	});
	let ran;
	try {
		ran = await o.run({
			onStderr: watch,
			deadlineMs: PREVALIDATE_RUN_MS
		});
	} catch (err) {
		ran = false;
		if (seen.line === null) return {
			ok: true,
			code: "not-run",
			ran: false,
			note: `the prevalidation run failed (${err instanceof Error ? err.message : String(err)})`
		};
	}
	if (seen.line !== null) return {
		ok: false,
		code: "settings-dropped",
		line: seen.line
	};
	return ran ? {
		ok: true,
		code: "loaded",
		ran: true
	} : {
		ok: true,
		code: "not-run",
		ran: false,
		note: "the host could not be started"
	};
}
//#endregion
//#region src/enclawed/adapter/anchor-chain.ts
const CHUNK = 1 << 20;
var AnchorTamper = class extends Error {
	constructor(reason, message) {
		super(message);
		this.reason = reason;
		this.name = "AnchorTamper";
		this.code = "ANCHOR_TAMPER";
	}
};
/** The sealed rotation segments of `logFile`, oldest first (`audit.jsonl` -> `audit.<n>.jsonl`). */
function sealedSegmentsSync(logFile) {
	const dir = path.dirname(logFile);
	const base = path.basename(logFile);
	const ext = path.extname(base);
	const prefix = `${base.slice(0, base.length - ext.length)}.`;
	let names;
	try {
		names = fs.readdirSync(dir);
	} catch {
		return [];
	}
	const out = [];
	for (const n of names) {
		if (!n.startsWith(prefix) || !n.endsWith(ext) || n === base) continue;
		const mid = n.slice(prefix.length, n.length - ext.length);
		if (/^\d+$/.test(mid)) out.push({
			seq: Number(mid),
			file: path.join(dir, n)
		});
	}
	return out.toSorted((a, b) => a.seq - b.seq);
}
function recordHashOf(rec) {
	return buildRecord({
		prevHash: rec.prevHash,
		type: rec.type,
		actor: rec.actor,
		level: rec.level,
		payload: rec.payload,
		ts: rec.ts
	}).recordHash;
}
function readRange(fd, from, to, onChunk) {
	const buf = Buffer.alloc(Math.min(CHUNK, Math.max(1, to - from)));
	for (let p = from; p < to;) {
		const n = fs.readSync(fd, buf, 0, Math.min(buf.length, to - p), p);
		if (n <= 0) return false;
		onChunk(buf.subarray(0, n));
		p += n;
	}
	return true;
}
function readFileSafe(p) {
	try {
		return fs.readFileSync(p);
	} catch {
		return null;
	}
}
/** Follow the hash-chained log `file` from its current end. */
function followChain(file) {
	let ino = null;
	let dev = null;
	let born = null;
	const bornOf = (fd) => {
		const b = fs.fstatSync(fd, { bigint: true }).birthtimeNs;
		return b > 0n ? b : null;
	};
	const sameBirth = (a, b) => a === null || b === null || a === b;
	let offset = 0;
	let head = null;
	let records = 0;
	let prefix = createHash("sha256");
	const open = () => {
		try {
			return fs.openSync(file, "r");
		} catch (err) {
			if (err.code === "ENOENT") return null;
			throw err;
		}
	};
	const consume = (fd, from, size, hash, lenient = false) => {
		let rest = Buffer.alloc(0);
		let at = from;
		readRange(fd, from, size, (chunk) => {
			let buf = rest.length ? Buffer.concat([rest, chunk]) : Buffer.from(chunk);
			for (;;) {
				const nl = buf.indexOf(10);
				if (nl < 0) break;
				const line = buf.subarray(0, nl + 1);
				const text = line.toString("utf8").trim();
				if (text) {
					let rec = null;
					try {
						rec = JSON.parse(text);
					} catch {
						if (!lenient) throw new AnchorTamper("record-not-json", `audit record ${records + 1} is not JSON`);
					}
					if (!lenient) {
						if (!rec || typeof rec.recordHash !== "string" || recordHashOf(rec) !== rec.recordHash) throw new AnchorTamper("record-hash-mismatch", `audit record ${records + 1} does not hash to its recordHash`);
						if (head !== null && rec.prevHash !== head) throw new AnchorTamper("record-link-broken", `audit record ${records + 1} does not link to the record before it (${JSON.stringify(rec.prevHash).slice(1, 13)}… after ${head.slice(0, 12)}…)`);
					}
					head = rec && typeof rec.recordHash === "string" ? rec.recordHash : head;
					records++;
				}
				hash.update(line);
				at += line.length;
				buf = buf.subarray(nl + 1);
			}
			rest = buf;
		});
		return at;
	};
	const prefixUnchanged = (fd, upTo) => {
		const h = createHash("sha256");
		if (!readRange(fd, 0, upTo, (c) => h.update(c))) return false;
		return h.digest("hex") === prefix.copy().digest("hex");
	};
	const fd0 = open();
	if (fd0 !== null) try {
		const st = fs.fstatSync(fd0);
		ino = st.ino;
		dev = st.dev;
		born = bornOf(fd0);
		offset = consume(fd0, 0, st.size, prefix, true);
	} finally {
		fs.closeSync(fd0);
	}
	const advance = () => {
		const fd = open();
		if (fd === null) {
			if (offset > 0) throw new AnchorTamper("log-deleted", "the audit log was deleted");
			return {
				head,
				records
			};
		}
		try {
			const st = fs.fstatSync(fd);
			const stBorn = bornOf(fd);
			if (ino === null) {
				ino = st.ino;
				dev = st.dev;
				born = stBorn;
			}
			if (st.ino !== ino || st.dev !== dev || !sameBirth(stBorn, born)) {
				const segs = sealedSegmentsSync(file);
				const sealed = segs.find((s) => {
					try {
						const x = fs.statSync(s.file, { bigint: true });
						const xBorn = x.birthtimeNs > 0n ? x.birthtimeNs : null;
						return Number(x.ino) === ino && Number(x.dev) === dev && sameBirth(xBorn, born);
					} catch {
						return false;
					}
				});
				if (!sealed) throw new AnchorTamper("log-replaced", "the audit log file was replaced (a new file, not a rotation of the one this session followed)");
				const sfd = fs.openSync(sealed.file, "r");
				try {
					const sst = fs.fstatSync(sfd);
					if (sst.size < offset || !prefixUnchanged(sfd, offset)) throw new AnchorTamper("sealed-segment-changed", "the sealed segment of the audit log changed before the last anchored record");
					consume(sfd, offset, sst.size, prefix);
				} finally {
					fs.closeSync(sfd);
				}
				for (const later of segs.filter((x) => x.seq > sealed.seq)) {
					const lfd = fs.openSync(later.file, "r");
					try {
						consume(lfd, 0, fs.fstatSync(lfd).size, createHash("sha256"));
					} finally {
						fs.closeSync(lfd);
					}
				}
				ino = st.ino;
				dev = st.dev;
				born = stBorn;
				offset = 0;
				prefix = createHash("sha256");
			} else if (st.size < offset) throw new AnchorTamper("log-shrank", `the audit log shrank below the last verified record (${st.size} < ${offset} bytes)`);
			else if (offset > 0 && !prefixUnchanged(fd, offset)) throw new AnchorTamper("log-rewritten", "the audit log was rewritten before the last verified record");
			offset = consume(fd, offset, st.size, prefix);
			return {
				head,
				records
			};
		} finally {
			fs.closeSync(fd);
		}
	};
	return {
		advance,
		state: () => ({
			offset,
			head,
			records
		})
	};
}
/**
* The anchor file and anchor history as the launcher left them: the file must
* still hold exactly what it wrote, the history must still begin with exactly
* what it held (appends are fine).
*/
function anchorFilesGuard(anchorPath, historyPath) {
	let anchor = readFileSafe(anchorPath);
	let history = readFileSafe(historyPath) ?? Buffer.alloc(0);
	return {
		check() {
			const a = readFileSafe(anchorPath);
			if (anchor !== null && (a === null || !a.equals(anchor))) throw a === null ? new AnchorTamper("anchor-file-deleted", "the anchor file was deleted during the session") : new AnchorTamper("anchor-file-rewritten", "the anchor file was rewritten during the session");
			const h = readFileSafe(historyPath);
			if (history.length > 0 && (h === null || h.length < history.length || !h.subarray(0, history.length).equals(history))) throw h === null ? new AnchorTamper("history-deleted", "the anchor history was deleted during the session") : new AnchorTamper("history-rewritten", "the anchor history was rewritten during the session");
		},
		wrote() {
			anchor = readFileSafe(anchorPath);
			history = readFileSafe(historyPath) ?? Buffer.alloc(0);
		}
	};
}
/** At most this much of one file is read per poll; the rest is read on the next. */
const MAX_READ = 16 * 1024 * 1024;
/** The subdirectories of `parent` whose names start with one of `prefixes` (a host's per-project directories). */
function prefixedDirs(parent, prefixes) {
	let names;
	try {
		names = fs.readdirSync(parent);
	} catch {
		return [];
	}
	return names.filter((n) => prefixes.some((p) => p !== "" && n.startsWith(p))).toSorted().map((n) => path.join(parent, n));
}
function filesBelow(dir, depth, ext, out = []) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const d of entries) {
		const p = path.join(dir, d.name);
		if (d.isDirectory() && depth > 0) filesBelow(p, depth - 1, ext, out);
		else if (d.isFile() && d.name.endsWith(ext)) out.push(p);
	}
	return out;
}
/**
* Tail the transcripts in `dirs()` (rescanned on every poll, so new session
* and subagent files are picked up from their first byte). Lines already there
* at launch are not this session's and are skipped. A file that shrinks is
* followed from its new end. Only complete lines are parsed.
*/
function watchTranscripts(o) {
	const offsets = /* @__PURE__ */ new Map();
	const rest = /* @__PURE__ */ new Map();
	const files = () => {
		const out = [];
		for (const d of o.dirs()) filesBelow(d, o.depth, o.extension, out);
		return out;
	};
	for (const f of files()) try {
		offsets.set(f, fs.statSync(f).size);
	} catch {}
	const poll = () => {
		for (const f of files()) {
			let size;
			try {
				size = fs.statSync(f).size;
			} catch {
				continue;
			}
			const from = offsets.get(f) ?? 0;
			if (size <= from) {
				if (size < from) {
					offsets.set(f, size);
					rest.delete(f);
				}
				continue;
			}
			let chunk;
			try {
				const fd = fs.openSync(f, "r");
				try {
					const buf = Buffer.alloc(Math.min(size - from, MAX_READ));
					const n = fs.readSync(fd, buf, 0, buf.length, from);
					chunk = buf.subarray(0, n);
				} finally {
					fs.closeSync(fd);
				}
			} catch {
				continue;
			}
			offsets.set(f, from + chunk.length);
			const prev = rest.get(f);
			let buf = prev ? Buffer.concat([prev, chunk]) : chunk;
			for (;;) {
				const nl = buf.indexOf(10);
				if (nl < 0) break;
				const line = buf.subarray(0, nl).toString("utf8");
				buf = buf.subarray(nl + 1);
				if (line.trim() === "") continue;
				let parsed;
				try {
					parsed = o.parseLine(line);
				} catch {
					continue;
				}
				for (const u of parsed.uses) o.onUse({
					...u,
					file: f
				});
				for (const r of parsed.results) o.onResult({
					...r,
					file: f
				});
			}
			rest.set(f, Buffer.from(buf));
		}
	};
	if (o.timer === false) return {
		poll,
		stop: () => {}
	};
	const timer = setInterval(poll, 250);
	timer.unref?.();
	return {
		poll,
		stop: () => clearInterval(timer)
	};
}
/**
* The decision for one transcript event. `handshake`: the session-start
* handshake is done. `decided(id)`: a verified hook reported a decision for
* that call id. "unchecked" stops the host.
*/
function transcriptCallVerdict(e, s) {
	if (e.kind === "use") {
		if (!s.handshake && !s.decided(e.id)) return {
			verdict: "unchecked",
			code: "call-before-handshake",
			id: e.id,
			reason: `a ${e.name ?? "tool"} call (${e.id}) started before Enclawed's hooks reported in`
		};
		return { verdict: "ok" };
	}
	if (e.isError) return { verdict: "ok" };
	if (!s.decided(e.id)) return {
		verdict: "unchecked",
		code: "ran-without-decision",
		id: e.id,
		reason: `a tool call (${e.id}) ran without a decision from Enclawed's hook`
	};
	return {
		verdict: "check-decision",
		id: e.id
	};
}
//#endregion
//#region src/enclawed/adapter/trigger.ts
const RANK = {
	none: 0,
	read: 1,
	triage: 2,
	write: 3,
	maintain: 4,
	admin: 5
};
/** May this event start an agent run? */
function decideTrigger(e, policy) {
	const a = e.actor;
	const who = `${JSON.stringify(a.login ?? "(no login)")} (${a.type}, id ${a.id ?? "none"})`;
	const no = (code, why) => ({
		ok: false,
		code,
		reason: `no agent run is started for ${who}: ${why}`
	});
	if (policy.repositories && !policy.repositories.includes(e.repository)) return no("repository-not-covered", `the policy does not cover the repository ${JSON.stringify(e.repository)}`);
	if (!a || typeof a.id !== "number" || !Number.isInteger(a.id) || a.id <= 0) return no("actor-unknown", "the platform reported no account id for the actor");
	if (a.type === "User") {
		if (/\[bot\]$/i.test(a.login ?? "") || a.appId !== void 0 && a.appId !== null) return no("actor-unknown", "the actor's data is inconsistent (a user with a bot's login or an app id)");
		if (!policy.users.some((u) => u.id === a.id)) return no("user-not-allowlisted", "the account is not on the policy's list of users who may start a run");
		const need = policy.minPermission ?? "write";
		const have = a.permission ?? "none";
		if (!(have in RANK) || RANK[have] < RANK[need]) return no("permission-too-low", `the account's permission on the repository is ${have}, below ${need}`);
		return {
			ok: true,
			principal: `user:${a.id}`
		};
	}
	if (a.type === "Bot" || a.type === "App") {
		if (typeof a.appId !== "number" || !policy.apps.some((p) => p.appId === a.appId)) return no("app-not-allowlisted", "bots and apps start a run only when their app id is on the policy's list; a name ending in [bot] proves nothing");
		return {
			ok: true,
			principal: `app:${a.appId}`
		};
	}
	return no("actor-type-refused", `actors of type ${a.type} never start a run`);
}
const GRANT_KEYS = new Set([
	"v",
	"projectHooks",
	"projectCommands",
	"hooks",
	"reducedContainment",
	"hardwareRoot",
	"forensicWebhook",
	"loaderEnv"
]);
const HEX64 = /^[0-9a-f]{64}$/;
const NO_GRANTS = Object.freeze({
	projectHooks: [],
	projectCommands: [],
	hooks: [],
	reducedContainment: false,
	hardwareRoot: null,
	forensicWebhook: null,
	loaderEnv: []
});
function isObject$2(v) {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}
function parseRepoGrants(name, v) {
	if (!Array.isArray(v)) throw new Error(`${name} must be a list of { "repo": "/abs/path", "digest": "<sha256 hex>" }`);
	return v.map((g, i) => {
		if (!isObject$2(g) || Object.keys(g).some((k) => ![
			"repo",
			"digest",
			"note"
		].includes(k))) throw new Error(`${name}[${i}] must be { "repo", "digest" } (and an optional "note")`);
		if (typeof g.repo !== "string" || !path.isAbsolute(g.repo) || g.repo.includes("\0")) throw new Error(`${name}[${i}].repo must be an absolute path`);
		if (typeof g.digest !== "string" || !HEX64.test(g.digest)) throw new Error(`${name}[${i}].digest must be 64 lowercase hex characters`);
		if (g.note !== void 0 && typeof g.note !== "string") throw new Error(`${name}[${i}].note must be a string`);
		return {
			repo: realpathNearestSync(path.resolve(g.repo)),
			digest: g.digest
		};
	});
}
/** A forensic webhook URL: https, a host, no credentials. Throws otherwise. */
function parseForensicWebhook(v) {
	if (typeof v !== "string" || v.length > 2048) throw new Error("forensicWebhook must be an https URL");
	let u;
	try {
		u = new URL(v);
	} catch {
		throw new Error("forensicWebhook must be an https URL");
	}
	if (u.protocol !== "https:" || !u.hostname || u.username || u.password) throw new Error("forensicWebhook must be an https URL with a host and no credentials");
	return u.href;
}
/** Parse one grant document; throws on anything not exactly as documented. */
function parseAdminGrantDoc(doc) {
	if (!isObject$2(doc)) throw new Error(`expected { "v": 2, ... }`);
	if (doc.v !== 2) throw new Error(doc.v === 1 ? `version 1 grant files (environment-variable opt-outs) are retired; write { "v": 2, ... } with per-repository projectHooks/projectCommands grants` : `expected "v": 2`);
	for (const k of Object.keys(doc)) if (!GRANT_KEYS.has(k)) throw new Error(`unknown key ${k}`);
	let hooks = [];
	if (doc.hooks !== void 0) {
		const list = doc.hooks;
		if (!Array.isArray(list) || list.some((g) => !isObject$2(g) || Object.keys(g).some((k) => !["digest", "note"].includes(k)) || typeof g.digest !== "string" || !HEX64.test(g.digest) || g.note !== void 0 && typeof g.note !== "string")) throw new Error("hooks must be a list of { \"digest\": \"<sha256 hex>\" } (and an optional \"note\")");
		hooks = list.map((g) => ({ digest: g.digest }));
	}
	let loaderEnv = [];
	if (doc.loaderEnv !== void 0) {
		const l = doc.loaderEnv;
		if (!Array.isArray(l) || l.some((n) => typeof n !== "string" || !LOADER_INJECTION_ENV.includes(n))) throw new Error(`loaderEnv must be a list of ${LOADER_INJECTION_ENV.join(", ")}`);
		loaderEnv = [...new Set(l)].toSorted();
	}
	let reducedContainment = false;
	if (doc.reducedContainment !== void 0) {
		if (typeof doc.reducedContainment !== "boolean") throw new Error("reducedContainment must be true or false");
		reducedContainment = doc.reducedContainment;
	}
	let hardwareRoot = null;
	if (doc.hardwareRoot !== void 0) {
		if (doc.hardwareRoot !== "optional") throw new Error("hardwareRoot takes exactly \"optional\"");
		hardwareRoot = "optional";
	}
	return {
		projectHooks: doc.projectHooks === void 0 ? [] : parseRepoGrants("projectHooks", doc.projectHooks),
		projectCommands: doc.projectCommands === void 0 ? [] : parseRepoGrants("projectCommands", doc.projectCommands),
		hooks,
		reducedContainment,
		hardwareRoot,
		forensicWebhook: doc.forensicWebhook === void 0 ? null : parseForensicWebhook(doc.forensicWebhook),
		loaderEnv
	};
}
/**
* The admin-file check: the framework's root-ownership check (which refuses
* inside a non-initial user namespace). Windows has no such check, so no file
* is trusted there. `test`: a suite's stand-in for root (TestOwnership).
*/
function rootOwnedFileCheck(platform = process.platform, test = null) {
	return (file) => {
		if (platform === "win32") return {
			ok: false,
			reason: "no root-ownership check on Windows"
		};
		if (!test) return checkRootOwnedFile(file);
		return checkRootOwnedFile(file, test.trustedUids?.length ? test.trustedUids : [0], test.ignoreUserNamespace ? { uidMap: null } : {});
	};
}
/**
* The administrator's grants: every trusted, valid file in `dirs` x
* `fileNames`, merged (lists united; a switch granted by any file is granted;
* the first webhook wins and a second, different one is reported).
*/
function resolveAdminGrants(o) {
	const check = o.check ?? rootOwnedFileCheck();
	const env = o.env ?? {};
	const retired = [];
	for (const name of Object.keys(o.retiredEnv ?? {})) {
		const value = env[name];
		if (typeof value === "string") retired.push({
			name,
			value
		});
	}
	const notes = [];
	const files = [];
	const projectHooks = [];
	const projectCommands = [];
	const hooks = [];
	const loader = /* @__PURE__ */ new Set();
	let reducedContainment = false;
	let hardwareRoot = null;
	let forensicWebhook = null;
	const sources = {};
	const grantFiles = {};
	const from = (key, file) => {
		sources[key] ??= file;
	};
	for (const dir of o.dirs) for (const name of o.fileNames) {
		const file = path.join(dir, name);
		const c = check(file);
		if (!c.ok) {
			if (c.reason !== "ENOENT") notes.push(`${file} ignored: ${c.reason}`);
			continue;
		}
		let g;
		try {
			g = parseAdminGrantDoc(JSON.parse(fs.readFileSync(file, "utf8")));
		} catch (err) {
			notes.push(`${file} ignored, nothing in it is granted: ${err.message}`);
			continue;
		}
		files.push(file);
		for (const [kind, list] of [
			["projectHooks", g.projectHooks],
			["projectCommands", g.projectCommands],
			["hooks", g.hooks]
		]) for (const x of list) grantFiles[`${kind}:${x.digest}`] ??= file;
		projectHooks.push(...g.projectHooks);
		projectCommands.push(...g.projectCommands);
		hooks.push(...g.hooks);
		for (const n of g.loaderEnv) {
			loader.add(n);
			from(`loaderEnv=${n}`, file);
		}
		if (g.reducedContainment) {
			reducedContainment = true;
			from("reducedContainment", file);
		}
		if (g.hardwareRoot) {
			hardwareRoot ??= g.hardwareRoot;
			from(`hardwareRoot=${g.hardwareRoot}`, file);
		}
		if (g.forensicWebhook) if (forensicWebhook && forensicWebhook !== g.forensicWebhook) notes.push(`${file}: a second forensicWebhook is ignored; the one from an earlier file is used`);
		else {
			forensicWebhook = g.forensicWebhook;
			from("forensicWebhook", file);
		}
	}
	return {
		grants: {
			projectHooks,
			projectCommands,
			hooks,
			reducedContainment,
			hardwareRoot,
			forensicWebhook,
			loaderEnv: [...loader].toSorted()
		},
		files,
		retired,
		notes,
		sources,
		grantFiles
	};
}
/** The hook grants decideHooks takes: repository hooks for their repository, the rest by digest. */
function hookGrantsOf(g) {
	return [...g.projectHooks.map((x) => ({
		repo: x.repo,
		digest: x.digest
	})), ...g.hooks.map((x) => ({ digest: x.digest }))];
}
/** One-line warnings: retired variables, grants in use, files not trusted. */
function adminGrantWarnings(r, retiredEnv = {}) {
	const w = [];
	for (const i of r.retired) w.push(`ignoring ${i.name}=${JSON.stringify(i.value)} from your shell: it is no longer read (${retiredEnv[i.name] ?? "fixed behavior"}). This is recorded in the audit log`);
	const byFile = /* @__PURE__ */ new Map();
	for (const [key, file] of Object.entries(r.sources)) byFile.set(file, [...byFile.get(file) ?? [], key]);
	for (const [file, keys] of byFile) w.push(`${keys.join(", ")} granted by ${file}; recorded in the audit log`);
	w.push(...r.notes);
	return w;
}
//#endregion
//#region src/enclawed/adapter/repo-commands.ts
function isObject$1(v) {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}
const getPath = (doc, dotted) => dotted.split(".").reduce((v, k) => isObject$1(v) ? v[k] : void 0, doc);
function commandText(v) {
	if (typeof v === "string") return v;
	if (isObject$1(v) && typeof v.command === "string") return v.command;
	return JSON.stringify(v) ?? "";
}
function stringList(v) {
	return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}
/**
* Every repository setting that runs a command, and every repository MCP
* server that will start: approved by `enableAllProjectMcpServers` or
* `enabledMcpjsonServers` in any settings scope, or (as a host may do on
* its own) every server not disabled in a non-interactive or
* bypass-permissions session.
*/
function repositoryCommandSettings(o) {
	const out = [];
	const docs = [];
	for (const s of o.settings) {
		if (!isObject$1(s.doc)) continue;
		docs.push(s.doc);
		if (s.scope !== "project" && s.scope !== "local") continue;
		for (const key of o.commandPaths) {
			const v = getPath(s.doc, key);
			if (v !== void 0 && v !== null && v !== "") out.push({
				scope: s.scope,
				file: s.file,
				key,
				command: commandText(v).slice(0, 200),
				value: v
			});
		}
	}
	const servers = isObject$1(o.mcpJson?.doc) ? o.mcpJson.doc.mcpServers : void 0;
	if (o.mcpJson && isObject$1(servers)) {
		const all = docs.some((d) => d.enableAllProjectMcpServers === true);
		const enabled = new Set(docs.flatMap((d) => stringList(d.enabledMcpjsonServers)));
		const disabled = new Set(docs.flatMap((d) => stringList(d.disabledMcpjsonServers)));
		for (const [name, def] of Object.entries(servers)) {
			if (disabled.has(name)) continue;
			const why = all ? "enableAllProjectMcpServers" : enabled.has(name) ? "enabledMcpjsonServers" : o.session.nonInteractive ? "non-interactive" : o.session.bypass ? "bypass" : null;
			if (!why) continue;
			const cmd = isObject$1(def) && typeof def.command === "string" ? [def.command, ...stringList(def.args)].join(" ") : isObject$1(def) && typeof def.url === "string" ? def.url : JSON.stringify(def) ?? "";
			out.push({
				scope: "project",
				file: o.mcpJson.file,
				key: `mcpServers.${name}`,
				command: cmd.slice(0, 200),
				value: def ?? null,
				enabledBy: why
			});
		}
	}
	return out;
}
/** The grant digest of one repository command entry (the same form as a repository hook's). */
function commandSettingDigest(e, o) {
	const root = realpathNearestSync(path.resolve(o.projectDir));
	const doc = {
		v: 1,
		kind: "command",
		file: path.relative(root, realpathNearestSync(path.resolve(e.file))),
		key: e.key,
		value: e.value ?? null,
		files: referencedFilesIn(e.value, root, [...o.projectVars ?? [], "ENCLAWED_PROJECT_DIR"])
	};
	return createHash("sha256").update(canonicalOf(doc)).digest("hex");
}
/**
* The launch decision over the repository's command settings: each must be
* granted for this repository by digest, or the launch does not start.
*/
function decideRepositoryCommands(entries, grants, o) {
	const repo = realpathNearestSync(path.resolve(o.projectDir));
	const refusals = [];
	const granted = [];
	for (const e of entries) {
		let digest;
		try {
			digest = commandSettingDigest(e, o);
		} catch (err) {
			refusals.push({
				entry: e,
				digest: null,
				why: err.message,
				grant: null
			});
			continue;
		}
		const grant = {
			repo,
			digest
		};
		if (grants.some((g) => g.repo === repo && g.digest === digest)) {
			granted.push(grant);
			continue;
		}
		refusals.push({
			entry: e,
			digest,
			why: e.key.startsWith("mcpServers.") ? `the repository's MCP server ${JSON.stringify(e.key.slice(11))} would start (${e.enabledBy ?? "enabled"}) and run the repository's code outside Enclawed's checks` : `the repository sets ${e.key}, which makes the agent CLI run a command outside Enclawed's checks`,
			grant
		});
	}
	return {
		ok: refusals.length === 0,
		refusals,
		granted
	};
}
/** The refusals in plain words, with the grant to add for each. */
function repositoryCommandsMessage(refusals) {
	return ["Not starting: the repository makes the agent CLI run commands that are not granted.", ...refusals.map((r) => `  - ${r.entry.file} ${r.entry.key}: ${r.why}${r.grant ? `. Review it; to start anyway, an administrator adds exactly this entry to projectCommands: ${JSON.stringify(r.grant)} (a changed entry needs a new grant)` : ""}`)].join("\n");
}
const show = (v) => (JSON.stringify(v) ?? typeof v).slice(0, 40);
function numberProblem(v, checks) {
	if (typeof v !== "number" || !Number.isFinite(v)) return checks.some(([m]) => m === "int") ? "an integer" : "a finite number";
	for (const [m, a] of checks) {
		const n = typeof a === "number" ? a : NaN;
		if (!(m === "int" ? Number.isSafeInteger(v) : m === "positive" ? v > 0 : m === "nonnegative" ? v >= 0 : m === "min" || m === "gte" ? v >= n : m === "max" || m === "lte" ? v <= n : m === "gt" ? v > n : v < n)) return m === "int" ? "an integer" : m === "positive" ? "a number above 0" : m === "nonnegative" ? "a number of at least 0" : `a number with ${m}(${show(a)})`;
	}
	return null;
}
function stringProblem(v, checks) {
	if (typeof v !== "string") return "a string";
	for (const [m, a] of checks) if (!(m === "min" ? typeof a === "number" && v.length >= a : m === "max" ? typeof a === "number" && v.length <= a : typeof a === "string" && v.startsWith(a))) return `a string with ${m}(${show(a)})`;
	return null;
}
/** Problems with `value` at `at` against `node`; empty when the host loads it. */
function checkSettingsValue(node, value, at, host, problems = []) {
	if (node.caught) return problems;
	const bad = (want) => problems.push(`${at} must be ${want} (${host} drops the whole file otherwise), not ${show(value)}`);
	switch (node.t) {
		case "string": {
			const w = stringProblem(value, node.checks ?? []);
			if (w) bad(w);
			break;
		}
		case "number": {
			const w = numberProblem(value, node.checks ?? []);
			if (w) bad(w);
			break;
		}
		case "boolean":
			if (typeof value !== "boolean") bad("true or false");
			break;
		case "literal":
			if (value !== node.v) bad(show(node.v));
			break;
		case "enum":
			if (!node.values.includes(value)) bad(`one of ${node.values.map(show).join(", ")}`);
			break;
		case "array":
			if (!Array.isArray(value)) bad("an array");
			else value.forEach((x, i) => checkSettingsValue(node.of, x, `${at}[${i}]`, host, problems));
			break;
		case "object":
			if (!isObject$1(value)) {
				bad("an object");
				break;
			}
			for (const [k, x] of Object.entries(value)) {
				const sub = Object.hasOwn(node.shape, k) ? node.shape[k] : null;
				if (!sub) problems.push(`${at}.${k} is not a key ${host} defines here, so it cannot be checked before merging`);
				else checkSettingsValue(sub, x, `${at}.${k}`, host, problems);
			}
			for (const [k, sub] of Object.entries(node.shape)) if (value[k] === void 0 && !sub.optional && !sub.caught && sub.t !== "unchecked") problems.push(`${at}.${k} is required`);
			break;
		case "record":
			if (!isObject$1(value)) {
				bad("an object");
				break;
			}
			for (const [k, x] of Object.entries(value)) {
				checkSettingsValue(node.key, k, `${at} key ${JSON.stringify(k)}`, host, problems);
				checkSettingsValue(node.value, x, `${at}.${k}`, host, problems);
			}
			break;
		case "union":
			if (!node.of.some((b) => checkSettingsValue(b, value, at, host, []).length === 0)) bad("a value of one of the accepted forms");
			break;
		default: problems.push(`${at}: this value cannot be checked against ${host}'s schema (${node.why ?? "unchecked"}), so it is not merged`);
	}
	return problems;
}
/**
* Check a whole settings document the adapter merges into the file that
* carries Enclawed's hooks: every key must be one the schema defines and
* every value must pass it. An empty list: the host loads it.
*/
function checkSettingsDocument(doc, keys, host) {
	if (!isObject$1(doc)) return ["the settings document must be an object"];
	const problems = [];
	for (const [k, v] of Object.entries(doc)) {
		const node = keys.get(k);
		if (!node) {
			problems.push(`${k} is not a key that can be checked against ${host}'s schema before merging`);
			continue;
		}
		checkSettingsValue(node, v, k, host, problems);
	}
	return problems;
}
/** A key named like a program to run (apiKeyHelper, awsAuthRefresh, awsCredentialExport, processWrapper, ...). */
const COMMAND_NAME = /(Helpers?|Refresh|Export|Wrapper|Commands?)$/;
/**
* Every settings path whose value makes the host run a command: keys named
* like a helper program (unless their value cannot hold a command line), and
* every object in a definition that has a `command` field. `hooks` is decided
* on its own (decideHooks). Keys the adapter could not turn into a node are
* passed as `unparsed` with their definition text and counted when they look
* like either.
*/
function commandPathsOf(keys, unparsed = {}) {
	const out = /* @__PURE__ */ new Set();
	const walk = (node, at) => {
		if (node.t === "object") {
			if (Object.hasOwn(node.shape, "command")) out.add(at);
			for (const [k, sub] of Object.entries(node.shape)) walk(sub, `${at}.${k}`);
		} else if (node.t === "union") for (const b of node.of) walk(b, at);
		else if (node.t === "array") walk(node.of, at);
		else if (node.t === "record") walk(node.value, at);
	};
	for (const [k, node] of keys) {
		if (k === "hooks") continue;
		if (COMMAND_NAME.test(k) && ![
			"boolean",
			"number",
			"enum",
			"literal"
		].includes(node.t)) out.add(k);
		walk(node, k);
	}
	for (const [k, text] of Object.entries(unparsed)) if (k !== "hooks" && (COMMAND_NAME.test(k) || /[{,]command:/.test(text))) out.add(k);
	return [...out].toSorted();
}
//#endregion
//#region src/enclawed/adapter/policy-layers.ts
const DEFAULT_ADAPTER_OPTIONS = Object.freeze({
	inputCleaner: "on",
	eraseCredentialsOnHalt: true,
	unlockMinutes: 10,
	authMethod: null,
	skills: Object.freeze({
		unverified: "refuse",
		bundled: "off"
	}),
	connectors: [],
	overwritablePaths: [],
	workflows: {},
	projectWorkflows: {},
	flavor: null
});
const CLEANER_MODES = [
	"on",
	"audit",
	"off"
];
const AUTH_METHODS = ["auto", "fido2"];
/** Methods whose secret or key lives on the host: they no longer count as a second factor. */
const RETIRED_AUTH_METHODS = new Set([
	"windows-hello",
	"macos",
	"sudo",
	"passphrase"
]);
function isObject(v) {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}
/** An overwritable path entry: not empty, not a root, no ".." segment. */
function badOverwritable(e) {
	if (typeof e !== "string" || e.trim() === "" || e.includes("\0")) return true;
	if (e.split(/[\\/]+/).includes("..")) return true;
	const r = path.resolve("/x", e);
	return r === "/x" || path.parse(r).root === r;
}
/** Parse the adapter's options block; throws on anything not as documented. */
function parseAdapterOptions(block, o) {
	const eraseKey = o.eraseKey ?? "eraseCredentials";
	const connectorsKey = o.connectorsKey ?? "connectors";
	const at = (k) => `${o.block}.${k}`;
	if (block === void 0) return DEFAULT_ADAPTER_OPTIONS;
	if (!isObject(block)) throw new Error(`the top-level ${o.block} block must be an object`);
	const known = new Set([
		"onHardwareHalt",
		"auth",
		"inputCleaner",
		"workflows",
		"projectWorkflows",
		"skills",
		connectorsKey,
		"overwritablePaths",
		"flavor"
	]);
	for (const k of Object.keys(block)) if (!known.has(k)) throw new Error(`unknown key ${at(k)}`);
	let flavor = null;
	if (block.flavor !== void 0) {
		if (!o.managed) throw new Error(`${at("flavor")} is set only by the organization's managed policy (root-owned); remove it from this file`);
		if (block.flavor !== "open" && block.flavor !== "enclaved") throw new Error(`${at("flavor")} must be exactly one of open, enclaved`);
		flavor = block.flavor;
	}
	const wf = parseWorkflowOptions(block);
	let connectors = [];
	const c = block[connectorsKey];
	if (c !== void 0) {
		if (!Array.isArray(c) || c.some((t) => typeof t !== "string" || (o.connectorPattern ? !o.connectorPattern.test(t) : t === ""))) throw new Error(`${at(connectorsKey)} must be a list of the host's connector tool names`);
		connectors = [...c];
	}
	let overwritablePaths = [];
	const ow = block.overwritablePaths;
	if (ow !== void 0) {
		if (!Array.isArray(ow) || ow.some(badOverwritable)) throw new Error(`${at("overwritablePaths")} must be a list of paths (absolute, or relative to the project); "", ".", a filesystem root and ".." segments are refused`);
		overwritablePaths = [...ow];
	}
	const skills = { ...DEFAULT_ADAPTER_OPTIONS.skills };
	if (block.skills !== void 0) {
		if (!isObject(block.skills)) throw new Error(`${at("skills")} must be an object`);
		for (const [k, v] of Object.entries(block.skills)) if (k === "unverified") {
			if (v !== "refuse" && v !== "exclude") throw new Error(`${at("skills.unverified")} must be one of refuse, exclude`);
			skills.unverified = v;
		} else if (k === "bundled") {
			if (v !== "off" && v !== "on") throw new Error(`${at("skills.bundled")} must be one of off, on`);
			skills.bundled = v;
		} else throw new Error(`unknown key ${at(`skills.${k}`)}`);
	}
	let inputCleaner = DEFAULT_ADAPTER_OPTIONS.inputCleaner;
	if (block.inputCleaner !== void 0) {
		const m = CLEANER_MODES.find((x) => x === block.inputCleaner);
		if (!m) throw new Error(`${at("inputCleaner")} must be one of ${CLEANER_MODES.join(", ")}`);
		inputCleaner = m;
	}
	let eraseCredentialsOnHalt = DEFAULT_ADAPTER_OPTIONS.eraseCredentialsOnHalt;
	const h = block.onHardwareHalt;
	if (h !== void 0) {
		if (!isObject(h)) throw new Error(`${at("onHardwareHalt")} must be an object`);
		for (const [k, v] of Object.entries(h)) {
			if (k !== eraseKey) throw new Error(`unknown key ${at(`onHardwareHalt.${k}`)}`);
			if (typeof v !== "boolean") throw new Error(`${at(`onHardwareHalt.${eraseKey}`)} must be true or false`);
			eraseCredentialsOnHalt = v;
		}
	}
	let unlockMinutes = DEFAULT_ADAPTER_OPTIONS.unlockMinutes;
	let authMethod = null;
	const a = block.auth;
	if (a !== void 0) {
		if (!isObject(a)) throw new Error(`${at("auth")} must be an object`);
		for (const [k, v] of Object.entries(a)) if (k === "method") {
			if (typeof v === "string" && RETIRED_AUTH_METHODS.has(v)) throw new Error(`${at("auth.method")} "${v}" no longer satisfies two-factor authentication (its secret or key lives on this computer); use "fido2" and enroll a security key`);
			const m = AUTH_METHODS.find((x) => x === v);
			if (!m) throw new Error(`${at("auth.method")} must be one of ${AUTH_METHODS.join(", ")}`);
			authMethod = m;
		} else if (k === "required") {
			if (v !== true) throw new Error(`${at("auth.required")} can only be true: two-factor authentication is mandatory`);
		} else if (k === "unlockMinutes") {
			if (!(typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 480)) throw new Error(`${at("auth.unlockMinutes")} must be a whole number of minutes from 1 to 480`);
			unlockMinutes = v;
		} else throw new Error(`unknown key ${at(`auth.${k}`)}`);
	}
	return {
		inputCleaner,
		eraseCredentialsOnHalt,
		unlockMinutes,
		authMethod,
		skills,
		connectors,
		overwritablePaths,
		workflows: wf.workflows,
		projectWorkflows: wf.projectWorkflows,
		flavor
	};
}
const CLEANER_RANK = {
	off: 0,
	audit: 1,
	on: 2
};
/**
* Tighten-only layering of the user's options over the base's. `set`: which
* of the user's options the user's block actually set (an unset one keeps
* the base's).
*/
function tightenAdapterOptions(base, user, set, o = {}) {
	const b = o.block ?? "options";
	const refused = [];
	let inputCleaner = base.inputCleaner;
	if (set.has("inputCleaner")) if (CLEANER_RANK[user.inputCleaner] < CLEANER_RANK[base.inputCleaner]) refused.push(`${b}.inputCleaner=${user.inputCleaner}`);
	else inputCleaner = user.inputCleaner;
	let eraseCredentialsOnHalt = base.eraseCredentialsOnHalt;
	if (set.has("eraseCredentialsOnHalt")) if (base.eraseCredentialsOnHalt && !user.eraseCredentialsOnHalt) refused.push(`${b}.onHardwareHalt (credential erase off)`);
	else eraseCredentialsOnHalt = user.eraseCredentialsOnHalt;
	let unlockMinutes = base.unlockMinutes;
	if (set.has("unlockMinutes")) if (user.unlockMinutes > base.unlockMinutes) refused.push(`${b}.auth.unlockMinutes=${user.unlockMinutes} (base ${base.unlockMinutes})`);
	else unlockMinutes = user.unlockMinutes;
	const authMethod = set.has("authMethod") ? user.authMethod : base.authMethod;
	const skills = { ...base.skills };
	if (set.has("skills.unverified")) skills.unverified = user.skills.unverified;
	if (set.has("skills.bundled")) if (user.skills.bundled === "on" && base.skills.bundled === "off") refused.push(`${b}.skills.bundled="on"`);
	else skills.bundled = user.skills.bundled;
	const narrow = (key) => {
		if (!set.has(key)) return base[key];
		const allowed = new Set(base[key]);
		return user[key].filter((v) => {
			if (allowed.has(v)) return true;
			refused.push(`${b}.${key} += ${JSON.stringify(v)}`);
			return false;
		});
	};
	const connectors = narrow("connectors");
	const overwritablePaths = o.userLists && set.has("overwritablePaths") ? [...user.overwritablePaths] : narrow("overwritablePaths");
	const workflows = { ...base.workflows };
	for (const [name, prof] of Object.entries(user.workflows)) if (Object.hasOwn(base.workflows, name)) refused.push(`${b}.workflows.${name} (replaces the organization's profile)`);
	else workflows[name] = prof;
	const projectWorkflows = { ...base.projectWorkflows };
	for (const [dir, name] of Object.entries(user.projectWorkflows)) if (Object.hasOwn(base.projectWorkflows, dir) && base.projectWorkflows[dir] !== name) refused.push(`${b}.projectWorkflows[${JSON.stringify(dir)}] (bound by the organization)`);
	else projectWorkflows[dir] = name;
	return {
		options: {
			inputCleaner,
			eraseCredentialsOnHalt,
			unlockMinutes,
			authMethod,
			skills,
			connectors,
			overwritablePaths,
			workflows,
			projectWorkflows,
			flavor: base.flavor
		},
		refused
	};
}
/** Which kit options a raw options block sets. */
function optionsSet(block, names) {
	const s = /* @__PURE__ */ new Set();
	if (!isObject(block)) return s;
	const eraseKey = names.eraseKey ?? "eraseCredentials";
	if (block.inputCleaner !== void 0) s.add("inputCleaner");
	if (isObject(block.onHardwareHalt) && block.onHardwareHalt[eraseKey] !== void 0) s.add("eraseCredentialsOnHalt");
	if (isObject(block.auth) && block.auth.unlockMinutes !== void 0) s.add("unlockMinutes");
	if (isObject(block.auth) && block.auth.method !== void 0) s.add("authMethod");
	if (isObject(block.skills) && block.skills.unverified !== void 0) s.add("skills.unverified");
	if (isObject(block.skills) && block.skills.bundled !== void 0) s.add("skills.bundled");
	if (block[names.connectorsKey ?? "connectors"] !== void 0) s.add("connectors");
	if (block.overwritablePaths !== void 0) s.add("overwritablePaths");
	if (block.workflows !== void 0) s.add("workflows");
	if (block.projectWorkflows !== void 0) s.add("projectWorkflows");
	return s;
}
const ALLOWLISTS = [
	"allowedChannels",
	"allowedProviders",
	"allowedTools",
	"allowedHosts"
];
function flavorDefault(flavor) {
	return flavor === "enclaved" ? defaultEnclavedPolicy() : defaultOpenPolicy();
}
/**
* The bounds of a policy's history limits (internal constants, never
* settings): maxAgeDays a whole number of days from 7 to 365 (the framework's
* own floor and ceiling), maxFileBytes up to 256 MiB, maxTotalBytes up to
* 64 GiB. A value outside them refuses the policy: a huge cap would let one
* write fill the disk with history, a tiny one would make every write
* irreversible.
*/
const HISTORY_LIMIT_BOUNDS = Object.freeze({
	maxAgeDays: Object.freeze({
		min: 7,
		max: 365,
		unit: "days"
	}),
	maxFileBytes: Object.freeze({
		min: 1,
		max: 256 * 1024 * 1024,
		unit: "bytes"
	}),
	maxTotalBytes: Object.freeze({
		min: 1,
		max: 64 * 1024 * 1024 * 1024,
		unit: "bytes"
	})
});
/** Throw when a history block's limits are outside HISTORY_LIMIT_BOUNDS. `where` names it in the message. */
function checkHistoryLimits(history, where = "enclawed.policy.history") {
	if (!isObject(history)) return;
	for (const [k, b] of Object.entries(HISTORY_LIMIT_BOUNDS)) {
		const v = history[k];
		if (v !== void 0 && !(Number.isSafeInteger(v) && v >= b.min && v <= b.max)) throw new Error(`${where}.${k} must be a whole number of ${b.unit} from ${b.min} to ${b.max}`);
	}
}
function parseOver(base, block) {
	if (isObject(block)) checkHistoryLimits(block.history);
	return parsePolicyJson(block, {
		maxOutputClearance: base.maxOutputClearance,
		defaultDataLabel: base.defaultDataLabel,
		enforceAllowlists: base.enforceAllowlists
	});
}
/** A policy document's `enclawed.policy` block over the flavor's default (history limits bounded). */
function parsePolicyDocument(doc, flavor) {
	return parseOver(flavorDefault(flavor), extractPolicyBlock(doc));
}
/**
* The user's `enclawed.policy` block over an authoritative base, tighten-only
* (the framework's tightenPolicy). `userAllowlists`: the base is the enclaved
* flavor default with no managed policy, so the user's allowlists are taken
* as written; everything else stays tighten-only and enforcement stays on.
*/
function layerUserPolicy(base, userBlock, o = {}) {
	if (userBlock === void 0 || userBlock === null) return {
		policy: base,
		refused: []
	};
	if (isObject(userBlock)) checkHistoryLimits(userBlock.history);
	if (!o.userAllowlists) return tightenPolicy(base, userBlock);
	if (!isObject(userBlock)) throw new TypeError("enclawed.policy must be an object");
	const user = parseOver(base, userBlock);
	const rest = { ...userBlock };
	for (const k of ALLOWLISTS) delete rest[k];
	const t = tightenPolicy(base, rest);
	const p = t.policy;
	const pick = (k) => userBlock[k] === void 0 ? p[k] : user[k];
	return {
		policy: createPolicy({
			enforceAllowlists: true,
			allowedChannels: pick("allowedChannels"),
			allowedProviders: pick("allowedProviders"),
			allowedTools: pick("allowedTools"),
			allowedHosts: pick("allowedHosts"),
			commandNetwork: p.commandNetwork,
			preApprovedIrreversibleTools: p.preApprovedIrreversibleTools,
			scratchPaths: p.scratchPaths,
			history: p.history,
			maxOutputClearance: p.maxOutputClearance,
			defaultDataLabel: p.defaultDataLabel
		}),
		refused: t.refused
	};
}
/** Read the options block of a policy document (the adapter's block name, and a legacy one if it has one). */
function optionsBlockOf(doc, names) {
	if (!isObject(doc)) return;
	const present = names.filter((n) => Object.hasOwn(doc, n));
	if (present.length > 1) throw new Error(`the policy file has more than one options block (${present.join(", ")}); merge them into ${names[0]}`);
	return present.length ? doc[present[0]] : void 0;
}
/**
* The session's policy and options. `candidates`: "managed" (the
* organization's), then the user's files in order (the first that exists is
* read). `shellFlavor`: what the user's shell asks for (it can only raise the
* managed policy's). `sharedKinds`: candidate kinds shared with another
* program; in the open flavor a broken one falls back to the base instead of
* refusing the start. Throws (the start is refused) on an untrusted or
* invalid managed policy and on an invalid user policy.
*/
function layerPolicies(o) {
	const check = o.check ?? rootOwnedFileCheck();
	const blocks = [o.names.block, ...o.names.legacyBlocks ?? []];
	const managedPath = o.candidates.find((c) => c.kind === "managed")?.path ?? null;
	let managed = null;
	if (managedPath && lexists(managedPath)) {
		const c = check(managedPath);
		if (!c.ok) throw new Error(`the managed policy ${managedPath} cannot be trusted (${c.reason}); a policy file an unprivileged user could have written is not used, and the start is refused`);
		let doc;
		try {
			doc = JSON.parse(fs.readFileSync(managedPath, "utf8"));
		} catch (err) {
			throw new Error(`the managed policy ${managedPath} is not valid JSON: ${err.message}`, { cause: err });
		}
		try {
			managed = {
				doc,
				options: parseAdapterOptions(optionsBlockOf(doc, blocks), {
					...o.names,
					managed: true
				}),
				path: managedPath
			};
		} catch (err) {
			throw new Error(`the managed policy ${managedPath} is invalid: ${err.message}`, { cause: err });
		}
	}
	const flavor = stricterFlavor(managed?.options.flavor ?? "open", o.shellFlavor);
	let basePolicy = flavorDefault(flavor);
	if (managed) try {
		basePolicy = parseOver(basePolicy, extractPolicyBlock(managed.doc));
	} catch (err) {
		throw new Error(`the managed policy ${managed.path} is invalid: ${err.message}`, { cause: err });
	}
	const baseOptions = managed ? managed.options : DEFAULT_ADAPTER_OPTIONS;
	const baseSource = managed ? managed.path : `${flavor} default`;
	const base = {
		policy: basePolicy,
		options: baseOptions,
		flavor,
		refused: [],
		baseSource
	};
	const found = o.candidates.find((c) => c.kind !== "managed" && fs.existsSync(c.path));
	if (!found) return managed ? {
		...base,
		source: managed.path,
		kind: "managed",
		note: null
	} : {
		...base,
		source: `${flavor} default (no policy file)`,
		kind: null,
		note: null
	};
	const layered = managed !== null || flavor === "enclaved";
	const tolerant = (o.sharedKinds ?? []).includes(found.kind) && flavor !== "enclaved";
	const fallback = (note) => ({
		...base,
		source: managed ? managed.path : `${flavor} default`,
		kind: managed ? "managed" : found.kind,
		note
	});
	let raw;
	try {
		raw = fs.readFileSync(found.path, "utf8");
	} catch (err) {
		throw new Error(`cannot read the ${found.kind} policy ${found.path}: ${err.message}`, { cause: err });
	}
	let doc;
	try {
		doc = JSON.parse(raw);
	} catch (err) {
		if (!tolerant) throw new Error(`${found.path} is not valid JSON: ${err.message}`, { cause: err });
		return fallback(`${found.path} is not plain JSON; its enclawed.policy block was not read`);
	}
	try {
		const block = optionsBlockOf(doc, blocks);
		const userOptions = parseAdapterOptions(block, {
			...o.names,
			managed: false
		});
		const policyBlock = extractPolicyBlock(doc);
		if (!layered) return {
			policy: parseOver(basePolicy, policyBlock),
			options: userOptions,
			flavor,
			source: found.path,
			kind: found.kind,
			note: null,
			refused: [],
			baseSource
		};
		const p = layerUserPolicy(basePolicy, policyBlock, { userAllowlists: managed === null });
		const t = tightenAdapterOptions(baseOptions, userOptions, optionsSet(block, o.names), {
			userLists: managed === null,
			block: o.names.block
		});
		return {
			policy: p.policy,
			options: t.options,
			flavor,
			source: found.path,
			kind: found.kind,
			note: null,
			refused: [...p.refused, ...t.refused],
			baseSource
		};
	} catch (err) {
		if (!tolerant) throw new Error(`the policy in ${found.path} is invalid: ${err.message}`, { cause: err });
		return fallback(`ignoring invalid enclawed.policy in ${found.path}: ${err.message}`);
	}
}
function lexists(p) {
	try {
		fs.lstatSync(p);
		return true;
	} catch {
		return false;
	}
}
//#endregion
//#region src/enclawed/adapter/contained-launch.ts
/** Wrappers that are programs of their own (not shell builtins or keywords). */
const WRAPPER_PROGRAMS = new Set([
	"env",
	"nohup",
	"nice",
	"ionice",
	"stdbuf",
	"setsid",
	"xargs",
	"timeout",
	"chronic"
]);
/** Start an admitted MCP server contained, or refuse. `record`: the verified record's containment part. */
async function launchMcpServer(def, record, o) {
	const r = await containMcpServer({
		name: def.name,
		command: def.command,
		args: def.args,
		...def.env ? { env: def.env } : {},
		...typeof def.cwd === "string" && def.cwd !== "" ? { cwd: def.cwd } : {}
	}, record, {
		stateDir: o.stateDir,
		onEvent: o.onEvent
	});
	return r.ok ? {
		ok: true,
		containment: r.containment
	} : {
		ok: false,
		code: r.code,
		message: r.message
	};
}
/**
* Run one tools/call to a contained server: the call is in flight (the relay
* admits requests on its behalf, with the routing values its arguments
* supply) only while `run` runs. The containment serializes calls per
* server (runCall): two calls in flight at once could not be told apart, so
* the relay would refuse their requests (call-ambiguous).
*/
async function bracketMcpCall(containment, call, run) {
	return containment.runCall(call, run);
}
/** Shell builtins that are no program (the shell runs them itself; there is nothing to bind). */
const SHELL_ONLY_BUILTINS = new Set([
	"cd",
	"export",
	"unset",
	"set",
	"exit",
	"return",
	"shift",
	"source",
	".",
	":",
	"eval",
	"exec",
	"readonly",
	"local",
	"trap",
	"wait",
	"umask",
	"ulimit",
	"alias",
	"unalias",
	"type",
	"command",
	"hash",
	"getopts",
	"read",
	"times",
	"break",
	"continue"
]);
const TOOLCHAIN_PROGRAM = /^(?:\/usr\/bin|\/bin|\/usr\/sbin|\/sbin|\/usr\/local\/bin|\/usr\/local\/cuda[A-Za-z0-9._+-]*\/bin|\/opt\/[A-Za-z0-9._+-]+\/bin)\/[A-Za-z0-9._+-]+$/;
/**
* The programs a command line names (each simple command's program; shell builtins are the
* shell's). A here-document's body is not a list of commands unless a shell reads it
* (./shell-segments.ts); the substitutions of an unquoted one are.
*/
function programsOf(command) {
	const out = new Set(["sh"]);
	for (const seg of segments(command)) {
		const p = programOf(seg.words);
		const named = p ? seg.words.find((w) => TOOLCHAIN_PROGRAM.test(w) && path.basename(w) === p.prog) : void 0;
		const venvWord = p && !named && /^(?:python[0-9.]*|pytest|py\.test)$/.test(p.prog) ? seg.words.find((w) => w.includes("/") && path.basename(w) === p.prog) : void 0;
		if (named) out.add(path.resolve("/", named));
		else if (venvWord) out.add("python3");
		else if (p && /^[A-Za-z0-9._+-]+$/.test(p.prog) && !SHELL_ONLY_BUILTINS.has(p.prog)) out.add(p.prog);
		let w = [...seg.words];
		for (let guard = 0; guard < 8 && w.length; guard++) {
			while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) w = w.slice(1);
			const base = w.length ? w[0].slice(w[0].lastIndexOf("/") + 1) : "";
			if (!base || !Object.hasOwn(WRAPPERS$1, base)) break;
			if (WRAPPER_PROGRAMS.has(base)) out.add(base);
			w = w.slice(1);
			while (w.length && w[0].startsWith("-")) w = w.slice(1);
			w = w.slice(WRAPPERS$1[base]);
		}
	}
	return [...out];
}
/**
* A private copy of a verified skill to run a call from, under Enclawed's
* state directory (which the agent cannot write). The copy's content digest
* is computed after the copy and must equal the admitted one: whatever the
* skill's directory holds by now, what runs is exactly what was admitted
* (no window between the check and the run). Null with a reason otherwise.
*/
function snapshotSkill(run, stateDir) {
	let base;
	try {
		fs.mkdirSync(stateDir, {
			recursive: true,
			mode: 448
		});
		base = fs.mkdtempSync(path.join(stateDir, "skill-run-"));
	} catch (err) {
		return {
			ok: false,
			reason: `no place for the skill's copy: ${err.message}`
		};
	}
	const remove = () => fs.rmSync(base, {
		recursive: true,
		force: true
	});
	const dir = path.join(base, "skill");
	try {
		fs.cpSync(run.dir, dir, {
			recursive: true,
			dereference: false,
			verbatimSymlinks: true,
			errorOnExist: true,
			force: false
		});
	} catch (err) {
		remove();
		return {
			ok: false,
			reason: `the skill could not be copied: ${err.message}`
		};
	}
	const d = contentDigest(dir);
	if (d.problems.length || d.digest !== run.contentDigest) {
		remove();
		return {
			ok: false,
			reason: `the files of the skill ${run.name} are not the ones admitted at launch (${d.problems[0] ?? "content digest differs"})`
		};
	}
	return {
		ok: true,
		dir,
		remove
	};
}
/**
* The launcher's ScriptContainer: each request opens a containment (kept
* open until close(), so its relay serves the command) and answers with the
* command line that runs inside it.
*/
function scriptContainer(o) {
	const open = [];
	const snapshots = [];
	return {
		async contain(req) {
			if (req.dialect !== "posix") return {
				ok: false,
				code: "containment-unavailable",
				message: `Enclawed: ${req.label} was not run: only POSIX shell commands can be contained here`
			};
			const opts = {
				stateDir: o.stateDir,
				onEvent: o.onEvent
			};
			let r;
			if (req.kind === "skill") {
				const run = req.skill;
				if (!run) return {
					ok: false,
					code: "containment-declaration-invalid",
					message: `Enclawed: ${req.label} was not run: the call names no verified skill`
				};
				let destinations;
				try {
					destinations = run.egress.map((t) => egressTargetDestination(parseEgressTarget(t)));
				} catch (err) {
					return {
						ok: false,
						code: "containment-declaration-invalid",
						message: `Enclawed: ${req.label} was not run: ${err.message}`
					};
				}
				const snap = snapshotSkill(run, path.join(o.stateDir, "skill-runs"));
				if (!snap.ok) return {
					ok: false,
					code: "skill-changed",
					message: `Enclawed: ${req.label} was not run: ${snap.reason}`
				};
				const cwd = isInside(run.dir, req.cwd) ? path.join(snap.dir, path.relative(run.dir, req.cwd)) : req.cwd;
				r = await containSkillRun({
					label: req.label,
					skillDir: snap.dir,
					projectDir: req.projectDir,
					cwd,
					interpreter: run.interpreter,
					file: path.join(snap.dir, ...run.file.split("/")),
					args: run.args,
					caps: run.caps,
					destinations
				}, opts);
				if (!r.ok) {
					snap.remove();
					return {
						ok: false,
						code: r.code,
						message: r.message
					};
				}
				snapshots.push(() => snap.remove());
			} else if (req.kind === "package-install") {
				if (!req.tool) return {
					ok: false,
					code: "containment-declaration-invalid",
					message: `Enclawed: ${req.label} was not run: the install names no package manager`
				};
				r = await containPackageInstall({
					label: req.label,
					tool: req.tool,
					projectDir: req.projectDir,
					cwd: req.cwd,
					command: "sh",
					args: ["-c", req.command],
					programs: programsOf(req.command)
				}, opts);
			} else if (req.build) {
				if (req.code) return {
					ok: false,
					code: "containment-declaration-invalid",
					message: `Enclawed: ${req.label} was not run: a contained build carries no code pins`
				};
				r = await containProjectScript({
					label: req.label,
					kind: "project-script",
					projectDir: req.projectDir,
					cwd: req.cwd,
					command: "sh",
					args: ["-c", req.command],
					programs: programsOf(req.command),
					destinations: [],
					env: {
						npm_config_script_shell: "/bin/sh",
						npm_config_shell: "/bin/sh",
						npm_config_node_options: "",
						npm_config_call: "",
						npm_config_userconfig: "/.enclawed/code/no-user-npmrc",
						npm_config_globalconfig: "/.enclawed/code/no-global-npmrc"
					},
					gitHistoryReadOnly: true,
					...req.build.modeChanges?.length ? { modeChanges: req.build.modeChanges } : {},
					build: {
						masks: [...req.build.masks],
						gpu: o.buildGpu?.(req.projectDir) === true,
						...o.noGpuNotice ? { noGpuNotice: o.noGpuNotice } : {}
					}
				}, opts);
			} else r = await containProjectScript({
				label: req.label,
				kind: req.kind,
				projectDir: req.projectDir,
				cwd: req.cwd,
				command: "sh",
				args: ["-c", req.command],
				programs: programsOf(req.command),
				destinations: [...o.destinations ?? []],
				env: {
					npm_config_script_shell: "/bin/sh",
					npm_config_shell: "/bin/sh",
					npm_config_node_options: "",
					npm_config_call: "",
					npm_config_userconfig: "/.enclawed/code/no-user-npmrc",
					npm_config_globalconfig: "/.enclawed/code/no-global-npmrc"
				},
				...req.code ? { codePins: req.code.files } : {},
				...(req.code ? !req.code.gitRefsWritable : !programsOf(req.command).includes("git")) ? { gitHistoryReadOnly: true } : {},
				...req.code?.stdin?.length ? { stdinPins: req.code.stdin } : {},
				...req.code?.modeChanges?.length ? { modeChanges: req.code.modeChanges } : {},
				...req.code?.pythonVenv ? { pythonVenv: req.code.pythonVenv } : {},
				...req.code ? { readPins: [...req.code.files.map((f) => ({
					path: f.path,
					sha256: f.sha256
				})), ...req.code.reads ?? []] } : {},
				...req.code ? { shellTexts: [req.command, ...req.code.shellText ?? []] } : {}
			}, opts);
			if (!r.ok) return {
				ok: false,
				code: r.code,
				message: r.message
			};
			open.push(r.containment);
			return {
				ok: true,
				command: containedCommandLine(r.containment.env, r.containment.argv)
			};
		},
		approveRepoConfigWrite(p) {
			for (const c of open) try {
				c.approveRepoConfigWrite(p);
				return true;
			} catch {}
			return false;
		},
		async close() {
			await Promise.allSettled(open.splice(0).map((c) => c.close()));
			for (const remove of snapshots.splice(0)) remove();
		}
	};
}
/**
* The kit's LaunchContainment (the seam launchContained uses) for project
* scripts and installs the launcher itself starts. An MCP server is never
* launched through it: it needs its signed containment record
* (launchMcpServer).
*/
function enclawedLaunchContainment(o) {
	const children = [];
	return {
		children,
		available() {
			const s = containmentSupport();
			return s.ok ? {
				ok: true,
				reason: null
			} : {
				ok: false,
				reason: s.reason
			};
		},
		async launch(spec) {
			if (spec.kind === "mcp-server") return {
				ok: false,
				code: "mcp-server-not-contained",
				reason: `${spec.label} is not started: an MCP server starts only with the containment of its signed admission record`
			};
			const project = spec.roots.find((r) => r.mode === "rw")?.path ?? spec.cwd;
			const opts = {
				stateDir: o.stateDir,
				onEvent: o.onEvent
			};
			if (spec.kind === "package-install" && !spec.tool) return {
				ok: false,
				code: "containment-declaration-invalid",
				reason: `${spec.label} is not started: the install names no package manager`
			};
			const r = spec.kind === "package-install" ? await containPackageInstall({
				label: spec.label,
				tool: spec.tool ?? "",
				projectDir: project,
				cwd: spec.cwd,
				command: spec.argv[0] ?? "",
				args: spec.argv.slice(1),
				env: { ...spec.env }
			}, opts) : await containProjectScript({
				label: spec.label,
				kind: spec.kind,
				projectDir: project,
				cwd: spec.cwd,
				command: spec.argv[0] ?? "",
				args: spec.argv.slice(1),
				destinations: spec.egress.map((host) => ({
					host,
					port: 443,
					mode: "inspect"
				})),
				env: { ...spec.env }
			}, opts);
			if (!r.ok) return {
				ok: false,
				code: r.code,
				reason: r.message
			};
			const [cmd, ...args] = r.containment.argv;
			const child = spawn(cmd, args, {
				env: { ...r.containment.env },
				stdio: o.stdio ?? "inherit"
			});
			children.push(child);
			child.on("exit", () => void r.containment.close());
			return {
				ok: true,
				pid: child.pid ?? -1,
				async stop() {
					child.kill("SIGKILL");
					await r.containment.close();
				}
			};
		}
	};
}
/** The containment and relay codes an adapter's audit log records (closed set; anything else is "containment.event"). */
const CONTAINMENT_AUDIT_CODES = new Set([
	"containment-view-changed",
	"containment-original-restored",
	"containment-original-not-restored",
	"containment-install-cage",
	"containment-host-change",
	"dependency-code-changed",
	"containment-guard-stopped",
	"containment-repo-config-changed",
	"containment-repo-config-refused",
	"containment-repo-config-approved-write",
	"call-ambiguous",
	"no-call-in-flight",
	"upgrade-unsupported",
	"websocket-protocol-error",
	"websocket-extension-refused",
	"opaque-tls-name-mismatch",
	"opaque-tls-unreadable"
]);
const AUDIT_FIELDS = [
	"code",
	"message",
	"host",
	"port",
	"method",
	"path",
	"protocol",
	"status",
	"mode",
	"callIds",
	"frozen",
	"changed",
	"quarantined",
	"restore",
	"violations",
	"label",
	"paths",
	"added",
	"quarantined"
];
/**
* A containment event as an audit record: what the adapter appends to its
* log for every onEvent (the relay's allowed and refused requests, a host-side
* change frozen with its quarantine and restore, originals restored or not,
* a refused install). Only known fields are kept; values are as emitted.
*/
function containmentAuditOf(e) {
	const src = e;
	const payload = {};
	for (const k of AUDIT_FIELDS) if (src[k] !== void 0) payload[k] = src[k];
	const code = typeof src.code === "string" ? src.code : null;
	if (e.type === "egress-refused" || e.type === "egress-allowed") return {
		type: `containment.${e.type}`,
		payload
	};
	if (code && CONTAINMENT_AUDIT_CODES.has(code)) return {
		type: `containment.${code.replace(/^containment-/, "")}`,
		payload
	};
	return {
		type: `containment.${e.type === "refused" ? "refused" : "event"}`,
		payload: {
			kind: e.type,
			...payload
		}
	};
}
//#endregion
//#region src/enclawed/adapter/remote-auth.ts
var RemoteAuthError = class extends Error {
	constructor(code, message) {
		super(`Enclawed remote MCP: ${message}`);
		this.code = code;
		this.name = "RemoteAuthError";
	}
};
/** How long the person has to authorize in the browser. */
const AUTHORIZATION_WAIT_MS = 300 * 1e3;
/** An access token this close to its expiry is refreshed first. */
const EXPIRY_SKEW_MS = 3e4;
const MAX_BODY = 1024 * 1024;
const TOKEN = /^[\x21-\x7e]{1,8192}$/;
const keyOf = (url) => createHash("sha256").update(url).digest("hex").slice(0, 32);
const aad = (resource, origin, key) => Buffer.from(`enclawed.remote-credential.v2\n${resource}\n${origin}\n${key}`, "utf8");
function seal(rec, keys) {
	if (keys.write.key.every((b) => b === 0)) throw new RemoteAuthError("remote-credential-locked", "the credential store's key was forgotten");
	const iv = randomBytes(12);
	const c = createCipheriv("aes-256-gcm", keys.write.key, iv);
	c.setAAD(aad(rec.resource, rec.origin, keys.write.id));
	const data = Buffer.concat([c.update(JSON.stringify(rec), "utf8"), c.final()]);
	return {
		v: 2,
		resource: rec.resource,
		origin: rec.origin,
		key: keys.write.id,
		iv: iv.toString("base64"),
		tag: c.getAuthTag().toString("base64"),
		data: data.toString("base64")
	};
}
/**
* Enclawed's credential store for remote servers: `dir` is in the adapter's
* protected state (made 0700; each file 0600, written atomically); every
* record is sealed with `keys` (credentialStoreKeys: the device's, the OS
* keyring's or a key file's, never kept in `dir`). A file whose record names
* another server than the one asked for is refused; a record sealed with a
* key that is not available here is refused by name; a plaintext record from
* before is sealed when it is first read.
*/
function remoteCredentialStore(dir, keys, o = {}) {
	if (!keys?.write?.key || keys.write.key.length !== 32) throw new RemoteAuthError("remote-credential-locked", "the credential store has no key");
	const rel = path.relative(path.resolve(dir), keys.keyFile);
	if (!rel.startsWith("..") && !path.isAbsolute(rel)) throw new RemoteAuthError("remote-credential-locked", "the credential key file must not be kept with the records it seals");
	const file = (url) => path.join(dir, `${keyOf(url)}.json`);
	const write = (f, body) => {
		fs.mkdirSync(dir, {
			recursive: true,
			mode: 448
		});
		fs.chmodSync(dir, 448);
		const tmp = `${f}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(body), { mode: 384 });
		fs.renameSync(tmp, f);
	};
	let pending = Promise.resolve();
	let auditFailures = 0;
	const keyKindOf = (id) => {
		if (typeof id !== "string") return null;
		const f = deviceKeyIdForm(id);
		return f === "challenge" ? "device-challenge" : f === "key-derive" ? "device-key-derive" : id.split(":")[0] ?? null;
	};
	/** Audit a refusal (queued; `settled()` waits for it), then hand back the error to throw. */
	const refused = (server, err, reason, keyId = null) => {
		if (o.audit) {
			const record = {
				type: "auth.remote-credential.refused",
				payload: {
					origin: server.origin,
					code: err.code,
					reason,
					keyKind: keyKindOf(keyId)
				}
			};
			const audit = o.audit;
			pending = pending.then(() => audit(record)).then(() => void 0, () => {
				auditFailures++;
			});
		}
		return err;
	};
	const mismatch = (server) => refused(server, new RemoteAuthError("remote-credential-mismatch", `the stored credentials are not for ${server.origin}; they are not used`), "other-server");
	const store = {
		get(url) {
			const server = checkServerUrl(url);
			let raw;
			try {
				raw = JSON.parse(fs.readFileSync(file(server.href), "utf8"));
			} catch {
				return null;
			}
			if (raw?.resource !== server.href || raw?.origin !== server.origin) throw mismatch(server);
			if (raw.v === 1) {
				const rec = raw;
				store.set(url, rec);
				return rec;
			}
			const sealed = raw;
			if (sealed.v !== 2 || typeof sealed.key !== "string" || typeof sealed.iv !== "string" || typeof sealed.tag !== "string" || typeof sealed.data !== "string") throw mismatch(server);
			const key = keys.read(sealed.key);
			if (!key) {
				const legacy = deviceKeyIdForm(sealed.key) === "challenge" && keys.device?.derivation === "key-derive";
				throw refused(server, new RemoteAuthError("remote-credential-locked", legacy ? `the stored credentials of ${server.origin} are sealed under the Enclaweder's earlier (CHALLENGE-derived) key, which this device no longer gives (command set 0.5); log in to the server again` : `the stored credentials of ${server.origin} are sealed with a key that is not available here (${sealed.key.split(":")[0]}); bind that key's device or log in to the server again`), legacy ? "legacy-device-challenge" : "key-unavailable", sealed.key);
			}
			let rec;
			try {
				const d = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
				d.setAAD(aad(sealed.resource, sealed.origin, sealed.key));
				d.setAuthTag(Buffer.from(sealed.tag, "base64"));
				rec = JSON.parse(Buffer.concat([d.update(Buffer.from(sealed.data, "base64")), d.final()]).toString("utf8"));
			} catch {
				throw refused(server, new RemoteAuthError("remote-credential-mismatch", `the stored credentials of ${server.origin} do not open with their key (changed after they were stored); they are not used`), "does-not-open", sealed.key);
			}
			if (rec?.v !== 1 || rec.resource !== server.href || rec.origin !== server.origin) throw mismatch(server);
			if (sealed.key !== keys.write.id) write(file(server.href), seal(rec, keys));
			return rec;
		},
		set(url, rec) {
			const server = checkServerUrl(url);
			const f = file(server.href);
			if (rec === null) {
				fs.rmSync(f, { force: true });
				return;
			}
			if (rec.resource !== server.href || rec.origin !== server.origin) throw new RemoteAuthError("remote-credential-mismatch", "credentials are stored only under their own server");
			write(f, seal(rec, keys));
		},
		settled: async () => {
			await pending;
			if (auditFailures > 0) throw new RemoteAuthError("remote-credential-locked", `${auditFailures} refusal(s) of stored credentials could not be written to the audit log`);
		}
	};
	return store;
}
function postTo(url, body, contentType, connect, timeoutMs) {
	const host = url.hostname.replace(/^\[|\]$/g, "");
	const port = Number(url.port) || 443;
	const target = connect?.(host, port) ?? {
		host,
		port
	};
	return new Promise((resolve, reject) => {
		const req = https.request({
			host: target.host,
			port: target.port,
			method: "POST",
			path: `${url.pathname}${url.search}`,
			headers: {
				host: url.host,
				"content-type": contentType,
				accept: "application/json",
				"content-length": Buffer.byteLength(body)
			},
			servername: net.isIP(host) ? void 0 : host,
			...target.ca ? { ca: target.ca } : {},
			agent: false,
			timeout: timeoutMs
		});
		req.on("response", (res) => {
			if ((res.statusCode ?? 0) >= 300 && (res.statusCode ?? 0) < 400) {
				res.resume();
				reject(new RemoteMcpError("redirect-refused", `${url.origin} answered with a redirect; redirects are not followed`));
				return;
			}
			const chunks = [];
			let size = 0;
			res.on("data", (c) => {
				size += c.length;
				if (size > MAX_BODY) {
					res.destroy(/* @__PURE__ */ new Error("response too large"));
					return;
				}
				chunks.push(c);
			});
			res.on("end", () => resolve({
				status: res.statusCode ?? 0,
				text: Buffer.concat(chunks).toString("utf8")
			}));
			res.on("error", reject);
		});
		req.on("timeout", () => req.destroy(/* @__PURE__ */ new Error(`timed out after ${timeoutMs} ms`)));
		req.on("error", reject);
		req.end(body);
	});
}
function parseToken(status, text) {
	let t;
	try {
		t = JSON.parse(text);
	} catch {
		throw new RemoteAuthError("oauth-token-invalid", `the token endpoint answered HTTP ${status} without JSON`);
	}
	if (status !== 200) throw new RemoteAuthError("oauth-token-invalid", `the token endpoint refused: ${typeof t?.error === "string" ? t.error.slice(0, 80) : `HTTP ${status}`}`);
	if (typeof t.access_token !== "string" || !TOKEN.test(t.access_token)) throw new RemoteAuthError("oauth-token-invalid", "the token answer has no usable access_token");
	if (t.token_type !== void 0 && (typeof t.token_type !== "string" || t.token_type.toLowerCase() !== "bearer")) throw new RemoteAuthError("oauth-token-invalid", "the token is not a bearer token");
	if (t.refresh_token !== void 0 && (typeof t.refresh_token !== "string" || !TOKEN.test(t.refresh_token))) throw new RemoteAuthError("oauth-token-invalid", "the refresh token is malformed");
	return {
		accessToken: t.access_token,
		...typeof t.refresh_token === "string" ? { refreshToken: t.refresh_token } : {},
		...typeof t.expires_in === "number" && t.expires_in > 0 ? { expiresIn: t.expires_in } : {},
		...typeof t.scope === "string" ? { scope: t.scope.slice(0, 1e3) } : {}
	};
}
const sameText = (a, b) => {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
};
/** Is `uri` a loopback redirect (RFC 8252 7.3: http, 127.0.0.1 or [::1], any port)? */
function isLoopbackRedirect(uri) {
	try {
		const u = new URL(uri);
		return u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "[::1]") && !u.username && !u.password && u.hash === "";
	} catch {
		return false;
	}
}
/**
* The loopback listener the adapter opens for one authorization: 127.0.0.1,
* an ephemeral port, an unguessable path. It answers only GET on that path,
* takes one answer whose state is this authorization's, and closes.
*/
async function openLoopbackRedirect() {
	const callbackPath = `/callback/${randomBytes(12).toString("hex")}`;
	let pending = null;
	const server = http.createServer((req, res) => {
		const u = new URL(req.url ?? "/", "http://127.0.0.1");
		if (req.method !== "GET" || u.pathname !== callbackPath || !pending) {
			res.writeHead(404, { "content-type": "text/plain" }).end("not found\n");
			return;
		}
		const p = pending;
		if (!sameText(u.searchParams.get("state") ?? "", p.state)) {
			res.writeHead(400, { "content-type": "text/plain" }).end("unexpected state\n");
			return;
		}
		pending = null;
		const iss = u.searchParams.get("iss");
		const done = (status, text) => res.writeHead(status, { "content-type": "text/plain" }).end(`${text}\n`);
		if (iss !== null && iss.replace(/\/$/, "") !== p.issuer.replace(/\/$/, "")) {
			done(400, "the authorization answer came from another issuer; it was refused");
			p.reject(new RemoteAuthError("oauth-issuer-mismatch", `the answer names the issuer ${iss.slice(0, 200)}, not ${p.issuer}`));
			return;
		}
		const error = u.searchParams.get("error");
		const code = u.searchParams.get("code");
		if (error || !code || !TOKEN.test(code)) {
			done(400, "authorization was not granted");
			p.reject(new RemoteAuthError("oauth-denied", `authorization was not granted (${(error ?? "no code").slice(0, 80)})`));
			return;
		}
		done(200, "Authorization received. You can close this window.");
		p.resolve(code);
	});
	await new Promise((r) => server.listen(0, "127.0.0.1", () => r()));
	return {
		redirectUri: `http://127.0.0.1:${server.address().port}${callbackPath}`,
		wait(state, issuer, ms = AUTHORIZATION_WAIT_MS) {
			return new Promise((resolve, reject) => {
				const t = setTimeout(() => {
					pending = null;
					reject(new RemoteAuthError("oauth-timeout", "no authorization arrived in time"));
				}, ms);
				t.unref();
				pending = {
					state,
					issuer,
					resolve: (c) => {
						clearTimeout(t);
						resolve(c);
					},
					reject: (e) => {
						clearTimeout(t);
						reject(e);
					}
				};
			});
		},
		close() {
			server.close();
			server.closeAllConnections?.();
		}
	};
}
const refusal = (err) => ({
	ok: false,
	code: err instanceof RemoteAuthError || err instanceof RemoteMcpError ? err.code : "oauth-failed",
	message: err instanceof Error ? err.message : String(err)
});
async function registerClient(server, endpoints, extra, redirectUri, o) {
	if (!endpoints.registrationEndpoint) throw new RemoteAuthError("oauth-no-client", `${server.origin} offers no client registration, and the admission record names no client id; pin it again with the client id the service issued`);
	const ep = checkOAuthEndpoint(server, "registration_endpoint", endpoints.registrationEndpoint, extra);
	const r = await postTo(ep, JSON.stringify({
		client_name: o.clientName ?? "Enclawed",
		redirect_uris: [redirectUri],
		grant_types: ["authorization_code", "refresh_token"],
		response_types: ["code"],
		token_endpoint_auth_method: "none"
	}), "application/json", o.connect, o.timeoutMs ?? 3e4);
	let c = {};
	try {
		c = JSON.parse(r.text);
	} catch {}
	if (r.status !== 201 && r.status !== 200 || typeof c.client_id !== "string" || !TOKEN.test(c.client_id)) throw new RemoteAuthError("oauth-registration-failed", `client registration at ${ep.origin} failed (HTTP ${r.status})`);
	return {
		clientId: c.client_id,
		...typeof c.client_secret === "string" && TOKEN.test(c.client_secret) ? { clientSecret: c.client_secret } : {},
		redirectUri,
		registered: true
	};
}
/**
* Authorize the adapter for one admitted remote server, with a person: the
* URL is handed to `show`, the code comes back to the loopback listener, and
* the tokens go to the credential store (never returned).
*/
async function authorizeRemoteMcpServer(def, record, o) {
	let redirect = o.redirect ?? null;
	try {
		if (record.url !== def.url) return {
			ok: false,
			code: "mcp-remote-url-mismatch",
			message: `${def.name}: the definition's URL is not the admitted one`
		};
		const server = checkServerUrl(record.url);
		const extra = (record.authorizationOrigins ?? []).map((x) => checkServerUrl(x).origin);
		const current = remoteCredentials(def, record, {
			store: o.store,
			env: o.env ?? {}
		});
		const client = createRemoteMcpClient({
			url: record.url,
			transport: record.transport,
			...record.authorizationOrigins ? { authorizationOrigins: record.authorizationOrigins } : {},
			...o.connect ? { connect: o.connect } : {},
			...o.timeoutMs ? { timeoutMs: o.timeoutMs } : {},
			requestHeaders: () => current.headers()
		});
		let endpoints;
		try {
			await client.initialize();
			client.close();
			return {
				ok: true,
				action: "not-required",
				registered: false
			};
		} catch (err) {
			client.close();
			if (!(err instanceof RemoteMcpError) || err.code !== "oauth-required") throw err;
			endpoints = err.endpoints;
		}
		redirect ??= await openLoopbackRedirect();
		if (!isLoopbackRedirect(redirect.redirectUri)) throw new RemoteAuthError("oauth-redirect-not-loopback", "the redirect is not a loopback address");
		const prev = (() => {
			try {
				return o.store.get(record.url);
			} catch {
				return null;
			}
		})();
		const signed = record.oauth?.clientId;
		const clientInfo = signed ? {
			clientId: signed,
			registered: false
		} : prev?.client.registered && prev.issuer === endpoints.issuer && prev.client.redirectUri === redirect.redirectUri ? prev.client : await registerClient(server, endpoints, extra, redirect.redirectUri, o);
		const a = client.authorizationUrl(endpoints, {
			clientId: clientInfo.clientId,
			redirectUri: redirect.redirectUri,
			...record.oauth?.scope ? { scope: record.oauth.scope } : {}
		});
		await o.show(a.url);
		const code = await redirect.wait(a.state, endpoints.issuer, o.waitMs);
		const tokenEndpoint = checkOAuthEndpoint(server, "token_endpoint", endpoints.tokenEndpoint, extra);
		const r = await postTo(tokenEndpoint, new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: redirect.redirectUri,
			client_id: clientInfo.clientId,
			code_verifier: a.verifier,
			resource: server.href,
			...clientInfo.clientSecret ? { client_secret: clientInfo.clientSecret } : {}
		}).toString(), "application/x-www-form-urlencoded", o.connect, o.timeoutMs ?? 3e4);
		const t = parseToken(r.status, r.text);
		const now = (o.now ?? Date.now)();
		o.store.set(record.url, {
			v: 1,
			resource: server.href,
			origin: server.origin,
			issuer: endpoints.issuer,
			tokenEndpoint: tokenEndpoint.href,
			client: clientInfo,
			tokens: {
				accessToken: t.accessToken,
				...t.refreshToken ? { refreshToken: t.refreshToken } : {},
				expiresAt: t.expiresIn ? now + t.expiresIn * 1e3 : null,
				...t.scope ? { scope: t.scope } : {}
			}
		});
		return {
			ok: true,
			action: "authorized",
			registered: clientInfo.registered && !signed
		};
	} catch (err) {
		return refusal(err);
	} finally {
		if (!o.redirect) redirect?.close();
	}
}
const SECRET_HEADER = /^(authorization|proxy-authorization|cookie)$|api[-_]?key|token|secret|auth|password|session|credential|(^|-)key$/i;
/**
* A definition's header values with `${VAR}` / `${VAR:-default}` expanded
* from `env` (the host's syntax), and which of them are secrets.
*/
function remoteHeaders(def, env) {
	const raw = def.headers ?? {};
	if (typeof raw !== "object" || Array.isArray(raw)) throw new RemoteAuthError("mcp-remote-header-invalid", "the definition's headers are not an object");
	return Object.entries(raw).toSorted(([a], [b]) => a.localeCompare(b)).map(([name, v]) => {
		if (typeof v !== "string") throw new RemoteAuthError("mcp-remote-header-invalid", `the header ${JSON.stringify(name).slice(0, 80)} is not a string`);
		let fromEnv = false;
		const value = v.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (_m, n, dflt) => {
			const e = env[n];
			if (e !== void 0 && e !== "") {
				fromEnv = true;
				return e;
			}
			if (dflt !== void 0) return dflt;
			throw new RemoteAuthError("mcp-remote-header-unresolved", `the header ${name} names the variable ${n}, which is not set`);
		});
		return {
			name,
			value,
			secret: fromEnv || SECRET_HEADER.test(name) || credentialFindings(value).length > 0
		};
	});
}
/**
* The credentials a connection to one admitted remote server sends: the
* definition's headers (secret values as handles) and the stored OAuth
* access token, refreshed when it expires. Throws a RemoteAuthError (closed
* code) for a header that cannot be sent.
*/
function remoteCredentials(def, record, o = {}) {
	const server = checkServerUrl(record.url);
	const extra = (record.authorizationOrigins ?? []).map((x) => checkServerUrl(x).origin);
	const now = o.now ?? Date.now;
	const fixed = remoteHeaders(def, o.env ?? {});
	const hasAuthorization = fixed.some((h) => h.name.toLowerCase() === "authorization");
	const host = server.hostname.replace(/^\[|\]$/g, "").toLowerCase();
	const stored = () => o.store ? o.store.get(record.url) : null;
	const refresh = async (force = false) => {
		const rec = stored();
		const t = rec?.tokens;
		if (!rec || !t) return false;
		const expired = t.expiresAt !== null && t.expiresAt - EXPIRY_SKEW_MS <= now();
		if (!force && !expired) return true;
		if (!t.refreshToken) return false;
		const ep = checkOAuthEndpoint(server, "token_endpoint", rec.tokenEndpoint, extra);
		const form = new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: t.refreshToken,
			client_id: rec.client.clientId,
			resource: server.href,
			...rec.client.clientSecret ? { client_secret: rec.client.clientSecret } : {}
		});
		let a;
		try {
			const r = await postTo(ep, form.toString(), "application/x-www-form-urlencoded", o.connect, o.timeoutMs ?? 3e4);
			a = parseToken(r.status, r.text);
		} catch (err) {
			if (err instanceof RemoteAuthError) o.store?.set(record.url, {
				...rec,
				tokens: null
			});
			return false;
		}
		o.store?.set(record.url, {
			...rec,
			tokens: {
				accessToken: a.accessToken,
				refreshToken: a.refreshToken ?? t.refreshToken,
				expiresAt: a.expiresIn ? now() + a.expiresIn * 1e3 : null,
				...a.scope ? { scope: a.scope } : {}
			}
		});
		return true;
	};
	return {
		origin: server.origin,
		headers() {
			const out = {};
			for (const h of fixed) out[h.name] = h.value;
			const t = hasAuthorization ? null : stored()?.tokens;
			if (t) out.Authorization = `Bearer ${t.accessToken}`;
			return out;
		},
		refresh,
		handles() {
			const t = stored()?.tokens;
			return [...fixed.filter((h) => h.secret).flatMap((h) => {
				const bare = /^authorization$/i.test(h.name) ? h.value.replace(/^\S+\s+/, "") : h.value;
				return [h.value, ...bare !== h.value ? [bare] : []].map((value) => ({
					name: `mcp-header:${def.name}:${h.name}`,
					value,
					destinations: [host]
				}));
			}), ...t ? [{
				name: `mcp-oauth:${def.name}:access`,
				value: t.accessToken,
				destinations: [host]
			}, ...t.refreshToken ? [{
				name: `mcp-oauth:${def.name}:refresh`,
				value: t.refreshToken,
				destinations: [host]
			}] : []] : []];
		}
	};
}
//#endregion
//#region src/enclawed/adapter/managed-login-policy.ts
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
/** The document an administrator installs: exactly the pins, nothing else. */
function managedLoginPolicyDocument(spec) {
	const env = { [spec.storageDirVar]: spec.storageDir };
	for (const [k, v] of Object.entries(spec.envPins ?? {}).toSorted(([a], [b]) => a < b ? -1 : 1)) env[k] = v;
	return {
		[spec.orgPinKey]: [],
		[spec.envKey]: env
	};
}
/** The bytes written for the document (stable: the same spec gives the same bytes). */
function managedLoginPolicyText(spec) {
	return `${JSON.stringify(managedLoginPolicyDocument(spec), null, 2)}\n`;
}
/** Owner and mode rules for the pinned directory and each ancestor. */
function adminOnlyEmptyDirProblem(dir, trustedUids = [0]) {
	const abs = path.resolve(dir);
	let st;
	try {
		st = fs.lstatSync(abs);
	} catch (err) {
		return `${abs}: ${err.code ?? "unreadable"}`;
	}
	if (st.isSymbolicLink()) return `${abs} is a symlink`;
	if (!st.isDirectory()) return `${abs} is not a directory`;
	if (!trustedUids.includes(st.uid)) return `${abs} is owned by uid ${st.uid}, not an administrator`;
	if ((st.mode & 18) !== 0) return `${abs} is writable by group or other users (mode ${(st.mode & 4095).toString(8)})`;
	let entries;
	try {
		entries = fs.readdirSync(abs);
	} catch (err) {
		return `${abs}: ${err.code ?? "unreadable"}`;
	}
	if (entries.length > 0) return `${abs} is not empty (${entries.toSorted().slice(0, 3).join(", ")})`;
	for (let d = path.dirname(abs);; d = path.dirname(d)) {
		let ds;
		try {
			ds = fs.lstatSync(d);
		} catch (err) {
			return `${d}: ${err.code ?? "unreadable"}`;
		}
		if (ds.isSymbolicLink() || !ds.isDirectory()) return `${d} is not a real directory`;
		if (!trustedUids.includes(ds.uid) && ds.uid !== 0) return `${d} is owned by uid ${ds.uid}, not an administrator`;
		if ((ds.mode & 18) !== 0 && (ds.mode & 512) === 0) return `${d} is writable by group or other users`;
		if (d === path.dirname(d)) return null;
	}
}
/**
* Are the pins in force in the documents the host reads? `policyFile`: the
* file the adapter installs (checked with `fileCheck`, the administrator-file
* rule); `dirProblem`: the pinned directory's check (default
* adminOnlyEmptyDirProblem with uid 0; a test passes its stand-in for root).
*/
function managedLoginPolicyStatus(docs, spec, o) {
	const files = docs.map((d) => d.file);
	const no = (code, reason, file) => ({
		installed: false,
		code,
		reason,
		files,
		...file ? { file } : {}
	});
	if (docs.length === 0) return no("no-managed-settings", "no managed settings document");
	const bad = docs.find((d) => d.invalid || !isObj(d.doc));
	if (bad) return no("invalid-document", `${bad.file} is not a JSON object`, bad.file);
	let emptyPin = null;
	for (const d of docs) {
		const doc = d.doc;
		if (!(spec.orgPinKey in doc)) continue;
		const v = doc[spec.orgPinKey];
		if (Array.isArray(v) && v.length === 0) {
			emptyPin ??= d.file;
			continue;
		}
		return no("org-pin-widened", `${d.file} sets ${spec.orgPinKey} to ${JSON.stringify(v)}, which admits sign-ins`, d.file);
	}
	if (!emptyPin) return no("org-pin-missing", `no managed document sets ${spec.orgPinKey} to []`);
	const pins = {
		[spec.storageDirVar]: spec.storageDir,
		...spec.envPins
	};
	for (const [name, want] of Object.entries(pins).toSorted(([a], [b]) => a < b ? -1 : 1)) {
		let found = false;
		for (const d of docs) {
			const env = d.doc[spec.envKey];
			if (env === void 0) continue;
			if (!isObj(env)) return no("invalid-document", `${d.file}: ${spec.envKey} is not an object`, d.file);
			if (!(name in env)) continue;
			if (env[name] !== want) return no("env-pin-overridden", `${d.file} sets ${spec.envKey}.${name} to ${JSON.stringify(env[name])}, not ${JSON.stringify(want)}`, d.file);
			found = true;
		}
		if (!found) return no("env-pin-missing", `no managed document sets ${spec.envKey}.${name} to ${JSON.stringify(want)}`);
	}
	if (!files.includes(o.policyFile)) return no("policy-file-untrusted", `${o.policyFile} is not among the documents the host reads`, o.policyFile);
	const fc = o.fileCheck(o.policyFile);
	if (!fc.ok) return no("policy-file-untrusted", `${o.policyFile}: ${fc.reason}`, o.policyFile);
	const dp = (o.dirProblem ?? ((d) => adminOnlyEmptyDirProblem(d)))(spec.storageDir);
	if (dp) return no("storage-dir-unsafe", dp);
	return {
		installed: true,
		code: "installed",
		reason: `${spec.orgPinKey} admits no organization and the host's login directory is pinned to ${spec.storageDir}`,
		files
	};
}
/** Install, planned: write only what differs (idempotent). */
function planManagedLoginPolicy(spec, o) {
	const text = managedLoginPolicyText(spec);
	let current = null;
	try {
		current = fs.readFileSync(o.policyFile, "utf8");
	} catch {
		current = null;
	}
	return {
		file: current === text ? "none" : "write",
		dir: fs.existsSync(spec.storageDir) ? "none" : "create",
		text
	};
}
//#endregion
//#region src/enclawed/adapter/host-credential-watch.ts
/**
* How long after a plaintext login appears it is sealed or quarantined (the watcher's bound),
* counted while the watcher runs: a directory event triggers a pass at once and a fixed poll
* covers a missed event, so the bound holds within 1 s of the watcher being scheduled. A starved
* process takes it when it next runs; an adapter's launch precheck takes or refuses a plaintext
* login before any launch, so no session starts with one present.
*/
const CREDENTIAL_WATCH_BOUND_MS = 1e3;
/** The watcher's poll interval (beside file-system events). */
const POLL_MS = 250;
/** The largest credential file taken (a login is a few hundred bytes). */
const MAX_BYTES = 1024 * 1024;
/** The suffix of a file moved aside and not yet finished. */
const HELD_MARK = ".enclawed-held.";
/** What is at the host's credential paths now (empty files are not a login). */
function findHostCredentials(spec) {
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	const add = (file, kind) => {
		if (!seen.has(file)) {
			seen.add(file);
			out.push({
				file,
				kind
			});
		}
	};
	for (const file of [...new Set(spec.files)].toSorted()) {
		let st = null;
		try {
			st = fs.lstatSync(file);
		} catch {
			st = null;
		}
		if (st?.isSymbolicLink()) add(file, "link");
		else if (st?.isFile() && st.size > 0) add(file, "file");
		const dir = path.dirname(file);
		const base = path.basename(file);
		let names = [];
		try {
			names = fs.readdirSync(dir).toSorted();
		} catch {
			names = [];
		}
		for (const n of names) {
			const kind = n.startsWith(`${base}.enclawed-held.`) ? "held" : (spec.transientSuffixes ?? []).some((s) => n.startsWith(`${base}${s}`)) ? "transient" : null;
			if (!kind) continue;
			const p = path.join(dir, n);
			try {
				const s = fs.lstatSync(p);
				if (s.isSymbolicLink() || s.isFile() && s.size > 0) add(p, s.isSymbolicLink() ? "link" : kind);
			} catch {}
		}
	}
	return out;
}
/** The pending directory: made 0700, a real directory owned by this user. */
function pendingDirProblem(dir) {
	try {
		fs.mkdirSync(dir, {
			recursive: true,
			mode: 448
		});
		const st = fs.lstatSync(dir);
		if (st.isSymbolicLink() || !st.isDirectory()) return `${dir} is not a real directory`;
		if (typeof process.getuid === "function" && st.uid !== process.getuid()) return `${dir} is not owned by this user`;
		if ((st.mode & 63) !== 0) fs.chmodSync(dir, 448);
		return null;
	} catch (err) {
		return `${dir}: ${err.code ?? "unusable"}`;
	}
}
/** Overwrite and remove; true when the path is gone. */
function eraseAside(file) {
	try {
		const st = fs.lstatSync(file);
		if (st.isFile()) {
			const fd = fs.openSync(file, "r+");
			try {
				const n = Math.max(st.size, 1);
				fs.writeSync(fd, randomBytes(n), 0, n, 0);
				fs.fsyncSync(fd);
			} finally {
				fs.closeSync(fd);
			}
		}
	} catch {}
	fs.rmSync(file, { force: true });
	return !fs.existsSync(file);
}
const stamp = (now) => `${new Date(now).toISOString().replace(/[:.]/g, "-")}.${randomBytes(4).toString("hex")}`;
/**
* The decision and the move for one found credential. `sealBound`: a device
* is bound to this installation (else the file is left: the person's ordinary
* login). `seal`: given only while the caller holds a device-verified
* activation; without it, the login is quarantined.
*/
function secureHostCredential(o) {
	const file = o.found.file;
	if (!o.sealBound) return {
		ok: true,
		action: "left",
		file,
		pendingFile: null
	};
	let st;
	try {
		st = fs.lstatSync(file);
	} catch {
		return {
			ok: true,
			action: "left",
			file,
			pendingFile: null
		};
	}
	if (st.isSymbolicLink()) {
		fs.rmSync(file, { force: true });
		return fs.existsSync(file) ? {
			ok: false,
			code: "plaintext-left",
			file,
			message: `the link ${file} could not be removed`
		} : {
			ok: true,
			action: "link-removed",
			file,
			pendingFile: null
		};
	}
	if (!st.isFile()) return {
		ok: false,
		code: "not-a-file",
		file,
		message: `${file} is not a regular file`
	};
	if (st.size > MAX_BYTES) return {
		ok: false,
		code: "too-large",
		file,
		message: `${file} is larger than a login`
	};
	let held = file;
	if (o.found.kind !== "held") {
		held = `${file}${HELD_MARK}${randomBytes(6).toString("hex")}`;
		try {
			fs.renameSync(file, held);
		} catch (err) {
			return {
				ok: false,
				code: "move-failed",
				file,
				message: `${file} could not be moved (${err.code ?? "error"})`
			};
		}
	}
	const dirProblem = pendingDirProblem(o.pendingDir);
	if (dirProblem) {
		eraseAside(held);
		return {
			ok: false,
			code: "pending-dir",
			file,
			message: `${dirProblem}; the login was erased instead of kept`
		};
	}
	const id = `${o.label}.${stamp((o.now ?? Date.now)())}`;
	if (o.seal) {
		const sealed = path.join(o.pendingDir, `${id}.sealed.json`);
		const r = o.seal(held, sealed);
		if (r.ok && r.plaintextErased) return {
			ok: true,
			action: "sealed",
			file,
			pendingFile: sealed
		};
		fs.rmSync(sealed, { force: true });
		if (!fs.existsSync(held)) return {
			ok: false,
			code: "plaintext-left",
			file,
			message: "the login was neither sealed nor kept"
		};
	}
	const pending = path.join(o.pendingDir, `${id}.pending`);
	try {
		const bytes = fs.readFileSync(held);
		const fd = fs.openSync(pending, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 384);
		try {
			fs.writeSync(fd, bytes);
			fs.fsyncSync(fd);
		} finally {
			fs.closeSync(fd);
		}
		bytes.fill(0);
	} catch (err) {
		eraseAside(held);
		fs.rmSync(pending, { force: true });
		return {
			ok: false,
			code: "pending-dir",
			file,
			message: `the login could not be kept (${err.code ?? "error"}); it was erased`
		};
	}
	if (!eraseAside(held)) return {
		ok: false,
		code: "plaintext-left",
		file,
		message: `${held} could not be erased; remove it by hand`
	};
	return {
		ok: true,
		action: "quarantined",
		file,
		pendingFile: pending
	};
}
/** The pending logins, oldest first. */
function pendingHostCredentials(pendingDir, label) {
	let names = [];
	try {
		names = fs.readdirSync(pendingDir);
	} catch {
		return [];
	}
	const out = [];
	for (const n of names) {
		if (!n.startsWith(`${label}.`) || !(n.endsWith(".pending") || n.endsWith(".sealed.json"))) continue;
		const file = path.join(pendingDir, n);
		try {
			const st = fs.lstatSync(file);
			if (st.isFile()) out.push({
				file,
				sealed: n.endsWith(".sealed.json"),
				size: st.size,
				mtimeMs: st.mtimeMs
			});
		} catch {}
	}
	return out.toSorted((a, b) => a.mtimeMs - b.mtimeMs || (a.file < b.file ? -1 : 1));
}
/** Overwrite and remove a pending login (the person discarded it); true when gone. */
function discardPendingCredential(file) {
	return eraseAside(file);
}
/**
* Watch the host's credential paths: every appearance is handed to `handle`
* (the adapter's secureHostCredential call), serialized, within
* CREDENTIAL_WATCH_BOUND_MS. Events on the parent directories trigger a pass
* at once; a poll covers directories that do not exist yet and missed events.
*/
function watchHostCredentials(o) {
	let closed = false;
	const isOpen = () => !closed;
	let running = null;
	let again = false;
	const pass = async () => {
		const events = [];
		for (const found of findHostCredentials(o.spec)) {
			if (found.kind === "transient") try {
				if (Date.now() - fs.lstatSync(found.file).mtimeMs < POLL_MS * 2) continue;
			} catch {
				continue;
			}
			let result;
			try {
				result = await o.handle(found);
			} catch (err) {
				result = {
					ok: false,
					code: "move-failed",
					file: found.file,
					message: err instanceof Error ? err.message : String(err)
				};
			}
			const e = {
				found,
				result
			};
			events.push(e);
			try {
				o.onEvent?.(e);
			} catch {}
		}
		return events;
	};
	const sweep = () => {
		if (running) {
			again = true;
			return running;
		}
		running = (async () => {
			const all = [];
			do {
				again = false;
				all.push(...await pass());
			} while (again && isOpen());
			return all;
		})().finally(() => {
			running = null;
		});
		return running;
	};
	const watchers = [];
	for (const dir of [...new Set(o.spec.files.map((f) => path.dirname(f)))].toSorted()) try {
		const w = fs.watch(dir, { persistent: true }, () => {
			if (!closed) sweep();
		});
		w.on("error", () => {});
		watchers.push(w);
	} catch {}
	const timer = setInterval(() => {
		if (!closed) sweep();
	}, POLL_MS);
	if (!o.keepAlive) {
		timer.unref?.();
		for (const w of watchers) w.unref?.();
	}
	sweep();
	return {
		sweep,
		close() {
			closed = true;
			clearInterval(timer);
			for (const w of watchers) w.close();
		}
	};
}
//#endregion
//#region src/enclawed/adapter/oauth-code-login.ts
const b64url = (b) => b.toString("base64url");
/** The authorization URL and the secrets of one attempt (kept in memory only). */
function startOAuthCodeLogin(spec) {
	const verifier = b64url(randomBytes(32));
	const challenge = b64url(createHash("sha256").update(verifier).digest());
	const state = b64url(randomBytes(32));
	const u = new URL(spec.authorizeUrl);
	for (const [k, v] of Object.entries(spec.authorizeParams ?? {})) u.searchParams.append(k, v);
	u.searchParams.append("client_id", spec.clientId);
	u.searchParams.append("response_type", "code");
	u.searchParams.append("redirect_uri", spec.redirectUri);
	u.searchParams.append("scope", spec.scopes.join(" "));
	u.searchParams.append("code_challenge", challenge);
	u.searchParams.append("code_challenge_method", "S256");
	u.searchParams.append("state", state);
	return {
		url: u.toString(),
		state,
		verifier
	};
}
/**
* Run the flow: `show` prints the URL, `readCode` asks the person for the
* pasted "<code>#<state>". Test seams (stand-ins only): the token endpoint's
* trust anchors and address.
*/
async function oauthCodeLogin(spec, o) {
	const token = new URL(spec.tokenUrl);
	if (token.protocol !== "https:") return {
		ok: false,
		code: "not-https",
		message: "the token endpoint must be https"
	};
	const attempt = startOAuthCodeLogin(spec);
	o.show(attempt.url);
	const pasted = (await o.readCode().catch(() => "")).trim();
	const hash = pasted.lastIndexOf("#");
	const code = hash > 0 ? pasted.slice(0, hash) : pasted;
	const state = hash > 0 ? pasted.slice(hash + 1) : "";
	if (!code) return {
		ok: false,
		code: "no-code",
		message: "no code was pasted"
	};
	if (state !== attempt.state) return {
		ok: false,
		code: "state-mismatch",
		message: "the pasted code is not from this sign-in (its state does not match)"
	};
	const body = JSON.stringify({
		grant_type: "authorization_code",
		code,
		redirect_uri: spec.redirectUri,
		client_id: spec.clientId,
		code_verifier: attempt.verifier,
		state: attempt.state
	});
	let r;
	try {
		r = await new Promise((resolve, reject) => {
			const target = o.addressForTest ?? {
				host: token.hostname,
				port: Number(token.port) || 443
			};
			const req = https.request({
				host: target.host,
				port: target.port,
				servername: token.hostname,
				method: "POST",
				path: `${token.pathname}${token.search}`,
				headers: {
					"content-type": "application/json",
					"content-length": Buffer.byteLength(body),
					host: token.host
				},
				rejectUnauthorized: true,
				checkServerIdentity: (_h, cert) => tls.checkServerIdentity(token.hostname, cert),
				...o.trustForTest ? { ca: o.trustForTest } : {},
				agent: false,
				timeout: 3e4
			}, (res) => {
				let text = "";
				res.setEncoding("utf8");
				res.on("data", (d) => {
					text += d;
					if (text.length > 1024 * 1024) res.destroy();
				});
				res.on("end", () => resolve({
					status: res.statusCode ?? 0,
					text
				}));
			});
			req.on("timeout", () => req.destroy(/* @__PURE__ */ new Error("the token endpoint timed out")));
			req.on("error", reject);
			req.end(body);
		});
	} catch (err) {
		return {
			ok: false,
			code: "exchange-failed",
			message: `the token endpoint could not be reached (${err.message})`
		};
	}
	if (r.status !== 200) return {
		ok: false,
		code: "exchange-failed",
		message: `the token endpoint refused the code (HTTP ${r.status})`
	};
	let j;
	try {
		j = JSON.parse(r.text);
	} catch {
		return {
			ok: false,
			code: "bad-response",
			message: "the token endpoint's answer is not JSON"
		};
	}
	if (typeof j.access_token !== "string" || j.access_token === "") return {
		ok: false,
		code: "bad-response",
		message: "the token endpoint gave no access token"
	};
	const now = (o.now ?? Date.now)();
	const account = {};
	for (const k of ["account", "organization"]) if (j[k] && typeof j[k] === "object") account[k] = j[k];
	return {
		ok: true,
		login: {
			accessToken: j.access_token,
			refreshToken: typeof j.refresh_token === "string" && j.refresh_token ? j.refresh_token : null,
			expiresAt: typeof j.expires_in === "number" ? now + j.expires_in * 1e3 : null,
			scopes: typeof j.scope === "string" && j.scope ? j.scope.split(" ") : [...spec.scopes]
		},
		account: Object.keys(account).length ? account : null
	};
}
//#endregion
//#region src/enclawed/adapter/index.ts
var adapter_exports = /* @__PURE__ */ __exportAll({
	ADMIN_GRANT_VERSION: () => 2,
	AGENT_HOSTS: () => AGENT_HOSTS,
	APPROVAL_HOOK_MARGIN_S: () => 30,
	APPROVAL_TIMEOUT_MS: () => APPROVAL_TIMEOUT_MS,
	AUTH_RELAY_MAX_BODY: () => AUTH_RELAY_MAX_BODY,
	AUTH_RELAY_REFRESH_RECORD: () => AUTH_RELAY_REFRESH_RECORD,
	AnchorTamper: () => AnchorTamper,
	ApprovalLedger: () => ApprovalLedger,
	BUILTIN_WORKFLOWS: () => BUILTIN_WORKFLOWS,
	CALL_COMMITMENT_DOMAIN: () => CALL_COMMITMENT_DOMAIN,
	CALL_COMMITMENT_VERSION: () => 1,
	CLEANER_COVERED: () => COVERED,
	CLEANER_MODES: () => CLEANER_MODES$1,
	CODE_LOADING_ENV: () => CODE_LOADING_ENV,
	CONTAINMENT_AUDIT_CODES: () => CONTAINMENT_AUDIT_CODES,
	CONTEXT_DEPTH_MAX: () => 32,
	CONTEXT_FILE_MAX: () => CONTEXT_FILE_MAX,
	CONTEXT_SEAL_RECORD: () => CONTEXT_SEAL_RECORD,
	CREDENTIAL_FORMATS: () => CREDENTIAL_FORMATS,
	CREDENTIAL_WATCH_BOUND_MS: () => CREDENTIAL_WATCH_BOUND_MS,
	CallLedger: () => CallLedger,
	CommitmentFieldError: () => CommitmentFieldError,
	DEFAULT_ADAPTER_OPTIONS: () => DEFAULT_ADAPTER_OPTIONS,
	DEFAULT_CLEANER_MODE: () => "on",
	DecisionEngine: () => DecisionEngine,
	EMPTY_CONTEXT_DIGEST: () => EMPTY_CONTEXT_DIGEST,
	ERASE_RECHECKS: () => 5,
	ERASE_WATCH_S: () => 60,
	EXEC_CONFIG_NAMES: () => EXEC_CONFIG_NAMES,
	FILE_CHANGED_CODE: () => FILE_CHANGED_CODE,
	FILE_CHANGED_EXEC_CODE: () => FILE_CHANGED_EXEC_CODE,
	FLOOR_PATHS: () => FLOOR_PATHS,
	FRAMEWORK_ENV_ALLOW: () => FRAMEWORK_ENV_ALLOW,
	FileIntegrityLedger: () => FileIntegrityLedger,
	GIT_COMMIT_ACCEPTS_CODE: () => GIT_COMMIT_ACCEPTS_CODE,
	HALT_SEQUENCE: () => HALT_SEQUENCE,
	HANDLE_PLACEHOLDER: () => HANDLE_PLACEHOLDER,
	HANDSHAKE_TIMEOUT_S: () => 30,
	HELD_MARK: () => HELD_MARK,
	HISTORY_LIMIT_BOUNDS: () => HISTORY_LIMIT_BOUNDS,
	HOME_CREDENTIAL_PATHS: () => HOME_CREDENTIAL_PATHS,
	HOOK_PASS_ENV: () => HOOK_PASS_ENV,
	HookHandshake: () => HookHandshake,
	KEY_DIRECTORIES: () => KEY_DIRECTORIES,
	KNOWN_HOST_ENV: () => KNOWN_HOST_ENV,
	LOADER_INJECTION_ENV: () => LOADER_INJECTION_ENV,
	LOGIN_MAX_BYTES: () => LOGIN_MAX_BYTES,
	MAX_KEPT_BYTES: () => MAX_KEPT_BYTES,
	MAX_KEPT_FILE_BYTES: () => MAX_KEPT_FILE_BYTES,
	MCP_ADMISSION_KIND: () => MCP_ADMISSION_KIND,
	MCP_ARGUMENT_ROLES: () => MCP_ARGUMENT_ROLES,
	MIN_HANDLE_VALUE: () => 12,
	MalformedEventError: () => MalformedEventError,
	McpSession: () => McpSession,
	NOTICE_CONTEXT: () => NOTICE_CONTEXT,
	NO_GRANTS: () => NO_GRANTS,
	NO_SHELL_DEFINITIONS: () => NO_SHELL_DEFINITIONS,
	PREVALIDATE_RUN_MS: () => PREVALIDATE_RUN_MS,
	REASON_PREFIX: () => REASON_PREFIX,
	REFERENCE_ARGUMENT_ROLES: () => REFERENCE_ARGUMENT_ROLES,
	REFRESH_MARGIN_MS: () => REFRESH_MARGIN_MS,
	REFUSED_ENV_CLASSES: () => REFUSED_ENV_CLASSES,
	REVIEW_DEFINITIONS: () => REVIEW_DEFINITIONS,
	REVIEW_LABELS: () => REVIEW_LABELS,
	REVIEW_MAX_RATIONALE: () => 600,
	REVIEW_MAX_TEXT: () => REVIEW_MAX_TEXT,
	REVIEW_TRUTH_CLASS: () => REVIEW_TRUTH_CLASS,
	RemoteAuthError: () => RemoteAuthError,
	RemoteCallRefused: () => RemoteCallRefused,
	SECRET_LINE_PLACEHOLDER: () => SECRET_LINE_PLACEHOLDER,
	SECRET_VALUE_PLACEHOLDER: () => SECRET_VALUE_PLACEHOLDER,
	SESSION_ROOT_MAX_BYTES: () => 72,
	SHAPE_CHECKED_EXT: () => SHAPE_CHECKED_EXT,
	SKILL_CAPS: () => SKILL_CAPS,
	SWEPT: () => SWEPT,
	SYSTEM_POLICY_DIR: () => SYSTEM_POLICY_DIR,
	SessionFileError: () => SessionFileError,
	TOOL_CLASSES: () => TOOL_CLASSES,
	TOOL_ENV_REMOVED: () => TOOL_ENV_REMOVED,
	TOOL_REDIRECTS: () => TOOL_REDIRECTS,
	TRANSCRIPT_POLL_MS: () => 250,
	TREE_INTEGRITY_PREFIX: () => TREE_INTEGRITY_PREFIX,
	TaintView: () => TaintView,
	UNBOUND_UNLOCK_MAX_LEASE_S: () => 600,
	UNBOUND_UNLOCK_MAX_USES: () => 1,
	UNIX_SOCKET_PATH_MAX_BYTES: () => 100,
	WITHHELD_MARKER: () => WITHHELD_MARKER,
	WORKFLOW_READ_ONLY: () => READ_ONLY,
	abbreviatesRefused: () => abbreviatesRefused,
	activateSession: () => activateSession,
	addSigner: () => addSigner,
	adminGrantWarnings: () => adminGrantWarnings,
	adminOnlyEmptyDirProblem: () => adminOnlyEmptyDirProblem,
	admitHost: () => admitHost,
	admitMcpServers: () => admitMcpServers,
	admitSkills: () => admitSkills,
	adoptPlaintextContext: () => adoptPlaintextContext,
	allProfiles: () => allProfiles,
	analyzeSkillUses: () => analyzeSkillUses,
	anchorFilesGuard: () => anchorFilesGuard,
	anchorGateMessage: () => anchorGateMessage,
	approvalCode: () => approvalCode,
	approvalConfirmation: () => approvalConfirmation,
	approvalEffect: () => approvalEffect,
	approvalHookTimeoutS: () => approvalHookTimeoutS,
	approvalNonce: () => approvalNonce,
	approveConflictResolution: () => approveConflictResolution,
	approveDigest: () => approveDigest,
	archiveMembers: () => archiveMembers,
	askAtHostPrompt: () => askAtHostPrompt,
	askConflictResolution: () => askConflictResolution,
	askWithinTimeout: () => askWithinTimeout,
	assessContainment: () => assessContainment,
	assessHost: () => assessHost,
	attributeSkillCall: () => attributeSkillCall,
	auditDigest: () => auditDigest,
	auditText: () => auditText,
	auditedActionScope: () => auditedActionScope,
	auditedAuthRelayEvents: () => auditedAuthRelayEvents,
	authorizeRemoteMcpServer: () => authorizeRemoteMcpServer,
	biconditional: () => biconditional,
	bindHardwareRoot: () => bindHardwareRoot,
	bindingMatches: () => bindingMatches,
	bindingOf: () => bindingOf,
	boundWorkflow: () => boundWorkflow,
	boxFingerprint: () => boxFingerprint,
	boxRefreshVault: () => boxRefreshVault,
	bracketMcpCall: () => bracketMcpCall,
	bracketsAuditedAction: () => bracketsAuditedAction,
	bundleDirFor: () => bundleDirFor,
	bunxInstalls: () => bunxInstalls,
	cachedSha256: () => cachedSha256,
	callCommitment: () => callCommitment,
	callDigest: () => callDigest,
	canonicalPolicy: () => canonicalPolicy,
	changeSummary: () => changeSummary,
	changesShellCommands: () => changesShellCommands,
	checkArgumentRoles: () => checkArgumentRoles,
	checkDigestApproval: () => checkDigestApproval,
	checkHistoryLimits: () => checkHistoryLimits,
	checkSettingsDocument: () => checkSettingsDocument,
	checkSettingsValue: () => checkSettingsValue,
	classifyArgv: () => classifyArgv,
	classifyCompound: () => classifyCompound,
	classifyEnv: () => classifyEnv,
	classifyPowerShellCommand: () => classifyPowerShellCommand,
	classifyShellCommand: () => classifyShellCommand,
	cleanText: () => cleanText,
	cleanToolResult: () => cleanToolResult,
	cleanerNotice: () => cleanerNotice,
	codePinProblem: () => codePinProblem,
	codeResolution: () => codeResolution,
	commandMatches: () => commandMatches,
	commandNamesHandle: () => commandNamesHandle,
	commandPathsOf: () => commandPathsOf,
	commandReachesCredential: () => commandReachesCredential,
	commandSetPin: () => commandSetPin,
	commandSettingDigest: () => commandSettingDigest,
	commitmentFields: () => commitmentFields,
	compareHostMode: () => compareHostMode,
	completeConflictResolution: () => completeConflictResolution,
	completeHostPromptAsk: () => completeHostPromptAsk,
	connectRemoteMcpServer: () => connectRemoteMcpServer,
	conservativeShellClassifier: () => conservativeShellClassifier,
	containedWriteRefused: () => containedWriteRefused,
	containmentAuditOf: () => containmentAuditOf,
	contentDigest: () => contentDigest,
	contextMatches: () => contextMatches,
	contextSealVerdict: () => contextSealVerdict,
	correctOutcomes: () => correctOutcomes,
	credentialKeyLabel: () => credentialKeyLabel,
	credentialLike: () => credentialLike,
	credentialPathOf: () => credentialPathOf,
	credentialStoreKeys: () => credentialStoreKeys,
	decideAnchorGate: () => decideAnchorGate,
	decideApprovalGate: () => decideApprovalGate,
	decideCommandSetPin: () => decideCommandSetPin,
	decideHaltNets: () => decideHaltNets,
	decideHookFlags: () => decideHookFlags,
	decideHooks: () => decideHooks,
	decideOperatorAuthorization: () => decideOperatorAuthorization,
	decidePreAction: () => decidePreAction,
	decideProjectOverlap: () => decideProjectOverlap,
	decideRepositoryCommands: () => decideRepositoryCommands,
	decideRepositoryEnv: () => decideRepositoryEnv,
	decideTranscriptFlags: () => decideTranscriptFlags,
	decideTrigger: () => decideTrigger,
	decisionViolation: () => decisionViolation,
	declaredCaps: () => declaredCaps,
	declaredEgress: () => declaredEgress,
	defaultMcpNormalizer: () => defaultMcpNormalizer,
	denoLockOf: () => denoLockOf,
	denoLockedNpm: () => denoLockedNpm,
	denoLockedRemote: () => denoLockedRemote,
	denoRemoteCacheFile: () => denoRemoteCacheFile,
	describeProfile: () => describeProfile,
	destinationAllowed: () => destinationAllowed,
	deviceActivation: () => deviceActivation,
	deviceKeyIdForm: () => deviceKeyIdForm,
	deviceSecondFactor: () => deviceSecondFactor,
	dirContentStore: () => dirContentStore,
	discardPendingCredential: () => discardPendingCredential,
	discardSealedContext: () => discardSealedContext,
	discoverSkills: () => discoverSkills,
	downloadedFiles: () => downloadedFiles,
	dumpsEnvironment: () => dumpsEnvironment,
	effectWord: () => effectWord,
	emptyEnvCommand: () => emptyEnvCommand,
	enclawedLaunchContainment: () => enclawedLaunchContainment,
	encodeCallCommitment: () => encodeCallCommitment,
	ensureLocalSigner: () => ensureLocalSigner,
	entryOf: () => entryOf,
	envCodeLoadingRisk: () => envCodeLoadingRisk,
	eraseCredentials: () => eraseCredentials,
	eraseSealedLogin: () => eraseSealedLogin,
	eraseSessionLogin: () => eraseSessionLogin,
	eraseTree: () => eraseTree,
	eraseWatchSchedule: () => eraseWatchSchedule,
	evidenceCovers: () => evidenceCovers,
	execClassOf: () => execClassOf,
	execConfigInodeMatch: () => execConfigInodeMatch,
	execProvenance: () => execProvenance,
	expandHome: () => expandHome,
	expandHookWords: () => expandHookWords,
	exportedFunctionNames: () => exportedFunctionNames,
	fileDigest: () => fileDigest,
	fileHoldStore: () => fileHoldStore,
	fileIntegrityAskRule: () => fileIntegrityAskRule,
	fileIntegrityDenyRule: () => fileIntegrityDenyRule,
	fileIntegrityLedger: () => fileIntegrityLedger,
	fileTaintStore: () => fileTaintStore,
	fileVenvTrustStore: () => fileVenvTrustStore,
	filesDigest: () => filesDigest,
	findApproval: () => findApproval,
	findHostCredentials: () => findHostCredentials,
	findHostOperatorKeys: () => findHostOperatorKeys,
	findNestedDirs: () => findNestedDirs,
	findSigner: () => findSigner,
	followChain: () => followChain,
	forgetLaunchCredentialKeys: () => forgetLaunchCredentialKeys,
	frameworkCredentialKeyDevice: () => frameworkCredentialKeyDevice,
	frameworkDeviceTotp: () => frameworkDeviceTotp,
	frameworkEnv: () => frameworkEnv,
	frameworkFormal: () => frameworkFormal,
	gitCommandStarts: () => gitCommandStarts,
	gitConfigRiskOf: () => gitConfigRiskOf,
	gitProgramsOf: () => gitProgramsOf,
	gitTrackingOf: () => gitTrackingOf,
	haltOutcome: () => haltOutcome,
	handleRepoConfigEvent: () => handleRepoConfigEvent,
	handshakeTimeoutAction: () => handshakeTimeoutAction,
	historyAgentId: () => historyAgentId,
	hookDigest: () => hookDigest,
	hookEnvironment: () => hookEnvironment,
	hookGrantsOf: () => hookGrantsOf,
	hooksMessage: () => hooksMessage,
	hostEnvExtra: () => hostEnvExtra,
	hostEnvironment: () => hostEnvironment,
	hostMaySelfApprove: () => hostMaySelfApprove,
	hostPromptAnswerer: () => hostPromptAnswerer,
	hostPromptHold: () => hostPromptHold,
	hostSelfApproval: () => hostSelfApproval,
	importMcpRecord: () => importMcpRecord,
	inIntegrityScope: () => inIntegrityScope,
	inputDigest: () => inputDigest,
	inspectMcpToolDefinition: () => inspectMcpToolDefinition,
	interpreterIdentity: () => interpreterIdentity,
	isBoxRecord: () => isBoxRecord,
	isBuildFilePath: () => isBuildFilePath,
	isContainmentRecord: () => isContainmentRecord,
	isDescendant: () => isDescendant,
	isEd25519PrivateKeyFile: () => isEd25519PrivateKeyFile,
	isExecConfigPath: () => isExecConfigPath,
	isInside: () => isInside,
	isLoopbackRedirect: () => isLoopbackRedirect,
	isPersonHeldMode: () => isPersonHeldMode,
	isPersonNamedCurl: () => isPersonNamedCurl,
	isPersonNamedUrl: () => isPersonNamedUrl,
	isProtectedPath: () => isProtectedPath,
	isRemoteRecord: () => isRemoteRecord,
	isSafeScratchDir: () => isSafeScratchDir,
	issueDeviceUnlock: () => issueDeviceUnlock,
	keyIdOf: () => keyIdOf,
	lastRecordedContextDigest: () => lastRecordedContextDigest,
	launchContained: () => launchContained,
	launchMcpServer: () => launchMcpServer,
	layerPolicies: () => layerPolicies,
	layerUserPolicy: () => layerUserPolicy,
	linuxPeerLookup: () => linuxPeerLookup,
	linuxProcessProbe: () => linuxProcessProbe,
	loadMcpProgram: () => loadMcpProgram,
	localCodeLaunch: () => localCodeLaunch,
	localCodeOf: () => localCodeOf,
	localCodeProblem: () => localCodeProblem,
	loginLaunchDecision: () => loginLaunchDecision,
	loginSealStatus: () => loginSealStatus,
	managedHooksStatus: () => managedHooksStatus,
	managedLoginPolicyDocument: () => managedLoginPolicyDocument,
	managedLoginPolicyStatus: () => managedLoginPolicyStatus,
	managedLoginPolicyText: () => managedLoginPolicyText,
	mcpCallEffects: () => mcpCallEffects,
	mcpDefinitionDigest: () => mcpDefinitionDigest,
	mcpEffectVerdict: () => mcpEffectVerdict,
	mcpPinRecord: () => mcpPinRecord,
	mcpRecordProblems: () => mcpRecordProblems,
	mcpServerInfoProblem: () => mcpServerInfoProblem,
	mcpToolDefinitionDigest: () => mcpToolDefinitionDigest,
	mcpToolSetProblems: () => mcpToolSetProblems,
	measureFiles: () => measureFiles,
	measureHostBinary: () => measureHostBinary,
	measureLocalCode: () => measureLocalCode,
	measureNpxPackage: () => measureNpxPackage,
	measurePackageRunner: () => measurePackageRunner,
	measurementChanged: () => measurementChanged,
	memoryContentStore: () => memoryContentStore,
	memoryFileIntegrityLedger: () => memoryFileIntegrityLedger,
	memoryHoldStore: () => memoryHoldStore,
	memoryTaintStore: () => memoryTaintStore,
	memoryVenvTrustStore: () => memoryVenvTrustStore,
	migrateLegacyLoginSeal: () => migrateLegacyLoginSeal,
	neutralizeHookCommands: () => neutralizeHookCommands,
	neutralizeNotices: () => neutralizeNotices,
	noHandshakeVerdict: () => noHandshakeVerdict,
	nodeFsProbe: () => nodeFsProbe,
	normalizeConfirmation: () => normalizeConfirmation,
	normalizePersonUrl: () => normalizePersonUrl,
	npmCacheDir: () => npmCacheDir,
	npxInstalls: () => npxInstalls,
	oauthCodeLogin: () => oauthCodeLogin,
	oauthRelayCredential: () => oauthRelayCredential,
	offlineSignerCount: () => offlineSignerCount,
	openContextInto: () => openContextInto,
	openLoopbackRedirect: () => openLoopbackRedirect,
	optionsSet: () => optionsSet,
	osKeyring: () => osKeyring,
	ownedPrivateDir: () => ownedPrivateDir,
	packageRootOf: () => packageRootOf,
	parseAdapterOptions: () => parseAdapterOptions,
	parseAdminGrantDoc: () => parseAdminGrantDoc,
	parseCompound: () => parseCompound,
	parseEnvFile: () => parseEnvFile,
	parseForensicWebhook: () => parseForensicWebhook,
	parseFrontmatter: () => parseFrontmatter,
	parseIni: () => parseIni,
	parseOfflineSignature: () => parseOfflineSignature,
	parseOptions: () => parseOptions,
	parsePolicyDocument: () => parsePolicyDocument,
	parseProfile: () => parseProfile,
	parseReviewAnswer: () => parseReviewAnswer,
	parseTomlStrings: () => parseTomlStrings,
	parseWorkflowOptions: () => parseWorkflowOptions,
	pathAllowed: () => pathAllowed,
	pathGlobRegExp: () => pathGlobRegExp,
	pathWords: () => pathWords,
	pendingHostCredentials: () => pendingHostCredentials,
	personHeldModes: () => personHeldModes,
	personUrlsOf: () => personUrlsOf,
	pinMcpServer: () => pinMcpServer,
	pinnedCopy: () => pinnedCopy,
	plaintextContextAt: () => plaintextContextAt,
	planManagedLoginPolicy: () => planManagedLoginPolicy,
	pnpmDlxInstalls: () => pnpmDlxInstalls,
	policyDigestOf: () => policyDigestOf,
	policyNeedsApproval: () => policyNeedsApproval,
	prefixedDirs: () => prefixedDirs,
	prepareContextDir: () => prepareContextDir,
	prepareReviewText: () => prepareReviewText,
	prevalidateSettings: () => prevalidateSettings,
	privateKeyShaped: () => privateKeyShaped,
	privateSessionRoot: () => privateSessionRoot,
	privateSocketDir: () => privateSocketDir,
	probeRemoteMcpServer: () => probeRemoteMcpServer,
	processCoreDumpsOff: () => processCoreDumpsOff,
	processMemoryShielded: () => processMemoryShielded,
	profileDigest: () => profileDigest,
	programWords: () => programWords,
	projectDigest: () => projectDigest,
	projectSecretValues: () => projectSecretValues,
	protectedInodeIndex: () => protectedInodeIndex,
	pythonIndexUrls: () => pythonIndexUrls,
	pythonModuleFiles: () => pythonModuleFiles,
	pythonRunnerForm: () => pythonRunnerForm,
	quoteUntrusted: () => quoteUntrusted,
	reachableHidrawNodes: () => reachableHidrawNodes,
	readApprovals: () => readApprovals,
	readManagedDocs: () => readManagedDocs,
	readMcpPins: () => readMcpPins,
	readSessionFile: () => readSessionFile,
	readSigners: () => readSigners,
	realpathNearestSync: () => realpathNearestSync,
	reconcile: () => reconcile,
	recordCall: () => recordCall,
	recordHashOf: () => recordHashOf$1,
	recordableEnvValue: () => recordableEnvValue,
	recoverContextDirs: () => recoverContextDirs,
	redactCredentials: () => redactCredentials,
	redactCredentialsIn: () => redactCredentialsIn,
	redactHandles: () => redactHandles,
	redactProjectSecrets: () => redactProjectSecrets,
	redactProjectSecretsIn: () => redactProjectSecretsIn,
	remoteCredentialStore: () => remoteCredentialStore,
	remoteCredentials: () => remoteCredentials,
	remoteHeaders: () => remoteHeaders,
	remoteTransportOf: () => remoteTransportOf,
	removeAddedSshIdentities: () => removeAddedSshIdentities,
	removeSigner: () => removeSigner,
	replaceProcessEnv: () => replaceProcessEnv,
	replayDecision: () => replayDecision,
	repoConfigHoldReason: () => repoConfigHoldReason,
	repositoryCommandSettings: () => repositoryCommandSettings,
	repositoryCommandsMessage: () => repositoryCommandsMessage,
	repositoryEnvMessage: () => repositoryEnvMessage,
	resealFromSession: () => resealFromSession,
	resolveAdminGrants: () => resolveAdminGrants,
	resolveCommand: () => resolveCommand,
	resolveHardwareRootMode: () => resolveHardwareRootMode,
	resolveShellDefinitions: () => resolveShellDefinitions,
	revertibleTargets: () => revertibleTargets,
	reviewOf: () => reviewOf,
	reviewPrompt: () => reviewPrompt,
	rewriteSessionFile: () => rewriteSessionFile,
	rootOwnedFileCheck: () => rootOwnedFileCheck,
	runReview: () => runReview,
	runnerCacheDirs: () => runnerCacheDirs,
	runsManagedHook: () => runsManagedHook,
	runsTainted: () => runsTainted,
	sameEntry: () => sameEntry,
	sanitizeText: () => sanitizeText,
	scriptContainer: () => scriptContainer,
	scrubLoaderEnv: () => scrubLoaderEnv,
	sealBoxFromSeed: () => sealBoxFromSeed,
	sealContextFrom: () => sealContextFrom,
	sealLoginBytes: () => sealLoginBytes,
	sealLoginFile: () => sealLoginFile,
	sealOnlyBox: () => sealOnlyBox,
	sealToBox: () => sealToBox,
	sealedContextDigest: () => sealedContextDigest,
	sealedSegmentsSync: () => sealedSegmentsSync,
	secretFilesBelow: () => secretFilesBelow,
	secretValuesOf: () => secretValuesOf,
	secureHostCredential: () => secureHostCredential,
	seedToolCredentials: () => seedToolCredentials,
	selectWorkflow: () => selectWorkflow,
	settingsDropWatcher: () => settingsDropWatcher,
	settleTaint: () => settleTaint,
	sha256File: () => sha256File,
	shadowOf: () => shadowOf,
	shadowedCommandIn: () => shadowedCommandIn,
	shellFlavor: () => shellFlavor,
	showPath: () => showPath,
	signRecord: () => signRecord,
	signSkill: () => signSkill,
	signatureLink: () => signatureLink,
	signedMcpPinStore: () => signedMcpPinStore,
	simpleIndexHashes: () => simpleIndexHashes,
	simpleWords: () => simpleWords,
	sitePackagesIn: () => sitePackagesIn,
	skillDrift: () => skillDrift,
	skillManifest: () => skillManifest,
	snapshotCredentialFloor: () => snapshotCredentialFloor,
	snapshotProject: () => snapshotProject,
	snapshotSkill: () => snapshotSkill,
	spendDeviceUnlock: () => spendDeviceUnlock,
	splitSimpleCommand: () => splitSimpleCommand,
	sshAgentIdentities: () => sshAgentIdentities,
	staleHookGrants: () => staleHookGrants,
	startAuthRelay: () => startAuthRelay,
	startOAuthCodeLogin: () => startOAuthCodeLogin,
	storeApproval: () => storeApproval,
	strictShellClassifier: () => strictShellClassifier,
	stricterFlavor: () => stricterFlavor,
	summarizeAction: () => summarizeAction,
	sweepCredentialFloor: () => sweepCredentialFloor,
	systemBinaryUids: () => systemBinaryUids,
	taintEffects: () => taintEffects,
	taintViewOf: () => taintViewOf,
	tightenAdapterOptions: () => tightenAdapterOptions,
	toolCredentialEnv: () => toolCredentialEnv,
	toolCredentialLayout: () => toolCredentialLayout,
	transcriptCallVerdict: () => transcriptCallVerdict,
	transcriptDisablingFlag: () => transcriptDisablingFlag,
	treeDigest: () => treeDigest,
	treeHashCache: () => treeHashCache,
	trustPaths: () => trustPaths,
	trustedBinary: () => trustedBinary,
	twoFactorAuthorizer: () => twoFactorAuthorizer,
	unlockJobDigest: () => unlockJobDigest,
	unlockScope: () => unlockScope,
	unlockTicketBinding: () => unlockTicketBinding,
	unpinMcpServer: () => unpinMcpServer,
	unsealLoginInto: () => unsealLoginInto,
	unsealLoginToMemory: () => unsealLoginToMemory,
	unsignSkill: () => unsignSkill,
	untrackedOverwrite: () => untrackedOverwrite,
	untrustedBinaryReason: () => untrustedBinaryReason,
	unverifiedProgramIn: () => unverifiedProgramIn,
	unverifiedProgramOf: () => unverifiedProgramOf,
	userNamespaceDeviceRisk: () => userNamespaceDeviceRisk,
	uvEnvironmentSynced: () => uvEnvironmentSynced,
	uvLockPackages: () => uvLockPackages,
	validatePreAction: () => validatePreAction,
	venvFingerprint: () => venvFingerprint,
	venvTrustFile: () => venvTrustFile,
	verifyCallChain: () => verifyCallChain,
	verifyChainedRecord: () => verifyChainedRecord,
	verifyHookPeer: () => verifyHookPeer,
	verifyLauncherPeer: () => verifyLauncherPeer,
	verifyRecord: () => verifyRecord,
	verifySitePackages: () => verifySitePackages,
	verifySkill: () => verifySkill,
	watchErased: () => watchErased,
	watchHostCredentials: () => watchHostCredentials,
	watchProject: () => watchProject,
	watchSkills: () => watchSkills,
	watchTranscripts: () => watchTranscripts,
	withContextLock: () => withContextLock,
	withScratchPaths: () => withScratchPaths,
	workflowVerdict: () => workflowVerdict,
	writeProtectedInodeIndex: () => writeProtectedInodeIndex,
	writeSessionFile: () => writeSessionFile,
	yarnDlxInstallCommand: () => yarnDlxInstallCommand,
	zipEntry: () => zipEntry
});
//#endregion
export { ADAPTER_CASE_IDS, ANCHOR_KEEPALIVE_INTERVAL_MS, ANCHOR_LEASE_MS, ANCHOR_OPEN_TIMEOUT_MS, ANCHOR_STATUS, AnchorAuthError, AnchorSession, ApprovalGrantLedger, AuditLogger, CALDAV_TOOLS, CAPABILITY, CARDDAV_TOOLS, CS05_REFLASH_RUNBOOK, DEFAULT_RP_ID, DEFAULT_STAGE_MODES as EGRESS_DEFAULT_STAGE_MODES, STAGE_IDS as EGRESS_STAGE_IDS, ENROLL_INSTRUCTIONS, EgressDeniedError, FIRMWARE_NO_ANCHOR, FactorError, GOOGLE_WORKSPACE_ENDPOINTS, HeadAnchorAlarm, HeadAnchorTampered, HistoryStore, HistoryTamperedError, HttpJsonRpcTransport, IMAP_SMTP_TOOLS, KEY_DERIVE_RESIDUAL, LIVE_DEVICE_TEST_ACK, LIVE_DEVICE_TEST_ENV, McpToolPinSet, QClearedMcpClient, RestoreError, RootAttestError, RootHaltError, SecondFactorError, SessionAnchorRefused, SkillGate, TAINT_SCOPE_ALL, TakenSession, VERIFICATION, adapterChecks, adapter_exports as adapterKit, anchorFilePath, anchorHistoryLine, anchorHistoryPath, appendAnchorHistory, approvalArgsDigest, assertSecondFactor, attestHardwareRoot, bindingNames, bootHardwareRoot, bootstrapEnclawed, boundAnchorRefusal, brokerDisabled, brokerSocketPath, buildBehavioralInvariantsStage, buildCanonicalizerStage, buildEntropyScannerStage, buildNoiseInjectorStage, buildReplaySentinelStage, buildSemanticScramblerStage, buildTaintTrackerStage, buildTimingScramblerStage, busyWaitMs, canonicalEgressTarget, canonicalJson, checkHardwareRootForToolCall, checkMcpToolDefinitions, classifyActionIdempotency, clearRuntime, closeHardwareRootSession, closeHardwareRootSessionAsync, closeHeadAnchorSessions, compareAnchoredLog, connectRoot, containment_exports as containment, createActionBatcher, createLedgerStore as createEgressLedgerStore, createEgressRunner, createPolicy, createTaintStore, decideAuditAnchorVerdict, decideSessionAnchor, defaultEnclavedPolicy, defaultOpenPolicy, deriveDeviceKey, describeMcpToolDrift, describeResourceChange, deviceFactorActivations, deviceFactorActivationsInFiles, deviceTotpEnrolled, deviceTotpVerdict, diagnoseHardwareRoot, redact as dlpRedact, scan as dlpScan, egressTargetDestination, egressTargetString, enclawederHeadAnchor, enrollPasskey, enrollSecurityKey, generateEd25519KeyPair, getEgressStages, getFlavor, grantUnlock, hardwareRootCommandSet, hardwareRootInfo, hardwareRootKeyDerivation, hardwareRootRecoverCli, hardwareRootSessionAnchor, hardwareRootSigningDevice, hardwareRootStatusCli, hardwareRootStatusStandalone, hardwareRootTotpDevice, identityFingerprint, installEgressGuard, installRawSocketGuard, isWslHost, launchRootClaims, launchRootClaimsInFiles, loadAuthConfig, loadCalDavBridge, loadCardDavBridge, loadConformanceAdapter, loadGoogleWorkspaceBridge, loadImapSmtpBridge, loadPolicyFromJson, makeCall, makeEgressCall, makeLabel, mcpToolDefinitionDigest, mediateMediaBatch, openSeal, parseAnchor, parseAnchorHistory, parseAuthConfig, parseBinding, parseEgressTarget, parseIdentityLog, parseUnlockBody, pinMcpToolDefinitions, prepareFsWriteHistory, proveCommandSet05, readAnchorHistory, readDeviceEntropy, readIdentityLog, readUnlock, recoverHardwareRootStandalone, registerEgressStage, registerServer, removeSecurityKey, renderConformanceReport, renderHardwareRootDiagnosis, requireHardwareRootSessionAnchor, resolveActionBatcherOptions, resolveDefaultConfigPath, resolveStageMode as resolveEgressStageMode, resolveFsResource, resolveHistoryDir, resolveUrlResource, restoreSnapshot, revokeUnlock, revokeUnlockTicket, runConformanceChecks, runEgressPipeline, sealFrame, sealedTotpVerdict, secondFactorStatus, setForensicAuditSink, setRuntime, sharedTaintStore, signManifest, spendUnlock, tagSensitiveValue, takeoverByFactors, takeoverFidoChallenge, typedSerialUid, unboundHistoryRecord, underTestRunner, unlockForHeadlessStart, urlWithinEgressTarget, verifyAnchor, verifyAnchorFileRecord, verifyAnchorRead, verifyAnchorRecord, verifyAnchorV2, verifyCert, verifyChain, verifyChallenge, verifyForensicLog, verifyHistory, verifyManifestSignature, verifyRootAttestation, verifyRootMembers, verifySignedAnchorRecord, verifyUnlockReceipt, verifyVerdictRecord, wslUsbSetupCli };
