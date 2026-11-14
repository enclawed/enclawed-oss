import { i as createNetCageReporter, n as openNetCage, t as netCageSupport } from "./cage-BrxI4Bj_.js";
import net from "node:net";
//#region src/enclawed/netcage/serve.ts
function forwardPortToSocket(port, sockPath) {
	return new Promise((resolve, reject) => {
		const server = net.createServer((client) => {
			const upstream = net.connect(sockPath);
			const close = () => {
				client.destroy();
				upstream.destroy();
			};
			client.pipe(upstream).on("error", close);
			upstream.pipe(client).on("error", close);
			client.on("error", close);
			upstream.on("error", close);
		});
		server.on("error", reject);
		server.listen(port, "127.0.0.1", () => resolve(server));
	});
}
async function serveCaged(opts) {
	const support = netCageSupport();
	if (!support.ok) throw new Error(`enclawed netcage serve: ${support.reason}`);
	const log = opts.log ?? ((line) => process.stderr.write(`${line}\n`));
	const label = opts.label ?? opts.command;
	const reporter = createNetCageReporter({
		source: "model-server",
		label,
		notify: (alert) => {
			log(`[enclawed] ${alert.message}`);
			opts.onAlert?.(alert);
		}
	});
	const cage = await openNetCage({
		expose: opts.ports,
		onEvent: reporter.onEvent
	});
	const forwarders = [];
	try {
		for (const port of opts.ports) {
			forwarders.push(await forwardPortToSocket(port, cage.exposedSocket(port)));
			log(`[enclawed] model server reachable at http://127.0.0.1:${port} (caged)`);
		}
	} catch (err) {
		for (const f of forwarders) f.close();
		await cage.close();
		throw err;
	}
	const { spawn } = await import("node:child_process");
	const { argv, env } = cage.wrap(opts.command, opts.args, opts.cwd);
	const child = spawn(argv[0], argv.slice(1), {
		env: {
			...process.env,
			...env
		},
		stdio: [
			"inherit",
			"inherit",
			"inherit"
		],
		detached: true
	});
	const killGroup = (signal) => {
		try {
			if (child.pid !== void 0) process.kill(-child.pid, signal);
		} catch {}
	};
	let stopped = false;
	const teardown = async () => {
		for (const f of forwarders) f.close();
		await cage.close();
		const repeats = reporter.summary().filter((l) => !l.startsWith("1 × "));
		if (repeats.length > 0) log(`[enclawed] ${label} was blocked from the network repeatedly: ${repeats.join("; ")}`);
	};
	const done = new Promise((resolve) => {
		child.on("error", (err) => {
			log(`[enclawed] model server failed to start: ${err.message}`);
			resolve(127);
		});
		child.on("exit", async (code, signal) => {
			await teardown();
			resolve(code ?? (signal ? 1 : 0));
		});
	});
	return {
		done,
		stop: async () => {
			if (stopped) return;
			stopped = true;
			killGroup("SIGTERM");
			const forced = setTimeout(() => killGroup("SIGKILL"), 2e3);
			forced.unref();
			await done;
			clearTimeout(forced);
		},
		summary: reporter.summary
	};
}
//#endregion
export { netCageSupport, serveCaged };
