import { n as getRuntime } from "./runtime-Dt7e6nAN.js";
import { n as parseLauncher, t as isLauncherVerb } from "./launchers-BjbxoD8l.js";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
//#region src/enclawed/hpc/remote.ts
const SSH_FLAGS = new Set("46AaCfGgKkMNnqsTtVvXxYy".split(""));
const SSH_VALUED = new Set("BbcDEeFIiJLlmOoPpQRSWw".split(""));
/** Options refused outright, and why. */
const SSH_REFUSED = {
	L: "forwards a local port",
	R: "forwards a remote port",
	D: "opens a SOCKS proxy",
	W: "forwards stdio to another host",
	w: "opens a tunnel device",
	F: "reads an ssh configuration the gate cannot see",
	A: "forwards the SSH agent",
	X: "forwards X11",
	Y: "forwards X11",
	f: "backgrounds the session",
	M: "creates a connection master",
	S: "chooses a control socket",
	G: "prints configuration instead of connecting",
	s: "requests a subsystem instead of a command",
	Q: "queries instead of connecting",
	O: "controls a connection master",
	B: "binds to an interface",
	b: "binds to an address",
	E: "writes a log file",
	p: "chooses the port; the site's SSH port is fixed by its configuration"
};
/** `-o Key=value` settings an agent may use; everything else is refused. */
const SSH_OPTIONS_ALLOWED = {
	batchmode: (v) => /^(yes|no)$/i.test(v),
	connecttimeout: (v) => /^\d+$/.test(v),
	serveraliveinterval: (v) => /^\d+$/.test(v),
	serveralivecountmax: (v) => /^\d+$/.test(v),
	stricthostkeychecking: (v) => /^yes$/i.test(v),
	loglevel: (v) => /^(quiet|fatal|error|info|verbose)$/i.test(v),
	identitiesonly: (v) => /^(yes|no)$/i.test(v),
	user: (v) => /^[A-Za-z0-9._-]+$/.test(v)
};
function parseTarget(text) {
	const m = /^(?:([A-Za-z0-9._-]+)@)?([A-Za-z0-9.-]+)$/.exec(text.replace(/^ssh:\/\//, ""));
	return m ? {
		user: m[1] ?? null,
		host: m[2]
	} : null;
}
/** Parses `ssh [options] [user@]host [command...]` (the words after "ssh"). */
function parseSsh(args) {
	const out = {
		target: null,
		jumps: [],
		command: null,
		problems: []
	};
	let i = 0;
	for (; i < args.length; i++) {
		const w = args[i];
		if (w.dynamic) {
			out.problems.push(`ssh argument "${w.text}" is computed at run time`);
			return out;
		}
		if (w.text === "--") {
			i += 1;
			break;
		}
		if (!w.text.startsWith("-") || w.text === "-") break;
		const letters = w.text.slice(1);
		for (let j = 0; j < letters.length; j++) {
			const f = letters[j];
			if (SSH_REFUSED[f]) out.problems.push(`ssh -${f} ${SSH_REFUSED[f]}`);
			if (SSH_VALUED.has(f)) {
				const attached = letters.slice(j + 1);
				const value = attached || args[i + 1]?.text;
				if (!attached) i += 1;
				if (value === void 0) out.problems.push(`ssh -${f} needs a value`);
				else if (args[i]?.dynamic) out.problems.push(`ssh -${f} value is computed at run time`);
				else if (f === "o") {
					const m = /^([A-Za-z]+)\s*[= ]\s*(.*)$/.exec(value);
					const check = m ? SSH_OPTIONS_ALLOWED[m[1].toLowerCase()] : void 0;
					if (!m || !check || !check(m[2])) out.problems.push(`ssh -o ${value} is not an option the gate allows`);
				} else if (f === "J") for (const hop of value.split(",")) {
					const t = parseTarget(hop.replace(/:\d+$/, ""));
					if (t) out.jumps.push(t);
					else out.problems.push(`ssh -J ${hop} is not a host`);
				}
				break;
			}
			if (!SSH_FLAGS.has(f)) out.problems.push(`ssh -${f} is not an option the gate knows`);
		}
	}
	const dest = args[i];
	if (!dest) {
		out.problems.push("ssh without a destination");
		return out;
	}
	out.target = parseTarget(dest.text);
	if (!out.target) out.problems.push(`ssh destination "${dest.text}" is not a host`);
	const rest = args.slice(i + 1);
	if (rest.some((w) => w.dynamic)) out.problems.push("the remote command is computed at run time");
	out.command = rest.length > 0 ? rest.map((w) => w.text).join(" ") : null;
	return out;
}
/** Splits `[user@]host:path`; local paths have no colon before the first slash. */
function remotePath(text) {
	const m = /^((?:[A-Za-z0-9._-]+@)?[A-Za-z0-9.-]+):(.*)$/.exec(text);
	if (!m || text.startsWith("/") || text.startsWith(".")) return null;
	const host = parseTarget(m[1]);
	return host ? {
		host,
		path: m[2] || "."
	} : null;
}
/** Parses scp or rsync (the words after the command name). */
function parseCopy(tool, args) {
	const out = {
		uploads: [],
		downloads: [],
		localOnly: false,
		problems: []
	};
	const operands = [];
	const scpValued = new Set([
		"-c",
		"-F",
		"-i",
		"-J",
		"-l",
		"-o",
		"-P",
		"-S",
		"-X"
	]);
	for (let i = 0; i < args.length; i++) {
		const w = args[i];
		if (w.dynamic) {
			out.problems.push(`${tool} argument "${w.text}" is computed at run time`);
			return out;
		}
		const t = w.text;
		if (tool === "scp" && t.startsWith("-") && t !== "-") {
			if (t === "-F" || t === "-S" || t === "-o" || t === "-J" || t === "-3" || t === "-P") out.problems.push(`scp ${t} changes how or where scp connects`);
			if (scpValued.has(t)) i += 1;
			continue;
		}
		if (tool === "rsync" && t.startsWith("-")) {
			if (/^(-e|--rsh|--rsync-path)/.test(t) || /^-[A-Za-z]*e/.test(t)) out.problems.push(`rsync ${t} chooses the remote shell or program`);
			if (/^--(daemon|server|files-from|include-from|exclude-from)/.test(t)) out.problems.push(`rsync ${t} is not allowed`);
			continue;
		}
		if (t.includes("::") || t.startsWith("rsync://")) {
			out.problems.push(`${tool} to an rsync daemon is not allowed`);
			continue;
		}
		operands.push(t);
	}
	if (operands.length < 2) {
		out.problems.push(`${tool} needs a source and a destination`);
		return out;
	}
	const dest = operands[operands.length - 1];
	const sources = operands.slice(0, -1);
	const destRemote = remotePath(dest);
	for (const src of sources) {
		const srcRemote = remotePath(src);
		if (srcRemote && destRemote) out.problems.push(`${tool} between two remote hosts is not allowed`);
		else if (destRemote) out.uploads.push({
			local: src,
			host: destRemote.host,
			remote: destRemote.path
		});
		else if (srcRemote) out.downloads.push({
			host: srcRemote.host,
			remote: srcRemote.path,
			local: dest
		});
	}
	out.localOnly = out.uploads.length === 0 && out.downloads.length === 0 && out.problems.length === 0;
	return out;
}
/** True when `p` (resolved against `base`) lies inside directory `dir`. */
function within(dir, p, base = "/") {
	const root = path.posix.resolve(dir);
	const abs = path.posix.resolve(base, p);
	return abs === root || abs.startsWith(root.endsWith("/") ? root : `${root}/`);
}
//#endregion
//#region src/enclawed/hpc/shell-words.ts
const OPERATOR_CHARS = new Set([
	";",
	"&",
	"|",
	"\n",
	"(",
	")"
]);
const REDIRECT_RE = /^[0-9]*(>>|>&|<&|<<-?|<>|>\||>|<)$/;
/** Splits a command line into simple commands. */
function parseCommandLine(input) {
	const commands = [];
	let current = {
		words: [],
		stdinFile: null,
		heredoc: false
	};
	let pendingRedirect = null;
	let i = 0;
	const endCommand = () => {
		if (current.words.length > 0 || current.heredoc || current.stdinFile) commands.push(current);
		current = {
			words: [],
			stdinFile: null,
			heredoc: false
		};
	};
	const pushWord = (w) => {
		if (pendingRedirect !== null) {
			if (pendingRedirect.startsWith("<<")) current.heredoc = true;
			else if (pendingRedirect === "<") current.stdinFile = w;
			pendingRedirect = null;
			return;
		}
		if (REDIRECT_RE.test(w.text) && !w.dynamic) {
			pendingRedirect = w.text.replace(/^[0-9]+/, "");
			return;
		}
		const glued = /^[0-9]*(>>|>|<)(.+)$/.exec(w.text);
		if (glued && !w.dynamic && !w.text.startsWith("<<")) {
			if (glued[1] === "<") current.stdinFile = {
				text: glued[2],
				dynamic: false
			};
			return;
		}
		current.words.push(w);
	};
	while (i < input.length) {
		const c = input[i];
		if (c === " " || c === "	" || c === "\r") {
			i += 1;
			continue;
		}
		if (c === "#") {
			while (i < input.length && input[i] !== "\n") i += 1;
			continue;
		}
		if (c === "&" && pendingRedirect !== null) {
			i += 1;
			continue;
		}
		if (OPERATOR_CHARS.has(c)) {
			if (pendingRedirect !== null) return {
				ok: false,
				reason: "redirection without a target"
			};
			endCommand();
			i += c === "&" || c === "|" ? input[i + 1] === c ? 2 : 1 : 1;
			continue;
		}
		let text = "";
		let dynamic = false;
		while (i < input.length) {
			const ch = input[i];
			if (ch === " " || ch === "	" || ch === "\r" || OPERATOR_CHARS.has(ch)) break;
			if (ch === "\\") {
				if (input[i + 1] === "\n") {
					i += 2;
					continue;
				}
				text += input[i + 1] ?? "";
				i += 2;
				continue;
			}
			if (ch === "'") {
				const end = input.indexOf("'", i + 1);
				if (end < 0) return {
					ok: false,
					reason: "unterminated single quote"
				};
				text += input.slice(i + 1, end);
				i = end + 1;
				continue;
			}
			if (ch === "\"") {
				i += 1;
				let closed = false;
				while (i < input.length) {
					const d = input[i];
					if (d === "\"") {
						closed = true;
						i += 1;
						break;
					}
					if (d === "\\" && i + 1 < input.length && "\"\\$`\n".includes(input[i + 1])) {
						if (input[i + 1] !== "\n") text += input[i + 1];
						i += 2;
						continue;
					}
					if (d === "$" || d === "`") dynamic = true;
					text += d;
					i += 1;
				}
				if (!closed) return {
					ok: false,
					reason: "unterminated double quote"
				};
				continue;
			}
			if (ch === "$" || ch === "`") {
				dynamic = true;
				const close = ch === "`" ? "`" : input[i + 1] === "(" ? ")" : input[i + 1] === "{" ? "}" : null;
				if (close) {
					const open = ch === "`" ? null : input[i + 1];
					let depth = 0;
					let j = ch === "`" ? i + 1 : i + 2;
					for (; j < input.length; j++) if (open && input[j] === open) depth += 1;
					else if (input[j] === close) {
						if (depth === 0) break;
						depth -= 1;
					}
					if (j >= input.length) return {
						ok: false,
						reason: "unterminated substitution"
					};
					text += input.slice(i, j + 1);
					i = j + 1;
					continue;
				}
			}
			if (ch === "*" || ch === "?" || ch === "[") dynamic = true;
			text += ch;
			i += 1;
		}
		pushWord({
			text,
			dynamic
		});
	}
	if (pendingRedirect !== null) return {
		ok: false,
		reason: "redirection without a target"
	};
	endCommand();
	return {
		ok: true,
		commands
	};
}
//#endregion
//#region src/enclawed/hpc/gate.ts
const MAX_DEPTH = 4;
const MAX_SCRIPT_BYTES = 512 * 1024;
const INTERPRETERS = new Set([
	"python",
	"python3",
	"julia",
	"Rscript",
	"R",
	"node",
	"perl",
	"ruby",
	"bash",
	"sh",
	"ksh",
	"zsh",
	"dash",
	"tclsh",
	"lua"
]);
const SHELLS = new Set([
	"bash",
	"sh",
	"ksh",
	"zsh",
	"dash"
]);
const CONTAINERS = new Set([
	"apptainer",
	"singularity",
	"podman-hpc",
	"shifter",
	"charliecloud",
	"ch-run"
]);
/** Commands that run their arguments as a command. */
const WRAPPERS = new Set([
	"env",
	"time",
	"nohup",
	"nice",
	"stdbuf",
	"timeout",
	"command",
	"exec",
	"sudo",
	"ionice",
	"chrt"
]);
function defaultRead(absPath) {
	try {
		if (statSync(absPath).size > MAX_SCRIPT_BYTES) return null;
		const text = readFileSync(absPath, "utf8");
		return text.includes("\0") ? null : text;
	} catch {
		return null;
	}
}
function basename$1(word) {
	return word.includes("/") ? path.basename(word) : word;
}
/** Drops wrappers and their options; returns the words of the command that actually runs. */
/**
* Variables that decide which binary a launcher name runs, or what it loads.
* Changing them on the same line as a launch would route around the site's
* shims, so the gate refuses it.
*/
const RESOLUTION_VARS = /^(PATH|LD_PRELOAD|LD_LIBRARY_PATH|LD_AUDIT|BASH_ENV|ENV|IFS|PYTHONPATH|PYTHONSTARTUP)=/;
function noteAssignment(w, reasons) {
	if (RESOLUTION_VARS.test(w.text)) reasons.push(`setting ${w.text.split("=")[0]} on a line that the HPC gate checks is not allowed`);
}
function unwrap(words, reasons) {
	let i = 0;
	while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i].text)) {
		noteAssignment(words[i], reasons);
		i += 1;
	}
	for (let guard = 0; guard < 16 && i < words.length; guard++) {
		const name = basename$1(words[i].text);
		if (!WRAPPERS.has(name) || words[i].dynamic) break;
		i += 1;
		const valued = {
			env: new Set([
				"-u",
				"--unset",
				"-C",
				"--chdir",
				"-S",
				"--split-string"
			]),
			nice: new Set(["-n", "--adjustment"]),
			timeout: new Set([
				"-s",
				"--signal",
				"-k",
				"--kill-after"
			]),
			sudo: new Set([
				"-u",
				"-g",
				"-C",
				"-D",
				"-h",
				"-p",
				"-r",
				"-t",
				"-U"
			]),
			ionice: new Set([
				"-c",
				"-n",
				"-p"
			]),
			exec: new Set(["-a"]),
			stdbuf: new Set([
				"-i",
				"-o",
				"-e"
			])
		};
		while (i < words.length && words[i].text.startsWith("-") && words[i].text !== "-") {
			if (words[i].text === "--") {
				i += 1;
				break;
			}
			if (name === "env" && (words[i].text === "-S" || words[i].text.startsWith("--split-string"))) reasons.push("env -S splits a string into a command the gate cannot see");
			i += valued[name]?.has(words[i].text) ? 2 : 1;
		}
		if (name === "env") while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i].text)) {
			noteAssignment(words[i], reasons);
			i += 1;
		}
		if (name === "timeout" && i < words.length) i += 1;
		if (name === "chrt" && i < words.length) i += 1;
	}
	return words.slice(i);
}
function matchesExecutable(entry, candidate, cwd) {
	if (entry.startsWith("module:")) return candidate === entry;
	if (!entry.includes("/")) return !candidate.includes("/") && candidate === entry;
	if (!candidate.includes("/")) return false;
	const abs = path.resolve(cwd, candidate);
	const root = path.resolve(entry);
	return entry.endsWith("/") ? abs.startsWith(root + path.sep) : abs === root;
}
/** What a program on the ranks really is: the binary, and for interpreters, the script or module. */
function programTargets(p, reasons) {
	const argv = p.argv;
	if (argv.length === 0) return [];
	const head = argv[0];
	const name = basename$1(head);
	const targets = [head];
	if (INTERPRETERS.has(name) || /^python3\.\d+$/.test(name)) for (let i = 1; i < argv.length; i++) {
		const a = argv[i];
		if (a === "-c" || a === "-e" || a === "--eval") {
			reasons.push(`${name} ${a} runs inline code the gate cannot check`);
			break;
		}
		if (a === "-m") {
			targets.push(`module:${argv[i + 1] ?? ""}`);
			break;
		}
		if (!a.startsWith("-")) {
			targets.push(a);
			break;
		}
	}
	else if (CONTAINERS.has(name)) {
		const rest = argv.slice(1).filter((a) => !a.startsWith("-"));
		if (rest[1]) targets.push(rest[1]);
	}
	return targets;
}
function nodeHoursOf(req) {
	if (!req.createsAllocation || req.walltimeMinutes === null) return 0;
	return (req.nodes ?? 1) * (req.walltimeMinutes / 60);
}
function scriptHash(req, ctx, read) {
	if (!req.script || req.script === "-") return null;
	const body = read(path.resolve(ctx.cwd, req.script));
	return body === null ? null : createHash("sha256").update(body).digest("hex");
}
/** Checks one launch against the policy, adding every violation to `reasons`. */
function checkLaunch(req, policy, cwd, reasons) {
	const what = req.verb;
	if (!policy.schedulers.has(req.scheduler)) reasons.push(`${what}: scheduler "${req.scheduler}" is not allowed`);
	for (const p of req.problems) reasons.push(`${what}: ${p}`);
	const executables = policy.executables;
	const checkTarget = (t, label) => {
		if (executables && !executables.some((e) => matchesExecutable(e, t, cwd))) reasons.push(`${what}: ${label} "${t}" is not on enclawed.hpc.executables`);
	};
	for (const prog of req.programs) {
		if (prog.dynamic) reasons.push(`${what}: the program is computed at run time`);
		for (const t of programTargets(prog, reasons)) checkTarget(t, "program");
	}
	if (req.script && req.script !== "-") checkTarget(req.script, "batch script");
	if (policy.maxRanks !== null && req.ranks !== null && req.ranks > policy.maxRanks) reasons.push(`${what}: ${req.ranks} ranks exceeds maxRanks ${policy.maxRanks}`);
	if (policy.maxNodes !== null && req.nodes !== null && req.nodes > policy.maxNodes) reasons.push(`${what}: ${req.nodes} nodes exceeds maxNodes ${policy.maxNodes}`);
	if (req.createsAllocation) {
		if ((policy.maxWalltimeMinutes !== null || policy.nodeHourBudget !== null) && req.walltimeMinutes === null) reasons.push(`${what}: set a time limit; the site default is not known to the gate`);
		if (policy.maxWalltimeMinutes !== null && req.walltimeMinutes !== null && req.walltimeMinutes > policy.maxWalltimeMinutes) reasons.push(`${what}: walltime ${req.walltimeMinutes} min exceeds ${policy.maxWalltimeMinutes}`);
		if (policy.nodeHourBudget !== null && req.nodes === null) reasons.push(`${what}: set a node count so the request can be charged`);
		if (policy.partitions) {
			if (req.partition === null) reasons.push(`${what}: name a partition or queue (allowed: ${[...policy.partitions].join(", ")})`);
			else if (!policy.partitions.has(req.partition)) reasons.push(`${what}: partition "${req.partition}" is not allowed`);
		}
		if (policy.accounts) {
			if (req.account === null) reasons.push(`${what}: name an account or bank (allowed: ${[...policy.accounts].join(", ")})`);
			else if (!policy.accounts.has(req.account)) reasons.push(`${what}: account "${req.account}" is not allowed`);
		}
	}
}
/** Reads a script named by `p`, or null if the gate cannot know which file it is. */
function readNamed(ctx, shell, p) {
	if (shell.cwdMoved && !p.startsWith("/")) return null;
	return (ctx.readFile ?? defaultRead)(path.resolve(ctx.cwd, p));
}
function walk(line, depth, policy, ctx, out, insideJob = false, shell = { cwdMoved: false }) {
	if (depth > MAX_DEPTH) {
		out.reasons.push("scripts nest too deeply to check");
		return;
	}
	const parsed = parseCommandLine(line);
	if (!parsed.ok) {
		if (/\b(mpirun|mpiexec|srun|sbatch|salloc|msub|flux)\b/.test(line)) {
			out.touched = true;
			out.reasons.push(`command line does not parse (${parsed.reason})`);
		}
		return;
	}
	const launcherEnv = {
		inAllocation: insideJob || Boolean(ctx.env.SLURM_JOB_ID),
		inFluxJob: insideJob || Boolean(ctx.env.FLUX_JOB_ID),
		readScript: (p) => readNamed(ctx, shell, p)
	};
	for (const cmd of parsed.commands) walkCommand(cmd, depth, policy, ctx, launcherEnv, out, insideJob, shell);
}
function walkCommand(cmd, depth, policy, ctx, launcherEnv, out, insideJob, shell) {
	const read = (p) => readNamed(ctx, shell, p);
	const words = unwrap(cmd.words, out.reasons);
	if (words.length === 0) return;
	const head = words[0];
	if (head.dynamic) {
		out.reasons.push(`command name "${head.text}" is computed at run time`);
		return;
	}
	const name = basename$1(head.text);
	if (name === "export" || name === "declare" || name === "typeset" || name === "readonly") {
		for (const w of words.slice(1)) noteAssignment(w, out.reasons);
		return;
	}
	if (name === "alias" || name === "hash" || name === "enable" || name === "function") {
		out.reasons.push(`${name} can change what a command name runs`);
		return;
	}
	if (name === "eval") {
		out.reasons.push("eval runs text the gate cannot check");
		return;
	}
	if (name === "cd" || name === "pushd" || name === "popd") {
		shell.cwdMoved = true;
		return;
	}
	if (name === "ssh" || name === "slogin") {
		walkSsh(words.slice(1), depth, policy, ctx, out);
		return;
	}
	if (name === "scp" || name === "rsync") {
		checkCopy(name, words.slice(1), policy, ctx, out);
		return;
	}
	if (name === "sftp" && policy.clusterHosts) {
		out.touched = true;
		out.reasons.push("sftp is interactive; copy into the staging directory with scp");
		return;
	}
	if (SHELLS.has(name)) {
		const c = words.findIndex((w) => w.text === "-c");
		if (c > 0) {
			const inner = words[c + 1];
			if (!inner || inner.dynamic) out.reasons.push(`${name} -c runs a command computed at run time`);
			else walk(inner.text, depth + 1, policy, ctx, out, insideJob, { ...shell });
			return;
		}
		const script = words.slice(1).find((w) => !w.text.startsWith("-"));
		if (script && !script.dynamic) {
			const body = read(script.text);
			if (body !== null) walk(body, depth + 1, policy, ctx, out, insideJob, { ...shell });
		}
		return;
	}
	if ((name === "source" || name === ".") && words[1] && !words[1].dynamic) {
		const body = read(words[1].text);
		if (body !== null) walk(body, depth + 1, policy, ctx, out, insideJob, shell);
		return;
	}
	if (head.text.includes("/") && !isLauncherVerb(name)) {
		const body = read(head.text);
		if (body !== null && /^#!.*\b(ba|k|z|da)?sh\b/.test(body)) walk(body, depth + 1, policy, ctx, out, insideJob, { ...shell });
		return;
	}
	if (name === "xargs" && words.some((w) => isLauncherVerb(basename$1(w.text)))) {
		out.touched = true;
		out.reasons.push("xargs builds a launch from input at run time");
		return;
	}
	const req = parseLauncher(name, words.slice(1), launcherEnv);
	if (!req) return;
	out.touched = true;
	if (head.text.includes("/")) {
		const abs = path.resolve(ctx.cwd, head.text);
		if (policy.launcherPaths && !policy.launcherPaths.includes(abs)) out.reasons.push(`${name}: run it by name; "${head.text}" is not one of enclawed.hpc.launcherPaths`);
	}
	if (req.kind === "control") {
		if (req.mutates && !policy.allowJobControl) out.reasons.push(`${req.verb}: changing or cancelling jobs is not allowed`);
		return;
	}
	if (cmd.heredoc) req.problems.push("a heredoc feeds the launcher; write the script to a file instead");
	if (req.script === "-" && cmd.stdinFile) {
		req.script = cmd.stdinFile.dynamic ? null : cmd.stdinFile.text;
		const body = req.script ? read(req.script) : null;
		if (body !== null) {
			req.problems = req.problems.filter((p) => !p.startsWith("cannot read batch script"));
			req.inner.push(body);
		}
	}
	checkLaunch(req, policy, ctx.cwd, out.reasons);
	out.launches.push({
		req,
		summary: {
			scheduler: req.scheduler,
			verb: req.verb,
			ranks: req.ranks,
			nodes: req.nodes,
			walltimeMinutes: req.walltimeMinutes,
			partition: req.partition,
			account: req.account,
			programs: req.programs.map((p) => p.argv.join(" ")),
			script: req.script,
			scriptSha256: scriptHash(req, ctx, read),
			nodeHours: nodeHoursOf(req)
		}
	});
	for (const inner of req.inner) walk(inner, depth + 1, policy, ctx, out, insideJob || req.createsAllocation);
}
/**
* Exact names, or patterns where `*` stands for hostname characters only
* (`node*.lab.gov` for allocated compute nodes). A pattern never spans a
* dot-free wildcard on its own; policy.ts refuses a bare `*`.
*/
function hostAllowed(policy, t) {
	if (!t || !policy.clusterHosts) return false;
	const host = t.host.toLowerCase();
	for (const entry of policy.clusterHosts) {
		if (!entry.includes("*")) {
			if (entry === host) return true;
			continue;
		}
		if (new RegExp(`^${entry.split("*").map((part) => part.replace(/[.]/g, "\\.")).join("[a-z0-9-]*")}$`).test(host)) return true;
	}
	return false;
}
/**
* ssh [opts] host command: the connection must be one the policy allows, and
* the command is checked as if typed on the login node. A remote batch script
* is read from its local mirror in the staging directory; anywhere else the
* gate cannot see it, and the launch is refused.
*/
function walkSsh(args, depth, policy, ctx, out) {
	const call = parseSsh(args);
	const touchedBefore = out.touched;
	const reasons = [...call.problems];
	if (!hostAllowed(policy, call.target)) reasons.push(`ssh to ${call.target?.host ?? "?"}: not one of enclawed.hpc.clusterHosts`);
	for (const hop of call.jumps) if (!hostAllowed(policy, hop)) reasons.push(`ssh -J ${hop.host}: not one of enclawed.hpc.clusterHosts`);
	if (call.command === null) reasons.push("an interactive ssh session runs commands the gate cannot see");
	else {
		const staging = policy.staging;
		walk(call.command, depth + 1, policy, {
			cwd: "/",
			env: {},
			readFile: (abs) => staging && within(staging.remote, abs) ? (ctx.readFile ?? defaultRead)(path.join(staging.local, path.posix.relative(staging.remote, abs))) : null
		}, out, false, { cwdMoved: true });
	}
	if (policy.clusterHosts || out.touched !== touchedBefore) {
		out.touched = true;
		out.reasons.push(...reasons);
	}
}
/** scp/rsync: only into the staging directory on a listed host; downloads only if allowed. */
function checkCopy(tool, args, policy, ctx, out) {
	if (!policy.clusterHosts) return;
	const call = parseCopy(tool, args);
	if (call.localOnly) return;
	out.touched = true;
	out.reasons.push(...call.problems);
	const staging = policy.staging;
	for (const u of call.uploads) {
		if (!hostAllowed(policy, u.host)) out.reasons.push(`${tool} to ${u.host.host}: not one of enclawed.hpc.clusterHosts`);
		if (!staging) {
			out.reasons.push(`${tool}: no enclawed.hpc.staging directory is configured`);
			continue;
		}
		if (!within(staging.local, u.local, ctx.cwd)) out.reasons.push(`${tool}: ${u.local} is not inside the local staging directory`);
		if (!u.remote.startsWith("/") || !within(staging.remote, u.remote)) out.reasons.push(`${tool}: ${u.remote} is not inside the remote staging directory`);
	}
	for (const d of call.downloads) {
		if (!policy.allowDownload) {
			out.reasons.push(`${tool}: copying files off the cluster is not allowed`);
			continue;
		}
		if (!hostAllowed(policy, d.host)) out.reasons.push(`${tool} from ${d.host.host}: not one of enclawed.hpc.clusterHosts`);
		if (!staging || !within(staging.local, d.local, ctx.cwd)) out.reasons.push(`${tool}: downloads land only in the local staging directory`);
	}
}
/** Running total of node-hours granted by one gate. */
var NodeHourLedger = class {
	constructor(budget) {
		this.budget = budget;
		this.spent = 0;
	}
	get used() {
		return this.spent;
	}
	fits(hours) {
		return this.budget === null || this.spent + hours <= this.budget + 1e-9;
	}
	charge(hours) {
		this.spent += hours;
	}
};
/** Pure decision for one command line; charges `ledger` only when allowed. */
function checkHpcCommand(command, policy, ctx, ledger) {
	const out = {
		launches: [],
		reasons: [],
		touched: false
	};
	walk(command, 0, policy, ctx, out);
	for (const key of Object.keys(ctx.callEnv ?? {})) noteAssignment({
		text: `${key}=`,
		dynamic: false
	}, out.reasons);
	const nodeHours = out.launches.reduce((sum, l) => sum + l.summary.nodeHours, 0);
	if (!ledger.fits(nodeHours)) out.reasons.push(`request needs ${nodeHours.toFixed(2)} node-hours; ${Math.max(0, (ledger.budget ?? 0) - ledger.used).toFixed(2)} left of ${ledger.budget}`);
	const relevant = out.touched || out.launches.length > 0 || out.reasons.length > 0;
	const violations = out.reasons;
	const allowed = violations.length === 0 || !policy.enforce;
	if (allowed && violations.length === 0) ledger.charge(nodeHours);
	return {
		allowed,
		reasons: violations,
		launches: out.launches.map((l) => l.summary),
		nodeHours: allowed && violations.length === 0 ? nodeHours : 0,
		touchedHpc: relevant
	};
}
//#endregion
//#region src/enclawed/hpc/policy.ts
const SCHEDULERS = [
	"mpi",
	"slurm",
	"moab",
	"flux"
];
function stringList(v, key) {
	if (v === void 0) return null;
	if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new TypeError(`enclawed.hpc.${key} must be a string array`);
	return v;
}
function positive(v, key) {
	if (v === void 0) return null;
	if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) throw new TypeError(`enclawed.hpc.${key} must be a positive number`);
	return v;
}
/** Parses the `enclawed.hpc` block. Returns null when the block is absent (gate off). */
function parseHpcPolicy(raw) {
	if (raw === void 0 || raw === null) return null;
	if (typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("enclawed.hpc must be an object");
	const cfg = raw;
	if (cfg.enforce !== void 0 && typeof cfg.enforce !== "boolean") throw new TypeError("enclawed.hpc.enforce must be a boolean");
	if (cfg.allowJobControl !== void 0 && typeof cfg.allowJobControl !== "boolean") throw new TypeError("enclawed.hpc.allowJobControl must be a boolean");
	const schedulers = stringList(cfg.schedulers, "schedulers") ?? [...SCHEDULERS];
	for (const s of schedulers) if (!SCHEDULERS.includes(s)) throw new TypeError(`enclawed.hpc.schedulers: unknown scheduler "${s}"`);
	if (cfg.allowDownload !== void 0 && typeof cfg.allowDownload !== "boolean") throw new TypeError("enclawed.hpc.allowDownload must be a boolean");
	let staging = null;
	if (cfg.staging !== void 0) {
		const st = cfg.staging;
		if (!st || typeof st.local !== "string" || typeof st.remote !== "string" || !st.local.startsWith("/") || !st.remote.startsWith("/")) throw new TypeError("enclawed.hpc.staging needs absolute local and remote paths");
		staging = {
			local: st.local,
			remote: st.remote
		};
	}
	const clusterHosts = stringList(cfg.clusterHosts, "clusterHosts");
	for (const h of clusterHosts ?? []) if (!/^[A-Za-z0-9*.-]+$/.test(h) || h.includes("*") && !/\.[A-Za-z0-9-]+$/.test(h)) throw new TypeError(`enclawed.hpc.clusterHosts: "${h}" must be a host name or a pattern such as node*.lab.gov`);
	const partitions = stringList(cfg.partitions, "partitions");
	const accounts = stringList(cfg.accounts, "accounts");
	return Object.freeze({
		enforce: cfg.enforce ?? true,
		schedulers: new Set(schedulers),
		executables: stringList(cfg.executables, "executables"),
		maxRanks: positive(cfg.maxRanks, "maxRanks"),
		maxNodes: positive(cfg.maxNodes, "maxNodes"),
		maxWalltimeMinutes: positive(cfg.maxWalltimeMinutes, "maxWalltimeMinutes"),
		partitions: partitions ? new Set(partitions) : null,
		accounts: accounts ? new Set(accounts) : null,
		nodeHourBudget: positive(cfg.nodeHourBudget, "nodeHourBudget"),
		allowJobControl: cfg.allowJobControl !== false,
		launcherPaths: stringList(cfg.launcherPaths, "launcherPaths"),
		clusterHosts: clusterHosts ? new Set(clusterHosts.map((h) => h.toLowerCase())) : null,
		staging,
		allowDownload: cfg.allowDownload === true
	});
}
function extractHpcBlock(rawDocument) {
	if (!rawDocument || typeof rawDocument !== "object" || Array.isArray(rawDocument)) return;
	const enclawed = rawDocument.enclawed;
	if (!enclawed || typeof enclawed !== "object" || Array.isArray(enclawed)) return;
	return enclawed.hpc;
}
//#endregion
//#region src/enclawed/hpc/index.ts
const STATE_KEY = Symbol.for("enclawed.hpc");
function configureHpcGate(policy) {
	const g = globalThis;
	if (!policy) {
		delete g[STATE_KEY];
		return;
	}
	g[STATE_KEY] = {
		policy,
		ledger: new NodeHourLedger(policy.nodeHourBudget)
	};
}
function hpcGateState() {
	return globalThis[STATE_KEY] ?? null;
}
/**
* Called before an exec tool call runs. Returns null when the gate is off or
* the command does not touch a scheduler; otherwise the decision, which has
* already been written to the audit log.
*/
function checkEnclawedHpcCall(command, cwd, actor, callEnv) {
	const state = hpcGateState();
	if (!state || typeof command !== "string") return null;
	const decision = checkHpcCommand(command, state.policy, {
		cwd: typeof cwd === "string" && cwd ? cwd : process.cwd(),
		env: process.env,
		callEnv: callEnv && typeof callEnv === "object" && !Array.isArray(callEnv) ? callEnv : void 0
	}, state.ledger);
	if (!decision.touchedHpc) return null;
	getRuntime()?.audit.append({
		type: decision.allowed ? "hpc.launch.allow" : "hpc.launch.deny",
		actor: actor ?? "process",
		level: null,
		payload: {
			enforce: state.policy.enforce,
			reasons: decision.reasons,
			launches: decision.launches,
			nodeHours: decision.nodeHours,
			nodeHoursUsed: state.ledger.used
		}
	}).catch(() => {});
	return decision;
}
//#endregion
export { parseHpcPolicy as i, configureHpcGate as n, extractHpcBlock as r, checkEnclawedHpcCall as t };
