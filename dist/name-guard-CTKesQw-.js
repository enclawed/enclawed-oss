import { n as scan } from "./dlp-scanner-CAEHT3p2.js";
import { s as resolveRequestShape, t as GENERIC_SHAPE } from "./request-shape-BtkUVGoh.js";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { createHash, randomBytes } from "node:crypto";
//#region src/enclawed/containment/code-guard.ts
/** Where the guards live in the view (read-only, on the view's own tmpfs). */
const CODE_GUARD_DIR = "/.enclawed/code";
const NODE_GUARD_PATH = `${CODE_GUARD_DIR}/node-guard.cjs`;
const PY_GUARD_PATH = `${CODE_GUARD_DIR}/py-guard.py`;
/** Python's bytecode cache prefix in the view: an empty read-only directory. */
const PY_CACHE_PREFIX = `${CODE_GUARD_DIR}/pyc`;
/** Interpreters the guards cover, by the basename of the real program. */
function guardedInterpreter(realBase) {
	if (realBase === "node" || realBase === "nodejs") return "node";
	if (/^python3(?:\.\d+)?$/.test(realBase)) return "python";
	return null;
}
/** Programs that load code from files and have no guard: not started with code pins. */
const UNGUARDED_INTERPRETERS = /^(?:perl[\d.]*|ruby[\d.]*|php[\d.]*|lua[\d.]*|luajit|tclsh[\d.]*|wish[\d.]*|deno|bun|python2(?:\.\d+)?|python|pypy\d*|R|Rscript|julia|java|jshell|guile[\d.]*|racket|sbcl|ghci|runghc|osascript|pwsh|powershell|ts-node|tsx|irb|erl|escript|elixir|iex|swipl|gst|ocaml|scala)$/;
/** Hidden path of the real interpreter beside its wrapper (same directory: its own prefix logic holds). */
function hiddenInterpreterPath(real) {
	const slash = real.lastIndexOf("/");
	return `${real.slice(0, slash)}/.enclawed-${real.slice(slash + 1)}`;
}
/** The node options the guard accepts besides its own (the forms ../adapter/contained-exec.ts reads). */
const NODE_ARGS_OK = [
	"--test",
	"--test-only",
	"--test-force-exit",
	"--no-warnings",
	"--enable-source-maps",
	"--trace-warnings",
	"--experimental-test-coverage",
	"--check",
	"-c",
	"--test-reporter",
	"--test-reporter-destination",
	"--test-name-pattern",
	"--test-skip-pattern",
	"--test-concurrency",
	"--test-timeout",
	"--test-isolation",
	"--input-type",
	"-e",
	"--eval",
	"-p",
	"--print",
	"--disallow-code-generation-from-strings"
];
const json = (v) => JSON.stringify(v);
/** The node wrapper: the real binary with the guard first, whatever the run passes. */
function nodeWrapper(hidden) {
	const opts = `--require=${NODE_GUARD_PATH} --disallow-code-generation-from-strings`;
	return [
		"#!/bin/sh",
		"# Enclawed code pins: node starts with the guard first (generated).",
		`NODE_OPTIONS='${opts}'`,
		"export NODE_OPTIONS",
		`exec ${hidden} ${opts} "$@"`,
		""
	].join("\n");
}
/** The python wrapper: the real interpreter on the guard, the run's own flags kept. */
function pythonWrapper(hidden) {
	return [
		"#!/bin/sh",
		"# Enclawed code pins: python starts on the guard (generated).",
		"unset PYTHONINSPECT PYTHONSTARTUP PYTHONPYCACHEPREFIX",
		"F=",
		"while [ $# -gt 0 ]; do",
		"  case \"$1\" in",
		"    -?*) case \"${1#-}\" in *[!IBEsuOqP]*) break ;; esac; F=\"$F $1\"; shift ;;",
		"    *) break ;;",
		"  esac",
		"done",
		`exec ${hidden} -B -X pycache_prefix=${PY_CACHE_PREFIX} $F ${PY_GUARD_PATH} "$@"`,
		""
	].join("\n");
}
/** The node guard: preloaded first into every node process of the run. */
function nodeGuardSource(pins, toolchain) {
	return `// Enclawed code pins: node guard (generated). Loaded first; see the kit's
// containment/code-guard.ts.
"use strict";
(() => {
  const PINS = new Map(${json(pins.map((p) => [p.path, p.sha256]))});
  const TOOLCHAIN = ${json(toolchain)};
  const ARGS_OK = new Set(${json(NODE_ARGS_OK)});
  const GUARD = ${json(NODE_GUARD_PATH)};
  const fs = require("node:fs");
  const { createHash } = require("node:crypto");
  const { fileURLToPath } = require("node:url");
  const Module = require("node:module");
  const fail = (msg) => {
    try {
      fs.writeSync(2, "Enclawed: " + msg + "\\n");
    } catch {}
    process.exit(126);
  };
  if (typeof Module.registerHooks !== "function") {
    fail("this node has no module hooks, so the code it loads cannot be checked; nothing was run");
  }
  // Options that load other code before or around the guard are refused.
  for (const a of process.execArgv) {
    const name = a.split("=")[0];
    if (a === "--require=" + GUARD || a === GUARD) continue;
    if (!a.startsWith("-")) continue;
    if (!ARGS_OK.has(name)) {
      fail("node " + name + " is not an option this contained run takes (it may load code Enclawed did not read); nothing was run");
    }
  }
  const inside = (d, p) => p === d || p.startsWith(d.endsWith("/") ? d : d + "/");
  const trusted = (p) => TOOLCHAIN.some((d) => inside(d, p));
  const realOf = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return p;
    }
  };
  class CodeNotRead extends Error {
    constructor(what, why) {
      super("Enclawed: " + what + " was not loaded: " + why + " (this contained run loads only the code Enclawed read)");
      this.code = "ERR_ENCLAWED_CODE_NOT_READ";
    }
  }
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  // The bytes of a file outside the toolchain, when they are what Enclawed read.
  const pinned = (p) => {
    const real = realOf(p);
    if (trusted(real)) return null;
    const want = PINS.get(real);
    if (!want) throw new CodeNotRead(p, "it is not one of the files Enclawed read");
    const buf = fs.readFileSync(real);
    if (sha(buf) !== want) throw new CodeNotRead(p, "its content is not what Enclawed read");
    return buf;
  };
  Module.registerHooks({
    load(url, context, nextLoad) {
      if (url.startsWith("data:")) {
        throw new CodeNotRead("a data: URL", "code built at run time is not loaded");
      }
      if (!url.startsWith("file:")) {
        return nextLoad(url, context);
      }
      const p = fileURLToPath(url);
      const buf = pinned(p);
      const r = nextLoad(url, context);
      if (buf === null) return r;
      if (r.format === "addon" || r.format === "wasm") {
        // Native or wasm code: only the bytes read (and a native addon cannot map from a noexec place).
        return { ...r, source: buf, shortCircuit: true };
      }
      return { format: r.format, source: buf, shortCircuit: true };
    },
  });
  // A module compiled by hand from a writable file is checked the same way.
  const compile = Module.prototype._compile;
  // node -e / -p compile their code (read by Enclawed) once, under this name.
  let evalSeen = false;
  Module.prototype._compile = function (content, filename, ...rest) {
    if (!evalSeen && typeof filename === "string" && /^\\[eval\\d*\\](?:-wrapper)?$/.test(filename)) {
      evalSeen = true;
      return compile.call(this, content, filename, ...rest);
    }
    if (typeof filename === "string" && filename.startsWith("/")) {
      const real = realOf(filename);
      if (!trusted(real)) {
        const want = PINS.get(real);
        const got = sha(Buffer.from(String(content), "utf8"));
        const gotBom = sha(Buffer.from("\\ufeff" + String(content), "utf8"));
        if (!want || (got !== want && gotBom !== want)) {
          throw new CodeNotRead(filename, want ? "its content is not what Enclawed read" : "it is not one of the files Enclawed read");
        }
      }
    } else if (typeof filename !== "string" || !filename.startsWith("/")) {
      throw new CodeNotRead("code built at run time", "it is not a file Enclawed read");
    }
    return compile.call(this, content, filename, ...rest);
  };
  const dlopen = process.dlopen;
  process.dlopen = function (module, filename, ...rest) {
    if (typeof filename !== "string" || !trusted(realOf(filename))) pinned(String(filename));
    return dlopen.call(this, module, filename, ...rest);
  };
  // vm compiles strings into code: refused here.
  const vm = require("node:vm");
  for (const k of ["Script", "compileFunction", "runInThisContext", "runInNewContext", "runInContext", "SourceTextModule", "SyntheticModule"]) {
    if (k in vm) {
      const refuse = function () {
        throw new CodeNotRead("vm." + k, "code built at run time is not run");
      };
      try {
        Object.defineProperty(vm, k, { value: refuse, writable: false, configurable: false });
      } catch {}
    }
  }
  const wt = require("node:worker_threads");
  const Worker = wt.Worker;
  class GuardedWorker extends Worker {
    constructor(file, options) {
      if (options && options.eval) throw new CodeNotRead("a worker from a string", "code built at run time is not run");
      if (typeof file === "string" && !file.startsWith("node:")) pinned(file.startsWith("file:") ? fileURLToPath(file) : file);
      super(file, options);
    }
  }
  try {
    Object.defineProperty(wt, "Worker", { value: GuardedWorker, writable: false, configurable: false });
  } catch {}
})();
`;
}
/** The python guard: the script the wrapper starts; it installs the audit hook, then runs the run's code. */
function pythonGuardSource(pins, toolchain) {
	return `# Enclawed code pins: python guard (generated). See the kit's
# containment/code-guard.ts.
import sys


def _enclawed_guard():
    import hashlib
    import os

    PINS = ${`{${pins.map((p) => `${json(p.path)}: ${json(p.sha256)}`).join(", ")}}`}
    TOOLCHAIN = tuple(${json(toolchain)})
    GUARD = ${json(PY_GUARD_PATH)}
    # Toolchain modules that compile a caller's string: refused when a run's own code calls them.
    EVALUATORS = ("timeit.py", "doctest.py", "code.py", "codeop.py", "pdb.py", "bdb.py", "cProfile.py", "profile.py", "trace.py")

    def inside(d, p):
        return p == d or p.startswith(d.rstrip("/") + "/")

    def trusted(p):
        if p is None:
            return False
        if p.startswith("<frozen "):
            return True
        if not p.startswith("/"):
            return False
        r = os.path.realpath(p)
        return any(inside(d, r) for d in TOOLCHAIN)

    class CodeNotRead(PermissionError):
        pass

    def refuse(what, why):
        raise CodeNotRead("Enclawed: %s was not loaded: %s (this contained run loads only the code Enclawed read)" % (what, why))

    def caller(depth):
        f = sys._getframe(depth)
        while f is not None and f.f_code.co_filename == GUARD and f.f_code.co_name != "_enclawed_main":
            f = f.f_back
        return f

    def built_at_run_time(what):
        f = caller(2)
        c = f.f_code.co_filename if f is not None else None
        if not trusted(c):
            refuse(what, "code built at run time is not run")
        if os.path.basename(c) in EVALUATORS:
            g = f.f_back
            while g is not None and trusted(g.f_code.co_filename):
                g = g.f_back
            if g is not None:
                refuse(what, "code built at run time is not run")

    def check_file(fn, data):
        r = os.path.realpath(fn)
        if trusted(r):
            return
        want = PINS.get(r)
        if want is None:
            refuse(fn, "it is not one of the files Enclawed read")
        if data is not None and hashlib.sha256(data).hexdigest() != want:
            refuse(fn, "its content is not what Enclawed read")

    def hook(event, args):
        if event == "compile":
            src, fn = args[0], args[1]
            if isinstance(fn, bytes):
                fn = os.fsdecode(fn)
            if isinstance(fn, str) and fn.startswith("/"):
                if isinstance(src, (bytes, bytearray, memoryview)):
                    check_file(fn, bytes(src))
                elif isinstance(src, str):
                    check_file(fn, src.encode("utf-8"))
                else:
                    # A syntax tree (pytest's assertion rewriting of a test file it read): the file must be one Enclawed read.
                    check_file(fn, None)
            else:
                built_at_run_time("code compiled from a string")
        elif event == "exec":
            fn = getattr(args[0], "co_filename", None)
            if isinstance(fn, str) and fn.startswith("/"):
                check_file(fn, None)
            else:
                built_at_run_time("code built at run time")
        elif event in ("marshal.loads", "marshal.load", "code.__new__"):
            built_at_run_time("bytecode")
        elif event == "open":
            p, mode = args[0], args[1]
            if isinstance(p, bytes):
                p = os.fsdecode(p)
            if isinstance(p, str) and p.endswith((".pyc", ".pyo")) and not trusted(os.path.realpath(p)):
                refuse(p, "cached bytecode is not read from a writable place")
        elif event == "ctypes.dlopen":
            name = args[0]
            if isinstance(name, bytes):
                name = os.fsdecode(name)
            if isinstance(name, str) and "/" in name and not trusted(os.path.realpath(name)):
                refuse(name, "a shared library from a writable place is not loaded")

    sys.dont_write_bytecode = True
    sys.addaudithook(hook)


def _enclawed_main():
    import os
    import runpy
    import types

    args = sys.argv[1:]
    safe = bool(sys.flags.isolated or getattr(sys.flags, "safe_path", False))
    # The guard's own directory is not where the run's modules are found.
    if sys.path and sys.path[0] == ${json(CODE_GUARD_DIR)}:
        del sys.path[0]
    if len(args) >= 2 and args[0] == "-c":
        code = compile(args[1], "<string>", "exec")
        sys.argv = ["-c"] + args[2:]
        if not safe:
            sys.path.insert(0, "")
        main = types.ModuleType("__main__")
        main.__builtins__ = __builtins__
        sys.modules["__main__"] = main
        _enclawed_guard()
        exec(code, main.__dict__)
        return
    if len(args) >= 2 and args[0] == "-m":
        sys.argv = ["-m"] + args[2:]
        if not safe:
            sys.path.insert(0, os.getcwd())
        _enclawed_guard()
        runpy._run_module_as_main(args[1], alter_argv=True)
        return
    if len(args) >= 1 and not args[0].startswith("-"):
        script = args[0]
        sys.argv = args[:]
        if not safe:
            sys.path.insert(0, os.path.dirname(os.path.abspath(script)))
        _enclawed_guard()
        runpy.run_path(script, run_name="__main__")
        return
    sys.stderr.write("Enclawed: python %s is not a form this contained run takes (only a script, -m, or -c code Enclawed read); nothing was run\\n" % (args[0] if args else "with no script"))
    sys.exit(126)


_enclawed_main()
`;
}
//#endregion
//#region src/enclawed/containment/routing.ts
const email = (path, source = "body") => ({
	source,
	path,
	kind: "email"
});
const POSTMARK_FIELDS = [
	"To",
	"Cc",
	"Bcc",
	"From",
	"ReplyTo"
];
/** Profiles shipped with the framework, by id. */
const SHIPPED_EGRESS_PROFILES = {
	postmark: {
		id: "postmark",
		hosts: ["api.postmarkapp.com"],
		rules: [
			{
				method: "POST",
				path: "/email",
				fields: POSTMARK_FIELDS.map((f) => email(f))
			},
			{
				method: "POST",
				path: "/email/withTemplate",
				fields: POSTMARK_FIELDS.map((f) => email(f))
			},
			{
				method: "POST",
				path: "/email/batch",
				fields: POSTMARK_FIELDS.map((f) => email(`[].${f}`))
			},
			{
				method: "POST",
				path: "/email/batchWithTemplates",
				fields: POSTMARK_FIELDS.map((f) => email(`Messages[].${f}`))
			}
		]
	},
	sendgrid: {
		id: "sendgrid",
		hosts: ["api.sendgrid.com"],
		rules: [{
			method: "POST",
			path: "/v3/mail/send",
			fields: [
				email("personalizations[].to[].email"),
				email("personalizations[].cc[].email"),
				email("personalizations[].bcc[].email"),
				email("personalizations[].from.email"),
				email("from.email"),
				email("reply_to.email"),
				email("reply_to_list[].email")
			]
		}]
	},
	mailgun: {
		id: "mailgun",
		hosts: ["api.mailgun.net", "api.eu.mailgun.net"],
		rules: [{
			method: "POST",
			path: "/v3/*/messages",
			fields: [
				"to",
				"cc",
				"bcc",
				"from",
				"h:Reply-To"
			].map((f) => email(f))
		}]
	},
	"aws-ses-v2": {
		id: "aws-ses-v2",
		hosts: ["email.*.amazonaws.com"],
		rules: [{
			method: "POST",
			path: "/v2/email/outbound-emails",
			fields: [
				email("Destination.ToAddresses[]"),
				email("Destination.CcAddresses[]"),
				email("Destination.BccAddresses[]"),
				email("FromEmailAddress"),
				email("ReplyToAddresses[]")
			]
		}]
	},
	slack: {
		id: "slack",
		hosts: ["slack.com"],
		rules: [
			{
				method: "POST",
				path: "/api/chat.postMessage",
				fields: [{
					source: "body",
					path: "channel",
					kind: "string"
				}]
			},
			{
				method: "POST",
				path: "/api/chat.postEphemeral",
				fields: [{
					source: "body",
					path: "channel",
					kind: "string"
				}, {
					source: "body",
					path: "user",
					kind: "string"
				}]
			},
			{
				method: "POST",
				path: "/api/files.completeUploadExternal",
				fields: [{
					source: "body",
					path: "channel_id",
					kind: "string"
				}, {
					source: "body",
					path: "channels",
					kind: "string"
				}]
			}
		]
	},
	twilio: {
		id: "twilio",
		hosts: ["api.twilio.com"],
		rules: [{
			method: "POST",
			path: "/2010-04-01/Accounts/*/Messages.json",
			fields: [{
				source: "body",
				path: "To",
				kind: "string"
			}, {
				source: "body",
				path: "From",
				kind: "string"
			}]
		}]
	},
	"github-webhooks": {
		id: "github-webhooks",
		hosts: ["api.github.com"],
		rules: [
			{
				method: "POST",
				path: "/repos/*/*/hooks",
				fields: [{
					source: "body",
					path: "config.url",
					kind: "url"
				}]
			},
			{
				method: "PATCH",
				path: "/repos/*/*/hooks/*",
				fields: [{
					source: "body",
					path: "config.url",
					kind: "url"
				}]
			},
			{
				method: "PATCH",
				path: "/repos/*/*/hooks/*/config",
				fields: [{
					source: "body",
					path: "url",
					kind: "url"
				}]
			},
			{
				method: "POST",
				path: "/orgs/*/hooks",
				fields: [{
					source: "body",
					path: "config.url",
					kind: "url"
				}]
			},
			{
				method: "PATCH",
				path: "/orgs/*/hooks/*",
				fields: [{
					source: "body",
					path: "config.url",
					kind: "url"
				}]
			}
		]
	}
};
function hostMatches(pattern, host) {
	const p = pattern.toLowerCase().split(".");
	const h = host.toLowerCase().replace(/\.$/, "").split(".");
	return p.length === h.length && p.every((label, i) => label === "*" || label === h[i]);
}
function pathMatches(pattern, path) {
	const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
	const p = pattern.replace(/\/+$/, "").split("/");
	const s = clean.split("/");
	for (let i = 0; i < p.length; i++) {
		if (p[i] === "**") return true;
		if (i >= s.length) return false;
		if (p[i] !== "*" && p[i].toLowerCase() !== s[i].toLowerCase()) return false;
	}
	return p.length === s.length;
}
/** The rules of `profiles` that apply to this request. */
function applicableRules(profiles, host, method, path) {
	const out = [];
	for (const profile of profiles) {
		if (!profile.hosts.some((h) => hostMatches(h, host))) continue;
		for (const rule of profile.rules) if ((!rule.method || rule.method.toUpperCase() === method.toUpperCase()) && pathMatches(rule.path, path)) out.push(rule);
	}
	return out;
}
const EMAIL_RE = /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*/g;
/** Every address in an address-list string ("A <a@x>, b@y; c@z"), lower-cased. */
function emailsIn(text) {
	return [...text.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase());
}
function normalizeUrl(text) {
	try {
		const u = new URL(text.trim());
		u.hash = "";
		return u.href;
	} catch {
		return null;
	}
}
function normalizeString(text) {
	return text.trim().replace(/^[#@]/, "").toLowerCase();
}
/**
* The values a routing field carries, normalized the way the API itself
* reads them: an email field may hold a list of addresses with display
* names; a URL is compared in its parsed form.
*/
function routingValues(kind, raw) {
	if (kind === "email") {
		const found = emailsIn(raw);
		return found.length > 0 ? found : raw.trim() ? [`raw:${raw.trim().toLowerCase()}`] : [];
	}
	if (kind === "url") {
		const u = normalizeUrl(raw);
		return u ? [u] : raw.trim() ? [`raw:${raw.trim()}`] : [];
	}
	return raw.trim() ? [normalizeString(raw)] : [];
}
/** Every value a tool call's arguments (or the declared constants) can supply, in all normalized forms. */
function suppliedValues(sources) {
	const out = /* @__PURE__ */ new Set();
	const visit = (v, depth) => {
		if (depth > 32) return;
		if (typeof v === "string") {
			for (const e of emailsIn(v)) out.add(e);
			const trimmed = v.trim();
			if (trimmed) {
				out.add(`raw:${trimmed.toLowerCase()}`);
				out.add(`raw:${trimmed}`);
				out.add(normalizeString(trimmed));
				const u = normalizeUrl(trimmed);
				if (u) out.add(u);
			}
		} else if (typeof v === "number" || typeof v === "boolean") out.add(normalizeString(String(v)));
		else if (Array.isArray(v)) for (const x of v) visit(x, depth + 1);
		else if (v && typeof v === "object") for (const x of Object.values(v)) visit(x, depth + 1);
	};
	for (const s of sources) visit(s, 0);
	return out;
}
function addField(m, k, v) {
	const list = m.get(k) ?? [];
	list.push(v);
	m.set(k, list);
}
function parseMultipart(body, boundary) {
	const fields = /* @__PURE__ */ new Map();
	const delim = Buffer.from(`--${boundary}`);
	let pos = body.indexOf(delim);
	if (pos < 0) return null;
	for (;;) {
		pos += delim.length;
		if (body.subarray(pos, pos + 2).toString() === "--") return fields;
		const headEnd = body.indexOf("\r\n\r\n", pos);
		if (headEnd < 0) return null;
		const head = body.subarray(pos, headEnd).toString("utf8");
		const next = body.indexOf(delim, headEnd + 4);
		if (next < 0) return null;
		const content = body.subarray(headEnd + 4, next - 2);
		const nameMatch = /content-disposition:[^\r\n]*\bname="([^"]*)"/i.exec(head);
		const isFile = /content-disposition:[^\r\n]*\bfilename=/i.test(head);
		if (nameMatch && !isFile) addField(fields, nameMatch[1], content.toString("utf8"));
		pos = next;
	}
}
/** Parse a request body for routing-field extraction. Never throws. */
function parseRequestBody(contentType, body) {
	if (body.length === 0) return { kind: "empty" };
	const ct = (contentType ?? "").toLowerCase();
	try {
		if (ct.includes("json") || !ct && /^\s*[[{]/.test(body.subarray(0, 64).toString("utf8"))) return {
			kind: "json",
			value: JSON.parse(body.toString("utf8"))
		};
		if (ct.startsWith("application/x-www-form-urlencoded")) {
			const fields = /* @__PURE__ */ new Map();
			for (const [k, v] of new URLSearchParams(body.toString("utf8"))) addField(fields, k, v);
			return {
				kind: "form",
				fields
			};
		}
		if (ct.startsWith("multipart/form-data")) {
			const b = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? "");
			const parsed = b ? parseMultipart(body, (b[1] ?? b[2]).trim()) : null;
			return parsed ? {
				kind: "form",
				fields: parsed
			} : {
				kind: "unparseable",
				reason: "malformed multipart body"
			};
		}
	} catch (err) {
		return {
			kind: "unparseable",
			reason: err instanceof Error ? err.message : String(err)
		};
	}
	return {
		kind: "unparseable",
		reason: `content type "${contentType ?? ""}" is not one the profile can read`
	};
}
function jsonValuesAt(value, path) {
	const steps = path.replace(/\[\]/g, ".[]").split(".").filter((s) => s.length > 0);
	let current = [value];
	for (const step of steps) {
		const next = [];
		for (const c of current) if (step === "[]") {
			if (Array.isArray(c)) next.push(...c);
			else if (c !== void 0 && c !== null) next.push(c);
		} else if (c && typeof c === "object" && !Array.isArray(c)) {
			for (const [k, v] of Object.entries(c)) if (k.toLowerCase() === step.toLowerCase()) next.push(v);
		}
		current = next;
	}
	const values = [];
	let nonString = false;
	const collect = (v, depth) => {
		if (typeof v === "string") values.push(v);
		else if (typeof v === "number") values.push(String(v));
		else if (Array.isArray(v) && depth < 4) v.forEach((x) => collect(x, depth + 1));
		else if (v && typeof v === "object" && depth < 4) Object.values(v).forEach((x) => collect(x, depth + 1));
		else if (v !== null && v !== void 0 && typeof v !== "boolean") nonString = true;
	};
	current.forEach((v) => collect(v, 0));
	return {
		values,
		nonString
	};
}
/**
* Check every routing field of `req` against the values the in-flight
* call(s) supplied and the declared constants. A request no profile rule
* covers has no routing fields to check (`checked: 0`).
*/
function checkRoutingProvenance(req, profiles, supplied) {
	const path = req.target.split("?")[0];
	const rules = applicableRules(profiles, req.host, req.method, path);
	if (rules.length === 0) return {
		ok: true,
		checked: 0
	};
	let parsed = null;
	const query = new URLSearchParams(req.target.includes("?") ? req.target.slice(req.target.indexOf("?") + 1) : "");
	let checked = 0;
	for (const rule of rules) for (const field of rule.fields) {
		let raws = [];
		if (field.source === "header") {
			const want = field.path.toLowerCase();
			for (const [k, v] of Object.entries(req.headers)) if (k.toLowerCase() === want && v !== void 0) raws.push(...Array.isArray(v) ? v : [v]);
		} else if (field.source === "query") raws = query.getAll(field.path);
		else {
			parsed ??= parseRequestBody(req.contentType, req.body);
			if (parsed.kind === "unparseable") return {
				ok: false,
				code: "routing-body-unparseable",
				message: `the request body cannot be read to check its routing fields (${parsed.reason}); refused`
			};
			if (parsed.kind === "json") {
				const found = jsonValuesAt(parsed.value, field.path);
				if (found.nonString) return {
					ok: false,
					code: "routing-body-unparseable",
					field: field.path,
					message: `routing field ${field.path} holds a value that is not text; refused`
				};
				raws = found.values;
			} else if (parsed.kind === "form") {
				for (const [k, v] of parsed.fields) if (k.toLowerCase() === field.path.toLowerCase()) raws.push(...v);
			}
		}
		for (const raw of raws) for (const value of routingValues(field.kind, raw)) {
			checked++;
			if (!supplied.has(value)) return {
				ok: false,
				code: "routing-field-not-from-call",
				field: field.path,
				value: value.replace(/^raw:/, ""),
				message: `routing field ${field.path} = ${value.replace(/^raw:/, "")} does not come from the tool call's arguments or the declared constants; refused`
			};
		}
	}
	return {
		ok: true,
		checked
	};
}
/** Resolve profile references (shipped ids or inline profiles); unknown ids are an error. */
function resolveProfiles(refs) {
	const out = [];
	for (const ref of refs) if (typeof ref === "string") {
		const p = SHIPPED_EGRESS_PROFILES[ref];
		if (!p) return {
			ok: false,
			message: `unknown egress profile "${ref}"`
		};
		out.push(p);
	} else out.push(ref);
	return {
		ok: true,
		profiles: out
	};
}
//#endregion
//#region src/enclawed/containment/plan.ts
/** Directories programs are looked up in by name (never the caller's PATH). */
const PROGRAM_DIRS = [
	"/usr/local/bin",
	"/usr/bin",
	"/bin",
	"/usr/sbin",
	"/sbin"
];
/**
* Read-only data a runtime loads besides its libraries (Debian's node
* loads externalized builtins from /usr/share/nodejs; git its templates
* and helpers). Mounted only when the runtime is an allowed program.
*/
const RUNTIME_DATA = {
	node: [{
		path: "/usr/share/nodejs",
		exec: false
	}, {
		path: "/usr/lib/nodejs",
		exec: false
	}],
	git: [{
		path: "/usr/share/git-core",
		exec: false
	}, {
		path: "/usr/lib/git-core",
		exec: true
	}]
};
/** Roots that would hand over the system or every user's files. */
const TOO_BROAD = new Set([
	"/",
	"/bin",
	"/boot",
	"/dev",
	"/etc",
	"/home",
	"/lib",
	"/lib32",
	"/lib64",
	"/libx32",
	"/proc",
	"/root",
	"/run",
	"/sbin",
	"/sys",
	"/usr",
	"/var",
	"/Users"
]);
/** Directory names (any depth inside a read-write root) that configure what runs later. */
const EXEC_CONFIG_DIRS = [
	".claude",
	".codex",
	".gemini",
	".cursor",
	".kiro",
	".opencode",
	".amp",
	".clinerules",
	".vscode",
	".husky",
	".githooks",
	".devcontainer",
	".direnv"
];
/** [parent, child] pairs. */
const EXEC_CONFIG_PAIRS = [
	[".github", "workflows"],
	[".github", "hooks"],
	[".git", "hooks"],
	[".git", "config"]
];
/**
* File names that configure what runs later. Each one, when missing at the
* top of a read-write root, is made to exist as a read-only placeholder
* whose content means "nothing configured" to its reader (PLACEHOLDER_FILE_CONTENT).
*
* Deliberately absent: version pins that select an already-installed
* runtime and run nothing themselves (.nvmrc, .node-version,
* .python-version, .ruby-version: nvm, pyenv and rbenv read a version
* string); .gitmodules (a submodule's `update = !command` is honored only
* from .git/config, which is protected) and .gitattributes (filters and
* diff drivers run only when git config defines them); and project
* manifests (package.json, pyproject.toml, Makefile), which are the
* project's content rather than configuration a tool picks up unasked.
*/
const EXEC_CONFIG_FILES = [
	".mcp.json",
	".envrc",
	".npmrc",
	".yarnrc",
	".yarnrc.yml",
	".pnpmfile.cjs",
	".pre-commit-config.yaml",
	".pre-commit-config.yml",
	".tool-versions",
	"mise.toml",
	".mise.toml",
	"mise.local.toml",
	".mise.local.toml",
	"bunfig.toml",
	".bunfig.toml",
	"opencode.json",
	"opencode.jsonc",
	".aider.conf.yml",
	"config.worktree"
];
/** Placeholder content that each file's reader takes as "nothing configured" (default: empty). */
const PLACEHOLDER_FILE_CONTENT = {
	".mcp.json": "{\"mcpServers\":{}}\n",
	".yarnrc.yml": "{}\n",
	".pre-commit-config.yaml": "repos: []\n",
	".pre-commit-config.yml": "repos: []\n",
	"opencode.json": "{}\n",
	"opencode.jsonc": "{}\n",
	".aider.conf.yml": "{}\n"
};
/** Top-level outputs a package install writes (its dependency trees and environments). */
const INSTALL_OUTPUTS = [
	"node_modules",
	".venv",
	"venv",
	"__pypackages__",
	".yarn",
	".pnp.cjs",
	".pnp.loader.mjs",
	".pnp.data.json",
	"build",
	"__pycache__"
];
/** Build metadata pip writes beside the project (`<name>.egg-info`). */
const isInstallMetadata = (name) => /^[^./][^/]*\.egg-info$/.test(name);
/** Lockfiles a package install writes. */
const INSTALL_LOCKFILES = [
	"package-lock.json",
	"npm-shrinkwrap.json",
	"pnpm-lock.yaml",
	"yarn.lock",
	"bun.lock",
	"bun.lockb",
	"poetry.lock",
	"Pipfile.lock",
	"uv.lock",
	"pdm.lock"
];
/** Manifests an install may update; only their dependency fields may change (checked after the run). */
const INSTALL_MANIFESTS = ["package.json", "pyproject.toml"];
/**
* Made to exist (as empty read-only directories) at the top of every
* read-write root when missing, so they cannot be created from inside.
* The host sees an empty directory while the process runs; it is removed
* afterwards if it is still empty.
*/
const PLACEHOLDER_DIRS = [
	".claude",
	".codex",
	".gemini",
	".cursor",
	".kiro",
	".opencode",
	".amp",
	".vscode",
	".github/workflows",
	".github/hooks"
];
/** The user's credential stores, relative to HOME; masked when inside a root. */
const CREDENTIAL_PATHS = [
	".ssh",
	".aws",
	".azure",
	".config/gcloud",
	".kube",
	".docker",
	".gnupg",
	".netrc",
	".git-credentials",
	".config/gh",
	".config/hub",
	".npmrc",
	".pypirc",
	".cargo/credentials",
	".cargo/credentials.toml",
	".claude",
	".claude.json",
	".codex",
	".gemini",
	".config/enclawed",
	".enclawed",
	".password-store",
	".local/share/keyrings",
	".bash_history",
	".zsh_history",
	".python_history",
	".node_repl_history"
];
/** Credential-format DLP findings (structured formats only: no prose patterns). */
const CREDENTIAL_DLP_IDS = new Set([
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
function credentialFindings(text) {
	const out = [];
	for (let i = 0; i < text.length; i += 512 * 1024) {
		const chunk = text.slice(Math.max(0, i - 4096), i + 512 * 1024);
		for (const f of scan(chunk, { onOversize: "truncate" })) if (CREDENTIAL_DLP_IDS.has(f.id)) out.push(f.id);
	}
	return [...new Set(out)];
}
/** Variables the containment sets itself; a declaration may not override them. */
const RESERVED_ENV = /^(ENCLAWED_.*|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR|REQUESTS_CA_BUNDLE|CURL_CA_BUNDLE|GIT_SSL_CAINFO|GIT_CONFIG_NOSYSTEM|GIT_CONFIG_GLOBAL|GIT_CONFIG_SYSTEM|HTTPS?_PROXY|https?_proxy|ALL_PROXY|all_proxy|NO_PROXY|no_proxy)$/;
const SANDBOX_HOME = "/sandbox/home";
/** Where the name guard (./name-guard.c) is inside every view. */
const NAME_GUARD_VIEW_PATH = "/.enclawed/name-guard";
const CA_BUNDLE_PATHS = [
	"/etc/ssl/certs/ca-certificates.crt",
	"/etc/pki/tls/certs/ca-bundle.crt",
	"/etc/ssl/cert.pem"
];
const DNS_SERVER = "198.18.0.1";
const isInside = (child, parent) => child === parent || child.startsWith(parent.endsWith("/") ? parent : `${parent}/`);
function refuse(code, message) {
	return {
		ok: false,
		code,
		message
	};
}
/** Shared libraries of an ELF file, via the system's ldd (null: could not resolve). */
function lddLibraries(realPath) {
	const ldd = ["/usr/bin/ldd", "/bin/ldd"].find((p) => fs.existsSync(p));
	if (!ldd) return null;
	let out;
	try {
		out = execFileSync(ldd, [realPath], {
			encoding: "utf8",
			env: {
				LC_ALL: "C",
				PATH: "/usr/bin:/bin"
			},
			timeout: 1e4,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
	} catch (err) {
		const e = err;
		const text = `${e.stdout ?? ""}${e.stderr ?? ""}`;
		return /not a dynamic executable|statically linked/.test(text) ? [] : null;
	}
	const libs = [];
	for (const line of out.split("\n")) {
		if (/not found/.test(line)) return null;
		const m = /=>\s+(\/\S+)/.exec(line) ?? /^\s*(\/\S+)\s+\(/.exec(line);
		if (m) libs.push(m[1]);
	}
	return libs;
}
function isElf(p) {
	try {
		const fd = fs.openSync(p, "r");
		try {
			const b = Buffer.alloc(4);
			fs.readSync(fd, b, 0, 4, 0);
			return b.equals(Buffer.from([
				127,
				69,
				76,
				70
			]));
		} finally {
			fs.closeSync(fd);
		}
	} catch {
		return false;
	}
}
function shebang(p) {
	try {
		const fd = fs.openSync(p, "r");
		try {
			const b = Buffer.alloc(256);
			const n = fs.readSync(fd, b, 0, 256, 0);
			const head = b.subarray(0, n).toString("latin1");
			if (!head.startsWith("#!")) return null;
			return head.slice(2).split("\n")[0].trim().split(/\s+/).filter(Boolean);
		} finally {
			fs.closeSync(fd);
		}
	} catch {
		return null;
	}
}
function lookupProgram(name) {
	if (path.isAbsolute(name)) return fs.existsSync(name) ? name : null;
	if (name.includes("/")) return null;
	for (const dir of PROGRAM_DIRS) {
		const p = path.join(dir, name);
		try {
			const st = fs.statSync(p);
			if (st.isFile() && st.mode & 73) return p;
		} catch {}
	}
	return null;
}
/** View builder: tracks what exists in the view so paths and their symlink chains are added once. */
var ViewBuilder = class {
	constructor() {
		this.ops = [];
		this.made = new Set(["/"]);
	}
	dir(p) {
		const parts = p.split("/").filter(Boolean);
		let cur = "";
		for (const part of parts) {
			cur += `/${part}`;
			if (!this.made.has(cur)) {
				this.made.add(cur);
				this.ops.push({
					op: "dir",
					path: cur
				});
			}
		}
	}
	/**
	* Make `hostPath` exist in the view at the same path, replicating each
	* symlink on the way, and bind the final file or directory. Returns the
	* real path that was bound.
	*/
	bindPath(hostPath, opts, depth = 0) {
		if (depth > 16) throw new Error(`too many symbolic links resolving ${hostPath}`);
		const parts = path.resolve(hostPath).split("/").filter(Boolean);
		let cur = "";
		for (let i = 0; i < parts.length; i++) {
			const next = `${cur}/${parts[i]}`;
			if (fs.lstatSync(next).isSymbolicLink()) {
				const target = fs.readlinkSync(next);
				if (!this.made.has(next)) {
					this.dir(cur || "/");
					this.made.add(next);
					this.ops.push({
						op: "symlink",
						path: next,
						target
					});
				}
				const resolved = path.resolve(cur || "/", target, ...parts.slice(i + 1));
				return this.bindPath(resolved, opts, depth + 1);
			}
			cur = next;
		}
		if (!this.made.has(`bind:${cur}`)) {
			const st = fs.statSync(cur);
			this.dir(path.dirname(cur));
			this.made.add(`bind:${cur}`);
			this.made.add(cur);
			this.ops.push({
				op: "bind",
				src: cur,
				path: cur,
				file: !st.isDirectory(),
				ro: opts.ro,
				exec: opts.exec
			});
		}
		return cur;
	}
	file(p, content, mode = 420) {
		this.dir(path.dirname(p));
		this.made.add(p);
		this.ops.push({
			op: "file",
			path: p,
			content,
			...mode === 493 ? { mode } : {}
		});
	}
	/**
	* Show a wrapper at a bound program's path and the real program beside it
	* at `hidden` (the same directory, so its own prefix logic still holds).
	*/
	wrapProgram(bound, hidden, wrapper) {
		const i = this.ops.findIndex((o) => o.op === "bind" && o.path === bound);
		if (i < 0) throw new Error(`${bound} is not bound in the view`);
		const o = this.ops[i];
		this.ops[i] = {
			...o,
			path: hidden,
			ro: true,
			exec: true
		};
		this.made.add(hidden);
		this.ops.splice(i + 1, 0, {
			op: "file",
			path: bound,
			content: wrapper,
			mode: 493
		});
	}
	push(op) {
		if (op.op === "tmpfs" || op.op === "device" || op.op === "symlink") this.dir(path.dirname(op.path));
		this.made.add(op.path);
		this.ops.push(op);
	}
};
const MAX_WALK_ENTRIES = 4e5;
const MAX_INSTALL_TOP_LEVEL = 1e4;
/**
* Top-level names of `root` that git ignores (generated output: dist, build,
* coverage, *.egg-info), when `root` is a git work tree. Read with git's own
* matcher, with every configurable program off (no fsmonitor, no hooks).
*/
function ignoredTopLevel(root) {
	const git = ["/usr/bin/git", "/bin/git"].find((p) => fs.existsSync(p));
	if (!git || !fs.existsSync(path.join(root, ".git"))) return /* @__PURE__ */ new Set();
	try {
		const out = execFileSync(git, [
			"-c",
			"core.fsmonitor=false",
			"-c",
			"core.hooksPath=/dev/null",
			"ls-files",
			"--others",
			"--ignored",
			"--exclude-standard",
			"--directory",
			"-z"
		], {
			cwd: root,
			encoding: "utf8",
			env: {
				PATH: "/usr/bin:/bin",
				GIT_CONFIG_NOSYSTEM: "1",
				GIT_CONFIG_GLOBAL: "/dev/null",
				LC_ALL: "C"
			},
			timeout: 2e4,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			maxBuffer: 64 * 1024 * 1024
		});
		return new Set(out.split("\0").filter(Boolean).map((p) => p.split("/")[0]));
	} catch {
		return /* @__PURE__ */ new Set();
	}
}
const MAX_WALK_DEPTH = 24;
/** Execution-configuration paths that exist inside `root` (bounded walk; node_modules skipped). */
function findExecConfig(root) {
	const found = [];
	let seen = 0;
	const dirSet = new Set(EXEC_CONFIG_DIRS);
	const fileSet = new Set(EXEC_CONFIG_FILES);
	const stack = [{
		dir: root,
		depth: 0
	}];
	while (stack.length > 0) {
		const { dir, depth } = stack.pop();
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		const base = path.basename(dir);
		for (const e of entries) {
			if (++seen > MAX_WALK_ENTRIES) return {
				paths: found,
				truncated: true
			};
			const p = path.join(dir, e.name);
			const lower = e.name.toLowerCase();
			if (EXEC_CONFIG_PAIRS.some(([parent, child]) => parent === base.toLowerCase() && child === lower)) {
				found.push(p);
				continue;
			}
			if (dirSet.has(lower) || fileSet.has(lower)) {
				found.push(p);
				continue;
			}
			if (!e.isDirectory() || e.isSymbolicLink() || depth >= MAX_WALK_DEPTH) continue;
			if (lower === "node_modules") continue;
			if (lower === ".git") {
				stack.push({
					dir: p,
					depth: MAX_WALK_DEPTH
				});
				continue;
			}
			stack.push({
				dir: p,
				depth: depth + 1
			});
		}
	}
	return {
		paths: found,
		truncated: false
	};
}
/** Decide the containment for a declaration. Reads the filesystem; starts nothing. */
function planContainment(decl, ctx) {
	const pins = decl.codePins;
	if (pins !== void 0) {
		if (!Array.isArray(pins) || pins.length > 4096 || pins.some((p) => !p || typeof p.path !== "string" || !path.isAbsolute(p.path) || typeof p.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(p.sha256) || typeof p.exec !== "boolean")) return refuse("containment-declaration-invalid", "code pins must be { path (absolute), sha256 (hex), exec } entries");
	}
	const pinned = pins !== void 0;
	const strictExec = decl.kind === "mcp-server" || pinned;
	if (!decl.label || typeof decl.command !== "string" || !Array.isArray(decl.args)) return refuse("containment-declaration-invalid", "a containment declaration needs a label, a command and arguments");
	if (!path.isAbsolute(decl.cwd)) return refuse("containment-declaration-invalid", `working directory must be absolute: ${decl.cwd}`);
	const roots = [];
	for (const r of decl.roots) {
		if (!path.isAbsolute(r.path) || r.access !== "ro" && r.access !== "rw") return refuse("containment-declaration-invalid", `root must be an absolute path with access ro or rw: ${r.path}`);
		let real;
		try {
			real = fs.realpathSync(r.path);
		} catch {
			return refuse("containment-root-missing", `declared root does not exist: ${r.path}`);
		}
		if (!fs.statSync(real).isDirectory()) return refuse("containment-declaration-invalid", `declared root is not a directory: ${r.path}`);
		for (const p of [path.resolve(r.path), real]) if (TOO_BROAD.has(p)) return refuse("containment-root-too-broad", `declared root ${p} would expose the system or every user's files`);
		for (const c of CREDENTIAL_PATHS) {
			const cred = path.join(ctx.home, c);
			if (isInside(real, cred) || isInside(path.resolve(r.path), cred)) return refuse("containment-root-is-credential-store", `declared root ${r.path} is inside the credential store ${cred}`);
		}
		const exec = pinned && r.access === "rw" ? false : r.exec ?? (strictExec ? false : r.access === "rw");
		roots.push({
			declared: path.resolve(r.path),
			real,
			access: r.access,
			exec
		});
	}
	const cwdReal = (() => {
		try {
			return fs.realpathSync(decl.cwd);
		} catch {
			return path.resolve(decl.cwd);
		}
	})();
	if (!roots.some((r) => isInside(cwdReal, r.real))) return refuse("containment-cwd-outside-roots", `working directory ${decl.cwd} is not inside a declared root`);
	const view = new ViewBuilder();
	const libs = ctx.libraries ?? lddLibraries;
	const programReals = /* @__PURE__ */ new Map();
	const programBound = /* @__PURE__ */ new Map();
	const pending = [...decl.programs];
	const seenProgram = /* @__PURE__ */ new Set();
	while (pending.length > 0) {
		const name = pending.shift();
		if (seenProgram.has(name)) continue;
		seenProgram.add(name);
		const found = lookupProgram(name);
		if (!found) return refuse("containment-program-missing", `program "${name}" was not found in ${PROGRAM_DIRS.join(":")}`);
		const real = fs.realpathSync(found);
		for (const r of roots) if (r.access === "rw" && isInside(real, r.real)) return refuse("containment-program-writable", `program ${found} is inside the writable root ${r.declared}`);
		if (pinned && (UNGUARDED_INTERPRETERS.test(path.basename(real)) || UNGUARDED_INTERPRETERS.test(path.basename(found)))) return refuse("containment-command-not-allowed", `program ${found} loads code from files and has no code guard, so a run with code pins cannot include it`);
		programReals.set(found, real);
		programBound.set(found, view.bindPath(found, {
			ro: true,
			exec: true
		}));
		const py = /^python(\d+\.\d+)$/.exec(path.basename(real));
		if (py && fs.existsSync(`/usr/lib/python${py[1]}`)) view.bindPath(`/usr/lib/python${py[1]}`, {
			ro: true,
			exec: true
		});
		for (const data of RUNTIME_DATA[path.basename(found)] ?? []) if (fs.existsSync(data.path)) view.bindPath(data.path, {
			ro: true,
			exec: data.exec
		});
		if (isElf(real)) {
			const l = libs(real);
			if (l === null) return refuse("containment-libraries-unresolved", `the shared libraries of ${found} cannot be resolved`);
			for (const lib of l) view.bindPath(lib, {
				ro: true,
				exec: true
			});
		} else {
			const sb = shebang(real);
			if (sb && sb.length > 0) {
				pending.push(sb[0]);
				if (path.basename(sb[0]) === "env") {
					const interp = sb.slice(1).find((a) => !a.startsWith("-"));
					if (interp) pending.push(interp);
				}
			}
		}
	}
	if (ctx.nameGuard) {
		view.file(NAME_GUARD_VIEW_PATH, "");
		view.push({
			op: "bind",
			src: fs.realpathSync(ctx.nameGuard),
			path: NAME_GUARD_VIEW_PATH,
			file: true,
			ro: true,
			exec: true
		});
		const l = libs(fs.realpathSync(ctx.nameGuard));
		if (l === null) return refuse("containment-libraries-unresolved", "the shared libraries of the name guard cannot be resolved");
		for (const lib of l) view.bindPath(lib, {
			ro: true,
			exec: true
		});
	}
	if (pinned) for (const bound of new Set(programBound.values())) {
		const kind = guardedInterpreter(path.basename(bound));
		if (kind) {
			const hidden = hiddenInterpreterPath(bound);
			view.wrapProgram(bound, hidden, kind === "node" ? nodeWrapper(hidden) : pythonWrapper(hidden));
		}
	}
	let command = null;
	if (path.isAbsolute(decl.command)) {
		const want = (() => {
			try {
				return fs.realpathSync(decl.command);
			} catch {
				return decl.command;
			}
		})();
		for (const [req, real] of programReals) if (req === decl.command || real === want) command = decl.command;
	} else {
		const found = lookupProgram(decl.command);
		if (found && programReals.has(found)) command = found;
	}
	if (!command) return refuse("containment-command-not-allowed", `command ${decl.command} is not one of the declared programs`);
	const hostLdCache = "/etc/ld.so.cache";
	if (fs.existsSync(hostLdCache)) view.bindPath(hostLdCache, {
		ro: true,
		exec: false
	});
	view.file("/etc/passwd", `root:x:0:0:root:/root:/usr/sbin/nologin\nsandbox:x:${ctx.uid}:${ctx.gid}:sandbox:${SANDBOX_HOME}:/usr/sbin/nologin\n`);
	view.file("/etc/group", `root:x:0:\nsandbox:x:${ctx.gid}:\n`);
	view.file("/etc/hosts", "127.0.0.1 localhost\n::1 localhost\n");
	view.file("/etc/resolv.conf", `nameserver ${DNS_SERVER}\noptions attempts:2 timeout:2\n`);
	view.file("/etc/nsswitch.conf", "passwd: files\ngroup: files\nhosts: files dns\n");
	view.push({
		op: "tmpfs",
		path: "/tmp",
		exec: !strictExec
	});
	view.push({
		op: "tmpfs",
		path: SANDBOX_HOME,
		exec: !strictExec
	});
	view.push({
		op: "tmpfs",
		path: "/dev/shm",
		exec: false
	});
	const ordered = [...roots].toSorted((a, b) => a.real.split("/").length - b.real.split("/").length);
	for (const r of ordered) if (r.declared !== r.real) view.bindPath(r.declared, {
		ro: r.access === "ro",
		exec: r.exec
	});
	else view.bindPath(r.real, {
		ro: r.access === "ro",
		exec: r.exec
	});
	const writableExceptions = new Set((decl.execConfigWritable ?? []).map((p) => path.resolve(p)));
	const rwRoots = ordered.filter((x) => x.access === "rw");
	const rootOf = (p) => rwRoots.filter((x) => isInside(p, x.real)).toSorted((a, b) => b.real.length - a.real.length)[0];
	const execConfigReadOnly = [];
	const placeholders = [];
	const protect = [];
	for (const r of rwRoots) {
		const found = findExecConfig(r.real);
		if (found.truncated) return refuse("containment-tree-too-large", `root ${r.declared} has more than ${MAX_WALK_ENTRIES} entries outside node_modules; declare narrower roots`);
		for (const p of found.paths) {
			if (writableExceptions.has(p)) continue;
			let real;
			try {
				real = fs.realpathSync(p);
			} catch {
				continue;
			}
			if (!rootOf(real)) continue;
			if (protect.some((x) => x.path === real)) continue;
			const st = fs.statSync(real);
			execConfigReadOnly.push(real);
			protect.push({
				path: real,
				origin: "original",
				file: !st.isDirectory()
			});
		}
	}
	for (const ph of placeholders) {
		execConfigReadOnly.push(ph.path);
		protect.push({
			path: ph.path,
			origin: "placeholder",
			file: ph.kind === "file"
		});
	}
	const anchorSet = /* @__PURE__ */ new Set();
	for (const pr of protect) {
		const r = rootOf(pr.path);
		if (!r) continue;
		for (let d = path.dirname(pr.path); d !== r.real && isInside(d, r.real); d = path.dirname(d)) anchorSet.add(d);
	}
	const anchored = [...anchorSet].toSorted((a, b) => a.split("/").length - b.split("/").length);
	for (const d of anchored) view.push({
		op: "bind",
		src: d,
		path: d,
		file: false,
		ro: false,
		exec: rootOf(d).exec
	});
	for (const pr of protect) if (/\/\.git\/hooks(\/|$)/i.test(pr.path)) view.push({
		op: "bind",
		src: pr.path,
		path: pr.path,
		file: pr.file,
		ro: true,
		exec: false
	});
	const installGuards = [];
	if (decl.kind === "package-install") for (const r of rwRoots) {
		let entries;
		try {
			entries = fs.readdirSync(r.real);
		} catch {
			return refuse("containment-root-missing", `cannot read ${r.declared}`);
		}
		if (entries.length > MAX_INSTALL_TOP_LEVEL) return refuse("containment-tree-too-large", `${r.declared} has more than ${MAX_INSTALL_TOP_LEVEL} top-level entries; an install cannot be caged there`);
		const ignored = ignoredTopLevel(r.real);
		const writable = [
			...INSTALL_OUTPUTS,
			...INSTALL_LOCKFILES,
			...INSTALL_MANIFESTS,
			...entries.filter((e) => ignored.has(e) && !e.startsWith(".") || isInstallMetadata(e))
		];
		const alreadyProtected = new Set(protect.map((x) => x.path));
		for (const e of entries) {
			const p = path.join(r.real, e);
			if (writable.includes(e) || alreadyProtected.has(p)) continue;
			const st = fs.lstatSync(p);
			if (st.isSymbolicLink()) continue;
			view.push({
				op: "bind",
				src: p,
				path: p,
				file: !st.isDirectory(),
				ro: true,
				exec: r.exec
			});
		}
		for (const top of new Set(placeholders.filter((ph) => isInside(ph.path, r.real) && ph.path !== r.real).map((ph) => path.relative(r.real, ph.path).split("/")[0]))) {
			const p = path.join(r.real, top);
			if (!entries.includes(top) && !alreadyProtected.has(p)) view.push({
				op: "bind",
				src: p,
				path: p,
				file: false,
				ro: true,
				exec: false
			});
		}
		installGuards.push({
			root: r.real,
			writable: [...new Set(writable)],
			existing: entries,
			manifests: INSTALL_MANIFESTS.filter((m) => entries.includes(m)),
			ours: [...new Set(placeholders.filter((ph) => isInside(ph.path, r.real) && ph.path !== r.real).map((ph) => path.relative(r.real, ph.path).split("/")[0]))]
		});
	}
	for (const r of ordered) for (const c of CREDENTIAL_PATHS) {
		const cred = path.join(ctx.home, c);
		if (!isInside(cred, r.real) && !isInside(cred, r.declared)) continue;
		try {
			const real = fs.lstatSync(cred).isSymbolicLink() ? fs.realpathSync(cred) : cred;
			view.push({
				op: "mask",
				path: cred,
				file: !fs.statSync(real).isDirectory()
			});
		} catch {}
	}
	for (const d of [
		"null",
		"zero",
		"full",
		"random",
		"urandom"
	]) view.push({
		op: "device",
		path: `/dev/${d}`,
		src: `/dev/${d}`
	});
	view.push({
		op: "symlink",
		path: "/dev/fd",
		target: "/proc/self/fd"
	});
	view.push({
		op: "symlink",
		path: "/dev/stdin",
		target: "/proc/self/fd/0"
	});
	view.push({
		op: "symlink",
		path: "/dev/stdout",
		target: "/proc/self/fd/1"
	});
	view.push({
		op: "symlink",
		path: "/dev/stderr",
		target: "/proc/self/fd/2"
	});
	view.dir("/proc");
	const env = {};
	env.PATH = [...new Set([...programReals.keys()].map((p) => path.dirname(p)))].join(":");
	env.HOME = SANDBOX_HOME;
	env.TMPDIR = "/tmp";
	env.USER = "sandbox";
	env.LOGNAME = "sandbox";
	env.LANG = "C.UTF-8";
	env.ENCLAWED_CONTAINED = decl.kind;
	if ([...programReals.keys()].some((p) => path.basename(p) === "git")) {
		env.GIT_CONFIG_NOSYSTEM = "1";
		env.GIT_CONFIG_GLOBAL = "/dev/null";
		env.GIT_TERMINAL_PROMPT = "0";
	}
	for (const [k, v] of Object.entries(decl.env ?? {})) {
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || typeof v !== "string") return refuse("containment-declaration-invalid", `invalid environment variable ${k}`);
		if (RESERVED_ENV.test(k)) return refuse("containment-env-reserved", `environment variable ${k} is set by the containment and cannot be declared`);
		const findings = credentialFindings(v);
		if (findings.length > 0) return refuse("containment-env-inline-secret", `environment variable ${k} carries a credential (${findings.join(", ")}); declare it as a secret so the process gets a handle`);
		env[k] = v;
	}
	const destinations = [];
	for (const d of decl.destinations ?? []) {
		const host = (typeof d.host === "string" ? d.host : "").toLowerCase();
		if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) return refuse("containment-declaration-invalid", `destination host must be a DNS name: ${d.host}`);
		if (!Number.isInteger(d.port) || d.port < 1 || d.port > 65535) return refuse("containment-declaration-invalid", `destination port out of range: ${d.port}`);
		if (![
			"inspect",
			"http",
			"opaque"
		].includes(d.mode)) return refuse("containment-declaration-invalid", `destination mode must be inspect, http or opaque: ${d.mode}`);
		const profiles = resolveProfiles(d.profiles ?? []);
		if (!profiles.ok) return refuse("containment-declaration-invalid", profiles.message);
		const shape = resolveRequestShape(d.shape);
		if (!shape.ok) return refuse("containment-declaration-invalid", `${host}:${d.port}: ${shape.message}`);
		if (shape.shape && d.mode === "opaque") return refuse("containment-declaration-invalid", `${host}:${d.port}: a request shape needs requests that can be read (mode inspect or http), not opaque`);
		if (!(decl.kind === "mcp-server") && (shape.shape?.profile === "api" || d.mode === "opaque")) return refuse("containment-declaration-invalid", `${host}:${d.port}: ${d.mode === "opaque" ? "an opaque destination" : "an api profile"} is declared only in a signed admission record (a ${decl.kind} reaches its destinations with the generic or a registry profile)`);
		destinations.push({
			host,
			port: d.port,
			mode: d.mode,
			background: d.background === true,
			profiles: profiles.profiles,
			constants: [...d.constants ?? []],
			shape: d.mode === "opaque" ? null : shape.shape ?? { ...GENERIC_SHAPE }
		});
	}
	for (const s of decl.secrets ?? []) {
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s.variable) || RESERVED_ENV.test(s.variable)) return refuse("containment-declaration-invalid", `invalid secret variable ${s.variable}`);
		if (s.variable in env) return refuse("containment-declaration-invalid", `secret variable ${s.variable} is also declared as a plain variable`);
		for (const dest of s.destinations) {
			const d = destinations.find((x) => `${x.host}:${x.port}` === dest.toLowerCase());
			if (!d || d.mode === "opaque") return refuse("containment-declaration-invalid", `secret ${s.id} names destination ${dest}, which is not a declared inspected destination`);
		}
	}
	if (pins) {
		for (const p of pins) {
			if (!rwRoots.some((r) => isInside(p.path, r.real))) return refuse("containment-declaration-invalid", `code pin ${p.path} is not inside a read-write root`);
			if (p.exec && fs.existsSync(p.path) && fs.statSync(p.path).isFile()) view.push({
				op: "bind",
				src: p.path,
				path: p.path,
				file: true,
				ro: false,
				exec: true
			});
		}
		const toolchain = [...new Set([CODE_GUARD_DIR, ...view.ops.flatMap((o) => o.op === "bind" && o.ro && !rwRoots.some((r) => isInside(o.path, r.real) || isInside(o.path, r.declared)) ? [o.path] : [])])].toSorted();
		view.file(NODE_GUARD_PATH, nodeGuardSource(pins, toolchain));
		view.file(PY_GUARD_PATH, pythonGuardSource(pins, toolchain));
		view.dir(PY_CACHE_PREFIX);
	}
	return {
		ok: true,
		plan: {
			kind: decl.kind,
			label: decl.label,
			command,
			args: [...decl.args],
			cwd: decl.cwd,
			ops: view.ops,
			env,
			strictExec,
			uid: ctx.uid,
			gid: ctx.gid,
			destinations,
			secrets: [...decl.secrets ?? []],
			placeholders,
			execConfigReadOnly,
			protect,
			anchored,
			installGuards,
			nameGuard: ctx.nameGuard ?? null,
			rwRoots: rwRoots.map((r) => r.real),
			execConfigWritable: [...writableExceptions],
			programs: [...programReals.keys()]
		}
	};
}
/** The node toolchain a project script or package install needs: node, sh, env, npm's tree. */
function nodeToolchain() {
	const programs = [
		"node",
		"sh",
		"env",
		...lookupProgram("npm") ? ["npm"] : []
	];
	const roots = [];
	const npm = lookupProgram("npm");
	if (npm) {
		const real = fs.realpathSync(npm);
		let dir = path.dirname(real);
		while (dir !== "/" && path.basename(dir) !== "npm") dir = path.dirname(dir);
		if (dir !== "/") roots.push({
			path: path.dirname(dir),
			access: "ro",
			exec: true
		});
	}
	return {
		programs,
		roots
	};
}
//#endregion
//#region src/enclawed/prebuilt/name-guard.generated.ts
const NAME_GUARD_PREBUILT = {
	sourceSha256: "0453d15c9c1b250da4195de63cd8c1d315843c95f3a6e3f21929e9e8d40d0649",
	binaries: {
		"linux-x64": "31381178de2c654d1e2c8a8ff1197b2c2a76705ece69f872ff0dd7c34401a3ac",
		"linux-arm64": "c82b78e0c039df8ab96a692425ff3da4462b9dd2c59e2f31db5ea7d3b923cefe"
	}
};
//#endregion
//#region src/enclawed/prebuilt/name-guard.ts
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
/** Where the prebuilt guard for an arch may be, relative to this module (source tree, bundle, package). */
function prebuiltCandidates(arch = process.arch) {
	const here = path.dirname(fileURLToPath(import.meta.url));
	const rel = path.join("prebuilt", "name-guard", `linux-${arch}`, "name-guard");
	return [
		0,
		1,
		2,
		3,
		4
	].map((up) => path.join(here, "../".repeat(up), rel));
}
/** The digest recorded at build time for an arch, or null when none was built. */
function recordedGuardDigest(arch = process.arch) {
	return NAME_GUARD_PREBUILT.binaries[`linux-${arch}`] ?? null;
}
/**
* The prebuilt guard, checked byte for byte against the recorded digest and
* written as a fresh read-only copy in `stateDir/bin`: the copy holds exactly
* the verified bytes and is the file to execute. A binary that does not match
* is never used (the caller may still build from source).
*/
function prebuiltNameGuard(stateDir, o = {}) {
	const arch = o.arch ?? process.arch;
	if (process.platform !== "linux" && !o.candidates) return {
		ok: false,
		reason: `no prebuilt name guard for ${process.platform}`
	};
	const want = recordedGuardDigest(arch);
	if (!want) return {
		ok: false,
		reason: `no prebuilt name guard for linux-${arch}`
	};
	for (const file of o.candidates ?? prebuiltCandidates(arch)) {
		let bytes;
		try {
			bytes = fs.readFileSync(file);
		} catch {
			continue;
		}
		if (sha256(bytes) !== want) return {
			ok: false,
			reason: `the prebuilt name guard ${file} does not match the digest recorded at build time`
		};
		const dir = path.join(stateDir, "bin");
		fs.mkdirSync(dir, {
			recursive: true,
			mode: 448
		});
		const out = path.join(dir, `name-guard-${want.slice(0, 16)}-${process.pid}-${randomBytes(4).toString("hex")}`);
		fs.writeFileSync(out, bytes, {
			mode: 320,
			flag: "wx"
		});
		fs.chmodSync(out, 365);
		return {
			ok: true,
			binary: out,
			sha256: want
		};
	}
	return {
		ok: false,
		reason: `the prebuilt name guard for linux-${arch} is missing from this install`
	};
}
/** Before every exec: does the guard file still hold the verified bytes? null when it does, else why not. */
function nameGuardUnchanged(binary, digest) {
	try {
		return sha256(fs.readFileSync(binary)) === digest ? null : `the name guard ${binary} changed after it was verified`;
	} catch (err) {
		return `the name guard ${binary} cannot be read (${err.message})`;
	}
}
//#endregion
//#region src/enclawed/containment/name-guard.ts
/** Dependency trees nobody reads as configuration: names inside them are not refused. */
const NAME_GUARD_EXEMPT = [
	"node_modules",
	".venv",
	"venv",
	"__pypackages__"
];
let built = null;
const digests = /* @__PURE__ */ new Map();
/** The digest a guard binary had when this process made it ready (null: not one of ours). */
function nameGuardDigest(binary) {
	return digests.get(binary) ?? null;
}
function kernelSupports() {
	const m = /^(\d+)\.(\d+)/.exec(os.release());
	if (!m) return false;
	const [major, minor] = [Number(m[1]), Number(m[2])];
	return major > 5 || major === 5 && minor >= 19;
}
function sourcePath() {
	const here = path.dirname(fileURLToPath(import.meta.url));
	for (const p of [
		path.join(here, "name-guard.c"),
		path.join(here, "enclawed", "containment", "name-guard.c"),
		path.join(here, "..", "src", "enclawed", "containment", "name-guard.c")
	]) if (fs.existsSync(p)) return p;
	return null;
}
/**
* The guard binary: the prebuilt static one (../prebuilt/name-guard.ts,
* checked against the digest recorded at build time) when it was built from
* this very source; else built once per process from the shipped source
* into Enclawed's state directory (a fresh name each time, so nothing
* another process left there is ever run). Before every exec the caller
* checks the file still has the digest returned here (nameGuardUnchanged).
*/
function ensureNameGuard(stateDir) {
	if (built?.ok && fs.existsSync(built.binary)) return built;
	if (process.platform !== "linux" || !["x64", "arm64"].includes(process.arch)) return {
		ok: false,
		reason: `the name guard needs Linux on x64 or arm64 (${process.platform}/${process.arch})`
	};
	if (!kernelSupports()) return {
		ok: false,
		reason: `the name guard needs seccomp user notification with killable waits (Linux 5.19); this kernel is ${os.release()}`
	};
	const src = sourcePath();
	const sourceDigest = src ? createHash("sha256").update(fs.readFileSync(src)).digest("hex") : null;
	if (sourceDigest === null || sourceDigest === NAME_GUARD_PREBUILT.sourceSha256) {
		const pre = prebuiltNameGuard(stateDir);
		if (pre.ok) {
			digests.set(pre.binary, pre.sha256);
			built = {
				ok: true,
				binary: pre.binary,
				sha256: pre.sha256
			};
			return built;
		}
	}
	if (!src) return {
		ok: false,
		reason: "the name guard source is missing from this install"
	};
	const cc = [
		"/usr/bin/cc",
		"/usr/bin/gcc",
		"/usr/bin/clang"
	].find((p) => fs.existsSync(p));
	if (!cc) return {
		ok: false,
		reason: "building the name guard needs a C compiler (cc, gcc or clang)"
	};
	const digest = createHash("sha256").update(fs.readFileSync(src)).digest("hex").slice(0, 16);
	const dir = path.join(stateDir, "bin");
	fs.mkdirSync(dir, {
		recursive: true,
		mode: 448
	});
	const out = path.join(dir, `name-guard-${digest}-${process.pid}-${randomBytes(4).toString("hex")}`);
	try {
		execFileSync(cc, [
			"-O2",
			"-Wall",
			"-o",
			out,
			src
		], {
			stdio: [
				"ignore",
				"ignore",
				"pipe"
			],
			env: {
				PATH: "/usr/bin:/bin",
				LC_ALL: "C"
			},
			timeout: 6e4
		});
		fs.chmodSync(out, 365);
	} catch (err) {
		return {
			ok: false,
			reason: `the name guard did not build: ${(err.stderr?.toString() ?? String(err)).slice(0, 300)}`
		};
	}
	const sha256 = createHash("sha256").update(fs.readFileSync(out)).digest("hex");
	digests.set(out, sha256);
	built = {
		ok: true,
		binary: out,
		sha256
	};
	return built;
}
/** The supervisor's policy file: read-write roots, operator exceptions and the names refused. */
function nameGuardConfig(rwRoots, writable, gitExes = [], approvals = null) {
	return [
		...approvals ? [`approvals ${approvals}`] : [],
		...gitExes.map((g) => `gitexe ${g}`),
		...rwRoots.map((r) => `root ${r}`),
		...writable.map((w) => `allow ${w}`),
		...EXEC_CONFIG_DIRS.map((d) => `dir ${d}`),
		...EXEC_CONFIG_FILES.map((f) => `file ${f}`),
		...EXEC_CONFIG_PAIRS.map(([a, b]) => `pair ${a} ${b}`),
		...NAME_GUARD_EXEMPT.map((x) => `exempt ${x}`),
		""
	].join("\n");
}
/** Identity of an inode as the journal records it. */
function inodeKey(st) {
	return `${st.dev}:${st.ino}:${st.birthtimeNs}`;
}
/**
* Every inode the contained process created or opened for writing, from the
* journal (written by the supervisor before each call returns, so after the
* sandbox is frozen it is complete).
*/
function readJournal(file) {
	const out = /* @__PURE__ */ new Set();
	let text = "";
	try {
		text = fs.readFileSync(file, "utf8");
	} catch {
		return out;
	}
	for (const line of text.split("\n")) {
		if (/^[GCAV] /.test(line)) continue;
		const [dev, ino, sec, nsec] = line.split(" ");
		if (dev && ino && sec !== void 0 && nsec !== void 0) out.add(`${dev}:${ino}:${BigInt(sec) * 1000000000n + BigInt(nsec)}`);
	}
	return out;
}
//#endregion
export { checkRoutingProvenance as A, ignoredTopLevel as C, nodeToolchain as D, lookupProgram as E, suppliedValues as F, CODE_GUARD_DIR as I, UNGUARDED_INTERPRETERS as L, parseRequestBody as M, resolveProfiles as N, planContainment as O, routingValues as P, guardedInterpreter as R, findExecConfig as S, lddLibraries as T, PLACEHOLDER_DIRS as _, readJournal as a, SANDBOX_HOME as b, CREDENTIAL_DLP_IDS as c, EXEC_CONFIG_FILES as d, EXEC_CONFIG_PAIRS as f, NAME_GUARD_VIEW_PATH as g, INSTALL_OUTPUTS as h, nameGuardDigest as i, emailsIn as j, SHIPPED_EGRESS_PROFILES as k, CREDENTIAL_PATHS as l, INSTALL_MANIFESTS as m, inodeKey as n, nameGuardUnchanged as o, INSTALL_LOCKFILES as p, nameGuardConfig as r, CA_BUNDLE_PATHS as s, ensureNameGuard as t, EXEC_CONFIG_DIRS as u, PLACEHOLDER_FILE_CONTENT as v, isInstallMetadata as w, credentialFindings as x, PROGRAM_DIRS as y };
