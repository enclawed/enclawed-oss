import { n as scan } from "./dlp-scanner-CAEHT3p2.js";
import { n as getRuntime } from "./runtime-Dt7e6nAN.js";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { createHash } from "node:crypto";
import net from "node:net";
//#region src/enclawed/netcage/alert.ts
const AUDIT_CAP = 1e3;
function destination(a) {
	if (a.name) return a.name;
	if (a.dst) return a.port ? `${a.dst}:${a.port}` : a.dst;
	return a.transport === "ip" ? "an address off this machine" : `port ${a.port}`;
}
function describe(a) {
	return `${a.protocol === "dns" ? "a DNS lookup of" : a.protocol === "tls" ? "a TLS connection to" : a.protocol === "http" ? `an HTTP ${a.request ?? "request"} to` : a.transport === "ip" ? `${a.packets ?? 1} packet(s) to` : `a ${a.transport.toUpperCase()} connection to`} ${destination(a)}`;
}
function dlpFindingsOf(sampleBase64) {
	if (!sampleBase64) return [];
	try {
		return scan(Buffer.from(sampleBase64, "base64").toString("latin1"), { onOversize: "truncate" });
	} catch {
		return [];
	}
}
function createNetCageReporter(opts) {
	const counts = /* @__PURE__ */ new Map();
	let total = 0;
	let audited = 0;
	const who = opts.source === "exec" ? "a command the model ran" : "the model server";
	return {
		onEvent(event) {
			if (event.type === "notice") {
				getRuntime()?.audit.append({
					type: "egress.cage.notice",
					actor: opts.source,
					level: null,
					payload: {
						label: opts.label,
						message: event.message
					}
				}).catch(() => {});
				return;
			}
			if (event.type !== "attempt") return;
			total++;
			const key = `${event.transport}|${destination(event)}`;
			const count = (counts.get(key) ?? 0) + 1;
			counts.set(key, count);
			const findings = [...new Set(dlpFindingsOf(event.sample).map((f) => f.id))];
			if (audited < AUDIT_CAP) {
				audited++;
				getRuntime()?.audit.append({
					type: "egress.cage.attempt",
					actor: opts.source,
					level: null,
					payload: {
						label: opts.label,
						transport: event.transport,
						dst: event.dst,
						port: event.port,
						protocol: event.protocol,
						name: event.name,
						request: event.request,
						bytes: event.bytes,
						packets: event.packets ?? null,
						sampleSha256: event.sample ? createHash("sha256").update(Buffer.from(event.sample, "base64")).digest("hex") : null,
						dlp: findings,
						count
					}
				}).catch(() => {});
			}
			if (count > 1) return;
			const carrying = findings.length > 0 ? ` It carried ${findings.join(", ")}.` : "";
			const message = `Enclawed blocked ${who} (${opts.label}) from reaching the network: ${describe(event)}.${carrying} Nothing left this machine.`;
			try {
				opts.notify({
					source: opts.source,
					label: opts.label,
					attempt: event,
					findings,
					count,
					message
				});
			} catch {}
		},
		attempts: () => total,
		summary: () => [...counts.entries()].map(([key, n]) => {
			const [transport, dest] = key.split("|");
			return `${n} × ${transport} to ${dest}`;
		})
	};
}
//#endregion
//#region src/enclawed/netcage/cage.ts
let support = null;
/** Whether this host can cage a process (cached after the first probe). */
function netCageSupport() {
	if (support) return support;
	if (process.platform !== "linux") {
		support = {
			ok: false,
			reason: `network cage needs Linux namespaces (platform ${process.platform})`
		};
		return support;
	}
	const probe = spawnSync("unshare", [...UNSHARE_FLAGS, "true"], {
		stdio: "ignore",
		timeout: 1e4
	});
	support = probe.status === 0 ? { ok: true } : {
		ok: false,
		reason: probe.error && probe.error.code === "ENOENT" ? "unshare (util-linux) is not installed" : "unprivileged user namespaces are disabled on this host"
	};
	return support;
}
const UNSHARE_FLAGS = [
	"--user",
	"--map-root-user",
	"--net",
	"--mount",
	"--pid",
	"--fork",
	"--mount-proc",
	"--kill-child"
];
function cageInitCommand() {
	const here = path.dirname(fileURLToPath(import.meta.url));
	const roots = [
		here,
		path.join(here, ".."),
		path.join(here, "..", "..")
	];
	const relatives = ["cage-init.js", path.join("enclawed", "netcage", "cage-init.js")];
	for (const root of roots) for (const rel of relatives) {
		const c = path.join(root, rel);
		if (fs.existsSync(c)) return [process.execPath, c];
	}
	const src = path.join(here, "cage-init.ts");
	if (fs.existsSync(src)) return [
		process.execPath,
		"--import",
		fileURLToPath(import.meta.resolve("tsx")),
		src
	];
	throw new Error("enclawed netcage: cage-init is missing from this install");
}
/**
* Set up the host side of a cage: a private directory with the event socket
* that cage-init reports to. One NetCage can wrap one command.
*/
async function openNetCage(opts) {
	const sup = netCageSupport();
	if (!sup.ok) throw new Error(`enclawed netcage: ${sup.reason}`);
	const sockDir = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-netcage-"));
	fs.chmodSync(sockDir, 448);
	const eventSock = path.join(sockDir, "events.sock");
	const conns = /* @__PURE__ */ new Set();
	const server = net.createServer((sock) => {
		conns.add(sock);
		let buf = "";
		sock.setEncoding("utf8");
		sock.on("data", (chunk) => {
			buf += chunk;
			let nl;
			while ((nl = buf.indexOf("\n")) >= 0) {
				const line = buf.slice(0, nl);
				buf = buf.slice(nl + 1);
				let event;
				try {
					event = JSON.parse(line);
				} catch {
					continue;
				}
				try {
					opts.onEvent(event);
				} catch {}
			}
		});
		sock.on("error", () => {});
		sock.on("close", () => conns.delete(sock));
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(eventSock, () => resolve());
	});
	const init = cageInitCommand();
	return {
		wrap(command, args, cwd) {
			const cfg = {
				command,
				args,
				cwd,
				expose: opts.expose ?? [],
				sockDir,
				eventSock,
				socketScanRoots: opts.socketScanRoots ?? [os.homedir()]
			};
			return {
				argv: [
					"unshare",
					...UNSHARE_FLAGS,
					...init
				],
				env: { ENCLAWED_NETCAGE: JSON.stringify(cfg) }
			};
		},
		exposedSocket(port) {
			return path.join(sockDir, `${port}.sock`);
		},
		async close() {
			await new Promise((r) => setTimeout(r, 50));
			for (const c of conns) c.destroy();
			await new Promise((resolve) => server.close(() => resolve()));
			fs.rmSync(sockDir, {
				recursive: true,
				force: true
			});
		}
	};
}
/** Quote one argument for a POSIX shell. */
function shellQuote(arg) {
	return /^[A-Za-z0-9_@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
}
//#endregion
export { createNetCageReporter as i, openNetCage as n, shellQuote as r, netCageSupport as t };
