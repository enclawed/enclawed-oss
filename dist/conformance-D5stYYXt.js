import { n as getRuntime, r as setRuntime, t as clearRuntime } from "./runtime-Dt7e6nAN.js";
import "./types-Cl2qLaUZ.js";
//#region src/enclawed/conformance/index.ts
const CHECK_TIMEOUT_MS = 6e4;
async function loadDefaultChecks() {
	const [mcp, approval, egress, platform, skills, contained, review, shell] = await Promise.all([
		import("./checks-mcp-D-7qtAGs.js"),
		import("./checks-approval-CHh86b2p.js"),
		import("./checks-egress-DY_-jf4J.js"),
		import("./checks-platform-DITz3GIv.js"),
		import("./checks-skills-x-SVB32K.js"),
		import("./checks-contained-rBEGUHua.js"),
		import("./checks-review-CV0d9SW6.js"),
		import("./checks-shell-DE0ErYSZ.js")
	]);
	return [
		...mcp.CHECKS,
		...approval.CHECKS,
		...egress.CHECKS,
		...platform.CHECKS,
		...skills.CHECKS,
		...contained.CHECKS,
		...review.CHECKS,
		...shell.CHECKS
	];
}
function withTimeout(p, ms) {
	let timer;
	return Promise.race([p.finally(() => clearTimeout(timer)), new Promise((_, reject) => {
		timer = setTimeout(() => reject(/* @__PURE__ */ new Error(`timed out after ${ms} ms`)), ms);
		timer.unref?.();
	})]);
}
/** Run every check (or the listed ones) and report each outcome. */
async function runConformanceChecks(opts = {}) {
	const all = [...await loadDefaultChecks(), ...opts.extraChecks ?? []];
	const selected = opts.only?.length ? all.filter((c) => opts.only?.includes(c.id)) : all;
	const results = [];
	for (const check of selected) {
		const saved = getRuntime();
		const started = Date.now();
		let result;
		try {
			const outcome = await withTimeout(Promise.resolve().then(check.run), CHECK_TIMEOUT_MS);
			result = outcome?.skip ? {
				id: check.id,
				title: check.title,
				proves: check.proves,
				status: "skip",
				detail: outcome.skip
			} : {
				id: check.id,
				title: check.title,
				proves: check.proves,
				status: "pass"
			};
		} catch (err) {
			result = {
				id: check.id,
				title: check.title,
				proves: check.proves,
				status: "fail",
				detail: err instanceof Error ? err.message : String(err),
				remedy: check.remedy
			};
		} finally {
			if (saved) setRuntime(saved);
			else clearRuntime();
		}
		results.push({
			...result,
			durationMs: Date.now() - started
		});
	}
	return {
		ok: results.every((r) => r.status !== "fail"),
		passed: results.filter((r) => r.status === "pass").length,
		failed: results.filter((r) => r.status === "fail").length,
		skipped: results.filter((r) => r.status === "skip").length,
		results
	};
}
/** One line per guarantee, in plain terms. */
function renderConformanceReport(report) {
	const lines = [];
	for (const r of report.results) {
		const tag = r.status === "pass" ? "PASS" : r.status === "fail" ? "FAIL" : "SKIP";
		lines.push(`${tag}  ${r.title}: ${r.proves}`);
		if (r.status === "fail") {
			lines.push(`      what failed: ${r.detail ?? "unknown"}`);
			if (r.remedy) lines.push(`      what to do: ${r.remedy}`);
		} else if (r.status === "skip" && r.detail) lines.push(`      note: ${r.detail}`);
	}
	lines.push("");
	lines.push(report.ok ? `All ${report.passed} guarantees hold on this installation${report.skipped ? ` (${report.skipped} skipped)` : ""}.` : `${report.failed} of ${report.results.length} guarantees do NOT hold on this installation.`);
	return lines.join("\n");
}
//#endregion
export { runConformanceChecks as n, renderConformanceReport as t };
