// `enclawed trust` — runtime introspection AND mutation of the module-signing
// trust root.
//
// `trust list` prints the live trust root (default + persisted overlay).
//
// `trust add` writes a signer into `<state-dir>/trust-root.json`. In the
// **open** flavor this file is also applied to the running process so the
// new signer is immediately visible; in the **enclaved** flavor the file is
// written for the next process start, but the live process keeps the
// locked-at-boot root (the operator must restart in a controlled manner
// for the new signer to take effect — that is by design).

import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { addPersistedSigner } from "../../enclawed/trust-root-store.js";
import {
  getTrustRoot,
  isTrustRootLocked,
} from "../../enclawed/trust-root.js";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { formatHelpExamples } from "../help-format.js";

export function registerTrustCommand(program: Command) {
  const trust = program
    .command("trust")
    .description("Inspect and manage the module-signing trust root")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/trust", "docs.enclawed.ai/cli/trust")}\n`,
    );

  trust
    .command("list")
    .description("List the publisher keys currently in the trust root")
    .option("--json", "Output JSON", false)
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["enclawed trust list", "Show signers approved to attest modules."],
          ["enclawed trust list --json", "Machine-readable signer list."],
        ])}`,
    )
    .action((opts: { json?: boolean }) => {
      void runCommandWithRuntime(defaultRuntime, async () => {
        const signers = getTrustRoot();
        const locked = isTrustRootLocked();
        if (opts.json) {
          defaultRuntime.writeJson({
            locked,
            signers: signers.map((s) => ({
              keyId: s.keyId,
              approvedClearance: [...s.approvedClearance],
              description: s.description,
              notAfter: s.notAfter ?? null,
            })),
          });
          return;
        }
        defaultRuntime.log(`trust root: ${signers.length} signer(s), locked=${locked}`);
        for (const s of signers) {
          defaultRuntime.log("");
          defaultRuntime.log(`  keyId:       ${s.keyId}`);
          defaultRuntime.log(`  clearance:   ${[...s.approvedClearance].join(", ")}`);
          if (s.notAfter) defaultRuntime.log(`  notAfter:    ${s.notAfter}`);
          defaultRuntime.log(`  description: ${s.description}`);
        }
      });
    });

  trust
    .command("add")
    .description(
      "Persist a signer into the trust-root overlay (open flavor: also applies live; enclaved flavor: takes effect on next process start)",
    )
    .requiredOption("--signer <keyId>", "Stable identifier for the signer (e.g. ops-2026)")
    .option("--ed25519 <pemPath>", "Path to an Ed25519 SPKI PEM file (public key half)")
    .option("--pem <pemPath>", "Alias for --ed25519")
    .option("--pem-inline <pem>", "Inline PEM block (for shells that prefer args over files)")
    .option(
      "--clearance <levels>",
      "Comma-separated approved clearance tiers (e.g. public,internal). Default: public,internal.",
    )
    .option("--description <text>", "Human-readable description")
    .option("--not-after <iso>", "ISO date after which the signer is no longer valid")
    .option("--json", "Output JSON")
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          [
            "enclawed trust add --signer ops-2026 --ed25519 ./ops.pub.pem --clearance public,internal",
            "Persist a new signer.",
          ],
          [
            "enclawed trust add --signer mcp-workspace --ed25519 /etc/keys/workspace.pem --clearance internal --description 'Workspace MCP bridge'",
            "With description.",
          ],
        ])}`,
    )
    .action(async (opts: {
      signer: string;
      ed25519?: string;
      pem?: string;
      pemInline?: string;
      clearance?: string;
      description?: string;
      notAfter?: string;
      json?: boolean;
    }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const pemPath = opts.ed25519 ?? opts.pem;
        let publicKeyPem: string | undefined;
        if (opts.pemInline) {
          publicKeyPem = opts.pemInline;
        } else if (pemPath) {
          try {
            publicKeyPem = await readFile(pemPath, "utf8");
          } catch (err) {
            defaultRuntime.error(
              `enclawed trust add: cannot read PEM file ${pemPath}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
            defaultRuntime.exit(1);
            return;
          }
        } else {
          defaultRuntime.error(
            "enclawed trust add: one of --ed25519 <pemPath>, --pem <pemPath>, or --pem-inline <pem> is required",
          );
          defaultRuntime.exit(1);
          return;
        }

        const clearance = (opts.clearance ?? "public,internal")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        try {
          const result = await addPersistedSigner({
            keyId: opts.signer,
            publicKeyPem,
            approvedClearance: clearance,
            description: opts.description ?? `Signer added via 'enclawed trust add' (${opts.signer}).`,
            ...(opts.notAfter ? { notAfter: opts.notAfter } : {}),
          });
          const locked = isTrustRootLocked();
          if (opts.json) {
            defaultRuntime.writeJson({
              ok: true,
              path: result.path,
              replaced: result.replaced,
              appliedLive: !locked,
            });
            return;
          }
          defaultRuntime.log(
            `trust add: ${result.replaced ? "updated" : "added"} signer "${opts.signer}"`,
          );
          defaultRuntime.log(`  path:        ${result.path}`);
          defaultRuntime.log(`  appliedLive: ${!locked}`);
          if (locked) {
            defaultRuntime.log(
              "  (trust root is locked in this process; the new signer takes effect on next process start)",
            );
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (opts.json) {
            defaultRuntime.writeJson({ ok: false, error: message });
          } else {
            defaultRuntime.error(`enclawed trust add: ${message}`);
          }
          defaultRuntime.exit(1);
        }
      });
    });
}
