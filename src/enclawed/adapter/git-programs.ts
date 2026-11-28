// enclawed adapter kit: which programs a repository's git configuration can
// start, and which read-only git commands actually start them.
//
// A read-only git command (the allowlist in ./shell-readonly.ts) can still
// run a program the repository names: an untrusted checkout ships its own
// .git/config and .git/hooks. Which command runs which program was measured
// against git v2.53.0 (the system git the kit's checks use), with each
// mechanism planted in a fresh repository holding a committed change and a
// working-tree change, and every read-only subcommand run with stdout not a
// terminal:
//
//   core.fsmonitor (a program)   status, diff (also --cached), blame, grep (also
//                                --cached), ls-files (every mode), check-ignore,
//                                describe --dirty
//   filter.<d>.clean|smudge|process
//                                status, diff, blame, ls-files -m, describe --dirty
//   diff.<d>.textconv            diff, show (a commit's patch; not a blob or
//                                tree named REV:path without --textconv), log -p, blame;
//                                status -v/--verbose (its diff of staged
//                                changes); log, show, whatchanged with a
//                                pickaxe search (-S, -G), patch or not;
//                                not with --no-textconv, not for --stat/--name-*
//                                output, not log/show without a patch or pickaxe
//   diff.external, diff.<d>.command
//                                diff (not with --no-ext-diff)
//   hooks: post-index-change     status, describe --dirty (git writes the
//   (core.hooksPath or .git/hooks) refreshed index); also diff and the other
//                                index readers when the index is stale (a
//                                work-tree file newer than the index): every
//                                command counts
//   core.pager, pager.<cmd>      only when stdout is a terminal; a host may give
//                                its shell one, so every command but those with
//                                --no-pager counts
//   gpg.program and log.showSignature
//                                log, show, whatchanged (a signed commit)
//   include.path, includeIf.*.path
//                                anything: the included file is not read here,
//                                so every command counts
//
// The host runs a read-only line as the person, so the rule is closed, not a
// list of known programs alone. Every configuration git reads counts: the
// repository's (config, config.worktree, the common directory's), and the
// person's global and system configuration as the session's environment
// names them (GIT_CONFIG_GLOBAL, XDG_CONFIG_HOME, HOME, GIT_CONFIG_SYSTEM,
// GIT_CONFIG_NOSYSTEM). A key that is neither a known program above nor on
// the list of keys no read-only command acts on (READ_INERT) counts for every
// command ("config"), and so does a GIT_* variable of the session that is not
// known inert. Hooks: git refreshes and rewrites a stale index on diff, blame,
// grep, ls-files and more (post-index-change), so any hook in the hooks
// directory (core.hooksPath, from any scope, or the common directory's
// hooks) other than the ones only writing commands run counts for every
// command, and so does a configured hook (hook.<name>.command).
//
// Everything else in the old list (core.editor, core.sshCommand, askPass,
// credential helpers, merge drivers, ...) is started only by commands that
// are not read-only (commit, fetch, merge, ...), which the allowlist already
// refuses. Where a measurement left room (diff --cached with a clean filter,
// ls-files without -m), the rule takes the wider set.

import fs from "node:fs";
import path from "node:path";

export type GitProgramKind =
  | "fsmonitor"
  | "filter"
  | "textconv"
  | "diff-command"
  | "hook"
  | "pager"
  | "gpg"
  | "include"
  | "config";

export type GitProgram = Readonly<{ kind: GitProgramKind; line: string }>;

const BOOLEAN = /^(true|false|yes|no|on|off|1|0)?$/i;
/** A pager value that runs nothing of its own: no pager, or `cat`. */
const INERT_PAGER = /^(?:|cat)$/;

/**
 * Keys no read-only command acts on as a program (as `section.key`, or
 * `section.*.key` with a subsection): data git reads, or settings only
 * commands outside the read-only list consult (commit, merge, rebase, push,
 * fetch and the network: credential helpers, ssh, http). Not here, so
 * counted for every command: extensions.partialClone and remote.*.promisor
 * (a missing object is fetched lazily, over the network, by any read),
 * core.worktree (the work tree is elsewhere), core.fsmonitor = true (git
 * starts its daemon), trace2.* (git writes its trace to a file or socket),
 * and every key Enclawed does not know.
 */
const READ_INERT = new RegExp(
  "^(?:" +
    [
      "core\\.(?:repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode|symlinks|autocrlf|safecrlf|eol|quotepath|abbrev|compression|loosecompression|editor|excludesfile|attributesfile|whitespace|untrackedcache|checkstat|trustctime|preloadindex|commitgraph|multipackindex|splitindex|sparsecheckout|sparsecheckoutcone|longpaths|fscache|packedgitwindowsize|packedgitlimit|deltabasecachesize|bigfilethreshold|warnambiguousrefs|sharedrepository|protecthfs|protectntfs|checkroundtripencoding|fsync|fsyncmethod|fsyncobjectfiles|askpass|sshcommand|gitproxy|commentchar|commentstring|notesref|hookspath|pager)",
      "core\\.fsmonitor=(?:false|no|off|0|)",
      "(?:user|author|committer|init|color|advice|i18n|credential|pull|push|rebase|merge|mergetool|difftool|status|log|format|pretty|blame|grep|fetch|help|commit|tag|index|feature|pack|protocol|http|url|sendemail|am|apply|rerere|transfer|receive|uploadpack|lfs|alias|column|interactive|add|checkout|clone|reset|stash|worktree|notes|mailmap|versionsort|sequence|trailer|gc|maintenance|bundle|submodule|branch|remote|ssh)\\.(?!\\*\\.)[^=]+",
      "extensions\\.(?:objectformat|compatobjectformat|worktreeconfig|refstorage|noop|preciousobjects)",
      "safe\\.(?:directory|barerepository)",
      "remote\\.\\*\\.(?:url|pushurl|fetch|push|tagopt|mirror|prune|prunetags|skipdefaultupdate|skipfetchall|followremotehead|receivepack|uploadpack|proxy|proxyauthmethod)",
      "branch\\.\\*\\.(?:remote|merge|rebase|pushremote|description)",
      "submodule\\.\\*\\.(?:url|active|branch|ignore|shallow|fetchrecursesubmodules)",
      "(?:credential|http|url|color|pretty|mergetool|difftool|merge|lfs|trailer|alias|sendemail)\\.\\*\\.[^=]+",
      "diff\\.(?:tool|guitool|renames|renamelimit|algorithm|mnemonicprefix|noprefix|srcprefix|dstprefix|colormoved|colormovedws|context|interhunkcontext|indentheuristic|relative|statgraphwidth|statnamewidth|submodule|ignoresubmodules|wserrorhighlight|dirstat|suppressblankempty|orderfile|autorefreshindex|trustexitcode|statcount|colormovedws)",
      "diff\\.\\*\\.(?:xfuncname|funcname|binary|wordregex|cachetextconv)",
      "filter\\.\\*\\.required",
      "gpg\\.(?:format|mintrustlevel)",
      "gpg\\.\\*\\.(?:allowedsignersfile|revocationfile)",
    ].join("|") +
    ")$",
);

/** Is this key (with its value) one no read-only command acts on? */
function readInert(section: string, sub: string | null, key: string, value: string): boolean {
  const name = sub === null ? `${section}.${key}` : `${section}.*.${key}`;
  if (section === "core" && key === "fsmonitor") {
    return READ_INERT.test(`${name}=${value.toLowerCase()}`);
  }
  if (section === "extensions" && key === "partialclone") {
    return false;
  }
  if (
    section === "remote" &&
    sub !== null &&
    (key === "promisor" || key === "partialclonefilter")
  ) {
    return false;
  }
  return READ_INERT.test(name);
}

/** The kind a config entry counts as for read-only commands, or null (inert). */
function entryKind(
  section: string,
  sub: string | null,
  key: string,
  value: string,
): GitProgramKind | null {
  return (
    kindOf(section, sub, key, value) ?? (readInert(section, sub, key, value) ? null : "config")
  );
}

/**
 * Hooks only commands outside the read-only list run (commit, merge, rebase,
 * checkout, switch, push, am, gc, send-email, p4). Any other name, known
 * (post-index-change, reference-transaction, fsmonitor-watchman) or not,
 * counts for every read-only command.
 */
const WRITE_ONLY_HOOKS = new Set([
  "applypatch-msg",
  "pre-applypatch",
  "post-applypatch",
  "pre-commit",
  "pre-merge-commit",
  "prepare-commit-msg",
  "commit-msg",
  "post-commit",
  "pre-rebase",
  "post-checkout",
  "post-merge",
  "pre-push",
  "pre-receive",
  "update",
  "proc-receive",
  "post-receive",
  "post-update",
  "push-to-checkout",
  "pre-auto-gc",
  "post-rewrite",
  "sendemail-validate",
  "p4-changelist",
  "p4-prepare-changelist",
  "p4-post-changelist",
  "p4-pre-submit",
]);

/** GIT_* variables of the session that change nothing a read-only command runs or reads. */
const READ_SAFE_GIT_ENV = new Set([
  "GIT_TERMINAL_PROMPT",
  "GIT_EDITOR",
  "GIT_SEQUENCE_EDITOR",
  "GIT_MERGE_AUTOEDIT",
  "GIT_OPTIONAL_LOCKS",
  "GIT_CONFIG_NOSYSTEM",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_SYSTEM",
  "GIT_AUTHOR_NAME",
  "GIT_AUTHOR_EMAIL",
  "GIT_AUTHOR_DATE",
  "GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL",
  "GIT_COMMITTER_DATE",
  "GIT_ASKPASS",
  "GIT_SSH",
  "GIT_SSH_COMMAND",
  "GIT_SSH_VARIANT",
  "GIT_NO_LAZY_FETCH",
  "GIT_ADVICE",
  "GIT_FLUSH",
  // Discovery stops sooner: git finds at most the repository read here.
  "GIT_CEILING_DIRECTORIES",
]);

/** One configuration entry as git lists it (git config --list --show-scope). */
export type GitOuterEntry = Readonly<{ scope: string; key: string; value: string | null }>;

export type GitProgramsOptions = Readonly<{
  /**
   * The environment the git command runs with (the session's): where the
   * global and system configuration are, and its GIT_* variables. Default:
   * this process's environment.
   */
  env?: Readonly<Record<string, string | undefined>> | null;
  /**
   * The entries git reads for `gitDir` (null: no repository) from every
   * scope, includes followed, as `git config --list --show-scope --includes`
   * lists them with `env`; only the system, global and command scopes are
   * used here (the repository's own files are read directly). null: could
   * not be listed. Default: the global and system files read here, an
   * include in them counting as a risk.
   */
  outer?:
    | ((
        gitDir: string | null,
        env: Readonly<Record<string, string | undefined>>,
      ) => readonly GitOuterEntry[] | null)
    | null;
}>;

function gitDirOf(dir: string): string | null {
  const dotgit = path.join(dir, ".git");
  let st: fs.Stats;
  try {
    st = fs.statSync(dotgit);
  } catch {
    if (
      fs.existsSync(path.join(dir, "HEAD")) &&
      fs.existsSync(path.join(dir, "config")) &&
      fs.existsSync(path.join(dir, "objects"))
    ) {
      return dir;
    }
    return null;
  }
  if (st.isDirectory()) {
    return dotgit;
  }
  try {
    const m = /^gitdir:\s*(.+)\s*$/m.exec(fs.readFileSync(dotgit, "utf8"));
    return m ? path.resolve(dir, m[1].trim()) : null;
  } catch {
    return null;
  }
}

/** One config line's kind of program (section and key already lowercased), or null. */
function kindOf(
  section: string,
  sub: string | null,
  key: string,
  value: string,
): GitProgramKind | null {
  if (section === "include" || section === "includeif") {
    return key === "path" ? "include" : null;
  }
  if (section === "hook") {
    return "hook"; // configured hooks (hook.<name>.command, .event)
  }
  if (section === "core") {
    if (key === "fsmonitor") {
      // true starts git's own daemon (counted as a key outside the inert list);
      // a path or command is a program.
      return BOOLEAN.test(value) ? null : "fsmonitor";
    }
    if (key === "pager") {
      return INERT_PAGER.test(value) ? null : "pager";
    }
    return null;
  }
  if (section === "pager") {
    return BOOLEAN.test(value) || INERT_PAGER.test(value) ? null : "pager";
  }
  // A pretty format with a signature placeholder (%G?, %GS, ...) verifies signatures.
  if ((section === "pretty" || (section === "format" && key === "pretty")) && /%G/.test(value)) {
    return "gpg";
  }
  if (section === "filter" && sub !== null) {
    return ["clean", "smudge", "process"].includes(key) ? "filter" : null;
  }
  if (section === "diff") {
    if (sub === null) {
      return key === "external" ? "diff-command" : null;
    }
    if (key === "textconv") {
      return "textconv";
    }
    return key === "command" ? "diff-command" : null;
  }
  if (section === "gpg") {
    return key === "program" || key === "defaultkeycommand" ? "gpg" : null;
  }
  if (section === "log" && key === "showsignature") {
    return BOOLEAN.test(value) && !/^(true|yes|on|1)$/i.test(value) ? null : "gpg";
  }
  return null;
}

type ConfigLine = Readonly<{
  section: string;
  sub: string | null;
  key: string;
  value: string;
  line: string;
}>;

/**
 * The entries of one config file, and its lines git could read in a way this
 * parser does not (a continued line, a line that is not a key: risks).
 * null: the file exists but could not be read. A missing file has none.
 */
function configFile(f: string): { entries: ConfigLine[]; risks: string[] } | null {
  let text: string;
  try {
    text = fs.readFileSync(f, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR" ? { entries: [], risks: [] } : null;
  }
  const entries: ConfigLine[] = [];
  const risks: string[] = [];
  let section = "";
  let sub: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    // A continued line: its meaning depends on the next one; read as a risk.
    if (/\\\s*$/.test(raw.replace(/\s[#;].*$/, ""))) {
      risks.push(`${f}: ${raw.trim()}`);
      continue;
    }
    let l = raw.trim();
    if (l === "" || l.startsWith("#") || l.startsWith(";")) {
      continue;
    }
    const head = /^\[\s*([A-Za-z0-9.-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\](.*)$/.exec(l);
    if (head) {
      const name = head[1].toLowerCase();
      const dot = name.indexOf(".");
      section = dot < 0 ? name : name.slice(0, dot);
      sub = head[2] !== undefined ? head[2] : dot < 0 ? null : name.slice(dot + 1);
      l = head[3].trim();
      if (l === "" || l.startsWith("#") || l.startsWith(";")) {
        continue;
      }
    }
    const kv = /^([A-Za-z][A-Za-z0-9-]*)\s*(?:=\s*(.*))?$/.exec(l);
    if (!kv) {
      // Not a line git would read as a key: refuse to guess.
      risks.push(`${f}: ${l}`);
      continue;
    }
    const value = (kv[2] ?? "")
      .replace(/\s[#;].*$/, "")
      .replace(/^"(.*)"$/, "$1")
      .trim();
    entries.push({ section, sub, key: kv[1].toLowerCase(), value, line: `${f}: ${l}` });
  }
  return { entries, risks };
}

/** A listed key (section[.sub].key, as git prints it) split; the subsection keeps its case. */
function splitKey(full: string): { section: string; sub: string | null; key: string } {
  const first = full.indexOf(".");
  const last = full.lastIndexOf(".");
  if (first < 0) {
    return { section: full.toLowerCase(), sub: null, key: "" };
  }
  return {
    section: full.slice(0, first).toLowerCase(),
    sub: last > first ? full.slice(first + 1, last) : null,
    key: full.slice(last + 1).toLowerCase(),
  };
}

/** git's boolean environment variables (git_env_bool): a true value. */
function envTrue(v: string | undefined): boolean {
  return v !== undefined && /^(?:1|true|yes|on)$/i.test(v.trim());
}

/**
 * The global and system configuration files git reads with `env` (git v2.53:
 * GIT_CONFIG_SYSTEM or /etc/gitconfig unless GIT_CONFIG_NOSYSTEM;
 * GIT_CONFIG_GLOBAL, or $XDG_CONFIG_HOME/git/config and ~/.gitconfig), read
 * here without following an include (an include counts as a risk).
 */
function outerFromFiles(env: Readonly<Record<string, string | undefined>>): GitOuterEntry[] | null {
  const files: Array<{ scope: string; file: string }> = [];
  if (!envTrue(env.GIT_CONFIG_NOSYSTEM)) {
    files.push({
      scope: "system",
      file: env.GIT_CONFIG_SYSTEM ?? (process.platform === "win32" ? "" : "/etc/gitconfig"),
    });
  }
  if (env.GIT_CONFIG_GLOBAL !== undefined) {
    files.push({ scope: "global", file: env.GIT_CONFIG_GLOBAL });
  } else {
    const xdg = env.XDG_CONFIG_HOME || (env.HOME ? path.join(env.HOME, ".config") : "");
    if (xdg) {
      files.push({ scope: "global", file: path.join(xdg, "git", "config") });
    }
    if (env.HOME) {
      files.push({ scope: "global", file: path.join(env.HOME, ".gitconfig") });
    }
  }
  const out: GitOuterEntry[] = [];
  for (const { scope, file } of files) {
    if (file === "" || file === "/dev/null") {
      continue;
    }
    const r = configFile(path.resolve(file));
    if (!r) {
      return null;
    }
    if (r.risks.length) {
      out.push({ scope, key: "include.path", value: r.risks[0] });
    }
    for (const e of r.entries) {
      out.push({
        scope,
        key: e.sub === null ? `${e.section}.${e.key}` : `${e.section}.${e.sub}.${e.key}`,
        value: e.value,
      });
    }
  }
  return out;
}

/**
 * The programs git can start for a read-only command run in `cwd`, with the
 * session's environment (opts.env): the session's GIT_* variables and pager,
 * the global and system configuration git reads with it, the repository's
 * own configuration files, its hooks (core.hooksPath from any scope, else
 * the git and common directories' hooks), the same in each submodule. null:
 * something could not be read (callers treat that as a risk).
 */
export function gitProgramsOf(cwd: string, opts: GitProgramsOptions = {}): GitProgram[] | null {
  const env = opts.env ?? process.env;
  const out: GitProgram[] = [];
  for (const name of Object.keys(env).toSorted()) {
    const value = env[name];
    if (value === undefined) {
      continue;
    }
    if (name === "GIT_PAGER" || name === "PAGER") {
      // git pages with these on a terminal (PAGER after GIT_PAGER and core.pager).
      if (
        !INERT_PAGER.test(value.trim()) &&
        !(name === "PAGER" && /^(?:less|more)$/.test(value.trim()))
      ) {
        out.push({ kind: "pager", line: `the session's environment sets ${name}=${value}` });
      }
    } else if (
      name.startsWith("GIT_") &&
      !READ_SAFE_GIT_ENV.has(name) &&
      // The shell prompt's settings (git-prompt.sh): git itself never reads them.
      !name.startsWith("GIT_PS1_")
    ) {
      out.push({ kind: "config", line: `the session's environment sets ${name}` });
    }
  }
  let dir = path.resolve(cwd);
  let gitDir: string | null = null;
  for (;;) {
    gitDir = gitDirOf(dir);
    if (gitDir) {
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  // The global and system configuration: the injected listing (includes
  // followed, as git reads them for this repository), else the files.
  const listed = opts.outer ? opts.outer(gitDir, env) : null;
  const outer = opts.outer ? listed : outerFromFiles(env);
  if (!outer) {
    return null;
  }
  let outerHooksPath: string | null = null;
  for (const e of outer) {
    if (!["system", "global", "command"].includes(e.scope)) {
      continue; // the repository's own files are read below
    }
    const { section, sub, key } = splitKey(e.key);
    // A listing follows includes: the included entries are listed themselves.
    if (opts.outer && (section === "include" || section === "includeif") && key === "path") {
      continue;
    }
    const value = (e.value ?? "").trim();
    if (section === "core" && key === "hookspath") {
      outerHooksPath = value;
    }
    const kind = entryKind(section, sub, key, value);
    if (kind) {
      out.push({ kind, line: `${e.scope} config: ${e.key}=${value}` });
    }
  }
  if (!gitDir) {
    return out;
  }
  const own = programsIn(gitDir, {
    top: gitDir === dir ? null : dir,
    cwd: path.resolve(cwd),
    outerHooksPath,
    home: env.HOME ?? null,
    isModule: false,
  });
  return own === null ? null : [...out, ...own];
}

/** The hooks in these directories a read-only command may run (see WRITE_ONLY_HOOKS). */
function hooksIn(dirs: readonly string[], out: GitProgram[]): void {
  for (const d of new Set(dirs)) {
    let names: string[];
    try {
      names = fs.readdirSync(d);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        out.push({ kind: "hook", line: `${d}: a hooks directory Enclawed could not read` });
      }
      continue;
    }
    for (const n of names.toSorted()) {
      if (!n.endsWith(".sample") && !WRITE_ONLY_HOOKS.has(n.toLowerCase())) {
        out.push({
          kind: "hook",
          line: `${path.join(d, n)} (a hook git may run for a read-only command)`,
        });
      }
    }
  }
}

function programsIn(
  gitDir: string,
  where: Readonly<{
    top: string | null;
    cwd: string;
    outerHooksPath: string | null;
    home: string | null;
    isModule: boolean;
  }>,
): GitProgram[] | null {
  const files = [path.join(gitDir, "config"), path.join(gitDir, "config.worktree")];
  let commonDir = gitDir;
  try {
    const common = fs.readFileSync(path.join(gitDir, "commondir"), "utf8").trim();
    commonDir = path.resolve(gitDir, common);
    files.push(path.join(commonDir, "config"));
  } catch {
    /* not a linked worktree */
  }
  const out: GitProgram[] = [];
  let hooksPath: string | null = null;
  // A submodule's git directory names its work tree (git writes core.worktree there).
  let worktree: string | null = null;
  for (const f of files) {
    const r = configFile(f);
    if (!r) {
      return null;
    }
    for (const line of r.risks) {
      out.push({ kind: "include", line });
    }
    for (const e of r.entries) {
      if (e.section === "core" && e.key === "hookspath") {
        hooksPath = e.value;
      }
      if (e.section === "core" && e.key === "worktree") {
        worktree = e.value;
        if (where.isModule) {
          continue;
        }
      }
      const kind = entryKind(e.section, e.sub, e.key, e.value);
      if (kind) {
        out.push({ kind, line: e.line });
      }
    }
  }
  // Hooks: core.hooksPath (this repository's, else the global or system one)
  // or the git and common directories' hooks. A relative hooks path is read
  // from the directory the hooks run in: every place that may be is checked.
  const hp = hooksPath ?? where.outerHooksPath;
  if (hp !== null && hp !== "") {
    if (hp.startsWith("%(prefix)")) {
      out.push({ kind: "hook", line: `core.hooksPath ${hp}: a place Enclawed does not resolve` });
    } else {
      const expanded =
        hp === "~" || hp.startsWith("~/")
          ? where.home
            ? path.join(where.home, hp.slice(1))
            : null
          : hp.startsWith("~")
            ? null
            : hp;
      if (expanded === null) {
        out.push({ kind: "hook", line: `core.hooksPath ${hp}: a place Enclawed does not resolve` });
      } else {
        const bases = [
          where.top,
          worktree === null ? null : path.resolve(gitDir, worktree),
          gitDir,
          path.dirname(gitDir),
          where.cwd,
        ].filter((b): b is string => b !== null);
        hooksIn(
          bases.map((b) => path.resolve(b, expanded)),
          out,
        );
      }
    }
  } else {
    hooksIn([path.join(gitDir, "hooks"), path.join(commonDir, "hooks")], out);
  }
  // A populated submodule's own configuration and hooks: git status, diff and
  // add in the superproject run git inside each submodule (measured, git v2.53,
  // with fsmonitor and five hooks planted in a submodule: its core.fsmonitor
  // and post-index-change hook ran; diff --submodule=diff, grep and ls-files
  // --recurse-submodules, submodule.recurse run it too). So each program its
  // configuration or hooks name counts for every command (read as an include),
  // whatever setting makes a command recurse. Every git directory a submodule
  // may use is read: the absorbed ones (.git/modules/**), and each submodule
  // of the work tree (.gitmodules paths and the index's gitlinks) as git finds
  // it (an in-tree .git directory, or a .git file's gitdir:), nested ones too.
  if (!where.isModule) {
    const top = worktree !== null ? path.resolve(gitDir, worktree) : where.top;
    const found = submoduleGitDirs(gitDir, top);
    if (typeof found === "string") {
      out.push({ kind: "include", line: `${gitDir}: ${found}` });
    }
    for (const m of typeof found === "string" ? [] : found) {
      const inner = programsIn(m, {
        top: null,
        cwd: m,
        outerHooksPath: where.outerHooksPath,
        home: where.home,
        isModule: true,
      });
      if (inner === null) {
        return null;
      }
      for (const p of inner) {
        out.push({ kind: "include", line: `submodule ${m}: ${p.line}` });
      }
    }
  }
  return out;
}

const MAX_SUBMODULES = 512;
const MAX_SUBMODULE_DEPTH = 8;

/**
 * Every git directory git may run in for a command of the repository at
 * `gitDir` (work tree `top`, null: none): its absorbed submodules
 * (.git/modules/**) and, recursively, each submodule of a work tree as git
 * finds it. A reason string: a submodule whose git directory Enclawed cannot
 * resolve as git does, or more than it reads (callers count that as a risk).
 */
function submoduleGitDirs(gitDir: string, top: string | null): string[] | string {
  const seen = new Set<string>();
  const walked = new Set<string>();
  const out: string[] = [];
  const add = (d: string): string | null => {
    let key = d;
    try {
      key = fs.realpathSync(d);
    } catch {
      /* missing: read as named */
    }
    if (!seen.has(key)) {
      seen.add(key);
      out.push(d);
    }
    return out.length > MAX_SUBMODULES ? "more submodules than Enclawed reads" : null;
  };
  const walk = (g: string, t: string | null, depth: number): string | null => {
    if (depth > MAX_SUBMODULE_DEPTH) {
      return "submodules nested deeper than Enclawed reads";
    }
    const absorbed = moduleDirsOf(g);
    if (!absorbed) {
      return "more submodules than Enclawed reads";
    }
    for (const m of absorbed) {
      const why = add(m);
      if (why) {
        return why;
      }
    }
    if (t === null) {
      return null;
    }
    const paths = workTreeSubmodulePaths(g, t);
    if (typeof paths === "string") {
      return paths;
    }
    for (const rel of paths) {
      const abs = path.resolve(t, rel);
      if (abs !== t && !abs.startsWith(t + path.sep)) {
        return `the submodule path ${rel} leads outside the work tree`;
      }
      const dotgit = path.join(abs, ".git");
      let st: fs.Stats;
      try {
        st = fs.lstatSync(dotgit);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") {
          continue; // not populated: git runs nothing there
        }
        return `the submodule ${rel} could not be read`;
      }
      let sub: string;
      if (st.isDirectory()) {
        sub = dotgit;
      } else if (st.isFile()) {
        let text: string;
        try {
          text = fs.readFileSync(dotgit, "utf8");
        } catch {
          return `the submodule ${rel}'s .git file could not be read`;
        }
        const m = /^gitdir:\s*(.+?)\s*$/m.exec(text);
        if (!m) {
          return `the submodule ${rel}'s .git file names no git directory`;
        }
        sub = path.resolve(abs, m[1]);
      } else {
        return `the submodule ${rel}'s .git is neither a directory nor a file`;
      }
      const why = add(sub);
      if (why) {
        return why;
      }
      // Each submodule work tree once (an absorbed git directory is already listed, its work tree is not).
      if (!walked.has(abs)) {
        walked.add(abs);
        const inner = walk(sub, abs, depth + 1);
        if (inner) {
          return inner;
        }
      }
    }
    return null;
  };
  return walk(gitDir, top, 0) ?? out;
}

/** The submodule paths of a work tree: .gitmodules' `path` values and the index's gitlinks; a reason string when they cannot be read. */
function workTreeSubmodulePaths(gitDir: string, top: string): string[] | string {
  const out = new Set<string>();
  try {
    const text = fs.readFileSync(path.join(top, ".gitmodules"), "utf8");
    for (const m of text.matchAll(/^\s*path\s*=\s*(.*?)\s*$/gim)) {
      out.add(m[1].replace(/^"(.*)"$/, "$1"));
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") {
      return ".gitmodules could not be read";
    }
  }
  const links = indexGitlinks(gitDir);
  if (typeof links === "string") {
    return links;
  }
  for (const l of links) {
    out.add(l);
  }
  return [...out].toSorted();
}

/** The repository's object id length in bytes: 32 with extensions.objectFormat = sha256, else 20. */
function objectIdBytes(gitDir: string): number {
  for (const f of [path.join(gitDir, "config"), path.join(gitDir, "commondir")]) {
    let file = f;
    if (f.endsWith("commondir")) {
      try {
        file = path.join(path.resolve(gitDir, fs.readFileSync(f, "utf8").trim()), "config");
      } catch {
        continue;
      }
    }
    const r = configFile(file);
    const e = r?.entries.find((x) => x.section === "extensions" && x.key === "objectformat");
    if (e) {
      return e.value.toLowerCase() === "sha256" ? 32 : 20;
    }
  }
  return 20;
}

/**
 * The gitlink paths (submodules, mode 160000) of the repository's index
 * (index versions 2, 3, 4). A reason string: an index Enclawed does not read
 * whole (a split index, a sparse directory entry, an unknown version, a
 * malformed entry). No index: none.
 */
export function indexGitlinks(gitDir: string): string[] | string {
  let buf: Buffer;
  try {
    buf = fs.readFileSync(path.join(gitDir, "index"));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR" ? [] : "the index could not be read";
  }
  try {
    if (fs.readdirSync(gitDir).some((n) => n.startsWith("sharedindex."))) {
      return "a split index, which Enclawed does not read";
    }
  } catch {
    return "the git directory could not be read";
  }
  const bad = "an index Enclawed does not read";
  if (buf.length < 12 || buf.toString("latin1", 0, 4) !== "DIRC") {
    return bad;
  }
  const version = buf.readUInt32BE(4);
  const count = buf.readUInt32BE(8);
  if (version < 2 || version > 4) {
    return bad;
  }
  const idLen = objectIdBytes(gitDir);
  const out: string[] = [];
  let at = 12;
  let prev = "";
  for (let i = 0; i < count; i++) {
    const start = at;
    const fixed = 40 + idLen + 2;
    if (at + fixed > buf.length) {
      return bad;
    }
    const mode = buf.readUInt32BE(at + 24);
    const flags = buf.readUInt16BE(at + 40 + idLen);
    at += fixed;
    if (flags & 0x4000) {
      if (version < 3 || at + 2 > buf.length) {
        return bad;
      }
      at += 2;
    }
    let name: string;
    if (version === 4) {
      // The name: a varint of bytes to drop from the previous name, then the rest, NUL-ended.
      let c = buf[at++];
      let strip = c & 127;
      while (c & 128) {
        if (at >= buf.length) {
          return bad;
        }
        c = buf[at++];
        strip = ((strip + 1) << 7) | (c & 127);
      }
      const end = buf.indexOf(0, at);
      if (end < 0 || strip > Buffer.byteLength(prev)) {
        return bad;
      }
      const base = Buffer.from(prev);
      name = Buffer.concat([base.subarray(0, base.length - strip), buf.subarray(at, end)]).toString(
        "utf8",
      );
      at = end + 1;
    } else {
      const end = buf.indexOf(0, at);
      if (end < 0) {
        return bad;
      }
      name = buf.toString("utf8", at, end);
      // Entries are NUL-padded to a multiple of 8 bytes.
      at = start + ((end - start + 8) & ~7);
    }
    prev = name;
    const type = (mode >>> 12) & 0xf;
    if (type === 0x4) {
      return "a sparse index (a directory entry may hold submodules)";
    }
    if (type === 0xe) {
      out.push(name);
    }
  }
  return out;
}

/** The git directories of a repository's submodules (.git/modules/**), bounded; null past the bound. */
export function moduleDirsOf(gitDir: string): string[] | null {
  const out: string[] = [];
  const stack: Array<[string, number]> = [[path.join(gitDir, "modules"), 0]];
  let budget = 20_000;
  while (stack.length) {
    const [d, depth] = stack.pop() as [string, number];
    if (budget-- <= 0 || depth > 32) {
      return null;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    if (entries.some((e) => e.name === "HEAD") && entries.some((e) => e.name === "config")) {
      out.push(d);
    }
    // A submodule's name may hold slashes and any word (a/objects/b is a git
    // directory as a/b is): every directory is looked into, but for git's own
    // object fan-out and pack directories (and objects/info).
    const inObjects = path.basename(d) === "objects";
    for (const e of entries) {
      if (inObjects && (/^[0-9a-f]{2}$/i.test(e.name) || e.name === "pack" || e.name === "info")) {
        continue;
      }
      if (e.isDirectory()) {
        stack.push([path.join(d, e.name), depth + 1]);
      }
    }
  }
  return out;
}

const PATCH_FLAG =
  /^(-p|-u|--patch|--patch-with-stat|--patch-with-raw|--cc|-c|-W|--function-context|--word-diff(=.*)?|--color-words(=.*)?|-U\d*|--unified(=.*)?|--textconv)$/;
const NO_PATCH = /^(-s|--no-patch)$/;
const STAT_LIKE =
  /^(--stat(=.*)?|--numstat|--shortstat|--name-only|--name-status|--raw|--summary|--dirstat(=.*)?|--compact-summary)$/;

/** Does this read-only git command produce a patch (where diff drivers and textconv run)? */
function makesPatch(sub: string, args: readonly string[]): boolean {
  const opts = args.slice(0, args.includes("--") ? args.indexOf("--") : args.length);
  if (opts.some((a) => NO_PATCH.test(a))) {
    return false;
  }
  const wants = opts.some((a) => PATCH_FLAG.test(a));
  if (sub === "diff" || sub === "show") {
    return wants || !opts.some((a) => STAT_LIKE.test(a));
  }
  return wants;
}

// Options of git show that take no separate value (a separate value could be
// read as the revision: -L 1,2:file shows a commit's patch).
const SHOW_BLOB_FLAG =
  /^(?:-p|-u|--patch|-s|--no-patch|-W|--function-context|--no-color|--color(?:=.*)?|--no-textconv|--no-ext-diff|--word-diff(?:=.*)?|--color-words(?:=.*)?|-U\d+|--unified=\d+|--stat(?:=.*)?|--name-only|--name-status|--raw|--no-renames|--abbrev(?:=\d+)?|--format=.*|--pretty(?:=.*)?|--oneline|--no-pager)$/;

/**
 * git show whose every argument before `--` is a blob or tree by name
 * (REV:path, :path) with no --textconv: it prints the object as stored and
 * runs no textconv (measured, git v2.53: show REV:path, -p, --stat, -W,
 * --word-diff, several REV:path, :path and REV: ran none; --textconv did).
 */
function showsObjectsOnly(args: readonly string[]): boolean {
  const before = optionsOf(args);
  const named = before.filter((a) => !a.startsWith("-"));
  return (
    named.length > 0 &&
    named.every((a) => a.includes(":")) &&
    before.every((a) => !a.startsWith("-") || SHOW_BLOB_FLAG.test(a)) &&
    before.length === args.length
  );
}

/** The options of a command, before any `--`. */
function optionsOf(args: readonly string[]): readonly string[] {
  return args.slice(0, args.includes("--") ? args.indexOf("--") : args.length);
}

/**
 * A pickaxe search (-S<string>, -G<regex>, also clustered after other short
 * flags, and --pickaxe-regex): git runs textconv on every blob it searches,
 * with or without a patch in the output (measured, git v2.53).
 */
function pickaxe(args: readonly string[]): boolean {
  return optionsOf(args).some((a) => /^-[A-Za-z]*[SG]/.test(a) || a === "--pickaxe-regex");
}

/**
 * git status -v / --verbose (also clustered, -sv): the diff of staged
 * changes runs textconv. Counted whatever the output format (with --short or
 * --porcelain git v2.53 did not run it), the wider set.
 */
function statusVerbose(args: readonly string[]): boolean {
  return optionsOf(args).some((a) => a === "--verbose" || /^-[a-z]*v/.test(a));
}

/**
 * The first configured program this read-only git command would start, or
 * null. `global`: the options before the subcommand (only -C and --no-pager
 * pass the allowlist).
 */
export function gitCommandStarts(
  call: Readonly<{ sub: string; args: readonly string[]; global?: readonly string[] }>,
  programs: readonly GitProgram[],
): GitProgram | null {
  const { sub, args } = call;
  const has = (re: RegExp) => args.some((a) => re.test(a));
  const dirty = sub === "describe" && has(/^--(dirty|broken)(=.*)?$/);
  const readsIndex =
    ["status", "diff", "blame", "grep", "ls-files", "check-ignore", "clean"].includes(sub) || dirty;
  for (const p of programs) {
    switch (p.kind) {
      case "include":
      case "config":
        return p;
      case "hook":
        // git refreshes a stale index (and runs post-index-change when it
        // writes it back) for diff, blame, grep, ls-files and more, not only
        // status: every read-only command counts.
        return p;
      case "fsmonitor":
        if (readsIndex) {
          return p;
        }
        break;
      case "filter":
        if (["status", "diff", "blame", "ls-files", "clean"].includes(sub) || dirty) {
          return p;
        }
        break;
      case "textconv":
        if (
          !optionsOf(args).includes("--no-textconv") &&
          (sub === "blame" ||
            (sub === "status" && statusVerbose(args)) ||
            (["diff", "show", "log", "whatchanged"].includes(sub) &&
              !(sub === "show" && showsObjectsOnly(args)) &&
              (makesPatch(sub, args) || pickaxe(args))))
        ) {
          return p;
        }
        break;
      case "diff-command":
        if (sub === "diff" && !has(/^--no-ext-diff$/)) {
          return p;
        }
        break;
      case "gpg":
        if (["log", "show", "whatchanged", "shortlog", "rev-list"].includes(sub)) {
          return p;
        }
        break;
      case "pager":
        if (!(call.global ?? []).includes("--no-pager")) {
          return p;
        }
        break;
    }
  }
  return null;
}
