//#region src/cli/program/register.netcage.ts
function parsePorts(values) {
	const ports = (values ?? []).flatMap((v) => v.split(",")).map((v) => Number(v.trim()));
	if (ports.length === 0) ports.push(11434);
	for (const p of ports) if (!Number.isInteger(p) || p < 1 || p > 65535) throw new Error(`invalid --port value: ${p}`);
	return [...new Set(ports)];
}
function registerNetcageCommand(program) {
	program.command("netcage").description("Run a local model server so it serves this machine but cannot reach the network").command("serve").description("Run a model server (or any command) in a network cage, serving its port locally").option("-p, --port <port...>", "API port(s) the server listens on, served back at the same 127.0.0.1:<port> (default 11434)").argument("<command...>", "the server command and its arguments (after --)").allowUnknownOption(true).action(async (command, options) => {
		const { netCageSupport, serveCaged } = await import("./serve.runtime-Cl-rKqGO.js");
		const support = netCageSupport();
		if (!support.ok) {
			process.stderr.write(`enclawed netcage serve: ${support.reason}\n`);
			process.exit(1);
			return;
		}
		if (command.length === 0) {
			process.stderr.write("enclawed netcage serve: no command given (use -- <command>)\n");
			process.exit(2);
			return;
		}
		let ports;
		try {
			ports = parsePorts(options.port);
		} catch (err) {
			process.stderr.write(`enclawed netcage serve: ${err.message}\n`);
			process.exit(2);
			return;
		}
		const handle = await serveCaged({
			ports,
			command: command[0],
			args: command.slice(1)
		});
		for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => {
			handle.stop();
		});
		const code = await handle.done;
		process.exit(code);
	});
}
//#endregion
export { parsePorts, registerNetcageCommand };
