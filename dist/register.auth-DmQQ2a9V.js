import { n as defaultRuntime } from "./runtime-1ULlIz69.js";
import { a as SecondFactorError, c as enrollSecurityKey, d as secondFactorStatus, f as unlockForHeadlessStart, l as removeSecurityKey, n as resolveDeviceSecondFactor, o as assertSecondFactor, s as enrollPasskey, u as revokeUnlockTicket } from "./command-gate-3crOcR8g.js";
import "./auth-PiqrrH8C.js";
import { r as theme } from "./theme-m3fOXe3B.js";
import { t as formatHelpExamples } from "./help-format-Iet8t7MY.js";
import { n as runCommandWithRuntime } from "./cli-utils-0UxwpDtv.js";
//#region src/cli/program/register.auth.ts
function parseWhole(value, flag) {
	if (!/^\d+$/.test(value)) throw new SecondFactorError("config-invalid", `${flag} takes a whole number`);
	return Number(value);
}
async function context() {
	return { deviceFactor: await resolveDeviceSecondFactor() };
}
async function run(fn) {
	await runCommandWithRuntime(defaultRuntime, async () => {
		try {
			await fn();
		} catch (err) {
			if (err instanceof SecondFactorError) {
				defaultRuntime.error(`enclawed auth: ${err.message}`);
				defaultRuntime.exit(1);
				return;
			}
			throw err;
		}
	});
}
function registerAuthCommand(program) {
	const auth = program.command("auth").description("Manage the mandatory second factor (FIDO2 security keys, device-bound passkeys) and unlock tickets").addHelpText("after", () => `\n${theme.heading("Examples:")}\n${formatHelpExamples([
		["enclawed auth enroll --label primary", "Register your security key."],
		["enclawed auth enroll --label backup", "Register a second key as a backup."],
		["enclawed auth enroll --passkey --label laptop", "Register this computer's device-bound passkey (Windows Hello on a TPM)."],
		["enclawed auth unlock --minutes 10", "Allow one headless start in the next 10 minutes."],
		["enclawed auth status", "Show enrolled keys and the unlock ticket."]
	])}\n\n${theme.muted("Docs:")} docs/security/two-factor.md\n`);
	auth.command("enroll").description("Register a FIDO2 security key with a PIN or on-key biometric, or this computer's device-bound passkey").option("--label <name>", "A name for this key (e.g. primary, backup)", "primary").option("--alg <alg>", "Credential algorithm: es256 or eddsa (default: es256 when offered)").option("--passkey", "Enroll this computer's device-bound passkey through a one-time page in your browser", false).action(async (opts) => {
		await run(async () => {
			if (opts.alg !== void 0 && opts.alg !== "es256" && opts.alg !== "eddsa") throw new SecondFactorError("config-invalid", "--alg takes es256 or eddsa");
			if (opts.passkey && opts.alg !== void 0) throw new SecondFactorError("config-invalid", "--alg applies to security keys; a passkey uses its device's algorithm");
			const r = opts.passkey ? await enrollPasskey(await context(), { label: opts.label }) : await enrollSecurityKey(await context(), {
				label: opts.label,
				alg: opts.alg
			});
			const c = r.credential;
			defaultRuntime.log(`enrolled ${c.label} (id ${c.id}, ${c.attestation.certSubject}, AAGUID ${c.aaguid})`);
			if (r.total === 1) defaultRuntime.log("Only one key is enrolled. Enroll a backup key now, and keep it somewhere safe: enclawed auth enroll --label backup");
		});
	});
	auth.command("status").description("Show enrolled keys, the unlock ticket and the configured limits").option("--json", "Output JSON", false).action(async (opts) => {
		await run(async () => {
			const s = await secondFactorStatus(await context());
			if (opts.json) {
				defaultRuntime.writeJson(s);
				return;
			}
			defaultRuntime.log(`second factor: ${s.credentials.length} security key(s) or passkey(s) enrolled (${s.dir})`);
			for (const c of s.credentials) {
				const used = c.lastUsedAt ? new Date(c.lastUsedAt).toISOString() : "never";
				defaultRuntime.log(`  ${c.id}  ${c.label.padEnd(12)} ${c.kind === "passkey" ? "passkey" : "key    "} ${c.alg === -7 ? "ES256" : c.alg === -257 ? "RS256" : "EdDSA"}  counter ${c.signCount}  last used ${used}  ${c.attestation.certSubject}`);
			}
			if (s.deviceFactor) defaultRuntime.log(`  device-verified: ${s.deviceFactor.label}: ${s.deviceFactor.enrolled ? "enrolled" : "not enrolled"}`);
			defaultRuntime.log(`unlock ticket: ${s.ticket ? `${s.ticket.valid ? "valid" : "not valid here"} until ${new Date(s.ticket.expiresAt).toISOString()}, ${s.ticket.usesLeft} use(s) left` : "none"}`);
			if ("error" in s.config) defaultRuntime.error(`enclawed.auth: ${s.config.error}`);
			else defaultRuntime.log(`limits: unlock ${s.config.unlockMinutes} min by default, at most ${s.config.maxUnlockMinutes} min; allowlist: ${s.config.allowlist.length ? s.config.allowlist.join(", ") : "any attested FIDO2 key"}`);
			if (s.failures) defaultRuntime.log(`consecutive failures: ${s.failures}${s.lockedUntil ? `, locked until ${new Date(s.lockedUntil).toISOString()}` : ""}`);
			for (const w of s.warnings) defaultRuntime.error(`warning: ${w}`);
		});
	});
	auth.command("test").description("Perform one full second-factor check (audited) without changing anything").action(async () => {
		await run(async () => {
			const r = await assertSecondFactor(await context(), {
				purpose: "auth-test",
				allowTicket: false
			});
			defaultRuntime.log(`verified (${r.via}${r.credential ? ` ${r.credential}` : ""})`);
		});
	});
	auth.command("unlock").description("Issue a short-lived unlock ticket for one headless session start").option("--minutes <n>", "Ticket lifetime (default from enclawed.auth.unlockMinutes, 10)").option("--uses <n>", "Number of headless starts it admits (default 1, at most 20)").action(async (opts) => {
		await run(async () => {
			const t = await unlockForHeadlessStart(await context(), {
				minutes: opts.minutes !== void 0 ? parseWhole(opts.minutes, "--minutes") : void 0,
				uses: opts.uses !== void 0 ? parseWhole(opts.uses, "--uses") : void 0
			});
			defaultRuntime.log(`unlock ticket issued: ${t.usesLeft} headless session start(s) until ${new Date(t.expiresAt).toISOString()}, this boot only`);
		});
	});
	auth.command("lock").description("Revoke the unlock ticket now").action(async () => {
		await run(async () => {
			const had = await revokeUnlockTicket(await context());
			defaultRuntime.log(had ? "unlock ticket revoked" : "no unlock ticket to revoke");
		});
	});
	auth.command("remove <id>").description("Unenroll a security key (needs a touch; the last factor cannot be removed)").action(async (id) => {
		await run(async () => {
			const r = await removeSecurityKey(await context(), { id });
			defaultRuntime.log(`removed ${id}; ${r.remaining} key(s) remain enrolled`);
		});
	});
}
//#endregion
export { registerAuthCommand };
