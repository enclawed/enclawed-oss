// Aliases and functions of the host's shell (./shell-definitions.ts): a
// command word the shell defines is never decided as the program of its name.
// Each case is shown first with real bash (the alias or function does run in
// place of the program), then decided by the engine.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEVEL, makeLabel } from "../classification.js";
import { HistoryStore } from "../history-store.js";
import { createPolicy } from "../policy.js";
import { DecisionEngine, decidePreAction, type EngineOptions } from "./engine.js";
import { changesShellCommands } from "./env-trust.js";
import { nodeFsProbe } from "./fs-probe.js";
import { parseCompound } from "./shell-compound.js";
import {
  NO_SHELL_DEFINITIONS,
  containedCommandLine,
  resolveShellDefinitions,
  shadowedCommandIn,
  type ShellDefinitions,
} from "./shell-definitions.js";
import type { PreActionEvent } from "./types.js";

let root: string;
let proj: string;
let n = 0;

function git(cwd: string, ...args: string[]) {
  const r = spawnSync(
    "git",
    [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.invalid",
      "-c",
      "init.defaultBranch=main",
      ...args,
    ],
    { cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME: cwd, GIT_CONFIG_NOSYSTEM: "1" } },
  );
  expect(r.status, r.stderr).toBe(0);
}

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-shell-defs-")));
  proj = path.join(root, "proj");
  fs.mkdirSync(path.join(proj, "test"), { recursive: true });
  fs.writeFileSync(path.join(proj, "README.md"), "# tiny\n");
  fs.writeFileSync(
    path.join(proj, "package.json"),
    '{ "name": "tiny", "type": "module", "scripts": { "test": "node --test" } }\n',
  );
  fs.writeFileSync(
    path.join(proj, "test", "a.test.js"),
    'import { test } from "node:test";\ntest("a", () => {});\n',
  );
  git(proj, "init", "-q");
  git(proj, "add", "-A");
  git(proj, "commit", "-q", "-m", "initial");
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function opts(
  defs: EngineOptions["shellDefinitions"],
  extra: Partial<EngineOptions> = {},
): EngineOptions {
  const policy = createPolicy({
    enforceAllowlists: false,
    maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
  });
  return {
    host: "test-host",
    policy,
    projectDir: proj,
    home: path.join(root, "home"),
    hardware: () => ({ allowed: true }),
    history: {
      store: new HistoryStore({ dir: path.join(root, `h${n++}`), limits: policy.history }),
    },
    fs: nodeFsProbe(),
    environment: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: path.join(root, "home") },
    shellDefinitions: defs,
    containScripts: async (req) => ({ ok: true, command: `ENCLAWED_CONTAIN=test ${req.command}` }),
    ...extra,
  };
}

const sh = (text: string): PreActionEvent => ({
  type: "pre-action",
  actor: { sessionId: "s", subagentId: null },
  callId: `c${n++}`,
  tool: "Bash",
  policyIds: ["bash", "exec"],
  kind: "shell",
  params: { command: text },
  cwd: proj,
  command: { text, dialect: "posix" },
  approvalRoute: "no-person",
  hostMode: "bypassPermissions",
});

const decide = (text: string, defs: EngineOptions["shellDefinitions"], extra = {}) =>
  decidePreAction(sh(text), opts(defs, extra));

/** Runs in the host's shell as it is, with no person: allowed and not contained. */
const bare = (d: Awaited<ReturnType<typeof decidePreAction>>) =>
  d.outcome === "allow" && !d.contain;

const defs = (aliases: Record<string, string>, functions: string[] = []): ShellDefinitions => ({
  aliases,
  functions,
});

/** What real bash prints for `line` after `setup` (aliases on, as in a sourced snapshot). */
function bash(setup: string, line: string, env: Record<string, string> = {}): string {
  const r = spawnSync("bash", ["-c", `shopt -s expand_aliases\n${setup}\n${line}`], {
    cwd: proj,
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...env },
  });
  return `${r.stdout}${r.stderr}`;
}

describe("shell definitions: a command word the shell defines is not the program of its name", () => {
  it("an alias of ls that deletes runs in bash, and ls is not read-only", async () => {
    expect(bash("alias ls='echo WOULD-RM'", "ls -la")).toContain("WOULD-RM");
    const d = await decide("ls -la", defs({ ls: "rm -rf ~" }), { containScripts: undefined });
    expect(d.outcome).not.toBe("allow");
    expect(d.codes).toContain("shell:program-unverified");
    expect(d.reason).toContain("alias");
    // The same line with no definitions is read-only.
    expect((await decide("ls -la", NO_SHELL_DEFINITIONS)).outcome).toBe("allow");
  });

  it("a function ls that curls runs in bash, quoted or not, and is not read-only", async () => {
    const setup = "ls() { echo WOULD-CURL; }";
    for (const line of ["ls", "\\ls", "'ls'", "FOO=1 ls", "true && ls", "x=$(ls); echo $x"]) {
      expect(bash(setup, line)).toContain("WOULD-CURL");
    }
    for (const line of ["ls -la", "\\ls -la", "'ls' -la", "cat README.md | ls", "echo $(ls)"]) {
      const d = await decide(line, defs({}, ["ls"]));
      expect(bare(d), line).toBe(false);
    }
  });

  it("a builtin shadowed by a function is shadowed too (cd, echo, exec)", async () => {
    expect(bash("cd() { echo WOULD-CD; }", "cd /")).toContain("WOULD-CD");
    for (const [line, fn] of [
      ["cd test && ls", "cd"],
      ["echo hi", "echo"],
      ["echo hi > out.txt", "echo"],
      ["printf '%s\\n' a", "printf"],
    ]) {
      expect((await decide(line, NO_SHELL_DEFINITIONS)).outcome, line).toBe("allow");
      expect(bare(await decide(line, defs({}, [fn]))), line).toBe(false);
    }
  });

  it("a function exported as BASH_FUNC_NAME%% is imported by bash and counts, though the adapter did not name it", async () => {
    const env = { "BASH_FUNC_cat%%": "() {  echo WOULD-EXFIL\n}" };
    expect(bash("", "cat README.md", env)).toContain("WOULD-EXFIL");
    const d = await decide("cat README.md", NO_SHELL_DEFINITIONS, {
      environment: { PATH: process.env.PATH ?? "/usr/bin:/bin", ...env },
    });
    expect(bare(d)).toBe(false);
    expect(d.codes).not.toContain("read-only-command");
  });

  it('unknown definitions (absent, null, "unknown"): no command word is the program of its name', async () => {
    for (const unknown of [undefined, null, "unknown" as const]) {
      for (const line of ["ls -la", "git status", "cat README.md", "\\ls"]) {
        const d = await decide(line, unknown);
        expect(d.outcome, `${String(unknown)}: ${line}`).not.toBe("allow");
        expect(d.codes).not.toContain("read-only-command");
      }
    }
  });

  it("a backslash skips an alias (not a function); command, builtin and exec skip both", async () => {
    expect(bash("alias ls='echo WOULD-RM'", "\\ls -d /")).toBe("/\n");
    expect(bash("ls() { echo FN; }", "command ls -d /")).toBe("/\n");
    expect((await decide("\\ls -la", defs({ ls: "rm -rf ~" }))).outcome).toBe("allow");
    expect((await decide("l\\s -la", defs({ ls: "rm -rf ~" }))).outcome).toBe("allow");
    expect((await decide("command -v ls", defs({ ls: "rm -rf ~" }, ["ls"]))).outcome).toBe("allow");
    // `command` itself defined: shadowed.
    expect(bare(await decide("command -v ls", defs({}, ["command"])))).toBe(false);
  });

  it("unalias or unset -f on the same line removes nothing: the word stays shadowed", async () => {
    expect(bash("alias ls='echo STILL-ALIAS'", "unalias ls; ls")).toContain("STILL-ALIAS");
    for (const line of ["unalias ls; ls", "unset -f ls; ls", "unalias -a && ls -la"]) {
      const d = await decide(line, defs({ ls: "rm -rf ~" }, ["ls"]));
      expect(bare(d), line).toBe(false);
    }
  });

  it("ls='ls --color=auto' is the same program; other aliases, a trailing blank or a changed name are not", async () => {
    expect((await decide("ls -la", defs({ ls: "ls --color=auto" }))).outcome).toBe("allow");
    expect(
      (await decide("grep -n x README.md", defs({ grep: "grep --colour=auto" }))).outcome,
    ).toBe("allow");
    for (const value of [
      "ls -R /",
      "ls --color=auto ",
      "ls --color=auto; rm -rf ~",
      "dir --color",
      "ls --colorize-from=x",
      "ls -R",
      "ls -a",
    ]) {
      expect(bare(await decide("ls -la", defs({ ls: value }))), value).toBe(false);
    }
  });

  it("a --color alias the allowlist does not read with the option stays an alias", async () => {
    expect(bare(await decide("cat README.md", defs({ cat: "cat --color=auto" })))).toBe(false);
  });

  it("an alias named after a reserved word, or command_not_found_handle, shadows every word", async () => {
    expect(bash("alias do='; echo WOULD-RUN;'", "for i in 1; do echo x; done")).not.toBe("x\n");
    expect(bare(await decide("ls -la", defs({ do: "echo" })))).toBe(false);
    expect((await decide("ls -la", defs({}, ["command_not_found_handle"]))).outcome).not.toBe(
      "allow",
    );
  });

  it("an unbalanced line is a syntax error only when no alias text could close its quote", async () => {
    expect((await decide("echo 'a", NO_SHELL_DEFINITIONS)).outcome).toBe("allow");
    expect(bare(await decide("echo 'a", defs({ x: "echo '" })))).toBe(false);
    expect(bare(await decide("echo 'a", undefined))).toBe(false);
  });

  it("containment is offered only when `exec` reaches it: not with exec defined or definitions unknown", async () => {
    // With no definitions the project's tests run contained, with no person.
    const ok = await decide("node --test", NO_SHELL_DEFINITIONS);
    expect(ok.outcome).toBe("allow");
    expect(ok.contain).toBeTruthy();
    expect(
      bash("exec() { echo NOT-CONTAINED; }", containedCommandLine({ A: "1" }, ["/bin/true"])),
    ).toContain("NOT-CONTAINED");
    for (const d of [defs({}, ["exec"]), defs({ exec: "echo" }), "unknown" as const]) {
      const r = await decide("node --test", d);
      expect(r.outcome).not.toBe("allow");
    }
  });

  it("a contained line the container returns is refused when its command word is defined", async () => {
    const engine = new DecisionEngine(
      opts(defs({}, ["wrap"]), {
        containScripts: async () => ({ ok: true, command: "wrap node --test" }),
      }),
    );
    const d = await engine.preAction(sh("node --test"));
    expect(d.answer).toBe("deny");
    expect(d.codes).toContain("shell-definition-shadow");
    expect(d.rewrite).toBeUndefined();
    const plain = new DecisionEngine(
      opts(NO_SHELL_DEFINITIONS, {
        containScripts: async () => ({ ok: true, command: "wrap node --test" }),
      }),
    );
    const p = await plain.preAction(sh("node --test"));
    expect(p.answer).toBe("allow");
    expect(p.rewrite?.command).toBe("wrap node --test");
  });

  it("a settings variable BASH_FUNC_NAME%% changes what shell commands run", () => {
    expect(changesShellCommands("BASH_FUNC_ls%%")).toBe(true);
    expect(changesShellCommands("BASH_FUNC_git()")).toBe(true);
  });

  it("unit: which commands of a line are shadowed", () => {
    const parse = (t: string) => {
      const p = parseCompound(t, { cwd: proj, home: null, env: {} });
      if (!p.ok) {
        throw new Error(p.code);
      }
      return p.commands;
    };
    const d = resolveShellDefinitions(defs({ ls: "rm -rf ~" }, ["cat"]), {});
    expect(shadowedCommandIn(parse("FOO=1 ls"), d)).toContain("alias");
    expect(shadowedCommandIn(parse("\\ls"), d)).toBeNull();
    expect(shadowedCommandIn(parse("xargs ls < /dev/null"), d)).toBeNull(); // xargs execs ls
    expect(shadowedCommandIn(parse("find . -exec cat {} ;"), d)).toBeNull(); // find execs cat
    expect(shadowedCommandIn(parse('"cat" x'), d)).toContain("function");
    expect(shadowedCommandIn(parse("x=1"), d)).toBeNull(); // runs nothing
    const exported = resolveShellDefinitions(NO_SHELL_DEFINITIONS, {
      "BASH_FUNC_git%%": "() { :; }",
    });
    expect(shadowedCommandIn(parse("git status"), exported)).toContain("function");
  });
});
