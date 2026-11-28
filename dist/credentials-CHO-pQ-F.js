import { n as scan } from "./dlp-scanner-CAEHT3p2.js";
import { E as comparablePath, F as pathWords, O as expandHome, i as providerTokenFindings, j as isInside, m as credentialLike, o as secretContentOf } from "./audit-redact-C28uLnOv.js";
import fs from "node:fs";
import path from "node:path";
//#region src/enclawed/adapter/credential-links.ts
const INDEX_BUDGET = 5e4;
const LINK_WALK_BUDGET = 3e5;
const keyOf = (st) => `${st.dev}:${st.ino}`;
/**
* The device and inode of every secret regular file below `roots` (a root's
* own symbolic link is followed; links below it are not), with its link
* count. Built for each decision that needs it: a secret replaced since (a
* new inode) or linked since (a higher link count) is seen as it is now.
*/
function secretIndex(roots) {
	const map = /* @__PURE__ */ new Map();
	let left = INDEX_BUDGET;
	for (const root of roots) {
		let start;
		try {
			start = fs.realpathSync(root.path);
		} catch {
			continue;
		}
		const stack = [start];
		while (stack.length) {
			const p = stack.pop();
			if (--left < 0) return {
				map,
				complete: false
			};
			let st;
			try {
				st = fs.lstatSync(p);
			} catch {
				continue;
			}
			if (st.isFile()) {
				if (root.include(p) && !map.has(keyOf(st))) map.set(keyOf(st), {
					path: p,
					nlink: st.nlink
				});
			} else if (st.isDirectory()) try {
				for (const n of fs.readdirSync(p)) stack.push(path.join(p, n));
			} catch {}
		}
	}
	return {
		map,
		complete: true
	};
}
/**
* Is the regular file at `real` another name (a hard link) of a secret file?
* Only a file with more than one link can be. When the secret stores were too
* large to index, a multiply-linked file is a hit: it cannot be ruled out.
*/
function hardLinkedSecret(real, roots, what) {
	let st;
	try {
		st = fs.lstatSync(real);
	} catch {
		return null;
	}
	if (!st.isFile() || st.nlink <= 1) return null;
	const ix = secretIndex(roots);
	const hit = ix.map.get(keyOf(st));
	if (hit) return {
		path: hit.path,
		what: `${what} (the target is another name for it, a hard link)`
	};
	return ix.complete ? null : {
		path: real,
		what: "a file with several names (hard links) that may be a secret (the secret stores are too large to rule it out)"
	};
}
const lexicallyInside = (dir, p) => {
	const rel = path.relative(dir, p);
	return rel === "" || !rel.startsWith("..") && !path.isAbsolute(rel);
};
/**
* Does a recursive read of `dir` reach a secret through a link below it? A
* symbolic link whose real target is a secret, or holds one (`classify`), is
* a hit, and a link to a directory elsewhere is searched too (a reader that
* follows links reads it); a regular file that is a hard link of a secret is
* a hit. Hard links are looked for only when some secret file has more than
* one name (or the secret stores could not all be indexed), so the common
* case costs one directory listing per directory. Too large to walk: a hit.
*/
function linkedSecretBelow(dir, roots, classify, what, budget = LINK_WALK_BUDGET) {
	let start;
	try {
		start = fs.realpathSync(dir);
		if (!fs.statSync(start).isDirectory()) return null;
	} catch {
		return null;
	}
	const ix = secretIndex(roots);
	const wantInodes = new Set([...ix.map].filter(([, v]) => v.nlink > 1).map(([k]) => k)).size > 0 || !ix.complete;
	const bases = [start];
	const seen = new Set([start]);
	const stack = [start];
	let left = budget;
	while (stack.length) {
		const d = stack.pop();
		let entries;
		try {
			entries = fs.readdirSync(d, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const e of entries) {
			if (--left < 0) return {
				path: dir,
				what: "a directory too large to check for links to secret files"
			};
			const p = path.join(d, e.name);
			if (e.isSymbolicLink()) {
				let target;
				try {
					target = path.resolve(d, fs.readlinkSync(p));
				} catch {
					continue;
				}
				if (bases.some((b) => lexicallyInside(b, target))) continue;
				let real;
				try {
					real = fs.realpathSync(p);
				} catch {
					continue;
				}
				const hit = classify(real);
				if (hit) return {
					path: hit.path,
					what: `${hit.what} (through the symbolic link ${p})`
				};
				try {
					if (!seen.has(real) && fs.statSync(real).isDirectory()) {
						seen.add(real);
						bases.push(real);
						stack.push(real);
					} else if (wantInodes) {
						const h = hardLinkedSecret(real, roots, what);
						if (h) return h;
					}
				} catch {}
			} else if (e.isDirectory()) stack.push(p);
			else if (e.isFile() && wantInodes) {
				let st;
				try {
					st = fs.lstatSync(p);
				} catch {
					continue;
				}
				if (st.nlink > 1) {
					const hit = ix.map.get(keyOf(st));
					if (hit) return {
						path: hit.path,
						what: `${what} (${p} is another name for it, a hard link)`
					};
					if (!ix.complete) return {
						path: p,
						what: "a file with several names (hard links) that may be a secret (the secret stores are too large to rule it out)"
					};
				}
			}
		}
	}
	return null;
}
//#endregion
//#region src/enclawed/adapter/credentials.ts
/** Credential stores below the home directory: a directory means everything inside it. */
const HOME_CREDENTIAL_PATHS = [
	".aws",
	".azure",
	".config/gcloud",
	".config/gh",
	".kube/config",
	".docker/config.json",
	".netrc",
	"_netrc",
	".npmrc",
	".pypirc",
	".git-credentials",
	".gnupg",
	".yarnrc.yml",
	".config/hub",
	".config/git/credentials",
	".cargo/credentials",
	".cargo/credentials.toml",
	".gem/credentials",
	".terraform.d/credentials.tfrc.json",
	".vault-token",
	".oci/config",
	".password-store",
	".local/share/keyrings",
	".config/op",
	".ssh/private"
];
/** Secret files by name, anywhere (the project's own included). */
const SECRET_FILE_NAMES = new Set([
	"credentials.json",
	"credentials",
	"service-account.json",
	"service_account.json",
	".npmrc",
	".pypirc",
	".netrc",
	"_netrc",
	".git-credentials",
	".htpasswd",
	".pgpass",
	".my.cnf",
	"secrets.json",
	"secrets.yaml",
	"secrets.yml",
	".dockercfg",
	"kubeconfig"
]);
/** Key and keystore files by extension (extensions no other common format uses). */
const SECRET_FILE_EXT = /\.(pem|p12|pfx|jks|keystore|ppk|gpg|kdbx|ovpn)$/i;
/** A PEM file whose name says it is a certificate or a public key (cert.pem, fullchain.pem, ca-bundle.pem, public.pem): not a secret. */
const PEM_PUBLIC = /(^|[-_.])(cert|certs|crt|chain|fullchain|ca|cacert|ca-bundle|bundle|pub|public|root)([-_.]|$)/i;
/** Private keys by name, anywhere: deploy_rsa, github_ed25519, identity. */
const KEY_NAME = /^(identity|.+_(rsa|dsa|ecdsa|ed25519))$/i;
/** Credential JSON by name: cloud service accounts, OAuth client secrets, key files. */
const CREDENTIAL_JSON = /^(credentials|client_secrets?(_[^/]*)?|service[-_]?account[^/]*|gcp[-_]key[^/]*|keyfile)\.json$/i;
/** Files in ~/.ssh that are not private keys. */
const SSH_PUBLIC = /^(known_hosts(\.old)?|config|authorized_keys|environment)$|\.pub$/i;
/** A process's environment: /proc/<pid|self|thread-self|glob>[/task/<tid>]/environ, and its memory. */
const PROC_ENVIRON = /^\/proc\/([^/]+)(\/task\/[^/]+)?\/(environ|mem)$/;
/**
* Extensions shared with ordinary documents (`.key` is also a Keynote
* document, `.asc` also a detached signature or a public key): a credential
* only when the content has a private key's shape, or in a known key location.
*/
const SHAPE_CHECKED_EXT = /\.(key|asc)$/i;
/** Directories that hold private keys whatever their files are called. */
const KEY_DIRECTORIES = ["/etc/ssl/private", "/etc/pki/tls/private"];
const PRIVATE_KEY_TEXT = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----|-----BEGIN PGP PRIVATE KEY BLOCK-----|PuTTY-User-Key-File-/;
/**
* Does the file at `p` look like a private key: PEM / OpenSSH / PGP / PuTTY
* private-key text, or DER PKCS#8 (SEQUENCE, version 0, AlgorithmIdentifier)?
* A missing file, a directory (a Keynote bundle) or an unreadable file is not.
*/
function privateKeyShaped(p) {
	let fd = null;
	try {
		const st = fs.statSync(p);
		if (!st.isFile() || st.size === 0) return false;
		fd = fs.openSync(p, "r");
		const buf = Buffer.alloc(Math.min(st.size, 8192));
		const n = fs.readSync(fd, buf, 0, buf.length, 0);
		const head = buf.subarray(0, n);
		if (PRIVATE_KEY_TEXT.test(head.toString("latin1"))) return true;
		return head[0] === 48 && head[1] === 130 && head[4] === 2 && head[5] === 1 && head[6] === 0 && head[7] === 48 || head[0] === 48 && head[1] < 128 && head[2] === 2 && head[3] === 1 && head[4] === 0 && head[5] === 48;
	} catch {
		return false;
	} finally {
		if (fd !== null) fs.closeSync(fd);
	}
}
const TEMPLATE_SUFFIX = /^\.env\.(example|sample|template|dist|defaults)$/i;
/** Is `abs` (absolute, resolved) one of the user's credential stores? */
function credentialPathOf(abs, home) {
	const p = path.resolve(abs);
	const base = path.basename(p);
	if (PROC_ENVIRON.test(p.replace(/\\/g, "/"))) return {
		path: p,
		what: "another process's environment or memory"
	};
	if (/^\.env(\..+)?$/i.test(base) && !TEMPLATE_SUFFIX.test(base)) return {
		path: p,
		what: "an environment file (.env)"
	};
	if (SECRET_FILE_NAMES.has(base.toLowerCase()) || /^client_secret.*\.json$/i.test(base) || CREDENTIAL_JSON.test(base)) return {
		path: p,
		what: "a credentials file"
	};
	if (/^id_(rsa|dsa|ecdsa|ed25519|xmss)(_sk)?$/i.test(base) || KEY_NAME.test(base)) return {
		path: p,
		what: "an SSH private key"
	};
	if (SECRET_FILE_EXT.test(base) && !(/\.pem$/i.test(base) && PEM_PUBLIC.test(base.slice(0, -4)))) return {
		path: p,
		what: "a key or certificate file"
	};
	if (KEY_DIRECTORIES.some((d) => isInside(d, p) && p !== d)) return {
		path: p,
		what: "a file in a private-key directory"
	};
	if (SHAPE_CHECKED_EXT.test(base) && privateKeyShaped(p)) return {
		path: p,
		what: "a private key file"
	};
	if (home) {
		const ssh = path.join(home, ".ssh");
		if (isInside(ssh, p) && comparablePath(p) !== comparablePath(ssh) && !SSH_PUBLIC.test(base)) return {
			path: p,
			what: "an SSH private key"
		};
		for (const rel of HOME_CREDENTIAL_PATHS) {
			const c = path.join(home, rel);
			if (isInside(c, p)) return {
				path: c,
				what: "a credential store"
			};
		}
	}
	return null;
}
/** A credential store inside `dir` (a recursive search of `dir` reaches it), or null. */
function credentialBelow(dir, home) {
	if (!home) return null;
	for (const rel of [...HOME_CREDENTIAL_PATHS, ".ssh"]) {
		const c = path.join(home, rel);
		if (isInside(dir, c)) return {
			path: c,
			what: rel === ".ssh" ? "SSH private keys" : "a credential store"
		};
	}
	return null;
}
const hasGlob = (p) => /[*?[{]/.test(p);
/**
* The user's credential files, for finding their other names (hard links,
* symbolic links): the home credential stores, ~/.ssh's private files, the
* home directory's own credential files (~/.pgpass, ~/.netrc, ...), and the
* private-key directories.
*/
function credentialRoots(home) {
	const isCredential = (p) => credentialPathOf(p, home) !== null;
	const roots = KEY_DIRECTORIES.map((d) => ({
		path: d,
		include: () => true
	}));
	if (!home) return roots;
	const out = [...roots, ...[...HOME_CREDENTIAL_PATHS, ".ssh"].map((r) => ({
		path: path.join(home, r),
		include: isCredential
	}))];
	try {
		for (const n of fs.readdirSync(home)) {
			const p = path.join(home, n);
			if (isCredential(p)) out.push({
				path: p,
				include: () => true
			});
		}
	} catch {}
	return out;
}
const CREDENTIAL_LINK = "a credentials file";
/** A regular file that is another name (hard link) of one of the user's credential files, or null. */
function hardLinkedCredential(real, home) {
	return hardLinkedSecret(real, credentialRoots(home), CREDENTIAL_LINK);
}
/** A link below `dir` (symbolic or hard) that a recursive read follows into a credential, or null. */
function linkedCredentialBelow(dir, home) {
	return linkedSecretBelow(dir, credentialRoots(home), (real) => credentialPathOf(real, home) ?? credentialBelow(real, home), CREDENTIAL_LINK);
}
/**
* Does a target the agent names reach a credential store? `recursive`: the
* tool also reads below it. A glob reaches what it matches now (each match read as if
* named; too many to check is a hit), and below its static prefix when recursive.
*/
function readReachesCredential(fs, abs, home, recursive, listOnly = false, expandGlob = true) {
	if (hasGlob(abs)) {
		if (listOnly) {
			const prefix = abs.split(/[*?[{]/)[0];
			return credentialPathOf((prefix.endsWith("/") ? prefix : path.dirname(prefix)) || "/", home);
		}
		const prefix = abs.split(/[*?[{]/)[0];
		const dir = prefix.endsWith("/") ? prefix : path.dirname(prefix);
		const named = credentialPathOf(prefix, home) ?? credentialPathOf(abs, home) ?? (recursive ? credentialBelow(dir || "/", home) : null) ?? (recursive ? linkedCredentialBelow(dir || "/", home) : null);
		if (named || recursive || !expandGlob) return named;
		const matches = globFiles(abs);
		if (matches === null) return {
			path: abs,
			what: "files a pattern matches, too many to check"
		};
		for (const m of matches) {
			const real = fs.realpathNearest(m);
			const hit = credentialPathOf(m, home) ?? credentialPathOf(real, home) ?? hardLinkedCredential(real, home) ?? secretFileHit(real);
			if (hit) return hit;
		}
		return null;
	}
	const real = fs.realpathNearest(abs);
	return credentialPathOf(abs, home) ?? credentialPathOf(real, home) ?? (recursive ? credentialBelow(abs, home) ?? credentialBelow(real, home) ?? (listOnly ? null : linkedCredentialBelow(real, home)) : null) ?? (listOnly ? null : hardLinkedCredential(real, home)) ?? (recursive || listOnly ? null : secretFileHit(real));
}
const MAX_GLOB_MATCHES = 2048;
/** One pattern segment as a regular expression (a superset of the shell's: dot files and case included). */
function segmentRegExp(seg) {
	let re = "";
	for (let i = 0; i < seg.length; i++) {
		const c = seg[i];
		if (c === "*") re += ".*";
		else if (c === "?") re += ".";
		else if (c === "[") {
			const end = seg.indexOf("]", i + 2);
			if (end < 0) {
				re += "\\[";
				continue;
			}
			const body = seg.slice(i + 1, end).replace(/^!/, "^").replace(/\\/g, "\\\\");
			re += `[${body}]`;
			i = end;
		} else if (c === "{") {
			const end = seg.indexOf("}", i);
			if (end < 0) {
				re += "\\{";
				continue;
			}
			re += `(?:${seg.slice(i + 1, end).split(",").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`;
			i = end;
		} else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
	try {
		return new RegExp(`^(?:${re})$`, "i");
	} catch {
		return /(?!)/;
	}
}
/** The existing paths an absolute pattern matches, or null when there are too many to check. */
function globFiles(pattern) {
	const segs = path.resolve(pattern).split(path.sep).filter(Boolean);
	let current = [path.sep];
	for (const seg of segs) {
		const next = [];
		for (const dir of current) {
			if (!/[*?[{]/.test(seg)) {
				const p = path.join(dir, seg);
				if (lexists(p)) next.push(p);
				continue;
			}
			let names;
			try {
				names = fs.readdirSync(dir);
			} catch {
				continue;
			}
			const re = segmentRegExp(seg);
			for (const n of names) if (re.test(n) || n === seg) next.push(path.join(dir, n));
		}
		if (next.length > MAX_GLOB_MATCHES) return null;
		current = next;
	}
	return current;
}
/** Nothing is at `p` (ENOENT, ENOTDIR); a path that cannot be looked at (EACCES) is not absent. */
function absent(p) {
	try {
		fs.lstatSync(p);
		return false;
	} catch (err) {
		const code = err?.code;
		return code === "ENOENT" || code === "ENOTDIR";
	}
}
function lexists(p) {
	try {
		fs.lstatSync(p);
		return true;
	} catch {
		return false;
	}
}
const ENV_ASSIGNMENT_LINE = /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.]*\s*=|^\s*$/;
const NAME_ONLY_PATTERN = /^\^?\[(?:A-Z|a-z|0-9|_)+\][+*]=?$/;
/**
* A simple command that prints only the variable names of the files it
* reads, never a value: `cut -d= -f1 FILE...` over files whose every line is
* an assignment or blank (a line without `=` would print whole; a missing
* file prints nothing), or `grep -o PATTERN FILE...` whose pattern matches
* only name characters and `=`. Anything else: false.
*/
function printsNamesOnly(argv, cwd) {
	const [prog, ...args] = argv;
	if (prog === "cut") {
		let delim = null;
		let fields = null;
		const files = [];
		for (let i = 0; i < args.length; i++) {
			const a = args[i];
			if (a === "-d" || a === "--delimiter") delim = args[++i] ?? null;
			else if (a.startsWith("--delimiter=")) delim = a.slice(12);
			else if (a.startsWith("-d")) delim = a.slice(2);
			else if (a === "-f" || a === "--fields") fields = args[++i] ?? null;
			else if (a.startsWith("--fields=")) fields = a.slice(9);
			else if (a.startsWith("-f")) fields = a.slice(2);
			else if (a === "-s" || a === "--only-delimited") continue;
			else if (a.startsWith("-")) return false;
			else files.push(a);
		}
		if (delim !== "=" || fields !== "1" || files.length === 0) return false;
		return files.every((f) => {
			const abs = path.resolve(cwd, f);
			if (!lexists(abs)) return true;
			try {
				const st = fs.statSync(abs);
				if (!st.isFile() || st.size > 1024 * 1024) return false;
				return fs.readFileSync(abs, "utf8").split(/\r?\n/).every((l) => ENV_ASSIGNMENT_LINE.test(l));
			} catch {
				return false;
			}
		});
	}
	if (prog === "grep" || prog === "egrep") {
		let only = false;
		const rest = [];
		for (const a of args) if (/^-[oEnhHis]+$/.test(a)) only ||= a.includes("o");
		else if (a.startsWith("-")) return false;
		else rest.push(a);
		return only && rest.length >= 2 && NAME_ONLY_PATTERN.test(rest[0]);
	}
	return false;
}
function secretFileHit(real) {
	const what = secretContentOf(real, credentialFindings);
	return what ? {
		path: real,
		what: `a file that holds ${what}`
	} : null;
}
const SEARCHERS = new Set([
	"grep",
	"egrep",
	"fgrep",
	"rg",
	"ag",
	"ack",
	"zgrep",
	"find",
	"du",
	"tree"
]);
/** A credential store a shell command reaches by one of its words (literal, ~, $HOME, relative, symlink). */
function commandReachesCredential(fs, command, cwd, home, absentShowsNothing = false) {
	const toks = command.replace(/['"]/g, "").trim().split(/\s+/);
	let text = command;
	if (/^(?:grep|egrep|fgrep|zgrep)$/.test(path.basename(toks[0] ?? ""))) {
		const usesE = toks.some((t) => /^-[a-zA-Z]*[ef]$|^--(?:regexp|file)(?:=|$)/.test(t));
		const dd = toks.indexOf("--");
		const before = toks.findIndex((t, k) => k > 0 && (dd < 0 || k < dd) && !t.startsWith("-"));
		const pat = usesE ? -1 : before > 0 ? before : dd > 0 && dd + 1 < toks.length ? dd + 1 : -1;
		if (pat > 0) text = [...toks.slice(0, pat), ...toks.slice(pat + 1)].join(" ");
	}
	const words = pathWords(text);
	const whole = new Set(toks);
	if (words.length === 0) return null;
	if (/^\s*(ls|stat)(\s|$)/.test(command) && !/[;&|`\n]|\$\(/.test(command)) return null;
	const recursive = SEARCHERS.has(path.basename(words[0])) && (path.basename(words[0]) !== "grep" || /(^|\s)-[a-zA-Z]*[rR]|--recursive|--dereference-recursive/.test(command));
	for (const w of words.slice(1)) {
		if (/^\$\{?HOME\}?$/.test(w) && !recursive) continue;
		const abs = path.resolve(cwd, expandHome(w, home));
		if (absentShowsNothing && !hasGlob(abs) && (isInside(cwd, abs) || home !== null && isInside(home, abs)) && absent(abs)) continue;
		const hit = readReachesCredential(fs, abs, home, recursive, false, whole.has(w));
		if (hit) return hit;
	}
	return null;
}
/** `env` with options and NAME=VALUE only (no command): it prints the environment. */
function envDumps(args) {
	for (let j = 0; j < args.length; j++) {
		const a = args[j];
		if (a === "--version" || a === "--help") return false;
		if (a === "-S" || a === "--split-string" || a.startsWith("--split-string=")) return false;
		if (a === "-u" || a === "--unset" || a === "-C" || a === "--chdir") {
			j++;
			continue;
		}
		if (a.startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(a)) continue;
		return false;
	}
	return true;
}
const ENV_DUMP_POSIX = [
	(a) => a[0] === "env" && envDumps(a.slice(1)),
	(a) => a[0] === "printenv" && (a.slice(1).every((x) => x.startsWith("-")) || a.slice(1).some((x) => !x.startsWith("-") && credentialLike(x))),
	(a) => a[0] === "ps" && a.slice(1).some((x) => !x.startsWith("-") && /e/.test(x) || /^-[a-zA-Z]*E/.test(x)),
	(a) => a[0] === "export" && (a.length === 1 || a[1] === "-p"),
	(a) => a[0] === "declare" && a.slice(1).some((x) => /^-[a-zA-Z]*[xp]/.test(x)),
	(a) => a[0] === "typeset" && a.slice(1).some((x) => /^-[a-zA-Z]*[xp]/.test(x)),
	(a) => a[0] === "set" && a.length === 1,
	(a) => a[0] === "compgen" && a.includes("-v")
];
/**
* Does a command print the session's environment (where credentials live)?
* Checked on every simple command of a compound line.
*/
function dumpsEnvironment(command, dialect) {
	if (dialect === "powershell") return /(^|[\s;|(])(get-childitem|gci|dir|ls|get-item|gi|get-content|gc|cat|type)\s+['"]?env:/i.test(command) || /\[(system\.)?environment\]::getenvironmentvariables/i.test(command);
	for (const seg of command.split(/\|\||&&|[;|&\n]|\$\(|`/)) {
		const words = seg.replace(/['"]/g, "").trim().split(/\s+/).filter(Boolean);
		const argv = [];
		for (let i = 0; i < words.length; i++) if (/^\d*(?:>>?|<|>&|&>)$/.test(words[i])) i++;
		else if (!/^\d*(?:>>?|<|>&|&>)\S/.test(words[i])) argv.push(words[i]);
		while (argv.length > 1 && [
			"sudo",
			"command",
			"builtin",
			"exec",
			"nohup",
			"time"
		].includes(argv[0])) argv.shift();
		while (argv.length > 1 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0])) argv.shift();
		if (argv.length && ENV_DUMP_POSIX.some((f) => f([path.basename(argv[0]), ...argv.slice(1)]))) return true;
	}
	return false;
}
/** The framework's strict credential formats (no loose shapes, no personal data). */
const CREDENTIAL_FORMATS = new Set([
	"aws-access-key-id",
	"gcp-service-account",
	"azure-storage-key",
	"github-token",
	"gitlab-token",
	"openai-key",
	"anthropic-key",
	"slack-bot-token",
	"stripe-key",
	"jwt",
	"pem-private-key"
]);
const CREDENTIAL_PLACEHOLDER = "[credential removed by Enclawed]";
const CHUNK = 512 * 1024;
const OVERLAP = 8 * 1024;
const PEM_BLOCK = /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED |PGP )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH |DSA |ENCRYPTED |PGP )?PRIVATE KEY-----|$)/g;
/** The credential formats in a text (every chunk scanned, so a large text has no unscanned tail). */
function credentialFindings(text) {
	const out = [];
	for (let i = 0; i < text.length; i += CHUNK) {
		const part = text.slice(Math.max(0, i - OVERLAP), i + CHUNK);
		for (const f of scan(part, { onOversize: "truncate" })) if (CREDENTIAL_FORMATS.has(f.id)) out.push({
			id: f.id,
			match: f.match
		});
		out.push(...providerTokenFindings(part));
	}
	return out;
}
/** A text with every credential format replaced (a private key with its whole body). */
function redactCredentials(text) {
	const found = credentialFindings(text);
	if (found.length === 0) return {
		text,
		kinds: [],
		removed: 0
	};
	let out = text.replace(PEM_BLOCK, CREDENTIAL_PLACEHOLDER);
	let removed = text === out ? 0 : 1;
	const matches = [...new Set(found.filter((f) => f.id !== "pem-private-key").map((f) => f.match))].toSorted((a, b) => b.length - a.length);
	for (const m of matches) {
		const parts = out.split(m);
		removed += parts.length - 1;
		out = parts.join(CREDENTIAL_PLACEHOLDER);
	}
	return {
		text: out,
		kinds: [...new Set(found.map((f) => f.id))].toSorted(),
		removed
	};
}
/** Every string of a value (an object's keys and values, arrays), depth bounded. */
function stringsOf(v, out = [], depth = 0) {
	if (depth > 64) return out;
	if (typeof v === "string") out.push(v);
	else if (Array.isArray(v)) for (const x of v) stringsOf(x, out, depth + 1);
	else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
		out.push(k);
		stringsOf(x, out, depth + 1);
	}
	return out;
}
/** The value with credential formats removed from every string, in the same shape. */
function redactCredentialsIn(v) {
	let removed = 0;
	const kinds = /* @__PURE__ */ new Set();
	const walk = (x, depth) => {
		if (typeof x === "string") {
			const r = redactCredentials(x);
			removed += r.removed;
			for (const k of r.kinds) kinds.add(k);
			return r.text;
		}
		if (depth > 64 || !x || typeof x !== "object") return x;
		if (Array.isArray(x)) return x.map((y) => walk(y, depth + 1));
		return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y, depth + 1)]));
	};
	return {
		value: walk(v, 0),
		removed,
		kinds: [...kinds].toSorted()
	};
}
//#endregion
export { commandReachesCredential as a, dumpsEnvironment as c, privateKeyShaped as d, readReachesCredential as f, linkedSecretBelow as g, stringsOf as h, SHAPE_CHECKED_EXT as i, hardLinkedCredential as l, redactCredentialsIn as m, HOME_CREDENTIAL_PATHS as n, credentialFindings as o, redactCredentials as p, KEY_DIRECTORIES as r, credentialPathOf as s, CREDENTIAL_FORMATS as t, printsNamesOnly as u };
