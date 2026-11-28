import { n as getRuntime } from "./runtime-Dt7e6nAN.js";
import { n as HistoryTamperedError, r as SNAPSHOT_HASH_RE } from "./history-store-BftDQjow.js";
import path from "node:path";
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
//#region src/enclawed/history-restore.ts
var RestoreError = class extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "RestoreError";
	}
};
async function restoreSnapshot(opts) {
	const runtime = getRuntime();
	if (!runtime) throw new RestoreError("no-audit", "the audit log is not available; refusing to restore");
	const actor = opts.actor ?? "cli";
	const audit = async (outcome, extra) => {
		await runtime.audit.append({
			type: "history.restore",
			actor,
			level: null,
			payload: {
				hash: opts.hash,
				outcome,
				...extra
			}
		});
	};
	const fail = async (code, message, extra = {}) => {
		await audit("refused", {
			code,
			to: opts.to ?? null,
			...extra
		});
		throw new RestoreError(code, message);
	};
	if (!SNAPSHOT_HASH_RE.test(opts.hash)) return fail("bad-hash", `not a snapshot hash: ${opts.hash}`);
	let content;
	try {
		content = await opts.store.readVerified(opts.hash);
	} catch (err) {
		if (err instanceof HistoryTamperedError) return fail("tampered", err.message);
		return fail("unknown-snapshot", `no snapshot ${opts.hash} in ${opts.store.dir}`);
	}
	const last = (await opts.store.list()).findLast((e) => e.hash === opts.hash);
	if (last?.kind === "symlink" && !last.sandbox) return restoreLink(path.resolve(opts.to ?? last.realPath));
	if (opts.to) return restoreOnHost(path.resolve(opts.to));
	if (!last) return fail("no-target", `snapshot ${opts.hash} has no recorded path; pass --to <path>`);
	if (!last.sandbox) return restoreOnHost(last.realPath);
	const origin = last.sandbox;
	const sandboxInfo = {
		backendId: origin.backendId,
		runtimeId: origin.runtimeId
	};
	const access = opts.openSandbox ? await opts.openSandbox(origin).catch(() => null) : null;
	if (!access) return fail("sandbox-missing", `the ${origin.backendId} sandbox ${origin.runtimeId} this snapshot came from no longer exists; pass --to <host path> to restore it on the host instead`, {
		sandbox: sandboxInfo,
		containerPath: origin.containerPath
	});
	return restoreInSandbox(origin, access);
	async function keepReplaced(current, entry) {
		const put = await opts.store.put(current);
		if (!put.ok) return null;
		await opts.store.record({
			...entry,
			op: "restore",
			hash: put.hash,
			size: current.length,
			tool: "history.restore",
			toolCallId: null,
			agentId: null
		});
		return put.hash;
	}
	async function restoreOnHost(to) {
		let replacedSnapshot = null;
		try {
			if ((await fs.lstat(to)).isFile()) replacedSnapshot = await keepReplaced(await fs.readFile(to), {
				path: to,
				realPath: to
			});
		} catch {}
		try {
			await fs.mkdir(path.dirname(to), { recursive: true });
			const tmp = `${to}.${randomBytes(6).toString("hex")}.restore.tmp`;
			await fs.writeFile(tmp, content, { flag: "wx" });
			await fs.rename(tmp, to);
		} catch (err) {
			return fail("write-failed", `could not write ${to}: ${String(err)}`);
		}
		await audit("restored", {
			to,
			sandbox: null,
			replacedSnapshot,
			size: content.length
		});
		return {
			hash: opts.hash,
			to,
			sandbox: null,
			replacedSnapshot
		};
	}
	/** A symbolic link made again with the text it had (the link itself; nothing is followed). */
	async function restoreLink(to) {
		let replacedSnapshot = null;
		try {
			const st = await fs.lstat(to);
			if (st.isDirectory()) return fail("write-failed", `${to} is now a directory; not replaced by the link`);
			if (st.isFile()) replacedSnapshot = await keepReplaced(await fs.readFile(to), {
				path: to,
				realPath: to
			});
		} catch {}
		try {
			await fs.mkdir(path.dirname(to), { recursive: true });
			const tmp = `${to}.${randomBytes(6).toString("hex")}.restore.tmp`;
			await fs.symlink(content.toString("utf8"), tmp);
			await fs.rename(tmp, to);
		} catch (err) {
			return fail("write-failed", `could not make the link ${to}: ${String(err)}`);
		}
		await audit("restored", {
			to,
			sandbox: null,
			replacedSnapshot,
			size: content.length,
			kind: "symlink"
		});
		return {
			hash: opts.hash,
			to,
			sandbox: null,
			replacedSnapshot
		};
	}
	async function restoreInSandbox(origin, access) {
		const where = {
			filePath: origin.bridgePath,
			cwd: origin.bridgeCwd
		};
		const sandbox = {
			backendId: origin.backendId,
			runtimeId: origin.runtimeId
		};
		let replacedSnapshot = null;
		try {
			if ((await access.stat(where))?.type === "file") replacedSnapshot = await keepReplaced(await access.readFile(where), {
				path: origin.containerPath,
				realPath: origin.containerPath,
				sandbox: origin
			});
		} catch {}
		try {
			await access.writeFile({
				...where,
				data: content,
				mkdir: true
			});
		} catch (err) {
			return fail("write-failed", `could not write ${origin.containerPath}: ${String(err)}`, { sandbox });
		}
		await audit("restored", {
			to: origin.containerPath,
			sandbox,
			replacedSnapshot,
			size: content.length
		});
		return {
			hash: opts.hash,
			to: origin.containerPath,
			sandbox,
			replacedSnapshot
		};
	}
}
//#endregion
export { restoreSnapshot as n, RestoreError as t };
