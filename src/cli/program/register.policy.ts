// `enclawed policy` — operator-facing introspection of the resolved Policy.
//
// `policy show` re-runs the same JSON-config -> Policy loader the bootstrap
// path uses, and pretty-prints (or JSON-emits) the resulting object. It's a
// read-only command: it does not call `bootstrapEnclawed()` and does not
// touch the audit log. Operators use it to confirm that the
// `enclawed.policy.*` block they wrote actually parses the way they meant it.

import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { LEVEL, makeLabel, format as formatLabel } from "../../enclawed/classification.js";
import { defaultEnclavedPolicy, defaultOpenPolicy } from "../../enclawed/policy.js";
import { loadPolicyFromJson } from "../../enclawed/policy-loader.js";
import { getFlavor } from "../../enclawed/flavor.js";
import { resolveDefaultConfigPath } from "../../infra/workspace-dir.js";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { formatHelpExamples } from "../help-format.js";

export function registerPolicyCommand(program: Command) {
  const policy = program
    .command("policy")
    .description("Inspect the effective enclawed policy (allowlists + clearances)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/policy", "docs.enclawed.ai/cli/policy")}\n`,
    );

  policy
    .command("show")
    .description("Pretty-print the policy derived from the resolved enclawed.json")
    .option("--config <path>", "Override the config file to load (default: resolved enclawed.json)")
    .option("--json", "Output JSON instead of text", false)
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["enclawed policy show", "Show the resolved policy."],
          ["enclawed policy show --json", "Machine-readable policy."],
          [
            "enclawed policy show --config ./alt-enclawed.json",
            "Inspect a candidate config without applying it.",
          ],
        ])}`,
    )
    .action(async (opts: { config?: string; json?: boolean }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const flavor = getFlavor(process.env);
        const fallback = flavor === "enclaved" ? defaultEnclavedPolicy() : defaultOpenPolicy();
        const configPath =
          opts.config ?? resolveDefaultConfigPath({ env: process.env }).path;

        let configDoc: unknown;
        let source = "flavor-default";
        let configRead = false;
        try {
          const raw = await readFile(configPath, "utf8");
          configRead = true;
          try {
            configDoc = JSON.parse(raw);
            source = configPath;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (opts.json) {
              defaultRuntime.writeJson({ ok: false, configPath, error: `invalid JSON: ${message}` });
            } else {
              defaultRuntime.error(
                `enclawed policy show: ${configPath} is not valid JSON (${message})`,
              );
            }
            defaultRuntime.exit(1);
            return;
          }
        } catch (err) {
          // File-not-found is fine — operator may not have a config yet.
          // Any other read error (EACCES etc.) is fatal in strict mode.
          const code = (err as NodeJS.ErrnoException).code;
          if (code !== "ENOENT") {
            const message = err instanceof Error ? err.message : String(err);
            if (opts.json) {
              defaultRuntime.writeJson({ ok: false, configPath, error: message });
            } else {
              defaultRuntime.error(`enclawed policy show: ${configPath}: ${message}`);
            }
            defaultRuntime.exit(1);
            return;
          }
        }

        let resolved;
        try {
          resolved = loadPolicyFromJson(configDoc, {
            maxOutputClearance: fallback.maxOutputClearance,
            defaultDataLabel: fallback.defaultDataLabel,
            enforceAllowlists: fallback.enforceAllowlists,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (opts.json) {
            defaultRuntime.writeJson({ ok: false, configPath, error: message });
          } else {
            defaultRuntime.error(`enclawed policy show: ${message}`);
          }
          defaultRuntime.exit(1);
          return;
        }

        const view = {
          source: configRead ? source : "flavor-default (no enclawed.json)",
          flavor,
          enforceAllowlists: resolved.enforceAllowlists,
          allowedHosts: [...resolved.allowedHosts].sort(),
          allowedChannels: [...resolved.allowedChannels].sort(),
          allowedProviders: [...resolved.allowedProviders].sort(),
          allowedTools: [...resolved.allowedTools].sort(),
          maxOutputClearance: formatLabel(resolved.maxOutputClearance),
          defaultDataLabel: formatLabel(resolved.defaultDataLabel),
        };

        if (opts.json) {
          defaultRuntime.writeJson(view);
          return;
        }

        defaultRuntime.log(`policy:`);
        defaultRuntime.log(`  source:             ${view.source}`);
        defaultRuntime.log(`  flavor:             ${view.flavor}`);
        defaultRuntime.log(`  enforceAllowlists:  ${view.enforceAllowlists}`);
        defaultRuntime.log(`  allowedHosts:       ${formatList(view.allowedHosts)}`);
        defaultRuntime.log(`  allowedChannels:    ${formatList(view.allowedChannels)}`);
        defaultRuntime.log(`  allowedProviders:   ${formatList(view.allowedProviders)}`);
        defaultRuntime.log(`  allowedTools:       ${formatList(view.allowedTools)}`);
        defaultRuntime.log(`  maxOutputClearance: ${view.maxOutputClearance}`);
        defaultRuntime.log(`  defaultDataLabel:   ${view.defaultDataLabel}`);
        // Sanity: silence unused warning for the default-policy reference.
        void makeLabel({ level: LEVEL.UNCLASSIFIED });
      });
    });
}

function formatList(items: ReadonlyArray<string>): string {
  if (items.length === 0) return "(empty)";
  return items.map((s) => `"${s}"`).join(", ");
}
