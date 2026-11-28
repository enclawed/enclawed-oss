// What the contained git may write into a repository's .git/config (host
// side, after the writing git process exited; ./contain-init.ts).
//
// `git config`, `git remote add`, `git branch --set-upstream-to`,
// `git submodule init`, tracking set up by checkout/switch/push -u: plain
// settings. But git config is also where commands live, so every entry the
// write ADDED (or changed) is checked against the keys that make git run a
// program, load another file, or reach a remote through a helper. Derived
// from git-config(1) and the config lookups in git's sources
// (git_config_get_*/repo_config_* calls that end in run_command, a pager,
// an editor, a helper, a path that is read or executed):
//
//   commands   core.fsmonitor, core.hooksPath, core.sshCommand, core.pager,
//              core.editor, core.askPass, core.gitProxy,
//              core.alternateRefsCommand, sequence.editor, gpg.program,
//              gpg.<fmt>.program, gpg.ssh.defaultKeyCommand, credential.helper,
//              credential.<url>.helper, diff.external, diff.<drv>.command,
//              diff.<drv>.textconv, difftool.<t>.cmd|path, mergetool.<t>.cmd|path,
//              merge.<drv>.driver, filter.<drv>.* (clean, smudge, process),
//              web.browser, browser.<t>.cmd|path, man.<t>.cmd|path,
//              pager.<cmd> (a value other than a boolean), interactive.diffFilter,
//              sendemail.* commands and server, tar.<fmt>.command,
//              uploadpack.packObjectsHook, remote.<r>.uploadpack|receivepack,
//              remote.<r>.vcs (a remote helper), hook.<name>.* (config hooks),
//              alias.<a> starting with "!", submodule.<s>.update starting with "!";
//   paths      include.path, includeIf.<cond>.path, core.worktree,
//              core.excludesFile, core.attributesFile, init.templateDir,
//              gpg.ssh.allowedSignersFile, trace2.* targets;
//   transports protocol.allow / protocol.<p>.allow = always, ssh.variant,
//              http.proxy, http.<url>.proxy, remote.<r>.proxy; and a URL
//              (remote.<r>.url, pushurl, url.<base>.insteadOf, pushInsteadOf)
//              that names a remote helper ("ext::...", an unknown scheme).
// Plain keys (remote.<r>.url to https/ssh/git/file or a path, remote.<r>.fetch,
// branch.<b>.*, user.*, core.* data settings, ...) pass.
//
// Verified against git v2.53.0's sources (github.com/git/git, tag v2.53.0,
// tarball sha256 0492bcd8a9fc99bedca75dbec7c8c15b24dd1501c82d4518294ee0850f91f219,
// read as data only): every config key read in a file that starts a child
// process, plus the key names compared in parse_config_key callbacks. Keys
// that source review ADDED to the list above, by file:
//   reachable.c          gc.recentObjectsHook (runs each hook command)
//   builtin/gc.c         gc.repackFilterTo (a path packs are written to)
//   imap-send.c          imap.tunnel (runs a command instead of connecting)
//   builtin/receive-pack.c receive.procReceiveRefs (routes refs to the proc-receive hook)
//   promisor-remote.c    promisor.acceptFromServer (adopts remotes a server names)
//   bundle-uri.c         bundle.<id>.uri, fetch.bundleURI (fetched URLs: helpers refused)
//   submodule-config.c   submodule.<s>.url (a helper URL is refused)
//   builtin/help.c       help.browser, help.htmlPath, man.viewer
//   diff.c               diff.orderFile; blame.c: blame.ignoreRevsFile;
//   mailmap.c            mailmap.file; builtin/log.c: format.signatureFile
//   http.c               http.cookieFile, http.sslCert, http.sslKey, http.sslCAPath,
//                        http.sslCAInfo, http.proxySSLCert, http.proxySSLKey,
//                        http.proxySSLCAInfo (also per URL: http.<url>.*)
//   gpg-interface.c      gpg.ssh.revocationFile
//   fsmonitor-settings.c fsmonitor.socketDir
//   git-send-email.perl  sendemail.headerCmd, sendmailCmd, smtpSSLCertPath
//   git-instaweb.sh      instaweb.httpd, instaweb.gitwebdir, instaweb.modulePath
//   git-svn.perl         svn.authorsProg, svn.authorsFile, svn-remote.<r>.authorsProg
// and the per-worktree config file (.git/config.worktree, read when
// extensions.worktreeConfig is set) is guarded and checked like .git/config.

import { git } from "./repo-config.js";

export type ConfigEntry = Readonly<{ key: string; value: string | null }>;

/** Entries of a config file, read by git itself without following includes. */
export function readConfigEntries(top: string, file: string): ConfigEntry[] {
  const out = git(top, ["config", "--file", file, "--no-includes", "--list", "-z"]).toString(
    "utf8",
  );
  const entries: ConfigEntry[] = [];
  for (const rec of out.split("\0").filter(Boolean)) {
    const nl = rec.indexOf("\n");
    entries.push(
      nl < 0 ? { key: rec, value: null } : { key: rec.slice(0, nl), value: rec.slice(nl + 1) },
    );
  }
  return entries;
}

const SAFE_SCHEMES = new Set(["https", "http", "ssh", "git", "file", "git+ssh", "ssh+git"]);

/** A remote URL that git reaches without a helper program of the URL's choosing. */
export function plainUrl(v: string): boolean {
  if (/^[A-Za-z][A-Za-z0-9+.-]*::/.test(v)) {
    return false; // <transport>::<address>: runs git-remote-<transport> (ext:: runs a shell command)
  }
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//.exec(v);
  if (m) {
    return SAFE_SCHEMES.has(m[1].toLowerCase());
  }
  return true; // scp-like user@host:path, or a local path
}

const COMMAND_KEYS = new Set([
  "core.fsmonitor",
  "core.hookspath",
  "core.sshcommand",
  "core.pager",
  "core.editor",
  "core.askpass",
  "core.gitproxy",
  "core.alternaterefscommand",
  "core.worktree",
  "core.excludesfile",
  "core.attributesfile",
  "sequence.editor",
  "gpg.program",
  "gpg.ssh.defaultkeycommand",
  "gpg.ssh.allowedsignersfile",
  "credential.helper",
  "diff.external",
  "web.browser",
  "interactive.difffilter",
  "uploadpack.packobjectshook",
  "include.path",
  "init.templatedir",
  "ssh.variant",
  "http.proxy",
  "gc.recentobjectshook",
  "gc.repackfilterto",
  "imap.tunnel",
  "receive.procreceiverefs",
  "fetch.bundleuri",
  "help.browser",
  "help.htmlpath",
  "man.viewer",
  "diff.orderfile",
  "blame.ignorerevsfile",
  "mailmap.file",
  "format.signaturefile",
  "gpg.ssh.revocationfile",
  "fsmonitor.socketdir",
  "instaweb.httpd",
  "instaweb.gitwebdir",
  "instaweb.modulepath",
  "svn.authorsprog",
  "svn.authorsfile",
]);

/** http.* (and http.<url>.*) keys that name a proxy or a file. */
const HTTP_PATH_KEYS = new Set([
  "proxy",
  "cookiefile",
  "sslcert",
  "sslkey",
  "sslcapath",
  "sslcainfo",
  "proxysslcert",
  "proxysslkey",
  "proxysslcainfo",
]);

/** Why `e` lets git run or load something, or null for a plain setting. */
export function executionCapable(e: ConfigEntry): string | null {
  const key = e.key;
  const value = e.value ?? "";
  const first = key.indexOf(".");
  const last = key.lastIndexOf(".");
  const section = key.slice(0, first).toLowerCase();
  const name = key.slice(last + 1).toLowerCase();
  const sub = first === last ? null : key.slice(first + 1, last);
  // Fixed three-part names (gpg.ssh.defaultKeyCommand) are looked up whole.
  const flat = sub === null ? `${section}.${name}` : key.toLowerCase();
  if (COMMAND_KEYS.has(flat)) {
    if (flat === "fetch.bundleuri" && plainUrl(value)) {
      return null;
    }
    return `${key} runs a program or loads a file`;
  }
  switch (section) {
    case "filter":
      return `${key}: filter drivers run commands`;
    case "hook":
      return `${key}: config hooks run commands`;
    case "trace2":
      return `${key}: trace targets are paths`;
    case "includeif":
      return name === "path" ? `${key} loads another config file` : null;
    case "credential":
      return name === "helper" ? `${key} runs a credential helper` : null;
    case "gpg":
      return name === "program" ? `${key} runs a signing program` : null;
    case "diff":
      return name === "command" || name === "textconv" ? `${key} runs a diff driver` : null;
    case "difftool":
    case "mergetool":
    case "browser":
    case "man":
      return name === "cmd" || name === "path" ? `${key} runs a tool` : null;
    case "merge":
      return sub !== null && name === "driver" ? `${key} runs a merge driver` : null;
    case "tar":
      return name === "command" ? `${key} runs an archive filter` : null;
    case "sendemail":
      return name.endsWith("cmd") || name === "smtpserver" || name === "smtpsslcertpath"
        ? `${key} runs a program or loads a file`
        : null;
    case "pager":
      return /^(true|false|yes|no|on|off|1|0)$/i.test(value) ? null : `${key} sets a pager command`;
    case "alias":
      return value.trimStart().startsWith("!") ? `${key} is a shell alias` : null;
    case "submodule":
      if (name === "url" && !plainUrl(value)) {
        return `${key} = ${value} names a remote helper`;
      }
      return name === "update" && value.trimStart().startsWith("!")
        ? `${key} runs a command`
        : null;
    case "bundle":
      return name === "uri" && !plainUrl(value) ? `${key} = ${value} names a remote helper` : null;
    case "promisor":
      return name === "acceptfromserver" && value.toLowerCase() !== "none"
        ? `${key} adopts remotes a server names`
        : null;
    case "svn-remote":
      return name === "authorsprog" || name === "authorsfile"
        ? `${key} runs a program or loads a file`
        : null;
    case "protocol":
      return name === "allow" && value.toLowerCase() === "always"
        ? `${key} allows every transport`
        : null;
    case "http":
      return HTTP_PATH_KEYS.has(name) ? `${key} names a proxy or a file` : null;
    case "remote":
      if (["uploadpack", "receivepack", "vcs", "proxy"].includes(name)) {
        return `${key} runs a program or a remote helper`;
      }
      if ((name === "url" || name === "pushurl") && !plainUrl(value)) {
        return `${key} = ${value} names a remote helper`;
      }
      return null;
    case "url":
      return (name === "insteadof" || name === "pushinsteadof") && sub !== null && !plainUrl(sub)
        ? `${key} rewrites URLs to a remote helper`
        : null;
    default:
      return null;
  }
}

/** Entries of `after` not in `before` (a multiset difference) that are execution-capable. */
export function introducedExecution(
  before: readonly ConfigEntry[],
  after: readonly ConfigEntry[],
): Array<{ entry: ConfigEntry; why: string }> {
  const seen = new Map<string, number>();
  const k = (e: ConfigEntry) => `${e.key}\n${e.value ?? "\0"}`;
  for (const e of before) {
    seen.set(k(e), (seen.get(k(e)) ?? 0) + 1);
  }
  const out: Array<{ entry: ConfigEntry; why: string }> = [];
  for (const e of after) {
    const n = seen.get(k(e)) ?? 0;
    if (n > 0) {
      seen.set(k(e), n - 1);
      continue;
    }
    const why = executionCapable(e);
    if (why) {
      out.push({ entry: e, why });
    }
  }
  return out;
}
