import { n as unixSocketFilter, t as seccompArch } from "./seccomp-CIA_A4QH.js";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import os from "node:os";
import net from "node:net";
import dgram from "node:dgram";
//#region src/enclawed/netcage/sniff.ts
const MAX_NAME = 253;
/**
* The first question name of a DNS query, or null. Case is kept: DNS
* matching ignores it, but encoded exfiltration (base64 labels) uses it.
*/
function parseDnsQuestion(buf) {
	try {
		if (buf.length < 12) return null;
		if ((buf[4] << 8 | buf[5]) < 1) return null;
		const labels = [];
		let off = 12;
		let total = 0;
		for (;;) {
			if (off >= buf.length) return null;
			const len = buf[off];
			if (len === 0) {
				off += 1;
				break;
			}
			if (len > 63 || off + 1 + len > buf.length) return null;
			total += len + 1;
			if (total > MAX_NAME + 1) return null;
			labels.push(Buffer.from(buf.subarray(off + 1, off + 1 + len)).toString("latin1"));
			off += 1 + len;
		}
		if (off + 4 > buf.length || labels.length === 0) return null;
		return {
			name: labels.join("."),
			type: buf[off] << 8 | buf[off + 1]
		};
	} catch {
		return null;
	}
}
/**
* A DNS answer for `query` that points the name at `sinkhole` (IPv4), so the
* caller's follow-up connection lands on the trap too and shows what it
* meant to send. Non-A questions get an empty NOERROR answer.
*/
function dnsSinkholeAnswer(query, sinkhole) {
	const q = parseDnsQuestion(query);
	if (!q) return null;
	let end = 12;
	while (query[end] !== 0) end += 1 + query[end];
	end += 5;
	const head = Buffer.from(query.subarray(0, end));
	head[2] = 129;
	head[3] = 128;
	head.writeUInt16BE(1, 4);
	head.writeUInt16BE(0, 8);
	head.writeUInt16BE(0, 10);
	const octets = sinkhole.split(".").map(Number);
	if (q.type !== 1 || octets.length !== 4 || octets.some((o) => !(o >= 0 && o <= 255))) {
		head.writeUInt16BE(0, 6);
		return head;
	}
	head.writeUInt16BE(1, 6);
	const answer = Buffer.from([
		192,
		12,
		0,
		1,
		0,
		1,
		0,
		0,
		0,
		30,
		0,
		4,
		...octets
	]);
	return Buffer.concat([head, answer]);
}
/** The server name (SNI) of a TLS ClientHello, or null. */
function parseTlsSni(buf) {
	try {
		if (buf.length < 43 || buf[0] !== 22 || buf[5] !== 1) return null;
		let off = 43;
		const sid = buf[off];
		off += 1 + sid;
		if (off + 2 > buf.length) return null;
		const suites = buf[off] << 8 | buf[off + 1];
		off += 2 + suites;
		if (off + 1 > buf.length) return null;
		off += 1 + buf[off];
		if (off + 2 > buf.length) return null;
		const extEnd = Math.min(buf.length, off + 2 + (buf[off] << 8 | buf[off + 1]));
		off += 2;
		while (off + 4 <= extEnd) {
			const type = buf[off] << 8 | buf[off + 1];
			const len = buf[off + 2] << 8 | buf[off + 3];
			off += 4;
			if (type === 0 && off + 5 <= extEnd) {
				const nameLen = buf[off + 3] << 8 | buf[off + 4];
				if (buf[off + 2] !== 0 || nameLen > MAX_NAME || off + 5 + nameLen > extEnd) return null;
				return Buffer.from(buf.subarray(off + 5, off + 5 + nameLen)).toString("latin1").toLowerCase();
			}
			off += len;
		}
		return null;
	} catch {
		return null;
	}
}
const HTTP_METHODS = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE) (\S{1,2048}) HTTP\/1\.[01]$/;
/** The request line and Host header of a plain HTTP/1.x request, or null. */
function parseHttpRequestHead(buf) {
	try {
		const lines = Buffer.from(buf.subarray(0, 8192)).toString("latin1").split("\r\n");
		const m = HTTP_METHODS.exec(lines[0] ?? "");
		if (!m) return null;
		let host = null;
		for (const line of lines.slice(1)) {
			if (line === "") break;
			const h = /^host:\s*(\S{1,300})\s*$/i.exec(line);
			if (h) {
				host = h[1].toLowerCase();
				break;
			}
		}
		return {
			method: m[1],
			target: m[2],
			host
		};
	} catch {
		return null;
	}
}
/** Classify the first bytes of a trapped attempt. */
function summarizeCapture(buf, transport, port) {
	if (port === 53 || port === 5353) {
		const dns = parseDnsQuestion(transport === "tcp" ? buf.subarray(2) : buf);
		if (dns) return {
			protocol: "dns",
			name: dns.name,
			request: null
		};
	}
	const sni = parseTlsSni(buf);
	if (sni !== null) return {
		protocol: "tls",
		name: sni,
		request: null
	};
	const http = parseHttpRequestHead(buf);
	if (http) return {
		protocol: "http",
		name: http.host,
		request: `${http.method} ${http.target}`
	};
	const dns = parseDnsQuestion(buf);
	if (transport === "udp" && dns) return {
		protocol: "dns",
		name: dns.name,
		request: null
	};
	return {
		protocol: "unknown",
		name: null,
		request: null
	};
}
//#endregion
//#region src/enclawed/netcage/cage-init.ts
const SINKHOLE_IPV4 = "198.18.0.1";
const TRAPPED_ADDRESSES = [
	"198.18.0.0/24",
	"169.254.169.254/32",
	"169.254.170.2/32",
	"100.100.100.200/32",
	"fd00:ec2::254/128"
];
const SINK_DEV = "enclawed-sink";
const POLL_MS = 100;
const CAGE_EPHEMERAL = [61e3, 61999];
const CAPTURE_BYTES = 4096;
const CAPTURE_MS = 1500;
const inflight = /* @__PURE__ */ new Set();
const COMMON_HIGH = [
	1080,
	1194,
	1433,
	1521,
	1883,
	2049,
	2375,
	2376,
	3e3,
	3128,
	3306,
	3389,
	4443,
	4444,
	5e3,
	5222,
	5432,
	5555,
	5671,
	5672,
	5900,
	6e3,
	6379,
	6443,
	6667,
	7e3,
	7443,
	8e3,
	8008,
	8080,
	8081,
	8088,
	8443,
	8883,
	8888,
	9e3,
	9001,
	9090,
	9200,
	9443,
	1e4,
	11211,
	27017,
	5e4,
	50050,
	51820
];
function trapPortList(exclude) {
	const skip = new Set(exclude);
	const out = [];
	const add = (p) => {
		if (!skip.has(p) && !(p >= CAGE_EPHEMERAL[0] && p <= CAGE_EPHEMERAL[1])) out.push(p);
	};
	for (let p = 1; p <= 1023; p++) add(p);
	COMMON_HIGH.forEach(add);
	return out;
}
const SCRUBBED_ENV = [
	"SSH_AUTH_SOCK",
	"GPG_AGENT_INFO",
	"DBUS_SESSION_BUS_ADDRESS",
	"DBUS_SYSTEM_BUS_ADDRESS",
	"WSL_INTEROP",
	"DOCKER_HOST",
	"CONTAINER_HOST",
	"TMUX",
	"WAYLAND_DISPLAY",
	"PULSE_SERVER",
	"http_proxy",
	"https_proxy",
	"all_proxy",
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"ALL_PROXY"
];
function scrubCageEnv(env) {
	const out = { ...env };
	for (const k of SCRUBBED_ENV) delete out[k];
	delete out.ENCLAWED_NETCAGE;
	return out;
}
async function connectEmitter(sockPath) {
	const sock = await new Promise((resolve) => {
		const s = net.connect(sockPath);
		s.once("connect", () => resolve(s));
		s.once("error", () => resolve(null));
	});
	if (!sock) {
		process.stderr.write("enclawed netcage: no event socket; blocking without reporting\n");
		return {
			emit: () => {},
			close: async () => {}
		};
	}
	let open = true;
	sock.on("error", () => {
		open = false;
	});
	return {
		emit: (event) => {
			if (open) sock.write(`${JSON.stringify({
				...event,
				at: (/* @__PURE__ */ new Date()).toISOString()
			})}\n`);
		},
		close: () => new Promise((resolve) => open ? sock.end(() => resolve()) : resolve())
	};
}
function run(cmd, args) {
	try {
		execFileSync(cmd, args, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}
/** Nameserver addresses from resolv.conf text. */
function parseNameservers(resolvConf) {
	const out = [];
	for (const line of resolvConf.split("\n")) {
		const m = /^\s*nameserver\s+([0-9a-fA-F.:]+)(?:%\S+)?\s*$/.exec(line);
		if (m && net.isIP(m[1])) out.push(m[1]);
	}
	return out;
}
function setUpNetwork(emit) {
	let nameservers = [];
	try {
		nameservers = parseNameservers(fs.readFileSync("/etc/resolv.conf", "utf8"));
	} catch {}
	const ok = run("ip", [
		"link",
		"set",
		"lo",
		"up"
	]) && run("ip", [
		"link",
		"add",
		SINK_DEV,
		"type",
		"dummy"
	]) && run("ip", [
		"link",
		"set",
		SINK_DEV,
		"up"
	]) && run("ip", [
		"addr",
		"add",
		"10.199.0.1/30",
		"dev",
		SINK_DEV
	]) && run("ip", [
		"neigh",
		"add",
		"10.199.0.2",
		"lladdr",
		"02:00:00:00:00:02",
		"dev",
		SINK_DEV
	]) && run("ip", [
		"route",
		"add",
		"default",
		"via",
		"10.199.0.2",
		"dev",
		SINK_DEV
	]);
	if (ok) {
		run("ip", [
			"-6",
			"addr",
			"add",
			"fd99::1/64",
			"dev",
			SINK_DEV,
			"nodad"
		]);
		run("ip", [
			"-6",
			"neigh",
			"add",
			"fd99::2",
			"lladdr",
			"02:00:00:00:00:02",
			"dev",
			SINK_DEV
		]);
		run("ip", [
			"-6",
			"route",
			"add",
			"default",
			"via",
			"fd99::2",
			"dev",
			SINK_DEV
		]);
		for (const cidr of [...TRAPPED_ADDRESSES, ...nameservers]) run("ip", [
			...cidr.includes(":") ? ["-6"] : [],
			"route",
			"add",
			"local",
			cidr,
			"dev",
			"lo"
		]);
	}
	try {
		fs.writeFileSync("/proc/sys/net/ipv4/ip_local_port_range", `${CAGE_EPHEMERAL[0]} ${CAGE_EPHEMERAL[1]}`);
	} catch {}
	if (!ok) emit({
		type: "notice",
		message: "network cage is blocking but cannot record attempts (iproute2 missing)"
	});
	return {
		watching: ok,
		local: new Set(nameservers)
	};
}
/** Transmitted-packet count of an interface, from /proc/net/dev text. */
function txPackets(procNetDev, dev) {
	for (const line of procNetDev.split("\n")) {
		const idx = line.indexOf(":");
		if (idx > 0 && line.slice(0, idx).trim() === dev) {
			const cols = line.slice(idx + 1).trim().split(/\s+/);
			const n = Number(cols[9]);
			return Number.isFinite(n) ? n : null;
		}
	}
	return null;
}
function hexToIp(hex) {
	if (hex.length === 8) {
		const b = Buffer.from(hex, "hex");
		return `${b[3]}.${b[2]}.${b[1]}.${b[0]}`;
	}
	const words = hex.match(/.{8}/g) ?? [];
	const groups = Buffer.concat(words.map((w) => Buffer.from(Buffer.from(w, "hex").toReversed()))).toString("hex").match(/.{4}/g) ?? [];
	if (groups.slice(0, 5).every((g) => g === "0000") && groups[5] === "ffff") return hexToIp(hex.slice(24));
	try {
		return new URL(`http://[${groups.join(":")}]/`).hostname.slice(1, -1);
	} catch {
		return groups.join(":");
	}
}
/**
* Remote endpoints of sockets that are connecting or connected to an
* address off the machine, from /proc/net/{tcp,tcp6,udp,udp6} text. A socket
* whose peer is local (loopback, or an address the cage made local) is not
* an attempt to leave and is skipped by the caller's `isLocal`.
*/
function remoteEndpoints(procNetText, isLocal) {
	const out = [];
	for (const line of procNetText.split("\n").slice(1)) {
		const cols = line.trim().split(/\s+/);
		if (cols.length < 10) continue;
		const [hex, portHex] = (cols[2] ?? "").split(":");
		if (!hex || !portHex) continue;
		const port = parseInt(portHex, 16);
		if (port === 0) continue;
		const dst = hexToIp(hex);
		if (!isLocal(dst)) out.push({
			dst,
			port,
			inode: cols[9]
		});
	}
	return out;
}
function isCageLocal(ip, extra) {
	if (extra.has(ip)) return true;
	if (ip === "::1" || ip.startsWith("127.") || ip === "0.0.0.0" || ip === "::") return true;
	if (ip.startsWith("198.18.0.") || ip.startsWith("10.199.0.")) return true;
	return [
		"169.254.169.254",
		"169.254.170.2",
		"100.100.100.200",
		"fd00:ec2::254"
	].includes(ip);
}
function watchSink(emit, local) {
	const read = (p) => {
		try {
			return fs.readFileSync(p, "utf8");
		} catch {
			return "";
		}
	};
	let last = txPackets(read("/proc/net/dev"), SINK_DEV) ?? 0;
	const reported = /* @__PURE__ */ new Set();
	const tick = () => {
		const tx = txPackets(read("/proc/net/dev"), SINK_DEV) ?? last;
		if (tx === last) return;
		const packets = tx - last;
		last = tx;
		let explained = 0;
		for (const [file, transport] of [
			["/proc/net/tcp", "tcp"],
			["/proc/net/tcp6", "tcp"],
			["/proc/net/udp", "udp"],
			["/proc/net/udp6", "udp"]
		]) for (const ep of remoteEndpoints(read(file), (ip) => isCageLocal(ip, local))) {
			explained += transport === "tcp" ? 1 : Number.POSITIVE_INFINITY;
			const key = `${transport}:${ep.inode}:${ep.dst}:${ep.port}`;
			if (reported.has(key)) continue;
			reported.add(key);
			emit({
				type: "attempt",
				transport,
				dst: ep.dst,
				port: ep.port,
				bytes: 0,
				protocol: "unknown",
				name: null,
				request: null,
				sample: ""
			});
		}
		if (packets > explained) emit({
			type: "attempt",
			transport: "ip",
			dst: null,
			port: 0,
			bytes: 0,
			packets: packets - explained,
			protocol: "unknown",
			name: null,
			request: null,
			sample: ""
		});
	};
	const timer = setInterval(tick, POLL_MS);
	timer.unref();
	return () => {
		tick();
		clearInterval(timer);
	};
}
function hidePrivateTrees(emit) {
	for (const dir of [
		"/run",
		"/dev/shm",
		"/mnt/wslg"
	]) if (fs.existsSync(dir) && !run("mount", [
		"-t",
		"tmpfs",
		"-o",
		"mode=755",
		"tmpfs",
		dir
	])) emit({
		type: "notice",
		message: `could not hide ${dir}`
	});
}
/**
* The argv that runs the command under the Unix-socket filter: bubblewrap in
* its own PID namespace with a fresh /proc (the command cannot see or trace
* this process, which holds the cage's own sockets), reading the filter from
* fd 3. Throws when this architecture has no filter: the command is not run.
*/
function filteredCommand(cfg) {
	if (!seccompArch()) throw new Error(`no Unix-socket filter for architecture ${process.arch}; the command is not run`);
	return [
		"bwrap",
		"--dev-bind",
		"/",
		"/",
		"--unshare-pid",
		"--proc",
		"/proc",
		"--die-with-parent",
		"--seccomp",
		"3",
		...cfg.cwd ? ["--chdir", cfg.cwd] : [],
		"--",
		cfg.command,
		...cfg.args
	];
}
function startTraps(ports, emit, dnsAnswer = () => SINKHOLE_IPV4) {
	const pending = [];
	for (const port of ports) {
		pending.push(new Promise((resolve) => {
			const server = net.createServer((sock) => {
				const dst = sock.localAddress?.replace(/^::ffff:/, "") ?? "";
				const chunks = [];
				let size = 0;
				let done = false;
				const finish = () => {
					if (done) return;
					done = true;
					inflight.delete(finish);
					const sample = Buffer.concat(chunks).subarray(0, CAPTURE_BYTES);
					emit({
						type: "attempt",
						transport: "tcp",
						dst,
						port,
						bytes: size,
						...summarizeCapture(sample, "tcp", port),
						sample: sample.toString("base64")
					});
					sock.destroy();
				};
				inflight.add(finish);
				sock.on("data", (d) => {
					size += d.length;
					if (Buffer.concat(chunks).length < CAPTURE_BYTES) chunks.push(d);
					if (size >= CAPTURE_BYTES) finish();
				});
				sock.on("error", finish);
				sock.on("end", finish);
				setTimeout(finish, CAPTURE_MS).unref();
			});
			server.on("error", () => resolve());
			server.listen({
				port,
				host: "::",
				ipv6Only: false,
				backlog: 16
			}, () => resolve());
		}));
		pending.push(new Promise((resolve) => {
			const udp = dgram.createSocket({
				type: "udp6",
				ipv6Only: false
			});
			udp.on("error", () => resolve());
			udp.on("message", (msg, rinfo) => {
				const summary = summarizeCapture(msg, "udp", port);
				emit({
					type: "attempt",
					transport: "udp",
					dst: null,
					port,
					bytes: msg.length,
					...summary,
					sample: msg.subarray(0, CAPTURE_BYTES).toString("base64")
				});
				if (summary.protocol === "dns") {
					const answer = dnsSinkholeAnswer(msg, dnsAnswer(summary.name ?? ""));
					if (answer) udp.send(answer, rinfo.port, rinfo.address);
				}
			});
			udp.bind({
				port,
				address: "::"
			}, () => resolve());
		}));
	}
	return Promise.all(pending).then(() => void 0);
}
function startRelays(cfg) {
	return Promise.all(cfg.expose.map((port) => new Promise((resolve, reject) => {
		const sockPath = path.join(cfg.sockDir, `${port}.sock`);
		fs.rmSync(sockPath, { force: true });
		const server = net.createServer((client) => {
			const upstream = net.connect(port, "127.0.0.1");
			client.pipe(upstream).pipe(client);
			const close = () => {
				client.destroy();
				upstream.destroy();
			};
			client.on("error", close);
			upstream.on("error", close);
		});
		server.on("error", reject);
		server.listen(sockPath, () => resolve());
	}))).then(() => void 0);
}
async function cageInit(cfg) {
	const emitter = await connectEmitter(cfg.eventSock);
	const emit = emitter.emit;
	const { watching, local } = setUpNetwork(emit);
	await startRelays(cfg);
	hidePrivateTrees(emit);
	await startTraps(trapPortList(cfg.expose), emit);
	const stopWatch = watching ? watchSink(emit, local) : () => {};
	emit({ type: "ready" });
	const arch = seccompArch();
	const [prog, ...progArgs] = filteredCommand(cfg);
	const child = spawn(prog, progArgs, {
		cwd: cfg.cwd,
		env: scrubCageEnv(process.env),
		stdio: [
			"inherit",
			"inherit",
			"inherit",
			"pipe"
		]
	});
	child.stdio[3]?.end(unixSocketFilter(arch));
	for (const sig of [
		"SIGTERM",
		"SIGINT",
		"SIGHUP"
	]) process.on(sig, () => child.kill(sig));
	const code = await new Promise((resolve) => {
		child.on("error", (err) => {
			process.stderr.write(`enclawed netcage: ${err.message}\n`);
			resolve(127);
		});
		child.on("exit", (c, signal) => resolve(c ?? (signal ? 128 + (os.constants.signals[signal] ?? 0) : 1)));
	});
	stopWatch();
	return {
		code,
		emitter
	};
}
const raw = process.env.ENCLAWED_NETCAGE;
if (raw && process.argv[1] && path.basename(process.argv[1]).startsWith("cage-init")) cageInit(JSON.parse(raw)).then(async ({ code, emitter }) => {
	for (const finish of Array.from(inflight)) finish();
	await emitter.close();
	process.exit(code);
}, (err) => {
	process.stderr.write(`enclawed netcage: ${err instanceof Error ? err.message : String(err)}\n`);
	process.exit(126);
});
//#endregion
export { connectEmitter as a, parseNameservers as c, setUpNetwork as d, startTraps as f, watchSink as h, cageInit as i, remoteEndpoints as l, txPackets as m, SINKHOLE_IPV4 as n, filteredCommand as o, trapPortList as p, TRAPPED_ADDRESSES as r, inflight as s, CAGE_EPHEMERAL as t, scrubCageEnv as u };
