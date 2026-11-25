// Conformance: aliases and functions of the shell the agent's commands run in
// (../adapter/shell-definitions.ts). A command word the shell defines as an
// alias or function runs that, not the program of its name; Enclawed never
// decides it as the program.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DecisionEngine, decidePreAction, type EngineOptions } from "../adapter/engine.js";
import { nodeFsProbe } from "../adapter/fs-probe.js";
import {
  NO_SHELL_DEFINITIONS,
  containedCommandLine,
  type ShellDefinitions,
} from "../adapter/shell-definitions.js";
import type { Decision, PreActionEvent } from "../adapter/types.js";
import type { HardwareGateDecision } from "../agent-tool-guard.js";
import { LEVEL, makeLabel } from "../classification.js";
import { HistoryStore } from "../history-store.js";
import { createPolicy } from "../policy.js";
import { expectThat, withTempDir, type ConformanceCheck } from "./types.js";

const shadowed: ConformanceCheck = {
  id: "shell-definition-shadow",
  title: "A command word the shell defines is not the program of its name",
  proves:
    "a command word shadowed by an alias or function of the shell it runs in (one the adapter names, or one the environment exports as BASH_FUNC_NAME%%) is never decided as the system program: an alias of ls that deletes, a function cat, a function exec in front of a contained command, and any word when the shell's definitions are unknown, are each asked or contained, never run bare as read-only; a backslash that skips an alias leaves the real program read-only",
  remedy:
    "do not let the agent run shell commands without a person on this installation until it is reinstalled; report the failure to your Enclawed contact",
  run: () =>
    withTempDir("shell-definitions", async (dir) => {
      if (spawnSync("bash", ["-c", "true"]).status !== 0) {
        return { skip: "bash is not available here, so no shell definitions apply" };
      }
      const project = path.join(dir, "project");
      fs.mkdirSync(project, { recursive: true });
      fs.writeFileSync(path.join(project, "README.md"), "# project\n");
      // A project whose tests Enclawed reads and runs contained (no person) when the shell lets it.
      fs.mkdirSync(path.join(project, "test"));
      fs.writeFileSync(
        path.join(project, "test", "a.test.js"),
        'const { test } = require("node:test");\ntest("a", () => {});\n',
      );
      const git = (...args: string[]) =>
        spawnSync(
          "git",
          [
            "-c",
            "user.name=c",
            "-c",
            "user.email=c@example.invalid",
            "-c",
            "core.hooksPath=/dev/null",
            ...args,
          ],
          {
            cwd: project,
            env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: dir, GIT_CONFIG_NOSYSTEM: "1" },
          },
        ).status === 0;
      if (!(git("init", "-q") && git("add", "-A") && git("commit", "-q", "-m", "c"))) {
        return { skip: "git is not available here to make the check's project" };
      }
      const realProject = fs.realpathSync(project);
      const policy = createPolicy({
        enforceAllowlists: false,
        maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
        defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
      });
      const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: dir };
      let k = 0;
      const opts = (
        defs: ShellDefinitions | "unknown",
        extra: Partial<EngineOptions> = {},
      ): EngineOptions => ({
        host: "conformance",
        policy,
        projectDir: realProject,
        home: dir,
        history: {
          store: new HistoryStore({ dir: path.join(dir, `hist-${k++}`), limits: policy.history }),
        },
        hardware: (): HardwareGateDecision => ({ allowed: true }),
        fs: nodeFsProbe(),
        environment: env,
        shellDefinitions: defs,
        ...extra,
      });
      const shell = (command: string): PreActionEvent => ({
        type: "pre-action",
        actor: { sessionId: "conformance", subagentId: null },
        callId: `c${k++}`,
        cwd: realProject,
        approvalRoute: "no-person",
        tool: "shell",
        policyIds: ["exec"],
        kind: "shell",
        params: { command },
        command: { text: command, dialect: "posix" },
      });
      const bare = (d: Decision) => d.outcome === "allow" && !d.contain;
      // Real bash: what the definitions do (aliases on, as in a sourced snapshot).
      const bash = (setup: string, line: string, extraEnv: Record<string, string> = {}) => {
        const r = spawnSync("bash", ["-c", `shopt -s expand_aliases\n${setup}\n${line}`], {
          cwd: realProject,
          encoding: "utf8",
          env: { ...env, ...extraEnv },
        });
        return `${r.stdout}${r.stderr}`;
      };
      expectThat(
        bash("alias ls='echo SHADOWED'", "ls") === "SHADOWED\n" &&
          bash("cat() { echo SHADOWED; }", "cat README.md") === "SHADOWED\n",
        "bash did not run the alias or function in place of the program (the check's premise)",
      );
      const cases: [string, ShellDefinitions | "unknown", Record<string, string>?][] = [
        ["ls -la", { aliases: { ls: "rm -rf ~" }, functions: [] }],
        ["cat README.md", { aliases: {}, functions: ["cat"] }],
        ["\\cat README.md", { aliases: {}, functions: ["cat"] }],
        ["cat README.md", NO_SHELL_DEFINITIONS, { "BASH_FUNC_cat%%": "() {  echo x\n}" }],
        ["ls -la", "unknown"],
        ["git status", "unknown"],
      ];
      for (const [line, defs, extraEnv] of cases) {
        const d = await decidePreAction(
          shell(line),
          opts(defs, extraEnv ? { environment: { ...env, ...extraEnv } } : {}),
        );
        expectThat(
          !bare(d) && !d.codes.includes("read-only-command"),
          `a shadowed command word was decided as the program of its name: ${line} (${d.outcome}: ${d.codes.join(", ")})`,
        );
      }
      // Containment is reached through `exec` in the host's shell: a function exec runs instead.
      expectThat(
        bash("exec() { echo SHADOWED; }", containedCommandLine({ A: "1" }, ["/bin/true"])) ===
          "SHADOWED\n",
        "bash did not run a function exec in place of the builtin (the check's premise)",
      );
      const container: EngineOptions["containScripts"] = async (req) => ({
        ok: true,
        command: containedCommandLine({ ENCLAWED_CONTAIN: "conformance" }, [
          "sh",
          "-c",
          req.command,
        ]),
      });
      const plain = await new DecisionEngine(
        opts(NO_SHELL_DEFINITIONS, { containScripts: container }),
      ).preAction(shell("node --test"));
      expectThat(
        plain.answer === "allow" && Boolean(plain.rewrite),
        `the project's tests did not run contained with nothing defined (${plain.answer}: ${plain.codes.join(", ")}): the check cannot show the shadowed case`,
      );
      for (const defs of [{ aliases: {}, functions: ["exec"] }, "unknown"] as const) {
        const e = new DecisionEngine(opts(defs, { containScripts: container }));
        const d = await e.preAction(shell("node --test"));
        expectThat(
          d.answer !== "allow" || !d.rewrite,
          `a contained command was handed to a shell whose exec is not the builtin (${d.answer}: ${d.codes.join(", ")})`,
        );
      }
      // No false positive: a backslash skips an alias, and nothing defined leaves ls read-only.
      for (const [line, defs] of [
        ["\\ls -la", { aliases: { ls: "rm -rf ~" }, functions: [] }],
        ["ls -la", NO_SHELL_DEFINITIONS],
      ] as const) {
        const d = await decidePreAction(shell(line), opts(defs));
        expectThat(
          bare(d) && d.codes.includes("read-only-command"),
          `a command word that runs the real program was not read-only: ${line} (${d.outcome}: ${d.codes.join(", ")})`,
        );
      }
      return undefined;
    }),
};

export const CHECKS: readonly ConformanceCheck[] = [shadowed];
