// enclawed adapter kit: execution provenance in the shell rule. Where does
// the code a command runs come from?
//
//   download-and-execute   bytes fetched from the network and executed in the
//                          same command line (`curl … | sh`, `sh -c "$(curl …)"`,
//                          `bash <(wget …)`, `curl -o x … && sh x`,
//                          `iex (iwr …)`): DENIED. An installer a person wants
//                          run is run by the person.
//   nested agent           another agent CLI started with its own checks off
//                          (`claude --dangerously-skip-permissions`, `gemini
//                          --yolo`, `q --trust-all-tools`, `codex --full-auto`,
//                          …): DENIED, an ungoverned agent by construction.
//                          With its checks on: asked.
//   package install        an install that runs the packages' lifecycle
//                          scripts with the user's authority (npm/pnpm/yarn/bun
//                          install, pip install, cargo install, a package
//                          runner such as npx or uvx): asked, every time, with
//                          what will run said plainly; refused without a person.
//   project script         `npm test`, `npm run x`, `make t`, …: the script
//                          text the repository defines is resolved and shown in
//                          the approval, so the person sees what runs.
//
// Command words are matched on the program's base name, after the wrappers
// that only run what follows them (sudo, env, nohup, exec, time, timeout, …),
// never anywhere else on the line: a file or an argument called `claude` is
// not matched.

import fs from "node:fs";
import path from "node:path";
import { isPurePythonFilter } from "./pure-code.js";
import { INTERPRETERS, programOf, segments } from "./shell-segments.js";

export type Provenance =
  | Readonly<{ kind: "download-and-execute"; detail: string }>
  | Readonly<{ kind: "nested-agent"; agent: string; bypass: string | null }>
  | Readonly<{ kind: "package-install"; tool: string; detail: string }>
  | Readonly<{
      kind: "project-script";
      runner: string;
      script: string;
      text: string | null;
      source: string | null;
    }>;

// ─── Simple commands: ./shell-segments.ts ─────────────────────────────

export { INTERPRETERS, programOf, segments } from "./shell-segments.js";

// ─── Download and execute ───────────────────────────────────────────────

export const FETCHERS: ReadonlySet<string> = new Set([
  "curl",
  "wget",
  "fetch",
  "aria2c",
  "http",
  "https",
  "xh",
]);

export function outputFileOf(prog: string, args: readonly string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    // A short-option cluster ending in the output option takes the next word (curl -sLo f, wget -qO f).
    if (
      (prog === "curl" && (a === "--output" || /^-[A-Za-z]*o$/.test(a))) ||
      (prog === "wget" && (a === "--output-document" || /^-[A-Za-z]*O$/.test(a)))
    ) {
      return args[i + 1] ?? null;
    }
    const m = /^(?:-o|--output=|-O|--output-document=)(.+)$/.exec(a);
    if (m && (prog === "curl" || prog === "wget")) {
      return m[1];
    }
  }
  return null;
}

function downloadAndExecute(command: string, dialect: "posix" | "powershell"): string | null {
  if (dialect === "powershell") {
    return /\b(iex|invoke-expression)\b/i.test(command) &&
      /\b(iwr|irm|invoke-webrequest|invoke-restmethod|curl|wget|downloadstring|downloadfile|net\.webclient)\b/i.test(
        command,
      )
      ? "the command runs code it downloads (Invoke-Expression over a web request)"
      : null;
  }
  const segs = segments(command);
  const progs = segs.map((s) => ({ seg: s, p: programOf(s.words) }));
  const fetched = new Set<string>();
  let fetchSeen = false;
  for (let i = 0; i < progs.length; i++) {
    const { seg, p } = progs[i];
    if (!p) {
      continue;
    }
    if (FETCHERS.has(p.prog)) {
      fetchSeen = true;
      const out = outputFileOf(p.prog, p.args);
      if (out) {
        fetched.add(path.normalize(out));
      } else if (p.prog === "wget" && !p.args.some((a) => a === "-O-" || a === "-qO-")) {
        // wget saves under the URL's last path segment.
        for (const a of p.args) {
          if (/^https?:\/\//.test(a)) {
            fetched.add(path.basename(new URL(a, "http://x").pathname) || "index.html");
          }
        }
      }
      continue;
    }
    // `curl … | sh`: an interpreter reading the fetched bytes.
    // An interpreter given its code inline (`python3 -c CODE`) whose code is a
    // pure filter (./pure-code.ts) reads the fetched bytes as data: it cannot run them.
    if (
      seg.pipedFromPrev &&
      INTERPRETERS.has(p.prog) &&
      fetchSeen &&
      !isPurePythonFilter([p.prog, ...p.args])
    ) {
      const prev = progs[i - 1]?.p;
      if (
        prev &&
        (FETCHERS.has(prev.prog) || progs.slice(0, i).some((x) => x.p && FETCHERS.has(x.p.prog)))
      ) {
        return `the command pipes what ${prev.prog} downloads into ${p.prog}`;
      }
    }
    // The fetched file run in the same line (`curl -o x … && sh x`, `./x`).
    if (fetched.size) {
      const argv0 = seg.words.find((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) ?? "";
      const isFetched = (w: string) =>
        fetched.has(path.normalize(w)) || fetched.has(path.basename(w));
      const runsItself = argv0.includes("/") && isFetched(argv0);
      const interpreted =
        INTERPRETERS.has(p.prog) && p.args.some((a) => !a.startsWith("-") && isFetched(a));
      if (runsItself || interpreted) {
        return "the command runs a file it downloaded in the same command line";
      }
    }
  }
  // `sh -c "$(curl …)"`, `bash <(curl …)`, `eval "$(wget -O- …)"`: an
  // interpreter followed by a substitution whose command is a fetcher.
  if (
    /(^|[\s;|&(])(sudo\s+)?(sh|bash|zsh|dash|ksh|python3?|node|perl|ruby|php|source|\.|eval)\b[^|;&\n]*(<\(|\$\(|`)\s*(sudo\s+)?(curl|wget|fetch)\b/.test(
      command,
    )
  ) {
    return "the command runs what a substitution downloads";
  }
  return null;
}

// ─── Nested agents ──────────────────────────────────────────────────────

/** Agent CLIs by program name, with the flags that turn their own checks off. */
export const AGENT_HOSTS: Readonly<Record<string, readonly string[]>> = {
  claude: [
    "--dangerously-skip-permissions",
    "--permission-mode=bypassPermissions",
    "--allow-dangerously-skip-permissions",
  ],
  codex: [
    "--full-auto",
    "--dangerously-bypass-approvals-and-sandbox",
    "--yolo",
    "--ask-for-approval=never",
    "-a=never",
    "--sandbox=danger-full-access",
  ],
  gemini: ["--yolo", "-y", "--approval-mode=yolo"],
  q: ["--trust-all-tools", "--trust-tools"],
  "kiro-cli": ["--trust-all-tools", "--trust-tools"],
  copilot: ["--allow-all-tools", "--allow-all-paths", "--yolo"],
  "cursor-agent": ["--force", "-f"],
  aider: ["--yes-always", "--yes"],
  opencode: ["--dangerously-skip-permissions"],
  amp: ["--dangerously-allow-all"],
  goose: ["--yolo"],
  qwen: ["--yolo", "-y", "--approval-mode=yolo"],
  crush: ["--yolo", "-y"],
};

// Package names that start an agent CLI through a package runner.
const AGENT_PACKAGES: Readonly<Record<string, string>> = {
  "@anthropic-ai/claude-code": "claude",
  "@openai/codex": "codex",
  "@google/gemini-cli": "gemini",
  "@github/copilot": "copilot",
  "@qwen-code/qwen-code": "qwen",
  "opencode-ai": "opencode",
  "@sourcegraph/amp": "amp",
  "aider-chat": "aider",
};

const RUNNERS = new Set(["npx", "bunx", "pnpx", "uvx", "pipx"]);

function bypassFlag(agent: string, args: readonly string[]): string | null {
  const flags = AGENT_HOSTS[agent] ?? [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const joined = a.includes("=") ? a : args[i + 1] !== undefined ? `${a}=${args[i + 1]}` : a;
    for (const f of flags) {
      if (
        a === f ||
        joined === f ||
        (f.includes("=") && a === f.split("=")[0] && args[i + 1] === f.split("=")[1])
      ) {
        return f;
      }
    }
  }
  return null;
}

function nestedAgent(command: string): Provenance | null {
  let asked: Provenance | null = null;
  for (const seg of segments(command)) {
    const p = programOf(seg.words);
    if (!p) {
      continue;
    }
    let agent: string | null = Object.hasOwn(AGENT_HOSTS, p.prog) ? p.prog : null;
    let args = p.args;
    if (
      !agent &&
      (RUNNERS.has(p.prog) || p.prog === "pnpm" || p.prog === "yarn" || p.prog === "npm")
    ) {
      // npx <agent package> …, pnpm dlx …, npm exec …, pipx run …
      const rest = p.args.filter((a, i) => !(i === 0 && ["dlx", "exec", "run", "x"].includes(a)));
      const pkgIdx = rest.findIndex((a) => !a.startsWith("-"));
      const spec = pkgIdx >= 0 ? rest[pkgIdx] : "";
      const pkg = /^(@[^/@]+\/[^@]+|[^@]+)/.exec(spec)?.[1] ?? "";
      const name = Object.keys(AGENT_PACKAGES).find((k) => pkg === k);
      if (name) {
        agent = AGENT_PACKAGES[name];
        args = rest.slice(pkgIdx + 1);
      }
    }
    if (!agent) {
      continue;
    }
    const bypass = bypassFlag(agent, args);
    if (bypass) {
      return { kind: "nested-agent", agent, bypass };
    }
    asked ??= { kind: "nested-agent", agent, bypass: null };
  }
  return asked;
}

// ─── Package installs ───────────────────────────────────────────────────

const INSTALL_VERBS: Readonly<Record<string, readonly string[]>> = {
  npm: [
    "install",
    "i",
    "in",
    "ins",
    "inst",
    "insta",
    "instal",
    "isnt",
    "isnta",
    "isntal",
    "isntall",
    "add",
    "ci",
    "clean-install",
    "install-clean",
    "isntall-clean",
    "install-ci-test",
    "cit",
    "install-test",
    "it",
    "rebuild",
    "rb",
    "update",
    "up",
    "upgrade",
    "udpate",
    "exec",
    "x",
  ],
  pnpm: [
    "install",
    "i",
    "add",
    "update",
    "up",
    "upgrade",
    "rebuild",
    "rb",
    "dlx",
    "exec",
    "import",
  ],
  yarn: ["install", "add", "upgrade", "up", "dlx", "rebuild", "global"],
  bun: ["install", "i", "add", "a", "update", "x", "pm"],
  pip: ["install", "download", "wheel"],
  pip3: ["install", "download", "wheel"],
  uv: ["pip", "add", "sync", "tool", "run"],
  pipx: ["install", "run", "inject", "upgrade"],
  poetry: ["install", "add", "update"],
  gem: ["install", "update"],
  bundle: ["install", "update"],
  cargo: ["install"],
  go: ["install", "get", "run"],
  composer: ["install", "require", "update", "create-project"],
  brew: ["install", "reinstall", "upgrade"],
  conda: ["install", "create"],
  deno: ["install", "add"],
};

function packageInstall(command: string): Provenance | null {
  for (const seg of segments(command)) {
    const p = programOf(seg.words);
    if (!p) {
      continue;
    }
    if (p.prog === "npx" || p.prog === "bunx" || p.prog === "pnpx" || p.prog === "uvx") {
      return {
        kind: "package-install",
        tool: p.prog,
        detail: `${p.prog} downloads a package and runs it, with its install scripts, with your authority`,
      };
    }
    if (p.prog === "yarn" && p.args.filter((a) => !a.startsWith("-")).length === 0) {
      return {
        kind: "package-install",
        tool: "yarn",
        detail: "yarn installs the project's packages and runs their install scripts",
      };
    }
    const python =
      /^python[0-9.]*$/.test(p.prog) && p.args[0] === "-m" && /^pip[0-9]*$/.test(p.args[1] ?? "");
    const prog = python ? "pip" : p.prog;
    const args = python ? p.args.slice(2) : p.args;
    const verbs = INSTALL_VERBS[prog];
    const verb = args.find((a) => !a.startsWith("-"));
    if (!verbs || !verb || !verbs.includes(verb)) {
      continue;
    }
    const noScripts = args.includes("--ignore-scripts");
    return {
      kind: "package-install",
      tool: prog,
      detail: noScripts
        ? `${prog} ${verb} changes the project's packages (install scripts are switched off)`
        : `${prog} ${verb} installs packages and runs their install scripts with your authority (add --ignore-scripts where the package manager supports it)`,
    };
  }
  return null;
}

// ─── Project scripts ────────────────────────────────────────────────────

function readJson(f: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return null;
  }
}

/** The recipe of a make target (the lines after `target:` that start with a tab), or null. */
function makeRecipe(file: string, target: string | null): string | null {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const lines = text.split(/\r?\n/);
  let want = target;
  if (!want) {
    // The default goal: the first target that does not start with ".".
    const first = lines.find((l) => /^[A-Za-z0-9_./-]+\s*:(?!=)/.test(l) && !l.startsWith("."));
    want = first ? first.split(":")[0].trim() : null;
  }
  if (!want) {
    return null;
  }
  const i = lines.findIndex((l) =>
    new RegExp(
      `^(?:[^:#=]*\\s)?${want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s[^:#=]*)?\\s*:(?!=)`,
    ).test(l),
  );
  if (i < 0) {
    return null;
  }
  const recipe: string[] = [lines[i]];
  for (let j = i + 1; j < lines.length && (lines[j].startsWith("\t") || lines[j] === ""); j++) {
    if (lines[j]) {
      recipe.push(lines[j]);
    }
  }
  return recipe.join("\n");
}

function projectScript(command: string, cwd: string): Provenance | null {
  for (const seg of segments(command)) {
    const p = programOf(seg.words);
    if (!p) {
      continue;
    }
    const pos = p.args.filter((a) => !a.startsWith("-"));
    if (["npm", "pnpm", "yarn", "bun"].includes(p.prog)) {
      let script: string | null = null;
      if (pos[0] === "run" || pos[0] === "run-script" || pos[0] === "rum" || pos[0] === "urn") {
        script = pos[1] ?? null;
      } else if (["test", "t", "tst", "start", "stop", "restart"].includes(pos[0] ?? "")) {
        script = { t: "test", tst: "test" }[pos[0]] ?? pos[0];
      } else if (
        (p.prog === "yarn" || p.prog === "pnpm") &&
        pos[0] &&
        !INSTALL_VERBS[p.prog].includes(pos[0])
      ) {
        script = pos[0];
      }
      if (!script) {
        continue;
      }
      const file = path.join(cwd, "package.json");
      const scripts =
        (readJson(file) as { scripts?: Record<string, unknown> } | null)?.scripts ?? {};
      const parts = [`pre${script}`, script, `post${script}`]
        .filter((k) => typeof scripts[k] === "string")
        .map((k) => `${k}: ${String(scripts[k])}`);
      return {
        kind: "project-script",
        runner: p.prog,
        script,
        text: parts.length ? parts.join("\n") : null,
        source: parts.length ? file : null,
      };
    }
    if (p.prog === "make" || p.prog === "gmake") {
      let dir = cwd;
      const target = (() => {
        for (let i = 0; i < p.args.length; i++) {
          if (p.args[i] === "-C" && p.args[i + 1]) {
            dir = path.resolve(cwd, p.args[i + 1]);
            i++;
          } else if (!p.args[i].startsWith("-") && !p.args[i].includes("=")) {
            return p.args[i];
          }
        }
        return null;
      })();
      const file =
        ["GNUmakefile", "makefile", "Makefile"]
          .map((n) => path.join(dir, n))
          .find((f) => fs.existsSync(f)) ?? null;
      const text = file ? makeRecipe(file, target) : null;
      return {
        kind: "project-script",
        runner: "make",
        script: target ?? "(default goal)",
        text,
        source: text ? file : null,
      };
    }
    if (["just", "task", "tox", "nox", "gradlew", "mvnw"].includes(p.prog)) {
      return {
        kind: "project-script",
        runner: p.prog,
        script: pos[0] ?? "(default)",
        text: null,
        source: null,
      };
    }
  }
  return null;
}

/**
 * What a command's code provenance says, the strongest finding first:
 * download-and-execute, then a nested agent, then a package install, then a
 * project script. null when none applies.
 */
export function execProvenance(
  command: string,
  dialect: "posix" | "powershell",
  cwd: string,
): Provenance | null {
  if (typeof command !== "string" || command.length > 64 * 1024) {
    return null;
  }
  const dae = downloadAndExecute(command, dialect);
  if (dae) {
    return { kind: "download-and-execute", detail: dae };
  }
  if (dialect === "powershell") {
    return null;
  }
  return nestedAgent(command) ?? packageInstall(command) ?? projectScript(command, cwd);
}
