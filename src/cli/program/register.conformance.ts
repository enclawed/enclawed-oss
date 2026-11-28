// `enclawed conformance` — verify, on this installation, the security
// guarantees Enclawed makes. Every check runs in this process against the
// installed code, with throwaway directories and a local test server; it does
// not read or change your configuration, does not use the network and never
// opens a hardware device. Exit code 0 only when every guarantee holds.

import type { Command } from "commander";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { formatHelpExamples } from "../help-format.js";

export function registerConformanceCommand(program: Command) {
  program
    .command("conformance")
    .description("Verify Enclawed's security guarantees on this installation")
    .option("--json", "Output JSON instead of text", false)
    .option("--only <ids>", "Run only these checks (comma-separated ids)")
    .option(
      "--adapter <module>",
      "Also run the invariants through an agent-CLI adapter's own event mapping (a module exporting enclawedConformanceAdapter)",
    )
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["enclawed conformance", "Run every check; one line per guarantee."],
          ["enclawed conformance --json", "Machine-readable results."],
          [
            "enclawed conformance --adapter ./node_modules/enclawed-code/src/conformance.mjs",
            "Also run the invariants through an adapter.",
          ],
        ])}\n\n${theme.muted("Docs:")} ${formatDocsLink("/cli/conformance", "docs/cli/conformance.md")}\n`,
    )
    .action(async (opts: { json?: boolean; only?: string; adapter?: string }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { renderConformanceReport, runConformanceChecks } =
          await import("../../enclawed/conformance/index.js");
        const only = opts.only
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const extraChecks = opts.adapter
          ? await import("../../enclawed/conformance/checks-adapter.js").then(async (m) =>
              m.adapterChecks(await m.loadConformanceAdapter(opts.adapter as string)),
            )
          : [];
        const report = await runConformanceChecks({
          ...(only?.length ? { only } : {}),
          extraChecks,
        });
        if (opts.json) {
          defaultRuntime.writeJson(report);
        } else {
          defaultRuntime.log(renderConformanceReport(report));
        }
        if (!report.ok) {
          defaultRuntime.exit(1);
        }
      });
    });
}
