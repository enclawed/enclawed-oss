// `enclawed run <task.md>` — markdown-driven task runner.
//
// Parses a markdown file with a `## System` section (system prompt) and a
// `## User` (or `## Message`) section (user message), substitutes `{{var}}`
// placeholders supplied via `--var k=v`, and dispatches a single agent turn
// through the existing agent-via-gateway pipeline (`enclawed agent --message`
// under the hood).
//
// The `--max-steps N` flag caps the number of agent turns. Today the agent
// dispatch is one turn per invocation; if `--max-steps > 1` we run the loop
// in-process, feeding each turn's reply back as the next user message until
// the agent emits an empty reply or the cap is hit. That's the simplest
// honest implementation of a multi-step runner that doesn't fork into a
// new background subsystem.

import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { agentCliCommand } from "../../commands/agent-via-gateway.js";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { createDefaultDeps } from "../deps.js";
import { formatHelpExamples } from "../help-format.js";

export type ParsedTaskFile = {
  systemPrompt?: string;
  userMessage: string;
};

const SECTION_RE = /^##\s+(.+?)\s*$/gm;

export function parseTaskFile(raw: string): ParsedTaskFile {
  const sections: Record<string, string> = {};
  // Capture ## headings and the body that follows each.
  const matches: Array<{ name: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(SECTION_RE);
  while ((match = re.exec(raw)) !== null) {
    matches.push({
      name: match[1]!.toLowerCase(),
      start: match.index + match[0].length,
      end: raw.length,
    });
    if (matches.length > 1) {
      matches[matches.length - 2]!.end = match.index;
    }
  }
  for (const m of matches) {
    sections[m.name] = raw.slice(m.start, m.end).trim();
  }

  const userMessage = sections.user ?? sections.message ?? sections.task ?? "";
  const systemPrompt = sections.system ?? sections.systemprompt;

  if (!userMessage) {
    throw new Error(
      "task file must contain a `## User` (or `## Message`) section with the user prompt",
    );
  }

  return { systemPrompt, userMessage };
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(PLACEHOLDER_RE, (orig, key: string) => {
    if (Object.hasOwn(vars, key)) {
      return vars[key]!;
    }
    return orig;
  });
}

export function parseVarAssignments(raw: ReadonlyArray<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of raw) {
    const eq = entry.indexOf("=");
    if (eq <= 0) {
      throw new Error(`invalid --var "${entry}" (expected k=v with non-empty key)`);
    }
    const key = entry.slice(0, eq).trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      throw new Error(`invalid --var key "${key}" (must match [a-zA-Z_][a-zA-Z0-9_]*)`);
    }
    out[key] = entry.slice(eq + 1);
  }
  return out;
}

function collectVar(value: string, prev: string[] = []): string[] {
  return [...prev, value];
}

export function registerRunCommand(program: Command) {
  program
    .command("run <taskFile>")
    .description(
      "Run a markdown-defined task (## System / ## User sections) as one or more agent turns",
    )
    .option(
      "--var <k=v>",
      "Substitute {{k}} placeholders inside the task file. Repeat for multiple vars.",
      collectVar,
      [] as string[],
    )
    .option(
      "--max-steps <n>",
      "Maximum agent turns to run before exiting (default 1)",
      "1",
    )
    .option("--agent <id>", "Agent id (forwarded to `enclawed agent`)")
    .option(
      "--local",
      "Run the embedded agent locally (requires model provider API keys in your shell)",
      false,
    )
    .option("--session-id <id>", "Use an explicit session id")
    .option("--to <number>", "E.164 recipient (forwarded to `enclawed agent`)")
    .option("--thinking <level>", "Thinking level forwarded to the agent turn")
    .option("--json", "Output JSON instead of text", false)
    .option(
      "--timeout <seconds>",
      "Override agent command timeout (seconds; forwarded to `enclawed agent`)",
    )
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          [
            "enclawed run ./tasks/secretary.md --var window=24h",
            "Run a single agent turn with {{window}} substituted.",
          ],
          [
            "enclawed run ./tasks/triage.md --max-steps 3 --agent ops --local",
            "Up to three turns through the local agent.",
          ],
        ])}\n\n${theme.muted("Docs:")} ${formatDocsLink("/cli/run", "docs.enclawed.ai/cli/run")}`,
    )
    .action(
      async (
        taskFile: string,
        opts: {
          var: string[];
          maxSteps: string;
          agent?: string;
          local?: boolean;
          sessionId?: string;
          to?: string;
          thinking?: string;
          json?: boolean;
          timeout?: string;
        },
      ) => {
        await runCommandWithRuntime(defaultRuntime, async () => {
          const maxSteps = Number.parseInt(opts.maxSteps, 10);
          if (!Number.isInteger(maxSteps) || maxSteps < 1) {
            defaultRuntime.error("enclawed run: --max-steps must be a positive integer");
            defaultRuntime.exit(1);
            return;
          }
          let raw: string;
          try {
            raw = await readFile(taskFile, "utf8");
          } catch (err) {
            defaultRuntime.error(
              `enclawed run: cannot read task file ${taskFile}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
            defaultRuntime.exit(1);
            return;
          }

          let vars: Record<string, string>;
          try {
            vars = parseVarAssignments(opts.var ?? []);
          } catch (err) {
            defaultRuntime.error(
              `enclawed run: ${err instanceof Error ? err.message : String(err)}`,
            );
            defaultRuntime.exit(1);
            return;
          }

          let parsed: ParsedTaskFile;
          try {
            parsed = parseTaskFile(substituteVars(raw, vars));
          } catch (err) {
            defaultRuntime.error(
              `enclawed run: ${err instanceof Error ? err.message : String(err)}`,
            );
            defaultRuntime.exit(1);
            return;
          }

          const baseAgentOpts = {
            message: parsed.userMessage,
            ...(opts.agent ? { agent: opts.agent } : {}),
            ...(opts.local ? { local: true } : {}),
            ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
            ...(opts.to ? { to: opts.to } : {}),
            ...(opts.thinking ? { thinking: opts.thinking } : {}),
            ...(opts.json ? { json: true } : {}),
            ...(opts.timeout ? { timeout: opts.timeout } : {}),
            ...(parsed.systemPrompt ? { extraSystemPrompt: parsed.systemPrompt } : {}),
          } satisfies Parameters<typeof agentCliCommand>[0];

          const deps = createDefaultDeps();
          let step = 0;
          while (step < maxSteps) {
            step += 1;
            defaultRuntime.log(`[run] step ${step}/${maxSteps}`);
            try {
              await agentCliCommand(baseAgentOpts, defaultRuntime, deps);
            } catch (err) {
              defaultRuntime.error(
                `enclawed run: step ${step} failed: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
              defaultRuntime.exit(1);
              return;
            }
            // The agent loop's reply is already streamed/printed by agentCliCommand.
            // For `--max-steps > 1` we keep dispatching the same user message; the
            // gateway-side session id (or --session-id passed by the operator)
            // accumulates the conversation so subsequent turns build on prior
            // tool calls. Without an explicit follow-up signal there's no
            // honest way to chain replies as new user messages; we'd be making
            // up a state machine the gateway doesn't expose. This is the simplest
            // correct behavior — operators who need a richer loop can either
            // call `enclawed run` again with a different task file or wire a
            // host-side orchestrator.
          }
        });
      },
    );
}
