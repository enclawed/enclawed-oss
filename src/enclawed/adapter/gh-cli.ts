// enclawed adapter kit: the GitHub CLI (gh) when it holds no credentials.
//
// gh authenticates every command that talks to GitHub with a token from its
// environment (GH_TOKEN, GITHUB_TOKEN, the enterprise variants) or from its
// config directory (hosts.yml). With neither, the read verbs below print
// "To get started with GitHub CLI, please run: gh auth login" (exit 4), and
// `gh auth status` prints "You are not logged into any GitHub hosts" (exit 1),
// before any request: measured on gh 2.46.0 (Linux, env -i, empty HOME),
// with HTTPS_PROXY pointed at a local listener that saw no connection, also
// with --web and a GitHub Enterprise -R host, and no file was created.
//
// So such a gh command reads nothing and sends nothing. It is treated as a
// read-only command only when all of these hold:
//   - the session's environment is known and sets no GH_* variable and no
//     GITHUB_TOKEN / GITHUB_ENTERPRISE_TOKEN;
//   - gh's config directory and data directory do not exist (no hosts.yml,
//     no aliases, which can run shell commands, no extensions);
//   - the verb is one of a short list of reads (never `api`, never a write),
//     with no --web/-w (a browser is a program);
//   - `gh` resolves on the session's PATH to a file outside the project and
//     the home directory.
// Anything else keeps the ordinary rule.

import fs from "node:fs";
import path from "node:path";
import { isInside } from "./fs-probe.js";

const READ_VERBS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["auth", new Set(["status"])],
  ["issue", new Set(["list", "view"])],
  ["pr", new Set(["list", "view", "diff", "checks"])],
  ["repo", new Set(["view"])],
]);
const TOKEN_NAMES = new Set(["GITHUB_TOKEN", "GITHUB_ENTERPRISE_TOKEN"]);

export type GhInert = Readonly<{ ok: true }> | Readonly<{ ok: false; why: string }>;

const exists = (p: string): boolean => {
  try {
    fs.lstatSync(p);
    return true;
  } catch (err) {
    // Only "no such file" counts as absent; anything else (a permission error) is not known.
    const code = (err as NodeJS.ErrnoException)?.code;
    return !(code === "ENOENT" || code === "ENOTDIR");
  }
};

/** Where `gh` resolves on PATH (absolute), or null. */
function resolveGh(env: Readonly<Record<string, string>>): string | null {
  for (const dir of (env.PATH ?? "").split(":")) {
    if (!dir || !path.isAbsolute(dir)) {
      // An empty or relative PATH entry searches the current directory.
      return null;
    }
    const p = path.join(dir, "gh");
    try {
      const st = fs.statSync(p);
      if (st.isFile()) {
        return fs.realpathSync(p);
      }
    } catch {
      /* not here */
    }
  }
  return null;
}

/**
 * Is `argv` (a gh simple command) inert in this session: gh holds no
 * credentials, so it stops before any request? Null environment: not known.
 */
export function ghInert(
  argv: readonly string[],
  o: Readonly<{
    environment: Readonly<Record<string, string>> | null | undefined;
    projectDir: string;
    home: string | null;
  }>,
): GhInert {
  if (argv[0] !== "gh") {
    return { ok: false, why: "not gh" };
  }
  const env = o.environment;
  if (!env) {
    return { ok: false, why: "the session's environment is not known" };
  }
  const named = Object.keys(env).find((k) => k.startsWith("GH_") || TOKEN_NAMES.has(k));
  if (named) {
    return { ok: false, why: `the session sets ${named}` };
  }
  const verbs = READ_VERBS.get(argv[1] ?? "");
  if (!verbs || !verbs.has(argv[2] ?? "")) {
    return { ok: false, why: "it is not one of gh's read verbs" };
  }
  if (argv.some((a) => a === "--web" || a === "-w" || /^-[a-zA-Z]*w/.test(a))) {
    return { ok: false, why: "it opens a browser" };
  }
  const home = env.HOME;
  if (!home || !path.isAbsolute(home)) {
    return { ok: false, why: "the session's HOME is not known" };
  }
  const config = env.XDG_CONFIG_HOME
    ? path.join(env.XDG_CONFIG_HOME, "gh")
    : path.join(home, ".config", "gh");
  const data = env.XDG_DATA_HOME
    ? path.join(env.XDG_DATA_HOME, "gh")
    : path.join(home, ".local", "share", "gh");
  for (const d of [config, data]) {
    if (!path.isAbsolute(d) || exists(d)) {
      return { ok: false, why: `gh's directory ${d} exists (credentials, aliases or extensions)` };
    }
  }
  const bin = resolveGh(env);
  if (!bin) {
    return { ok: false, why: "gh does not resolve on the session's PATH" };
  }
  for (const root of [o.projectDir, home, o.home]) {
    if (root && isInside(root, bin)) {
      return { ok: false, why: `gh resolves to ${bin}, inside the project or the home directory` };
    }
  }
  return { ok: true };
}
