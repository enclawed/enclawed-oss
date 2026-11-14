// The exec tool runs what a model asks for. Unless the operator set
// `enclawed.policy.commandNetwork` to "host", that command runs in a network
// cage: it cannot reach the network, and each attempt is audited and shown
// to the user (see src/enclawed/netcage).

import { createNetCageReporter, type NetCageAlert } from "../enclawed/netcage/alert.js";
import {
  type NetCageSupport,
  netCageSupport,
  openNetCage,
  shellQuote,
} from "../enclawed/netcage/cage.js";
import { getRuntime } from "../enclawed/runtime.js";
import { logWarn } from "../logger.js";

export type ExecNetCage = {
  wrapArgv(argv: string[], cwd?: string): { argv: string[]; env: Record<string, string> };
  wrapPtyCommand(
    shell: string,
    shellArgs: string[],
    command: string,
  ): {
    ptyCommand: string;
    env: Record<string, string>;
  };
  /**
   * Wait for the last reports and close the cage's host side. Returns one
   * line per destination tried more than once, with its count.
   */
  finish(): Promise<string[]>;
};

export class ExecNetworkRefusedError extends Error {
  override name = "ExecNetworkRefusedError";
}

export async function prepareExecNetCage(
  params: {
    command: string;
    onAlert: (alert: NetCageAlert) => void;
  },
  deps: { support: () => NetCageSupport } = { support: netCageSupport },
): Promise<ExecNetCage | null> {
  const runtime = getRuntime();
  // commandNetwork "host" is the operator's explicit, audited opt-out; nothing
  // else turns the cage off. With no runtime (pre-bootstrap, tests) there is
  // no policy to honor, so there is nothing to cage.
  if (!runtime) {
    return null;
  }
  if (runtime.policy.commandNetwork === "host") {
    return null;
  }
  const support = deps.support();
  if (!support.ok) {
    // Secure by default, in every flavor: if the command cannot be caged, it
    // is NOT run uncaged. A host that cannot build the cage must opt in to
    // host networking explicitly; it never happens by silent fallback — that
    // is exactly how a model's command would reach the network unnoticed.
    runtime.audit
      .append({
        type: "egress.cage.refused",
        actor: "exec",
        level: null,
        payload: { reason: support.reason },
      })
      .catch(() => {});
    throw new ExecNetworkRefusedError(
      `exec refused: ${support.reason}, so this command cannot be stopped from reaching ` +
        `the network. Run on a host with unprivileged user namespaces, or set ` +
        `enclawed.policy.commandNetwork to "host" to run commands on the host network.`,
    );
  }
  const reporter = createNetCageReporter({
    source: "exec",
    label: params.command.length > 200 ? `${params.command.slice(0, 200)}…` : params.command,
    notify: (alert) => {
      logWarn(alert.message);
      params.onAlert(alert);
    },
  });
  const cage = await openNetCage({ onEvent: reporter.onEvent });
  return {
    wrapArgv(argv, cwd) {
      return cage.wrap(argv[0], argv.slice(1), cwd);
    },
    wrapPtyCommand(shell, shellArgs, command) {
      const { argv, env } = cage.wrap(shell, [...shellArgs, command]);
      return { ptyCommand: argv.map(shellQuote).join(" "), env };
    },
    async finish() {
      await cage.close();
      const lines = reporter.summary().filter((l) => !l.startsWith("1 × "));
      if (lines.length > 0) {
        logWarn(`exec: blocked repeated network attempts: ${lines.join("; ")}`);
      }
      return lines;
    },
  };
}
