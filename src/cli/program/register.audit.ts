// `enclawed audit` — operator-facing audit-log inspection commands.
//
// Today the only subcommand is `audit verify <path>`, which runs the
// hash-chain verifier from src/enclawed/audit-log.ts against an
// append-only JSONL log. Exits 0 on `chain ok`, 1 on tamper detection.
//
// We intentionally do NOT take an audit path from the JSON config: the
// audit log is selected at boot time by `ENCLAWED_AUDIT_PATH` or the
// flavor default (`~/.enclawed/audit.jsonl` in open mode, `/var/log/
// enclawed/audit.jsonl` in enclaved mode). The CLI mirrors that
// resolution if the operator omits the explicit path.

import { homedir } from "node:os";
import { resolve as resolvePath } from "node:path";
import type { Command } from "commander";
import { verifyChain } from "../../enclawed/audit-log.js";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { formatHelpExamples } from "../help-format.js";

function defaultAuditPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.ENCLAWED_AUDIT_PATH ?? env.ENCLAWED_AUDIT_PATH;
  if (typeof explicit === "string" && explicit.length > 0) {
    return explicit;
  }
  return resolvePath(homedir(), ".enclawed", "audit.jsonl");
}

export function registerAuditCommand(program: Command) {
  const audit = program
    .command("audit")
    .description("Inspect the hash-chained framework audit log")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/audit", "docs.enclawed.ai/cli/audit")}\n`,
    );

  audit
    .command("verify [path]")
    .description("Verify a hash-chained audit JSONL file end-to-end")
    .option("--json", "Output JSON", false)
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["enclawed audit verify", "Verify the default audit log (~/.enclawed/audit.jsonl)."],
          ["enclawed audit verify /var/log/enclawed/audit.jsonl", "Verify a specific log file."],
          ["enclawed audit verify --json", "Machine-readable verification output."],
        ])}`,
    )
    .action(async (pathArg: string | undefined, opts: { json?: boolean }) => {
      const path = pathArg && pathArg.length > 0 ? pathArg : defaultAuditPath();
      await runCommandWithRuntime(defaultRuntime, async () => {
        let result;
        try {
          result = await verifyChain(path);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (opts.json) {
            defaultRuntime.writeJson({ ok: false, path, error: message });
          } else {
            defaultRuntime.error(`enclawed audit verify: ${path}: ${message}`);
          }
          defaultRuntime.exit(1);
          return;
        }
        if (opts.json) {
          defaultRuntime.writeJson({ path, ...result });
          if (!result.ok) defaultRuntime.exit(1);
          return;
        }
        if (result.ok) {
          defaultRuntime.log(`verified ${result.count} entries`);
          defaultRuntime.log(`path:  ${path}`);
          defaultRuntime.log("chain ok");
          return;
        }
        defaultRuntime.error(
          `chain broken at entry ${result.brokenAt} (${result.reason}); ${result.count} entries verified before failure`,
        );
        defaultRuntime.error(`path: ${path}`);
        defaultRuntime.exit(1);
      });
    });
}
