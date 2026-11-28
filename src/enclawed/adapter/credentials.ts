// enclawed adapter kit: credential custody in the decisions.
//
//   default credential paths   the stores where the user's own credentials
//                              live (cloud CLIs, SSH keys, registry tokens,
//                              .env files, other processes' environments). A
//                              read or a command that reaches one asks a
//                              person every time (never pre-approved) and is
//                              refused where no person can be asked.
//   environment dumps          `env`, `printenv`, `export -p` and the like
//                              print every credential in the session's
//                              environment: the same rule.
//   output DLP                 credential formats (cloud keys, provider
//                              tokens, JWTs, private keys) are removed from a
//                              tool's result before the model reads it.
//   outbound DLP               a call that sends data out (MCP, fetch, search)
//                              carrying a credential format is refused.
//
// Detection uses the framework's DLP scanner (../dlp-scanner.ts), strict
// credential formats only: loose shapes and personal data are not removed
// from tool output, so ordinary results are never changed.

import fs from "node:fs";
import path from "node:path";
import { scan } from "../dlp-scanner.js";
import { hardLinkedSecret, linkedSecretBelow, type SecretRoots } from "./credential-links.js";
import { credentialLike } from "./env-trust.js";
import { comparablePath, expandHome, isInside, pathWords, type FsProbe } from "./fs-probe.js";
import { providerTokenFindings, secretContentOf } from "./secret-content.js";

/** Credential stores below the home directory: a directory means everything inside it. */
export const HOME_CREDENTIAL_PATHS: readonly string[] = [
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
  ".ssh/private",
];

/** Secret files by name, anywhere (the project's own included). */
export const SECRET_FILE_NAMES: ReadonlySet<string> = new Set([
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
  "kubeconfig",
]);
/** Key and keystore files by extension (extensions no other common format uses). */
export const SECRET_FILE_EXT = /\.(pem|p12|pfx|jks|keystore|ppk|gpg|kdbx|ovpn)$/i;
/** A PEM file whose name says it is a certificate or a public key (cert.pem, fullchain.pem, ca-bundle.pem, public.pem): not a secret. */
const PEM_PUBLIC =
  /(^|[-_.])(cert|certs|crt|chain|fullchain|ca|cacert|ca-bundle|bundle|pub|public|root)([-_.]|$)/i;
/** Private keys by name, anywhere: deploy_rsa, github_ed25519, identity. */
const KEY_NAME = /^(identity|.+_(rsa|dsa|ecdsa|ed25519))$/i;
/** Credential JSON by name: cloud service accounts, OAuth client secrets, key files. */
const CREDENTIAL_JSON =
  /^(credentials|client_secrets?(_[^/]*)?|service[-_]?account[^/]*|gcp[-_]key[^/]*|keyfile)\.json$/i;
/** Files in ~/.ssh that are not private keys. */
const SSH_PUBLIC = /^(known_hosts(\.old)?|config|authorized_keys|environment)$|\.pub$/i;
/** A process's environment: /proc/<pid|self|thread-self|glob>[/task/<tid>]/environ, and its memory. */
const PROC_ENVIRON = /^\/proc\/([^/]+)(\/task\/[^/]+)?\/(environ|mem)$/;
/**
 * Extensions shared with ordinary documents (`.key` is also a Keynote
 * document, `.asc` also a detached signature or a public key): a credential
 * only when the content has a private key's shape, or in a known key location.
 */
export const SHAPE_CHECKED_EXT = /\.(key|asc)$/i;
/** Directories that hold private keys whatever their files are called. */
export const KEY_DIRECTORIES: readonly string[] = ["/etc/ssl/private", "/etc/pki/tls/private"];

const PRIVATE_KEY_TEXT =
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----|-----BEGIN PGP PRIVATE KEY BLOCK-----|PuTTY-User-Key-File-/;

/**
 * Does the file at `p` look like a private key: PEM / OpenSSH / PGP / PuTTY
 * private-key text, or DER PKCS#8 (SEQUENCE, version 0, AlgorithmIdentifier)?
 * A missing file, a directory (a Keynote bundle) or an unreadable file is not.
 */
export function privateKeyShaped(p: string): boolean {
  let fd: number | null = null;
  try {
    const st = fs.statSync(p);
    if (!st.isFile() || st.size === 0) {
      return false;
    }
    fd = fs.openSync(p, "r");
    const buf = Buffer.alloc(Math.min(st.size, 8192));
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const head = buf.subarray(0, n);
    if (PRIVATE_KEY_TEXT.test(head.toString("latin1"))) {
      return true;
    }
    // DER PKCS#8: 30 82 LL LL 02 01 00 30 (or a short-form length: 30 LL 02 01 00 30).
    const der =
      (head[0] === 0x30 &&
        head[1] === 0x82 &&
        head[4] === 0x02 &&
        head[5] === 0x01 &&
        head[6] === 0x00 &&
        head[7] === 0x30) ||
      (head[0] === 0x30 &&
        head[1] < 0x80 &&
        head[2] === 0x02 &&
        head[3] === 0x01 &&
        head[4] === 0x00 &&
        head[5] === 0x30);
    return der;
  } catch {
    return false;
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
}

const TEMPLATE_SUFFIX = /^\.env\.(example|sample|template|dist|defaults)$/i;

export type CredentialHit = Readonly<{ path: string; what: string }>;

/** Is `abs` (absolute, resolved) one of the user's credential stores? */
export function credentialPathOf(abs: string, home: string | null): CredentialHit | null {
  const p = path.resolve(abs);
  const base = path.basename(p);
  if (PROC_ENVIRON.test(p.replace(/\\/g, "/"))) {
    return { path: p, what: "another process's environment or memory" };
  }
  if (/^\.env(\..+)?$/i.test(base) && !TEMPLATE_SUFFIX.test(base)) {
    return { path: p, what: "an environment file (.env)" };
  }
  // Secret files wherever they are, inside the project too (row 40).
  if (
    SECRET_FILE_NAMES.has(base.toLowerCase()) ||
    /^client_secret.*\.json$/i.test(base) ||
    CREDENTIAL_JSON.test(base)
  ) {
    return { path: p, what: "a credentials file" };
  }
  if (/^id_(rsa|dsa|ecdsa|ed25519|xmss)(_sk)?$/i.test(base) || KEY_NAME.test(base)) {
    return { path: p, what: "an SSH private key" };
  }
  if (SECRET_FILE_EXT.test(base) && !(/\.pem$/i.test(base) && PEM_PUBLIC.test(base.slice(0, -4)))) {
    return { path: p, what: "a key or certificate file" };
  }
  if (KEY_DIRECTORIES.some((d) => isInside(d, p) && p !== d)) {
    return { path: p, what: "a file in a private-key directory" };
  }
  if (SHAPE_CHECKED_EXT.test(base) && privateKeyShaped(p)) {
    return { path: p, what: "a private key file" };
  }
  if (home) {
    const ssh = path.join(home, ".ssh");
    // Anything in ~/.ssh but the public files is a private key (deploy keys have any name).
    if (isInside(ssh, p) && comparablePath(p) !== comparablePath(ssh) && !SSH_PUBLIC.test(base)) {
      return { path: p, what: "an SSH private key" };
    }
    for (const rel of HOME_CREDENTIAL_PATHS) {
      const c = path.join(home, rel);
      if (isInside(c, p)) {
        return { path: c, what: "a credential store" };
      }
    }
  }
  return null;
}

/** A credential store inside `dir` (a recursive search of `dir` reaches it), or null. */
export function credentialBelow(dir: string, home: string | null): CredentialHit | null {
  if (!home) {
    return null;
  }
  for (const rel of [...HOME_CREDENTIAL_PATHS, ".ssh"]) {
    const c = path.join(home, rel);
    if (isInside(dir, c)) {
      return { path: c, what: rel === ".ssh" ? "SSH private keys" : "a credential store" };
    }
  }
  return null;
}

const hasGlob = (p: string) => /[*?[{]/.test(p);

/**
 * The user's credential files, for finding their other names (hard links,
 * symbolic links): the home credential stores, ~/.ssh's private files, the
 * home directory's own credential files (~/.pgpass, ~/.netrc, ...), and the
 * private-key directories.
 */
function credentialRoots(home: string | null): SecretRoots {
  const isCredential = (p: string) => credentialPathOf(p, home) !== null;
  const roots = KEY_DIRECTORIES.map((d) => ({ path: d, include: () => true }));
  if (!home) {
    return roots;
  }
  const out = [
    ...roots,
    ...[...HOME_CREDENTIAL_PATHS, ".ssh"].map((r) => ({
      path: path.join(home, r),
      include: isCredential,
    })),
  ];
  try {
    for (const n of fs.readdirSync(home)) {
      const p = path.join(home, n);
      if (isCredential(p)) {
        out.push({ path: p, include: () => true });
      }
    }
  } catch {
    /* no home */
  }
  return out;
}

const CREDENTIAL_LINK = "a credentials file";

/** A regular file that is another name (hard link) of one of the user's credential files, or null. */
export function hardLinkedCredential(real: string, home: string | null): CredentialHit | null {
  return hardLinkedSecret(real, credentialRoots(home), CREDENTIAL_LINK);
}

/** A link below `dir` (symbolic or hard) that a recursive read follows into a credential, or null. */
export function linkedCredentialBelow(dir: string, home: string | null): CredentialHit | null {
  return linkedSecretBelow(
    dir,
    credentialRoots(home),
    (real) => credentialPathOf(real, home) ?? credentialBelow(real, home),
    CREDENTIAL_LINK,
  );
}

/**
 * Does a target the agent names reach a credential store? `recursive`: the
 * tool also reads below it. A glob reaches what it matches now (each match read as if
 * named; too many to check is a hit), and below its static prefix when recursive.
 */
export function readReachesCredential(
  fs: Pick<FsProbe, "realpathNearest">,
  abs: string,
  home: string | null,
  recursive: boolean,
  listOnly = false,
  /** Whether a glob here is one the shell expands (a whole word); else only its names are checked. */
  expandGlob = true,
): CredentialHit | null {
  if (hasGlob(abs)) {
    // A listing (a glob tool) shows names, not content: only a listing inside a credential store asks.
    if (listOnly) {
      const prefix = abs.split(/[*?[{]/)[0];
      const dir = prefix.endsWith("/") ? prefix : path.dirname(prefix);
      return credentialPathOf(dir || "/", home);
    }
    const prefix = abs.split(/[*?[{]/)[0];
    const dir = prefix.endsWith("/") ? prefix : path.dirname(prefix);
    // The pattern itself may name a credential path (/proc/*/environ).
    // A reader that descends reaches whatever the static prefix holds.
    const named =
      credentialPathOf(prefix, home) ??
      credentialPathOf(abs, home) ??
      (recursive ? credentialBelow(dir || "/", home) : null) ??
      (recursive ? linkedCredentialBelow(dir || "/", home) : null);
    if (named || recursive || !expandGlob) {
      return named;
    }
    // What the pattern matches now: each file is read as if named (a credential
    // by name or by what it holds). Too many matches to look at: refused as a hit.
    const matches = globFiles(abs);
    if (matches === null) {
      return { path: abs, what: "files a pattern matches, too many to check" };
    }
    for (const m of matches) {
      const real = fs.realpathNearest(m);
      const hit =
        credentialPathOf(m, home) ??
        credentialPathOf(real, home) ??
        hardLinkedCredential(real, home) ??
        secretFileHit(real);
      if (hit) {
        return hit;
      }
    }
    return null;
  }
  const real = fs.realpathNearest(abs);
  return (
    credentialPathOf(abs, home) ??
    credentialPathOf(real, home) ??
    (recursive
      ? (credentialBelow(abs, home) ??
        credentialBelow(real, home) ??
        (listOnly ? null : linkedCredentialBelow(real, home)))
      : null) ??
    // Another name of a credential file (a hard link has its content).
    (listOnly ? null : hardLinkedCredential(real, home)) ??
    // A secret recognized by what the file holds, wherever it is (./secret-content.ts).
    (recursive || listOnly ? null : secretFileHit(real))
  );
}

const MAX_GLOB_MATCHES = 2048;

/** One pattern segment as a regular expression (a superset of the shell's: dot files and case included). */
function segmentRegExp(seg: string): RegExp {
  let re = "";
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (c === "*") {
      re += ".*";
    } else if (c === "?") {
      re += ".";
    } else if (c === "[") {
      const end = seg.indexOf("]", i + 2);
      if (end < 0) {
        re += "\\[";
        continue;
      }
      const body = seg
        .slice(i + 1, end)
        .replace(/^!/, "^")
        .replace(/\\/g, "\\\\");
      re += `[${body}]`;
      i = end;
    } else if (c === "{") {
      const end = seg.indexOf("}", i);
      if (end < 0) {
        re += "\\{";
        continue;
      }
      re += `(?:${seg
        .slice(i + 1, end)
        .split(",")
        .map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|")})`;
      i = end;
    } else {
      re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  try {
    return new RegExp(`^(?:${re})$`, "i");
  } catch {
    // An inverted range: the shell's class matches no name (the word stays as written,
    // which is still compared literally by the caller).
    return /(?!)/;
  }
}

/** The existing paths an absolute pattern matches, or null when there are too many to check. */
function globFiles(pattern: string): string[] | null {
  const segs = path.resolve(pattern).split(path.sep).filter(Boolean);
  let current: string[] = [path.sep];
  for (const seg of segs) {
    const next: string[] = [];
    for (const dir of current) {
      if (!/[*?[{]/.test(seg)) {
        const p = path.join(dir, seg);
        if (lexists(p)) {
          next.push(p);
        }
        continue;
      }
      let names: string[];
      try {
        names = fs.readdirSync(dir);
      } catch {
        continue;
      }
      const re = segmentRegExp(seg);
      for (const n of names) {
        if (re.test(n) || n === seg) {
          next.push(path.join(dir, n));
        }
      }
    }
    if (next.length > MAX_GLOB_MATCHES) {
      return null;
    }
    current = next;
  }
  return current;
}

/** Nothing is at `p` (ENOENT, ENOTDIR); a path that cannot be looked at (EACCES) is not absent. */
function absent(p: string): boolean {
  try {
    fs.lstatSync(p);
    return false;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    return code === "ENOENT" || code === "ENOTDIR";
  }
}

function lexists(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

// A line of an environment file that is an assignment (NAME=..., export NAME=...), or blank.
const ENV_ASSIGNMENT_LINE = /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.]*\s*=|^\s*$/;
// A pattern whose every match is made of name characters (letters, digits,
// underscore), optionally anchored and ending in `=`: what grep -o prints is a name.
const NAME_ONLY_PATTERN = /^\^?\[(?:A-Z|a-z|0-9|_)+\][+*]=?$/;

/**
 * A simple command that prints only the variable names of the files it
 * reads, never a value: `cut -d= -f1 FILE...` over files whose every line is
 * an assignment or blank (a line without `=` would print whole; a missing
 * file prints nothing), or `grep -o PATTERN FILE...` whose pattern matches
 * only name characters and `=`. Anything else: false.
 */
export function printsNamesOnly(argv: readonly string[], cwd: string): boolean {
  const [prog, ...args] = argv;
  if (prog === "cut") {
    let delim: string | null = null;
    let fields: string | null = null;
    const files: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "-d" || a === "--delimiter") {
        delim = args[++i] ?? null;
      } else if (a.startsWith("--delimiter=")) {
        delim = a.slice("--delimiter=".length);
      } else if (a.startsWith("-d")) {
        delim = a.slice(2);
      } else if (a === "-f" || a === "--fields") {
        fields = args[++i] ?? null;
      } else if (a.startsWith("--fields=")) {
        fields = a.slice("--fields=".length);
      } else if (a.startsWith("-f")) {
        fields = a.slice(2);
      } else if (a === "-s" || a === "--only-delimited") {
        continue;
      } else if (a.startsWith("-")) {
        return false;
      } else {
        files.push(a);
      }
    }
    if (delim !== "=" || fields !== "1" || files.length === 0) {
      return false;
    }
    return files.every((f) => {
      const abs = path.resolve(cwd, f);
      if (!lexists(abs)) {
        return true;
      }
      try {
        const st = fs.statSync(abs);
        if (!st.isFile() || st.size > 1024 * 1024) {
          return false;
        }
        return fs
          .readFileSync(abs, "utf8")
          .split(/\r?\n/)
          .every((l) => ENV_ASSIGNMENT_LINE.test(l));
      } catch {
        return false;
      }
    });
  }
  if (prog === "grep" || prog === "egrep") {
    let only = false;
    const rest: string[] = [];
    for (const a of args) {
      if (/^-[oEnhHis]+$/.test(a)) {
        only ||= a.includes("o");
      } else if (a.startsWith("-")) {
        return false;
      } else {
        rest.push(a);
      }
    }
    return only && rest.length >= 2 && NAME_ONLY_PATTERN.test(rest[0]);
  }
  return false;
}

function secretFileHit(real: string): CredentialHit | null {
  const what = secretContentOf(real, credentialFindings);
  return what ? { path: real, what: `a file that holds ${what}` } : null;
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
  "tree",
]);

/** A credential store a shell command reaches by one of its words (literal, ~, $HOME, relative, symlink). */
export function commandReachesCredential(
  fs: Pick<FsProbe, "realpathNearest">,
  command: string,
  cwd: string,
  home: string | null,
  /**
   * Nothing on the line before this command can create a file: a credential
   * path under `cwd` or the home directory that does not exist (no file, no
   * link; ENOENT) shows nothing and is skipped.
   */
  absentShowsNothing = false,
): CredentialHit | null {
  // grep's first operand (no -e/-f given) is its pattern, never a file it reads.
  const toks = command.replace(/['"]/g, "").trim().split(/\s+/);
  let text = command;
  if (/^(?:grep|egrep|fgrep|zgrep)$/.test(path.basename(toks[0] ?? ""))) {
    const usesE = toks.some((t) => /^-[a-zA-Z]*[ef]$|^--(?:regexp|file)(?:=|$)/.test(t));
    const dd = toks.indexOf("--");
    // An option's separate value (-A 3, -m 1) may be taken for the pattern: then the
    // real pattern stays a word, checked as a path (the wider set).
    const before = toks.findIndex((t, k) => k > 0 && (dd < 0 || k < dd) && !t.startsWith("-"));
    // The first operand: before a `--`, or, when every word before it is an option, the word after it.
    const pat = usesE ? -1 : before > 0 ? before : dd > 0 && dd + 1 < toks.length ? dd + 1 : -1;
    if (pat > 0) {
      text = [...toks.slice(0, pat), ...toks.slice(pat + 1)].join(" ");
    }
  }
  const words = pathWords(text);
  // A glob is expanded by the shell only as a whole word (`.*` inside `'<p>.*</p>'` is not).
  const whole = new Set(toks);
  if (words.length === 0) {
    return null;
  }
  // Listing or stat-ing names reads no content (a compound line's other parts are separate words).
  if (/^\s*(ls|stat)(\s|$)/.test(command) && !/[;&|`\n]|\$\(/.test(command)) {
    return null;
  }
  const recursive =
    SEARCHERS.has(path.basename(words[0])) &&
    (path.basename(words[0]) !== "grep" ||
      /(^|\s)-[a-zA-Z]*[rR]|--recursive|--dereference-recursive/.test(command));
  for (const w of words.slice(1)) {
    if (/^\$\{?HOME\}?$/.test(w) && !recursive) {
      continue;
    }
    const abs = path.resolve(cwd, expandHome(w, home));
    // Only under the command's directory or the home directory: system credential
    // locations (/etc, /proc, /run, ...) keep the rule by name.
    if (
      absentShowsNothing &&
      !hasGlob(abs) &&
      (isInside(cwd, abs) || (home !== null && isInside(home, abs))) &&
      absent(abs)
    ) {
      continue;
    }
    const hit = readReachesCredential(fs, abs, home, recursive, false, whole.has(w));
    if (hit) {
      return hit;
    }
  }
  return null;
}

/** `env` with options and NAME=VALUE only (no command): it prints the environment. */
function envDumps(args: readonly string[]): boolean {
  for (let j = 0; j < args.length; j++) {
    const a = args[j];
    if (a === "--version" || a === "--help") {
      return false; // prints no environment
    }
    if (a === "-S" || a === "--split-string" || a.startsWith("--split-string=")) {
      return false; // runs the program in the string
    }
    if (a === "-u" || a === "--unset" || a === "-C" || a === "--chdir") {
      j++;
      continue;
    }
    if (a.startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(a)) {
      continue;
    }
    return false; // a command: env runs it with that environment
  }
  return true;
}

const ENV_DUMP_POSIX: ReadonlyArray<(argv: readonly string[]) => boolean> = [
  (a) => a[0] === "env" && envDumps(a.slice(1)),
  // printenv with no name prints everything; with names, only a credential-shaped one is a dump.
  (a) =>
    a[0] === "printenv" &&
    (a.slice(1).every((x) => x.startsWith("-")) ||
      a.slice(1).some((x) => !x.startsWith("-") && credentialLike(x))),
  // BSD-style ps with e (or -E): other processes' environments.
  (a) =>
    a[0] === "ps" &&
    a.slice(1).some((x) => (!x.startsWith("-") && /e/.test(x)) || /^-[a-zA-Z]*E/.test(x)),
  (a) => a[0] === "export" && (a.length === 1 || a[1] === "-p"),
  (a) => a[0] === "declare" && a.slice(1).some((x) => /^-[a-zA-Z]*[xp]/.test(x)),
  (a) => a[0] === "typeset" && a.slice(1).some((x) => /^-[a-zA-Z]*[xp]/.test(x)),
  (a) => a[0] === "set" && a.length === 1,
  (a) => a[0] === "compgen" && a.includes("-v"),
];

/**
 * Does a command print the session's environment (where credentials live)?
 * Checked on every simple command of a compound line.
 */
export function dumpsEnvironment(command: string, dialect: "posix" | "powershell"): boolean {
  if (dialect === "powershell") {
    return (
      /(^|[\s;|(])(get-childitem|gci|dir|ls|get-item|gi|get-content|gc|cat|type)\s+['"]?env:/i.test(
        command,
      ) || /\[(system\.)?environment\]::getenvironmentvariables/i.test(command)
    );
  }
  for (const seg of command.split(/\|\||&&|[;|&\n]|\$\(|`/)) {
    const words = seg.replace(/['"]/g, "").trim().split(/\s+/).filter(Boolean);
    // Redirections are not arguments (`printenv 2>/dev/null` prints everything).
    const argv: string[] = [];
    for (let i = 0; i < words.length; i++) {
      if (/^\d*(?:>>?|<|>&|&>)$/.test(words[i])) {
        i++;
      } else if (!/^\d*(?:>>?|<|>&|&>)\S/.test(words[i])) {
        argv.push(words[i]);
      }
    }
    // Wrappers that run the command after them.
    while (
      argv.length > 1 &&
      ["sudo", "command", "builtin", "exec", "nohup", "time"].includes(argv[0])
    ) {
      argv.shift();
    }
    // Leading NAME=VALUE assignments (FOO=1 env).
    while (argv.length > 1 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0])) {
      argv.shift();
    }
    if (argv.length && ENV_DUMP_POSIX.some((f) => f([path.basename(argv[0]), ...argv.slice(1)]))) {
      return true;
    }
  }
  return false;
}

// ─── DLP ────────────────────────────────────────────────────────────────

/** The framework's strict credential formats (no loose shapes, no personal data). */
export const CREDENTIAL_FORMATS: ReadonlySet<string> = new Set([
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
  "pem-private-key",
]);

export const CREDENTIAL_PLACEHOLDER = "[credential removed by Enclawed]";
const CHUNK = 512 * 1024;
const OVERLAP = 8 * 1024;
const PEM_BLOCK =
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED |PGP )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH |DSA |ENCRYPTED |PGP )?PRIVATE KEY-----|$)/g;

/** The credential formats in a text (every chunk scanned, so a large text has no unscanned tail). */
export function credentialFindings(text: string): { id: string; match: string }[] {
  const out: { id: string; match: string }[] = [];
  for (let i = 0; i < text.length; i += CHUNK) {
    const part = text.slice(Math.max(0, i - OVERLAP), i + CHUNK);
    for (const f of scan(part, { onOversize: "truncate" })) {
      if (CREDENTIAL_FORMATS.has(f.id)) {
        out.push({ id: f.id, match: f.match });
      }
    }
    // Provider key formats the scanner does not know (./secret-content.ts).
    out.push(...providerTokenFindings(part));
  }
  return out;
}

/** A text with every credential format replaced (a private key with its whole body). */
export function redactCredentials(text: string): {
  text: string;
  kinds: string[];
  removed: number;
} {
  const found = credentialFindings(text);
  if (found.length === 0) {
    return { text, kinds: [], removed: 0 };
  }
  let out = text.replace(PEM_BLOCK, CREDENTIAL_PLACEHOLDER);
  let removed = text === out ? 0 : 1;
  const matches = [...new Set(found.filter((f) => f.id !== "pem-private-key").map((f) => f.match))]
    // Longest first, so one match inside another is not left half replaced.
    .toSorted((a, b) => b.length - a.length);
  for (const m of matches) {
    const parts = out.split(m);
    removed += parts.length - 1;
    out = parts.join(CREDENTIAL_PLACEHOLDER);
  }
  return { text: out, kinds: [...new Set(found.map((f) => f.id))].toSorted(), removed };
}

/** Every string of a value (an object's keys and values, arrays), depth bounded. */
export function stringsOf(v: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 64) {
    return out;
  }
  if (typeof v === "string") {
    out.push(v);
  } else if (Array.isArray(v)) {
    for (const x of v) {
      stringsOf(x, out, depth + 1);
    }
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      stringsOf(x, out, depth + 1);
    }
  }
  return out;
}

/** The value with credential formats removed from every string, in the same shape. */
export function redactCredentialsIn(v: unknown): {
  value: unknown;
  removed: number;
  kinds: string[];
} {
  let removed = 0;
  const kinds = new Set<string>();
  const walk = (x: unknown, depth: number): unknown => {
    if (typeof x === "string") {
      const r = redactCredentials(x);
      removed += r.removed;
      for (const k of r.kinds) {
        kinds.add(k);
      }
      return r.text;
    }
    if (depth > 64 || !x || typeof x !== "object") {
      return x;
    }
    if (Array.isArray(x)) {
      return x.map((y) => walk(y, depth + 1));
    }
    return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y, depth + 1)]));
  };
  const value = walk(v, 0);
  return { value, removed, kinds: [...kinds].toSorted() };
}
