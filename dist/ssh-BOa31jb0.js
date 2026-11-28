import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import "node:net";
import "node:stream";
//#region src/enclawed/swarm/ssh.ts
/** A private, short control socket path; ssh expands %C per user, host and port. */
function privateControlPath() {
	const dir = path.join(process.env.XDG_RUNTIME_DIR ?? "/tmp", `enclawed-${process.getuid?.() ?? "u"}`);
	mkdirSync(dir, {
		recursive: true,
		mode: 448
	});
	return path.join(dir, "cm-%C");
}
const controlPaths = /* @__PURE__ */ new Map();
/**
* The control socket for this host: the one the operator's ssh configuration
* names, so their own ssh commands share the session, else a private one.
*/
async function resolveControlPath(o) {
	const cached = controlPaths.get(o.host);
	if (cached) return cached;
	const g = await run(o.sshBin ?? "ssh", [
		"-G",
		...o.jump ? ["-J", o.jump] : [],
		o.host
	], false);
	const configured = g.out.split("\n").find((l) => /^controlpath\s/i.test(l))?.replace(/^controlpath\s+/i, "").trim();
	const resolved = g.code === 0 && configured && configured.toLowerCase() !== "none" ? {
		path: configured,
		fromUserConfig: true
	} : {
		path: privateControlPath(),
		fromUserConfig: false
	};
	controlPaths.set(o.host, resolved);
	return resolved;
}
/** The lines that make the operator's own ssh commands share the session. */
function controlPathSnippet(o) {
	return [
		`Host ${o.host.replace(/^.*@/, "")}`,
		`    ControlPath ${privateControlPath()}`,
		"    ControlMaster auto",
		"    ControlPersist 8h"
	].join("\n");
}
function run(bin, args, interactive) {
	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, { stdio: interactive ? "inherit" : [
			"ignore",
			"pipe",
			"pipe"
		] });
		let out = "";
		child.stdout?.on("data", (d) => {
			out += d.toString("utf8");
		});
		child.on("error", reject);
		child.on("exit", (code) => resolve({
			code: code ?? 1,
			out
		}));
	});
}
/** Gets a Kerberos ticket first when the site needs one and there is none. */
async function ensureKerberos(o) {
	if (!o.kerberos) return;
	if ((await run(o.klistBin ?? "klist", ["-s"], false).catch(() => ({
		code: 1,
		out: ""
	}))).code === 0) return;
	const k = await run(o.kinitBin ?? "kinit", o.kerberos.principal ? [o.kerberos.principal] : [], true);
	if (k.code !== 0) throw new Error(`kinit failed (exit ${k.code}); no Kerberos ticket for ${o.host}`);
}
/**
* Makes sure a control master is up, starting one if needed. Starting it is
* the one interactive step: the site's login prompts (password, token code,
* security key touch, host key) happen here, in the operator's terminal. It
* returns where the master listens and whether that came from the operator's
* ssh configuration.
*/
async function ensureMaster(o) {
	const bin = o.sshBin ?? "ssh";
	const cp = await resolveControlPath(o);
	if ((await run(bin, [
		"-o",
		`ControlPath=${cp.path}`,
		"-O",
		"check",
		o.host
	], false)).code === 0) return cp;
	await ensureKerberos(o);
	const start = await run(bin, [
		"-M",
		"-o",
		`ControlPath=${cp.path}`,
		"-o",
		"ControlPersist=8h",
		"-o",
		"StrictHostKeyChecking=yes",
		"-o",
		"ClearAllForwardings=yes",
		...o.kerberos ? ["-o", "GSSAPIAuthentication=yes"] : [],
		...o.kerberos?.forwardTicket ? ["-o", "GSSAPIDelegateCredentials=yes"] : [],
		"-a",
		"-x",
		"-N",
		"-f",
		...o.jump ? ["-J", o.jump] : [],
		o.host
	], true);
	if (start.code !== 0) throw new Error(`ssh to ${o.host} failed (exit ${start.code})`);
	return cp;
}
//#endregion
export { controlPathSnippet, ensureMaster };
