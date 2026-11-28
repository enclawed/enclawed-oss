import { r as setRuntime } from "./runtime-Dt7e6nAN.js";
import { a as createPolicy, c as LEVEL, d as makeLabel } from "./policy-B_YSjRFl.js";
import { $ as createEgressRunner } from "./src-Bv_GP2Sj.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
//#region src/enclawed/conformance/types.ts
/** A failed expectation inside a check. */
function expectThat(condition, message) {
	if (!condition) throw new Error(message);
}
/**
* Install a sandbox runtime (the given flavor and policy, an in-memory
* audit sink) for the rest of the check. The runner restores the process
* runtime afterwards.
*/
function installSandboxRuntime(flavor, policy = {}) {
	const records = [];
	setRuntime({
		flavor,
		policy: createPolicy({
			enforceAllowlists: false,
			maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
			defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
			...policy
		}),
		audit: {
			append: async (r) => {
				records.push(r);
			},
			flush: async () => {},
			failure: null
		},
		restoreFetch: () => {},
		fipsRequired: false,
		moduleDecisions: null
	});
	return records;
}
/** A throwaway directory, removed when `run` settles. */
async function withTempDir(prefix, run) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "enclawed-conformance-"));
	try {
		const dir = path.join(root, prefix.replace(/[^A-Za-z0-9_-]/g, "_") || "check");
		await fs.mkdir(dir, { mode: 448 });
		return await run(dir);
	} finally {
		await fs.rm(root, {
			recursive: true,
			force: true
		}).catch(() => {});
	}
}
/** Run with environment variables set (undefined removes one), then restore them. */
async function withEnv(vars, run) {
	const saved = {};
	for (const [k, v] of Object.entries(vars)) {
		saved[k] = process.env[k];
		if (v === void 0) delete process.env[k];
		else process.env[k] = v;
	}
	try {
		return await run();
	} finally {
		for (const [k, v] of Object.entries(saved)) if (v === void 0) delete process.env[k];
		else process.env[k] = v;
	}
}
/**
* Whether the egress pipeline runs on this installation. An edition that
* licenses the covert-channel suite refuses to run it unlicensed (fail
* closed); the checks then verify the refusal instead of the mediation.
*/
async function egressSuiteLicensed() {
	try {
		await createEgressRunner({ stages: [] })("probe", {
			kind: "channel",
			id: "conformance"
		});
		return true;
	} catch (err) {
		if (err instanceof Error && err.name === "EgressUnlicensedError") return false;
		throw err;
	}
}
//#endregion
export { withTempDir as a, withEnv as i, expectThat as n, installSandboxRuntime as r, egressSuiteLicensed as t };
