import { n as defaultRuntime } from "./runtime-DVd7lkz0.js";
import { a as isTrustRootLocked, i as getTrustRoot, t as addPersistedSigner } from "./trust-root-store-CxHS2Xlo.js";
import { t as formatDocsLink } from "./links-CjFnnUDy.js";
import { r as theme } from "./theme-hNdBadll.js";
import { t as formatHelpExamples } from "./help-format-DGXiWSnV.js";
import { n as runCommandWithRuntime } from "./cli-utils-BoeHfEkc.js";
import { readFile } from "node:fs/promises";
//#region src/cli/program/register.trust.ts
function registerTrustCommand(program) {
	const trust = program.command("trust").description("Inspect and manage the module-signing trust root").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/trust", "docs.enclawed.ai/cli/trust")}\n`);
	trust.command("list").description("List the publisher keys currently in the trust root").option("--json", "Output JSON", false).addHelpText("after", () => `\n${theme.heading("Examples:")}\n${formatHelpExamples([["enclawed trust list", "Show signers approved to attest modules."], ["enclawed trust list --json", "Machine-readable signer list."]])}`).action((opts) => {
		runCommandWithRuntime(defaultRuntime, async () => {
			const signers = getTrustRoot();
			const locked = isTrustRootLocked();
			if (opts.json) {
				defaultRuntime.writeJson({
					locked,
					signers: signers.map((s) => ({
						keyId: s.keyId,
						approvedClearance: [...s.approvedClearance],
						description: s.description,
						notAfter: s.notAfter ?? null
					}))
				});
				return;
			}
			defaultRuntime.log(`trust root: ${signers.length} signer(s), locked=${locked}`);
			for (const s of signers) {
				defaultRuntime.log("");
				defaultRuntime.log(`  keyId:       ${s.keyId}`);
				defaultRuntime.log(`  clearance:   ${[...s.approvedClearance].join(", ")}`);
				if (s.notAfter) defaultRuntime.log(`  notAfter:    ${s.notAfter}`);
				defaultRuntime.log(`  description: ${s.description}`);
			}
		});
	});
	trust.command("add").description("Persist a signer into the trust-root overlay (open flavor: also applies live; enclaved flavor: takes effect on next process start)").requiredOption("--signer <keyId>", "Stable identifier for the signer (e.g. ops-2026)").option("--ed25519 <pemPath>", "Path to an Ed25519 SPKI PEM file (public key half)").option("--pem <pemPath>", "Alias for --ed25519").option("--pem-inline <pem>", "Inline PEM block (for shells that prefer args over files)").option("--clearance <levels>", "Comma-separated approved clearance tiers (e.g. public,internal). Default: public,internal.").option("--description <text>", "Human-readable description").option("--not-after <iso>", "ISO date after which the signer is no longer valid").option("--json", "Output JSON").addHelpText("after", () => `\n${theme.heading("Examples:")}\n${formatHelpExamples([["enclawed trust add --signer ops-2026 --ed25519 ./ops.pub.pem --clearance public,internal", "Persist a new signer."], ["enclawed trust add --signer mcp-workspace --ed25519 /etc/keys/workspace.pem --clearance internal --description 'Workspace MCP bridge'", "With description."]])}`).action(async (opts) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			const pemPath = opts.ed25519 ?? opts.pem;
			let publicKeyPem;
			if (opts.pemInline) publicKeyPem = opts.pemInline;
			else if (pemPath) try {
				publicKeyPem = await readFile(pemPath, "utf8");
			} catch (err) {
				defaultRuntime.error(`enclawed trust add: cannot read PEM file ${pemPath}: ${err instanceof Error ? err.message : String(err)}`);
				defaultRuntime.exit(1);
				return;
			}
			else {
				defaultRuntime.error("enclawed trust add: one of --ed25519 <pemPath>, --pem <pemPath>, or --pem-inline <pem> is required");
				defaultRuntime.exit(1);
				return;
			}
			const clearance = (opts.clearance ?? "public,internal").split(",").map((s) => s.trim()).filter(Boolean);
			try {
				const result = await addPersistedSigner({
					keyId: opts.signer,
					publicKeyPem,
					approvedClearance: clearance,
					description: opts.description ?? `Signer added via 'enclawed trust add' (${opts.signer}).`,
					...opts.notAfter ? { notAfter: opts.notAfter } : {}
				});
				const locked = isTrustRootLocked();
				if (opts.json) {
					defaultRuntime.writeJson({
						ok: true,
						path: result.path,
						replaced: result.replaced,
						appliedLive: !locked
					});
					return;
				}
				defaultRuntime.log(`trust add: ${result.replaced ? "updated" : "added"} signer "${opts.signer}"`);
				defaultRuntime.log(`  path:        ${result.path}`);
				defaultRuntime.log(`  appliedLive: ${!locked}`);
				if (locked) defaultRuntime.log("  (trust root is locked in this process; the new signer takes effect on next process start)");
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				if (opts.json) defaultRuntime.writeJson({
					ok: false,
					error: message
				});
				else defaultRuntime.error(`enclawed trust add: ${message}`);
				defaultRuntime.exit(1);
			}
		});
	});
}
//#endregion
export { registerTrustCommand };
